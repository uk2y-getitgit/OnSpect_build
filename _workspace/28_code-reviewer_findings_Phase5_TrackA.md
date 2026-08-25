# 검수 결과 — Phase 5 트랙 A (코어 터치 지원), 브랜치 `feat/phase5-track-a` @ `ca2bddf`

기준: `_workspace/26_plan-reviewer_spec_Phase5_Mobile.md` §5-A(A1~A4) · §6-2(T2~T5) · §6-3
대상 diff: `git diff main...feat/phase5-track-a` — 소스 4파일 + 테스트 1파일 + 문서 2파일

## 판정

**조건부 통과** — 심각 0건. "PC 동작 불변" 약속은 **지켜졌다**(아래 근거).
보통 4건은 **T1(터치 어댑터) 착수 전에** 고치는 것이 맞다. 지금 PC를 망가뜨리는 것은 없다.

---

## 재실행으로 직접 확인한 것 (builder 보고를 믿지 않고 재현)

| 항목 | 명령 | 결과 |
|---|---|---|
| `apps/web` 무변경 | `git diff main...feat/phase5-track-a --stat` | **소스 변경은 `packages/canvas-core` 4파일뿐.** `apps/web` 0줄. 위반 없음 |
| 기존 251개 회귀 | `npx vitest run --exclude="**/phase5TrackA.test.ts"` | **15 files / 251 passed** — 신규 파일을 뺀 기존 스위트가 그대로 통과. 게다가 diff에 **기존 테스트 파일 수정이 0** 이라 "테스트를 고쳐서 맞춘" 흔적도 없다 |
| 전체 | `npx vitest run` (canvas-core) | 16 files / **273 passed** (251 + 22) |
| project-core | `npm run test -w @onspect/project-core` | 212 passed |
| 타입 검사 | `npm run typecheck` | canvas-core · project-core · web **exit 0** |
| 프로덕션 빌드 | `npm run build` | **exit 0** |
| 경계 규칙 | 추가 코드 grep | `window` · `document` · `Image` · `requestAnimationFrame` · React 참조 **없음**. 기하 판정 전부 스크린 px |

builder 보고 수치(273/212/빌드성공)는 **전부 재현됐다.** 과장 없음.

---

## 지적 사항

### [보통] 1. `GESTURE_PINCH` 의 `pan` · `center` 가 검증되지 않아 뷰포트가 영구히 NaN으로 오염된다

- 파일: `packages/canvas-core/src/interaction.ts:502-510`
- 문제: `factor` 는 `Number.isFinite(ev.factor) && ev.factor > 0` 로 방어했는데 **`ev.pan` 과 `ev.center` 는 안 했다.**
  `clamp()`(geometry.ts:12)는 `v < min ? min : v > max ? max : v` 라 **NaN을 그대로 통과시킨다.**
  오염된 뷰포트는 `withViewport`(interaction.ts:378-386)가 **`state.viewports[drawingId]` 에 그대로 기억**해서
  층을 옮겼다 돌아와도 되살아난다.
- 재현: 실제로 돌려서 확인했다 (`GESTURE_PINCH{center:{500,350}, factor:1, pan:{x:NaN, y:0}}`)
  ```
  NaN pan  -> {"zoom":0.4, "tx":null, "ty":30}     // null = NaN, viewports 에도 동일하게 기억됨
  recover? -> {"zoom":0.48,"tx":null,"ty":-24}     // 정상 핀치 프레임으로도 회복 안 됨
  wheel    -> {"zoom":0.528,"tx":null,"ty":-61.4}  // 휠로도 회복 안 됨
  ```
  → **도면이 사라지고 `[전체맞춤]`(FIT) 을 누르기 전에는 못 돌아온다.** `CENTER_ON_NORM{n:{x:NaN}}` 도 동일.
- 왜 실제로 일어나는가: T1 어댑터가 `pan = 지금중점 − 직전중점` 을 계산한다(builder 로그 §A1).
  **핀치 첫 프레임에는 "직전중점" 이 없다.** `undefined` 를 빼면 바로 NaN이다.
  이게 상대값 계약의 가장 흔한 실수 지점이고, 코어는 이미 `factor` 에 대해 같은 방어를 하고 있으므로 일관성 문제다.
- 수정 (`interaction.ts:502` 부근):
  ```ts
  const factor = Number.isFinite(ev.factor) && ev.factor > 0 ? ev.factor : 1;
  // 어댑터가 첫 프레임에 pan/center 를 못 내면 NaN 이 온다. 뷰포트에 NaN 이 한 번 들어가면
  // clamp 가 그대로 통과시키고 viewports 에 기억까지 돼 FIT 전에는 회복이 안 된다
  const num = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback);
  const center: SPoint = { x: num(ev.center.x, base.canvas.w / 2), y: num(ev.center.y, base.canvas.h / 2) };
  const pan: SPoint = { x: num(ev.pan.x, 0), y: num(ev.pan.y, 0) };

  const zoomed = zoomAt(base.viewport, center, factor, min, max);
  const panned: Viewport = { zoom: zoomed.zoom, tx: zoomed.tx + pan.x, ty: zoomed.ty + pan.y };
  ```
  `CENTER_ON_NORM`(interaction.ts:520-535)에도 같은 가드가 필요하다 (`ev.n.x/y` → 유한하지 않으면 이벤트 무시).
- 테스트: 기존 "망가진 factor" 테스트(`phase5TrackA.test.ts:141`)와 같은 형태로 `pan`·`center`·`n` 판을 추가.

---

### [보통] 2. `cancelDrag` 는 Escape와 **같은 코드 경로가 아니다** — 똑같은 리터럴이 5곳에 흩어져 있다

- 파일: `packages/canvas-core/src/interaction.ts:407-410`(신규 `cancelDrag`) vs `:1999`(Escape) · `:547`(POINTER_CANCEL)
- 문제: builder 로그는 "Escape 와 같은 규칙" 이라고 썼지만 **Escape는 `cancelDrag()` 를 부르지 않는다.**
  `{ ...state, drag: null, guides: [] }` 라는 **같은 리터럴이 독립적으로 5곳**에 있다:

  | 위치 | 코드 |
  |---|---|
  | 407 `cancelDrag()` | `{ ...state, drag: null, guides: [] }` ← 신규 |
  | 1999 `onKeyDown` Escape | `{ ...s, drag: null, guides: [] }` |
  | 547 `POINTER_CANCEL` | `{ ...state, drag: null, guides: [] }` |
  | 460 `SET_TOOL` | `{ ...state, tool: ev.tool, drag: null, guides: [] }` |
  | 1410 `onPointerUp` `cleared` | `{ ...state, keys: ev.keys, drag: null, guides: [] }` |

  **오늘은 동작이 완전히 같다**(글자 단위로 대조했다 — 그래서 심각이 아니다).
  문제는 앞으로다. 롤백 규칙에 필드가 하나 늘면(예: 나중에 `pendingSketch` 나 스냅 스냅샷을 함께 버려야 할 때)
  누군가 `cancelDrag` 만 고치고 Escape는 놔둘 것이다. 이것이 브리핑이 지목한 "별개 구현이면 나중에 어긋난다" 그 자체다.
- 수정: 460·1410은 추가 필드가 있으니 그대로 두고, **의미가 100% 동일한 두 곳만** 통일한다.
  ```ts
  // interaction.ts:547
  case 'POINTER_CANCEL':
    return ok(cancelDrag(state), ctx);

  // interaction.ts:1997-2000
  if (s.drag) {
    // originNorm 으로 복귀 후 취소. 커밋하지 않았으므로 drag 를 버리면 원위치다
    return ok(cancelDrag(s), ctx);
  }
  ```
  `cancelDrag` 의 `if (!state.drag) return state;` 조기반환은 Escape의 `if (s.drag)` 가드와 동치라 동작 변화 0이다.
  (POINTER_CANCEL은 오히려 드래그가 없을 때 객체 동일성이 보존돼 불필요한 재렌더가 줄어든다.)

---

### [보통] 3. `DEFAULT_HIT_PROFILE` 이 **변경 가능한 공유 싱글턴**이다 — 기본값이 새어 들어갈 수 있는 유일한 경로

- 파일: `packages/canvas-core/src/constants.ts:51-77`
- 문제: 브리핑 2번 질문("어딘가 기본값이 다르게 새어 들어가는 경로가 있는가")에 대한 답이다.
  **정적 경로는 깨끗하다** — `apps/web` 어디에도 `hitProfile` 설정이 없고(grep 확인),
  `hitTest` 호출부 4곳 전부 `hitProfileOf(ctx)` 를 타며, `hitProfileOf` 는 `ctx.hitProfile ?? DEFAULT_HIT_PROFILE` 이다.
  하지만 `HitProfile` 필드가 `readonly` 가 아니고 객체가 freeze 되지 않았다.
  이 객체는 `hitTest` 의 **기본 인자로 프로세스 전체가 공유**한다.
  T1 어댑터가 `const p = DEFAULT_HIT_PROFILE; p.pad = 22;` 를 한 줄 쓰는 순간
  **PC 마우스 히트 판정이 전역으로 바뀌고, 타입 검사도 테스트도 못 잡는다.**
- 재현: `DEFAULT_HIT_PROFILE.minMark = 44` 이후 `hitTest(p, screens, NONE)` — 프로파일을 안 넘긴 PC 경로가 44px로 잡힌다.
- 수정 (`constants.ts:51`, `:69`):
  ```ts
  export type HitProfile = {
    readonly pad: number;
    readonly minMark: number;
    readonly minLabel: number;
    readonly leader: number;
    readonly stroke: number;
    readonly handle: number;
    readonly clickSlop: number;
  };

  export const DEFAULT_HIT_PROFILE: HitProfile = Object.freeze({ /* 기존 그대로 */ });
  ```
  `readonly` 는 P7("통째로 갈아끼운다")과도 일치하고, 어댑터의 `{...DEFAULT_HIT_PROFILE, pad: 22}` 는 그대로 동작한다.

---

### [보통] 4. `POINTER_CANCEL` 이 `pointerId` 를 무시한다 — T3와 같은 종류의 결함이 바로 옆에 남아 있다

- 파일: `packages/canvas-core/src/interaction.ts:546-547`
- 문제: `POINTER_CANCEL` 은 `ev.pointerId` 를 받아 놓고 **쓰지 않고 무조건** 드래그를 지운다.
  `POINTER_MOVE`(:1124)와 `POINTER_UP`(:1408)은 둘 다 `drag.pointerId !== ev.pointerId` 를 검사하는데 여기만 안 한다.
- 재현: 손가락 1로 영역을 그리는 중 손가락 2가 화면 가장자리에 스쳐 브라우저가
  **포인터 2에 대해** `pointercancel` 을 쏘면 → 손가락 1의 드래그가 통째로 사라진다.
  (`apps/web/src/canvas/CanvasView.tsx:349` 가 `pointerId` 를 실제로 넘기고 있으므로 코어만 고치면 된다.)
  마우스는 포인터가 하나라 PC에서는 안 드러난다 — **T3와 완전히 같은 성질의 결함이다.**
- 스펙 해석: 스펙 T3가 지목한 파일은 `onPointerDown` 뿐이라 **범위 밖이라는 builder의 판단 자체는 정당하다.**
  다만 T1이 착수되면 반드시 터진다. 지금 3줄로 막는 것이 옳다.
- 수정:
  ```ts
  case 'POINTER_CANCEL':
    // 다른 포인터의 취소가 진행 중인 드래그를 죽이면 안 된다 (POINTER_MOVE·UP 과 같은 규칙)
    if (state.drag && state.drag.pointerId !== ev.pointerId) return ok(state, ctx);
    return ok(cancelDrag(state), ctx);
  ```

---

### [경미] 5. `GESTURE_PINCH` 의 "상대값" 계약이 테스트로 못박혀 있지 않다

- 파일: `packages/canvas-core/test/phase5TrackA.test.ts:64-183`
- 문제: 브리핑 5번 항목. **문서화는 충분하다** — `types.ts:512-520` 주석, ASSUMPTIONS P1, builder 로그 §A1 세 곳에
  "직전 프레임 대비 상대값" 이라고 명시돼 있다. 그런데 **테스트가 그걸 고정하지 않는다.**
  - `:78` 은 단일 프레임 `factor 1.5 → z0*1.5` 만 본다 — 누적값 해석으로 구현해도 **첫 프레임은 똑같이 통과한다.**
  - `:99-108` 은 1.3을 두 번 보내지만 **중점 고정만** 검사하고 `zoom === z0*1.3*1.3` 은 검사하지 않는다.
    이 단언은 누적/상대 어느 쪽이든 통과한다.
  - `pan` 이 프레임마다 누적되는지도 검사하지 않는다.
  → 지금은 맞게 구현돼 있지만(리듀서가 무상태라 구조적으로 상대값일 수밖에 없다),
    T1이 계약을 오해해 누적값을 보내도 **테스트가 아무 말을 안 한다.** 그러면 줌이 폭주한다.
- 수정: `:108` 뒤에 3줄 추가.
  ```ts
  it('연속 프레임의 factor·pan 은 누적이 아니라 매 프레임 곱해지고 더해진다 (상대값 계약)', () => {
    const { state, ctx } = boot([]);
    const c = { x: 500, y: 350 };
    const s = run(state, ctx, [
      { k: 'GESTURE_PINCH', center: c, factor: 1.2, pan: { x: 10, y: 0 } },
      { k: 'GESTURE_PINCH', center: c, factor: 1.2, pan: { x: 10, y: 0 } },
    ]).state;
    expect(s.viewport.zoom).toBeCloseTo(state.viewport.zoom * 1.2 * 1.2, 10); // 1.2 가 아니다
  });
  ```

---

### [경미] 6. A4 프로파일 7필드 중 `handle` · `leader` · `stroke` · `minLabel` 이 실제로 배선됐는지 검증되지 않는다

- 파일: `packages/canvas-core/test/phase5TrackA.test.ts:346-429`
- 문제: `:351` 의 전역 스윕 테스트는 **두 쪽 다 기본값**이라 배선 오타를 못 잡고,
  `:366`·`:380` 의 FAT 테스트는 **`MARK` 하나만** 확인한다.
  즉 `hitTest.ts:68-73` 에서 `const HIT_HANDLE_PX = profile.leader;` 처럼 잘못 꽂혀 있어도 **22개 테스트 전부 통과한다.**
  (실제 배선은 직접 대조했다 — 7개 전부 올바르다. 버그가 아니라 **커버리지 구멍**이다.)
  덤으로 스윕 테스트는 `memos: []` 라서 hitTest의 메모 분기(`:121` `:136` `:148`)가 등가성 검증 대상에서 빠진다.
- 수정: FAT 프로파일로 **리사이즈 핸들(`handle`)** 과 **리더선(`leader`)** 이 각각 넓어지는지 1개씩 추가.
  선택된 영역 결함의 핸들 바깥 20px, 리더선 바깥 15px 지점을 쓰면 된다.

---

### [경미] 7. `GESTURE_PINCH` 주석의 "(WHEEL 과 같은 이유)" 가 동작을 반대로 읽히게 한다

- 파일: `packages/canvas-core/src/interaction.ts:497-499`
- 문제: `WHEEL`(:478)은 요소 드래그 중이면 **줌을 무시**한다(`return ok(state, ctx)`).
  `GESTURE_PINCH` 는 반대로 **드래그를 죽이고 줌을 실행**한다.
  *이유*(스크린 좌표 스냅샷 무효화)는 같지만 *처방*은 정반대다. 지금 주석은 "같다" 로 읽힌다.
  동작 자체는 스펙 §6-3("진행 중 1손가락 드래그는 취소")대로라 **틀리지 않았다.** 주석만 오해를 부른다.
- 수정: "WHEEL 은 드래그 중 줌을 **무시**하지만, 핀치는 손가락이 이미 두 개라 되돌릴 수 없으므로 **드래그를 버린다**" 로.

---

### [경미] 8. builder 로그의 "마우스는 이 분기에 걸리지 않는다 → PC 동작은 그대로다" 는 **터치스크린 PC에서 반만 맞다**

- 파일: `_workspace/27_builder_log_Phase5_TrackA.md:143`, `interaction.ts:790`
- 확인 결과(브리핑 4번): **마우스 경로는 안전하다.**
  `apps/web/src/canvas/pointerAdapter.ts:31` 이 `e.pointerId` 를 그대로 넘기는데,
  브라우저는 **마우스 장치 하나에 pointerId 를 고정 배정**한다 — 버튼 조합(우클릭 드래그 중 좌클릭,
  중클릭 팬 중 좌클릭)은 전부 같은 `pointerId` 라 `:796` 분기에 **걸리지 않는다.**
  `phase5TrackA.test.ts:277-291` 이 이걸 정확히 고정하고 있다. 새 버그 없음.
- 다만: 터치스크린이 달린 **PC/노트북에서 웹앱을 손가락으로 쓰면** 두 손가락 동작이 바뀐다(= T3 의도된 수정).
  로그의 "PC 동작 불변" 은 **마우스 기준**이라는 단서가 필요하다.
- 수정: builder 로그의 "직접 확인해주실 것" 에 한 줄 추가 —
  `[ ] 터치스크린 노트북이라면: 도면 위 두 손가락 동작이 이전과 달라진다(의도된 수정)`

---

## 브리핑 8개 질문에 대한 직접 답

| # | 질문 | 답 |
|---|---|---|
| 1 | 기존 251개가 정말 안 깨졌나 | **예.** 신규 파일 제외 재실행 → 15 files / 251 passed. 기존 테스트 파일 수정 0 (diff로 확인) |
| 2 | A4가 진짜 optional인가, 기본값 누출 경로 | **정적 경로는 없다.** `apps/web` 에 `hitProfile` 설정 0, 호출부 4곳 전부 `hitProfileOf(ctx)`. `hitTest(…, DEFAULT_HIT_PROFILE)` 등가성이 캔버스 4천 점 스윕으로 고정됨. **단 하나의 누출 경로 = 지적 3(가변 싱글턴)** |
| 3 | cancelDrag가 Escape와 같은 경로인가 | **아니다 — 별개 구현이다.** 동작은 오늘 글자 단위로 동일하지만 리터럴이 5곳에 중복. **지적 2** |
| 4 | 마우스가 새 분기에 걸리나 | **안 걸린다.** pointerId는 장치 단위로 고정, 버튼 조합과 무관. 테스트로도 고정됨(`:277`). 새 버그 없음 |
| 5 | 핀치 상대값 계약이 문서·테스트로 고정됐나 | **문서 ○ (3곳), 테스트 △.** 첫 프레임만 검증돼 누적/상대를 구별 못 한다. **지적 5** |
| 6 | A1이 zoomAt+clampPan 재사용인가, 새 수학이 몰래 들어갔나 | **재사용 맞다. 신규 수학 0.** `zoomAt`(viewport.ts:35) → `tx/ty += pan` → `withViewport`(:380)의 `clampPan`. `CENTER_ON_NORM` 도 `centerOn`(viewport.ts:87) 그대로 |
| 7 | 신규 22개가 껍데기인가 | **아니다.** 특히 A4의 4천 점 스윕과 A2의 "표기가 스크린 좌표로 원위치했는가"(`:233`)는 강한 테스트다. 다만 지적 5·6의 구멍이 있다 |
| 8 | 타입검사·테스트·빌드 | **전부 exit 0. 직접 재실행함** (표는 위) |

---

## 불변식 검수표

이번 변경은 뷰포트·히트판정만 건드리고 **`Command` 를 새로 뱉는 경로가 하나도 없다.**
(신규 3케이스 전부 `ok(state, ctx)` 반환, `commands` 빈 배열 — `phase5TrackA.test.ts:202,230,244,256,302` 로 고정)
따라서 8개 도메인 불변식과 **접점이 없다.** 형식상 확인 결과:

| # | 불변식 | 결과 | 근거 |
|---|---|---|---|
| 1 | 마커 좌표는 정규화 0~1 저장 | **통과** | 신규 코드는 뷰포트(`Viewport{zoom,tx,ty}`)만 쓴다. `Mark.geometry` 를 쓰거나 저장하는 경로 없음. `CENTER_ON_NORM` 은 `NPoint` 를 **입력으로만** 받아 뷰포트로 변환 |
| 2 | `defectNo`/`photoNo` 미저장 | **해당없음** | canvas-core는 번호를 모른다. diff에 등장 0 |
| 3 | 로컬 우선 쓰기 | **해당없음** | 서버·`await` 경로 없음. `reduce` 는 동기 순수함수 |
| 4 | 면적 계산 | **해당없음** | 면적 코드 미변경 |
| 5 | 층 정렬 `sortOrder` | **해당없음** | 미변경 |
| 6 | 원인·보수방안 FK | **해당없음** | 미변경 |
| 7 | 과업 생성 시 설정 복사 | **해당없음** | 미변경 |
| 8 | `isPrimary` 정확히 1개 | **해당없음** | 사진 경로 미변경 |

**경계 규칙(CLAUDE.md) 검수**

| 규칙 | 결과 | 근거 |
|---|---|---|
| canvas-core에 `window`/`document`/`Image`/rAF/React 없음 | **통과** | 신규 코드 grep 결과 0건 |
| 기하 판정은 스크린 px | **통과** | `hitTest` 는 전부 `SPoint`. `HitProfile` 7필드 전부 스크린 px. 정규화 공간에서 거리·각도를 재는 코드 없음 |
| `packages/canvas-core` 만 수정 | **통과** | diff stat으로 확인. `apps/web` 0줄 |

**builder가 스스로 정한 것(P1~P8) 정당성**

| # | 판정 | 사유 |
|---|---|---|
| P1 상대값 | **정당** | 누적값이면 코어가 제스처 시작 뷰포트를 기억해야 하고 END 유실 시 잠긴다. 다만 테스트 보강 필요(지적 5) |
| P2 END no-op | **정당** | "END 유실 시 캔버스 잠김" 회피가 현장 우선순위상 옳다 |
| P3 취소 시 토스트 없음 | **정당** | 핀치마다 토스트는 소음. 되돌릴 것도 없다 |
| P4 취소해도 선택 유지 | **정당** | Escape와 동일. 테스트로 고정됨(`:238`) |
| P5 팬은 되감지 않음 | **정당** | 롤백 대상은 "문서를 바꿀 뻔한 드래그" 지 확정된 화면 위치가 아니다. 되감으면 화면이 튄다 |
| P6 `CENTER_ON_NORM` 이 safeInsets 무시 | **정당** | 스펙 T4가 "`centerOn()` 호출 1줄" 이라고 못박았고, 시트 가림은 `SET_SAFE_INSETS`+`applyEnsureVisible` 의 몫 |
| P7 `Partial` 아닌 완전 객체 | **정당** | 다만 `readonly`+freeze 로 마무리해야 한다(지적 3) |
| P8 `arrowRoute` 미프로파일화 | **정당** | 스펙 T5가 지목한 파일 3개 밖. `arrowRoute` 는 `ctx` 를 안 받는 순수함수. 다만 **손가락 무관하다는 근거는 약하다** — 화살표 첫 구간 판정도 손가락 흔들림을 탄다. T1 실기기 확인 후 재검토 대상으로 남긴다 |
| 로그 "PC 동작 불변" | **반만 정확** | 마우스 기준으로는 맞다. 터치스크린 PC는 바뀐다(지적 8) |

---

## 확인하지 못한 것

- **브라우저 실행 검증을 하지 않았다** (에이전트 규칙). 지적 8의 "터치스크린 노트북에서 두 손가락 동작이 바뀐다"
  는 코드 추론이지 실측이 아니다.
- **`pointerId` 배정 규칙은 브라우저 구현 의존이다.** "마우스 = 고정 pointerId" 는 PointerEvents 명세와
  Chrome/Firefox/Safari의 통상 동작에 근거한 판단이며, 실기기에서 확인하지 않았다.
  builder 로그의 회귀 체크리스트 마지막 항목(중클릭 팬 도중 좌클릭)이 이걸 커버한다.
- **T1 터치 어댑터가 없으므로 핀치·`CENTER_ON_NORM` 경로는 단위 테스트 밖에서 한 번도 실행된 적이 없다.**
  지적 1(NaN)은 그래서 "아직 안 터진" 것이지 안전한 것이 아니다.
- `hitTest` 의 메모 분기(`memoGeom` 경유)는 A4 등가성 스윕 대상에서 빠져 있다(지적 6). 코드로 대조는 했다.

---

## 결론 — "PC 동작을 절대 안 바꾼다" 는 약속

**지켜졌다.** 근거 셋:

1. 기존 251개 테스트가 **테스트 수정 없이** 그대로 통과한다(직접 재실행).
2. A4는 진짜 optional이다 — `apps/web` 어디에도 `hitProfile` 주입이 없고, 4천 점 스윕이
   `hitTest(…)` 와 `hitTest(…, DEFAULT_HIT_PROFILE)` 의 완전 동일을 고정한다.
3. A2의 새 분기는 `pointerId` 가 다를 때만 걸리는데 **마우스는 pointerId가 하나**다.
   버튼 조합으로는 걸릴 수 없다(테스트로 고정됨).

**심각 항목 없음.** 보통 4건 중 1·3·4는 T1이 착수하는 순간 실제 고장으로 바뀌므로
**다음 라운드 시작 전에 정리하는 것을 권한다.** 전부 합쳐 30줄 미만이고 기존 테스트에 영향이 없다.
