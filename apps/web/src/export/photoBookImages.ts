/**
 * 사진첩 셀 이미지 어댑터 — PhotoPolish 스펙 §2-2 · §2-8 (R-8).
 *
 * ⭐ **화면과 출력이 같은 합성 함수를 쓴다.** 인쇄 뷰가 CSS `rotate` 만 걸던 시절에는
 *    자르기·주석이 **보고서에 전혀 반영되지 않았다**(검수 지적 🔴). 여기서 `composePhoto`
 *    (미리보기가 쓰는 바로 그 함수)를 불러 굽는다 — 두 벌로 그리지 않는다.
 *
 * ⭐ **objectURL 생성·해제는 호출자 책임**이다. `locationMap.ts` 의
 *    `renderLocationMaps` / `releaseLocationMaps` 와 **같은 패턴**을 따른다.
 *    `repo.objectUrl()` 이 준 URL 은 **저장소 캐시 소유라 해제하지 않는다** —
 *    우리가 `URL.createObjectURL` 한 것만 `created` 에 모아 돌려준다.
 *
 * ⚠️ 실패해도 **예외를 던지지 않는다.** 원본 URL 로 폴백한다 —
 *    주석 한 장 때문에 사진첩 인쇄가 통째로 죽으면 안 된다.
 */
import { type PhotoBookCell, type PhotoBookPage } from '@onspect/project-core';
import { composePhotoFromUrl, composeSignature, needsCompose } from '../data/photoCompose';

export type PhotoBookImage = {
  /** `<img src>` 에 걸 URL */
  url: string;
  /**
   * `true` = 자르기·주석·**회전까지 이미 구워져 있다** → 인쇄 뷰가 CSS `rotate` 를 걸면 안 된다.
   * `false` = 원본 래스터 → 지금까지처럼 CSS 로 회전한다.
   */
  baked: boolean;
  /** 합성 결과 픽셀. `baked === false` 면 `null` */
  width: number | null;
  height: number | null;
};

export type PhotoBookImages = {
  /** **`cell.key`(= `defectId:photoId`) → 이미지.** `defectId` 로 잡으면 대표 외 사진에서 겹친다 */
  byCell: Record<string, PhotoBookImage>;
  /** 우리가 만든 objectURL — `releasePhotoBookImages()` 로 해제한다 */
  created: string[];
};

export type PhotoBookImagesInput = {
  pages: readonly PhotoBookPage[];
  /** `repo.objectUrl(key, projectId)` 를 그대로 넘긴다 */
  objectUrl: (blobKey: string) => Promise<string | null>;
};

export async function renderPhotoBookImages(
  input: PhotoBookImagesInput,
): Promise<PhotoBookImages> {
  const cells: PhotoBookCell[] = [];
  for (const p of input.pages) for (const c of p.cells) cells.push(c);

  // ⚠️ 사진첩이 **실제로 그릴 칸**의 Blob 키만 로드한다. `photos` 를 다시 훑어 `isPrimary` 를
  //    필터하면 `primaryOf()` 의 선출 결과와 갈려 그 칸만 조용히 빈 채로 인쇄된다.
  const baseUrls = new Map<string, string>();
  for (const key of new Set(cells.map((c) => c.renderBlobKey))) {
    const u = await input.objectUrl(key);
    if (u) baseUrls.set(key, u);
  }

  const byCell: Record<string, PhotoBookImage> = {};
  const created: string[] = [];
  /** 같은 사진이 여러 칸에 오면 한 번만 굽는다 */
  const composed = new Map<string, PhotoBookImage>();

  // ⚠️ 루프 전체를 감싼다. 중간에 예외가 나면 **그때까지 만든 objectURL 이 통째로 유실**되어
  //    호출자가 해제할 방법이 없어진다(부분 결과도 버려진다). 항상 `{ byCell, created }` 를
  //    돌려주면 남은 칸은 "불러오지 못했습니다" 로 그려지고 누수는 0 이다.
  try {
    for (const c of cells) {
      const base = baseUrls.get(c.renderBlobKey);
      if (!base) continue; // Blob 이 사라졌다 — 인쇄 뷰가 "불러오지 못했습니다" 를 그린다
      const fallback: PhotoBookImage = { url: base, baked: false, width: null, height: null };

      if (!needsCompose(c)) {
        // 빠른 경로 — 자르기·주석이 없으면 굽지 않는다. 회전은 CSS 가 한다
        byCell[c.key] = fallback;
        continue;
      }

      const sig = composeSignature(c);
      const hit = composed.get(sig);
      if (hit) {
        byCell[c.key] = hit;
        continue;
      }

      const r = await composePhotoFromUrl(base, c);
      if (!r) {
        byCell[c.key] = fallback; // 폴백 — 원본이 인쇄된다
        continue;
      }
      const url = URL.createObjectURL(r.blob);
      created.push(url);
      const made: PhotoBookImage = { url, baked: true, width: r.width, height: r.height };
      composed.set(sig, made);
      byCell[c.key] = made;
    }
  } catch {
    // 부분 결과를 그대로 반환한다 (위 주석)
  }

  return { byCell, created };
}

/** 인쇄가 끝나면 우리가 만든 objectURL 을 해제한다. 안 하면 사진 한 장당 수 MB 가 샌다 */
export function releasePhotoBookImages(r: PhotoBookImages | null): void {
  if (!r) return;
  for (const u of r.created) URL.revokeObjectURL(u);
}
