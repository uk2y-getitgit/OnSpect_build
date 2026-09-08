/**
 * 로그인 · 가입 화면 — Phase 5 트랙1 L2(스펙 §3-4) + D53(초대코드 가입).
 *
 * **세션이 아예 없을 때만** 뜬다. 한 번 로그인하면 토큰이 만료돼도 다시 뜨지 않는다.
 * 계정 생성은 **초대코드가 있어야만** 된다(D53 — D39 "가입 화면 없음"을 뒤집었다. 대신
 * 초대코드 없이는 아무나 가입할 수 없으니 "관리자가 계정을 만들어준다"는 원래 취지는
 * 유지된다 — 발급 주체가 대시보드에서 앱 안(`팀 관리`, D55)으로 옮겨졌을 뿐이다).
 * 비밀번호 재설정 링크는 여전히 없다 — 메일 경로를 쓰지 않는 제품이다(§3-3).
 */
import { useState, type FormEvent } from 'react';
import { useSession } from '../data/session';
import { BusyButton, Field } from '../ui/Form';

type Mode = 'SIGN_IN' | 'SIGN_UP';

export function Login() {
  const { signIn, signUp } = useSession();
  const [mode, setMode] = useState<Mode>('SIGN_IN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 가입 성공 + 이메일 확인 대기 상태 — 이 문구를 보여주는 동안은 로그인 폼으로 되돌아간다 */
  const [signedUpPendingEmail, setSignedUpPendingEmail] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setSignedUpPendingEmail(false);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (email.trim() === '' || password === '') {
      setError('이메일과 비밀번호를 입력해 주세요');
      return;
    }
    if (mode === 'SIGN_UP' && inviteCode.trim() === '') {
      setError('초대코드를 입력해 주세요');
      return;
    }
    setBusy(true);
    setError(null);
    if (mode === 'SIGN_IN') {
      const r = await signIn(email, password);
      setBusy(false);
      if (!r.ok) setError(r.message);
      return;
    }
    const r = await signUp(email, password, inviteCode);
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    if (r.needsEmailConfirm) {
      setSignedUpPendingEmail(true);
      setMode('SIGN_IN');
      setPassword('');
      setInviteCode('');
    }
    // needsEmailConfirm 이 false 면 세션이 이미 채워져 있다 — 화면이 자동으로 넘어간다
  };

  return (
    <div className="login">
      <form className="login__card" onSubmit={(e) => void submit(e)}>
        <h1 className="login__title">OnSpect</h1>

        {mode === 'SIGN_IN' ? (
          <p className="login__lead">
            이 기기에서 처음 한 번만 로그인하면 됩니다. 이후에는 네트워크가 없어도 앱이 그대로
            열립니다.
          </p>
        ) : (
          <p className="login__lead">
            팀장에게 받은 초대코드로 가입합니다. 가입하면 그 팀의 모든 용역을 볼 수 있습니다.
          </p>
        )}

        {signedUpPendingEmail && (
          <p className="login__note login__note--ok" role="status">
            가입 신청을 받았습니다. 이메일을 확인한 뒤 로그인해 주세요.
          </p>
        )}

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
              autoComplete={mode === 'SIGN_IN' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>

        {mode === 'SIGN_UP' && (
          <Field label="초대코드" required hint="팀장에게 받은 8자 코드">
            {({ id }) => (
              <input
                id={id}
                className="input"
                type="text"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
              />
            )}
          </Field>
        )}

        <BusyButton busy={busy} className="btn btn--primary login__submit" type="submit">
          {mode === 'SIGN_IN' ? '로그인' : '가입'}
        </BusyButton>

        {mode === 'SIGN_IN' ? (
          <p className="login__note">
            계정이 없으신가요?{' '}
            <button type="button" className="linkbtn" onClick={() => switchMode('SIGN_UP')}>
              초대코드로 가입
            </button>
            . 비밀번호를 잊었다면 관리자에게 재발급을 요청하세요.
          </p>
        ) : (
          <p className="login__note">
            이미 계정이 있으신가요?{' '}
            <button type="button" className="linkbtn" onClick={() => switchMode('SIGN_IN')}>
              로그인으로
            </button>
          </p>
        )}
      </form>
    </div>
  );
}
