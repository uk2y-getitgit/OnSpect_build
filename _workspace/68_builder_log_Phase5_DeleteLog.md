# 구현 로그 — Phase 5 T1-3 삭제 전파 장치 (D25 · Q58 B안)

## 완료

| 작업 | 파일 | 상태 |
|---|---|---|
| 순수 로직(append/remove/검증) | `packages/project-core/src/deletionLog.ts` | 완료 |
| 순수 로직 export | `packages/project-core/src/index.ts` | 완료 |
| 순수 로직 단위테스트 17개 | `packages/project-core/test/deletionLog.test.ts` | 완료 |
| `meta` KV 어댑터(정본 함수 `recordDeletion`·`unrecordDeletions`·`getDeletionLog`) | `apps/web/src/data/idb/deletionLog.ts` | 완료 |
| 사진 하드 삭제 유일 지점에 `recordDeletion` 연결 (`purgePhotoRecordsIn`) | `apps/web/src/data/idb/photos.ts` | 완료 |
| `Building`·`Floor`·`Drawing`·`Defect`·`Memo` 하드 삭제 9개 지점 전부 `recordDeletion` 연결 | `apps/web/src/data/idb/repo.ts` | 완료 |
| `upsertDefects`·`upsertMemos`(Ctrl+Z 되살아남)에서 삭제 기록 제거 | `apps/web/src/data/idb/repo.ts` (`cleanupResurrected`) | 완료 |

### 기록이 남는 9개 하드 삭제 지점 (repo.ts) + 1개(photos.ts)

| 종류 | 지점 |
|---|---|
| BUILDING | `deleteBuilding` |
| FLOOR | `purgeFloorIn` (층 삭제 자체 — `deleteFloor`·`deleteBuilding` 연쇄 공용) |
| DRAWING | `purgeFloorIn`(연쇄) · `deleteDrawing`(단독) · `registerDrawings`(같은 층 도면 교체) — 3곳 |
| DEFECT | `purgeFloorIn`(연쇄) · `deleteDefects`(단독, Ctrl+Z 가능) — 2곳 |
| MEMO | `purgeFloorIn`(연쇄) · `deleteMemos`(단독, Ctrl+Z 가능) — 2곳 |
| PHOTO | `purgePhotoRecordsIn`(photos.ts) 1곳 — `purgePhotosOfDefectsIn`·`purgePhotoIdsIn`·`purgeOrphanPhotos` 전부 이 함수를 거치므로 여기 한 곳에만 넣었다 |

### 되돌리기(Ctrl+Z) 처리

`Defect`·`Memo`만 Ctrl+Z 대상이다(`store.ts` 의 `history`/`docOf`가 defects·memos만 다룬다).
`Building`·`Floor`·`Drawing`은 확인 대화상자 방식이라 되돌리기가 없고(기존 주석 "즉시 연쇄삭제를
유지한다"), `Photo`는 10초 되돌리기 창이 **닫힌 뒤에만** `deletePhotos`(→`recordDeletion`)를 부르므로
(`usePhotos.ts` `commitDelete`) 애초에 되돌린 사진은 기록되지 않는다 — 별도 제거 로직이 필요 없다.

`Defect`/`Memo`는 삭제가 250ms 디바운스로 먼저 flush 되고, 그 뒤 Ctrl+Z를 누르면
`recordCommandWrites`가 되살아난 레코드를 다시 `writes.upsert`에 태워 다음 flush에서
`upsertDefects`/`upsertMemos`로 다시 쓴다. 그래서 이 두 upsert 경로에 `cleanupResurrected`를
붙여 "같은 id로 write가 들어오면 삭제 기록에서 뺀다"를 구현했다 — Ctrl+Z 전용 API가 없으므로
가장 정확한 훅 지점이다.

## 미완료 / 막힌 것

없음. 스펙(D25/Q58 B안) 그대로 구현했고 막힌 지점이 없었다.

## 검증한 것

- `npm run typecheck` — 3개 패키지(canvas-core·project-core·web) 전부 통과
- `npm test` — canvas-core 392개 + project-core 325개(신규 17개 포함) = 717개 전부 통과
- `npm run build` — `@onspect/web` 프로덕션 빌드 성공 (기존에도 있던 청크 크기 경고 외 이상 없음)
- `DB_VERSION` 그대로 1 — `apps/web/src/data/idb/db.ts` 미수정, `git diff` 로 확인
- 새 오브젝트 스토어 없음 — `deleted:{projectId}` 키로 기존 `meta` 스토어(KV) 재사용, `exportRun:`·
  `lastView:` 와 완전히 같은 수법
- 코드 리뷰(직접): 하드 삭제가 일어나는 모든 지점을 `grep '\.delete\('` 로 repo.ts에서 전수 확인(9곳)
  하고 photos.ts의 유일한 삭제 지점(`purgePhotoRecordsIn`) 1곳을 확인 — 총 10개 지점 전부
  `recordDeletion`을 거치도록 연결했다. `recordDeletion`을 부르는 모든 트랜잭션의 스코프에
  `STORE.meta`가 포함됐는지 각 트랜잭션 생성부를 개별 확인했다.

## 직접 확인해주실 것

이번 배치는 **저장만 하고 아무도 안 읽는 로그**라 화면 동작 변화가 없다(의도된 결과 — T1-7이
나중에 소비한다). 그래도 회귀가 없는지 확인하시려면:

1. **결함 삭제 → 저장 → 새로고침**: 결함을 지우고 잠시 기다렸다가(250ms) 새로고침해도 지운 결함이
   돌아오지 않아야 한다 (기존 동작 그대로).
2. **결함 삭제 → 곧바로 Ctrl+Z**: 삭제한 결함이 화면에 그대로 돌아와야 한다 (기존 동작 그대로).
3. **동·층 삭제**: 확인 대화상자 → 삭제 후 그 동/층의 결함·사진·메모가 전부 사라지는지 (기존 동작
   그대로 — 이번 변경은 부수적으로 로그만 남긴다).
4. **개발자도구 → Application → IndexedDB → onspect → meta**: 위 1~3 조작 후 `deleted:{프로젝트id}`
   키에 배열이 쌓이는지, 2번(Ctrl+Z) 케이스에서는 그 항목이 배열에서 빠지는지 직접 확인 가능하다
   (선택 사항 — 코드 검증은 이미 됐다).

## 알려진 한계

- 이 로그는 **지금 아무도 읽지 않는다.** T1-7(동기화 API)이 붙기 전까지는 IndexedDB 안에서만
  계속 쌓인다. 정리(prune)도 이번 배치 범위 밖이다 — Q58 선택지 B의 "대가"에 이미 명시된 사항이고,
  스코프 밖으로 남겨둔다(동기화 완료 + 90일 경과 항목 정리는 T1-7/T1-8 소관).
- `deleteDefects`·`deleteMemos`는 이제 삭제 전 `store.get()`으로 레코드를 먼저 읽는다(기존엔
  id만으로 바로 지웠다) — projectId를 얻기 위해 불가피했다. id당 읽기 1회가 늘었지만, 결함
  삭제는 보통 소수 건이라 체감 영향은 없을 것으로 판단했다(별도 벤치마크는 하지 않음).
- `upsertDefects`·`upsertMemos`는 이제 매 flush마다 프로젝트별로 `meta`를 1회 읽는다(삭제 기록이
  없으면 쓰지는 않는다 — `unrecordDeletions`가 조기 반환). 이것도 별도 벤치마크는 하지 않았다.

## 가정 (ASSUMPTIONS.md 미기재 — 전부 스펙에 명시된 내용의 해석)

- "6종 레코드 삭제 시 기록"을 **모든 하드 삭제 호출 지점**(cascade 포함)으로 해석했다 — D25 근거
  문항의 "삭제 경로가 여러 곳이니 정본 함수 하나로 몰아라"가 이를 뒷받침한다. Building/Floor
  삭제로 연쇄 삭제되는 하위 Drawing/Defect/Memo/Photo도 각각 개별 기록을 남긴다(부모 삭제 기록
  하나로 뭉치지 않았다) — 나중에 서버가 이 로그를 개별 id 단위로 push할 것이므로 세분화된 편이
  안전하다고 판단했다. 이 판단이 T1-7 설계와 어긋나면(예: 부모 kind만 기록하면 충분) 그때
  가볍게 줄이면 된다 — 지금 더 남기는 쪽은 정보 손실이 없는 안전한 방향이라 질문으로 막지 않았다
  (비차단).
