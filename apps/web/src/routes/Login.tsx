/**
 * 로그인 화면 — Phase 5 트랙1 L2 (스코프 L2 · 스펙 §3-4).
 *
 * **세션이 아예 없을 때만** 뜬다. 한 번 로그인하면 토큰이 만료돼도 다시 뜨지 않는다.
 * 계정 생성 화면은 **없다**(D39 — Supabase 대시보드에서 수동 생성).
 * 비밀번호 재설정 링크도 없다 — 메일 경로를 쓰지 않는 제품이다(§3-3).
 */
import { useState, type FormEvent } from 'react';
import { useSession } from '../data/session';
import { BusyButton, Field } from '../ui/Form';

export function Login() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (email.trim() === '' || password === '') {
      setError('이메일과 비밀번호를 입력해 주세요');
      return;
    }
    setBusy(true);
    setError(null);
    const r = await signIn(email, password);
    setBusy(false);
    if (!r.ok) setError(r.message);
  };

  return (
    <div className="login">
      <form className="login__card" onSubmit={(e) => void submit(e)}>
        <h1 className="login__title">OnSpect</h1>
        <p className="login__lead">
          이 기기에서 처음 한 번만 로그인하면 됩니다. 이후에는 네트워크가 없어도 앱이 그대로
          열립니다.
        </p>

        <Field label="이메일" required error={error}>
          {({ id, invalid, describedBy }) => (
            <input
              id={id}
              className="input"
              type="email"
              autoComplete="username"
              inputMode="email"
              autoCapitalize="off"
              spellCheck={false}
              value={email}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>

        <Field label="비밀번호" required>
          {({ id }) => (
            <input
              id={id}
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>

        <BusyButton busy={busy} className="btn btn--primary login__submit" type="submit">
          로그인
        </BusyButton>

        <p className="login__note">
          계정은 관리자가 만들어 드립니다. 비밀번호를 잊었다면 관리자에게 재발급을 요청하세요.
        </p>
      </form>
    </div>
  );
}
