/**
 * 로그인 세션 — Phase 5 트랙1 L2 (스펙 §3-4 · 스코프 L2).
 *
 * 규칙 세 줄이 전부다.
 *   · 세션이 **있으면** 로그인 화면을 건너뛴다. 토큰이 만료됐어도 앱은 전부 정상 동작한다
 *     (결함 입력 · 사진 · 캔버스 · 출력은 전부 로컬이라 토큰이 필요 없다)
 *   · 세션이 **아예 없을 때만** 로그인 화면을 띄운다
 *   · 로그아웃은 **로컬 세션만 지운다**(D57 — D26 뒤집음. 초대코드로 한 기기를 여러 계정이
 *     오가게 되면서 로그아웃이 필요해졌다). 저장된 용역 데이터는 안 지운다 — `signOut` 주석 참고
 *
 * D53 — **가입(초대코드)도 이 파일이 담당한다.** `signIn` 과 나란히 `signUp` 을 뒀다 —
 * 둘 다 "성공하면 세션을 즉시 채운다"는 같은 계약이라 화면(`Login.tsx`)이 결과를 똑같이 다룬다.
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
import { normalizeInviteCode } from '@onspect/project-core';
import {
  getSupabase,
  isSupabaseConfigured,
  readSessionItem,
  removeSessionItem,
  SB_STORAGE_KEY,
} from './supabaseClient.js';

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
  /** D53 — 초대코드 가입. 이메일 확인이 켜져 있으면 `needsEmailConfirm: true` 로 온다(세션 없음) */
  signUp: (
    email: string,
    password: string,
    inviteCode: string,
  ) => Promise<{ ok: true; needsEmailConfirm: boolean } | { ok: false; message: string }>;
  /** D57 — 로그아웃. 로컬 용역 데이터는 지우지 않는다(그건 `[로컬 데이터 초기화]`의 몫) */
  signOut: () => Promise<void>;
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

  /**
   * D53 — 초대코드 가입. 두 단계다.
   *   1) `check_invite_code` 로 **미리** 검사한다(anon 허용, RPC). 대부분의 오타·만료 코드는
   *      여기서 걸러져, 쓸모없는 auth 계정을 만들지 않고 바로 알려줄 수 있다.
   *   2) `auth.signUp` — `options.data.invite_code` 로 코드를 함께 보낸다. **최종 판정은
   *      서버의 `handle_new_user_invite` 트리거**다(1)과 2) 사이에 코드가 소진/만료되는
   *      드문 경합도 트리거가 막는다). 트리거가 예외를 던지면 가입 자체가 롤백된다 —
   *      원문이 그대로 오는지 확신 못 해(U87) 한동안 전부 일반화된 안내 문구로 덮어버렸는데,
   *      2026-09-09 실측(Supabase Auth API 직접 호출)으로 트리거의 한글 예외 메시지가
   *      `error.message` 에 그대로 온다는 게 확인됐다 — 이미 사람이 읽을 문장이니
   *      `describeSignUpError` 에서 그대로 보여준다. 진짜 뭉뚱그릴 대상은 그 외의 미분류 오류뿐.
   */
  const signUp = useCallback(
    async (
      email: string,
      password: string,
      inviteCode: string,
    ): Promise<{ ok: true; needsEmailConfirm: boolean } | { ok: false; message: string }> => {
      const sb = getSupabase();
      if (!sb) return { ok: false, message: '서버 연결 정보가 설정되지 않았습니다' };
      // 코드는 대문자+숫자만으로 만들어진다(`generateInviteCode`) — 사람이 소문자로 옮겨 적어도
      // 통과하도록 여기서 정규화한다. 대소문자를 구분해 비교하는 건 DB 쪽(`code = p_code`)이다
      const code = normalizeInviteCode(inviteCode);
      if (code === '') return { ok: false, message: '초대코드를 입력해 주세요' };
      try {
        const { data: checked, error: checkError } = await sb.rpc('check_invite_code', {
          p_code: code,
        });
        if (checkError || !checked || checked.length === 0) {
          return { ok: false, message: '초대코드를 확인할 수 없습니다. 코드가 맞는지 다시 확인해 주세요' };
        }
        const { data, error } = await sb.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { invite_code: code } },
        });
        if (error) return { ok: false, message: describeSignUpError(error.message) };
        if (data.session) {
          setUser({
            userId: data.session.user.id,
            email: data.session.user.email ?? email.trim(),
            expiresAt: data.session.expires_at ? data.session.expires_at * 1000 : null,
          });
          setStatus('SIGNED_IN');
          return { ok: true, needsEmailConfirm: false };
        }
        return { ok: true, needsEmailConfirm: true };
      } catch (e) {
        return {
          ok: false,
          message:
            e instanceof Error && /fetch|network/i.test(e.message)
              ? '서버에 연결할 수 없습니다. 네트워크를 확인해 주세요'
              : '가입 중 오류가 발생했습니다',
        };
      }
    },
    [],
  );

  /**
   * D57 — 로그아웃. `sb.auth.signOut()` 을 부르지 않는다 — §3-4 의 게이트와 같은 이유다.
   * auth-js 의 `signOut()` 은 내부적으로 세션을 다시 읽는 경로(`_useSession`)를 타는데, 그
   * 경로는 저장된 토큰이 만료돼 있으면 네트워크로 갱신을 시도한다(`readLocalSession` 위
   * 주석 참고). 오프라인에서 로그아웃 버튼이 멎으면 안 되니, **로컬 저장소만 직접 지운다.**
   * 서버 쪽 refresh token 은 만료될 때까지 살아 있지만, 어차피 이 앱은 그 토큰을 다시
   * 쓰지 않는다(재로그인은 항상 새 `signInWithPassword`).
   *
   * ⚠️ **로컬 용역 데이터는 지우지 않는다.** 이 기기의 IndexedDB 는 계정별로 나뉘어 있지
   * 않아서, 로그아웃 후 다른 계정으로 들어가면 이전 계정이 캐시해둔 용역이 목록에 그대로
   * 보일 수 있다(다른 팀 소속이면 `[동기화]`가 권한 오류로 막힌다 — 서버 데이터가 섞이진
   * 않는다, RLS). 완전히 갈아치우려면 여전히 `[로컬 데이터 초기화]`를 따로 눌러야 한다.
   */
  const signOut = useCallback(async () => {
    await removeSessionItem(SB_STORAGE_KEY);
    setUser(null);
    setStatus('SIGNED_OUT');
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ status, user, signIn, signUp, signOut, refreshFromStorage: () => setTick((v) => v + 1) }),
    [status, user, signIn, signUp, signOut],
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

/** 가입 전용 — 초대코드 트리거 예외까지 포함해 전부 사람이 읽을 말로 바꾼다 */
function describeSignUpError(raw: string): string {
  if (/already registered|user already exists/i.test(raw)) return '이미 가입된 이메일입니다';
  // Auth 레벨에서 이메일 자체를 거부한 경우(예: `email_address_invalid`) — 트리거와 무관하니
  // 초대코드 탓으로 보이는 fallback 문구로 흡수되면 안 된다. 트리거보다 먼저 걸러낸다
  if (/email.*invalid|invalid.*email/i.test(raw)) return '이메일 주소 형식을 확인해 주세요';
  if (/password/i.test(raw)) return '비밀번호가 너무 짧습니다(6자 이상)';
  if (/rate limit|too many/i.test(raw)) return '시도가 너무 잦습니다. 잠시 후 다시 시도해 주세요';
  // `handle_new_user_invite` 트리거가 던진 예외 — 5종 전부 "초대코드"를 담은 한글 문장이라
  // (20260908000000_invite_codes.sql) 원문 그대로 보여줘도 된다(실측 확인, 위 주석 참조)
  if (/초대코드/.test(raw)) return raw;
  // 그 외 미분류 오류만 여기로 온다 — 더는 "초대코드 탓"으로 단정하지 않는다
  return '가입에 실패했습니다. 잠시 후 다시 시도해 주세요';
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('SessionProvider 안에서만 쓸 수 있습니다');
  return v;
}
