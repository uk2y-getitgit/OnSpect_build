-- 초대코드 가입 — D53(가입 화면 신설, D39 뒤집음) · D54(다회용+만료일 옵션)
-- · D55(관리자용 발급 화면) · D56(가입자는 항상 MEMBER)
-- 근거: _workspace/88_leader_spec_InviteSignup0908.md
--
-- 설계: **서버리스 함수를 새로 만들지 않는다(D40 유지).** service role 키도 클라이언트에
-- 등장하지 않는다. 팀 합류는 DB 트리거(SECURITY DEFINER)가 RLS 를 우회해 대신 처리한다 —
-- `apps/web/api/team/*` 같은 별도 API 서버가 없어도 되는 이유가 여기 있다.
--
-- ⚠️ 이 스크립트는 몇 번을 다시 실행해도 안전하다(idempotent) — init.sql 과 같은 관례.

-- ── 팀장(OWNER) 판별 헬퍼 — my_team_id() 와 같은 패턴 ───────────────────────
create or replace function is_team_owner() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from team_members
    where user_id = auth.uid() and active and role = 'OWNER'
  )
$$;

-- ── 초대코드 ────────────────────────────────────────────────────────────
create table if not exists invite_codes (
  code text primary key,                                   -- 사람이 손으로 옮겨 적는 8자 코드
  team_id uuid not null references teams (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz,                                   -- null = 무기한 (D54)
  max_uses integer,                                         -- null = 무제한 (지금 UI 는 항상 null 로 만든다 — D54 "다회용")
  uses_count integer not null default 0,
  revoked boolean not null default false
);

create index if not exists invite_codes_team_idx on invite_codes (team_id);

alter table invite_codes enable row level security;

-- 팀장만 보고·발급·취소할 수 있다(D55 "관리자용 화면") — 팀원은 RLS 가 조용히 빈 목록을 준다
drop policy if exists invite_codes_select on invite_codes;
create policy invite_codes_select on invite_codes for select
  using (team_id = my_team_id() and is_team_owner());

drop policy if exists invite_codes_write on invite_codes;
create policy invite_codes_write on invite_codes for insert with check (
  team_id = my_team_id() and is_team_owner() and created_by = auth.uid()
);

drop policy if exists invite_codes_update on invite_codes;
create policy invite_codes_update on invite_codes for update using (
  team_id = my_team_id() and is_team_owner()
);

-- ── 가입 전 미리 검사(anon 허용) — 실제 가입(트리거)이 최종 판정이고, 이건 UX 용 사전 확인 ──
create or replace function check_invite_code(p_code text) returns table(team_name text)
  language sql stable security definer set search_path = public as $$
  select t.name from invite_codes i join teams t on t.id = i.team_id
  where i.code = p_code
    and not i.revoked
    and (i.expires_at is null or i.expires_at > now())
    and (i.max_uses is null or i.uses_count < i.max_uses)
$$;

grant execute on function check_invite_code(text) to anon, authenticated;

-- ── 가입 시 자동 팀 합류 — auth.users 트리거 ────────────────────────────────
-- SECURITY DEFINER 라 RLS(팀원 아니면 team_members insert 불가)를 우회해서 실행된다.
-- 여기서 코드가 무효하면 예외를 던져 **가입 자체를 롤백**한다 — team 없는 auth 계정이
-- 남는 사고를 막는다(클라이언트는 이 트리거보다 먼저 check_invite_code 로 한 번 더 확인한다).
create or replace function handle_new_user_invite() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_invite invite_codes%rowtype;
  v_login_id text;
  v_display_name text;
begin
  v_code := new.raw_user_meta_data ->> 'invite_code';
  if v_code is null or v_code = '' then
    raise exception '초대코드가 필요합니다';
  end if;

  select * into v_invite from invite_codes where code = v_code for update;
  if not found then
    raise exception '초대코드를 찾을 수 없습니다';
  end if;
  if v_invite.revoked then
    raise exception '이 초대코드는 취소되었습니다';
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at <= now() then
    raise exception '이 초대코드는 만료되었습니다';
  end if;
  if v_invite.max_uses is not null and v_invite.uses_count >= v_invite.max_uses then
    raise exception '이 초대코드는 이미 다 사용되었습니다';
  end if;

  v_display_name := coalesce(nullif(split_part(new.email, '@', 1), ''), '팀원');
  -- login_id 는 unique 라 이메일 로컬파트만으로는 부족할 수 있다(같은 로컬파트, 다른 도메인) —
  -- user id 앞 8자를 붙여 충돌을 원천적으로 막는다. 화면에 노출되는 값이 아니다(D56).
  v_login_id := v_display_name || '-' || substr(new.id::text, 1, 8);

  insert into team_members (user_id, team_id, login_id, display_name, role, active)
  values (new.id, v_invite.team_id, v_login_id, v_display_name, 'MEMBER', true); -- D56 — 항상 MEMBER

  update invite_codes set uses_count = uses_count + 1 where code = v_code;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_invite on auth.users;
create trigger on_auth_user_created_invite
  after insert on auth.users
  for each row execute function handle_new_user_invite();
