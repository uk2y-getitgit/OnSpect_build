/**
 * 실사용테스트(2026-09-10, `_workspace/QUESTIONS.md` Q93) — 용역 사진 일괄 다운로드.
 *
 * 태블릿 PWA 는 `<input capture>` 로 찍은 사진을 기기 갤러리에 코드로 저장할 수 없다
 * (브라우저 샌드박스 — 웹 API 에 그런 길이 없다). 대신 용역의 사진 전부를 체계적인
 * 파일명으로 **ZIP 한 파일**에 담아 내려받게 하고(2026-09-10 3차 확정 — 개별 순차
 * 다운로드는 폐기, 아래 참고), 그 뒤는 사용자가 쓰는 외부 "폴더 감시 자동 리네임" 앱이
 * 압축을 푼 사진들을 이어받는다.
 *
 * **파일명 = `{동이름-}{층 접두어}{층 안 결함번호 2자리}{_사진순번(그 결함에 2장 이상일 때만,
 * 2번째부터)}.jpg`** — 예: 지상1층 1번 `101` · 지상2층 1번 `201` · 지상5층 1번 `501` ·
 * 지하1층 1번 `B101` · 지하2층 1번 `B201` · 외부 1번 `W01`. 같은 결함에 사진이 2장이면
 * `101`·`101_2`.
 * · **결함번호는 `assignNumbers(mode: 'PER_FLOOR')`** — `store.ts` 가 캔버스 번호풍선에 쓰는
 *   것과 **같은 함수·같은 모드**다. 그래서 이 파일명의 번호가 도면 위 번호풍선·결함정보 패널에
 *   보이는 번호와 **항상 일치**한다 — 별도 카운터를 만들지 않는다.
 * · **층 접두어는 `Floor.code`에서 숫자 뒤에 붙은 `F`만 뗀다**(`1F`→`1`·`B1F`→`B1`).
 *   `Floor.code` 자체를 바꾸지 않는다 — D19/D20 이 "층 접두어는 사용자 직접 입력 옵트인,
 *   자동 파생 금지"로 못박아 둔 값이라 여기서도 그대로 읽되, **이 다운로드 파일명에서만**
 *   층 표기 접미사 `F`를 뺀다(2026-09-10 요청). 숫자가 바로 앞에 없는 `F`(예: 옥상 `RF`)는
 *   손대지 않는다 — `RF` 는 "층 번호+F"가 아니라 그 자체가 옥상 코드다. `code` 가 비어 있으면
 *   (옵트인 안 한 층) 층 이름으로 대신한다.
 * · 동 이름은 동이 1개뿐이면 생략한다 — `locationMapFloors()` 의 기존 관례(D45 B-3) 그대로.
 * · 결함 상태(REPAIRED·전회차 등)로 거르지 않는다 — 보고서용 산출물이 아니라 원본 백업/정리
 *   목적이라 "이유가 있어 빠지는 사진"이 있으면 안 된다.
 * · 원본(`sourceBlobKey`) 대신 렌더본(`renderBlobKey`, 장변 2048 JPEG)을 내려받는다 — 용량을
 *   줄이면서도 다른 산출물과 동일한 화질이다(V7 과 같은 선택).
 * · **ZIP 압축은 `fflate`**(이미 `data/projectTransfer.ts::exportProjectToZip` 이 쓰는 라이브러리,
 *   새 의존성 추가 없음) — 사진 150~400장을 개별 다운로드하면 브라우저의 "여러 파일 자동
 *   다운로드 차단" 프롬프트·긴 대기시간·Downloads 폴더에 평평하게 쌓이는 문제가 있었다.
 *   ZIP 하나면 다운로드 1회, 폴더 구조 없이 압축을 풀면 감시 앱이 그대로 집어간다.
 */
import { assignNumbers, groupPhotosByDefect, type NumberingParams } from '@onspect/project-core';
import { zipSync } from 'fflate';
import type { ProjectBundle } from './idb/repo';
import { exportFloors, locationMapFloors } from '../export/exportModel';
import { downloadBlob, sanitizeFileName, stampFor } from '../export/download';

/** 숫자 바로 뒤에 붙은 층 표기 접미사 `F`만 뗀다 — `RF`처럼 숫자가 없으면 그대로 둔다 */
function stripFloorSuffixF(code: string): string {
  return code.replace(/(\d)F/gi, '$1');
}

export type PhotoDownloadItem = { fileName: string; blob: Blob };

export type PhotoDownloadPlan = {
  items: PhotoDownloadItem[];
  /** 렌더본 Blob 을 못 찾아 건너뛴 사진 — 파일이 지워졌거나 아직 이 기기에 없는 경우 */
  missing: { photoId: string; fileName: string }[];
  /** 내려받을 사진이 하나도 없을 때(빈 용역) */
  total: number;
};

/**
 * 용역의 사진 전부를 내려받을 (blob, 파일명) 목록을 만든다. **다운로드까지는 하지 않는다** —
 * 순수 조회 + blob 읽기만 하는 함수라 미리보기·개수 확인에도 그대로 쓸 수 있다.
 */
export async function buildProjectPhotoDownloads(
  repo: { readBlob(key: string): Promise<Blob | null> },
  bundle: ProjectBundle,
): Promise<PhotoDownloadPlan> {
  const floors = exportFloors(bundle);
  const floorInfo = new Map(locationMapFloors(bundle).map((f) => [f.id, f]));
  const rawFloorById = new Map(bundle.floors.map((f) => [f.id, f]));
  const photosByDefect = groupPhotosByDefect(bundle.photos);

  // PER_FLOOR — `store.ts` 의 캔버스 번호풍선 계산과 같은 모드. 층이 바뀌면 결함번호가 1부터
  // 다시 시작한다(결함번호는 도면 번호풍선과 일치, 사진번호는 뒤에서 결함 안에서만 따로 붙는다).
  const params: NumberingParams = {
    floorIds: floors.map((f) => f.id),
    mode: 'PER_FLOOR',
    surveyKinds: null,
    // 백업 목적 — 상태·조사구분으로 빠지는 사진이 없게 전부 켠다 (위 파일 설명 참고)
    includeRepaired: true,
    includePrevPending: true,
    includeIncomplete: true,
  };
  const result = assignNumbers(bundle.defects, params);

  const items: PhotoDownloadItem[] = [];
  const missing: PhotoDownloadPlan['missing'] = [];
  let total = 0;

  for (const floor of floors) {
    const info = floorInfo.get(floor.id);
    const rawCode = rawFloorById.get(floor.id)?.code?.trim();
    const floorLabel = rawCode ? stripFloorSuffixF(rawCode) : floor.name;
    const prefix = sanitizeFileName(
      [info?.buildingName ?? null, floorLabel]
        .filter((p): p is string => p !== null && p !== '')
        .join('-'),
    );

    const usedNames = new Set<string>();

    for (const row of result.rows) {
      if (row.floorId !== floor.id) continue;
      const photos = photosByDefect.get(row.defectId);
      if (!photos || photos.length === 0) continue;

      const base = `${prefix}${String(row.no).padStart(2, '0')}`;

      for (let i = 0; i < photos.length; i += 1) {
        const photo = photos[i]!;
        total += 1;
        const stem = i === 0 ? base : `${base}_${i + 1}`;
        let fileName = `${stem}.jpg`;
        let dedupe = 2;
        while (usedNames.has(fileName)) {
          fileName = `${stem}(${dedupe}).jpg`;
          dedupe += 1;
        }
        usedNames.add(fileName);

        const blob = await repo.readBlob(photo.renderBlobKey);
        if (!blob) {
          missing.push({ photoId: photo.id, fileName });
          continue;
        }
        items.push({ blob, fileName });
      }
    }
  }
  return { items, missing, total };
}

/**
 * 실제 다운로드 트리거 — 사진 전부를 ZIP 한 파일로 묶어 한 번에 내려받는다.
 * (예전엔 `downloadSequential` 로 파일마다 따로 받았다 — 150~400장이면 브라우저가
 * "여러 파일 자동 다운로드"를 막고, 받는 데도 오래 걸리고, Downloads 폴더에 평평하게
 * 쌓였다. ZIP 하나면 그 세 가지가 전부 없어진다.)
 */
export async function downloadAllProjectPhotos(
  plan: PhotoDownloadPlan,
  projectName: string,
): Promise<void> {
  if (plan.items.length === 0) return;
  const files: Record<string, Uint8Array> = {};
  for (const item of plan.items) {
    files[item.fileName] = new Uint8Array(await item.blob.arrayBuffer());
  }
  const zipped = zipSync(files, { level: 6 });
  const fileName = `${sanitizeFileName(projectName)}_사진_${stampFor()}.zip`;
  downloadBlob(new Blob([zipped], { type: 'application/zip' }), fileName);
}
