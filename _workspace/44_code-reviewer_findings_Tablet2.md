# 검수 결과 — 태블릿 배치2 (T-1 필기 점선상자 · T-2 핀치줌)

- **대상 커밋:** `27c4b83` (구현) · `1499d61` (로그만)
- **스펙:** `_workspace/00_input/scope_TabletFeedback0901.md` §T-1 · §T-2
- **구현 로그:** `_workspace/42_builder_log_Tablet2.md`
- **읽은 것:** `git show 27c4b83` 전체 diff + 주변 코드(`interaction.ts` 리듀서 진입/POINTER_UP/GESTURE_PINCH,
  `renderModel.ts` memoOps_, `store.ts` 캔버스 상태 쓰기 경로 전부, `locationMap.ts` RenderInput 구성,
  `CanvasRoute.tsx` 오버레이 배치, `styles.css` `.canvas-host`, `test/tabletT1.test.ts`)

---

## 판정

**조건부 통과** — 심각 0건 · 보통 1건 · 경미 3건.

T-1 은 스펙대로다. 세션 종료 지점 누락으로 인한 "상자가 영영 안 뜨는" 회귀는 **없다**(근거 아래).
T-2 의 "3번째 손가락이 결함을 만든다" 는 실제로 막혔고, 핀치 종료 후 플래그가 굳는 경로도 찾지 못했다.
다만 핀치 **감지 범위**가 캔버스 밖 손가락까지 세는 문제가 하나 남아 있다 (보통 1건).

---

## 요청받은 5개 항목 — 코드 추적 결과

### 1. `endInkSessionIfStale()` 가 모든 선택-변경 경로에서 도는가 → **돈다 (회귀 없음)**

`reduce()` 자체가 래퍼다.

```ts
// packages/canvas-core/src/interaction.ts:529
export function reduce(state, ev, ctx) {
  return endInkSessionIfStale(reduceCore(state, ev, ctx));
}
```

`reduceCore` 는 파일 안에서 `reduce`/`reduceCore` 어디서도 우회 호출되지 않는다
(`grep` 결과 정의 530·533 두 줄뿐, 재귀 호출 2234·2236 은 래퍼 쪽을 부른다).
`apps/web` 에서 캔버스 상태를 만드는 곳은 `store.ts:153`(`initialCanvasState`)과 `store.ts:383`(`reduce`)
두 곳뿐이므로 **선택을 바꾸는 모든 InputEvent 경로가 자동으로 커버된다.**
"흩뿌리기 대신 단일 지점" 이라는 builder 의 설계 판단은 검증된다.

유일한 우회는 `store.ts:344 dropStaleSelection()` 이다 (아래 [경미] C-2 참조) — 화면상 무해.

**D14 유지 확인.** `renderModel.ts:649` 조건은 `if (!inking && (selected || hovered))` 이고
`inking = ink.drawing || ink.memoId === m.memoId`. 세션이 끝나면 `inkMemoId === null` 이고
`drawing === false` 라 `inking` 이 항상 false → **D14 조건식이 그대로 남는다.**
테스트 `tabletT1.test.ts:208`(도구 변경 후 상자 부활) · `:216`(ERASER hover 시 상자) 가 이를 고정한다.
지우개 경로는 `tool === 'ERASER'` 라 `inkSessionOf.drawing` 이 애초에 false다.

`inkSessionOf.drawing = tool === 'MEMO' && drag?.kind === 'CREATE_SKETCH'` 의 `CREATE_SKETCH` 판정도
실제 코드와 맞다 — `interaction.ts:989` 에서 `SKETCH`/`MEMO` 둘 다 `startCreateSketch`(`:1193` `newDrag('CREATE_SKETCH'…)`)
를 타고, `:1626-1630` 커밋 시점에 `tool === 'MEMO'` 로 갈린다. `tool` 조건이 붙어 있어 결함 자유그리기(SKETCH)는
세션이 되지 않는다.

### 2. 조사위치도(`locationMap.ts`)가 `inkSession` 을 안 받는 게 맞는가 → **맞다. 출력 무영향**

`apps/web/src/export/locationMap.ts:193-227` 의 `RenderInput` 리터럴에 `inkSession` 키가 **없다**
(`grep inkSession` 결과 `locationMap.ts` 에 0건). `renderModel.ts:277` 이 `input.inkSession ?? null` 로
받아 `ink === null` → `inking = false` → D14 그대로.
게다가 같은 파일 `:203-211` 에서 `selection`/`hover` 를 전부 비우므로 출력에는 원래 상자가 안 나온다.
`buildOverlay` 호출부는 전 코드베이스에 두 곳(`CanvasView.tsx:270`, `locationMap.ts:247`)뿐이라 누락 가능성도 없다.
테스트 `tabletT1.test.ts:228` 이 "세션을 안 넘기면 상자가 보인다"로 반대 방향까지 고정했다. 적절하다.

### 3. 핀치 중 POINTER_DOWN/MOVE/UP 차단 — 실제로 막혔는가 / 종료 후 안 풀리는 경로가 있는가

**(a) 3번째 손가락 차단 — 실제로 막힌다.** 브라우저는 터치 접점마다 `pointerdown` 을 `touchstart` **앞에**
낸다. 그래서:

| 손가락 | pointerdown 시점의 `pinchRef.active` | 결과 |
|---|---|---|
| 1번째 | false | 코어가 드래그 시작 (정상) |
| 2번째 | false | 코어 T3 가드(`interaction.ts:926` `state.drag && drag.pointerId !== ev.pointerId`)가 롤백·폐기 |
| 3번째 | **true** (2번째의 touchstart 에서 켜짐) | `CanvasView.tsx:418` 가드가 차단 ✅ |

가드가 없었다면 3번째는 `state.drag === null`(PINCH_START 가 롤백함)이라 T3 가드를 통과해
`startPan(pointToolCandidate:true)` 로 새 드래그를 만들고, 움직임 없이 떼면
`onPointerUp → createDefectAt`(`interaction.ts:1600-1602`)으로 **점 결함이 실제로 생긴다.**
builder 가 보고한 버그는 실재했고, 수정도 정확히 그 지점을 막는다.

**(b) 핀치 종료 후 정상 조작이 막히는 경로 — 찾지 못했다.** 추적한 해제 경로:

- `onTouchEnd`(el 리스너, touchend·touchcancel 모두 등록) → 남은 접점 `< 2` 면 `endPinch()`
- `onBlur`(window) 안전망 → `active` 면 해제 + `GESTURE_PINCH_END`
- 접점이 3개→2개로 줄 때는 `active` 를 유지하고 **기준만 재설정**(의도대로)

터치 이벤트는 `touchstart` 가 일어난 요소를 계속 target 으로 삼으므로, 캔버스에서 시작한 접점의
`touchend` 는 반드시 `el` 에 도달한다. `pinchRef` 는 `useRef` 라 effect 재실행(`[send]`)에도 살아남고,
`send` 는 `CanvasRoute.tsx:120` 에서 `useCallback(…, [])` 로 고정돼 있어 effect 자체가 한 번만 붙는다.

**(c) 핀치 종료 후 남은 손가락의 `POINTER_UP` 이 오작동하지 않는가 — 안 한다.**
마지막 손가락을 뗄 때는 `active` 가 이미 false 라 `POINTER_UP` 이 코어로 간다. 그런데
`interaction.ts:1592` 가 `if (!drag || drag.pointerId !== ev.pointerId) return ok(...)` 로
**드래그 없는 UP 을 무해하게 흘린다** — 점 결함도 안 생기고 선택도 안 풀린다.
builder 의 "직접 확인해주실 것 #12" 설명(한 손가락 복귀가 이어지지 않음)과 코드가 일치한다.

**(d) PC 회귀 없음.** 터치가 없으면 `active` 는 영원히 false → 세 개의 가드가 전부 통과.
`onBlur` 추가분도 `if (pinchRef.current.active)` 안쪽이다.

### 4. canvas-core 경계 규칙 위반 → **없음**

```
grep -rn "window\.|document\.|from 'react'|navigator\." packages/canvas-core/src/   → 0건
```
T-2 의 DOM 리스닝은 전부 `apps/web/src/canvas/` 안이다. `pointerAdapter.ts` 의 `PinchSample` 도
어댑터 로컬 타입이고 코어로 넘어가지 않는다. 코어가 받는 것은 기존 `GESTURE_PINCH_*` 세 이벤트뿐 —
`git show --stat` 상 `interaction.ts` 변경분은 전부 T-1 이고 핀치 리듀서는 한 줄도 안 바뀌었다. 주장대로다.

### 5. `Touch.identifier` 기준 재설정 → **세 경로 모두 재설정한다 (화면 안 튄다)**

| 상황 | 코드 | 동작 |
|---|---|---|
| 핀치 중 손가락 추가 | `CanvasView.tsx:325` | `last = s` — 이벤트 안 보내고 기준만 |
| 이동 중 추적 쌍 변경 | `CanvasView.tsx:337-341` `sameTouchPair` | 그 프레임 `send` 생략, 기준만 갱신 |
| 하나만 뗌(3→2) | `CanvasView.tsx:349` | `last = pinchSample(...)` 로 새 쌍 기준 |

`sameTouchPair`(`pointerAdapter.ts:110`)가 순서 뒤집힘까지 같은 쌍으로 본다. `factor`/`pan` 이
직전 프레임 대비 상대값이므로 기준만 갈아끼우면 점프가 흡수된다 — 설계가 맞다.
`pinchMove` 의 `prev.dist > 1e-3` 0나눗셈 방어 + `pinchSample` 의 `Number.isFinite` 1차 방어 +
코어의 `finitePoint`·`factor > 0` 2차 방어로 NaN 오염 경로도 이중으로 막혀 있다.

---

## 지적 사항

### [보통] B-1. 핀치 감지가 캔버스 **밖** 손가락까지 센다 — 그리기가 조용히 씹힌다

- **파일:** `apps/web/src/canvas/CanvasView.tsx:307` · `:318` · `:325` · `:333` · `:346-352`,
  `apps/web/src/canvas/pointerAdapter.ts:88-107`
- **문제:** `TouchEvent.touches` 는 **화면 전체**의 접점 목록이다(그 이벤트의 target 요소 것이 아니다).
  `e.touches.length >= 2` 와 `pinchSample(el, e.touches)` 의 `touches[0] / touches[1]` 이
  `.canvas-host` 밖에서 시작한 접점까지 그대로 집어 든다.
  `CanvasRoute.tsx:824-884` 를 보면 `.stage__palette`(도구 팔레트) · `ContextToolbar` · `ContextMenu` ·
  `.stage__pending` · `.stage__help` 는 전부 `CanvasView` 의 **형제**이고, `Inspector`/`Sidebar` 는
  `.stage` 밖이다 — 즉 `.canvas-host` 의 자손이 아니다. 그런데 `.canvas-host { position:absolute; inset:0 }`
  이라 이 플로팅 요소들은 **시각적으로는 도면 위에 겹쳐 있다.**
- **재현:** 태블릿에서 오른쪽 도구 팔레트(또는 우측 Inspector·좌측 Sidebar)에 엄지를 **얹은 채**
  다른 손가락으로 도면에 결함을 그린다.
  1. 캔버스 손가락의 `pointerdown` → 코어가 CREATE 드래그 시작
  2. 같은 손가락의 `touchstart` 가 `el` 에 도달, `e.touches.length === 2`(엄지 + 이 손가락)
     → `GESTURE_PINCH_START` → `cancelDrag`(`interaction.ts:605`)로 **방금 시작한 획이 롤백**
  3. 이어지는 `touchmove` 는 정지한 엄지 좌표를 `touches[0]` 으로 포함해 중점·거리를 계산 →
     한 손가락만 움직이는데 배율·팬이 바뀐다
  결과: **"그리려는데 아무것도 안 그려지고 화면만 움직인다."** 사용자에게는 T-2 이전보다 나쁜 증상이다.
- **수정:** `el` 안에서 시작한 접점만 남기고 그 배열로 판정·계산한다. `targetTouches` 는
  `.canvas-layer` 캔버스가 실제 target 이라 여기서는 쓸 수 없다 — 포함 관계로 직접 거른다.

  ```ts
  // pointerAdapter.ts
  export function touchesIn(el: HTMLElement, list: TouchList): Touch[] {
    const out: Touch[] = [];
    for (let i = 0; i < list.length; i += 1) {
      const t = list[i]!;
      if (t.target instanceof Node && el.contains(t.target)) out.push(t);
    }
    return out;
  }
  // pinchSample 시그니처를 `touches: readonly Touch[]` 로 바꾼다
  ```
  `CanvasView.tsx` 의 `onTouchStart` / `onTouchMove` / `onTouchEnd` 세 곳 모두
  `const ts = touchesIn(el, e.touches)` 로 바꿔 `ts.length` 와 `pinchSample(el, ts)` 를 쓴다
  (`onTouchEnd` 의 `>= 2` 판정도 반드시 같이 바꿔야 한다 — 한쪽만 고치면 해제가 안 되는 새 버그가 된다).
- **덧붙임(같은 수정으로 안 풀림, 참고만):** `MemoEditor` 는 `.canvas-host` **안**에 있으므로
  텍스트 편집 중 두 손가락을 대면 여전히 핀치로 잡힌다. 빈도가 낮아 이번엔 지적하지 않는다.

### [경미] C-1. `onDoubleClick` / `onContextMenu` 에는 핀치 가드가 없다

- **파일:** `apps/web/src/canvas/CanvasView.tsx:466-475`
- **문제:** `onPointerDown/Move/Up` 세 곳에만 `if (pinchRef.current.active) return;` 이 붙었다.
  Android Chrome 은 접점을 길게 누르면 `contextmenu` 를 낸다 — 두 손가락으로 확대한 채 잠시 멈추면
  핀치 도중에 `send(contextMenu(...))` 가 나가 삭제 메뉴가 뜬다.
  `dblclick`(합성 마우스 이벤트)도 마찬가지로 차단되지 않는다.
- **수정:** 두 핸들러 앞에 같은 한 줄을 추가한다. 비용이 없다.

### [경미] C-2. `dropStaleSelection()` 이 `reduce` 를 우회해 `inkMemoId` 를 남긴다

- **파일:** `apps/web/src/store.ts:344-358` (호출: `:257` UNDO · `:284` REDO)
- **문제:** UNDO/REDO 는 `reduce()` 를 안 타고 `canvas.selection` 을 직접 비운다. 그래서
  "`endInkSessionIfStale` 이 유일한 세션 종료 지점" 이라는 불변이 이 한 곳에서 깨진다.
- **영향:** 화면상 무해하다. 남은 `inkMemoId` 가 가리키는 메모는 (a) UNDO 로 사라졌거나
  (b) REDO 로 돌아왔어도 선택이 풀린 상태라, 어느 쪽이든 `selected || hovered` 가 false 여서
  원래도 상자를 안 그린다. 다음 `reduce` 한 번이면 정리된다(hover 조차 `POINTER_MOVE` → `reduce` 를 타므로
  "상자가 안 뜨는 창" 이 생기지 않는다). **회귀 아님.**
- **수정(선택):** `dropStaleSelection` 의 반환 객체에 `inkMemoId: null` 을 한 줄 추가하면
  불변이 코드로도 닫힌다. 급하지 않다.

### [경미] C-3. MEMO 도구를 유지한 채 같은 메모를 다시 고르면 상자가 계속 숨는다

- **파일:** `packages/canvas-core/src/interaction.ts:525`
- **문제:** 세션 유지 조건이 `tool === 'MEMO' && selection.memoId === inkMemoId` 다. MEMO 도구에서
  방금 쓴 메모를 더블탭하면 `interaction.ts:693-708` 이 그 메모를 다시 선택하는데,
  `selection.memoId` 가 여전히 `inkMemoId` 와 같아 세션이 안 끝나고 상자가 계속 안 뜬다.
- **재현:** 필기 → (도구 그대로) 그 필기를 더블탭 → 메모 편집기를 닫는다 → 선택돼 있는데 점선 상자가 없다.
- **판단:** 스펙 문언(*"도구를 바꾸거나 다른 곳을 탭하면"*)의 범위 안이고 편집기가 자체 테두리를 그리므로
  **반려 사유가 아니다.** 신경 쓰이면 `DOUBLE_CLICK` / `SELECT_MEMO` 를 세션 종료 이벤트로 함께 처리하면 된다.

---

## 스펙 대비 이행표

| 스펙 문장 | 이행 | 근거 |
|---|---|---|
| T-1 "드로잉 중(여러 획 이어그리기 포함) 박스 안 그림" | ✅ | `inkMemoId` 가 획보다 오래 산다. 테스트 `:186`(2번째 획 중 1번째 상자도 없음) |
| T-1 "끝나고 도구 바꾸거나 다른 곳 탭하면 기존 규칙 복귀" | ✅ | `interaction.ts:525` + 테스트 `:208` |
| T-1 "D14 자체(선택·hover 시 보임)는 유지" | ✅ | `renderModel.ts:649` 조건식 보존 + 테스트 `:208`·`:216` |
| T-1 "지우개 hover 표시 유지" | ✅ | 테스트 `:216`. ERASER 는 `drawing` 판정에서 애초에 제외 |
| T-2 "리듀서 새로 만들지 않고 DOM 배선만" | ✅ | 코어 핀치 케이스 무변경(`:602-637`), 어댑터만 신설 |
| T-2 "한 손가락 = 기존 pan/draw 유지" | ✅ | `touchstart` 가 `< 2` 면 즉시 return |
| T-2 "두 손가락일 때만 GESTURE_PINCH_* 로 전환" | ⚠️ | 조건은 맞으나 접점 집계 범위가 캔버스 밖까지다 → **B-1** |
| T-2 "phase5TrackA A1 의 좌표계·클램프를 그대로 신뢰" | ✅ | `zoomAt`→`pan`→`clampPan` 전부 코어. 어댑터는 center/factor/pan 만 잰다 |

## 불변식 검수표

| # | 불변식 | 결과 | 근거 |
|---|---|---|---|
| 1 | 좌표 0~1 정규화 | **통과** | 핀치는 `state.viewport`(스크린 공간)만 바꾼다. 저장 좌표를 안 건드린다. 메모 획은 기존 `toNorm`(`interaction.ts:1188`) 경로 그대로이고 `n.x<0||n.x>1` 거부도 유지 |
| 2 | 출력번호 미저장 | **통과** | 이번 커밋에 스키마·타입 추가 없음. `inkMemoId` 는 `CanvasState`(메모리 전용, IDB 미영속)에만 있고 `Memo`/`Defect` 문서에는 안 들어간다 |
| 3 | 로컬 우선 쓰기 | **해당 없음** | `repo.ts`·동기화 큐 미변경 (`git show --stat` 상 변경 7파일에 data/ 없음) |
| 4 | 면적 계산 | **해당 없음** | 미변경 |
| 5 | 층 정렬 | **해당 없음** | 미변경 |
| 6 | 마스터+연결 | **해당 없음** | 미변경 |
| 7 | 설정 스냅샷 | **해당 없음** | 미변경 |
| 8 | isPrimary 1장 | **해당 없음** | 사진 경로 미변경 |

부가 확인: `inkMemoId` 가 Undo 스택/커맨드에 들어가지 않는다(`commitCreateMemoInk` 의 commands 는
`CREATE_MEMO` 하나뿐, 메모 객체에 필드 없음). 파생값이라는 주석대로다.

## 확인하지 못한 것

1. **`touchstart` 의 `preventDefault()` 가 브라우저별로 포인터 이벤트 스트림에 미치는 영향.**
   Chrome/Safari/iPadOS 마다 `pointercancel` 발행 여부가 다를 수 있다. 다만 어느 쪽이든
   `onPointerCancel → POINTER_CANCEL` 은 이미 롤백된 드래그를 다시 지우는 무해한 동작이라
   정합성은 깨지지 않는다고 판단했다. **실기 확인 필요.**
2. **`e.touches` 배열 순서의 브라우저별 안정성.** 순서가 흔들려도 `sameTouchPair` 가 감지해
   기준만 재설정하므로 코드상 점프는 없다고 판단했으나, 프레임 한두 개를 버리는 체감(뻑뻑함)은 코드로 못 본다.
3. **T-2 DOM 배선의 단위 테스트가 없다** (builder 도 명시). `pinchSample`/`sameTouchPair`/`pinchMove` 는
   순수 함수라 `apps/web` 에 vitest 를 붙이면 바로 고정 가능하다. 지금은 타입 검사·빌드까지만 근거다.
4. **builder 가 보고한 테스트 결과(350건 통과 등)를 재실행해 확인하지 않았다.** 테스트 파일 내용은
   직접 읽어 주장과 일치함을 확인했다(13건, 단언이 실제로 회귀를 잡는 형태).
5. 실제 태블릿 손맛(감도·손바닥 오터치·관성)은 코드로 판단 불가 — 사용자 확인 영역.

## 직접 확인해주실 것 (B-1 관련 추가)

builder 체크리스트 #7~#14 에 아래 두 줄을 더해 주시면 B-1 의 실제 영향도를 알 수 있다.

| # | 무엇을 | 어떻게 | 정상 |
|---|---|---|---|
| 15 | 팔레트에 손 얹고 그리기 | 오른쪽 **도구 팔레트에 엄지를 댄 채** 다른 손가락으로 도면에 점/영역을 그린다 | 결함이 정상적으로 그려진다. 화면이 확대·이동하면 **B-1 재현** |
| 16 | 사이드바에 손 얹고 그리기 | 좌측 층 목록 / 우측 Inspector 에 엄지를 댄 채 도면에 그린다 | 위와 같다 |
