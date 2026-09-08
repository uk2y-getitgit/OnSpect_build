/**
 * `#/team` — 팀 관리(초대코드 발급/조회/취소) — D53 가입 화면과 함께 도입, D55.
 *
 * **팀장(OWNER)만 실제로 관리할 수 있다.** 서버가 이미 강제한다 — `invite_codes` 의
 * select/insert/update RLS 가 전부 `is_team_owner()` 를 요구하므로, 팀원(MEMBER)이 이
 * 화면에 들어와도 서버는 빈 목록을 준다(에러가 아니다). 화면은 역할을 먼저 물어 안내
 * 문구로만 구분한다 — 화면단 권한 체크가 실제 방어선이 아니라는 뜻이다.
 *
 * ⭐ 이 화면의 조회는 `[동기화]`(규칙 0, D39)가 막는 대상이 아니다 — 규칙 0 은 **용역 데이터의
 *    자동 반영**을 막는 것이고, 여기는 계정 관리 화면이라 방문하면 곧바로 불러온다(다른
 *    "화면 진입 시 자동 조회" 사례: 없음 — 이 화면이 첫 예외. `RemoteProjectsButton`/
 *    `SyncButton` 은 여전히 명시적 클릭에서만 통신한다).
 */
import { useCallback, useEffect, useState } from 'react';
import { generateInviteCode } from '@onspect/project-core';
import { useSession } from '../data/session';
import { getSupabase } from '../data/supabaseClient';
import { navigate } from '../router';
import { BusyButton } from '../ui/Form';
import { ConfirmDialog } from '../ui/Overlays';
import { useToast } from '../ui/ToastHost';

type InviteCodeRow = {
  code: string;
  created_at: string;
  expires_at: string | null;
  uses_count: number;
  revoked: boolean;
};

type Loaded =
  | { kind: 'LOADING' }
  | { kind: 'ERROR'; message: string }
  | { kind: 'MEMBER' }
  | { kind: 'OWNER'; teamId: string; codes: InviteCodeRow[] };

export function TeamRoute() {
  const { user } = useSession();
  const toast = useToast();
  const [state, setState] = useState<Loaded>({ kind: 'LOADING' });
  const [expiresInDays, setExpiresInDays] = useState('');
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = getSupabase();
    if (!sb || !user) {
      setState({ kind: 'ERROR', message: '로그인 정보를 확인할 수 없습니다' });
      return;
    }
    const { data: member, error: memberErr } = await sb
      .from('team_members')
      .select('role, team_id')
      .eq('user_id', user.userId)
      .maybeSingle();
    if (memberErr || !member) {
      setState({ kind: 'ERROR', message: '팀 정보를 불러오지 못했습니다' });
      return;
    }
    if (member.role !== 'OWNER') {
      setState({ kind: 'MEMBER' });
      return;
    }
    const { data: codes, error: codesErr } = await sb
      .from('invite_codes')
      .select('code, created_at, expires_at, uses_count, revoked')
      .order('created_at', { ascending: false });
    if (codesErr) {
      setState({ kind: 'ERROR', message: '초대코드 목록을 불러오지 못했습니다' });
      return;
    }
    setState({ kind: 'OWNER', teamId: member.team_id as string, codes: codes ?? [] });
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(async () => {
    if (state.kind !== 'OWNER' || !user || creating) return;
    const sb = getSupabase();
    if (!sb) return;
    setCreating(true);
    const days = expiresInDays.trim() === '' ? null : Number(expiresInDays);
    const expiresAt =
      days !== null && Number.isFinite(days) && days > 0
        ? new Date(Date.now() + days * 86_400_000).toISOString()
        : null;
    const code = generateInviteCode();
    const { error } = await sb.from('invite_codes').insert({
      code,
      team_id: state.teamId,
      created_by: user.userId,
      expires_at: expiresAt,
    });
    setCreating(false);
    if (error) {
      toast('초대코드를 만들지 못했습니다 — 잠시 후 다시 시도해 주세요', { kind: 'warn' });
      return;
    }
    setExpiresInDays('');
    toast(`초대코드 ${code} 를 만들었습니다`);
    void load();
  }, [creating, expiresInDays, load, state, toast, user]);

  const revoke = useCallback(
    async (code: string) => {
      const sb = getSupabase();
      if (!sb) return;
      setRevoking(null);
      const { error } = await sb.from('invite_codes').update({ revoked: true }).eq('code', code);
      if (error) {
        toast('취소하지 못했습니다 — 잠시 후 다시 시도해 주세요', { kind: 'warn' });
        return;
      }
      toast(`초대코드 ${code} 를 취소했습니다`);
      void load();
    },
    [load, toast],
  );

  const copy = useCallback(
    (code: string) => {
      void navigator.clipboard?.writeText(code).then(
        () => toast('복사했습니다'),
        () => toast('복사하지 못했습니다 — 직접 선택해 옮겨주세요', { kind: 'warn' }),
      );
    },
    [toast],
  );

  return (
    <div className="page page--team">
      <div className="page__head">
        <div className="page__headMain">
          <h1 className="page__title">팀 관리</h1>
        </div>
        <div className="page__actions">
          <button type="button" className="btn" onClick={() => navigate({ name: 'LIST' })}>
            닫기
          </button>
        </div>
      </div>

      {state.kind === 'LOADING' && <p className="muted">불러오는 중…</p>}
      {state.kind === 'ERROR' && <p className="notice notice--warn">{state.message}</p>}
      {state.kind === 'MEMBER' && (
        <p className="notice">
          이 팀의 팀원입니다. 초대코드 발급·취소는 팀장만 할 수 있습니다.
        </p>
      )}

      {state.kind === 'OWNER' && (
        <>
          <p className="set-lead">
            아래 코드를 팀원에게 전달하면, 가입 화면에서 이메일·비밀번호와 함께 입력해 이 팀에
            합류합니다. 코드 하나를 여러 명이 함께 쓸 수 있습니다.
          </p>

          <div className="team-create">
            <label className="field__label" htmlFor="team-expires">
              만료일(선택)
            </label>
            <input
              id="team-expires"
              className="input team-create__days"
              type="number"
              min={1}
              placeholder="비우면 무기한"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
            />
            <span className="muted">일 후 만료</span>
            <BusyButton busy={creating} className="btn btn--primary" onClick={() => void create()}>
              초대코드 만들기
            </BusyButton>
          </div>

          {state.codes.length === 0 ? (
            <p className="muted">아직 만든 초대코드가 없습니다.</p>
          ) : (
            <ul className="rlist">
              {state.codes.map((c) => (
                <li key={c.code} className="rlist__row">
                  <span className="rlist__name team-code" title="눌러서 복사">
                    <button type="button" className="linkbtn team-code__btn" onClick={() => copy(c.code)}>
                      {c.code}
                    </button>
                  </span>
                  <span className="muted rlist__time">
                    사용 {c.uses_count}회
                    {c.expires_at ? ` · ${c.expires_at.slice(0, 10)} 만료` : ' · 무기한'}
                    {c.revoked ? ' · 취소됨' : ''}
                  </span>
                  {!c.revoked && (
                    <button
                      type="button"
                      className="btn btn--small"
                      onClick={() => setRevoking(c.code)}
                    >
                      취소
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {revoking && (
        <ConfirmDialog
          title="이 초대코드를 취소할까요?"
          body={
            <p>
              <b>{revoking}</b> 코드는 더 이상 가입에 쓸 수 없습니다. 이미 가입한 팀원은 그대로
              유지됩니다.
            </p>
          }
          confirmLabel="취소하기"
          onConfirm={() => void revoke(revoking)}
          onCancel={() => setRevoking(null)}
        />
      )}
    </div>
  );
}
