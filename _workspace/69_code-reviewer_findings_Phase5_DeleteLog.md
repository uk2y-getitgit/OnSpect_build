# 검수 결과 — Phase 5 T1-3 삭제 전파 장치 (D25 · Q58 B안, 커밋 `af6354e`)

## 판정
**통과**

## 검수 방법
- `git show af6354e` 로 전체 diff 확인 (`repo.ts`·`photos.ts`·`deletionLog.ts`(2곳)·`index.ts`·테스트)
- `apps/web/src/data/idb` 전체와 `apps/web/src` 전체에서 `\.delete\(` 를 grep 해 6종 레코드
  스토어(`STORE.buildings/floors/drawings/defects/photos/memos`)를 직접 건드리는 파일이
  `repo.ts`·`photos.ts` 둘뿐임을 확인 (다른 파일의 `.delete(` 는 `blobs.ts`(Blob refCount·URL 캐시),
  `exportRuns.ts`(`meta` KV `exportRun:` 키), `usePhotos.ts`(Map/Set 메모리 캐시)로 6종과 무관)
- `usePhotos.ts` 를 읽어 사진 되돌리기(10초) 흐름과 `deletePhotos` 호출 시점을 직접 확인
- `store.ts`·`CanvasRoute.tsx` 를 읽어 결함/메모 Undo → `writes.upsert` → 250ms 디바운스 →
  `upsertDefects`/`upsertMemos` 흐름을 직접 확인
- `packages/project-core/test/deletionLog.test.ts` 17개 실제 실행(`npm run -w @onspect/project-core test -- deletionLog`) — 전부 통과
- `npm run -w @onspect/web typecheck` 실행 — 통과
- `db.ts` 의 `DB_VERSION` 이 이 커밋에서 손대지지 않았음을 diff 로 확인 (여전히 1)

## 1. 하드삭제 경로 전수조사 — 결과: 누락 없음

grep 결과 6종 레코드 스토어에 `.delete(` 를 호출하는 파일은 `repo.ts` 9곳 + `photos.ts` 1곳
(`purgePhotoRecordsIn`) 총 10곳뿐이고, 전부 diff 대로 `recordDeletion` 이 연결돼 있다.

| 종류 | 지점(파일:라인) | `recordDeletion` 연결 |
|---|---|---|
| BUILDING | `repo.ts:306` `deleteBuilding` | ✅ (`building` 존재 시) |
| FLOOR | `repo.ts:382` `purgeFloorIn` | ✅ (`floor` 존재 시) |
| DRAWING | `repo.ts:370` `purgeFloorIn`(연쇄) | ✅ |
| DRAWING | `repo.ts:432` `registerDrawings`(같은 층 교체) | ✅ |
| DRAWING | `repo.ts:470` `deleteDrawing`(단독) | ✅ (`d` 존재 시) |
| DEFECT | `repo.ts:375` `purgeFloorIn`(연쇄) | ✅ |
| DEFECT | `repo.ts:520` `deleteDefects`(단독) | ✅ (`get` 후 존재 시) |
| MEMO | `repo.ts:366` `purgeFloorIn`(연쇄) | ✅ |
| MEMO | `repo.ts:663` `deleteMemos`(단독) | ✅ (`get` 후 존재 시) |
| PHOTO | `photos.ts:56` `purgePhotoRecordsIn` (사진 하드삭제 유일 지점 — `purgePhotosOfDefectsIn`·`purgePhotoIdsIn`·`purgeOrphanPhotos` 전부 경유) | ✅ |

빠진 하드삭제 경로 없음. `Project` 는 이번 스코프(6종)에 없고 기존에도 하드삭제 함수 자체가
존재하지 않는다(`deleteProject` 미존재, `deletedAt` 소프트 삭제만 있음 — grep 확인) → 대상 밖이라
문제 없음.

## 2. Undo 정리(`cleanupResurrected`) 정확성 — 결과: 정확함

- `Defect`/`Memo` 만 Undo 대상이다 (`store.ts` `docOf` 가 `{defects, memos}` 만 다룸 — `Building`/
  `Floor`/`Drawing` 은 확인 대화상자 방식이라 되돌리기 자체가 없음, 코드로 확인).
- `store.ts` `recordWrite`/`recordMemoWrite`: Undo 로 레코드가 되살아나면(`d`/`m` 이 `state.defects`/
  `state.memos` 에 존재) 해당 id 를 **`upsert` 목록에만** 넣고 `remove` 목록에서는 제거한다.
  → 250ms 후 `CanvasRoute.tsx` `flush()` 가 `upsertDefects`/`upsertMemos` 를 호출하고,
  `repo.ts` `cleanupResurrected` 가 그 upsert 배치의 id 들을 `projectId` 별로 묶어
  `unrecordDeletions` 를 부른다.
- `removeDeletions`(순수 함수)는 `Set` 멤버십으로 정확히 넘겨받은 id 만 제거한다 — 다른 항목이
  실수로 함께 빠지거나 남는 반례를 테스트 17개(`deletionLog.test.ts`)로 확인했고, 직접 재확인한
  핵심 케이스: "여러 id 를 한 번에", "로그에 없는 id 는 무변화", "관계없는 되돌리기는 기존 기록
  유지". kind 를 무시하고 id 로만 매칭하지만 id 는 `crypto.randomUUID()` 전역 유일이라
  Defect/Memo/Photo 간 충돌 가능성이 없음 (`db.ts` `newId()` 확인).
- **경계 케이스**: `cleanupResurrected` 는 "되살아난 것만"이 아니라 **그 flush 배치의 upsert 전체**
  id 로 `unrecordDeletions` 를 부른다. 이는 과잉 호출이지만 안전하다 — 삭제 로그에 없는 id 는
  `removeDeletions` 가 조용히 무시하고(`next===log` 면 `meta` 쓰기도 생략), upsert 로 들어오는
  id 는 정의상 지금 `state.defects`/`memos` 에 실존하는 레코드라 "삭제됐는데 아직 로그에 남아
  있다"는 상태만 존재할 수 있다 (=Undo 로 되살아난 경우). 오탐(잘못 지우는 경우)은 없다.
- **Photo**: `usePhotos.ts` `remove()` 를 직접 읽어 확인 — 화면에서는 즉시 지우되(`applyList`),
  실제 `commitDelete([photoId])` → `repo.deletePhotos` 호출은 `PHOTO_UNDO_MS`(10초) 뒤
  `window.setTimeout` 콜백에서만 일어난다. `[되돌리기]` 버튼은 `pendingRef.current.get(photoId)`
  가 `undefined` 가 아닐 때만(=아직 타이머가 살아있을 때만) 동작하고, 그 경우 `clearTimeout` 으로
  실제 삭제를 아예 취소한다 — `recordDeletion` 이 호출될 일 자체가 없다. 따라서 Photo 에는 별도
  `unrecordDeletions` 호출이 필요 없다는 builder 주장이 코드로 확인된다. `beforeunload`/언마운트
  시 `flushPendingDeletes` 로 조기 확정되는 경로도 있어 "10초를 못 기다리고 탭을 닫아도 지운 사진이
  되살아나지 않는다"는 주석과 일치한다.

## 3. 트랜잭션 원자성 — 결과: 한 트랜잭션 안에서 함께 커밋됨

10개 하드삭제 지점 전부, `store.delete(...)` 와 `recordDeletion(tx, ...)` 가 **같은 `tx` 인스턴스**를
공유하고, 메서드 끝에서 `await txDone(tx)` 를 **한 번만** 호출한다 (개별 커밋 없음). 확인한 트랜잭션
스코프 목록 — 전부 `STORE.meta` 포함:

`deleteBuilding`([...,`STORE.meta`]) · `deleteFloor`([...,`STORE.meta`]) · `registerDrawings`
([...,`STORE.meta`]) · `deleteDrawing`([...,`STORE.meta`]) · `deleteDefects`([`STORE.defects`,
`STORE.meta`]) · `deleteMemos`([`STORE.memos`,`STORE.meta`]) · `deletePhotos`([...,`STORE.meta`]) ·
`purgeOrphanPhotos`([...,`STORE.meta`]) · `upsertDefects`([`STORE.defects`,`STORE.meta`]) ·
`upsertMemos`([`STORE.memos`,`STORE.meta`]).

`recordDeletion`/`unrecordDeletions` 는 `tx.objectStore(STORE.meta)` 를 직접 받아쓰므로, 호출하는
쪽이 스코프에 `STORE.meta` 를 빠뜨리면 `NotFoundError` 로 **그 자리에서 즉시 실패**한다(조용히
무시되지 않음) — 10곳 전부 스코프에 포함된 것을 diff 로 개별 확인했다. `await reqAsPromise(...)` 로
트랜잭션 안에서 여러 요청을 순차 대기하는 패턴은 이 커밋 이전부터 `purgeFloorIn` 등에서 이미 쓰이던
방식이라 새로운 위험이 아니다.

"삭제는 됐는데 기록만 안 남는 반쪽 상태"가 발생하려면 `store.delete()` 이후 `recordDeletion()` 호출
전에 트랜잭션이 중간 커밋되거나 실패해야 하는데, IndexedDB 트랜잭션은 (a) 명시적 `abort()`,
(b) 처리되지 않은 예외, (c) 이벤트 루프가 유휴 상태로 돌아갈 때만 종료된다. 이 코드는 매 단계마다
`await` 로 다음 요청을 기다릴 뿐 매크로태스크로 넘어가지 않으므로 트랜잭션이 살아있는 상태로
이어진다 — 기존 코드베이스가 이미 의존하고 있는 성질과 동일하다.

## 4. `DB_VERSION` — 결과: 유지됨 (1)

`db.ts` diff 없음. `DB_VERSION = 1` 그대로. 새 오브젝트 스토어·인덱스 없음 — `meta` KV 를
`deleted:{projectId}` 키로 재사용(`exportRun:`·`lastView:` 와 같은 수법).

## 5. 순수 함수 경계 케이스 테스트 — 결과: 충분함

`deletionLog.test.ts` 17개 실행 확인(통과). 중복 id(같은 kind+id 재기록 시 이전 항목 대체),
빈 배열(`removeDeletions([], ['x1'])`, `appendDeletion([], e)`), 빈 id 목록(`removeDeletions(log, [])`
→ 같은 참조 반환), 잘못된 kind/타입/누락 필드(`isDeletionEntry`/`isDeletionLog` 거부), kind 무시하고
id 전역 매칭, 부수효과 없음(원본 배열 불변) 전부 테스트로 커버됨.

## 지적 사항
없음 (심각/보통/경미 전부 0건).

## 불변식 검수표

| # | 항목 | 결과 | 근거 |
|---|---|---|---|
| 하드삭제 경로 완전성 | 6종 스토어를 직접 `.delete()` 하는 모든 지점이 `recordDeletion` 을 거친다 | ✅ | §1 — grep 전수조사 10/10 |
| Undo 정리 정확성 | 되살아난 id 만 정확히 로그에서 빠진다 | ✅ | §2 — 테스트 17개 + 코드 직독 |
| Photo undo 무기록 | 10초 창 안에 되돌리면 애초에 기록되지 않는다 | ✅ | §2 — `usePhotos.ts` 직독 |
| 트랜잭션 원자성 | delete 와 기록이 같은 tx·같은 커밋 | ✅ | §3 |
| `DB_VERSION` 유지 | 1 그대로, 마이그레이션 0건 | ✅ | §4 |
| 순수 함수 경계 케이스 | 중복/빈 배열/오염값 전부 커버 | ✅ | §5 |

## 확인하지 못한 것 / 참고 (이번 커밋과 무관 — 후속 검토용)

- **`registerDrawings` 가 같은 층의 기존 도면을 교체할 때, 그 옛 도면에 달린 메모(`by_drawing`)를
  지우지 않는다** — `purgeFloorIn` 은 도면을 지우기 전에 메모를 함께 지우지만, `registerDrawings`
  는 도면 레코드만 지우고 메모는 그대로 남긴다(`repo.ts` 424~434행, `git log -p` 로 이 동작이
  이번 커밋 이전부터 있던 기존 코드임을 확인). 하드삭제가 일어나지 않으므로 **이번 삭제 로그의
  정확성 문제는 아니다**(누락된 `recordDeletion` 이 없음 — 애초에 지우질 않는다). 다만 그 메모가
  가리키는 `drawingId` 가 더 이상 존재하지 않는 도면을 가리키게 되어 화면에서 영구히 안 보이는
  고아 레코드가 될 수 있다. Q58/T1-3 스코프 밖이라 여기서는 지적하지 않고 기록만 남긴다.
- T1-7(동기화 API)이 아직 없어 `getDeletionLog`/삭제 로그 자체가 실제로 서버에 push 되는 것은
  이번 범위에서 검증 대상이 아니다(설계상 의도된 상태).
