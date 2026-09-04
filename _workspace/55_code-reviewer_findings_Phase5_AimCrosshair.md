# 검수 결과 — Phase 5 · T2-2 정밀 표기(조준 크로스헤어, D22/Q55 안 A)

대상 커밋: `d80477a`(구현) · `b541cc8`(가정 기록 X1~X6)
대상 파일: `apps/web/src/canvas/{AimOverlay.tsx, aimSynth.ts, CanvasView.tsx, ToolPalette.tsx}` ·
`apps/web/src/routes/CanvasRoute.tsx` · `apps/web/src/styles.css`
근거 문서: Q55, D22, `_workspace/50_plan-reviewer_spec_Phase5_TeamSync.md` §6-2 T2-2,
`_workspace/mobile_mockup/M05a_AimCrosshair.dc.html`

## 판정

**통과**

지시받은 6개 확인 항목을 코드에서 직접 추적했고, 심각/보통 등급 지적사항 없음.
builder 주장(구현 로그)이 실제 코드와 전부 일치했다.

---

## 지시 항목별 확인 결과

### 1. "canvas-core 변경 0" 주장 검증 — **사실**

`git show --stat d80477a` 확인:

```
_workspace/53_builder_log_Phase5_AimCrosshair.md | 140 +
apps/web/src/canvas/AimOverlay.tsx               |  74 +
apps/web/src/canvas/CanvasView.tsx               |  52 +-
apps/web/src/canvas/ToolPalette.tsx              |  43 +-
apps/web/src/canvas/aimSynth.ts                  |  45 +
apps/web/src/routes/CanvasRoute.tsx              |  32 +
apps/web/src/styles.css                          | 149 +
```

`packages/canvas-core`는 목록에 없다. `b541cc8`은 `_workspace/ASSUMPTIONS.md` 한 파일만 건드렸다.
병행 배치(T1-2, 커밋 `64fc3fe`)가 `packages/canvas-core/{types.ts,interaction.ts,...}`를 먼저
바꿔 놨고, 이 배치는 그 위에서 작업했을 뿐 **추가로 코어를 건드리지 않았다** — 혼동 없음.

### 2. 조준 중 탭 = 팬/줌 전용 — **사실, 코드로 확인**

`packages/canvas-core/src/interaction.ts` `onPointerDown`:

```ts
// 946: 중클릭 · Space+좌클릭 → 팬
if (ev.button === 1 || (ev.button === 0 && ev.keys.space)) return startPan(false);
```

이 분기는 **도구별 로직(ERASER 950행, 도형 생성 985행, 히트테스트 969행)보다 먼저** 온다.
`CanvasView.tsx`의 `panOnly()`가 `aiming`이 켜지면 실제 포인터 3형제(`pointerDown/Move/Up`)에
`keys.space:true`를 실어 보내므로, 조준 중에는 어떤 도구가 켜져 있든 **무조건 이 분기로 빠진다.**

더 정밀하게: `startPan(false)`(마지막 인자 `pointToolCandidate=false`)로 호출되므로, 조준 중
직접 탭(이동 없는 down+up)해도 `onPointerUp`의 `if (drag.pointToolCandidate && ...) createDefectAt(...)`
경로 자체가 막힌다 — 점 도구라도 결함이 생기지 않는다(단순히 "생성 로직에 못 미친다"가 아니라
"생성 후보 자격 자체가 꺼진다"는 이중 방어).

`DOUBLE_CLICK`·`CONTEXT_MENU`도 `CanvasView.tsx`에서 `aiming` 가드로 코어 전송 자체를 막는다
(521행, 532행) — X1 주장과 일치.

**끄면 원복되는지**: `aiming: true→false` 전이 시 `useEffect`(452행 부근)가
`KEY_UP ' '`(`space:false`)를 보내 `state.keys`를 초기화한다. 이후 `panOnly()`는
`spaceRef.current || aiming` = `false || false` = `false`가 되어 정상 탭 경로(999행,
`startPan(next0.tool === 'POINT')`)로 복귀한다. 코드로 확인 — 정상.

### 3. `[여기]` 합성 이벤트가 실제 탭과 같은 경로를 타는지 — **사실**

`aimSynth.ts`의 `aimTapEvents`는 `keys.space:false`로 `POINTER_DOWN`+`POINTER_UP`을 만들어
기존 `send()`를 그대로 통과시킨다(새 리듀서 분기 없음). 코어 쪽에서 도구별 결과를 추적:

- **점(POINT)**: `!hit` → `startPan(true)` → `onPointerUp`에서 이동 없음 + `pointToolCandidate`
  + `tool==='POINT'` → `createDefectAt(cleared, ev.screen, ctx)`. `ev.screen`은
  `aimCenterOf(host)`와 동일 지점 — 십자선 자리에 정확히 찍힌다.
- **화살표(ARROW)**: `startCreateShape` → `commitCreateShape`에서 `g.points.length < 2`
  (드래그가 없어 점이 1개뿐) → 아무것도 만들지 않고 `TOAST 끌어서 방향을 정해 주세요` 경고만 낸다.
- **영역(AREA_RECT/ELLIPSE)**: 같은 함수에서 `dist(aS, bS) < CREATE_MIN_DRAG_PX` →
  `TOAST 끌어서 크기를 지정해 주세요` 경고, 생성 없음.
- **자유그리기(SKETCH)/메모(MEMO)**: `commitCreateSketch`/`commitCreateMemoInk`에서
  `pts.length < 2` → `TOAST` 경고만, 생성 없음.

전부 **실제 손가락으로 이동 없이 탭했을 때와 완전히 동일한 코드 경로**다. 새 분기가 없으므로
"실제 탭 vs 합성 탭"이 다르게 취급될 방법이 구조적으로 없다.

### 4. 핀치 오인식(B-1) 재발 여부 — **재발 없음, 코드로 확인**

`pointerAdapter.ts`의 `touchesIn(el, list)`은 `el.contains(t.target)`으로 걸러
"호스트(.canvas-host) 밖에서 시작한 접점"을 제외한다. `CanvasView.tsx`의 `onTouchStart/Move/End`는
전부 이 필터를 거쳐 `e.touches`(화면 전역 접점 목록)를 정제한다.

DOM 구조 확인(`CanvasRoute.tsx` 839~892행): `<CanvasView>` 내부(`children`)에는 `AimCrosshair`만
들어가고(575행 `{children}`이 `.canvas-host` 안에 렌더됨 — `CanvasView.tsx`), `AimControls`
(`[여기]` 버튼 + 안내 띠)는 `<main className="stage">` 아래 `CanvasView`의 **형제**로 렌더된다
(890~892행). 즉 `[여기]` 버튼은 `.canvas-host` 밖에 있고 `touchesIn()`의 `el.contains()` 필터에
걸리지 않는다 — 버튼을 누르는 엄지가 핀치 2번째 접점으로 세어지지 않는다.

CSS도 대응: `.aim-cross`는 `pointer-events:none`(입력 자체를 안 먹음), `.aim-confirm`은
`.stage`(`position:relative`) 기준 `position:absolute`로 배치되는데, `.canvas-host`가
`.stage`에 `inset:0`으로 꽉 차 있어 두 좌표계가 동일 기준을 공유한다 — 위치 어긋남도 없다.

### 5. 터치 전용 기기 판정 — **T-5/P6와 동일 규칙**

`.palette__slot--aim { display:none }` (기본) → `@media (hover:none) and (pointer:coarse) { display:block }`.
같은 미디어쿼리 블록 안에 기존 `.photos__capture { display: inline-flex }`(P6 촬영 버튼)가
나란히 있다 — 정확히 같은 규칙 재사용. 규칙 순서도 확인: 기본값(4202행)이 미디어쿼리(4220행)보다
**앞**에 있어 특이도 동률 시 CSS 뒤에 오는 규칙(미디어쿼리 내부)이 이긴다 — 의도대로 동작.
PC(마우스, `hover:hover`/`pointer:fine`)에서는 `display:none`이 유지되어 버튼이 보이지 않는다.
JS 판정·UA 스니핑 없음 — 기존 관례와 완전히 일치.

### 6. 알려진 한계 3건 — **전부 스펙 위반 아님**

`_workspace/mobile_mockup/M05a_AimCrosshair.dc.html`과 D22 원문을 직접 확인:

- 목업은 `[여기]` 버튼 하나만(우하단 고정) 그린다 — 좌/우손 선택 UI 없음.
- 목업의 팔레트에는 "영역" 도구 아이콘만 있고, 조준으로 영역/화살표를 **드래그로 그리는** 동작에 대한
  설명은 목업·D22 어디에도 없다.
- D22·Q55 어디에도 "조준 상태를 저장/영속한다"는 요구 문구가 없다. D22가 강조한 것은 "확정 후에도
  꺼지지 않아 연속 표기가 빠르다"(같은 화면 세션 내 유지)뿐이며, 이는 실제로 구현돼 있다
  (`CanvasRoute.tsx`의 `aimOn` state는 `fireAim` 이후에도 리셋되지 않는다 — `onConfirm`이
  `setAimOn`을 건드리지 않는 것을 코드로 확인).

세 한계 전부 **스펙에 없는 요구**이지 스펙 위반이 아니다. 반려 사유가 되지 않는다.

---

## 추가로 확인한 것 (지시엔 없지만 경계면상 중요)

- `npm run typecheck --workspace=apps/web` 직접 실행 → 에러 없음(builder 주장과 일치).
- `keys.space`가 코어 전체에서 딱 2곳(`interaction.ts:431` 커서 판정, `:947` 팬 분기)에서만
  쓰인다는 X2의 주장을 `grep`으로 직접 재확인 — 정확히 일치. 이 필드를 조준 목적으로 강제 주입해도
  WHEEL·PINCH 등 다른 제스처 경로에 부작용이 없다.
- `AIM_POINTER_ID = -1`이 코어·어댑터 어디의 기존 pointerId 처리와도 충돌하지 않음을
  `pointerId` 전역 검색으로 확인 — 예약된 음수 id 없음, `number` 타입이라 타입 충돌도 없음.
- `onPointerMove`(코어)는 이미 시작된 `drag`가 있으면 `keys.space`를 더 이상 보지 않는다
  (`drag.kind`만 본다) — 조준을 팬 도중에 껐다 켜도 진행 중이던 팬이 끊기거나 튀지 않는다. 확인.
- `KEY_UP` 처리(`interaction.ts:900`)가 `state.keys` **전체**를 덮어쓴다 — 조준을 끄는 순간
  사용자가 우연히 물리 키보드로 Alt/Shift/Ctrl을 누르고 있었다면 그 상태도 같이 꺼진다.
  터치 전용 기기(조준 버튼이 보이는 조건 자체가 `pointer:coarse`)에서 물리 키보드+동시 조준
  조작이 겹칠 확률은 낮고, 기존 `onBlur` 안전망과 같은 성격의 트레이드오프라 **경미 등급으로도
  보고하지 않는다**(재현 가능성이 사실상 없음).

---

## 불변식 검수표

| # | 불변식 | 결과 | 근거 |
|---|---|---|---|
| 1 | 좌표 0~1 정규화 | 무영향 | 이 배치가 만지는 좌표는 전부 CSS px(`aimCenterOf`)이고, 정규화·저장은 기존 `createDefectAt`/`commitCreateShape` 경로가 그대로 수행. 코어 미변경 |
| 2 | 출력번호 미저장 | 무영향 | 번호 계산 코드 미변경 |
| 3 | 로컬 우선 쓰기 | 무영향 | 저장 경로 미변경 |
| 4 | 면적 계산 | 무영향 | 면적 계산 미변경 |
| 5 | 층 정렬 | 무영향 | 해당 없음 |
| 6 | 마스터+연결 | 무영향 | 해당 없음 |
| 7 | 설정 스냅샷 | 무영향 | 해당 없음 |
| 8 | isPrimary 1장 | 무영향 | 사진 로직 미변경 |

이번 배치는 8개 불변식 중 어느 것도 직접 다루지 않는다(순수 UI/어댑터 층 기능). 코어·저장 로직을
바꾸지 않았다는 "코어 변경 0" 주장 자체가 곧 이 불변식들에 손을 대지 않았다는 근거다.

## 확인하지 못한 것

- **실기기 손맛** — 십자선 두께, `[여기]` 버튼이 실제 엄지에 자연스럽게 닿는지, 미디어쿼리가
  실제 태블릿에서 조준 토글을 정확히 노출/은닉하는지는 코드로 판단 불가. builder가 이미
  "직접 확인해주실 것"에 동일하게 남겨 두었다 — 중복 없이 그대로 사용자 확인 항목으로 넘긴다.
- **`apps/web` 단위 테스트 부재** — `aimSynth.ts`(순수 함수)에 대한 자동 테스트가 없다.
  builder가 "코어 변경 0을 지키기 위해 코어 테스트로 옮기지 않았다"고 명시적으로 밝혔고
  X6에도 기록돼 있다. 반려 사유는 아니지만, 이 함수는 좌표 계산(중심점)과 이벤트 페어링이라는
  단순 로직이라 회귀 위험은 낮게 판단한다.
- **프로덕션 빌드**는 직접 재실행하지 않았다(builder 로그의 typecheck는 직접 재실행해 확인했고
  결과가 일치했으므로, 빌드까지 별도로 돌리지 않음 — 리더 단계에서 어차피 재실행됨).
