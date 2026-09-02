# 스펙 검토 결과 — Phase 5: 팀 동기화 서버 + 로그인 · 오프라인 설치형 태블릿 UI

작성: plan-reviewer · 2026-09-02
범위: `_workspace/00_input/scope_Phase5_TeamSync.md` 두 트랙 전부.
코드는 쓰지 않는다. builder 를 부르지 않는다.

읽은 것 —
`_workspace/00_input/scope_Phase5_TeamSync.md` · `_workspace/DECISIONS.md`(D1~D21) ·
`_workspace/26_plan-reviewer_spec_Phase5_Mobile.md` · `NEXT.md` · `CLAUDE.md` ·
`packages/project-core/src/types.ts`(RecordBase·Project·Floor·Drawing) · `.../repo.ts` ·
`.../photo.ts` · `.../items/types.ts` · `.../export/numbering.ts` · `.../export/params.ts`(ExportRun) ·
`packages/canvas-core/src/types.ts`(Defect·DefectAttrs·Memo) · `.../defectGeom.ts` · `.../interaction.ts`(seq 부여 3곳) ·
`apps/web/src/data/idb/db.ts`(DB_VERSION·STORE·requestPersistence) · `.../idb/blobs.ts` · `.../idb/exportRuns.ts` ·
`.../data/factory.ts` · `apps/web/src/App.tsx` · `apps/web/package.json` · `vercel.json` · 루트 `package.json` ·
`_workspace/mobile_mockup/*.dc.html`(파일 목록)

---

## 0. 한 줄 판정

> **착수 불가.** 차단 질문 **5건**(Q55~Q59)이 남아 있고, 그중 **Q56 은 지금까지 아무도 발견하지 못한 구조적 결함**이다 —
> **`Defect` 레코드에 `updatedAt`·`deviceId`·`createdBy` 가 없다.** D5 가 "모든 레코드가 갖는다"고 못 박은
> 병합 재료가, 하필 **가장 자주 바뀌는 레코드 하나에만 빠져 있다.** 이 상태로 LWW 동기화를 만들면
> 결함 병합이 판정 근거 없이 돌아간다.
>
> 다만 **답을 기다리지 않고 오늘 시작할 수 있는 작업이 6개 있다**(§7-0). 전부 PWA 껍데기와
> 저장소 안전장치라 데이터 모델을 굳히지 않는다.

| 대상 | 판정 | 이유 |
|---|---|---|
| 트랙 1 — 서버·로그인 데이터 모델 | ⛔ **착수 불가** | Q56(Defect 병합 재료 부재) · Q57(팀·소유권) · Q58(삭제 전파) · Q59(기기 공유 시 로컬 데이터) |
| 트랙 1 — 서버 스키마·엔드포인트 골격 | ⛔ **착수 불가** | 위 4건의 답이 그대로 테이블 컬럼이 된다 |
| 트랙 2 — PWA 껍데기(manifest·SW·persist) | ✅ **바로 착수 가능** | 데이터 모델과 무관. §7-0 |
| 트랙 2 — 태블릿 캔버스 실화면(정밀 표기) | ⛔ **착수 불가** | **D13(Q6) 미확정** — 리더 지시대로 Q55 로 재상정 |
| 트랙 2 — 태블릿 셸·층칩·미니맵 | 🟡 조건부 | 차단 없음. 다만 Q55 답이 툴바 구성을 바꾸므로 함께 하는 편이 싸다 |

---

## 1. 함정 8종 + 재현성 대조 — 이번 범위에서 새로 위험해지는 것만

기존 8종은 PC 웹에서 이미 확정·구현됐다. **서버와 다중 사용자가 들어오면서 새로 깨질 수 있는 지점**만 짚는다.

| # | 함정 | 동기화가 들어오면 | 판정 |
|---|---|---|---|
| 1 | **번호 3종 분리** | `Defect` 에 출력번호가 없으므로 서버에 올려도 번호는 안 굳는다. **다만 `seq`(입력순번)는 저장 필드이고 `maxSeq+1` 로 로컬에서 부여된다**(`interaction.ts` 1765·1846·1943) → 두 기기가 같은 층에서 오프라인 작업하면 **`seq` 가 중복된다** | ⚠️ **동작은 깨지지 않는다.** `compareForOutput` 이 `seq → drawingId → id` 로 결정론적 tie-break 를 이미 한다(`numbering.ts` 233행). 재현성은 유지된다. **다만 보고서 순서가 두 사람 작업분과 교대로 섞인다**(1,1,2,2,3,3) — §4-3 지적 |
| 2 | **좌표 0~1 정규화** | 서버가 도면 래스터를 재인코딩하지 않는 한 무관 | ✅ **서버는 Blob 을 바이트 그대로 보관한다**(재인코딩 금지). §3-6 |
| 3 | **오프라인 우선** | 🔴 **로그인 게이트가 이 원칙을 정면으로 위협한다.** 현장에서 토큰이 만료되면 앱이 잠긴다 | §3-7 에 못 박음: **로그인은 온라인 1회, 그 뒤 세션 만료는 "동기화만 막고 앱은 계속 쓴다"** |
| 4 | **항목 계층 = 마스터+연결** | `ItemSettings` 는 **문서 통째 put**(`putItemSettings`, "put 1회라 원자적") → LWW 하면 **한쪽 편집이 통째로 사라진다** | ⚠️ §3-5 — 1차는 **항목설정을 동기화 대상에서 빼고 사무실 PC 편집 전용**으로 둔다(가정 V4) |
| 5 | **스타일 상속 끊김** | 스타일은 결함 안 필드(`style`)라 결함과 함께 움직인다 | ✅ 무관 |
| 6 | **면적 계산 단위** | 순수 함수. 서버는 계산하지 않는다 | ✅ **서버는 어떤 파생값도 계산하지 않는다**(§3-6 불변식 S3) |
| 7 | **층 sortOrder(지하 음수)** | 서버 JSONB 로 그대로 왕복. 정렬은 클라이언트 | ✅ 무관 |
| 8 | **전회차 상태 3종** | `PREV_PENDING → CURRENT` 전이가 **두 기기에서 각각 일어날 수 있다** | ⚠️ LWW 로 결판난다. 다만 되돌리기(D21/N9)와 겹치면 늦게 저장한 쪽이 이긴다 — §4-4 |
| ⭐ | **출력 재현성(`ExportRun.mapping`)** | `ExportRun` 은 `meta` KV 에 있고 **기기 로컬**이다. 동기화하면 "다른 기기에서 낸 출력 이력"이 보인다 | **동기화하지 않는다**(가정 V5). 출력은 사무실 PC 전담(N3)이고, `ExportRun.deviceId` 가 이미 기기 귀속을 전제한다. 동기화하면 로컬에 없는 `blobKey` 를 가리키는 이력이 생겨 `[같은 번호로 다시 받기]` 가 깨진다 |
| ⭐ | **DB_VERSION = 1 유지** | 서버가 생겨도 **로컬 스키마는 안 바뀔 수 있다** — 조건 있음 | §3-8 — **새 오브젝트 스토어 0개, 마이그레이션 0건**으로 설계 가능하다. 단 Q56 의 답이 "Defect 에 필드 추가"면 그것도 **optional 필드 추가 + 읽기 정규화**라 DB_VERSION 은 여전히 1이다(`normalizePhotos`·`projectLegendOf` 가 쓴 수법과 동일) |

---

## 2. 🔴 최우선 발견 — `Defect` 에 병합 재료가 없다 (Q56)

### 2-1. 사실

`packages/project-core/src/types.ts` 34~43행 `RecordBase` 주석은 이렇게 못 박는다.

> *"모든 레코드가 갖는 필드. **Phase 5 병합·감사의 재료다.** 나중에 붙이면 기존 레코드가 전부 `null` 이라
> 병합이 그 구간을 판정할 수 없다."*

그런데 실제로 `RecordBase` 를 갖는 것은 다음뿐이다.

| 레코드 | `createdAt` | `updatedAt` | `deviceId` | `createdBy` | 근거 |
|---|:---:|:---:|:---:|:---:|---|
| `Project` `Building` `Floor` `Drawing` | ✅ | ✅ | ✅ | ✅ | `types.ts` — `RecordBase &` |
| `Photo` | ✅ | ✅ | ✅ | ✅ | `photo.ts` 60행 |
| `ItemSettings` | ✅ | ✅ | ✅ | ✅ | `items/types.ts` 72행 |
| `Memo` | ✅ | ✅ | ✅ | ✅ | `canvas-core/types.ts` 104~107행 (직접 나열) |
| **`Defect`** | ❌ | ❌ | ❌ | ❌ | `canvas-core/types.ts` 259~286행 + `DefectAttrs` 208~252행 — **네 필드 어디에도 없다** |

`apps/web/src/data/factory.ts` 에도 `makeDefect` 가 없다 — 결함은 `canvas-core/interaction.ts` 안에서
직접 만들어지고, 그 자리에 시각·기기 스탬프가 없다.

검증: `canvas-core/src` 전체에서 `updatedAt` 은 **2곳뿐**이다(`types.ts` 105행 = `Memo` 정의,
`interaction.ts` 2011행 = 메모 갱신). 결함 경로에는 한 번도 안 나온다.

### 2-2. 왜 치명적인가

- **LWW 병합의 기준값이 없다.** 리더가 "LWW 를 기본으로 검토"라고 한 그 `updatedAt` 이 결함에는 없다.
- **미전송 변경을 뽑을 수 없다.** `updatedAt > lastPushedAt` 이 동기화 큐를 만드는 유일한 방법인데,
  결함에는 그 값이 없어서 **"현장에서 고친 결함 목록"을 계산할 수 없다.** 프로젝트 전체를 매번
  통째로 올리는 수밖에 없어진다(수백 건 × 왕복).
- **`[기기에서 비우기]` 안전장치가 못 선다.** 26 스펙 §3-4⑤ 의 *"미동기화 변경 12건이 남아 있으면 차단"* 은
  결함 변경 수를 셀 수 없으므로 구현 불가다.
- **감사 추적이 없다.** `createdBy` 가 없으니 "이 결함은 누가 찍었나"를 영원히 알 수 없다. 팀 기능의
  절반이 이 필드다.

### 2-3. 왜 임의로 정하면 안 되는가

필드를 추가하는 것 자체는 자명하다. **문제는 "이미 저장된 옛 결함의 값을 무엇으로 채우는가"** 이고,
그 답이 첫 동기화의 승패를 결정한다.

- `updatedAt = 0` 으로 읽으면 → 옛 결함은 **항상 지는 쪽**이 된다. 사무실 PC 의 기존 데이터가
  현장 태블릿의 빈 상태에 덮일 수 있다.
- `updatedAt = Date.now()` 로 읽는 시점에 채우면 → **읽기만 해도 최신이 된다.** 앱을 나중에 연 기기가
  무조건 이긴다. 가장 위험하다.
- 서버가 최초 수신 시각을 부여하면 → 안전하지만 "먼저 올린 쪽이 원본"이라는 규칙을 사용자가 알아야 한다.

→ **Q56 (차단)**

---

## 3. 확정 스펙 — 트랙 1 (팀 동기화 서버 + 로그인)

> ⚠️ 이 절은 **Q56~Q59 의 답이 채워질 자리를 비워 둔 골격**이다. 비워 둔 곳은 `⬜ Q##` 로 표시했다.
> 골격 자체(엔드포인트 모양·불변식·저장 위치)는 차단 질문과 무관하게 확정이다.

### 3-1. 벤더 — Supabase 채택 (리더 권장에 동의)

리더 권장을 뒤집지 않는다. **반박 근거가 없고, 오히려 이 프로젝트에는 Neon+자체auth 보다 명백히 낫다.**

| 항목 | Supabase | Neon + 자체 auth | 판정 |
|---|---|---|---|
| 비밀번호 해싱·세션 | 내장(GoTrue) | **직접 구현** — argon2/bcrypt 선택, 토큰 회전, 유출 대응 | Supabase. 보안 코드를 직접 짜지 않는다는 리더 기준 그대로 |
| "팀장이 아이디·비번 직접 발급" | `auth.admin.createUser()` 1콜 | 직접 구현 | Supabase |
| **사진·도면 Blob 저장** | **Storage 내장 + 서명 URL** | **없다** — S3/R2 를 따로 붙여야 한다 | ⭐ **Supabase 결정타.** 이 앱은 수 GB 이미지가 본체다. Neon 은 Postgres 만 준다 |
| 행 수준 접근제어 | RLS 내장 — "내 팀 것만" 을 DB 가 강제 | 서버 코드가 매 쿼리마다 책임 | Supabase |
| Vercel Functions 궁합 | `@supabase/supabase-js` 그대로 | 커넥션 풀링 신경 써야 함 | 무승부~Supabase |

**Neon 이 나은 유일한 지점**은 Postgres 만 쓰고 auth·storage 가 필요 없을 때의 단순함인데,
이 프로젝트는 **auth 도 storage 도 둘 다 필요하다.** → 반박 없음. Supabase 로 간다. (Q61, 비차단 — 승인만)

### 3-2. 배포 형태 — ⚠️ Vercel Root Directory 제약

`NEXT.md` 2026-09-02 절에 기록된 사실: **이 Vercel 프로젝트의 Root Directory 가 `apps/web` 으로
설정돼 있다**(그래서 `outputDirectory` 를 `"dist"` 로 고쳤다).

→ **서버리스 함수는 `apps/web/api/*.ts` 에 두어야 한다.** 저장소 루트의 `api/` 는 Vercel 이 보지 않는다.
→ `apps/web` 은 클라이언트 번들이므로 **`api/` 는 Vite 빌드에서 제외**돼야 한다(`vite.config` 의
`build.rollupOptions` 진입점에 안 들어가면 자연히 제외되나, `tsconfig` include 범위와
`SUPABASE_SERVICE_ROLE_KEY` 가 **절대 클라이언트 번들에 섞이지 않는지**를 검수 항목으로 못 박는다).

> 🔴 **가장 큰 사고 위험: service_role 키가 프런트 번들에 실리는 것.** 그 키는 RLS 를 전부 우회한다.
> 규칙: `api/` 밖에서 `SUPABASE_SERVICE_ROLE_KEY` 문자열이 등장하면 **검수 즉시 심각**.
> 클라이언트는 `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` 만 안다.

### 3-3. 로그인 — "아이디·비번" 을 Supabase Auth 로 성립시키는 법

사용자 요구는 **이메일이 아니라 아이디**다. Supabase Auth 는 email/phone 만 받는다.

**해법(가정 V1):** 서버가 `loginId` → `"{loginId}@{teamSlug}.onspect.invalid"` 로 **내부 합성**한다.
사용자는 아이디만 입력한다. 이메일은 화면에 한 번도 안 나온다.
`.invalid` 는 RFC 2606 예약 TLD 라 실제 메일이 나갈 수 없다 — 확인메일·비번재설정 메일 경로가
구조적으로 차단된다(그 경로를 쓰지 않는 것이 요구사항이므로 오히려 맞다).

```
POST /api/auth/login   { loginId, password }
  → 서버: 이메일 합성 → supabase.auth.signInWithPassword()
  → 반환: { accessToken, refreshToken, user: { id, loginId, displayName, teamId, role } }

POST /api/team/members            (팀장 전용)  { loginId, password, displayName }
  → 서버: service_role 로 auth.admin.createUser({ email_confirm: true })
         + team_members 행 삽입(role='MEMBER')
PATCH /api/team/members/:userId   (팀장 전용)  { password? , displayName?, active? }
  → 비번 재발급·이름변경·비활성화. **비밀번호 재설정도 팀장이 한다**(메일 경로가 없으므로)
```

| 규칙 | 내용 |
|---|---|
| 역할 | `OWNER`(팀장 1인) · `MEMBER`. 팀당 `OWNER` 는 정확히 1 — DB 부분 유니크 인덱스로 강제 |
| 팀장 계정 생성 | **화면에 없다.** 최초 1회 수동(Supabase 콘솔 또는 시드 스크립트). 셀프 가입 경로를 만들지 않는다 |
| 팀원 삭제 | 하드 삭제 안 한다. `active=false`. 그가 만든 결함의 `createdBy` 가 끊기면 안 된다 |
| 비번 규칙 | 최소 8자. 팀장이 정한다. 강제 변경 안 시킨다(현장에서 비번 변경 화면을 띄우는 것이 더 위험) |

### 3-4. ⭐ 오프라인 로그인 규칙 — 여기가 이 트랙에서 제일 중요하다

> **로그인 게이트가 현장에서 앱을 잠그면 D11·불변식 3(오프라인 우선)이 그 자리에서 무너진다.**

```
최초 1회 (온라인)  로그인 → 세션을 meta KV `session` 에 저장
                            { userId, loginId, displayName, teamId, role,
                              accessToken, refreshToken, expiresAt, savedAt }

이후 앱 시작        meta 에 session 이 있으면 → 로그인 화면을 건너뛰고 바로 과업 목록
                    토큰이 만료됐어도 **앱은 전부 정상 동작한다**
                       · 결함 입력 · 사진 · 캔버스 · 출력 — 전부 로컬이라 토큰이 필요 없다
                       · 막히는 것은 [동기화] 버튼 하나뿐 → "다시 로그인해야 동기화됩니다"
[로그아웃]          ⬜ Q59 — 로컬 데이터를 어떻게 하는가
```

- **토큰 갱신을 앱 시작 시 자동으로 시도하지 않는다.** 현장에서 네트워크가 반쯤 살아 있으면
  갱신 요청이 매달려 앱 시작이 느려진다. **갱신은 [동기화] 를 누른 순간에만** 시도한다.
- 세션이 아예 없을 때만 로그인 화면을 띄운다.

### 3-5. 동기화 대상 — 무엇이 오가고 무엇이 안 가는가

| 레코드 | 동기화 | 근거 |
|---|:---:|---|
| `Project` `Building` `Floor` `Drawing` | ✅ | 팀이 공유하는 구조 |
| `Defect` | ✅ | 본체. **단 Q56 선행** |
| `Photo` (레코드) | ✅ | |
| `Memo` | ✅ | 도면 위 필기. 팀원 간 인계에 쓰인다 |
| **Blob** — 도면 `renderBlobKey`·`thumbBlobKey` | ✅ | 캔버스 배경. 없으면 현장에서 도면이 안 뜬다 |
| **Blob** — 도면 `sourceBlobKey`(원본·PDF) | 🟡 **PC↔서버만.** 태블릿은 안 받는다 | 26 스펙 §3-2. 용량의 절반 이상 |
| **Blob** — 사진 `renderBlobKey`·`thumbBlobKey` | ✅ | 사진첩·손상결함표가 이걸 쓴다 |
| **Blob** — 사진 `sourceBlobKey`(원본) | ⬜ **Q60** | 용량·비용에 직결. 기본 제안: 올린다(원본 보존이 §2-C 원칙) |
| **`ItemSettings`** | ❌ **1차 제외** (가정 V4) | 문서 통째 put 이라 LWW 가 한쪽 편집을 통째로 삼킨다(함정 #4). **태블릿은 읽기 전용**, 편집은 사무실 PC. 항목 배열 단위 병합은 2차 |
| **`ExportRun`** | ❌ (가정 V5) | 기기 로컬 산출 이력. 동기화하면 로컬에 없는 blobKey 를 가리켜 `[같은 번호로 다시 받기]` 가 깨진다 |
| `meta` 의 `deviceId`·`lastView`·`offline:*`·`sync:*` | ❌ | 전부 기기 로컬 |

### 3-6. 서버 스키마 (Supabase Postgres) — 골격

**설계 원칙: 서버는 저장소일 뿐이다. 도메인을 다시 구현하지 않는다.**

```sql
teams          (id uuid pk, name text, slug text unique, created_at)
team_members   (user_id uuid pk→auth.users, team_id uuid→teams,
                login_id text, display_name text,
                role text check (role in ('OWNER','MEMBER')), active bool)
                -- OWNER 1인 강제: create unique index on team_members(team_id) where role='OWNER'

projects       (id uuid pk,            -- 로컬 Project.id 를 그대로 쓴다
                team_id uuid→teams,
                updated_at bigint,     -- 로컬 epoch ms 를 그대로
                deleted_at bigint null,
                payload jsonb)         -- Project 레코드 전체

records        (project_id uuid→projects,
                kind text check (kind in
                  ('BUILDING','FLOOR','DRAWING','DEFECT','PHOTO','MEMO')),
                id uuid,
                updated_at bigint,
                device_id text,
                deleted_at bigint null,   -- ⬜ Q58 의 답이 이 컬럼의 운명을 정한다
                payload jsonb,
                server_seq bigint,        -- pull 커서. 시퀀스 또는 트리거
                primary key (project_id, kind, id))
                -- index (project_id, server_seq)

blobs          (key text pk,           -- 로컬 blobKey 를 그대로. uuid 라 기기 간 충돌 없음
                project_id uuid, byte_size bigint, content_type text,
                uploaded_at bigint)
                -- 실제 바이트는 Supabase Storage 버킷 `blobs/{teamId}/{projectId}/{key}`
```

**서버 불변식 (검수 기준):**

| # | 불변식 | 왜 |
|---|---|---|
| S1 | **서버는 출력 결함번호·사진번호를 저장하지도 계산하지도 않는다** | 불변식 #2. 서버가 번호를 만들면 그 순간 저장 번호가 생긴다 |
| S2 | **서버는 `payload` 를 해석하지 않는다** — 인덱싱하는 것은 `updated_at`·`kind`·`id`·`device_id`·`deleted_at` 뿐 | 도메인 로직 이중화를 막는다. 필드가 늘어도 서버는 안 바뀐다 |
| S3 | **서버는 면적·정렬·번호 등 어떤 파생값도 계산하지 않는다** | 함정 #6·#7 |
| S4 | **서버는 Blob 을 재인코딩하지 않는다.** 바이트 그대로 | 재인코딩하면 `Drawing.imageWidth/Height` 와 어긋나 정규화 좌표가 전부 밀린다(함정 #2) |
| S5 | **RLS: `records`·`blobs` 는 `projects.team_id` 가 내 팀일 때만 보인다** | 팀 간 격리를 DB 가 강제 |
| S6 | `id` 는 전부 클라이언트가 만든 uuid(`crypto.randomUUID`) | 서버가 id 를 새로 주면 로컬 참조(`prevDefectId`·`blobKey`)가 전부 끊긴다 |

### 3-7. 동기화 프로토콜 — 프로젝트 단위 수동 push-pull

> 사용자 원문: *"현장에서 진행 중일 때는 동기화 안함(사무실 복귀 후 동기화 진행)
> (프로젝트별 동기화 별도버튼 구현)"*

**⭐ 규칙 0: 자동 동기화를 만들지 않는다.** 백그라운드 동기화·주기 동기화·저장 시 자동 push 를 넣지 않는다.
버튼을 누른 순간에만 네트워크가 열린다. (사용자가 명시적으로 요구했다 — 뒤집지 않는다)

```
[동기화] 1회 = 5단계. 어느 단계에서 끊겨도 로컬 데이터는 손상되지 않는다.

  1. PUSH 준비   updatedAt > sync.lastPushedAt 인 레코드 + 삭제 목록(⬜Q58)을 모은다
  2. BLOB 업로드 payload 가 가리키는 blobKey 중 서버에 없는 것만 (서명 URL, 개별 재개 가능)
  3. PUSH        POST /api/sync/:projectId/push  { records[], deletes[] }
                 → 서버가 레코드별로 LWW 판정 → { applied[], rejected[] } 반환
  4. PULL        POST /api/sync/:projectId/pull  { since: sync.cursor }
                 → server_seq > cursor 인 레코드 → 로컬에 LWW 로 적용
  5. BLOB 다운로드 payload 가 가리키는데 로컬에 없는 blobKey (§3-5 표의 대상만)
                 → sync.cursor / lastPushedAt 갱신
```

| 항목 | 규정 |
|---|---|
| **트랜잭션 경계** | 4의 로컬 적용은 **레코드 단위**로 IndexedDB 에 커밋한다. 통째 트랜잭션으로 묶지 않는다 — 500건 중 1건이 실패하면 전부 롤백되는 것이 더 나쁘다 |
| **재개** | 2·5 는 blobKey 단위 재개. 중단되면 다음 [동기화] 가 이어받는다 |
| **충돌 규칙** | 레코드 단위 LWW: `updatedAt` 큰 쪽. 동률이면 `deviceId` 사전순(결정론) |
| **부분 필드 병합 안 한다** | "폭은 A가, 길이는 B가" 식 필드 병합을 하지 않는다. 레코드 통째로 이긴 쪽을 쓴다 — 필드 병합은 화면에 없는 제3의 상태를 만든다 |
| **진 쪽을 버리지 않는다** | LWW 로 진 레코드는 `meta` KV `syncConflict:{projectId}` 에 최근 50건까지 보관하고 결과 화면에 `충돌 3건 · 상대 값으로 덮였습니다 [보기]` 로 알린다. **조용히 덮는 것이 최악이다** |
| **실패** | 지수 백오프 자동 재시도를 하지 않는다. `실패 · 다시 시도` 버튼 하나. (현장에서 배터리를 태우지 않는다) |
| **동시성** | 같은 프로젝트에 두 기기가 동시에 push → 서버가 행 단위로 처리하므로 잠금 불필요. `server_seq` 는 시퀀스라 단조증가 |

**로컬 동기화 상태 (새 스토어 만들지 않는다):**

```
meta KV  key = `sync:{projectId}`
  { lastPushedAt, cursor, lastSyncedAt, pendingCount, lastResult: 'OK'|'PARTIAL'|'ERROR',
    lastMessage }
```
→ `exportRun:{id}` · `offline:{projectId}` 와 같은 수법. **DB_VERSION 1 그대로, 마이그레이션 0건.**

### 3-8. 🔴 핵심 리스크 답변 — 로컬 IndexedDB 마이그레이션이 필요한가

리더가 지목한 항목이다. **결론: 필요 없다. 단 조건 하나가 있다.**

| 새로 필요한 것 | 어디에 | DB_VERSION 영향 |
|---|---|---|
| 세션(로그인 사용자) | `meta` KV `session` | ❌ 없음 |
| 동기화 커서·미전송 수 | `meta` KV `sync:{projectId}` | ❌ 없음 |
| 충돌 이력 | `meta` KV `syncConflict:{projectId}` | ❌ 없음 |
| 오프라인 번들(G3, 26 스펙) | `meta` KV `offline:{projectId}` | ❌ 없음 |
| `Project.orgId`(또는 `teamId`) 채우기 | **이미 있는 필드** | ❌ 없음 |
| `Photo.remoteUrl` 채우기 | **이미 있는 필드**(`photo.ts` 76행 "Phase 5 예약") | ❌ 없음 |
| **`Defect` 에 `updatedAt`·`deviceId`·`createdBy` 추가** | `canvas-core/types.ts` | ⚠️ **optional 필드 추가 + 읽기 정규화**로 하면 없음. `normalizePhotos`·`projectLegendOf`·`normalizeMemo` 가 이미 세 번 쓴 수법이다 |
| **툼스톤(삭제 표시)** | ⬜ **Q58 의 답에 달렸다** | 🔴 **여기만 위험하다.** "삭제된 레코드를 스토어에 남긴다"를 고르면 `by_project` 인덱스 조회가 전부 `deletedAt === null` 필터를 타야 한다. 새 인덱스를 만들면 **DB_VERSION 2 가 된다** |

> **판정: Q58 을 "인덱스 추가 없이" 푸는 안으로 고르면 DB_VERSION 1 이 유지된다.**
> §5 Q58 의 선택지 B(별도 `meta` KV 에 삭제 로그)가 그 안이다.

### 3-9. `Project.prevProjectId`(전회차 연결)와의 충돌 검사 — 결과: 충돌 없음, 단 함정 1개

| 검사 항목 | 결과 |
|---|---|
| `prevProjectId` 가 **다른 팀**의 프로젝트를 가리킬 수 있는가 | ⚠️ **가능하다.** 로컬에서 만든 전회차를 팀에 올리지 않았다면, 팀원이 pull 한 새 회차의 `prevProjectId` 가 **서버에 없는 id** 를 가리킨다 |
| 그러면 무엇이 깨지는가 | `copyStructure` 는 프로젝트 **생성 시점**에 이미 끝난 작업이라 다시 안 돈다. `Defect.prevDefectId` 도 **역참조 조회를 하지 않는다**(D21 확인요청1 에서 grep 으로 확인됨). → **화면·출력은 안 깨진다.** 깨지는 것은 전회차 사진 조회(§2-D "누르면 이전 사진") 하나뿐이고 그건 아직 미구현이다 |
| 규정 | **서버는 `prevProjectId` 의 존재를 검증하지 않는다**(S2 — payload 를 해석하지 않는다). FK 를 걸지 않는다. D21 이 이미 같은 판단을 내렸다(*"FK 제약이 없으므로 존재하지 않는 id 라도 안전하다"*) |
| 동기화 순서 | 전회차 프로젝트를 먼저 올릴 것을 **권하기만** 한다. 강제하지 않는다 — 강제하면 "전회차가 아직 안 올라가서 이번 회차를 못 올린다"는 현장 교착이 생긴다 |

### 3-10. 번호부여 불변식 재검사 — 결과: 유지된다

| 질문 | 답 |
|---|---|
| 동기화로 결함이 늘면 `[같은 번호로 다시 받기]` 가 다른 파일을 내는가 | ❌ **아니다.** `ExportRun.mapping` 은 스냅샷이고 `appendArtifact` 는 *"번호는 다시 계산하지 않는다"* 를 코드로 지키고 있다. `diffExportRun` 이 added/removed 를 알려 화면에 경고한다 |
| 병합 후 `seq` 중복이 번호를 비결정적으로 만드는가 | ❌ **아니다.** `compareForOutput` 이 `seq → drawingId → id` 로 완전 결정론이다 |
| 그럼 문제가 없는가 | ⚠️ **하나 있다 — 순서가 섞인다.** A기기 seq 1,2,3 / B기기 seq 1,2,3 을 병합하면 출력 순서가 A1,B1,A2,B2,A3,B3 이 된다. 번호는 재현되지만 **보고서에서 두 사람의 동선이 교대로 나온다.** §4-3 |

---

## 4. 확정 스펙 — 트랙 2 (오프라인 설치형 PWA · 태블릿 UI)

### 4-1. PWA 껍데기 — 지금 없는 것이 정확히 무엇인가

| 항목 | 현재 | 필요 작업 |
|---|---|---|
| `manifest.webmanifest` | **없다** | 신규. `display:'standalone'` · `orientation:'any'`(D10 이 가로·세로 둘 다 정의했다) · 아이콘 192/512/maskable · `start_url:'/'` |
| 서비스워커 | **없다** | 신규. **앱 셸 프리캐시만.** 데이터는 IndexedDB 라 런타임 캐싱이 필요 없다 |
| `navigator.storage.persist()` | 🔴 **함수는 있는데 태블릿에서는 절대 안 불린다** | `db.ts` 247행 `requestPersistence()` 의 유일한 호출처가 `DrawingUpload.tsx` 285행이다. **태블릿은 도면을 올리지 않고 pull 만 하므로 이 코드가 한 번도 안 돈다.** D11 이 *"구현 시 필수"* 라고 경고한 바로 그 축출 방어가 태블릿에서만 비어 있다 → **앱 시작 시 1회 호출로 옮긴다** |
| 오프라인 부팅 | ❌ | SW 없이는 비행기 모드에서 URL 을 열면 **앱 자체가 안 뜬다.** 지금 배포본(정적 HTTPS 사이트)은 "오프라인 설치형"이 아니다 |
| 라우팅 | 앱 내부 상태(react-router 미사용) | SW 는 모든 네비게이션을 `index.html` 로 폴백하면 된다. 리라이트 규칙 불필요(NEXT.md 확인) |

> **가정 V2 — 서비스워커는 손으로 쓴다.** `vite-plugin-pwa`(workbox)를 넣지 않는다.
> 캐시 대상이 앱 셸(index.html + 빌드 산출 js/css) 뿐이고 데이터는 전부 IndexedDB 라
> workbox 의 전략 엔진이 하는 일이 없다. `write-excel-file` 때처럼 값이 명확할 때만 의존성을 늘린다.
> ⚠️ 대신 **빌드 해시 파일명 목록을 SW 에 주입**하는 작은 vite 플러그인(30줄)이 필요하다.

> **가정 V3 — 캐시 무효화 정책:** 새 SW 는 `skipWaiting` 하지 않는다. 갱신이 있으면
> `새 버전이 있습니다 [지금 새로고침]` 배너를 띄운다. **현장 작업 중에 앱이 저절로 리로드되면
> 입력 중이던 값이 날아간다.**

### 4-2. 1차 최소 동작 화면 — "무엇부터 만들 것인가"

사용자가 *"PC와 다른 UI로 (현장맞춤형) 개선해나갈 예정"* 이라고 예고했다 → **반복 라운드가 전제다.**
그렇다면 1차는 **넓게 얇게**가 아니라 **한 줄기를 끝까지** 뚫어야 피드백이 나온다.

> **1차 목표 문장: "태블릿에서 앱을 홈화면에 설치하고, 비행기 모드로 현장에 나가,
> 도면 위에 결함을 정확히 찍고, 사진을 붙여 돌아온다."**

| 순번 | 화면/기능 | 왜 이것이 1차인가 | 목업 |
|---|---|---|---|
| 1 | **PWA 설치 + 오프라인 부팅** | 이게 안 되면 "설치형"이 아니다. 나머지 전부의 전제 | — |
| 2 | **정밀 표기(조준 or 루페)** | 현장 입력의 **품질**이 전부 여기서 갈린다. 손가락으로 대충 찍으면 도면이 못 쓰게 된다 | M-05a / M-05b ⬜**Q55** |
| 3 | **사진 촬영** (`<input capture>` → 기존 `photoIngest` 재사용) | 결함 1건은 사진이 있어야 보고서에 실린다. 현장에 나가는 이유의 절반 | M-09 |
| 4 | **층 칩 스트립 + 미니맵** | 층 13개짜리 현장에서 층 전환이 안 되면 앱을 못 쓴다. `CENTER_ON_NORM` 이 **이미 코어에 구현·테스트돼 있다**(트랙A) | M-04 |
| 5 | 결함 입력 시트 터치 프로파일(44pt·열수) | D10 확정. 가로는 PC 와 같은 구조라 **기존 컴포넌트 재사용** | M-06 |

**1차에서 뺀다 (이유 명시):**

| 뺀 것 | 이유 |
|---|---|
| 오프라인 준비(G3, M-01~M-03) | **서버가 있어야 성립한다.** 트랙 1 뒤 |
| 로그인·팀 화면 | 같은 이유. 그때까지는 지금처럼 로컬 전용으로 쓴다 |
| 넛지 패드 · 프리셋 시트 · 결함 리스트 시트 | 없어도 한 줄기가 뚫린다. 2차 라운드 재료 |
| 태블릿 출력 화면 | **N3 — 태블릿은 출력하지 않는다**(재현성 위험). 유지 |

### 4-3. 트랙 A(2026-08-25)·태블릿 라운드(2026-09-02) 재사용 지점

이미 만들어져 있어 **다시 만들면 안 되는 것**들이다.

| 있는 것 | 위치 | 이번에 어떻게 쓰나 |
|---|---|---|
| 핀치줌 이벤트 3종 `GESTURE_PINCH_*` | `canvas-core/interaction.ts` (테스트됨) | 그대로. **DOM 배선도 2026-09-02 배치2 에서 완료** |
| 두 번째 포인터 드래그취소(T3) | `canvas-core` | 그대로. 3번째 손가락 오인식 방어도 배치2 에서 추가됨 |
| `CENTER_ON_NORM` | `canvas-core` | **미니맵 탭 이동이 코어에서 이미 끝나 있다** — 화면만 붙이면 된다 |
| 터치 히트 프로파일 `ReduceContext.hitProfile` (optional) | `canvas-core` | 태블릿 셸이 프로파일을 주입한다. **PC 는 안 넘기므로 동작 불변** |
| 캔버스 영역 안 접점만 세는 핀치 판정 | `apps/web` (배치2 검수 반영) | 그대로 |
| 태블릿 단축키 힌트 숨김 · 모달 배경클릭 비활성 · 검색창 자동포커스 끄기 | `apps/web` (배치1) | 그대로 |
| `PREV_PENDING → CURRENT` 전환 + `[전회차로 되돌리기]` | `apps/web` (배치3, D21) | 그대로. M-10·M-11 목업이 이미 이 동작이다 |
| `SET_SAFE_INSETS` · `SELECT_DEFECT{reveal}` | `canvas-core` (원래부터) | 시트 높이 배선에 그대로 |

> **판단: 트랙 A 와 태블릿 3배치가 이미 "코어 터치 배선"을 끝내 놨다.**
> 남은 것은 **화면(셸·오버레이·촬영)** 과 **PWA 껍데기**뿐이다. 코어는 더 안 건드려도 된다 —
> 단 하나, 정밀 표기 안 B(루페)를 고르면 **루페 렌더가 새로 필요하다**(§5 Q55).

### 4-4. 트랙 1 ↔ 트랙 2 의존 관계 — 리더 초안 검증

리더 초안: *"1과 2는 독립적으로 병행 가능해 보인다."* → **부분적으로 맞다. 정정한다.**

```
독립인 구간                              의존하는 구간
─────────────────────────────────       ─────────────────────────────────
트랙2-1 PWA 껍데기         ┐            트랙2 의 "과업 목록/오프라인 준비 화면"
트랙2-2 정밀 표기          ├ 완전 독립   → 트랙1(서버)이 있어야 성립 (G3)
트랙2-3 촬영               │
트랙2-4 층칩·미니맵        ┘            트랙1 의 "createdBy 를 채운다"
                                        → 로그인(트랙1)이 있어야 값이 생긴다
트랙1 서버·스키마·인증     ─ 완전 독립       (그전까지는 계속 null)
```

**정정:** 1차 최소 화면(§4-2)은 **로그인 이후 화면을 포함하지 않는다.** 과업 목록은 지금도
로컬 목록으로 있고, 서버가 붙으면 그 목록에 팀 프로젝트가 섞여 들어오는 형태다.
→ **병행 가능. 다만 트랙 2 를 먼저 끝내는 편이 낫다** — 이유: 사용자가 "반복 라운드로 다듬는다"고
예고했으므로 **손에 잡히는 화면이 빨리 나와야 피드백 사이클이 돈다.** 서버는 피드백이 안 나오는 작업이다.

---

## 5. 지적 사항

| 유형 | 위치 | 내용 | 심각도 |
|---|---|---|---|
| 🔴 **누락** | `canvas-core/types.ts` `Defect` | **`updatedAt`·`deviceId`·`createdBy` 가 없다.** LWW·미전송 집계·감사 전부 불가 (§2) | **치명 · 차단 → Q56** |
| 🔴 **누락** | 전 레코드 | **툼스톤이 없다.** `Project` 만 `deletedAt` 을 갖고 나머지(Building/Floor/Drawing/Defect/Photo/Memo)는 전부 하드 삭제다 → **A가 지운 결함이 B의 push 로 되살아난다** | **치명 · 차단 → Q58** |
| 🔴 **누락** | scope 문서 전반 | **팀 ↔ 조직 관계와 프로젝트 소유 주체가 정의되지 않았다.** `Project.orgId` 를 팀으로 쓸지, 회사 하위에 팀을 둘지, 프로젝트가 팀 소유인지 개인 소유인지 | **차단 → Q57** |
| 🔴 **누락** | scope 문서 전반 | **한 태블릿을 여러 사람이 쓸 때(교대·기기 공유) 로컬 데이터를 어떻게 하는가.** 로그아웃 시 IndexedDB 를 지우면 미전송 현장 데이터가 증발하고, 안 지우면 다음 사람이 남의 데이터를 본다 | **차단 → Q59** |
| 🔴 **미결정** | D13(Q6) | **정밀 표기 방식이 여전히 미확정.** 목업 두 안(M-05a 조준 크로스헤어 / M-05b 롱프레스 루페)이 그려져 있으나 선택이 없다. 안 B 를 고르면 **루페 렌더가 새로 필요**해 작업량이 달라진다 | **차단 → Q55** (리더 지시로 재상정) |
| 🟠 **모호함** | 사용자 원문 *"같은 팀은 프로젝트가 동기화"* | 두 가지로 읽힌다 — (가) 팀의 모든 프로젝트가 팀원 전원에게 보인다 / (나) 배정된 사람에게만 보인다. (가)면 팀원이 남의 현장 수 GB 를 받게 되고, (나)면 배정 화면이 필요하다 | Q57 에 포함 |
| 🟠 **모순 위험** | `ItemSettings` 통째 put ↔ LWW | 문서 1건 통째 저장이라 LWW 하면 **한쪽 항목 편집이 통째로 사라진다.** 현장에서 부재를 즉시 추가하는 경로(26 스펙 N2)와 정면 충돌 | 중 — 가정 V4 로 회피(1차 동기화 제외). 2차에 배열 단위 병합 |
| 🟠 **위험(코드)** | `db.ts` 247행 ↔ `DrawingUpload.tsx` 285행 | `requestPersistence()` 의 **유일한 호출처가 도면 업로드**다. 도면을 안 올리는 태블릿에서는 영원히 안 불린다 — D11 이 "필수"라고 한 축출 방어가 실제로는 비어 있다 | 중 — §7-0 P3 로 즉시 수정 가능 |
| 🟠 **위험(배포)** | `vercel.json` + Root Directory=`apps/web` | 서버리스 함수를 저장소 루트 `api/` 에 두면 **Vercel 이 못 찾는다.** `apps/web/api/` 여야 한다 | 중 — §3-2 |
| 🟠 **위험(보안)** | Supabase service_role | `auth.admin.createUser`(팀장 발급) 에 필요한 키가 **클라이언트 번들에 섞이면 RLS 가 전부 무력화된다** | 높음(사고 시) — §3-2 검수 규칙으로 고정 |
| 🟡 **부작용** | `seq` 중복 | 두 기기가 같은 층에서 오프라인 작업하면 `seq` 가 겹친다. 번호 재현성은 유지되지만 **보고서 순서가 두 사람 작업분과 교대로 섞인다** | 낮음~중 — 비차단. 가정 V6(그대로 둔다). 필요하면 2차에 "동기화 후 층별 seq 재부여" 도구 |
| 🟡 **미결정** | 사진 원본 업로드 | 결함당 2~4장 × 수백 = 수 GB. Supabase Storage 무료 1GB · 유료 8GB~ | 비차단 → Q60 (기본값으로 진행 가능) |
| 🟡 **미결정** | 벤더 최종 승인 | Supabase 로 결론(§3-1). 사용자 승인만 남음 | 비차단 → Q61 |
| 🔵 **확인(문제 아님)** | `prevProjectId` · `prevDefectId` | 서버에 없는 id 를 가리켜도 안전하다 — 어디서도 역참조 조회하지 않는다(D21 에서 grep 확인). FK 를 걸지 않는 것으로 확정 | 낮음 — §3-9 |
| 🔵 **확인(문제 아님)** | `ExportRun.mapping` 재현성 | 동기화가 들어와도 깨지지 않는다. `appendArtifact` 가 재계산을 코드로 금지하고 `diffExportRun` 이 drift 를 알린다 | — §3-10 |
| 🔵 **확인(문제 아님)** | DB_VERSION=1 | **Q58 을 "인덱스 추가 없는" 안으로 고르면 유지된다.** 나머지는 전부 `meta` KV + optional 필드 + 읽기 정규화로 해결된다 | — §3-8 |

---

## 6. 작업 분해

> ⛔ 표시는 차단 질문의 답이 있어야 착수 가능하다는 뜻이다.
> 한 작업이 파일 10개를 넘지 않도록 쪼갰다.

### 6-0. 지금 답 없이 시작할 수 있는 것 (차단 0건)

| # | 작업 | 산출물 | 의존 | 난이도 |
|---|---|---|---|---|
| **P1** | `manifest.webmanifest` + 아이콘 3종 + `<link rel=manifest>` | `apps/web/public/*` · `index.html` | — | 하 |
| **P2** | 서비스워커(앱 셸 프리캐시) + 빌드 파일목록 주입 vite 플러그인 | `apps/web/public/sw.js` · `vite.config.ts` · 등록 코드 1개 | P1 | 중 |
| **P3** | **`requestPersistence()` 를 앱 시작 시 1회로 이동** + 결과를 설정 화면에 표시 | `apps/web/src/data/appData.tsx`(+`DrawingUpload` 호출 유지) | — | 하 (효과 큼) |
| **P4** | 새 버전 배너(`skipWaiting` 안 함) | `apps/web/src/App.tsx` + 훅 1개 | P2 | 하 |
| **P5** | 저장 용량 경고 — `estimateStorage()` 를 과업 목록 하단에 `기기 여유 4.2GB` 로 노출 | `ProjectList.tsx` | — | 하 |
| **P6** | 사진 촬영 진입점 — `<input type=file accept="image/*" capture="environment">` (기존 `photoIngest` 재사용, 새 파이프라인 만들지 않는다) | `ui/photos/PhotoSection.tsx` | — | 중 |

### 6-1. 트랙 1 — 팀 동기화 서버 (⛔ Q56·Q57·Q58·Q59)

| # | 작업 | 산출물 | 의존 | 난이도 |
|---|---|---|---|---|
| T1-1 | Supabase 프로젝트 생성 · 테이블 · RLS · Storage 버킷 | `supabase/schema.sql`(저장소에 커밋) | ⛔Q57 | 중 |
| T1-2 | **`Defect` 에 `updatedAt`·`deviceId`·`createdBy` 추가 + 읽기 정규화 `normalizeDefect`** | `canvas-core/types.ts` · 새 `defectBase.ts` · `interaction.ts` 생성 3곳 (+테스트) | ⛔Q56 | 중 |
| T1-3 | 삭제 전파 장치 | ⛔Q58 의 답에 따라 위치가 갈린다 (+테스트) | ⛔Q58 | 중 |
| T1-4 | 인증 API — 로그인·팀원 발급·비번 재발급 | `apps/web/api/auth/*.ts` `api/team/*.ts` | T1-1 | 중 |
| T1-5 | 로컬 세션 저장 + 오프라인 로그인 규칙(§3-4) | `apps/web/src/data/session.ts` · `App.tsx` 게이트 | T1-4, ⛔Q59 | 중 |
| T1-6 | 로그인 화면 · 팀 관리 화면(팀장 전용) | 앱 UI 2파일 | T1-5 | 중 |
| T1-7 | 동기화 API — push / pull / blob 서명 | `apps/web/api/sync/*.ts` | T1-1, T1-3 | 상 |
| T1-8 | 동기화 실행기(5단계·재개·충돌 기록) — **순수 로직은 `project-core/sync/*` 로 뺀다**(테스트 가능하게) | `project-core/sync/plan.ts`·`merge.ts` (+테스트) · `apps/web/src/sync/runner.ts` | T1-2·T1-7 | 상 |
| T1-9 | **프로젝트별 [동기화] 버튼** + 진행/결과/충돌 화면 | 앱 UI 2파일 | T1-8 | 중 |
| T1-10 | 팀 프로젝트 목록(서버 메타) 을 과업 목록에 병합 표시 | `ProjectList.tsx` | T1-7 | 중 |

### 6-2. 트랙 2 — 태블릿 1차 (⛔ Q55 는 T2-2 만 막는다)

| # | 작업 | 산출물 | 의존 | 난이도 |
|---|---|---|---|---|
| T2-1 | 태블릿 셸 — 방향 감지 · 터치 프로파일 주입 · 좌측 세로 툴바 | 앱 UI 2파일 | — | 중 |
| T2-2 | **정밀 표기 구현** | ⛔Q55 답에 따라: 안A = 오버레이 1파일(코어 변경 0) / 안B = 오버레이 + **루페 렌더** | ⛔Q55 | 안A 중 / 안B 상 |
| T2-3 | 층 칩 스트립(결함수 뱃지 · `sortOrder` 오름차순) | 앱 UI 1파일 | T2-1 | 중 |
| T2-4 | 미니맵(썸네일 + 뷰포트 사각형 + 탭 → `CENTER_ON_NORM`) | 앱 UI 1파일 | T2-1 | 중 |
| T2-5 | 마지막 뷰포트 영속 `meta` `lastView:{projectId}` | `apps/web/src/data/idb/lastView.ts` | — | 하 |
| T2-6 | 시트 높이 → `SET_SAFE_INSETS` 배선(가로 사이드시트 우선, D10) | 앱 1파일 | T2-1 | 하 (효과 큼) |
| T2-7 | 결함 폼 터치 프로파일 — 44pt · 가로 3열 | `ui/defectForm/*` 5파일 수정 | T2-1 | 중 |

### 6-3. 권장 순서

```
지금 ──▶ P1~P6 (PWA 껍데기 · 촬영)          ← 답 없이 오늘 시작 가능
        │
        ├─ Q55 답 ──▶ T2-2 정밀표기 ──▶ T2-1·3·4·6·7 (태블릿 1차 완성)
        │                                    ▲ 여기서 사용자 피드백 라운드 시작
        └─ Q56~Q59 답 ──▶ T1-2·T1-3 (데이터 모델 확정) ──▶ T1-1·4~10 (서버)
```

**이유:** 트랙 2 는 **화면이 나와야 피드백이 도는** 작업이고 사용자가 반복 라운드를 예고했다.
트랙 1 은 피드백이 안 나오는 기반 작업이라 뒤에 놔도 손해가 없다. 다만 **T1-2(Defect 필드 추가)는
빠를수록 좋다** — 지금 만들어지는 결함 레코드마다 판정 근거가 없는 데이터가 계속 쌓이고 있다.

---

## 7. 사용자 확인 필요 — `QUESTIONS.md` Q55~Q61

| # | 제목 | 차단 |
|---|---|---|
| **Q55** | ⭐ **D13(Q6) 재상정 — 정밀 표기: 조준 크로스헤어(M-05a) vs 롱프레스 루페(M-05b)** | 🔴 **차단** |
| **Q56** | 🔴 **`Defect` 에 병합 재료가 없다 — 지금 추가하고, 옛 결함의 값을 무엇으로 채우는가** | 🔴 **차단** |
| **Q57** | 팀 ↔ 조직 계층과 **프로젝트 소유·가시성 단위** (`orgId` 를 어떻게 쓸 것인가) | 🔴 **차단** |
| **Q58** | **삭제를 어떻게 전파하는가** — 툼스톤이 없어 지운 결함이 되살아난다 | 🔴 **차단** |
| **Q59** | 한 태블릿을 여러 사람이 쓸 때 **로그아웃 시 로컬 데이터** | 🔴 **차단** |
| **Q60** | 사진 **원본**까지 서버에 올리는가 (용량·비용) | 비차단 |
| **Q61** | 벤더 **Supabase** 최종 승인 | 비차단 |

가정은 `ASSUMPTIONS.md` **V1~V8** 에 기록했다.

---

## 8. 사용자가 직접 확인해주실 것 (구현 후 체크리스트 초안)

builder 가 구현하면 이 항목들이 검증 대상이 된다. 지금 미리 남겨 둔다.

### PWA
- [ ] 태블릿 Safari/Chrome 에서 `공유 → 홈 화면에 추가` 가 뜨고, 아이콘·이름이 정상인가
- [ ] 홈 아이콘으로 열면 **주소창 없이** 전체화면으로 뜨는가
- [ ] **비행기 모드에서 홈 아이콘으로 열어도 앱이 뜨는가** ⭐ (이게 "설치형"의 정의다)
- [ ] 설정 화면에 `저장소 영속 · 허용됨` 이 표시되는가 (거절돼도 앱은 정상 동작해야 한다)
- [ ] 새 버전 배포 후 **작업 중에 화면이 저절로 새로고침되지 않고** 배너만 뜨는가

### 동기화
- [ ] 비행기 모드에서 결함을 10건 찍고 → 사무실에서 `[동기화]` → 팀원 기기에서 그 10건이 보이는가
- [ ] **두 기기에서 같은 결함을 서로 다르게 고친 뒤** 양쪽 동기화 → 늦게 고친 값이 남고 **충돌 알림이 뜨는가**(조용히 덮이면 안 됨)
- [ ] A 기기에서 결함을 지우고 동기화 → B 기기 동기화 후 **그 결함이 되살아나지 않는가** ⭐
- [ ] 동기화 도중 네트워크를 끊었다 다시 눌러 **이어받는가**(처음부터 다시 받지 않는가)
- [ ] 세션이 만료된 상태로 현장에 나가도 **결함 입력·사진이 정상인가**(동기화만 막혀야 한다) ⭐
- [ ] 팀장이 발급한 아이디·비번으로 팀원이 로그인되는가 / 팀원에게 팀 관리 화면이 **안 보이는가**
- [ ] `[같은 번호로 다시 받기]` — 동기화로 결함이 늘어난 뒤에도 **예전 파일과 완전히 같은가** ⭐

---

## 9. 변경 이력

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-09-02 | 최초 작성 | Phase 5 팀 동기화 + PWA 태블릿 착수 검토 요청 |
