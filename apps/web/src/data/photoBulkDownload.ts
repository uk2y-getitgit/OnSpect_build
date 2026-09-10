/**
 * 실사용테스트(2026-09-10, `_workspace/QUESTIONS.md` Q93) — 용역 사진 일괄 다운로드.
 *
 * 태블릿 PWA 는 `<input capture>` 로 찍은 사진을 기기 갤러리에 코드로 저장할 수 없다
 * (브라우저 샌드박스 — 웹 API 에 그런 길이 없다). 대신 용역의 사진 전부를 체계적인
 * 파일명으로 시스템 Downloads 폴더에 내려받게 하고, 그 뒤는 사용자가 쓰는 외부
 * "폴더 감시 자동 리네임" 앱이 이어받는다.
 *
 * 파일명 = `{동이름-}{층이름}-{결함번호 2자리}{-사진순번(그 결함에 2장 이상일 때만)}.jpg`
 * · 결함번호는 기존 출력물(`assignNumbers`)과 같은 체계 — "사진번호" 개념을 새로 만들지 않는다
 *   (`photoNo` 는 대표사진 있는 결함만 세는 별도 카운터이고 2026-09-04 양식개정으로 이미
 *   사진첩 캡션에서도 결함번호로 대체됐다 — 폐기 수순이라 쓰지 않는다).
 * · 동 이름은 동이 1개뿐이면 생략한다 — `locationMapFloors()` 의 기존 관례(D45 B-3) 그대로.
 * · REPAIRED·전회차 등 출력 스코프 필터는 걸지 않는다(`defaultNumberingParams` 를 그대로
 *   쓰지 않고 전부 켠다) — 이건 보고서용 산출물이 아니라 원본 백업/정리 목적이라
 *   "이유가 있어 빠지는 사진"이 있으면 안 된다.
 * · 원본(`sourceBlobKey`) 대신 렌더본(`renderBlobKey`, 장변 2048 JPEG)을 내려받는다 —
 *   용량을 줄이면서도 다른 산출물과 동일한 화질이다(V7 과 같은 선택).
 */
import {
  assignNumbers,
  defaultNumberingParams,
  defectIdsWithPrimaryPhoto,
  groupPhotosByDefect,
} from '@onspect/project-core';
import { isIncomplete } from '@onspect/canvas-core';
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

/**
 * 용역의 사진 전부를 내려받을 (blob, 파일명) 목록을 만든다. **다운로드까지는 하지 않는다** —
 * 순수 조회 + blob 읽기만 하는 함수라 미리보기·개수 확인에도 그대로 쓸 수 있다.
 */
export async function buildProjectPhotoDownloads(
  repo: { readBlob(key: string): Promise<Blob | null> },
  bundle: ProjectBundle,
): Promise<PhotoDownloadPlan> {
  const floorIds = exportFloors(bundle).map((f) => f.id);
  const params = {
    ...defaultNumberingParams(floorIds),
    // 백업 목적 — 상태·조사구분으로 빠지는 사진이 없게 전부 켠다 (위 파일 설명 참고)
    includeRepaired: true,
  };
  const hasPhoto = defectIdsWithPrimaryPhoto(bundle.photos);
  const incomplete = new Set(bundle.defects.filter(isIncomplete).map((d) => d.id));
  const result = assignNumbers(bundle.defects, params, { hasPhoto, incomplete });

  const floorInfo = new Map(locationMapFloors(bundle).map((f) => [f.id, f]));
  const photosByDefect = groupPhotosByDefect(bundle.photos);
  const defectById = new Map(bundle.defects.map((d) => [d.id, d]));

  const items: DownloadItem[] = [];
  const missing: PhotoDownloadPlan['missing'] = [];
  const usedNames = new Set<string>();
  let total = 0;

  for (const [defectId, assigned] of Object.entries(result.byDefect)) {
    const defect = defectById.get(defectId);
    const photos = photosByDefect.get(defectId);
    if (!defect || !photos || photos.length === 0) continue;

    const floor = floorInfo.get(defect.floorId);
    const base = sanitizeFileName(
      [floor?.buildingName ?? null, floor?.name ?? '', String(assigned.no).padStart(2, '0')]
        .filter((p): p is string => p !== null && p !== '')
        .join('-'),
    );

    for (let i = 0; i < photos.length; i += 1) {
      const photo = photos[i]!;
      total += 1;
      const stem = photos.length > 1 ? `${base}-${i + 1}` : base;
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
  return { items, missing, total };
}

/** 실제 다운로드 트리거 — 기존 `downloadSequential`(브라우저 다중 다운로드 차단 회피) 재사용 */
export async function downloadAllProjectPhotos(plan: PhotoDownloadPlan): Promise<void> {
  await downloadSequential(plan.items);
}
