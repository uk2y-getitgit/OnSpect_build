/**
 * 로그인 세션 — Phase 5 트랙1 L2 (스펙 §3-4 · 스코프 L2).
 *
 * 규칙 세 줄이 전부다.
 *   · 세션이 **있으면** 로그인 화면을 건너뛴다. 토큰이 만료됐어도 앱은 전부 정상 동작한다
 *     (결함 입력 · 사진 · 캔버스 · 출력은 전부 로컬이라 토큰이 필요 없다)
 *   · 세션이 **아예 없을 때만** 로그인 화면을 띄운다
 *   · 로그아웃 버튼은 **만들지 않는다**(D26 — 계정 전환은 `[로컬 데이터 초기화]`로)
 *
 * ⭐ **게이트 판정에 `supabase.auth.getSession()` 을 쓰지 않는다.**
 *    `@supabase/auth-js` 2.115 의 `__loadSession()` 은 저장된 토큰이 만료돼 있으면
 *    `autoRefreshToken` 값과 **무관하게** `_callRefreshToken()` 을 호출한다(네트워크).
 *    현장에서 앱을 열 때마다 그 요청이 매달리면 §3-4 가 그대로 무너진다.
 *    그래서 게이트는 우리가 쓴 `meta` KV 를 **직접** 읽는다 — 순수 로컬 연산이고 즉시 끝난다.
 *    (네트워크가 필요한 갱신은 `[동기화]` 를 누른 순간에만 — `sync.ts` 가 한다.)
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getSupabase, isSupabaseConfigured, readSessionItem, SB_STORAGE_KEY } from './supabaseClient.js';

export type SessionStatus =
  /** meta KV 를 읽는 중. 아주 짧다 */
  | 'LOADING'
  /** `.env.local` 이 없다 — 로그인 게이트를 걸지 않고 앱을 그대로 연다 */
  | 'DISABLED'
  | 'SIGNED_IN'
  | 'SIGNED_OUT';

export type SessionUser = {
  userId: string;
  email: string;
  /** epoch ms. 지났어도 앱은 그대로 동작한다 — 막히는 것은 `[동기화]` 하나뿐이다 */
  expiresAt: number | null;
};

export type SessionValue = {
  status: SessionStatus;
  user: SessionUser | null;
  signIn: (email: string, password: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  /** 로그인·동기화 뒤 저장된 세션을 다시 읽는다 */
  refreshFromStorage: () => void;
};

const Ctx = createContext<SessionValue | null>(null);

/** 저장된 값은 믿지 않는다 — 형식이 어긋나면 "세션 없음"으로 본다 */
function parseStoredSession(raw: string | null): SessionUser | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return null;
    const s = v as { expires_at?: unknown; user?: { id?: unknown; email?: unknown } };
    const id = s.user?.id;
    if (typeof id !== 'string' || id === '') return null;
    const email = typeof s.user?.email === 'string' ? s.user.email : '';
    const expiresAt = typeof s.expires_at === 'number' ? s.expires_at * 1000 : null;
    return { userId: id, email, expiresAt };
  } catch {
    return null;
  }
}

export async function readLocalSession(): Promise<SessionUser | null> {
  if (!isSupabaseConfigured()) return null;
  return parseStoredSession(await readSessionItem(SB_STORAGE_KEY));
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>(() =>
    isSupabaseConfigured() ? 'LOADING' : 'DISABLED',
  );
  const [user, setUser] = useState<SessionUser | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let alive = true;
    // ⛔ 네트워크를 타지 않는다. meta KV 한 건 읽기가 전부다
    void readLocalSession().then((u) => {
      if (!alive) return;
      setUser(u);
      setStatus(u ? 'SIGNED_IN' : 'SIGNED_OUT');
    });
    return () => {
      alive = false;
    };
  }, [tick]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<{ ok: true } | { ok: false; message: string }> => {
      const sb = getSupabase();
      if (!sb) return { ok: false, message: '서버 연결 정보가 설정되지 않았습니다' };
      try {
        const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (error) return { ok: false, message: describeAuthError(error.message) };
        if (!data.session) return { ok: false, message: '로그인에 실패했습니다' };
        setUser({
          userId: data.session.user.id,
          email: data.session.user.email ?? email.trim(),
          expiresAt: data.session.expires_at ? data.session.expires_at * 1000 : null,
        });
        setStatus('SIGNED_IN');
        return { ok: true };
      } catch (e) {
        // 네트워크가 없으면 여기로 온다. **최초 1회 로그인은 온라인이어야 한다**(§3-4)
        return {
          ok: false,
          message:
            e instanceof Error && /fetch|network/i.test(e.message)
              ? '서버에 연결할 수 없습니다. 네트워크를 확인해 주세요'
              : '로그인 중 오류가 발생했습니다',
        };
      }
    },
    [],
  );

  const value = useMemo<SessionValue>(
    () => ({ status, user, signIn, refreshFromStorage: () => setTick((v) => v + 1) }),
    [status, user, signIn],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Supabase 의 영문 메시지를 그대로 보여주지 않는다 */
function describeAuthError(raw: string): string {
  if (/invalid login credentials/i.test(raw)) return '이메일 또는 비밀번호가 맞지 않습니다';
  if (/email not confirmed/i.test(raw)) return '아직 확인되지 않은 계정입니다';
  if (/rate limit|too many/i.test(raw)) return '시도가 너무 잦습니다. 잠시 후 다시 시도해 주세요';
  return `로그인하지 못했습니다 — ${raw}`;
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('SessionProvider 안에서만 쓸 수 있습니다');
  return v;
}
