# 재검수 결과 — Phase 5 트랙1 · 동기화 수정 + `[서버에서 받기]` (커밋 `0ed9428`)

## 판정: **조건부 통과**

직전 검수(`72_...md`)의 **심각 4건은 전부 코드에서 실제로 고쳐졌다.** 주장만이 아니라 해당 줄을
읽어 확인했다. 새 심각 0건. 절대 규칙 위반 0건. `npm run typecheck` 3패키지 통과(직접 실행).

조건부인 이유는 **새로 드러난 보통 3건**이다 — 그중 하나(Q77)는 제품 결정이 필요해
`_workspace/QUESTIONS.md` 에 남겼다. 셋 다 데이터 손실이 아니라 "놀람 / 조용한 미복구" 급이다.

정적 검수만 했다. 실 Supabase 왕복·RLS 응답·두 기기 실측은 여전히 확인하지 못했다.

---

## 1. 직전 지적 대조표

### 심각 — 4/4 해결

| # | 지적 | 결과 | 코드 근거 |
|---|---|---|---|
| 심각1 | 두 기기 병합 불가 | **해결됨** | `sync.ts:184-214 adoptRemoteProject` |
| 심각2 | 실패한 Blob 업로드 영구 미재시도 | **해결됨** | `sync.ts:735-742` · `769-775` · `785-794` |
| 심각3 | `blobs` 존재확인에 `project_id` 없음 | **해결됨** | `sync.ts:749` |
| 심각4 | 되살아난 레코드 영구 미push | **해결됨** | `sync.ts:686` · `906` · `916-921` |

**심각1 — 서버 id 를 정말 그대로 쓰는가.** 그렇다.
`adoptRemoteProject` 가 하는 쓰기는 `putLocalProject(db, { ...row.payload, id: projectId, deletedAt: null })`
한 줄뿐이고(`sync.ts:210`), 그다음이 `return syncProject(projectId, onStage)`(`:213`)다.
`projectTransfer.ts` 는 import 조차 하지 않는다(`RemoteProjects.tsx` · `sync.ts` 둘 다 grep 0건) —
id 재발급 경로를 안 거친다. `newId()`·remap 호출 0건.
받은 직후 `syncProject` 가 도는 흐름도 정확하다: 2-a 에서 `localWins` 는 `updatedAt`·`deviceId` 가
서버와 동일해 거짓, 새로 넣은 `sameRevision` 가드에 걸려 **재push 도 충돌기록도 안 남는다.**
로컬에 레코드가 0건이므로 3.PULL 이 전량을 당기고 4.에서 Blob 을 받는다. 새 pull 경로는 없다.

**심각2 — 실패가 정말 다음 회차에 재시도되는가.** 그렇다. 3중으로 확인했다.
- 업로드 후보 `wantedKeys` 를 `toPush` 가 아니라 `local.byKind.get('DRAWING'|'PHOTO')` 전수에서
  모은다(`:735-742`) → `sameRevision` 이라 후보에서 빠지는 일이 없다.
- 업로드 실패 경로(`:771-775`)는 `uploadedMeta` 에 넣지 않고 `continue` 한다 → `recorded` 에도 없다.
- `syncBlob:{projectId}` 에 들어가는 것은 `confirmed`(서버 `blobs` 에 **이 용역 id 로** 이미 있는 키)와
  `recorded`(Storage 업로드 성공 + 메타 upsert 무에러) 둘뿐이다(`:745,794`).

> **리더 질문 — "매번 전수 스캔 비용이 과한가": 아니다.**
> `local.byKind` 는 `readLocal` 이 이미 메모리에 올린 것이라 추가 IDB 접근이 0이다.
> 네트워크도 늘지 않는다 — 두 번째 동기화부터는 `[...wantedKeys].filter(k => !known.has(k))` 가
> 빈 배열이고 `chunk([])` 가 `[]` 라 **`blobs` 조회 요청 자체가 나가지 않는다**(`:747-753`).
> `addUploadedBlobKeys` 도 빈 배열이면 조기 return 이라 IDB 쓰기도 없다(`:55`).
> 즉 정상 상태의 추가 비용 = 메모리 루프 1회. 필터는 제대로 돈다.

**심각3 — `.eq('project_id', ...)` 가 붙었는가.** 붙었다: `sync.ts:749`
`sb.from('blobs').select('key').eq('project_id', projectId).in('key', ids)`.
회차 승계 시나리오를 따라가면 정확하다 — 용역 A 가 key K 를 먼저 등록하면 `blobs` 행의
`project_id` 는 A 다. 승계 용역 B 가 조회하면 **0행** → `missing` 에 K 포함 → `blobPath(team,B,K)`
로 Storage 업로드 수행 → 메타 upsert 는 `onConflict:'key', ignoreDuplicates` 로 조용히 무시되지만
`res.error` 가 null 이라 `recorded` 에 들어가 로컬 `syncBlob:B` 에 남는다 → 다음부터 재업로드 없음.
다운로드 쪽(`:940`)도 `blobs` 테이블이 아니라 `blobPath(teamId, projectId, key)` 를 직접 받으므로
메타가 A 소유여도 B 경로에서 정상 수신한다. **양쪽 계약이 일치한다.**

**심각4 — 호출 위치·조건·포맷.** 전부 맞다.
- `deletedIds` 는 `` `${d.kind}:${d.id}` `` (`:686`), 소비처 2곳도 같은 포맷
  (`:695` push 스킵, `:722` blob 스캔 스킵, `:906` revived 판정). **포맷 불일치 없음.**
- `revivedIds.push(r.id)` 는 `applyPulledRecord` **성공 직후에만**(`:904-906` try 블록 안) 실행된다.
  실패하면 catch 로 빠져 로그가 유지된다 — 옳다.
- `forgetDeletions` 는 pull 루프가 끝난 뒤, `toDeleteLocal` 적용 **전**(`:916-921`)에 돈다.
  `unrecordDeletions`(`deletionLog.ts:63`) 는 id 만 보고 지우고 `revivedIds` 도 id 배열이라 일치.
- 되먹임 없음: 2-e 삭제 push 는 `serverIndex` 기준이라 이 정리에 영향받지 않고, 다음 회차에는
  로그에 없으니 그냥 평범한 레코드가 된다.
- 순서 검증: 심각4 시나리오에서 2-e `tombstones` 필터는 `localWins({updatedAt:d.at,...}, side(server))`
  가 거짓이라(B가 더 최신) tombstone 을 안 올린다 → pull 이 되살린다 → `forgetDeletions`. 정합.

### 보통 — 3/3 대응 확인 (1건은 실질 미수정)

| # | 지적 | 결과 | 근거 |
|---|---|---|---|
| 보통1 | PROJECT `sameRevision` 없음 | **해결됨** | `sync.ts:664`. `Project` 는 `RecordBase` 상속이라 `deviceId: string` 필수(`types.ts:40`)이고 서버쪽은 `payload?.deviceId ?? ''`(`:646`) — 첫 push 이후 양쪽이 같은 값이라 `sameRevision` 이 참이 된다. `변경 사항이 없습니다` 가 실제로 나온다 |
| 보통2 | 예외 시 충돌 기록 소실 | **부분해결** (아래 [보통 A]) | `appendConflicts` 가 `:725` 로 이동. `conflicts.push` 는 `:667`·`:697` 두 곳뿐이라 **뒤에서 추가되는 충돌은 없다** — "승패가 이미 확정" 이라는 주장은 사실이다. 다만 위치가 지나치게 앞이다 |
| 보통3 | 페이징 종료조건 | **미수정** (지시대로). 단 로그 기술이 사실과 다름 — 아래 [경미 1] |
| 보통4 | pull 후 목록 미갱신 | **해결됨** | `SyncButton.tsx:58` `finally` 내 `reload()`, deps 에 `reload` 추가. `RemoteProjects.tsx:517` `finally` 에도 동일 |
| 보통5 | 재로그인 경로 | **미수정** (지시대로) |

### 경미 1~7 — 전부 미수정 (지시대로). 재지적하지 않는다

---

## 2. `[서버에서 받기]` 보안 경계면

| 확인 | 결과 |
|---|---|
| 팀 격리의 정본이 RLS 인가 | ✅ `projects_select ... using (team_id = my_team_id())`(`20260902154516_init.sql:95-96`). `my_team_id()` 는 `security definer` 로 `auth.uid()` 기반(`:78-81`) — 클라이언트가 무엇을 보내든 남의 팀 행은 안 나온다 |
| 클라이언트 필터가 RLS 대체인가 | ✅ 아니다. `listRemoteProjects` 의 `.eq('team_id', teamId)`(`sync.ts:157`)는 **RLS 위에 덧댄 2중 방어**다. 이 필터를 지워도 결과가 같다(RLS 가 이미 거른다). 주석도 그렇게 적혀 있다. `service_role`·RPC 우회 0건 |
| 자동 조회 여부 | ✅ `RemoteProjects.tsx` 에 `useEffect`·타이머 0건. `listRemoteProjects` 호출은 `open()`(`:491`) 하나, `adoptRemoteProject` 호출은 `adopt()`(`:507`) 하나, 둘 다 `onClick` 에서만 |
| 마운트 시 부수효과 | ✅ `useSession()`(로컬 KV) · `useAppData()` · `useToast()` 뿐. `status !== 'SIGNED_IN'` 이면 렌더 자체를 안 한다 |
| 삭제된 용역 노출 | ✅ `deleted_at !== null` 건너뜀(`:162`) |
| 로컬 중복 | ✅ `readLocalProjectIds` 가 **소프트 삭제 포함 전량** 키를 본다(`:410-414`) — 휴지통에 있는 용역을 두 번 받는 사고가 없다 |

---

## 3. 새로 발견한 것

### [보통 A] 충돌 기록을 너무 앞으로 옮겨서 — **덮이지도 않았는데 "덮였습니다" 가 뜬다**
- 파일: `apps/web/src/data/sync.ts:725` (`appendConflicts` 위치)
- 문제: 지금 위치는 **2-b 직후**다. 그런데 로컬 값이 실제로 덮이는 시점은 **3.PULL**(`:904`)이다.
  그 사이의 2-c(Blob) · 2-d(레코드 upsert `:815` `throw`) · 2-e 어디서든 예외가 나면
  **아무것도 안 덮인 채 충돌 기록만 남는다.** 사용자에게는 `충돌 N건 · 상대 값으로 덮였습니다` 배지가
  뜨는데 내 값은 멀쩡히 그대로다.
- 재현: 로컬이 LWW 로 진 레코드가 1건 있는 상태에서, 2-d 의 `records` upsert 가 실패
  (RLS 거부·오프라인 전환·용량). → 충돌 1건 기록 + `SyncError` 로 종료. 값은 안 바뀜.
  **재시도할 때마다 같은 충돌이 다시 append 되어** `CONFLICT_KEEP = 50` 상한을 중복으로 채우고,
  진짜 충돌 기록을 밀어낸다.
- 수정: `appendConflicts(db, projectId, conflicts)` 를 **2-e 직후 · 3.PULL 직전**으로 한 칸 내린다
  (`:851` 위). 직전 검수가 제안한 "PULL 시작 전" 이 바로 그 자리다. 승패가 확정됐다는 성질은
  그대로 유지되고, push 실패 시 허위 기록만 사라진다. 이동 비용은 한 줄이다.

### [보통 B] Blob **다운로드** 실패는 영원히 재시도되지 않는다 — 심각2 의 거울상
- 파일: `apps/web/src/data/sync.ts:931-952`
- 문제: 다운로드 대상 `needKeys` 를 **이번에 pull 한 레코드**(`pulledRecords`)에서만 모은다.
  한 번 실패하면(`:941-944` `problems.push` 후 `continue`) 그 레코드는 다음 회차에 `sameRevision`
  이라 pull 대상이 아니고 → `needKeys` 에 안 들어가고 → **다시는 받지 않는다.**
  더 나쁜 것은 그다음부터 `OK · 변경 사항이 없습니다` 로 보고된다는 점이다(첫 회차의 PARTIAL 이후
  아무 신호가 없다). 그 기기에서 그 도면은 영구히 빈 화면이다.
  이번 라운드가 고친 심각2(업로드)와 **정확히 같은 구조의 결함이 반대 방향에 남아 있다.**
  `[서버에서 받기]` 로 대량 pull 을 하게 되면서 노출 빈도가 크게 올라간다(도면·사진 전량을 한 번에 받는다).
- 재현: `[받기]` 도중 사진 1장 다운로드가 타임아웃 → PARTIAL 1회. 이후 그 기기에서
  `[동기화]` 를 몇 번을 눌러도 `변경 사항이 없습니다` 이고 그 사진은 영원히 안 온다.
- 수정: 업로드와 대칭으로 간다. `needKeys` 를 `pulledRecords` 가 아니라
  **이 용역의 모든 로컬 DRAWING·PHOTO 레코드**(2-c 가 이미 만든 `wantedKeys` 를 재사용)에서 모으고
  `if (await hasBlob(db, key)) continue`(`:939`)로 거른다. 이미 있는 파일은 IDB 조회 1회로 끝나고
  없는 것만 재요청한다. 새 상태 저장이 필요 없다 — `hasBlob` 이 곧 진실이다.
- 참고: 이 결함 자체는 `8cc2f64` 부터 있던 것이라 **이번 diff 가 만든 것은 아니다.**

### [보통 C] 받은 용역을 지우면 **팀 전체에서 사라진다** — D42 가 새로 연 경로
- 파일: `apps/web/src/data/idb/repo.ts:216 softDeleteProject` ↔ `apps/web/src/data/sync.ts:637-648`
- 문제: D42 이전에는 두 기기가 같은 `projectId` 를 가질 수 없어서 로컬 삭제가 남에게 닿지 않았다.
  이제는 닿는다. `softDeleteProject` 가 `deletedAt` 과 함께 `updatedAt` 을 갱신하므로(`stamp`)
  다음 동기화의 2-a 에서 `localWins` 가 참 → `projects.deleted_at` 이 서버에 찍히고 →
  다른 기기는 pull 로 `putLocalProject(서버 payload)` 를 받아 목록에서 사라진다.
  `listRemoteProjects` 도 `deleted_at !== null` 을 건너뛰므로 `[서버에서 받기]` 로 다시 받을 수도 없다.
- 특히 위험한 진입로: **`[받기]` 가 중간에 끊기면 빈 용역 행만 남는다**(builder 한계6).
  사용자가 "이상한 빈 용역" 을 지우는 것이 자연스러운 행동인데, 그 순간 팀 원본이 사라진다.
- 데이터 손실은 아니다 — 하위 레코드는 그대로고 양쪽 다 휴지통 복원(`repo.ts:223 restoreProject`)이
  살아 있으며, 복원도 같은 경로로 전파된다. 하드 삭제 경로는 없다(grep 확인).
- **의도인지 버그인지 코드로 판단할 수 없어 `_workspace/QUESTIONS.md` Q77 에 남겼다**(비차단).
  추천안은 A(의도로 확정 + 삭제 확인 문구에 "동기화하면 다른 기기에서도 사라집니다" 추가)다.

### [경미 1] `listRemoteProjects` 페이징은 "안전형" 이 아니다 — builder 로그 기술이 사실과 다름
- 파일: `apps/web/src/data/sync.ts:167-169`
- `if (rows.length === 0 || rows.length < PAGE) break; from += rows.length;` —
  `rows.length === PAGE` 일 때만 루프가 이어지므로 `from += rows.length` 는 `from += PAGE` 와 항상 같다.
  서버 `db-max-rows` 가 1000 미만이면 **첫 페이지에서 조용히 끊긴다** — 보통3 과 정확히 같은 결함이다.
  로그 `73_...md:48` 의 "`listRemoteProjects` 는 `from += rows.length` 안전형으로 작성" 은 사실이 아니다.
- 실제 위험은 낮다(용역 1000건 이상). 수정은 `if (rows.length === 0) break;` 로 조건을 나누면 끝이다.

### [경미 2] `syncBlob:{projectId}` 배열이 단조 증가한다
- 도면 교체·사진 삭제로 더 이상 참조되지 않는 키가 목록에 영구히 남는다(builder 한계4 로 인정).
  매 동기화마다 배열 전체를 읽고 쓴다. 수천 건 규모까지는 문제없으나 정리 로직이 없다는 것은 기록해 둔다.
  간단한 정리: `addUploadedBlobKeys` 에서 `next` 를 `wantedKeys` 로 한 번 교집합하면 된다.

### [경미 3] `RemoteProjects.tsx:523` 주석과 코드 불일치
- 주석은 "서버 설정이 없거나 로그인 전이면 감춘다" 인데 코드는 `status !== 'SIGNED_IN'` 만 본다.
  `getSupabase()` 가 null 인 경우는 버튼을 누른 뒤 토스트로만 알려진다. 실사용상 무해.

### [경미 4] 빈 목록 화면에 `[서버에서 받기]` 가 두 번 보인다
- `ProjectList.tsx:241`(헤더) + `:261`(빈 상태). 헤더 툴바는 `empty` 여도 렌더된다.
  `샘플 용역 만들기`·`용역 만들기` 가 이미 같은 방식으로 중복돼 있어 **기존 패턴을 따른 것**이다.
  각 인스턴스가 독립 state 를 갖지만 동시에 두 모달이 열릴 일은 없다. 기능 문제는 아니다.

---

## 4. 절대 규칙 재확인 (이번 diff 범위)

| 규칙 | 결과 | 근거 |
|---|---|---|
| `service_role` 없음 | ✅ | 이번 diff 에 등장 0건 |
| 새 IndexedDB 스토어 없음 · `DB_VERSION` 1 | ✅ | `createObjectStore` 0건. 새 상태는 `meta` KV `syncBlob:` 접두어 1개(`STORE.meta` 만 사용) |
| `sourceBlobKey` 미동기화 | ✅ | `syncedBlobKeys`(`:268-276`) 무변경 — render·thumb 만. 새 업로드 스캔도 이 함수를 그대로 부른다 |
| 필드 병합 없음 | ✅ | `putLocalProject`·`applyPulledRecord` 둘 다 통째 `put`. 새 코드에도 스프레드 병합 0건 (`adoptRemoteProject` 의 `{...row.payload, id, deletedAt:null}` 은 **로컬에 없는 새 행**을 만드는 것이라 병합이 아니다) |
| 자동 동기화 금지 | ✅ | 위 §2 |
| LWW 정본 1개 | ✅ | 새 코드도 `localWins`/`sameRevision` 을 `@onspect/project-core` 에서만 가져다 쓴다. 복제 0건 |

## 5. 도메인 불변식

| # | 불변식 | 결과 | 근거 |
|---|---|---|---|
| 1 | 마커 정규화 좌표 | ✅ | sync 는 payload 를 해석하지 않는다. 좌표 코드 0건 |
| 2 | `defectNo`/`photoNo` 컬럼 없음 | ✅ | 신규 코드·스키마에 없음 |
| 3 | 로컬 우선 쓰기 | ✅ | `adoptRemoteProject` 만 예외적으로 "서버를 읽고 로컬에 쓴다" 인데, 이는 버튼으로 명시 요청한 pull 이라 §3-6 의 로컬우선 규칙(사용자 편집 경로)과 충돌하지 않는다 |
| 4~6 | 면적·층정렬·원인FK | — | 범위 밖. 이번 diff 가 건드리지 않는다 |
| 7 | 과업 설정 복사 | ⚠️ 조건부 | `[서버에서 받기]` 는 `ItemSettings` 를 가져오지 않고, 받는 기기가 자기 ORG 설정을 지연 스냅샷한다. **다만 시드 항목 id 가 `seed-dt-1` 처럼 결정론적**(`items/seed.ts:97-100`)이라 기본 17종 라벨은 기기 간에 맞는다. 어긋나는 것은 **사용자가 직접 추가한 항목**뿐이다 — builder 한계1 의 실제 범위가 이 정도임을 확인했다 |
| 8 | 대표사진 정확히 1장 | ✅ | 읽기 정규화(`photo.ts normalizePhotos`)가 여전히 수렴시킨다. 이번 diff 는 사진 레코드 형태를 안 건드린다 |

## 6. 빌드·타입

`npm run typecheck` — canvas-core · project-core · web **3/3 통과** (이번 검수에서 직접 실행).
단위 테스트·프로덕션 빌드는 builder 로그의 수치를 재확인하지 않았다(리더 몫).

## 7. 확인하지 못한 것

- 실 Supabase 왕복 — RLS 거부 응답 형태, `blobs` upsert 의 `ignoreDuplicates` 가 정말 무에러로
  돌아오는지(`recorded` 기록 여부가 여기에 달려 있다), Storage `upsert:true` 의 실제 동작
- 두 기기 실측 병합 · `[서버에서 받기]` 실행 결과 (사용자 확인 몫 — builder 로그의 체크리스트 1~7 유효)
- Supabase 프로젝트의 `db-max-rows` 실제 값 (보통3 · 경미1 의 위험도가 여기 달려 있다)
- `apps/web/src/styles.css` 의 `.rlist` 시각 결과 (존재만 확인, 렌더링은 실행 검증)
- `adoptRemoteProject` 가 중간에 끊긴 뒤 그 용역 행이 목록에서 어떻게 보이는지(빈 용역 UI)
