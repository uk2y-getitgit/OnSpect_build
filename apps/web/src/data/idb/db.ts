/**
 * IndexedDB 열기 · 스토어 정의 · 마이그레이션 — S1 스펙 §2-9 (**D5 확정**).
 *
 * D5 원문 조건 4가지:
 *   ① 새로고침해도 용역·도면·결함이 유지된다
 *   ② Phase 5 로컬 DB 를 앞당기는 것이므로 **버리는 작업이 아니다** — 그대로 이어받을 스키마여야 한다
 *   ③ **S1 은 로컬 영속 저장까지만.** 동기화·병합·큐를 만들지 않는다
 *   ④ **도면 이미지 원본을 Blob 으로 함께 보관**한다
 *
 * ⚠️ **새 npm 의존성을 쓰지 않는다.** `idb`·`dexie` 를 고르는 순간
 *    Phase 5 로컬DB 선택을 앞질러 굳히게 된다. 지금 필요한 것은 얇은 CRUD 뿐이다.
 */

export const DB_NAME = 'onspect';
export const DB_VERSION = 1;

/** 코드가 기대하는 스키마 버전. `meta.schemaVersion` 과 비교한다 */
export const SCHEMA_VERSION = 1;

export const STORE = {
  projects: 'projects',
  buildings: 'buildings',
  floors: 'floors',
  drawings: 'drawings',
  defects: 'defects',
  blobs: 'blobs',
  meta: 'meta',
  // ── S2a~S5 가 얹힐 자리. **v1 에서 빈 채로 함께 만든다** (D4) ────────────
  // 스토어 추가는 IndexedDB 버전 업그레이드를 부르고, 그때마다 사용자 데이터가
  // 마이그레이션 대상이 된다. 지금 만들어 두면 그 이벤트가 한 번 줄어든다.
  memos: 'memos', // S2a
  itemSettings: 'itemSettings', // S3 · S4
  photos: 'photos', // S5
} as const;

export type StoreName = (typeof STORE)[keyof typeof STORE];

/**
 * 버전별 마이그레이션. **자동 삭제하지 않는다** (§2-9-e).
 * v1 은 최초 생성이라 항목이 없다. v2 가 생기면 여기에 `{ to: 2, run }` 을 추가한다.
 */
export type Migration = {
  to: number;
  run: (db: IDBDatabase, tx: IDBTransaction) => void;
};

export const migrations: Migration[] = [];

export type OpenResult =
  | { ok: true; db: IDBDatabase; deviceId: string }
  | { ok: false; reason: 'BLOCKED' | 'UNSUPPORTED' | 'SCHEMA_AHEAD' | 'ERROR'; message: string };

let opened: Promise<OpenResult> | null = null;

/** 여러 화면이 동시에 불러도 실제 open 은 1회다 */
export function openDb(): Promise<OpenResult> {
  opened ??= doOpen();
  return opened;
}

/** 테스트·초기화용 */
export function resetDbHandle(): void {
  opened = null;
}

function doOpen(): Promise<OpenResult> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve({
      ok: false,
      reason: 'UNSUPPORTED',
      message: '이 브라우저는 로컬 저장을 지원하지 않습니다',
    });
  }

  return new Promise<OpenResult>((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      resolve({ ok: false, reason: 'ERROR', message: describeError(e) });
      return;
    }

    req.onupgradeneeded = (ev) => {
      const db = req.result;
      const tx = req.transaction;
      if (!tx) return;
      const from = ev.oldVersion;

      if (from < 1) createV1(db);
      for (const m of migrations) {
        if (from < m.to && m.to <= DB_VERSION) m.run(db, tx);
      }
    };

    req.onsuccess = () => {
      const db = req.result;
      // 다른 탭이 더 높은 버전을 열면 이 연결을 닫아 준다 (버전 충돌 방지)
      db.onversionchange = () => db.close();
      ensureMeta(db)
        .then((deviceId) => resolve({ ok: true, db, deviceId }))
        .catch((e: unknown) => resolve({ ok: false, reason: 'ERROR', message: describeError(e) }));
    };

    req.onerror = () => {
      // 사생활 보호 모드에서는 여기로 온다. **앱은 죽지 않고 메모리 상태로 계속 동작한다**
      resolve({ ok: false, reason: 'ERROR', message: describeError(req.error) });
    };

    req.onblocked = () => {
      resolve({
        ok: false,
        reason: 'BLOCKED',
        message: '다른 탭에서 OnSpect 가 열려 있습니다. 그 탭을 닫고 새로고침해 주세요',
      });
    };
  });
}

/** §2-9-b 의 표 그대로. 굵게 표시된 7개는 S1 이 쓰고, 나머지 3개는 빈 채로 만든다 */
function createV1(db: IDBDatabase): void {
  const projects = db.createObjectStore(STORE.projects, { keyPath: 'id' });
  projects.createIndex('by_lastOpenedAt', 'lastOpenedAt');

  const buildings = db.createObjectStore(STORE.buildings, { keyPath: 'id' });
  buildings.createIndex('by_project', 'projectId');

  const floors = db.createObjectStore(STORE.floors, { keyPath: 'id' });
  floors.createIndex('by_project', 'projectId');
  floors.createIndex('by_building', 'buildingId');

  const drawings = db.createObjectStore(STORE.drawings, { keyPath: 'id' });
  drawings.createIndex('by_project', 'projectId');
  drawings.createIndex('by_floor', 'floorId');

  const defects = db.createObjectStore(STORE.defects, { keyPath: 'id' });
  defects.createIndex('by_project', 'projectId');
  defects.createIndex('by_drawing', 'drawingId');
  defects.createIndex('by_floor', 'floorId');

  // value: { blob, refCount, byteSize }
  db.createObjectStore(STORE.blobs, { keyPath: 'key' });
  db.createObjectStore(STORE.meta, { keyPath: 'key' });

  // ── 예약 스토어 (S1 은 쓰지 않는다) ────────────────────────────────────
  const memos = db.createObjectStore(STORE.memos, { keyPath: 'id' });
  memos.createIndex('by_project', 'projectId');
  memos.createIndex('by_drawing', 'drawingId');

  const itemSettings = db.createObjectStore(STORE.itemSettings, { keyPath: 'id' });
  itemSettings.createIndex('by_project', 'projectId');

  const photos = db.createObjectStore(STORE.photos, { keyPath: 'id' });
  photos.createIndex('by_project', 'projectId');
  photos.createIndex('by_defect', 'defectId');
}

/** `deviceId` 는 첫 실행 때 만들어 `meta` 에 보관하고 이후 재사용한다 (§2-9-c) */
async function ensureMeta(db: IDBDatabase): Promise<string> {
  const tx = db.transaction(STORE.meta, 'readwrite');
  const store = tx.objectStore(STORE.meta);
  const existing = await reqAsPromise<{ key: string; value: unknown } | undefined>(
    store.get('deviceId'),
  );
  let deviceId = typeof existing?.value === 'string' ? existing.value : '';
  if (deviceId === '') {
    deviceId = newId();
    store.put({ key: 'deviceId', value: deviceId });
  }
  store.put({ key: 'schemaVersion', value: SCHEMA_VERSION });
  store.put({ key: 'appVersion', value: '0.0.0' });
  await txDone(tx);
  return deviceId;
}

// ── 저수준 헬퍼 ────────────────────────────────────────────────────────────

export function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 요청이 실패했습니다'));
  });
}

export function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('트랜잭션이 실패했습니다'));
    tx.onabort = () => reject(tx.error ?? new Error('트랜잭션이 취소되었습니다'));
  });
}

/** 인덱스로 여러 건 읽기 */
export async function getAllByIndex<T>(
  store: IDBObjectStore,
  indexName: string,
  key: IDBValidKey,
): Promise<T[]> {
  return reqAsPromise(store.index(indexName).getAll(key) as IDBRequest<T[]>);
}

/** 인덱스 건수만 세기 — 결함 500건짜리 용역에서도 목록 렌더가 지연되지 않는다 */
export async function countByIndex(
  store: IDBObjectStore,
  indexName: string,
  key: IDBValidKey,
): Promise<number> {
  return reqAsPromise(store.index(indexName).count(key));
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function describeError(e: unknown): string {
  if (e instanceof DOMException) {
    if (e.name === 'QuotaExceededError') return '저장 공간이 부족합니다';
    return `${e.name}: ${e.message}`;
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

/**
 * 저장 여유 확인 (§2-9-d) — 업로드 **전에** 거절한다.
 * 처리를 다 하고 마지막에 실패하는 것이 최악이다.
 */
export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  try {
    const e = await navigator.storage.estimate();
    return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
  } catch {
    return null;
  }
}

/**
 * 저장소 영속 상태 (D11).
 * `UNKNOWN` 은 "아직 물어보지 않았다" — 거절(`DENIED`)과 구분해야 화면이 거짓말을 안 한다.
 */
export type PersistenceState = 'UNKNOWN' | 'GRANTED' | 'DENIED' | 'UNSUPPORTED';

/** 결과를 **약속째로** 기억한다. 요청이 아직 진행 중인데 두 번째 호출이 `true` 를 받아가면 안 된다 */
let persistPromise: Promise<PersistenceState> | null = null;

/**
 * 영속성 요청 (§2-9-d · D11) — **앱 시작 시 1회** (`appData.tsx`).
 * 브라우저가 용량 압박 때 데이터를 자동 축출하는 것을 막는다. **거절되어도 앱은 그대로 동작한다.**
 *
 * ⚠️ 원래 호출처가 `DrawingUpload`(첫 도면 업로드) 하나였다. 도면을 올리지 않고 pull 만 하는
 *    태블릿에서는 이 코드가 **한 번도 안 돌아** 축출 방어가 비어 있었다 (P3, 스펙 §5).
 *    `DrawingUpload` 의 호출은 그대로 두었다 — 여러 번 불려도 안전하다(약속 1개를 공유).
 */
export function requestPersistence(): Promise<PersistenceState> {
  if (persistPromise) return persistPromise;
  persistPromise = (async (): Promise<PersistenceState> => {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return 'UNSUPPORTED';
    try {
      if (await navigator.storage.persisted?.()) return 'GRANTED';
      return (await navigator.storage.persist()) ? 'GRANTED' : 'DENIED';
    } catch {
      return 'UNSUPPORTED';
    }
  })();
  return persistPromise;
}

/** 설정 메뉴의 `[로컬 데이터 초기화]` (2단 확인은 UI 가 한다) */
export function deleteDatabase(): Promise<void> {
  resetDbHandle();
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('삭제하지 못했습니다'));
    req.onblocked = () => resolve(); // 다른 탭이 잡고 있어도 새로고침하면 지워진다
  });
}
