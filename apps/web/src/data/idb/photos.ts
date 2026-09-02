/**
 * 사진 저장소 어댑터 — S5 스펙 §2-3 (**K4 · K13 · K16**).
 *
 * `photos` 스토어와 `by_project` / `by_defect` 인덱스는 **v1 에 이미 있다**(`db.ts` 153~155행).
 * 그래서 **DB_VERSION 을 올리지 않는다.** 마이그레이션이 0 이다.
 *
 * Blob 3종(원본 · 장변 2048 렌더 · 장변 320 썸네일)은 도면과 같은 규칙으로
 * **레코드와 한 트랜잭션에서** 커밋된다 — 레코드만 남고 Blob 이 없는 순간이 있으면 안 된다.
 *
 * ⚠️ **결함이 지워지면 사진도 지워진다.** 이 파일의 `purgePhotosOfDefectsIn` 이 그 지점이고,
 *    `repo.ts` 의 `deleteDefects` · `purgeFloorIn` 이 그것을 부른다(K13).
 *    안 부르면 고아 사진과 고아 Blob 이 **조용히** 쌓인다.
 *
 * ⭐ **`purgePhotoRecordsIn` 이 사진 하드 삭제의 유일한 지점이다** — 그래서 삭제 전파 기록
 *    (`recordDeletion`, Phase 5 T1-3 · D25)도 여기 한 곳에서만 부른다. 호출한 트랜잭션의
 *    스코프에 `STORE.meta` 가 포함돼 있어야 한다.
 */
import type { Photo } from '@onspect/project-core';
import { getAllByIndex, reqAsPromise, STORE } from './db.js';
import { putBlobIn, releaseBlobIn, revokeUrl } from './blobs.js';
import { recordDeletion } from './deletionLog.js';

/** 사진 1장 등록에 필요한 것 전부. `DrawingUpload` 과 같은 모양이다 */
export type PhotoUpload = {
  photo: Photo;
  /** 원본 파일. **버리지 않는다** — 사용자가 PC 에서 지우면 복구할 길이 없다(K4) */
  sourceBlob: Blob;
  /** 장변 2048 JPEG. 원본이 이미 작으면 같은 객체여도 된다 */
  renderBlob: Blob;
  /** 장변 320 JPEG */
  thumbBlob: Blob;
};

/** `sourceBlobKey === renderBlobKey` 일 수 있으므로 중복을 제거한다 */
export function uniquePhotoKeys(p: Photo): string[] {
  return [...new Set([p.renderBlobKey, p.sourceBlobKey, p.thumbBlobKey])];
}

/**
 * 사진 레코드 N건과 그 Blob 참조를 같은 트랜잭션에서 정리한다.
 * **사진 하드 삭제의 유일한 지점** — 삭제 전파 기록도 여기서만 남긴다(Phase 5 T1-3 · D25).
 */
export async function purgePhotoRecordsIn(
  tx: IDBTransaction,
  photos: readonly Photo[],
  deviceId: string,
): Promise<void> {
  if (photos.length === 0) return;
  const ps = tx.objectStore(STORE.photos);
  const blobs = tx.objectStore(STORE.blobs);
  for (const p of photos) {
    for (const k of uniquePhotoKeys(p)) {
      await releaseBlobIn(blobs, k);
      revokeUrl(k);
    }
    ps.delete(p.id);
    await recordDeletion(tx, 'PHOTO', p.id, p.projectId, deviceId);
  }
}

/** ⭐ 결함 연쇄 삭제 — `deleteDefects` · `purgeFloorIn` 이 반드시 부른다 (K13) */
export async function purgePhotosOfDefectsIn(
  tx: IDBTransaction,
  defectIds: readonly string[],
  deviceId: string,
): Promise<number> {
  if (defectIds.length === 0) return 0;
  if (!tx.objectStoreNames.contains(STORE.photos)) return 0;
  const ps = tx.objectStore(STORE.photos);
  let n = 0;
  for (const defectId of defectIds) {
    const photos = await getAllByIndex<Photo>(ps, 'by_defect', defectId);
    if (photos.length === 0) continue;
    await purgePhotoRecordsIn(tx, photos, deviceId);
    n += photos.length;
  }
  return n;
}

/** id 목록으로 지운다 (사진 1장 삭제 · 되돌리기 창이 닫힌 뒤의 실삭제) */
export async function purgePhotoIdsIn(
  tx: IDBTransaction,
  ids: readonly string[],
  deviceId: string,
): Promise<void> {
  if (ids.length === 0) return;
  const ps = tx.objectStore(STORE.photos);
  const found: Photo[] = [];
  for (const id of ids) {
    const p = await reqAsPromise<Photo | undefined>(ps.get(id));
    if (p) found.push(p);
  }
  await purgePhotoRecordsIn(tx, found, deviceId);
}

/** Blob 3종 + 레코드를 같은 트랜잭션에서 커밋한다 */
export async function putPhotoUploadIn(tx: IDBTransaction, up: PhotoUpload): Promise<void> {
  const ps = tx.objectStore(STORE.photos);
  const blobs = tx.objectStore(STORE.blobs);
  const p = up.photo;
  const byKey = new Map<string, Blob>();
  byKey.set(p.renderBlobKey, up.renderBlob);
  if (!byKey.has(p.sourceBlobKey)) byKey.set(p.sourceBlobKey, up.sourceBlob);
  if (!byKey.has(p.thumbBlobKey)) byKey.set(p.thumbBlobKey, up.thumbBlob);
  for (const [k, b] of byKey) await putBlobIn(blobs, k, b);
  ps.put(p);
}
