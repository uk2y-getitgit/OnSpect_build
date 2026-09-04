# 구현 로그 — Phase 5 트랙1 · 검수 반영 + `[서버에서 받기]` (2026-09-05)

대상 검수: `_workspace/72_code-reviewer_findings_Phase5_PersonalLoginSync.md` (커밋 `8cc2f64`)
근거: **D42**(서버에서 받기 이번 라운드 추가) · D39 · D41 · 스펙 §3-5~§3-7

---

## A. 신규 기능 — `[서버에서 받기]` (D42) ✅

| 무엇 | 파일 |
|---|---|
| `listRemoteProjects()` — 내 팀 `projects` 중 **로컬에 없는 id** 만 | `apps/web/src/data/sync.ts` |
| `adoptRemoteProject(projectId)` — **서버 id 그대로** 로컬에 심고 기존 pull 엔진에 위임 | `apps/web/src/data/sync.ts` |
| `[서버에서 받기]` 버튼 + 목록 모달 | `apps/web/src/routes/RemoteProjects.tsx` (신설) |
| 용역 목록 헤더 · 빈 상태에 배치 | `apps/web/src/routes/ProjectList.tsx` |
| `.rlist` 스타일 | `apps/web/src/styles.css` |

**어떻게 재사용했나.** `adoptRemoteProject` 가 직접 하는 일은 `projects` 1행을 로컬에 쓰는 것뿐이고,
그다음 줄이 `return syncProject(projectId, onStage)` 다. 로컬이 텅 빈 상태에서 도는 평범한 동기화라
기존 pull 엔진이 Building·Floor·Drawing·Defect·Photo·Memo 와 render/thumb Blob 을 전부 당긴다.
**새 pull 경로를 만들지 않았다** — 두 경로가 생기면 반드시 어긋난다.

**`projectTransfer.ts` 는 한 줄도 건드리지 않았다.** 저쪽(D38)은 id 를 전량 재발급하는 별개 경로다.

받은 뒤에는 평범한 로컬 용역이다 — 목록에 나오고 `[동기화]` 가 붙는다.
`sameRevision` 이 성립하므로 받은 직후 다시 `[동기화]` 를 누르면 `변경 사항이 없습니다` 가 나온다.

**네트워크는 버튼 클릭에서만** — `RemoteProjects.tsx` 에 `useEffect` 가 없다(절대 규칙 2 유지).
"로그인 뒤 자동 조회"로 만들지 않은 이유가 이것이다.

---

## B. 검수 심각 — 처리표

| # | 지적 | 판정 | 어떻게 |
|---|---|---|---|
| 심각1 | 두 기기에 같은 용역을 심을 방법이 없다 | **고침** | 위 A. 검수 제안 (A)안 = D42 |
| 심각2 | 실패한 Blob 업로드가 영원히 재시도 안 됨 | **고침** | `wantedKeys` 를 `toPush` 가 아니라 **이 용역의 모든 로컬 DRAWING·PHOTO 레코드**에서 모은다. 업로드 성공한 키만 `syncBlob:{projectId}` KV 에 기록 → 실패한 키는 기록되지 않아 다음 동기화에서 자동 재시도. 레코드 revision 판정과 파일 업로드 성공 여부를 완전히 분리했다 |
| 심각3 | `blobs` 존재확인에 `project_id` 필터 없음 | **고침** | 확인 쿼리에 `.eq('project_id', projectId)` 추가 + 프로젝트별 로컬 업로드 기록(`syncBlob:`). 회차 승계로 두 용역이 같은 blobKey 를 공유해도 각 용역 경로에 반드시 업로드된다. `blobs` 메타 upsert 가 `ignoreDuplicates` 로 무시돼도 Storage 는 올라간다(그쪽이 정본) |
| 심각4 | 되살아난 레코드가 다시는 push 안 됨 | **고침** | `applyPulledRecord` 성공 + 그 id 가 삭제 로그에 있으면 `revivedIds` 에 모아 pull 직후 `forgetDeletions` → `unrecordDeletions`(Ctrl+Z 경로가 쓰는 `apps/web/src/data/idb/deletionLog.ts:63` 그대로 재사용). 부수 지적대로 `deletedIds` 를 `${kind}:${id}` 로 맞췄다 |

## C. 검수 보통 — 처리표

| # | 지적 | 판정 | 어떻게 |
|---|---|---|---|
| 보통1 | PROJECT 에 `sameRevision` 검사 없음 → 매번 "1건 반영" | **고침** | `else if (serverProject && !sameRevision(localProject, projectServerSide))`. 덤으로 `updatedAt` 은 같고 `deviceId` 만 다른 경우도 이제 충돌로 기록된다(전에는 조용히 덮었다) |
| 보통2 | 예외 시 충돌 기록 소실 | **고침** | `appendConflicts` 를 마지막 단계에서 **2-b 직후로 앞당겼다**. 승패는 2-a·2-b 에서 전부 확정되므로 뒤에서 추가되지 않는다(검수가 제시한 두 대안 중 `try/finally` 대신 이쪽 — 300줄 재들여쓰기 없이 같은 결과) |
| 보통3 | 페이징 종료조건이 `db-max-rows` 에 의존 | **미수정 (지시)** | 알려진 한계로 남긴다. 단 **새로 쓴** `listRemoteProjects` 는 `from += rows.length` 안전형으로 작성 |
| 보통4 | pull 후 목록 미갱신 | **고침** | `SyncButton.run()` 의 `finally` 에서 `useAppData().reload()`. `RemoteProjects.adopt()` 도 같다 |
| 보통5 | 만료 토큰의 앱 내 재로그인 경로 | **미수정 (지시)** | 알려진 한계 |

## 경미 1~7 — **미수정 (지시)**

`.env.example` 실 URL · 죽은 필드 주석 · 언마운트 setState · `putDownloadedBlob` 조기 return ·
supabase-js 정적 import · `SyncButton` N회 IDB open · `key.slice` kind 파싱. 전부 다음 라운드 후보.

---

## 절대 규칙 재확인 (코드로 확인)

| 규칙 | 결과 |
|---|---|
| `service_role` 미사용 | ✅ 코드 0건 (주석 2줄뿐) |
| 자동 동기화 금지 | ✅ `syncProject`·`listRemoteProjects`·`adoptRemoteProject` 호출처가 전부 `onClick`. `useEffect`·타이머 0건 |
| `autoRefreshToken:false` | ✅ 그대로 |
| 새 IndexedDB 스토어 금지 · `DB_VERSION` 1 | ✅ `createObjectStore` 신규 0건. 새 상태는 `meta` KV `syncBlob:` 접두어 하나 |
| 필드 단위 병합 금지 | ✅ `applyPulledRecord` 는 payload 통째 `put` |
| `sourceBlobKey` 미동기화 | ✅ `syncedBlobKeys` 그대로 render+thumb 만 |
| `getSession()` 호출처 | ✅ `resolveTeamId` 1곳 (앱 시작 경로 아님) |

## 검증한 것

| 항목 | 결과 |
|---|---|
| `npm run typecheck` (canvas-core · project-core · web) | ✅ 통과 |
| `npm test` | ✅ **377 tests / 21 files** (`lww.test.ts` 7건 포함) |
| `npm run build` | ✅ 통과 — `index-*.js` 604.59 kB (gzip 188.82 kB) |

**미검증:** 실 Supabase 왕복 · RLS 응답 · 실제 두 기기 병합. 사용자 확인 몫이다.

---

## 직접 확인해주실 것

**1. `[서버에서 받기]` — 이번 라운드의 핵심**
   - PC 에서 용역 하나를 `[동기화]` 로 서버에 올린다
   - 다른 브라우저 프로필(또는 태블릿)에서 같은 계정으로 로그인 → 목록이 비어 있고
     **빈 화면에 `[서버에서 받기]` 버튼**이 보여야 한다
   - 누르면 모달에 그 용역 1건이 보인다 → `[받기]` → 진행 문구가 바뀌고 끝나면 토스트
   - 목록에 용역이 나타나고 **도면 n장 · 결함 n건 숫자가 PC 와 같아야** 한다
   - 그 행의 `[동기화]` 를 눌러 보면 `변경 사항이 없습니다` 여야 정상
   - `[서버에서 받기]` 를 다시 누르면 `받을 용역이 없습니다`

**2. 두 기기 병합 (심각1 이 고쳐졌는지)**
   - 위 상태에서 **양쪽이 같은 용역 id** 다. B 에서 결함 하나의 폭을 고치고 `[동기화]`
   - A 에서 `[동기화]` → A 에도 그 값이 와야 한다. Supabase `projects` 는 **1행**이어야 한다
   - 같은 결함을 양쪽에서 다르게 고친 뒤 각각 `[동기화]` →
     진 쪽에 `충돌 1건 · 상대 값으로 덮였습니다 [보기]` 가 뜨고 내 원래 값이 보관돼 있어야 한다

**3. 검수 보통1 (매번 "1건 반영")**
   - 아무것도 안 바꾸고 `[동기화]` 를 두 번 → 두 번째는 `변경 사항이 없습니다` 여야 한다
     (전에는 항상 `1건 반영` 이었다)

**4. 검수 보통4 (목록 숫자 갱신)**
   - pull 이 일어나는 동기화 직후, 화면을 새로고침하지 않아도 `도면 n장 · 결함 n건` 이 바뀌어야 한다

**5. 검수 심각2 (업로드 재시도)**
   - 사진이 있는 용역에서 Network 를 **Offline 으로 만든 직후** `[동기화]` → `실패` 또는 `일부 실패`
   - Online 으로 되돌리고 다시 `[동기화]` → **사진이 다시 올라가야** 한다
     (전에는 한 번 실패하면 영원히 `변경 사항이 없습니다` 로 넘어갔다)

**6. 회차 승계 용역 (검수 심각3)**
   - 용역 A 동기화 → A 를 회차 승계해 B 생성 → B 동기화 → 다른 기기에서 `[서버에서 받기]` 로 B 를 받는다
   - B 의 **도면·사진이 빈 화면이 아니어야** 한다

**7. 되살아난 결함 (검수 심각4)**
   - A 에서 결함 X 삭제 → `[동기화]`. B 에서 (동기화 전에) X 를 더 최신으로 수정 → `[동기화]`
   - A 에서 `[동기화]` → X 부활. **이제 A 에서 X 를 또 고치고 `[동기화]` → B 에도 와야 한다**
     (전에는 A 에서 영원히 push 되지 않았다)

---

## 알려진 한계

1. **`ItemSettings` 는 여전히 동기화하지 않는다**(§3-5). `[서버에서 받기]` 로 받은 용역은
   그 기기의 ORG 설정을 지연 스냅샷해 쓴다(`repo.ensureProjectSettings`). 원인·보수방안 항목 id 가
   기기마다 다르면 라벨이 안 맞을 수 있다 — 항목 설정 동기화는 "정식 서버" 라운드 몫이다.
2. **페이징 종료조건**이 서버 `db-max-rows` 에 의존한다(검수 보통3, 지시대로 미수정).
   `records` 색인 조회가 대상. `listRemoteProjects` 는 안전형이다.
3. **만료된 refresh 토큰**의 앱 내 재로그인 경로가 없다(검수 보통5, 지시대로 미수정). 새로고침이 필요하다.
4. `syncBlob:{projectId}` 에 기록된 키는 **로컬 기준**이다. 서버 Storage 에서 파일을 수동으로 지우면
   이 기기는 "이미 올렸다"고 믿고 다시 올리지 않는다. 도면을 교체하면 옛 키가 목록에 남는다(용량만).
5. `adoptRemoteProject` 가 `syncProject` 에 위임하면서 세션·팀 확인이 **2회** 일어난다(가벼운 쿼리 1회 추가).
   경로를 하나로 유지하는 값이 더 크다고 판단했다.
6. `[받기]` 도중 끊기면 **용역 행만 심긴 상태**가 될 수 있다. 그때는 목록에 그 용역이 나타나고
   `실패 · 다시 시도` 배지가 붙으므로, 그 행의 `[동기화]` 로 이어서 받으면 된다(데이터 손상 없음).

## 새로 남긴 가정

없다. D42 가 이미 결정돼 있었고, 나머지는 검수 지적의 수정안을 그대로 따랐다.
`[서버에서 받기]` 를 **버튼 클릭 시 조회**로 만든 것만 지시문("로그인 뒤 … 조회해")과 다르게 읽힐 수
있는데, 절대 규칙 "자동 동기화 금지(전부 버튼 클릭에서만)" 를 우선했다.
