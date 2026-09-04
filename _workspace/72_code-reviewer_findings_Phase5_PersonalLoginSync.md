# 검수 결과 — Phase 5 트랙1 · 개인 로그인 + 동기화 (커밋 `8cc2f64`)

## 판정: **조건부 통과**

보안/인증 경계면(중점 1·2·3·10)은 **전부 깨끗하다.** service_role 0건, 앱 시작 경로 네트워크 0건,
자동 동기화 0건, 새 스토어 0개. LWW 정본화도 정확하다.

반려하지 않는 이유: 로컬 데이터를 파괴하는 경로를 찾지 못했다.
조건부인 이유: **두 기기 병합이라는 이 라운드의 목적 자체가 현재 코드로는 성립하지 않는다**(심각 1),
그리고 한 번 실패한 Blob 업로드가 영구히 재시도되지 않아 조용한 영구 불일치가 남는다(심각 2).

정적 검수만 했다. 실 Supabase 왕복·RLS 응답은 확인하지 못했다.

---

## 심각

### [심각 1] 두 기기에 같은 용역을 심을 방법이 없다 — 병합이 원리적으로 안 일어난다
- 파일: `apps/web/src/data/projectTransfer.ts:146-149` ↔ `apps/web/src/data/sync.ts:399`
- 문제: `[파일에서 가져오기]` 는 **항상 모든 id 를 새로 발급한다**(D38, `collectTransferIds` →
  `newId()` 전량 remap). 그래서 기기 B 의 용역은 기기 A 와 **다른 `projectId`·`defectId`** 를 갖는다.
  `syncProject(projectId)` 는 프로젝트 id 로 서버 행을 찾으므로, B 가 동기화하면 서버에
  **두 번째 별개의 용역**이 생길 뿐 A 의 것과 절대 만나지 않는다.
  builder 로그의 "직접 확인해주실 것 3-2 · 4(충돌 표시) · 5(삭제 전파)" 검증 절차는 **성립하지 않는다.**
  builder 가 "알려진 한계 1"로 적은 것보다 훨씬 무겁다 — 한계가 아니라 **기능이 도달 불가**다.
- 재현: A 에서 내보내기 → B 에서 가져오기 → 양쪽 `[동기화]` → 서버 `projects` 2행, `records` 2배.
  결함 수정이 서로 오가지 않는다. 충돌·삭제 전파도 영원히 0건.
- 수정(택1, 리더 판단 필요 — 스코프 확장이다):
  - (A) 용역 목록에 `[서버에서 받기]` 하나 — `projects` 를 team 범위로 select 해서 로컬에 없는
    것을 심고, 그 뒤 기존 `syncProject` 로 레코드를 당긴다. 스코프 L5 밖이다.
  - (B) 가져오기에 "같은 용역으로 이어받기(id 보존)" 옵션 추가. D38 의 "매번 새 프로젝트" 규칙과
    충돌하므로 **결정이 필요하다.**
- 이 라운드에서 안 고칠 거라면, builder 로그의 확인 절차 3~5 를 **"현재 확인 불가"로 정정**해야 한다.

### [심각 2] 실패한 Blob 업로드는 영원히 재시도되지 않는다 — 조용한 영구 불일치
- 파일: `apps/web/src/data/sync.ts:548-551` (`wantedKeys` 를 `toPush` 에서만 모은다) · `561-584`
- 문제: 업로드 대상 키는 **이번에 올릴 레코드**(`toPush`)에서만 수집한다. 그런데 Blob 업로드가
  실패해도(`problems.push` 후 `continue`) **레코드 upsert 는 그대로 진행된다**(2-d).
  다음 동기화에서 그 레코드는 `sameRevision` 이라 `toPush` 에 안 들어가고 → `wantedKeys` 에서 빠지고
  → **업로드가 다시는 시도되지 않는다.** 서버에는 존재하지 않는 파일을 가리키는 레코드가 남는다.
- 재현: 업로드 중 네트워크 끊김/용량 초과 → `PARTIAL` 1회. 이후 모든 동기화는 `OK · 변경 사항 없음`
  으로 보고되지만, 다른 기기는 그 도면을 **영원히** 못 받는다(`파일 X 를 받지 못했습니다`).
- 수정: `wantedKeys` 를 `toPush` 가 아니라 **프로젝트의 모든 로컬 레코드**(`local.byKind`)에서 모으고,
  서버 `blobs`/Storage 에 없는 키만 올린다. 색인 대조와 같은 철학이다(존재 확인이 이미 1회 쿼리다).

### [심각 3] `blobs` 존재 확인이 프로젝트 경계를 무시한다 — 회차 승계 용역의 도면이 안 내려간다
- 파일: `apps/web/src/data/sync.ts:556` — `sb.from('blobs').select('key').in('key', ids)`
  (`.eq('project_id', projectId)` 가 **없다**)
- 문제: 서버 `blobs` 는 `key` 가 **전역 PK**인데(`20260902154516_init.sql:61`), Storage 경로는
  **프로젝트별**(`{teamId}/{projectId}/{key}`)이다. 그리고 이 앱은 회차 승계
  (`repo.ts:721 retainBlobIn`)에서 **두 용역이 같은 blobKey 를 공유**한다.
  결과: 용역 A 가 이미 올린 key 를 용역 B 가 "이미 있음"으로 판정 → **B 경로에는 업로드하지 않는다.**
  `blobs` upsert 도 `ignoreDuplicates` 라 조용히 무시된다.
- 재현: 용역 A 동기화 → A 를 회차 승계해 용역 B 생성 → B 동기화(성공 보고) →
  다른 기기에서 B 를 받으면 `blobs/{teamId}/{B}/{key}` 가 없어 **도면·사진이 전부 빈 화면**.
- 수정: (a) 존재 확인 쿼리에 `.eq('project_id', projectId)` 추가, (b) `blobs` 메타 upsert 실패/무시는
  이미 관용적이므로 그대로 두되, **Storage 업로드는 프로젝트 경로마다 반드시 수행**한다.
  근본 해결은 서버 `blobs` PK 를 `(project_id, key)` 로 바꾸는 것이지만 이번 라운드 스키마 동결에 걸린다.

### [심각 4] 서버 tombstone 으로 되살아난 레코드는 그 기기에서 **다시는 push 되지 않는다**
- 파일: `apps/web/src/data/sync.ts:508` (`deletedIds`) · `697` (`applyPulledRecord`)
- 문제: `deletedIds` 는 `deleted:{projectId}` 로그 전체에서 만들고, 로그는 **한 번도 정리되지 않는다.**
  pull 로 레코드가 되살아나도(정상 LWW 결과) 로그 항목은 그대로 남는다.
  이후 push 루프는 `if (deletedIds.has(row.id)) continue` 로 **그 레코드를 영구히 건너뛴다.**
  그 기기에서 아무리 수정해도 서버에 절대 안 올라간다 — 사용자에게는 아무 표시도 안 뜬다.
- 재현: A 가 결함 X 삭제 → 동기화. B 가 (동기화 전에) X 를 더 최신으로 수정 → 동기화(X 부활).
  A 가 동기화 → X 가 A 에 되살아난다. **이제 A 에서 X 를 수정해도 영원히 push 되지 않는다.**
- 수정: `applyPulledRecord` 성공 시 `unrecordDeletions(tx, projectId, [id])` 로 삭제 로그에서 뺀다
  (Ctrl+Z 경로가 이미 쓰는 함수다). 되먹임은 생기지 않는다 — 로그에서 **빼는** 방향이다.
- 부수: `deletedIds` 가 `kind` 를 무시한다(`d.id` 만). id 가 uuid 라 현재는 안전하지만, 위 수정과
  함께 `${kind}:${id}` 로 맞추는 게 옳다.

---

## 보통

### [보통 1] 용역(PROJECT)은 매번 "1건 반영" 으로 잡히고, 매번 서버 값으로 덮어쓴다
- 파일: `apps/web/src/data/sync.ts:478-505`
- 문제: 로컬·서버가 **완전히 동일**할 때(`updatedAt`·`deviceId` 같음) `localWins` 는 `false` 다.
  그런데 `else if (serverProject)` 가지에 `sameRevision` 검사가 없어서 → `putLocalProject(payload)`
  + `pulled += 1` 을 **무조건** 실행한다.
- 재현: 아무 변경 없이 `[동기화]` 를 두 번 누른다 → builder 가 확인 절차 2에 적은
  `변경 사항이 없습니다` 가 **절대 안 나온다.** 항상 `1건 반영`. 불필요한 로컬 쓰기도 매번 발생.
- 수정: `else if (serverProject && !sameRevision(localProject, projectServerSide))` 로 가지를 막는다.
  레코드 쪽(`sync.ts:669`)은 이미 이 검사를 하고 있다 — **같은 규칙이 프로젝트에만 빠졌다.**

### [보통 2] 동기화 중 예외가 나면 그때까지 모은 충돌 기록이 통째로 사라진다
- 파일: `apps/web/src/data/sync.ts:740` (`appendConflicts` 가 마지막 단계에만 있다) · `609-610`
- 문제: PULL 도중 `records` 조회가 실패하면 `must()` 가 throw → `appendConflicts` 에 **도달하지 못한다.**
  이미 `applyPulledRecord` 로 덮인 레코드들의 "진 쪽 원본"이 어디에도 안 남는다.
  §3-7 의 "조용히 덮는 것이 최악이다" 를 실패 경로에서 위반한다.
- 수정: `try/finally` 로 `appendConflicts` 를 감싸거나, PULL 시작 **전에** 충돌을 먼저 append 한다
  (충돌은 push 판정 시점에 이미 전부 확정돼 있다 — 나중에 추가되지 않는다).

### [보통 3] 페이징 종료 조건이 서버의 `max-rows` 설정에 의존한다
- 파일: `apps/web/src/data/sync.ts:440-453`
- 문제: `from += PAGE` 로 진행하고 `rows.length < PAGE` 면 끝으로 본다. Supabase 의
  `db-max-rows` 가 1000 미만으로 설정돼 있으면 **첫 페이지에서 조용히 끊긴다.**
  그 뒤 레코드는 서버 색인에 안 들어가고 → pull 도 push 가드도 그 구간에 대해 동작하지 않는다.
  경고 없이 절반이 죽는 형태라 위험도가 낮지 않다.
- 수정: `from += rows.length; if (rows.length === 0) break;` 로 바꾼다. 요청한 크기를 서버가
  줬는지에 의존하지 않는다.

### [보통 4] pull 이 끝나도 용역 목록이 갱신되지 않는다
- 파일: `apps/web/src/routes/SyncButton.tsx:44-57` — `reload()` 를 부르지 않는다
- 문제: `sync.ts` 는 `repo`/`appData` 를 거치지 않고 IndexedDB 에 직접 쓴다. `ProjectList` 의
  요약(`도면 n장 · 결함 n건 · 약 n MB`)은 `reloadKey` 로만 다시 읽는다.
  → `50건 반영` 이라고 표시되는데 **숫자는 그대로**다. 사용자는 동기화가 실패했다고 오해한다.
- 수정: `useAppData().reload()` 를 `run()` 의 `finally` 에서 호출한다.

### [보통 5] 갱신 토큰이 죽으면 앱 안에서 다시 로그인할 방법이 없다
- 파일: `apps/web/src/data/sync.ts:415-416` · `apps/web/src/data/session.tsx:82-94`
- 문제: `getSession()` 이 갱신에 실패하면 auth-js 가 `meta` 세션을 지운다. 그런데 메모리의
  `status` 는 여전히 `SIGNED_IN` 이라 로그인 화면이 뜨지 않고, 로그아웃 버튼도 없다(D26).
  사용자는 `실패 · 다시 시도` 만 무한 반복하게 된다. **새로고침해야만** 로그인 화면으로 간다.
- 수정: `syncProject` 가 `다시 로그인해야 동기화됩니다` 로 실패하면 `refreshFromStorage()` 를 호출한다
  (`SessionValue` 에 이미 있는 함수다). 그러면 게이트가 `SIGNED_OUT` 으로 떨어져 로그인 화면이 뜬다.

---

## 경미

1. `apps/web/.env.example:16` 에 **실제 프로젝트 URL**(`jaglifijobsjugmsnuvl.supabase.co`)이 박혀 있다.
   비밀은 아니지만 템플릿 파일이므로 `https://<project-ref>.supabase.co` 가 맞다.
2. `SyncState.lastPushedAt` · `cursor` 는 아무도 읽지 않는 죽은 필드다(색인 대조로 대체된 결과).
   `pendingCount` 는 항상 0(알려진 한계 6). 스펙 §3-7 이 요구한 필드라 남긴 것은 이해되나,
   주석에 "정보성"이라고만 적혀 있고 `lastPushedAt` 은 그 설명조차 없다.
3. `SyncButton.tsx:55` — `finally` 에서 언마운트 후 `setState` 가능(경고 수준).
4. `sync.ts:262` `putDownloadedBlob` 이 조기 return 시 `txDone` 을 기다리지 않는다.
   현재는 안전하지만(요청 없이 자동 커밋) 의도가 주석에만 있다.
5. `supabase-js` 를 정적 import 해서 초기 번들에 ~400KB 가 들어간다(알려진 한계 5).
   현장 PWA 라 `import()` 분리 가치가 크다.
6. 프로젝트 행마다 `SyncButton` 이 각자 `readSyncState` 로 IDB 를 연다 — 용역 N개면 N회.
7. `sync.ts:658` `key.slice(0, key.indexOf(':'))` 로 kind 를 파싱한다. `KINDS.includes` 로 막고는
   있으나, 애초에 `Map<string, ...>` 대신 `Map<SyncKind, Map<string, Row>>` 가 안전하다.

---

## 중점 항목 대조표

| # | 중점 | 결과 | 근거 |
|---|---|---|---|
| 1 | service_role 부재 | ✅ | grep 3건 전부 "여기 두지 않는다" 주석(`.env.example:8`·`supabaseClient.ts:6`·`config.toml`). `apps/web/api/` 없음 |
| 2 | `autoRefreshToken:false` · 시작 경로 무네트워크 | ✅ | `createClient` 호출은 `getSupabase()` 1곳뿐, 호출처는 `session.signIn`(버튼)·`sync.syncProject`(버튼). 게이트는 `readLocalSession` → `meta` KV 1건 읽기. `@supabase/supabase-js` 정적 import 는 모듈 평가 시 네트워크 없음 |
| 3 | push/pull 이 클릭에서만 | ✅ | `syncProject` 호출처 = `SyncButton.onClick` 1곳. `SyncButton.useEffect` 는 `readSyncState`(로컬)만. 타이머·재시도 0건 |
| 4 | RLS/스키마 대조 | ⚠️ | 테이블·컬럼명·`onConflict:'project_id,kind,id'`·Storage 경로 `{teamId}/{projectId}/{key}` 전부 일치. upsert 에 필요한 insert+update+select 정책도 전부 존재. **단 `blobs` 는 심각 3** |
| 5 | Q76 우회의 정확성 | ⚠️ | push 가드는 정확히 동작한다(서버 색인 대조 후 `localWins`). 페이지 경계는 **보통 3** |
| 6 | LWW 단일 정본 | ✅ | push 가드·pull 적용·삭제 전파·프로젝트 판정 전부 `@onspect/project-core` 의 `localWins` 하나. 복제 0건. 핑퐁 불가(테스트 `lww.test.ts:28` 이 반대칭성을 명시 검증) |
| 7 | 필드 병합 부재 | ✅ | `applyPulledRecord` = `store.put(payload)` 통째. 스프레드 병합 0건 |
| 8 | `sourceBlobKey` 미전송 | ⚠️ 조건부 | `syncedBlobKeys()` 가 render+thumb 만 모은다 — **바이트는 안 오간다.** 다만 `records.payload` 안에는 문자열이 그대로 실린다(레코드 통째 전송의 필연). 받는 기기에서 dangling 참조가 되며, `applyPulledDeletion` 의 `releaseBlobIn` 은 없는 키를 안전히 무시한다. 화면 폴백은 실행 검증 몫 |
| 9 | 삭제 전파 되먹임 | ✅ | `applyPulledDeletion` 이 `recordDeletion` 을 부르지 않는다(직접 `store.delete`). 다음 push 에서 `server.deleted_at !== null` 로 재전송도 차단. **순환 없음.** 단 반대 방향 누수는 심각 4 |
| 10 | 새 스토어 0 · `DB_VERSION` 1 | ✅ | `db.ts:15 DB_VERSION = 1`, `createObjectStore` 신규 0건. `sbSession:`·`sync:`·`syncConflict:` 전부 `meta` KV |
| 11 | `updatedAt`/`deviceId`/`createdBy` · D23 null 처리 | ✅ | `asSyncRow` 가 null 을 보존, 서버에 없을 때만 `now` 부여 후 `stampNullUpdatedAt` 으로 **로컬에도 되쓴다**. `deviceId` 는 안 건드린다(주석대로). 서버에 있으면 `localWins` 가 무조건 지게 한다 |

## 도메인 불변식

| # | 불변식 | 결과 | 근거 |
|---|---|---|---|
| 1 | 마커 정규화 좌표 | ✅ | sync 는 payload 를 해석하지 않는다. 좌표 변환 코드 0건 |
| 2 | `defectNo`/`photoNo` 컬럼 없음 | ✅ | 서버 스키마·클라이언트 어디에도 없음 |
| 3 | 로컬 우선 쓰기 | ✅ | 모든 화면 쓰기는 기존 `repo` 경로 그대로. 서버 응답을 기다렸다 로컬에 쓰는 곳은 pull(수동 버튼) 뿐 |
| 4 | 면적 계산 | — | 이번 변경 범위 밖 |
| 5 | `sortOrder` 정수 정렬 | — | 범위 밖. `Floor.sortOrder` 는 payload 로 통째 이동 |
| 6 | 원인·보수 FK 없음 | — | 범위 밖 |
| 7 | 과업 설정 복사 | — | `ItemSettings` 비동기화(§3-5) |
| 8 | 대표사진 정확히 1장 | ✅ | 레코드 단위 LWW 는 대표 2장을 만들 수 있으나, 읽기 정규화(`photo.ts:121 normalizePhotos`)가 항상 1장으로 수렴시킨다. 표시·번호 경로가 전부 그것을 지난다 |

---

## 확인하지 못한 것

- 실제 Supabase 왕복(RLS 거부 응답 형태, `maybeSingle()` 이 RLS 로 0행일 때의 error/data)
- Supabase 프로젝트의 `db-max-rows` 실제 설정값 (보통 3 의 위험도가 여기 달려 있다)
- pull 로 받은 dangling `sourceBlobKey` 를 화면이 실제로 견디는지
  (`CanvasRoute.tsx:449` · `locationMap.ts:282` 가 `readBlob` 을 부른다. null 폴백은 코드상 보이나
  A4 재합성 경로의 시각적 결과는 실행 검증 몫)
- `apps/web/src/styles.css` 변경분(시각 스타일 — 지적 대상 아님)
