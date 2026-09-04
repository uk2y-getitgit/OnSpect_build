# 스코프 — 개인 로그인 + 동기화 (2026-09-04)

리더가 직접 확정. `_workspace/50_plan-reviewer_spec_Phase5_TeamSync.md` §3-3~3-7,
D22~D26·D39·D40 이 이미 답을 갖고 있어 plan-reviewer 재소집 없이 이 문서로 착수한다.

## 이미 끝난 것 (재작업 금지)

- 서버 스키마 + RLS + Storage 버킷 적용 완료(`supabase/migrations/*.sql`, T1-1)
- `Defect` 병합필드(`updatedAt`·`deviceId`·`createdBy`, D23, T1-2) — canvas-core 완료
- 삭제 전파 로그(`meta` KV `deleted:{projectId}`, D25, T1-3) — 9개 하드삭제 경로 배선 완료

## 이번 라운드 범위

개인 계정 1개 · 이메일+비밀번호 로그인 · 프로젝트별 `[동기화]` 버튼(push/pull).
팀원 발급 API·팀 관리 화면·합성 이메일 로그인은 **범위 밖**(D39).

## 아키텍처 — client-side Supabase SDK + RLS. 서버리스 함수 0개

D39·D40에 따라 `apps/web/api/*` 를 만들지 않는다. `@supabase/supabase-js` 를 클라이언트에 직접 배선하고,
RLS(`my_team_id()`)가 팀 격리를 강제한다. service_role 은 이번 라운드에 등장하지 않는다
(다음 "정식 서버" 라운드에서 팀원 발급 API에 처음 쓰인다 — 지금 코드 어디에도 넣지 않는다).

## L1 — Supabase 클라이언트 배선

- `apps/web/package.json` 에 `@supabase/supabase-js` 추가
- `apps/web/src/data/supabaseClient.ts` 신설
  - `createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { storage: metaKvStorage, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false } })`
  - `storage` 어댑터는 **새 IndexedDB 스토어를 만들지 않는다** — `apps/web/src/data/idb/lastView.ts` 와
    같은 수법으로 `meta` KV 를 재사용한다(`STORE.meta`, key 접두어 `sbSession:`). `getItem`/`setItem`/`removeItem`
    3개만 구현하면 된다(Supabase 스토리지 어댑터 인터페이스). DB 핸들은 `openDb()` 로 얻는다
  - `autoRefreshToken: false` 는 §3-4 오프라인 로그인 규칙의 핵심이다 — 앱 시작 시 토큰 갱신을
    저절로 시도하지 않는다. 갱신은 `[동기화]` 를 누른 순간에만(수동으로 `supabase.auth.refreshSession()`
    또는 동기화 첫 API 호출이 자연히 트리거하는 것) 일어난다
  - `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` 는 이미 `.env.example` 에 있다(값은 `.env.local`)

## L2 — 로그인 화면 + 오프라인 로그인 규칙

- 세션 존재 여부는 `supabase.auth.getSession()`(로컬 스토리지만 읽고 네트워크를 타지 않는다 —
  Supabase SDK 기본 동작. `autoRefreshToken:false` 라 만료돼도 백그라운드로 갱신을 시도하지 않는다)
- 세션이 있으면 → 로그인 화면을 건너뛰고 바로 기존 화면(`ProjectList` 등)
- 세션이 없을 때만 → 로그인 화면(이메일+비밀번호 입력, `supabase.auth.signInWithPassword()`)
- 로그아웃 버튼은 **만들지 않는다**(D26 — 1기기=1사용자, 계정 전환은 설정의
  `[로컬 데이터 초기화]`로). 이미 있는 그 버튼 옆에 "로그인 계정: {email}" 정도만 표시해도 된다(선택)
- 로그인 화면 자리는 `App.tsx`/`router.ts` 에 새 라우트를 추가하지 말고, `Shell` 안에서
  세션 없음일 때 기존 라우트 트리 대신 렌더하는 방식을 권장(기존 `route.name === 'EXPORT_PRINT'` 이른
  return 패턴과 동일한 자리)

## L3·L4 — 동기화 (push/pull)

`apps/web/src/data/sync.ts`(신설) 하나로 묶어도 된다. 대상 3-5 표 그대로:

- 동기화: `Project`·`Building`·`Floor`·`Drawing`·`Defect`·`Photo`(레코드)·`Memo`,
  Blob(도면 render+thumb, 사진 render+thumb 전부 — Q60 결론대로 원본(`sourceBlobKey`)은 **올리지 않는다**,
  `supabase/migrations/20260903000000_storage.sql` 주석이 이미 그렇게 확정했다)
- 비동기화: `ItemSettings`·`ExportRun`·`meta` 의 기기 로컬 키(`deviceId`·`lastView:*`·`offline:*`·`sync:*`)
- **push**: `updatedAt > sync.lastPushedAt` 인 레코드(Defect 는 D23 병합필드로 이미 가능) + `deleted:{projectId}`
  로그의 미전송 삭제 항목을 모아 `records`/`projects` 테이블에 upsert. Blob 은 Storage 에 없는 key 만 업로드
  (`blobs/{teamId}/{projectId}/{key}` 경로, RLS 의 `my_team_id()` 가 첫 경로조각을 강제하므로 그대로 맞춘다)
- **pull**: `records`(및 `projects`) 를 `server_seq > sync.cursor` 로 조회 → 레코드 단위 LWW로 IndexedDB에 적용
  (스펙 §3-7 표 그대로 — 레코드 단위 트랜잭션, 필드 병합 금지, 진 쪽은 `syncConflict:{projectId}` 에 최근 50건)
- `sync.cursor`/`lastPushedAt`/`lastSyncedAt`/`pendingCount`/`lastResult`/`lastMessage` 는 `meta` KV
  `sync:{projectId}` 하나로 관리(§3-7 그대로, 새 스토어 없음)
- **팀 소속 확인** — 이 계정이 어느 `team_id` 에 속하는지는 클라이언트가 `team_members` 를 1행 select
  해서 얻는다(RLS `team_members_select` 정책이 이미 자기 행을 허용한다). `Project.orgId` 를 그 `team_id` 로
  채워 push 한다(D24 — 로컬 스키마 무변경, 이미 있는 필드)
- 자동/백그라운드 동기화 절대 금지(§3-7 규칙 0). `[동기화]` 버튼 클릭 시에만 네트워크

## L5 — `[동기화]` 버튼 UI

- `ProjectList.tsx` 또는 프로젝트 상세 진입점에 프로젝트별 버튼 하나
- 상태 표시: 진행 중 · 완료(`{n}건 반영`) · 부분 실패 · 실패(`실패 · 다시 시도` 버튼, 지수 백오프 금지)
- 충돌 발생 시 "충돌 {n}건 · 상대 값으로 덮였습니다 [보기]" — 조용히 덮지 않는다

## 사전 준비 — 리더가 사용자에게 안내할 수동 단계 (앱 코드 아님)

D39: "계정 생성 화면 없음, Supabase 대시보드에서 수동 생성"인데, **RLS 가 통과하려면
`teams`·`team_members` 행도 있어야 한다**(스키마상 auth 계정만으로는 `my_team_id()` 가 null).
이건 앱 코드가 아니라 **1회성 운영 작업**이므로 builder 산출물에 포함하지 않고, 리더가
Supabase SQL Editor 에서 실행할 스니펫을 최종 보고에 함께 제공한다(사용자의 이메일로 가입한
`auth.users.id` 를 알아야 하므로 계정 생성 이후 순서):

```sql
insert into teams (name, slug) values ('개인테스트', 'personal-test') returning id;
-- 위에서 나온 id 와, Supabase Auth 대시보드에서 확인한 사용자 uuid 를 아래에 채운다
insert into team_members (user_id, team_id, login_id, display_name, role, active)
values ('<auth.users.id>', '<teams.id>', 'me', '테스트 계정', 'OWNER', true);
```

## 검수 중점 (code-reviewer)

- `SUPABASE_SERVICE_ROLE_KEY` 문자열이 `apps/web` 어디에도 등장하지 않는지(그런 코드를 만들지 않았으므로
  당연히 없어야 하지만, service_role 언급 자체가 실수로 들어갔는지 확인)
- `autoRefreshToken:false` 가 실제로 배선됐는지, 앱 시작 경로에서 토큰 갱신을 트리거하는 코드가 없는지
- push/pull 이 정말 `[동기화]` 버튼 클릭에서만 발생하는지(useEffect 자동 트리거 없는지)
- 필드 병합 코드가 실수로 들어가지 않았는지(레코드 통째 승패만 있어야 한다)
- `Blob` 이 `sourceBlobKey` 를 pull/push 대상에 넣지 않았는지
