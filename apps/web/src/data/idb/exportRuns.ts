/**
 * `ExportRun` 저장소 — Phase 4 스펙 §3-3 (**K2**).
 *
 * ⭐ **새 오브젝트 스토어를 만들지 않는다. `meta` 스토어를 KV 로 재사용한다.**
 *    `DB_VERSION` 은 **1 그대로**이며 `onupgradeneeded` 가 돌지 않는다 —
 *    레코드를 추가하는 것은 데이터 추가이지 스키마 변경이 아니다.
 *
 * 근거(요약):
 *   · `meta` 는 `keyPath: 'key'` 인 범용 키-값 스토어이고 인덱스가 없다(`db.ts` 143행)
 *   · ExportRun 은 프로젝트당 수십 건이라 `getAll()` + prefix 필터로 충분하다
 *   · `ASSUMPTIONS S1` 의 보류 사유("출력 파라미터 형태가 미확정이라 지금 인덱스를 잡으면
 *     잘못 굳는다")를 그대로 존중한다 — 지금도 인덱스를 잡지 않는다.
 *     Phase 5 에서 DB 버전을 올릴 일이 생기면 그때 전용 스토어로 승격하고
 *     `meta → exportRuns` 이관 마이그레이션 1개만 쓰면 된다.
 */
import {
  EXPORT_RUN_KEEP,
  EXPORT_RUN_KEY_PREFIX,
  exportRunKey,
  type ExportArtifact,
  type ExportRun,
} from '@onspect/project-core';
import { reqAsPromise, STORE, txDone } from './db.js';

type MetaRow = { key: string; value: unknown };

function isExportRun(v: unknown): v is ExportRun {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Partial<ExportRun>;
  return (
    typeof r.id === 'string' &&
    typeof r.projectId === 'string' &&
    typeof r.createdAt === 'number' &&
    typeof r.mapping === 'object' &&
    r.mapping !== null &&
    Array.isArray(r.order)
  );
}

export async function putExportRun(db: IDBDatabase, run: ExportRun): Promise<void> {
  const tx = db.transaction(STORE.meta, 'readwrite');
  tx.objectStore(STORE.meta).put({ key: exportRunKey(run.id), value: run } satisfies MetaRow);
  await txDone(tx);
}

export async function getExportRun(db: IDBDatabase, id: string): Promise<ExportRun | null> {
  const tx = db.transaction(STORE.meta, 'readonly');
  const row = await reqAsPromise<MetaRow | undefined>(tx.objectStore(STORE.meta).get(exportRunKey(id)));
  return row && isExportRun(row.value) ? row.value : null;
}

/** `createdAt DESC` — 최근 출력이 위에 온다 */
export async function listExportRuns(db: IDBDatabase, projectId: string): Promise<ExportRun[]> {
  const tx = db.transaction(STORE.meta, 'readonly');
  const rows = await reqAsPromise<MetaRow[]>(tx.objectStore(STORE.meta).getAll());
  return rows
    .filter((r) => typeof r.key === 'string' && r.key.startsWith(EXPORT_RUN_KEY_PREFIX))
    .map((r) => r.value)
    .filter(isExportRun)
    .filter((r) => r.projectId === projectId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * 다운로드한 산출물을 이력에 덧붙인다. **번호는 다시 계산하지 않는다** —
 * `mapping` 은 그대로 두고 `artifacts` 만 늘린다(§3-3 재현성 규칙).
 */
export async function appendArtifact(
  db: IDBDatabase,
  runId: string,
  artifact: ExportArtifact,
): Promise<void> {
  const run = await getExportRun(db, runId);
  if (!run) return;
  await putExportRun(db, { ...run, artifacts: [...run.artifacts, artifact] });
}

/** 오래된 것부터 삭제. 무한히 쌓이지 않게 한다 */
export async function pruneExportRuns(
  db: IDBDatabase,
  projectId: string,
  keep = EXPORT_RUN_KEEP,
): Promise<number> {
  const runs = await listExportRuns(db, projectId);
  const doomed = runs.slice(keep);
  if (doomed.length === 0) return 0;
  const tx = db.transaction(STORE.meta, 'readwrite');
  const store = tx.objectStore(STORE.meta);
  for (const r of doomed) store.delete(exportRunKey(r.id));
  await txDone(tx);
  return doomed.length;
}

export async function deleteExportRun(db: IDBDatabase, id: string): Promise<void> {
  const tx = db.transaction(STORE.meta, 'readwrite');
  tx.objectStore(STORE.meta).delete(exportRunKey(id));
  await txDone(tx);
}

/** 용역을 지울 때 그 용역의 출력 이력도 정리한다 */
export async function deleteExportRunsOfProject(db: IDBDatabase, projectId: string): Promise<void> {
  const runs = await listExportRuns(db, projectId);
  if (runs.length === 0) return;
  const tx = db.transaction(STORE.meta, 'readwrite');
  const store = tx.objectStore(STORE.meta);
  for (const r of runs) store.delete(exportRunKey(r.id));
  await txDone(tx);
}
