/**
 * Supabase 클라이언트 배선 — Phase 5 트랙1 L1 (`70_scope_Phase5_PersonalLoginSync.md`).
 *
 * ⭐ **서버리스 함수가 없다** (D40). 클라이언트가 publishable 키 + 로그인 사용자의 JWT 로
 *    Supabase 를 직접 호출하고, 팀 격리는 RLS(`my_team_id()`)가 강제한다.
 *    `SUPABASE_SERVICE_ROLE_KEY` 는 이 앱 어디에도 등장하지 않는다.
 *
 * ⭐ **새 오브젝트 스토어를 만들지 않는다.** 세션은 `meta` KV 에 `sbSession:` 접두어로 담는다 —
 *    `lastView.ts`(`lastView:`) · `exportRuns.ts`(`exportRun:`) · `deletionLog.ts`(`deleted:`)
 *    와 같은 수법이다. `DB_VERSION` 은 **1 그대로**이고 마이그레이션이 0건이다.
 *
 * ⭐ **`autoRefreshToken: false`** — 스펙 §3-4 오프라인 로그인 규칙의 핵심이다.
 *    앱 시작 시 토큰 갱신을 저절로 시도하지 않는다. 현장에서 네트워크가 반쯤 살아 있으면
 *    갱신 요청이 매달려 앱 시작 자체가 느려진다. 갱신은 `[동기화]` 를 누른 순간에만 일어난다.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { openDb, reqAsPromise, STORE, txDone } from './idb/db.js';

/** `meta` KV 접두어. 세션 1건은 `sbSession:auth` 하나에 들어간다 */
export const SB_SESSION_KEY_PREFIX = 'sbSession:';

/**
 * Supabase 가 쓰는 저장 키 이름을 **고정한다.** 기본값(`sb-{projectRef}-auth-token`)을 쓰면
 * 프로젝트 ref 를 모르는 코드가 `meta` 에서 세션을 직접 읽을 수 없다 —
 * 로그인 게이트(`session.tsx`)가 바로 그 코드다.
 */
export const SB_STORAGE_KEY = 'auth';

type MetaRow = { key: string; value: unknown };

/**
 * IndexedDB 가 막힌 브라우저(사생활 보호 모드)에서도 **로그인 자체는 되어야 한다.**
 * 저장이 실패하면 이 탭이 살아 있는 동안만 기억한다 — 앱은 죽지 않는다(§2-9-e 와 같은 태도).
 */
const memoryFallback = new Map<string, string>();

function metaKey(key: string): string {
  return `${SB_SESSION_KEY_PREFIX}${key}`;
}

export async function readSessionItem(key: string): Promise<string | null> {
  try {
    const r = await openDb();
    if (!r.ok) return memoryFallback.get(key) ?? null;
    const tx = r.db.transaction(STORE.meta, 'readonly');
    const row = await reqAsPromise<MetaRow | undefined>(tx.objectStore(STORE.meta).get(metaKey(key)));
    if (typeof row?.value === 'string') return row.value;
    return memoryFallback.get(key) ?? null;
  } catch {
    return memoryFallback.get(key) ?? null;
  }
}

async function writeSessionItem(key: string, value: string): Promise<void> {
  memoryFallback.set(key, value);
  try {
    const r = await openDb();
    if (!r.ok) return;
    const tx = r.db.transaction(STORE.meta, 'readwrite');
    tx.objectStore(STORE.meta).put({ key: metaKey(key), value } satisfies MetaRow);
    await txDone(tx);
  } catch {
    /* 저장 실패는 앱을 막지 않는다. 이 탭에서는 memoryFallback 으로 계속 동작한다 */
  }
}

async function removeSessionItem(key: string): Promise<void> {
  memoryFallback.delete(key);
  try {
    const r = await openDb();
    if (!r.ok) return;
    const tx = r.db.transaction(STORE.meta, 'readwrite');
    tx.objectStore(STORE.meta).delete(metaKey(key));
    await txDone(tx);
  } catch {
    /* 위와 같다 */
  }
}

/** Supabase 스토리지 어댑터 인터페이스는 이 3개면 충분하다 (비동기 허용) */
const metaKvStorage = {
  getItem: (key: string) => readSessionItem(key),
  setItem: (key: string, value: string) => writeSessionItem(key, value),
  removeItem: (key: string) => removeSessionItem(key),
};

const RAW_URL = (import.meta.env.VITE_SUPABASE_URL ?? '') as string;
const RAW_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '') as string;

/**
 * `.env.local` 이 없거나 템플릿 값 그대로면 **동기화 기능만 꺼진다.**
 * 로그인 게이트도 걸지 않는다 — 이 앱은 로그인 없이도 전부 동작하는 로컬 우선 앱이다(불변식 3).
 */
export function isSupabaseConfigured(): boolean {
  return RAW_URL.startsWith('http') && RAW_KEY !== '' && !RAW_KEY.endsWith('...');
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  client ??= createClient(RAW_URL, RAW_KEY, {
    auth: {
      storage: metaKvStorage,
      storageKey: SB_STORAGE_KEY,
      // ⛔ 아래 두 줄을 바꾸지 마라 — §3-4 의 전부다
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: true,
      flowType: 'implicit',
    },
  });
  return client;
}
