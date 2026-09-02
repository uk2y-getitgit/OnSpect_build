# 구현 로그 — Phase 5 T2-5 (마지막 뷰포트 영속)

범위: `_workspace/50_plan-reviewer_spec_Phase5_TeamSync.md` §6-2 표의 **T2-5 만**.
T2-1(태블릿 셸)은 다른 배치가 병행 작업 중이라 손대지 않았다 — 아래 "공유 작업트리 메모" 참고.

## 공유 작업트리 메모 (중요)

착수 시점에 작업트리를 확인해보니 **T2-5 에 필요한 코드가 이미 전부 작성돼 있었다** —
`apps/web/src/data/idb/lastView.ts` · `apps/web/src/data/useLastView.ts` ·
`packages/canvas-core/src/viewport.ts` 의 `ViewCenter`/`viewCenterOf`/`restoreViewEvents` ·
`packages/canvas-core/test/lastView.test.ts` · `repo.ts` 의 `getLastView`/`putLastView` 위임 메서드 ·
`CanvasRoute.tsx` 의 `useLastView(...)` 호출까지, 스펙 §6-2 요구사항(디바운스 저장·이탈 시 플러시·
`meta` KV 재사용·DB_VERSION 1 유지)을 정확히 충족하는 상태로 **미커밋 상태**로 남아 있었다.
(이전 세션이 구현을 끝내고 커밋 전에 중단된 것으로 보인다.)

동시에 같은 작업트리 인덱스에 **T2-1(태블릿 셸) 배치의 변경도 함께 staged** 되어 있었다
(`apps/web/src/store.ts`·`styles.css`·`apps/web/src/shell/*`·`_workspace/61_builder_log_Phase5_TabletShell.md`·
`_workspace/TASKS.md` 의 T2-1 행). `CanvasRoute.tsx` 는 **두 배치가 같은 파일의 인접한 위치를 건드려**
한 diff 안에 섞여 있었다.

지시대로 "다른 배치의 진행 중 변경을 같이 커밋하지 않기" 위해:
1. T2-5 전용 파일(신규 3개 + `viewport.ts`·`repo.ts`) 은 그대로 스테이지.
2. `CanvasRoute.tsx` 는 HEAD 버전에 **T2-5 부분만**(`import { useLastView }` 1줄 +
   `useLastView(projectId, state.canvas, send);` 호출 블록 1개) 얹은 블롭을 만들어
   `git hash-object` + `git update-index --cacheinfo` 로 **그 파일만 부분 스테이지**했다.
   T2-1 이 만든 나머지 변경(셸 판정·시트·히트 프로파일 배선)은 작업트리에 그대로 남아 있고
   인덱스에서는 제외했다 — T2-1 배치가 나중에 이어서 커밋할 수 있다.
3. `store.ts`·`styles.css`·`apps/web/src/shell/*`·T2-1 의 builder 로그·`TASKS.md` 는
   전부 `git restore --staged` 로 인덱스에서 뺐다(작업트리 내용은 손대지 않았다).

## 완료

| 작업 | 파일 | 상태 |
|---|---|---|
| `meta` KV `lastView:{projectId}` 읽기/쓰기 (값 검증 포함) | `apps/web/src/data/idb/lastView.ts` | 기존 코드 확인·검증 완료 |
| `IdbProjectRepo` 위임 메서드 `getLastView`/`putLastView` | `apps/web/src/data/idb/repo.ts` | 기존 코드 확인·검증 완료 |
| 저장 형태(`ViewCenter` = 화면 중앙 정규화 좌표 + 배율) · `viewCenterOf` · `restoreViewEvents` | `packages/canvas-core/src/viewport.ts` | 기존 코드 확인·검증 완료 |
| 복원(용역당 1회) · 디바운스 저장(600ms) · 이탈 시 플러시(`beforeunload`·`visibilitychange`·언마운트) 훅 | `apps/web/src/data/useLastView.ts` | 기존 코드 확인·검증 완료 |
| `CanvasRoute` 배선 | `apps/web/src/routes/CanvasRoute.tsx` (T2-5 부분만 커밋) | 기존 코드 확인·검증 완료 |
| 순수 로직 단위 테스트 9건 | `packages/canvas-core/test/lastView.test.ts` | 기존 코드 확인·검증 완료 |

## 스펙 대조

- **새 오브젝트 스토어 0개, `DB_VERSION` 1 유지** — `meta` 스토어의 `lastView:{projectId}` 키만 쓴다.
  `exportRun:`·`offline:` 과 같은 관용구를 그대로 따랐다(`repo.ts` 위임 메서드 패턴도 동일).
- **디바운스** — 결함 저장(250ms)보다 길게 600ms. 편의 값이라 늦게 써도 손해가 없다는 이유가 주석에 명시돼 있다.
- **나갈 때 확실히 저장** — `beforeunload`·`visibilitychange(hidden)`·훅 언마운트(=라우트 이탈) 3경로 모두 `flushLastView()` 를 부른다.
- **좌표는 화면 크기에 안 묶인다** — `tx`/`ty`(스크린 px) 를 그대로 저장하지 않고 화면 중앙의 **정규화 좌표 + 배율**(`ViewCenter`)을 저장한다. 태블릿 회전·창 크기 변경에도 같은 자리를 가리킨다 — 불변식 #1(도면 좌표 0~1 정규화)과 같은 원칙.
- **동기화 대상 아님** — 스펙 §3-5 표대로 기기 로컬 값. 동기화 코드 어디에도 없다(아직 트랙 1 자체가 미착수).
- **저장된 도면이 다르면 복원하지 않는다** — `v.drawingId !== drawingId` 체크. 남의 층 좌표를 다른 도면에 씌우지 않는다.
- **실패해도 조용히 넘어간다** — `getLastView`/`putLastView` 실패를 `.catch(() => {})` 로 삼킨다. 편의 기능이 결함 데이터 저장 배너를 오염시키지 않는다.

## 미완료 / 막힌 것

없음. T2-5 범위는 이미 완전한 상태였다.

## 검증한 것

- `npm run typecheck` — 3개 워크스페이스(canvas-core·project-core·web) 전부 오류 0
- `npm test` — canvas-core 392건(신규 `lastView.test.ts` 9건 포함) + project-core 308건, 전부 통과 (합계 700)
- `npm run build` (`apps/web`) — 성공. `dist/sw.js` 포함 정상 산출
- 위 검증은 **현재 작업트리 전체**(T2-1 미커밋분 포함) 기준으로 돌렸다 — 커밋 대상만 분리해 컴파일하지는
  않았지만, T2-5 커밋분은 T2-1 쪽 심볼(`useUiMode`·`shell`·`tablet`·`sheetMode` 등)을 전혀 참조하지 않아
  (diff 확인됨) 독립적으로도 컴파일된다고 판단한다.

## 직접 확인해주실 것

- 도면을 확대·이동한 뒤 다른 화면으로 나갔다가 같은 용역·같은 층을 다시 열면 **같은 자리·배율로 열리는가**
- 층을 바꾼 뒤 원래 층으로 돌아오면(다른 도면) 엉뚱한 자리로 튀지 않고 **그 층 나름의 전체 맞춤/저장값**으로 여는가
- 태블릿에서 화면을 회전한 뒤에도 보던 지점이 유지되는가(단위 테스트로는 확인, 실기기 확인 필요)
- 비행기 모드 등 저장소 접근이 막혀도 캔버스 진입 자체가 막히지 않는가(조용히 전체 맞춤으로 열리는지)

## 알려진 한계

- `apps/web/src/routes/CanvasRoute.tsx` 는 **T2-5 부분만 이번 커밋에 포함**했다. 같은 작업트리에
  T2-1(태블릿 셸) 변경이 아직 미커밋 상태로 남아 있다 — 그 배치가 이어서 커밋해야 한다.
- `_workspace/TASKS.md` 는 건드리지 않았다(T2-1 배치의 편집이 이미 섞여 있어, 상태 갱신은 리더 몫으로 남긴다).
