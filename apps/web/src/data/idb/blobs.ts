/**
 * Blob 스토어 — S1 스펙 §2-9-d (**D5 ④**).
 *
 * **새로고침 후 도면이 렌더되지 않으면 S1 은 실패한 것이다.**
 * 그래서 도면 1장당 원본 · 렌더 래스터 · 썸네일 3종을 전부 보관한다.
 *
 * 참조 계수: 구조 복사(§2-13)로 두 용역이 같은 Blob 을 가리킬 수 있다.
 * `refCount === 0` 일 때만 실제로 지운다. 아니면 원본 용역을 지우는 순간
 * 복사본의 도면이 빈 화면이 된다.
 */
import { newId, reqAsPromise, STORE } from './db.js';

export type BlobRecord = {
  key: string;
  blob: Blob;
  refCount: number;
  byteSize: number;
};

export function newBlobKey(): string {
  return `b-${newId()}`;
}

/** 같은 트랜잭션 안에서 Blob 을 넣는다 — 도면 레코드와 **함께** 커밋되어야 한다 */
export async function putBlobIn(
  store: IDBObjectStore,
  key: string,
  blob: Blob,
  refDelta = 1,
): Promise<void> {
  const prev = await reqAsPromise<BlobRecord | undefined>(store.get(key));
  if (prev) {
    store.put({ ...prev, refCount: prev.refCount + refDelta });
    return;
  }
  store.put({ key, blob, refCount: Math.max(1, refDelta), byteSize: blob.size });
}

/** 참조 하나를 늘린다 (구조 복사) */
export async function retainBlobIn(store: IDBObjectStore, key: string): Promise<void> {
  const prev = await reqAsPromise<BlobRecord | undefined>(store.get(key));
  if (!prev) return;
  store.put({ ...prev, refCount: prev.refCount + 1 });
}

/** 참조 하나를 줄이고 0 이 되면 지운다 */
export async function releaseBlobIn(store: IDBObjectStore, key: string): Promise<void> {
  const prev = await reqAsPromise<BlobRecord | undefined>(store.get(key));
  if (!prev) return;
  const next = prev.refCount - 1;
  if (next <= 0) store.delete(key);
  else store.put({ ...prev, refCount: next });
}

export async function getBlobIn(store: IDBObjectStore, key: string): Promise<Blob | null> {
  const rec = await reqAsPromise<BlobRecord | undefined>(store.get(key));
  return rec?.blob ?? null;
}

export async function getBlob(db: IDBDatabase, key: string): Promise<Blob | null> {
  const tx = db.transaction(STORE.blobs, 'readonly');
  return getBlobIn(tx.objectStore(STORE.blobs), key);
}

/** 도면 용량 집계 — 목록 행의 `도면 9장 · 약 48MB` (§2-9-d) */
export async function sumBytes(db: IDBDatabase, keys: readonly string[]): Promise<number> {
  if (keys.length === 0) return 0;
  const tx = db.transaction(STORE.blobs, 'readonly');
  const store = tx.objectStore(STORE.blobs);
  const seen = new Set<string>();
  let total = 0;
  for (const k of keys) {
    if (seen.has(k)) continue; // 같은 키를 두 번 세지 않는다 (source === render 인 경우)
    seen.add(k);
    const rec = await reqAsPromise<BlobRecord | undefined>(store.get(k));
    if (rec) total += rec.byteSize;
  }
  return total;
}

// ── objectURL 캐시 (§2-8-c) ────────────────────────────────────────────────
//
// 캔버스는 `URL.createObjectURL(renderBlob)` 로 도면을 읽는다.
// **해제하지 않으면 층을 오갈 때마다 수 MB 씩 누수된다.**

type UrlEntry = { url: string; projectId: string };

const urlCache = new Map<string, UrlEntry>();

export async function objectUrlFor(
  db: IDBDatabase,
  blobKey: string,
  projectId: string,
): Promise<string | null> {
  const hit = urlCache.get(blobKey);
  if (hit) return hit.url;
  const blob = await getBlob(db, blobKey);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(blobKey, { url, projectId });
  return url;
}

/** 용역을 벗어날 때(P5 → P1/P3) 전부 해제한다 */
export function revokeProjectUrls(projectId: string): void {
  for (const [key, e] of urlCache) {
    if (e.projectId !== projectId) continue;
    URL.revokeObjectURL(e.url);
    urlCache.delete(key);
  }
}

export function revokeAllUrls(): void {
  for (const [, e] of urlCache) URL.revokeObjectURL(e.url);
  urlCache.clear();
}

/** 도면 교체·삭제 후 그 키의 URL 만 무효화한다 */
export function revokeUrl(blobKey: string): void {
  const e = urlCache.get(blobKey);
  if (!e) return;
  URL.revokeObjectURL(e.url);
  urlCache.delete(blobKey);
}

/** 진단용 — 누수 확인에 쓴다 (층을 30회 오간 뒤 늘지 않아야 한다) */
export function liveUrlCount(): number {
  return urlCache.size;
}
