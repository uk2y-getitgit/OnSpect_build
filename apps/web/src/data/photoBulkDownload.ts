/**
 * 실사용테스트(2026-09-10, `_workspace/QUESTIONS.md` Q93) — 용역 사진 일괄 다운로드.
 *
 * 태블릿 PWA 는 `<input capture>` 로 찍은 사진을 기기 갤러리에 코드로 저장할 수 없다
 * (브라우저 샌드박스 — 웹 API 에 그런 길이 없다). 대신 용역의 사진 전부를 체계적인
 * 파일명으로 시스템 Downloads 폴더에 내려받게 하고, 그 뒤는 사용자가 쓰는 외부
 * "폴더 감시 자동 리네임" 앱이 이어받는다.
 *
 * **파일명 = `{동이름-}{층 접두어}{그 층 안에서의 사진순번 2자리}.jpg`**(2026-09-10 실사용 확정,
 * Q93 최초안의 `동-층-결함번호` 구조를 대체) — 예: 지상1층 1번째 사진 `101` · 지하1층 2번째 `B102`
 * · 옥상층 3번째 `RF03` · 외부 2번째 `W02`.
 * · **층 접두어는 `Floor.code`를 그대로 쓴다** — 이름에서 자동으로 만들어내지 않는다. D19/D20 이
 *   이미 "층 접두어는 사용자 직접 입력 옵트인, 자동 파생 금지"로 못박아 뒀다(`floorCodeOf` 의
 *   파생값은 입력칸 placeholder 제안일 뿐). `code` 가 비어 있으면(옵트인 안 한 층) 층 이름으로
 *   대신한다.
 * · **사진번호는 결함번호가 아니다** — 그 층에 있는 **모든 결함의 사진을 전부 한 줄로 펼쳐 놓고**
 *   매기는 순번이다(결함 정렬은 기존 출력물과 같은 규칙 — 입력순번→도면→id, 결함 안에서는
 *   대표사진 우선 순서). 결함 하나에 사진이 여러 장이어도 그냥 다음 번호로 이어진다.
 * · 동 이름은 동이 1개뿐이면 생략한다 — `locationMapFloors()` 의 기존 관례(D45 B-3) 그대로.
 * · 결함 상태(REPAIRED·전회차 등)로 거르지 않는다 — 보고서용 산출물이 아니라 원본 백업/정리
 *   목적이라 "이유가 있어 빠지는 사진"이 있으면 안 된다.
 * · 원본(`sourceBlobKey`) 대신 렌더본(`renderBlobKey`, 장변 2048 JPEG)을 내려받는다 — 용량을
 *   줄이면서도 다른 산출물과 동일한 화질이다(V7 과 같은 선택).
 */
import type { Defect } from '@onspect/canvas-core';
import { groupPhotosByDefect } from '@onspect/project-core';
import type { ProjectBundle } from './idb/repo';
import { exportFloors, locationMapFloors } from '../export/exportModel';
import { downloadSequential, sanitizeFileName, type DownloadItem } from '../export/download';

export type PhotoDownloadPlan = {
  items: DownloadItem[];
  /** 렌더본 Blob 을 못 찾아 건너뛴 사진 — 파일이 지워졌거나 아직 이 기기에 없는 경우 */
  missing: { photoId: string; fileName: string }[];
  /** 내려받을 사진이 하나도 없을 때(빈 용역) */
  total: number;
};

/** 결함 정렬 — `numbering.ts::compareForOutput` 과 같은 규칙(입력순번→도면→id). 결정론 유지 */
function compareDefectsForFloor(a: Defect, b: Defect): number {
  if (a.seq !== b.seq) return a.seq - b.seq;
  if (a.drawingId !== b.drawingId) return a.drawingId < b.drawingId ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * 용역의 사진 전부를 내려받을 (blob, 파일명) 목록을 만든다. **다운로드까지는 하지 않는다** —
 * 순수 조회 + blob 읽기만 하는 함수라 미리보기·개수 확인에도 그대로 쓸 수 있다.
 */
export async function buildProjectPhotoDownloads(
  repo: { readBlob(key: string): Promise<Blob | null> },
  bundle: ProjectBundle,
): Promise<PhotoDownloadPlan> {
  const floorInfo = new Map(locationMapFloors(bundle).map((f) => [f.id, f]));
  const rawFloorById = new Map(bundle.floors.map((f) => [f.id, f]));
  const photosByDefect = groupPhotosByDefect(bundle.photos);

  const defectsByFloor = new Map<string, Defect[]>();
  for (const d of bundle.defects) {
    const arr = defectsByFloor.get(d.floorId);
    if (arr) arr.push(d);
    else defectsByFloor.set(d.floorId, [d]);
  }

  const items: DownloadItem[] = [];
  const missing: PhotoDownloadPlan['missing'] = [];
  let total = 0;

  for (const floor of exportFloors(bundle)) {
    const defects = (defectsByFloor.get(floor.id) ?? []).slice().sort(compareDefectsForFloor);
    if (defects.length === 0) continue;

    const info = floorInfo.get(floor.id);
    const code = rawFloorById.get(floor.id)?.code;
    const prefix = sanitizeFileName(
      [info?.buildingName ?? null, code?.trim() || floor.name]
        .filter((p): p is string => p !== null && p !== '')
        .join('-'),
    );

    const usedNames = new Set<string>();
    let photoNo = 0;

    for (const defect of defects) {
      const photos = photosByDefect.get(defect.id);
      if (!photos || photos.length === 0) continue;

      for (const photo of photos) {
        photoNo += 1;
        total += 1;
        const stem = `${prefix}${String(photoNo).padStart(2, '0')}`;
        let fileName = `${stem}.jpg`;
        let dedupe = 2;
        while (usedNames.has(fileName)) {
          fileName = `${stem}_${dedupe}.jpg`;
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

/** 실제 다운로드 트리거 — 기존 `downloadSequential`(브라우저 다중 다운로드 차단 회피) 재사용 */
export async function downloadAllProjectPhotos(plan: PhotoDownloadPlan): Promise<void> {
  await downloadSequential(plan.items);
}
