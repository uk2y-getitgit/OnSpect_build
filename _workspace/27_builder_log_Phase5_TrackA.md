# 구현 로그 — Phase 5 트랙 A (코어 터치 지원)

기준: `_workspace/26_plan-reviewer_spec_Phase5_Mobile.md` §5-A(A1~A4) · §6-2(T2·T3·T4·T5) · §6-3(제스처 매핑)
브랜치: `feat/phase5-track-a`
범위: **`packages/canvas-core` 만.** `apps/web` 은 한 줄도 건드리지 않았다.

---

## 완료

| 작업 | 파일 | 상태 |
|---|---|---|
| A1 · 핀치 InputEvent 3종 정의 | `src/types.ts` (`InputEvent` 에 `GESTURE_PINCH_START` / `GESTURE_PINCH` / `GESTURE_PINCH_END`) | 완료 |
| A1 · `reduce()` 케이스 3개 | `src/interaction.ts` (`WHEEL` 바로 아래) | 완료 |
| A2 · 두 번째 포인터 = 드래그 취소 | `src/interaction.ts` `onPointerDown` 진입부 + `cancelDrag()` 헬퍼 | 완료 |
| A3 · `CENTER_ON_NORM` | `src/types.ts` + `src/interaction.ts` (`viewport.centerOn()` 호출) | 완료 |
| A4 · `HitProfile` 타입 · `DEFAULT_HIT_PROFILE` | `src/constants.ts` | 완료 |
| A4 · `hitTest(…, profile?)` | `src/hitTest.ts` (5번째 optional 인자) | 완료 |
| A4 · `ReduceContext.hitProfile?` 배선 | `src/interaction.ts` (`hitProfileOf()` — hitTest 호출 4곳 + clickSlop 1곳) | 완료 |
| 단위 테스트 22개 | `test/phase5TrackA.test.ts` (신규) | 완료 |

전부 **순수 추가**다. 기존 타입에서 필드를 빼거나 시그니처를 바꾼 곳은 없다.
`hitTest` 의 새 인자는 기본값이 `DEFAULT_HIT_PROFILE` 이라 기존 호출부(테스트 포함) 수정이 0이었다.

---

## 검증한 것

| 항목 | 결과 |
|---|---|
| `canvas-core` 단위 테스트 | **273 / 273 통과** (기존 251 그대로 + 신규 22) |
| `project-core` 단위 테스트 | 212 / 212 통과 (영향 없음 확인) |
| 타입 검사 (`npm run typecheck`) | canvas-core · project-core · **web 전부 통과** |
| 프로덕션 빌드 (`npm run build`) | 성공 (228 modules, 2.67s) |
| 경계 규칙 | 추가 코드에 `window` · `document` · `Image` · `rAF` · React 참조 없음 |

**기존 251개가 한 개도 깨지지 않았다** = "PC 웹 동작을 바꾸지 않는다" 를 코드로 확인한 것.
추가로 A4 테스트 하나가 캔버스 전역(960×640 을 12px 격자로 훑음, 약 4천 점)에서
`hitTest(p, …)` 와 `hitTest(p, …, DEFAULT_HIT_PROFILE)` 의 결과가 **완전히 동일**함을 확인한다.

---

## 구현 방식 — 다음 라운드가 알아야 할 것

### A2 드래그 취소가 A1 핀치와 맞물리는 방식 ⭐

**핵심: 롤백이 곧 `drag = null` 이다.** 이 코어는 드래그하는 내내 문서(`Defect[]`)를 건드리지 않는다 —
이동 중 좌표는 `drag.previewNorm` · `drag.geomPreview` · `drag.pathPreview` 안에만 있고,
`POINTER_UP` 의 커밋 함수가 처음으로 `Command[]` 를 뱉는다.
그래서 드래그를 버리면 자동으로 원위치다(기존 Escape 처리가 이미 같은 논리다).

```
onPointerDown  ── state.drag 있음 && drag.pointerId !== ev.pointerId ─→ cancelDrag() 후 즉시 종료
                                                                        (이 포인터로 새 드래그를 만들지 않는다)
GESTURE_PINCH_START ─→ cancelDrag()      // 어댑터가 POINTER_DOWN 없이 바로 보내도 안전
GESTURE_PINCH       ─→ cancelDrag() 후 줌·팬   // START 를 놓쳐도 정렬 스냅샷이 오염되지 않는다
```

`cancelDrag()` 는 **세 곳에서 같은 규칙**을 쓴다. 어댑터(T1)가 두 손가락을 어떤 순서로 코어에 알리든
— `POINTER_DOWN(2)` → `PINCH_START` 든, `PINCH_START` 만 보내든 — 결과가 같다.
**어댑터가 지켜야 할 계약은 "두 번째 손가락이 닿으면 코어에 알린다" 하나뿐이다.**

그리고 취소 후 **첫 손가락의 `POINTER_UP` 은 아무 일도 하지 않는다.**
`onPointerUp` 이 `drag.pointerId !== ev.pointerId` 를 이미 검사하는데 `drag` 가 null 이므로 즉시 반환된다.
즉 손가락을 어떤 순서로 떼든 유령 도형이 생기지 않는다 (테스트로 고정해 뒀다).

예외로 남긴 것: **팬 드래그**는 취소해도 뷰포트를 되감지 않는다(ASSUMPTIONS P5).
한 손가락으로 밀다가 두 번째를 얹는 순간 화면이 튀면 안 된다.

### A1 핀치 — 상대값 계약

```ts
{ k: 'GESTURE_PINCH'; center: SPoint; factor: number; pan: SPoint }
```

`factor` · `pan` 은 **직전 프레임 대비 상대값**이다 (제스처 시작 대비 누적값이 아니다 — ASSUMPTIONS P1).
어댑터가 프레임마다 계산할 것:

- `factor` = `지금 두 접점 거리 / 직전 프레임 두 접점 거리`
- `center` = 지금 두 접점의 중점(스크린 CSS px)
- `pan` = `지금 중점 − 직전 프레임 중점`

코어 처리 순서: `zoomAt(vp, center, factor, min, max)` → `tx/ty += pan` → `clampPan`(withViewport 안에서).
**신규 수학 0** — 배율 한계(`ZOOM_MIN_FACTOR`·`ZOOM_MAX`)와 팬 한계(`PAN_KEEP_VISIBLE`)가 기존 규칙 그대로 걸린다.
망가진 `factor`(0 · 음수 · NaN · Infinity)는 1로 취급한다 — 손가락이 겹쳤을 때 거리 0이 나오는 것을 막는다.

`GESTURE_PINCH_END` 는 **의도적인 no-op** 이다. 코어에 제스처 상태를 두지 않았다(ASSUMPTIONS P2) —
END 를 놓쳐도 캔버스가 잠기지 않게 하기 위해서다.

### A3 `CENTER_ON_NORM`

`{ k: 'CENTER_ON_NORM'; n: NPoint }`. `viewport.centerOn()` 을 그대로 부른다. 배율 유지, 팬만.
`safeInsets` 는 반영하지 않는다(P6) — 시트에 가리는 문제는 `SET_SAFE_INSETS` + `applyEnsureVisible` 의 몫이다.
도면별 뷰포트 기억(`state.viewports`)에도 정상 반영된다.

### A4 히트 프로파일

```ts
type HitProfile = { pad; minMark; minLabel; leader; stroke; handle; clickSlop };
```

- `constants.ts` 에 타입 + `DEFAULT_HIT_PROFILE`(= 기존 모듈 상수 7개 그대로).
- `hitTest(p, screens, selection, memos?, profile = DEFAULT_HIT_PROFILE)`.
  **함수 본문은 한 글자도 안 바꿨다** — 맨 위에서 모듈 상수와 *같은 이름의* 지역 상수로 바꿔 끼운다.
  히트 판정 로직의 diff 를 0 으로 만들어야 "동작 무변화" 를 눈으로 확인할 수 있다.
- `ReduceContext.hitProfile?` → `hitProfileOf(ctx)` 가 없으면 기본값. `interaction.ts` 의 hitTest 호출 4곳 +
  드래그 판정(`clickSlop`) 1곳이 이걸 탄다.
- 코어는 **어느 프로파일이 터치인지 모른다.** 판단은 어댑터 몫이다(경계 규칙 1: 코어는 `navigator` 를 모른다).

터치 프로파일 상수(`TOUCH_HIT_PROFILE` 같은 것)는 **일부러 만들지 않았다.** 스펙에 없고,
실제 값은 실기기에서 손가락으로 만져 봐야 정해진다. 앱 계층에서 정하면 된다.
테스트에는 감각을 잡기 위한 예시값을 넣어 뒀다(`test/phase5TrackA.test.ts` 의 `FAT`:
pad 22 / minMark 44 / minLabel 44 / leader 22 / stroke 22 / handle 30 / clickSlop 12 — 44pt 터치 타깃 기준).

---

## 다음 라운드(T1 터치 어댑터)가 코어에 기대도 되는 것

1. 두 손가락이 닿으면 `GESTURE_PINCH_START` 를 보내라. 진행 중이던 한 손가락 드래그는 **코어가 알아서 취소한다.**
2. 프레임마다 상대 `factor`/`pan`/`center` 로 `GESTURE_PINCH`. 뗄 때 `GESTURE_PINCH_END`(선택적 — 놓쳐도 안전).
3. 롱프레스 → `CONTEXT_MENU`, 두 손가락 탭 → `FIT`, 더블탭 → `DOUBLE_CLICK` 은 **이미 있는 이벤트** 그대로.
4. 미니맵 탭 → `CENTER_ON_NORM`.
5. 손가락 화면이면 `ReduceContext.hitProfile` 을 통째로 주입해라. 안 주면 마우스 값이다.
6. 조준 확정(T7)은 여전히 `POINTER_DOWN`+`POINTER_UP` 합성으로 되고, **코어 변경이 필요 없다.**

## 알려진 한계 / 남은 것

- **T1 터치 어댑터 · T7 조준 UI · T8 렌더러는 이번 범위 밖**이다(런타임 타깃 Q41 미결).
  즉 이번 라운드 산출물은 **아직 화면에서 만져지지 않는다.** 코어에만 길이 뚫린 상태다.
- `arrowRoute.ts` 의 `CLICK_SLOP_PX` 는 프로파일화하지 않았다(ASSUMPTIONS P8 — 스펙 T5 범위 밖).
- `CREATE_MIN_DRAG_PX`(생성 최소 드래그 8px)도 프로파일에 없다. 스펙이 나열한 7개 필드만 만들었다.
  손가락으로 만져 보고 좁게 느껴지면 그때 필드를 늘리는 것이 맞다.
- 핀치 중 `POINTER_MOVE` 가 들어오면(어댑터가 안 막았을 때) 드래그가 없으므로 hover 계산만 돈다 — 해롭지 않다.

## 직접 확인해주실 것 (PC 웹 회귀 — 트랙 A 는 PC 동작을 바꾸지 않아야 한다)

이번 변경은 코어 내부라 화면에 새 기능이 보이지 않는다. **확인 목적은 "예전 그대로인가" 하나다.**

- [ ] 도면에서 **휠 줌 · 드래그 팬** → 예전과 같은 속도·한계로 움직이는가
- [ ] **점/영역/방향/그리기 생성**, 표기·번호 **이동**, 영역 **리사이즈** → 예전 그대로 잡히고 놓이는가
      (마우스 커서로 잡히는 범위가 좁아지거나 넓어졌다면 A4 회귀다)
- [ ] 표기를 끌다가 **Esc** → 원위치로 돌아가는가 (취소 경로를 함께 손댔다)
- [ ] 중클릭 팬 도중 좌클릭 → 예전과 같이 동작하는가 (마우스는 A2 분기에 걸리지 않아야 한다)

---

# 검수 반영 (2차) · 2026-08-25

`_workspace/28_code-reviewer_findings_Phase5_TrackA.md` 조건부 통과(심각 0 · 보통 4 · 경미 4).
**보통 4건만 고쳤다.** 경미 4건은 이번 범위 밖(아래 "넘긴 것" 참조).

| # | 지적 | 고친 내용 | 파일 |
|---|---|---|---|
| 1 | `GESTURE_PINCH` 의 `pan`·`center` 가 검증 없이 뷰포트에 들어간다 (`factor` 만 방어돼 있었다) | `finitePoint()` 헬퍼 추가. `center`·`pan` 중 하나라도 NaN·Infinity 면 **그 프레임을 통째로 버린다.** `CENTER_ON_NORM` 의 `n` 도 같은 방어 | `interaction.ts` |
| 2 | `cancelDrag` 가 기존 Escape 취소와 다른 코드 경로 | 의미가 완전히 같은 두 곳(`POINTER_CANCEL` · `Escape`)을 `cancelDrag()` 하나로 통일. 나머지 3곳(`SET_TOOL` 은 도구 전환, `onPointerUp` 의 `cleared` 는 커밋 직전 상태, 헬퍼 자신)은 문맥이 달라 **건드리지 않았다** | `interaction.ts` |
| 3 | `DEFAULT_HIT_PROFILE` 이 변경 가능한 공유 싱글턴 | `Object.freeze()` + `Readonly<HitProfile>`. 값을 바꾸려면 복사본을 만들어야 한다(`{ ...DEFAULT_HIT_PROFILE, minMark: 44 }`) | `constants.ts` |
| 4 | `POINTER_CANCEL` 만 `pointerId` 검사가 없다 (A2 와 같은 성질의 결함) | 드래그의 **주인 포인터일 때만** 취소한다. 두 손가락 중 한쪽이 시스템에 뺏겼다고 남의 드래그를 죽이지 않는다 | `interaction.ts` |

**왜 1번이 진짜 위험한가:** 뷰포트는 한 번 NaN 이 되면 스스로 낫지 않는다.
`state.viewports[drawingId]` 에 도면별로 **기억까지** 되므로 층을 옮겼다 돌아와도 그대로다 — FIT 전에는 복구가 안 된다.
T1 어댑터는 핀치 첫 프레임에 "직전 중점"이 없어 `undefined` 뺄셈으로 NaN 을 낼 가능성이 실제로 높다.

## 2차 검증

| 항목 | 결과 |
|---|---|
| canvas-core 단위 테스트 | **277 / 277** (1차 273 + 회귀 테스트 4개. **기존 251개 그대로 유지**) |
| project-core 단위 테스트 | 212 / 212 |
| 타입 검사 | 3개 패키지 전부 통과 |
| 프로덕션 빌드 | 성공 |

추가한 테스트 4개: 핀치 NaN 프레임 무시(+ 나쁜 프레임 뒤 정상 프레임이 여전히 먹히는지) ·
`CENTER_ON_NORM` NaN 무시 · `POINTER_CANCEL` 주인 판정 · `DEFAULT_HIT_PROFILE` 동결.

## 넘긴 것 (경미 4건 — 이번에 고치지 않았다)

검수가 경미로 분류했고 지금 고치면 범위가 번진다. 다음 라운드(T1 어댑터)와 함께 판단하는 것이 맞다.

⚠️ **그중 하나는 다음 라운드가 반드시 기억해야 한다:**
**"PC 동작 불변" 은 마우스 기준이다.** 터치스크린 노트북·2-in-1 처럼 **PC 웹에 손가락 입력이 들어오는 환경**에서는
브라우저가 포인터를 2개 보낼 수 있고, 그러면 A2(두 번째 포인터 = 드래그 취소) 분기에 걸린다.
지금 `apps/web` 은 터치 어댑터가 없어 이 경로가 열려 있지 않지만, **T1 을 웹에 붙이는 순간
PC 웹도 터치 경로를 타게 된다.** 그때 `hitProfile` 을 입력 종류에 따라 갈아 끼울지(마우스는 좁게, 손가락은 넓게)를
어댑터가 정해야 한다 — 코어는 무엇이 손가락인지 모른다.
