# 구현 로그 — Phase 5 트랙1 · 개인 로그인 + 동기화 (2026-09-05)

스코프: `_workspace/70_scope_Phase5_PersonalLoginSync.md` (L1~L5)
근거: `50_plan-reviewer_spec_Phase5_TeamSync.md` §3-3~3-7 · D22~D26 · D39 · D40

---

## 완료

| 작업 | 파일 | 상태 |
|---|---|---|
| L1 · `@supabase/supabase-js` 추가 (2.115.0) | `apps/web/package.json` · `package-lock.json` | ✅ |
| L1 · Supabase 클라이언트 + `meta` KV 세션 스토리지 어댑터 | `apps/web/src/data/supabaseClient.ts` (신설) | ✅ |
| L1 · `.env.example` 주석 정정 (서버리스 함수 없음 · service_role 없음) | `apps/web/.env.example` | ✅ |
| L2 · 세션 컨텍스트(로컬 전용 판정) | `apps/web/src/data/session.tsx` (신설) | ✅ |
| L2 · 로그인 화면 | `apps/web/src/routes/Login.tsx` (신설) | ✅ |
| L2 · 게이트 배선 + 계정 표시(로그아웃 없음) | `apps/web/src/App.tsx` | ✅ |
| L3·L4 · push/pull 엔진 | `apps/web/src/data/sync.ts` (신설, 약 700줄) | ✅ |
| L3 · LWW 판정 순수함수 + 단위테스트 7건 | `packages/project-core/src/lww.ts` · `test/lww.test.ts` (신설) | ✅ |
| L5 · 프로젝트별 `[동기화]` 버튼 + 충돌 보기 모달 | `apps/web/src/routes/SyncButton.tsx` (신설) | ✅ |
| L5 · 목록 행에 버튼 배치 | `apps/web/src/routes/ProjectList.tsx` | ✅ |
| L5 · 스타일(동기화 · 충돌 · 로그인 · 계정) | `apps/web/src/styles.css` | ✅ |

---

## 어떻게 만들었나 — 핵심 결정 5개

### 1. 로그인 게이트가 **절대** 네트워크를 타지 않는다 (§3-4)

스코프는 `supabase.auth.getSession()` 으로 판정하라고 했다. 그런데 설치된
`@supabase/auth-js` 2.115 의 `__loadSession()` 소스를 읽어 보니, 저장된 토큰이 만료돼 있으면
**`autoRefreshToken` 값과 무관하게** `_callRefreshToken()`(네트워크)을 부른다:

```js
const hasExpired = currentSession.expires_at * 1000 - Date.now() < EXPIRY_MARGIN_MS;
if (!hasExpired) { ... return { data: { session: currentSession } } }
const { data: session, error } = await this._callRefreshToken(currentSession.refresh_token);
```

그대로 두면 "앱 시작 시 토큰 갱신을 자동으로 시도하지 않는다"(절대 규칙 3)가
라이브러리 안쪽에서 깨진다 — 현장에서 앱을 열 때마다 반쯤 살아 있는 네트워크에
요청이 매달린다. 그래서 **게이트는 우리가 쓴 `meta` KV 를 직접 읽는다**
(`session.tsx` 의 `readLocalSession`). 순수 로컬 연산이고 즉시 끝난다. (**ASSUMPTIONS U74**)

부수 효과로 하나 더 좋아졌다: `getSupabase()` 는 **로그인 버튼을 누르거나 동기화를 시작할 때
비로소 `createClient()` 를 호출한다.** 앱 시작 경로에는 Supabase 인스턴스조차 생기지 않는다.

`storageKey` 를 `'auth'` 로 **고정**했다(기본값 `sb-{projectRef}-auth-token`).
그래야 `meta` 키가 `sbSession:auth` 로 예측 가능해져 게이트가 직접 읽을 수 있다.

### 2. `records.server_seq` 는 pull 커서로 쓸 수 없다 → 색인 대조로 대체

`server_seq bigint generated always as identity` 는 **INSERT 때만** 값이 매겨진다.
`server_seq > cursor` 로 pull 하면 신규 레코드만 내려오고 **수정된 레코드는 영원히 안 내려온다.**
서버 스키마는 이번 라운드에서 건드리지 않기로 했으므로 클라이언트에서 우회했다:

```
1) select kind,id,updated_at,device_id,deleted_at  (payload 없음, 프로젝트당 1회)
2) 로컬과 대조 → 레코드마다 승패를 정한다
3) 서버가 이긴 것만 payload 를 마저 받는다
```

레코드당 약 60바이트라 5,000건이어도 300KB 남짓이고, **이 색인 하나가 push 가드까지 겸한다** —
서버가 더 최신인데 로컬이 덮어쓰는 사고를 원천 차단한다(서버리스 함수가 없어 서버가 LWW 판정을
못 해 주기 때문에 이 가드가 반드시 필요했다). → **Q76**(비차단) · **ASSUMPTIONS U75**

### 3. LWW 판정은 순수 함수 1개 (`project-core/lww.ts`)

push 가드와 pull 적용이 서로 다른 규칙을 쓰면 두 기기가 서로를 영원히 덮어쓰는 핑퐁이 난다.
`localWins(local, server)` 를 코어에 두고 **양쪽이 같은 함수를 부른다.**
단위 테스트에 "두 기기가 서로 반대 답을 내지 않는다"를 명시적으로 넣었다.

- `updatedAt` 큰 쪽 → 동률이면 `deviceId` 사전순 **큰** 쪽(U76, 방향은 임의지만 한 곳에서만 정의)
- 로컬 `updatedAt === null`(D23 옛 결함)이면 무조건 진다. 서버에 없을 때만 `Date.now()` 를
  부여해 올리고 **로컬에도 되쓴다**(안 쓰면 매번 다시 미동기화로 잡혀 영원히 진다) — U78

**필드 단위 병합 코드는 한 줄도 없다.** 이긴 쪽 레코드를 통째로 `put` 한다.

### 4. 새 스토어 0개 · `DB_VERSION` 1 그대로

| 저장물 | `meta` KV 키 |
|---|---|
| 로그인 세션 | `sbSession:auth` |
| 동기화 상태 | `sync:{projectId}` (`lastPushedAt`·`cursor`·`lastSyncedAt`·`pendingCount`·`lastResult`·`lastMessage`·`lastConflictCount`) |
| 충돌 이력(최근 50건) | `syncConflict:{projectId}` |
| 삭제 로그(기존) | `deleted:{projectId}` — 읽어서 tombstone push 에 쓴다 |

### 5. 자동 동기화가 **하나도 없다** (§3-7 규칙 0)

`syncProject()` 의 유일한 호출처는 `SyncButton` 의 `onClick` 이다(grep 로 확인).
`SyncButton` 의 `useEffect` 는 **로컬 `meta` KV 를 읽어 지난 결과를 표시**할 뿐 네트워크를 타지 않는다.
실패해도 자동 재시도하지 않는다 — `실패 · 다시 시도` 버튼 하나(지수 백오프 금지).

---

## 동기화 한 번의 전체 흐름

```
0. 세션 확인(여기서만 네트워크 갱신 허용) → team_members 1행 select 로 teamId
1. 서버 색인 1회 조회 (payload 없음, 1000행씩 페이징)
2. PUSH
   a. projects 행 (records·blobs 의 FK 라 반드시 먼저). Project.orgId ← teamId (D24)
   b. 올릴 레코드 = 서버에 없거나 로컬이 LWW 로 이긴 것. 진 것은 충돌로 보관
   c. Blob 업로드 — render + thumb 만, 서버 blobs 테이블에 없는 key 만
      경로 `{teamId}/{projectId}/{key}` (Storage RLS 의 foldername[1] 규칙에 맞춤)
   d. records upsert (100건씩, onConflict `project_id,kind,id`)
   e. 삭제 전파 — `deleted:{projectId}` 중 서버 행이 살아 있고 삭제가 더 최신인 것만
      `update {updated_at, deleted_at, device_id}`
3. PULL — 서버가 이긴 레코드의 payload 만 100건씩. **레코드 단위로 커밋**(§3-7)
   서버 tombstone → 로컬 하드 삭제 + Blob 참조 해제. 삭제 로그는 남기지 않는다(되먹임 방지)
4. Blob 다운로드 — 받은 레코드가 가리키는데 로컬에 없는 key
5. `sync:{projectId}` 기록 + 충돌 append
```

**`sourceBlobKey`(도면·사진 원본)는 어느 방향으로도 오가지 않는다** — `syncedBlobKeys()` 가
`renderBlobKey`·`thumbBlobKey` 만 모은다(Q60 · storage 마이그레이션 주석).

---

## 검증한 것

| 항목 | 결과 |
|---|---|
| `npm run typecheck` (canvas-core · project-core · web 전체) | ✅ 통과 |
| `npm test` (canvas-core + project-core) | ✅ **377 tests / 21 files** 통과 (신규 `lww.test.ts` 7건 포함) |
| `npm run build` (프로덕션) | ✅ 통과 — `index-*.js` 600.16 kB (gzip 187.77 kB) |
| `SUPABASE_SERVICE_ROLE_KEY` grep | ✅ **"이 앱에 없다"는 주석 2줄 외 코드 0건** |
| `apps/web/api/` 존재 여부 | ✅ 없음 |
| `autoRefreshToken` grep | ✅ `supabaseClient.ts` 에 `false` 1곳뿐 |
| `getSession`/`refreshSession` 호출처 grep | ✅ `sync.ts` 의 동기화 진입점 1곳뿐. 앱 시작 경로 0건 |
| `syncProject` 호출처 grep | ✅ `SyncButton` 의 `onClick` 1곳뿐 (useEffect·타이머 0건) |
| 필드 병합 코드 | ✅ 없음 — `applyPulledRecord` 는 payload 를 통째로 `put` |
| `DB_VERSION` | ✅ 1 그대로, 새 오브젝트 스토어 0개 |

**미검증(코드로 확인 불가):** 실제 Supabase 왕복, 로그인 성공/실패, 두 기기 간 실제 병합,
Storage 업/다운로드, RLS 거부 응답. 전부 사용자 확인 몫이다.

---

## 직접 확인해주실 것

> ⚠️ **아래 0번을 먼저 하지 않으면 `[동기화]` 가 "이 계정이 아직 팀에 등록되지 않았습니다" 로 끝난다.**
> auth 계정만으로는 RLS 의 `my_team_id()` 가 null 이라 서버가 아무것도 안 받아준다.

**0. 사전 준비 (Supabase 대시보드 · 1회성)**
   1. Authentication → Users → 이메일+비밀번호로 계정 1개 생성(Confirm 체크)
   2. SQL Editor 에서:
      ```sql
      insert into teams (name, slug) values ('개인테스트', 'personal-test') returning id;
      -- 위 id 와 Auth 대시보드의 사용자 uuid 를 아래에 채운다
      insert into team_members (user_id, team_id, login_id, display_name, role, active)
      values ('<auth.users.id>', '<teams.id>', 'me', '테스트 계정', 'OWNER', true);
      ```
   3. `apps/web/.env.local` 에 `VITE_SUPABASE_URL` · `VITE_SUPABASE_PUBLISHABLE_KEY` 실제 값

**1. 로그인 게이트**
   - `.env.local` **없이** 앱을 연다 → 로그인 화면이 **뜨지 않고** 지금까지처럼 용역 목록이 나와야 정상
   - `.env.local` 을 채우고 새로고침 → 로그인 화면이 뜬다
   - 틀린 비밀번호 → `이메일 또는 비밀번호가 맞지 않습니다`
   - 맞는 계정 → 바로 용역 목록. 우하단에 이메일이 작게 보인다(로그아웃 버튼은 **없는 게 정상**)
   - **새로고침** → 로그인 화면을 건너뛰고 바로 목록
   - **개발자도구 Network 를 Offline 으로 두고 새로고침** → 그래도 목록이 즉시 뜬다.
     여기서 네트워크 요청이 하나라도 나가면 §3-4 위반이니 알려주세요

**2. 첫 동기화 (PC 한 대)**
   - 용역 목록 행 오른쪽 `[동기화]` 클릭
   - 진행 문구가 `서버 목록 확인 중…` → `사진·도면 올리는 중…` → `올리는 중… (n건)` 으로 바뀐다
   - 끝나면 `{n}건 반영 · 방금`
   - **한 번 더 누른다** → `변경 사항이 없습니다` 여야 정상(같은 것을 두 번 올리지 않는다)
   - Supabase 대시보드 Table Editor 에서 `projects` 1행 · `records` n행 ·
     Storage `blobs` 버킷에 `{teamId}/{projectId}/...` 파일이 보이는지

**3. 두 번째 기기로 받기** (다른 브라우저 프로필이나 시크릿 창도 됩니다)
   - 로그인 → 용역 목록이 **비어 있다**(로컬 DB 가 비었으니 정상). ⚠️ 이 상태에서는 누를
     `[동기화]` 버튼이 없다 — **현재 버전은 "서버에만 있는 용역"을 목록에 끌어오지 못한다**
     (아래 "알려진 한계" 1번). 확인하려면 같은 용역이 양쪽에 있는 상태에서 2-1 로 진행해 주세요
   - 2-1. PC 에서 `[파일로 내보내기]` → 두 번째 기기에서 `[파일에서 가져오기]` 로 같은 용역을
     심은 뒤, **양쪽에서 각각 `[동기화]`** 를 눌러 결함 수정이 서로 오가는지 확인

**4. 충돌 표시 (중요 — 조용히 덮으면 안 된다)**
   - 기기 A 에서 결함 하나의 폭을 고치고 `[동기화]`
   - 기기 B 에서 **같은 결함**을 다르게 고치고 `[동기화]`
   - B 에 `충돌 1건 · 상대 값으로 덮였습니다 [보기]` 가 뜨고, `[보기]` 를 누르면 **덮이기 전
     내 값**이 그대로 보여야 한다. 안 보이면 알려주세요

**5. 삭제 전파**
   - A 에서 결함 하나 삭제 → `[동기화]` → B 에서 `[동기화]` → B 에서도 사라져야 한다
   - 되돌리기(Ctrl+Z)로 살린 결함은 **되살아난 채로 남아야** 한다(삭제 기록에서 빠진다)

**6. 오프라인에서 동기화 시도**
   - Network Offline 상태로 `[동기화]` → 버튼이 `실패 · 다시 시도` 로 바뀌고 앱은 멀쩡해야 한다.
     **자동으로 다시 시도하지 않아야** 정상(배터리)

**7. 도면·사진이 두 번째 기기에서 실제로 보이는지**
   - B 에서 도면을 열었을 때 배경 도면이 뜨는가 / 사진첩 썸네일이 뜨는가
   - **원본(`sourceBlobKey`)은 일부러 안 보낸다** — A4 재합성이 필요한 도면은 저장된 렌더본으로
     대체돼 보인다(코드상 폴백 확인 완료). 화면이 **비어 보이면** 그건 버그이니 알려주세요

---

## 알려진 한계

1. **서버에만 있는 용역은 목록에 나타나지 않는다.** `[동기화]` 가 프로젝트별 버튼이라
   "내 로컬에 있는 용역"에서만 시작한다. 새 기기에 용역을 처음 심는 경로는 아직
   `[파일로 내보내기/가져오기]`(D38)다. 스코프 L5 가 "프로젝트별 버튼 하나"였으므로
   범위대로 만들었다 — **용역 목록 자체를 서버에서 당겨오는 버튼**이 필요하면 말씀해 주세요(별도 작업)
2. **`server_seq` 를 커서로 못 쓴다** → 매 동기화마다 서버 색인 전체를 받는다. 수천 건까지는
   무시할 수 있고, 수만 건이 되면 서버 트리거로 고쳐야 한다 → **Q76**
3. **도면 교체 시 옛 Blob 이 로컬에 남을 수 있다.** pull 로 도면 레코드가 통째로 바뀌면서
   `renderBlobKey` 가 달라지면 옛 Blob 의 참조수를 줄이지 않는다(용량만 남고 오동작은 없다)
4. **`ItemSettings`·`ExportRun` 은 동기화하지 않는다** (§3-5 표 · 가정 V4·V5 그대로).
   항목 설정은 사무실 PC 에서만 편집하는 전제
5. **번들이 커졌다** — `index-*.js` 600 kB(gzip 188 kB). supabase-js 전체를 정적 import 한 결과다.
   `[동기화]`·로그인에서만 쓰므로 나중에 `import()` 로 잘라낼 수 있다(이번엔 안 했다)
6. **`pendingCount` 는 동기화 직후 0 으로만 기록된다.** "안 올린 게 n건" 을 목록에서 미리
   보여주려면 로컬 전수 스캔이 필요해 이번엔 넣지 않았다(§3-7 이 필드만 요구했다)

## 올린 질문

- **Q76** — `records.server_seq` 가 pull 커서로 쓸 수 없다 (비차단, 클라이언트에서 우회 완료)

## 남긴 가정

- **U74~U79** (`_workspace/ASSUMPTIONS.md`)
