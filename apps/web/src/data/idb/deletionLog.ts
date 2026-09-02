/**
 * 삭제 기록 KV 어댑터 — Phase 5 스펙 §6-1 T1-3 (D25 · Q58 B안).
 *
 * ⭐ **새 오브젝트 스토어를 만들지 않는다. `meta` 스토어를 KV 로 재사용한다.**
 *    `DB_VERSION` 은 **1 그대로**이며 `onupgradeneeded` 가 돌지 않는다 —
 *    `exportRuns.ts`(`exportRun:`)·`lastView.ts`(`lastView:`) 와 같은 수법이다.
 *
 * **이 기록은 지금 아무도 읽지 않는다.** T1-7(동기화 API)이 서버로 push 할 때 쓸 재료다.
 * 이번 배치는 정확히 남기고(하드 삭제 시) 정확히 지우는 것(되돌리기로 되살아날 때)까지만 한다.
 *
 * ⭐ **정본 함수는 `recordDeletion` 하나다.** `Building`·`Floor`·`Drawing`·`Defect`·`Photo`·`Memo`
 * 를 하드 삭제하는 경로(`repo.ts` 9곳 · `photos.ts` 1곳)가 전부 이것을 거친다 — 안 그러면
 * 경로 하나를 빠뜨리는 사고가 난다.
 *
 * 순수 로직(배열 append/remove)은 `@onspect/project-core` 의 `deletionLog.ts` 에 있다.
 * 여기서는 `meta` 스토어를 읽고 쓰는 부수효과만 담당한다.
 */
import {
  appendDeletion,
  deletionLogKey,
  isDeletionLog,
  removeDeletions,
  type DeletionEntry,
  type DeletionKind,
} from '@onspect/project-core';
import { reqAsPromise, STORE } from './db.js';

type MetaRow = { key: string; value: unknown };

async function readLog(store: IDBObjectStore, projectId: string): Promise<DeletionEntry[]> {
  const row = await reqAsPromise<MetaRow | undefined>(store.get(deletionLogKey(projectId)));
  if (!row || !isDeletionLog(row.value)) return [];
  return row.value;
}

function writeLog(store: IDBObjectStore, projectId: string, log: DeletionEntry[]): void {
  store.put({ key: deletionLogKey(projectId), value: log } satisfies MetaRow);
}

/**
 * ⭐ 정본 함수 — 6종 레코드를 하드 삭제하는 모든 경로가 이것을 부른다.
 *
 * 호출한 트랜잭션의 스코프에 `STORE.meta` 가 반드시 포함돼 있어야 한다
 * (안 그러면 `tx.objectStore(STORE.meta)` 가 `NotFoundError` 를 던진다).
 */
export async function recordDeletion(
  tx: IDBTransaction,
  kind: DeletionKind,
  id: string,
  projectId: string,
  deviceId: string,
  at = Date.now(),
): Promise<void> {
  const store = tx.objectStore(STORE.meta);
  const log = await readLog(store, projectId);
  writeLog(store, projectId, appendDeletion(log, { kind, id, at, deviceId }));
}

/**
 * 되돌리기(Ctrl+Z)로 살아난 항목을 삭제 기록에서 뺀다(D25).
 * `id` 는 전역 유일이라 `kind` 를 가리지 않는다. 뺄 것이 없으면 `meta` 를 다시 쓰지 않는다.
 */
export async function unrecordDeletions(
  tx: IDBTransaction,
  projectId: string,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  const store = tx.objectStore(STORE.meta);
  const log = await readLog(store, projectId);
  if (log.length === 0) return;
  const next = removeDeletions(log, ids);
  if (next === log) return;
  writeLog(store, projectId, next);
}

/** 지금은 아무도 안 읽는다 — T1-7 이 push 할 때 쓸 재료. 디버깅·향후 소비자를 위해 노출만 한다 */
export async function getDeletionLog(
  db: IDBDatabase,
  projectId: string,
): Promise<DeletionEntry[]> {
  const tx = db.transaction(STORE.meta, 'readonly');
  return readLog(tx.objectStore(STORE.meta), projectId);
}
