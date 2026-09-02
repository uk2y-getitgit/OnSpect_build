-- Phase 5 트랙1 — 팀 동기화 서버 초기 스키마
-- 근거: _workspace/50_plan-reviewer_spec_Phase5_TeamSync.md §3-6, DECISIONS.md D23~D25
--
-- 설계 원칙 (S1~S6, 스펙 §3-6): 서버는 저장소일 뿐이다 — payload 를 해석하지 않고,
-- 번호·면적·정렬 등 어떤 파생값도 계산하지 않는다. id 는 전부 클라이언트가 만든 uuid.

-- ── 팀 (D24 — 팀=조직 1계층. team_members.user_id 가 PK 라 사용자당 팀 1개) ──────
create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table team_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  team_id uuid not null references teams (id) on delete cascade,
  login_id text not null unique, -- 팀장이 발급하는 아이디 (사용자 확인 — 이메일 아님)
  display_name text not null,
  role text not null check (role in ('OWNER', 'MEMBER')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 팀당 OWNER(팀장)는 정확히 1인만 허용
create unique index team_members_one_owner on team_members (team_id) where role = 'OWNER';

-- ── 프로젝트 (D24 — 팀 소유, 팀원 전체 공개. 담당 배정 없음) ────────────────────
create table projects (
  id uuid primary key,          -- 로컬 Project.id 를 그대로 쓴다 (S6)
  team_id uuid not null references teams (id) on delete cascade,
  updated_at bigint not null,   -- 로컬 epoch ms 를 그대로 (D23)
  deleted_at bigint,
  payload jsonb not null        -- Project 레코드 전체 (S2 — 서버는 해석하지 않는다)
);

create index projects_team_idx on projects (team_id);

-- ── 결함·도면 등 레코드 (D23 병합필드 + D25 삭제전파의 서버측 대응) ──────────────
create table records (
  project_id uuid not null references projects (id) on delete cascade,
  kind text not null check (kind in ('BUILDING', 'FLOOR', 'DRAWING', 'DEFECT', 'PHOTO', 'MEMO')),
  id uuid not null,
  updated_at bigint not null,   -- D23 — "먼저 올린 쪽이 원본" LWW 병합 기준
  device_id text not null,
  deleted_at bigint,            -- D25 — 로컬은 meta KV 로그로 관리하지만 서버는 새 DB라
                                 --        제약 없이 정식 컬럼으로 둔다 (전파 대상)
  payload jsonb not null,
  server_seq bigint generated always as identity, -- pull 커서
  primary key (project_id, kind, id)
);

create index records_pull_cursor_idx on records (project_id, server_seq);

-- ── Blob 메타 (실 바이트는 Storage 버킷 blobs/{teamId}/{projectId}/{key}) ──────
create table blobs (
  key text primary key,        -- 로컬 blobKey 그대로 (uuid 라 기기 간 충돌 없음, S6)
  project_id uuid not null references projects (id) on delete cascade,
  byte_size bigint not null,
  content_type text not null,
  uploaded_at bigint not null
);

create index blobs_project_idx on blobs (project_id);

-- ── RLS — S5: records·blobs 는 projects.team_id 가 내 팀일 때만 보인다 ─────────
alter table teams enable row level security;
alter table team_members enable row level security;
alter table projects enable row level security;
alter table records enable row level security;
alter table blobs enable row level security;

-- 내 팀 id (team_members.user_id 가 PK 라 사용자당 최대 1행)
create function my_team_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select team_id from team_members where user_id = auth.uid() and active
$$;

create policy teams_select on teams for select
  using (id = my_team_id());

create policy team_members_select on team_members for select
  using (team_id = my_team_id());

-- 팀원 발급·해제는 팀장(OWNER)만 — apps/web/api/team/* 가 service role 로 대신 처리하므로
-- 일반 사용자 쓰기 정책은 select 만 둔다(발급 API는 RLS 를 우회하는 service role 키를 쓴다)

create policy projects_select on projects for select
  using (team_id = my_team_id());
create policy projects_write on projects for insert with check (team_id = my_team_id());
create policy projects_update on projects for update using (team_id = my_team_id());

create policy records_select on records for select
  using (project_id in (select id from projects where team_id = my_team_id()));
create policy records_write on records for insert with check (
  project_id in (select id from projects where team_id = my_team_id())
);
create policy records_update on records for update using (
  project_id in (select id from projects where team_id = my_team_id())
);

create policy blobs_select on blobs for select
  using (project_id in (select id from projects where team_id = my_team_id()));
create policy blobs_write on blobs for insert with check (
  project_id in (select id from projects where team_id = my_team_id())
);
