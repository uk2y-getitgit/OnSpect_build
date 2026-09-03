# B7 — C-4 영역선택 (마퀴 + 일괄 삭제 + 일괄 이동)

작업자: 리더 직접 · 브랜치 `feat/ui-behavior-0903` · 근거: **D32**
커밋 2건: `069839e`(C-4a 선택·삭제) · C-4b(이동)

---

## 제스처 — 사용자 지정안 그대로

plan-reviewer 가 낸 3안(도구 추가 / 더블클릭 모드전환 / 타이밍 판정)은 **하나도 안 썼다.**

> 사용자 확정(D32): *"기존 선택 도구 활성화 상태에서 드래그하면 영역선택으로 진행"*

- **선택 도구 + 빈 곳부터 드래그** → 사각형이 그려지고 놓으면 안에 걸친 결함이 전부 잡힌다
- **더블클릭을 안 쓴다** → 빈 곳 더블클릭 = 화면 맞춤(fit) 이 그대로 산다
- **팬을 안 잃는다** → 중클릭 · Space+좌클릭이 원래부터 팬이었다. 둘 다 테스트로 고정했다
- 다른 도구(점·화살표·영역·그리기)에서는 예전처럼 빈 곳 드래그가 팬이다

## `Selection` 을 배열로 바꾸지 않았다 — 이 배치의 핵심 판단

plan-reviewer 가 "여기를 잘못 확장하면 나중에 전부 갈아엎어야 한다(고유 함정과 같은 등급)" 로
경고한 지점이다. `Selection.defectId` 는 **히트 판정 · 렌더 하이라이트 · 편집 툴바 · Inspector ·
좌측 리스트 · Undo** 여섯 곳이 전부 단수 전제로 읽는다. 하나만 놓쳐도 조용히 어긋난다.

다중은 **삭제 · 이동에만** 쓰이므로 `CanvasState.multi: readonly string[]` 별도 목록으로 뒀다.
단일 선택 경로는 한 줄도 안 바뀌었다.

- 새로 누르면 `multi` 는 풀린다. **단 이미 잡혀 있는 결함을 누른 것이면 유지한다** —
  그래야 여러 개를 잡아 놓고 그중 하나를 끌어 함께 옮길 수 있다
- 사각형에 **겹치기만 해도** 잡는다(완전 포함 아님) — 현장에서 대충 두르는 제스처다
- 판정 대상은 번호 풍선과 마크. 자유그리기 획은 결함 표기가 아니라 제외

## 잠긴 결함 — 선택은 되고, 삭제·이동에서만 빠진다

선택 단계에서 조용히 빼면 "왜 저건 안 잡히지" 가 된다. 그래서 잡히긴 하고,
**빠진다는 사실을 숫자로 말해 준다** — 삭제는 확인창에서, 이동은 토스트에서.

## 일괄 삭제 — 커맨드 하나 = Undo 한 스텝

`DELETE_DEFECTS` / `CREATE_DEFECTS` 배치 커맨드를 새로 만들었다.
`DELETE_DEFECT` 를 N개 쌓으면 20개 지운 뒤 Ctrl+Z 를 20번 눌러야 한다 — 되돌리기가 아니라 벌이다.

잠금은 **두 번 거른다**: 확인 요청 시점(안내 숫자 계산)과 커밋 시점(마지막 관문은 리듀서).
`setDefectAttrs` 와 같은 원칙이다.

## 일괄 이동 — 델타 하나만 저장한다

`TRANSLATE_DEFECTS { defectIds, dx, dy }`.
결함마다 from/to 를 담으면 커맨드가 커지고 되돌리기가 어긋날 여지가 생긴다.
델타 하나면 **역커맨드가 부호만 뒤집으면 된다.**

**클램프는 결함마다 하지 않고 델타 자체를 좁힌다**(`clampDefectsTranslate`).
결함마다 따로 자르면 한 결함만 벽에 걸려 멈추고 나머지는 계속 가서 **상대 위치가 깨진다** —
여러 개를 함께 옮기는 의미가 사라진다.

**라벨은 사용자가 직접 옮긴 것(`placed`)일 때만 따라간다.** 자동 배치 라벨은 마크를 따라
매번 다시 계산되므로 좌표를 건드리면 이중으로 밀린다(A2 와 같은 규칙).

미리보기와 커밋이 **같은 함수**(`translateDefects`)를 탄다 — 갈라지면 손을 뗀 순간 그림이 튄다.
테스트로 델타 일치를 고정했다.

---

## 변경 파일

| 파일 | 내용 |
|---|---|
| `packages/canvas-core/src/types.ts` | `DragKind` += `MARQUEE`·`MOVE_MULTI` · `CanvasState.multi` · 입력/이펙트 `CONFIRM_DELETE_DEFECTS` |
| `packages/canvas-core/src/interaction.ts` | 마퀴 시작·갱신·확정 · `defectsInRect` · `marqueeRectOf` · `multiTranslateOf` · `MOVE_MULTI` 드래그 · `onDelete` 다중 분기 |
| `packages/canvas-core/src/defectGeom.ts` | `translateDefect(s)` · `clampDefectsTranslate` · `markBounds` |
| `packages/canvas-core/src/renderModel.ts` | 마퀴 사각형 · 다중선택 점선 상자 · `buildScreens` 의 `translate` |
| `packages/canvas-core/src/commands.ts` | `DELETE_DEFECTS`·`CREATE_DEFECTS`·`TRANSLATE_DEFECTS` |
| `packages/canvas-core/test/marquee.test.ts` | 신규 — 25건 |
| `packages/canvas-core/test/phase5TrackA.test.ts` | 팬 테스트를 중클릭으로 (D32 가 좌클릭 자리를 가져갔다) |
| `apps/web/src/canvas/CanvasView.tsx` | `multi`·`marquee`·`translate` 전달 |
| `apps/web/src/store.ts` | `ConfirmState` 다중 변형 · `CONFIRM_DELETE_DEFECTS` 이펙트 |
| `apps/web/src/routes/CanvasRoute.tsx` | 다중 삭제 확인창 |

저장 스키마 변경 0 · `DB_VERSION` 1 유지. `multi`·`marquee`·`translate` 는 전부 순수 파생값이라
저장·Undo 어디에도 안 들어간다.

---

## 검증

| 항목 | 결과 |
|---|---|
| `npm run typecheck` (3 워크스페이스) | 통과 |
| `npm test` | **793개 전부 통과** (canvas-core 446 · project-core 347, 신규 25 포함) |
| `npm run build` | 통과 |

---

## 세운 가정

| # | 가정 | 되돌리는 비용 |
|---|---|---|
| B7-a | 다중선택 하이라이트는 **점선 상자**만 두른다(단일 선택의 글로우와 구분) | 렌더 6줄 |
| B7-b | 다중 이동 중에는 **스냅·정렬 가이드를 끈다.** 여러 개가 각자 다른 줄에 붙으려 하면 결과가 예측 불가다 | 스냅 로직 추가 필요 |
| B7-c | 스타일 일괄 변경은 **안 만들었다** (D32 범위: 삭제+이동) | 새 배치 커맨드 필요 |
| B7-d | 다중선택 상태에서 우측 패널은 **예전 그대로**(마지막 단일 선택 기준)다. "N개 선택됨" 화면은 안 만들었다 | Inspector 분기 추가 |
| B7-e | 마퀴는 **한 번에 하나**다. Shift 로 선택에 더하기는 안 만들었다 | 키 분기 한 줄 |

---

## 직접 확인해주실 것

1. **선택 도구**로 빈 곳부터 드래그 → 파란 점선 사각형이 그려진다
2. 놓으면 사각형에 걸친 결함들에 **점선 상자**가 붙고 "N개를 선택했습니다" 토스트
3. **Delete** → "결함 N건을 삭제할까요?" 확인창 → 삭제 → **Ctrl+Z 한 번**에 전부 되살아난다
4. 잡힌 것 중 하나를 **끌면 전부 같이 움직인다.** 놓으면 그 자리에 확정, Ctrl+Z 한 번에 복귀
5. **상대 위치가 유지된다** — 도면 가장자리까지 밀어도 서로 뭉치지 않는다
6. **전회차(보라)·보수완료(회색)가 섞인 채로** 삭제 → "N건은 잠겨 있어 그대로 남습니다" 안내
7. 잠긴 것이 섞인 채로 이동 → 잠긴 것만 제자리에 남는다
8. **⚠️ 팬 회귀** — 중클릭 드래그, Space+좌클릭 드래그로 화면이 움직인다
9. **⚠️ fit 회귀** — 빈 곳 **더블클릭**하면 화면 맞춤이 그대로 된다
10. **다른 도구**(점·화살표·영역·그리기)에서 빈 곳 드래그 → 예전 동작 그대로
11. 결함 하나만 클릭 → 예전처럼 단일 선택 (다중선택이 안 끼어든다)
12. 정렬(`번호 정렬`)·삭제·이동을 섞어 쓴 뒤 **새로고침** → 전부 저장돼 있다
