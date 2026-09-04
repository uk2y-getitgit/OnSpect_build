/**
 * 프로젝트 단위 수동 동기화 (push/pull) — Phase 5 트랙1 L3·L4
 * (`70_scope_Phase5_PersonalLoginSync.md` · 스펙 §3-5 ~ §3-7).
 *
 * ⭐ **규칙 0 — 자동 동기화를 만들지 않는다.** 이 파일의 함수는 `[동기화]` 버튼 클릭에서만
 *    불린다. `useEffect` 자동 pull · 타이머 · 저장 시 자동 push 가 **하나도 없다**(§3-7).
 * ⭐ **레코드 통째 승패만 있다.** 필드 단위 병합을 하지 않는다 — 화면에 없는 제3의 상태를
 *    만들기 때문이다(§3-7). 진 쪽은 버리지 않고 `syncConflict:{projectId}` 에 남긴다.
 * ⭐ **`sourceBlobKey`(도면·사진 원본)는 오가지 않는다** — render + thumb 만
 *    (`supabase/migrations/20260903000000_storage.sql`, Q60).
 * ⭐ **새 오브젝트 스토어를 만들지 않는다.** 상태는 `meta` KV `sync:` · `syncConflict:` 접두어.
 * ⭐ **서버리스 함수가 없다**(D40). 클라이언트가 RLS 를 통해 Supabase 를 직접 호출한다.
 *
 * ── 왜 `server_seq` 커서를 쓰지 않는가 (중요) ────────────────────────────────
 * `records.server_seq` 는 `generated always as identity` 라 **UPDATE 때 증가하지 않는다.**
 * 그래서 `server_seq > cursor` 로 pull 하면 *새로 만든* 레코드만 내려오고 *수정된* 레코드는
 * 영원히 안 내려온다 — 동기화의 절반이 조용히 죽는다. 마이그레이션은 이미 적용됐고 이번
 * 라운드에서 건드리지 않기로 했으므로, pull 은 **가벼운 색인 1회 조회**로 대신한다:
 *
 *   1) `select kind,id,updated_at,device_id,deleted_at` (payload 없음) 로 서버 목록을 통째로 받는다
 *      — 레코드당 약 60바이트라 5,000건이어도 300KB 남짓이다
 *   2) 로컬과 대조해 **이긴 쪽만** 정한다
 *   3) 서버가 이긴 것만 `payload` 를 마저 받아 온다
 *
 * 이 색인 하나가 push 가드(서버가 더 최신인데 덮어쓰는 사고 방지)까지 겸한다.
 * `sync.cursor` 는 스펙이 요구한 필드라 유지하되, 본 최댓값(`updated_at`)을 기록하는
 * 정보성 값이며 정확성에 쓰이지 않는다.
 */
import type { Defect, Memo } from '@onspect/canvas-core';
import type { Building, Drawing, Floor, Photo, Project } from '@onspect/project-core';
import {
  deletionLogKey,
  isDeletionLog,
  localWins,
  sameRevision,
  type DeletionEntry,
  type DeletionKind,
} from '@onspect/project-core';
import { getBlobIn, releaseBlobIn, revokeUrl, type BlobRecord } from './idb/blobs.js';
import { getAllByIndex, openDb, reqAsPromise, STORE, txDone, type StoreName } from './idb/db.js';
import { getSupabase } from './supabaseClient.js';

// ── 상수 · 타입 ────────────────────────────────────────────────────────────

export const SYNC_STATE_KEY_PREFIX = 'sync:';
export const SYNC_CONFLICT_KEY_PREFIX = 'syncConflict:';
/** 진 쪽 레코드 보관 상한 (§3-7) */
export const CONFLICT_KEEP = 50;

const BUCKET = 'blobs';
/** PostgREST 기본 한계가 1000행이라 그보다 크게 잡지 않는다 */
const PAGE = 1000;
/** `in.(...)` 필터 한 번에 넣는 id 수 — URL 길이를 안전선 안에 둔다 */
const ID_CHUNK = 100;
/** payload 를 실어 보내는 upsert 한 묶음 */
const UPSERT_CHUNK = 100;

export type SyncKind = DeletionKind;

const KINDS: readonly SyncKind[] = ['BUILDING', 'FLOOR', 'DRAWING', 'DEFECT', 'PHOTO', 'MEMO'];

const STORE_OF: Record<SyncKind, StoreName> = {
  BUILDING: STORE.buildings,
  FLOOR: STORE.floors,
  DRAWING: STORE.drawings,
  DEFECT: STORE.defects,
  PHOTO: STORE.photos,
  MEMO: STORE.memos,
};

/** 동기화가 실제로 읽는 필드는 이 넷뿐이다 — 나머지는 payload 로 통째로 오간다(S2) */
type SyncRow = { id: string; projectId: string; updatedAt: number | null; deviceId: string };

type LocalRecord = Building | Floor | Drawing | Defect | Photo | Memo;

type ServerIndexRow = {
  kind: SyncKind;
  id: string;
  updated_at: number;
  device_id: string;
  deleted_at: number | null;
};

export type SyncState = {
  /** 이번 push 가 성공한 시각 */
  lastPushedAt: number;
  /** 본 서버 `updated_at` 최댓값 (정보성 — 위 주석 참조) */
  cursor: number;
  lastSyncedAt: number;
  /** 마지막 동기화 시점에 아직 서버에 못 올린 레코드 수 */
  pendingCount: number;
  lastResult: 'OK' | 'PARTIAL' | 'ERROR' | null;
  lastMessage: string;
  /** 마지막 동기화에서 상대 값으로 덮인 레코드 수 */
  lastConflictCount: number;
};

export const EMPTY_SYNC_STATE: SyncState = {
  lastPushedAt: 0,
  cursor: 0,
  lastSyncedAt: 0,
  pendingCount: 0,
  lastResult: null,
  lastMessage: '',
  lastConflictCount: 0,
};

/** LWW 로 진 쪽. **조용히 덮는 것이 최악이다**(§3-7) */
export type SyncConflict = {
  at: number;
  kind: SyncKind | 'PROJECT';
  id: string;
  localUpdatedAt: number | null;
  serverUpdatedAt: number;
  /** 진 쪽 레코드 통째 */
  local: unknown;
};

export type SyncOutcome = {
  result: 'OK' | 'PARTIAL' | 'ERROR';
  pushed: number;
  pulled: number;
  /** 서버 삭제를 로컬에 반영한 건수 */
  deletedLocal: number;
  /** 로컬 삭제를 서버에 반영한 건수 */
  deletedRemote: number;
  blobsUploaded: number;
  blobsDownloaded: number;
  conflicts: number;
  message: string;
};

export class SyncError extends Error {}

// ── 상태 KV ────────────────────────────────────────────────────────────────

type MetaRow = { key: string; value: unknown };

export function syncStateKey(projectId: string): string {
  return `${SYNC_STATE_KEY_PREFIX}${projectId}`;
}

export function syncConflictKey(projectId: string): string {
  return `${SYNC_CONFLICT_KEY_PREFIX}${projectId}`;
}

function isSyncState(v: unknown): v is SyncState {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Partial<SyncState>;
  return typeof s.lastPushedAt === 'number' && typeof s.cursor === 'number';
}

export async function readSyncState(projectId: string): Promise<SyncState> {
  const r = await openDb();
  if (!r.ok) return EMPTY_SYNC_STATE;
  const tx = r.db.transaction(STORE.meta, 'readonly');
  const row = await reqAsPromise<MetaRow | undefined>(
    tx.objectStore(STORE.meta).get(syncStateKey(projectId)),
  );
  return isSyncState(row?.value) ? { ...EMPTY_SYNC_STATE, ...row.value } : EMPTY_SYNC_STATE;
}

async function writeSyncState(db: IDBDatabase, projectId: string, state: SyncState): Promise<void> {
  const tx = db.transaction(STORE.meta, 'readwrite');
  tx.objectStore(STORE.meta).put({ key: syncStateKey(projectId), value: state } satisfies MetaRow);
  await txDone(tx);
}

export async function readConflicts(projectId: string): Promise<SyncConflict[]> {
  const r = await openDb();
  if (!r.ok) return [];
  const tx = r.db.transaction(STORE.meta, 'readonly');
  const row = await reqAsPromise<MetaRow | undefined>(
    tx.objectStore(STORE.meta).get(syncConflictKey(projectId)),
  );
  return Array.isArray(row?.value) ? (row.value as SyncConflict[]) : [];
}

async function appendConflicts(
  db: IDBDatabase,
  projectId: string,
  added: readonly SyncConflict[],
): Promise<void> {
  if (added.length === 0) return;
  const tx = db.transaction(STORE.meta, 'readwrite');
  const store = tx.objectStore(STORE.meta);
  const row = await reqAsPromise<MetaRow | undefined>(store.get(syncConflictKey(projectId)));
  const prev = Array.isArray(row?.value) ? (row.value as SyncConflict[]) : [];
  // 최근 것이 앞에 오고 상한을 넘으면 오래된 것부터 버린다
  const next = [...added, ...prev].slice(0, CONFLICT_KEEP);
  store.put({ key: syncConflictKey(projectId), value: next } satisfies MetaRow);
  await txDone(tx);
}

/** 충돌 알림을 사용자가 확인했을 때 (결과 배지를 지운다) */
export async function clearConflicts(projectId: string): Promise<void> {
  const r = await openDb();
  if (!r.ok) return;
  const tx = r.db.transaction(STORE.meta, 'readwrite');
  tx.objectStore(STORE.meta).delete(syncConflictKey(projectId));
  await txDone(tx);
}

// ── LWW 판정 (정본 1개) ────────────────────────────────────────────────────

/** 서버 행(snake_case)을 LWW 판정이 쓰는 모양으로 옮긴다 */
function side(r: { updated_at: number; device_id: string }): { updatedAt: number; deviceId: string } {
  return { updatedAt: r.updated_at, deviceId: r.device_id };
}

// LWW 판정(`localWins`·`sameRevision`)은 **`@onspect/project-core/lww.ts` 가 정본**이다.
// 순수 함수라 코어에 두고 단위 테스트를 붙였다 — 여기서 복제하지 않는다(경계 규칙 9).

// ── 저수준 헬퍼 ────────────────────────────────────────────────────────────

function chunk<T>(arr: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new SyncError(`${what} — ${res.error.message}`);
  if (res.data === null) throw new SyncError(`${what} — 응답이 비어 있습니다`);
  return res.data;
}

/** 도면·사진이 동기화하는 Blob 키. **`sourceBlobKey` 는 넣지 않는다**(Q60) */
function syncedBlobKeys(kind: SyncKind, rec: unknown): string[] {
  if (kind !== 'DRAWING' && kind !== 'PHOTO') return [];
  const r = rec as { renderBlobKey?: unknown; thumbBlobKey?: unknown };
  const keys: string[] = [];
  if (typeof r.renderBlobKey === 'string' && r.renderBlobKey !== '') keys.push(r.renderBlobKey);
  if (typeof r.thumbBlobKey === 'string' && r.thumbBlobKey !== '') keys.push(r.thumbBlobKey);
  return [...new Set(keys)];
}

function blobPath(teamId: string, projectId: string, key: string): string {
  return `${teamId}/${projectId}/${key}`;
}

async function hasBlob(db: IDBDatabase, key: string): Promise<boolean> {
  const tx = db.transaction(STORE.blobs, 'readonly');
  const rec = await reqAsPromise<BlobRecord | undefined>(tx.objectStore(STORE.blobs).get(key));
  return Boolean(rec);
}

async function readBlob(db: IDBDatabase, key: string): Promise<Blob | null> {
  const tx = db.transaction(STORE.blobs, 'readonly');
  return getBlobIn(tx.objectStore(STORE.blobs), key);
}

/**
 * 내려받은 Blob 을 넣는다. **이미 있으면 참조수를 건드리지 않는다** —
 * `putBlobIn` 은 참조를 +1 하므로 여기서 쓰면 동기화할 때마다 참조가 새어 나가
 * 도면을 지워도 Blob 이 영영 남는다.
 */
async function putDownloadedBlob(db: IDBDatabase, key: string, blob: Blob): Promise<void> {
  const tx = db.transaction(STORE.blobs, 'readwrite');
  const store = tx.objectStore(STORE.blobs);
  const prev = await reqAsPromise<BlobRecord | undefined>(store.get(key));
  if (prev) return; // 트랜잭션은 요청 없이 저절로 끝난다
  store.put({ key, blob, refCount: 1, byteSize: blob.size } satisfies BlobRecord);
  await txDone(tx);
}

// ── 로컬 읽기 ──────────────────────────────────────────────────────────────

type LocalSnapshot = {
  project: Project;
  byKind: Map<SyncKind, LocalRecord[]>;
  deletions: DeletionEntry[];
};

async function readLocal(db: IDBDatabase, projectId: string): Promise<LocalSnapshot> {
  const tx = db.transaction(
    [
      STORE.projects,
      STORE.buildings,
      STORE.floors,
      STORE.drawings,
      STORE.defects,
      STORE.photos,
      STORE.memos,
      STORE.meta,
    ],
    'readonly',
  );
  const project = await reqAsPromise<Project | undefined>(
    tx.objectStore(STORE.projects).get(projectId),
  );
  if (!project) throw new SyncError('이 기기에 없는 용역입니다');

  const byKind = new Map<SyncKind, LocalRecord[]>();
  for (const kind of KINDS) {
    byKind.set(
      kind,
      await getAllByIndex<LocalRecord>(tx.objectStore(STORE_OF[kind]), 'by_project', projectId),
    );
  }

  const row = await reqAsPromise<MetaRow | undefined>(
    tx.objectStore(STORE.meta).get(deletionLogKey(projectId)),
  );
  const deletions = isDeletionLog(row?.value) ? row.value : [];

  return { project, byKind, deletions };
}

function asSyncRow(rec: LocalRecord): SyncRow {
  const r = rec as unknown as SyncRow;
  return {
    id: r.id,
    projectId: r.projectId,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : null,
    deviceId: typeof r.deviceId === 'string' ? r.deviceId : '',
  };
}

// ── 로컬 쓰기 (pull 적용) ──────────────────────────────────────────────────
//
// §3-7 "4의 로컬 적용은 **레코드 단위**로 커밋한다. 통째 트랜잭션으로 묶지 않는다 —
// 500건 중 1건이 실패하면 전부 롤백되는 것이 더 나쁘다."

async function applyPulledRecord(db: IDBDatabase, kind: SyncKind, payload: unknown): Promise<void> {
  const tx = db.transaction(STORE_OF[kind], 'readwrite');
  tx.objectStore(STORE_OF[kind]).put(payload);
  await txDone(tx);
}

/**
 * 서버 삭제를 로컬에 반영한다. **삭제 기록(`deleted:{projectId}`)을 남기지 않는다** —
 * 남기면 서버에서 온 삭제를 다시 서버로 밀어 보내는 되먹임이 생긴다.
 */
async function applyPulledDeletion(
  db: IDBDatabase,
  kind: SyncKind,
  id: string,
): Promise<boolean> {
  const withBlobs = kind === 'DRAWING' || kind === 'PHOTO';
  const tx = db.transaction(withBlobs ? [STORE_OF[kind], STORE.blobs] : [STORE_OF[kind]], 'readwrite');
  const store = tx.objectStore(STORE_OF[kind]);
  const rec = await reqAsPromise<Record<string, unknown> | undefined>(store.get(id));
  if (!rec) return false;
  if (withBlobs) {
    const blobStore = tx.objectStore(STORE.blobs);
    const keys = new Set(
      [rec.renderBlobKey, rec.sourceBlobKey, rec.thumbBlobKey].filter(
        (k): k is string => typeof k === 'string' && k !== '',
      ),
    );
    for (const k of keys) {
      await releaseBlobIn(blobStore, k);
      revokeUrl(k);
    }
  }
  store.delete(id);
  await txDone(tx);
  return true;
}

async function putLocalProject(db: IDBDatabase, project: Project): Promise<void> {
  const tx = db.transaction(STORE.projects, 'readwrite');
  tx.objectStore(STORE.projects).put(project);
  await txDone(tx);
}

/**
 * D23 — `updatedAt === null` 인 옛 결함에 **첫 동기화 시각**을 부여하고 로컬에도 기록한다.
 * 로컬에 써 두지 않으면 매번 다시 "미동기화"로 잡히고 영원히 LWW 에서 진다.
 * ⛔ `deviceId` 는 바꾸지 않는다 — 마지막으로 쓴 기기라는 사실은 그대로 두어야 한다.
 */
async function stampNullUpdatedAt(
  db: IDBDatabase,
  kind: SyncKind,
  ids: readonly string[],
  at: number,
): Promise<void> {
  if (ids.length === 0) return;
  const tx = db.transaction(STORE_OF[kind], 'readwrite');
  const store = tx.objectStore(STORE_OF[kind]);
  for (const id of ids) {
    const rec = await reqAsPromise<Record<string, unknown> | undefined>(store.get(id));
    if (!rec || rec.updatedAt !== null) continue;
    store.put({ ...rec, updatedAt: at });
  }
  await txDone(tx);
}

// ── 본체 ───────────────────────────────────────────────────────────────────

/**
 * `[동기화]` 버튼 **클릭에서만** 불린다 (§3-7 규칙 0).
 *
 * 5단계. 어느 단계에서 끊겨도 로컬 데이터는 손상되지 않는다:
 *   0. 세션·팀 확인  1. 서버 색인 1회 조회  2. Blob 업로드 → PUSH
 *   3. PULL(서버가 이긴 것만)  4. Blob 다운로드  5. 상태 기록
 */
export async function syncProject(
  projectId: string,
  onStage?: (label: string) => void,
): Promise<SyncOutcome> {
  const stage = (s: string) => onStage?.(s);

  const sb = getSupabase();
  if (!sb) throw new SyncError('서버 연결 정보가 설정되지 않았습니다');

  const opened = await openDb();
  if (!opened.ok) throw new SyncError(`로컬 저장소를 열 수 없습니다 — ${opened.message}`);
  const db = opened.db;

  // ── 0. 세션 · 팀 ────────────────────────────────────────────────────────
  stage('로그인 확인 중…');
  // 여기서만 네트워크 갱신을 허용한다(§3-4) — 앱 시작 경로는 이 함수를 부르지 않는다
  const { data: sessionData } = await sb.auth.getSession();
  if (!sessionData.session) throw new SyncError('다시 로그인해야 동기화됩니다');

  const memberRes = await sb.from('team_members').select('team_id').limit(1).maybeSingle();
  if (memberRes.error) throw new SyncError(`팀 정보를 읽지 못했습니다 — ${memberRes.error.message}`);
  const teamId = (memberRes.data as { team_id?: string } | null)?.team_id;
  if (!teamId) throw new SyncError('이 계정이 아직 팀에 등록되지 않았습니다');

  const state = await readSyncState(projectId);
  const local = await readLocal(db, projectId);
  const now = Date.now();

  const conflicts: SyncConflict[] = [];
  const problems: string[] = [];
  let pushed = 0;
  let pulled = 0;
  let deletedLocal = 0;
  let deletedRemote = 0;
  let blobsUploaded = 0;
  let blobsDownloaded = 0;

  // ── 1. 서버 색인 (payload 없이) ──────────────────────────────────────────
  stage('서버 목록 확인 중…');
  const serverIndex = new Map<string, ServerIndexRow>();
  let maxServerUpdatedAt = state.cursor;
  for (let from = 0; ; from += PAGE) {
    const res = await sb
      .from('records')
      .select('kind,id,updated_at,device_id,deleted_at')
      .eq('project_id', projectId)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    const rows = must(res, '서버 목록을 읽지 못했습니다') as ServerIndexRow[];
    for (const r of rows) {
      serverIndex.set(`${r.kind}:${r.id}`, r);
      if (r.updated_at > maxServerUpdatedAt) maxServerUpdatedAt = r.updated_at;
    }
    if (rows.length < PAGE) break;
  }

  // ── 2. PUSH ─────────────────────────────────────────────────────────────
  //
  // 2-a. 용역 행이 먼저다 — `records`·`blobs` 가 `projects.id` 를 외래키로 건다
  stage('용역 정보 올리는 중…');
  const projRes = await sb
    .from('projects')
    .select('updated_at,deleted_at,payload')
    .eq('id', projectId)
    .maybeSingle();
  if (projRes.error) throw new SyncError(`용역 정보를 읽지 못했습니다 — ${projRes.error.message}`);
  const serverProject = projRes.data as
    | { updated_at: number; deleted_at: number | null; payload: Project }
    | null;

  // D24 — 로컬 `Project.orgId` 를 내 팀으로 채운다(스키마 무변경, 이미 있는 필드)
  const localProject: Project = local.project.orgId === teamId
    ? local.project
    : { ...local.project, orgId: teamId };

  const projectServerSide = serverProject
    ? { updatedAt: serverProject.updated_at, deviceId: serverProject.payload?.deviceId ?? '' }
    : null;

  if (!projectServerSide || localWins(localProject, projectServerSide)) {
    const up = await sb.from('projects').upsert(
      {
        id: projectId,
        team_id: teamId,
        updated_at: localProject.updatedAt,
        deleted_at: localProject.deletedAt,
        payload: localProject,
      },
      { onConflict: 'id' },
    );
    if (up.error) throw new SyncError(`용역 정보를 올리지 못했습니다 — ${up.error.message}`);
    if (localProject !== local.project) await putLocalProject(db, localProject);
  } else if (serverProject) {
    // 서버가 이겼다 — 레코드 통째로 받는다(필드 병합 금지)
    if (serverProject.updated_at !== localProject.updatedAt) {
      conflicts.push({
        at: now,
        kind: 'PROJECT',
        id: projectId,
        localUpdatedAt: localProject.updatedAt,
        serverUpdatedAt: serverProject.updated_at,
        local: localProject,
      });
    }
    await putLocalProject(db, serverProject.payload);
    pulled += 1;
  }

  // 2-b. 올릴 레코드 고르기 — 서버에 없거나, 로컬이 LWW 로 이긴 것
  const deletedIds = new Set(local.deletions.map((d) => d.id));
  const toPush = new Map<SyncKind, LocalRecord[]>();
  const nullStamped = new Map<SyncKind, string[]>();

  for (const kind of KINDS) {
    const list: LocalRecord[] = [];
    const stamped: string[] = [];
    for (const rec of local.byKind.get(kind) ?? []) {
      const row = asSyncRow(rec);
      if (deletedIds.has(row.id)) continue; // 삭제 기록이 있는 id 는 삭제 경로가 처리한다
      const server = serverIndex.get(`${kind}:${row.id}`);
      if (server && !localWins(row, side(server))) {
        // 로컬이 졌다 → pull 단계가 서버 값을 덮어쓴다. 진 쪽을 남긴다
        if (!sameRevision(row, side(server))) {
          conflicts.push({
            at: now,
            kind,
            id: row.id,
            localUpdatedAt: row.updatedAt,
            serverUpdatedAt: server.updated_at,
            local: rec,
          });
        }
        continue;
      }
      if (row.updatedAt === null) {
        // D23 — 첫 동기화 시각을 부여한다(서버에 없을 때만 이 가지에 온다)
        stamped.push(row.id);
        list.push({ ...(rec as object), updatedAt: now } as LocalRecord);
      } else {
        list.push(rec);
      }
    }
    if (list.length > 0) toPush.set(kind, list);
    if (stamped.length > 0) nullStamped.set(kind, stamped);
  }

  const pushCount = [...toPush.values()].reduce((n, l) => n + l.length, 0);

  // 2-c. Blob 업로드 — 서버에 없는 key 만. render + thumb 뿐이다
  const wantedKeys = new Set<string>();
  for (const [kind, list] of toPush) {
    for (const rec of list) for (const k of syncedBlobKeys(kind, rec)) wantedKeys.add(k);
  }
  if (wantedKeys.size > 0) {
    stage('사진·도면 올리는 중…');
    const known = new Set<string>();
    for (const ids of chunk([...wantedKeys], ID_CHUNK)) {
      const res = await sb.from('blobs').select('key').in('key', ids);
      for (const r of must(res, '파일 목록을 읽지 못했습니다') as { key: string }[]) known.add(r.key);
    }
    const missing = [...wantedKeys].filter((k) => !known.has(k));
    const uploadedMeta: { key: string; project_id: string; byte_size: number; content_type: string; uploaded_at: number }[] = [];
    for (const key of missing) {
      const blob = await readBlob(db, key);
      if (!blob) {
        // 로컬에도 없다 — 다른 기기에서 받은 레코드의 원본이 아직 안 왔을 수 있다
        problems.push(`파일 ${key} 가 이 기기에 없습니다`);
        continue;
      }
      const contentType = blob.type !== '' ? blob.type : 'application/octet-stream';
      const up = await sb.storage
        .from(BUCKET)
        .upload(blobPath(teamId, projectId, key), blob, { contentType, upsert: true });
      if (up.error) {
        problems.push(`파일 업로드 실패 — ${up.error.message}`);
        continue;
      }
      uploadedMeta.push({
        key,
        project_id: projectId,
        byte_size: blob.size,
        content_type: contentType,
        uploaded_at: Date.now(),
      });
      blobsUploaded += 1;
    }
    for (const rows of chunk(uploadedMeta, UPSERT_CHUNK)) {
      // `blobs` 에는 update 정책이 없다 — `ignoreDuplicates` 로 `on conflict do nothing` 을 쓴다
      const res = await sb.from('blobs').upsert(rows, { onConflict: 'key', ignoreDuplicates: true });
      if (res.error) problems.push(`파일 정보를 기록하지 못했습니다 — ${res.error.message}`);
    }
  }

  // 2-d. 레코드 upsert
  if (pushCount > 0) {
    stage(`올리는 중… (${pushCount}건)`);
    for (const [kind, list] of toPush) {
      const rows = list.map((rec) => {
        const row = asSyncRow(rec);
        return {
          project_id: projectId,
          kind,
          id: row.id,
          updated_at: row.updatedAt ?? now,
          device_id: row.deviceId,
          deleted_at: null,
          payload: rec,
        };
      });
      for (const part of chunk(rows, UPSERT_CHUNK)) {
        const res = await sb.from('records').upsert(part, { onConflict: 'project_id,kind,id' });
        if (res.error) throw new SyncError(`올리지 못했습니다 — ${res.error.message}`);
        pushed += part.length;
      }
      await stampNullUpdatedAt(db, kind, nullStamped.get(kind) ?? [], now);
    }
  }

  // 2-e. 삭제 전파 (D25) — 서버에 그 행이 있고, 삭제가 서버 값보다 최신일 때만
  const tombstones = local.deletions.filter((d) => {
    const server = serverIndex.get(`${d.kind}:${d.id}`);
    if (!server || server.deleted_at !== null) return false;
    return localWins({ updatedAt: d.at, deviceId: d.deviceId }, side(server));
  });
  if (tombstones.length > 0) {
    stage(`삭제 반영 중… (${tombstones.length}건)`);
    for (const d of tombstones) {
      const res = await sb
        .from('records')
        .update({ updated_at: d.at, deleted_at: d.at, device_id: d.deviceId })
        .eq('project_id', projectId)
        .eq('kind', d.kind)
        .eq('id', d.id);
      if (res.error) {
        problems.push(`삭제를 반영하지 못했습니다 — ${res.error.message}`);
        continue;
      }
      const server = serverIndex.get(`${d.kind}:${d.id}`);
      if (server) {
        server.deleted_at = d.at;
        server.updated_at = d.at;
        server.device_id = d.deviceId;
      }
      deletedRemote += 1;
    }
  }

  // ── 3. PULL — 서버가 이긴 것만 payload 를 받는다 ─────────────────────────
  const localIndex = new Map<string, SyncRow>();
  for (const kind of KINDS) {
    for (const rec of local.byKind.get(kind) ?? []) {
      localIndex.set(`${kind}:${asSyncRow(rec).id}`, asSyncRow(rec));
    }
  }

  const wantPayload = new Map<SyncKind, string[]>();
  const toDeleteLocal: { kind: SyncKind; id: string }[] = [];

  for (const [key, server] of serverIndex) {
    const kind = key.slice(0, key.indexOf(':')) as SyncKind;
    if (!KINDS.includes(kind)) continue;
    const mine = localIndex.get(key);

    if (server.deleted_at !== null) {
      // 서버가 지웠다 — 로컬에 있고 삭제가 로컬보다 최신일 때만 지운다
      if (mine && !localWins(mine, side(server))) toDeleteLocal.push({ kind, id: server.id });
      continue;
    }
    if (mine) {
      if (localWins(mine, side(server))) continue;
      if (sameRevision(mine, side(server))) continue;
    } else {
      // 로컬에 없다. 내가 지운 것이라면 되살리지 않는다(삭제가 더 최신일 때)
      const del = local.deletions.find((d) => d.kind === kind && d.id === server.id);
      if (del && localWins({ updatedAt: del.at, deviceId: del.deviceId }, side(server))) continue;
    }
    const list = wantPayload.get(kind);
    if (list) list.push(server.id);
    else wantPayload.set(kind, [server.id]);
  }

  const pullCount = [...wantPayload.values()].reduce((n, l) => n + l.length, 0);
  const pulledRecords: { kind: SyncKind; payload: unknown }[] = [];

  if (pullCount > 0) {
    stage(`받는 중… (${pullCount}건)`);
    for (const [kind, ids] of wantPayload) {
      for (const part of chunk(ids, ID_CHUNK)) {
        const res = await sb
          .from('records')
          .select('id,payload')
          .eq('project_id', projectId)
          .eq('kind', kind)
          .in('id', part);
        const rows = must(res, '받지 못했습니다') as { id: string; payload: unknown }[];
        for (const r of rows) {
          try {
            // §3-7 — 레코드 단위 커밋. 1건이 실패해도 나머지는 남는다
            await applyPulledRecord(db, kind, r.payload);
            pulledRecords.push({ kind, payload: r.payload });
            pulled += 1;
          } catch (e) {
            problems.push(`${kind} ${r.id} 를 저장하지 못했습니다 — ${describe(e)}`);
          }
        }
      }
    }
  }

  for (const { kind, id } of toDeleteLocal) {
    try {
      if (await applyPulledDeletion(db, kind, id)) deletedLocal += 1;
    } catch (e) {
      problems.push(`${kind} ${id} 를 지우지 못했습니다 — ${describe(e)}`);
    }
  }

  // ── 4. Blob 다운로드 — 받은 레코드가 가리키는데 로컬에 없는 것 ───────────
  const needKeys = new Set<string>();
  for (const { kind, payload } of pulledRecords) {
    for (const k of syncedBlobKeys(kind, payload)) needKeys.add(k);
  }
  if (needKeys.size > 0) {
    stage('사진·도면 받는 중…');
    for (const key of needKeys) {
      if (await hasBlob(db, key)) continue;
      const res = await sb.storage.from(BUCKET).download(blobPath(teamId, projectId, key));
      if (res.error || !res.data) {
        problems.push(`파일 ${key} 를 받지 못했습니다`);
        continue;
      }
      try {
        await putDownloadedBlob(db, key, res.data);
        blobsDownloaded += 1;
      } catch (e) {
        problems.push(`파일 ${key} 를 저장하지 못했습니다 — ${describe(e)}`);
      }
    }
  }

  // ── 5. 상태 기록 ────────────────────────────────────────────────────────
  await appendConflicts(db, projectId, conflicts);

  const result: SyncOutcome['result'] = problems.length > 0 ? 'PARTIAL' : 'OK';
  const changed = pushed + pulled + deletedLocal + deletedRemote;
  const message =
    result === 'PARTIAL'
      ? `${changed}건 반영 · 일부 실패 (${problems[0] ?? ''})`
      : changed === 0
        ? '변경 사항이 없습니다'
        : `${changed}건 반영`;

  await writeSyncState(db, projectId, {
    lastPushedAt: now,
    cursor: maxServerUpdatedAt,
    lastSyncedAt: Date.now(),
    pendingCount: 0,
    lastResult: result,
    lastMessage: message,
    lastConflictCount: conflicts.length,
  });

  return {
    result,
    pushed,
    pulled,
    deletedLocal,
    deletedRemote,
    blobsUploaded,
    blobsDownloaded,
    conflicts: conflicts.length,
    message,
  };
}

/** 실패도 상태로 남긴다 — 버튼이 `실패 · 다시 시도` 를 보여줄 재료다(§3-7) */
export async function recordSyncFailure(projectId: string, message: string): Promise<void> {
  const opened = await openDb();
  if (!opened.ok) return;
  const prev = await readSyncState(projectId);
  await writeSyncState(opened.db, projectId, {
    ...prev,
    lastResult: 'ERROR',
    lastMessage: message,
    lastSyncedAt: Date.now(),
  });
}

export function describe(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
