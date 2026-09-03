# 스펙 검토 결과 — UI·동작 개선 16건 (2026-09-03)

브랜치: `feat/ui-behavior-0903`
1차 기준: `_workspace/00_input/scope_UIBehavior0903.md`
확정 사항: `DECISIONS.md` **D27~D30** (뒤집지 않았다)
검토 방식: 코드 읽기만. 브라우저·개발서버 실행 없음. 코드 수정 없음.

---

## 0. 한 줄 결론

**16건 중 9건은 지금 바로 착수 가능하고, 3건은 가정을 명시하면 가능하며, 4건은 답 없이 시작하면 안 된다.**

특히 **C-2 는 증상이 코드에 실재한다** — 추측이 아니라 세 곳의 하드코딩(`store.ts:407`,
`CanvasRoute.tsx:414`, `CanvasRoute.tsx:642`)이 원인이고, 사용자에게 재현 절차를 물을 필요가 없다.

---

## 1. 16건 판정표

| # | 항목 | 판정 | 근거 한 줄 |
|---|---|---|---|
| **C-1** | 화살표 축척 통일 | 🟡 **조건부 가능** | 원인 특정 완료(`shapes.ts:267`). 극단 케이스 규칙만 Q67 |
| **C-2** | 결함 이동 스냅 | 🟢 **바로 착수 가능** | **원인 코드에서 확정.** 사용자에게 물을 것 없음 |
| **C-3** | 면적 직접입력 삭제 | 🔴 **착수 불가** | 이미 저장된 "직접입력 면적" 처리가 미정 — Q68 |
| **C-4** | 더블클릭+드래그 영역선택 | 🔴 **착수 불가** | 다중선택 모델이 **아예 없다** + 제스처 정의 충돌 — Q69 |
| **C-5** | 말풍선 종류 변경 UI | 🔴 **착수 불가** | D27은 *색*만 확정. **전이 허용 범위·잠금**이 미정 — Q70 |
| **P-1** | 도면 이미지 축척 조절바 | 🟢 **바로 착수 가능** | 기능·슬라이더가 **이미 있다**. 진입점만 옮기면 됨. 마이그레이션 0 |
| **P-2** | 번호풍선 격자 스냅 정렬 | 🟡 **조건부 가능** | 커맨드 설계는 확정 가능. 격자 간격·대상 범위는 Q71(비차단) |
| **T-1** | 조사구분 외관조사 고정·숨김 | 🟢 **바로 착수 가능** | D29로 확정 |
| **T-2** | 구조유형 노출 | 🟢 **바로 착수 가능** | 현행 유지 = 변경 없음 |
| **T-3** | 부재 5종만 노출 | 🔴 **착수 불가** | **시드 부재 17종에 "벽체·슬래브·마감재"라는 이름이 없다** — Q72 |
| **T-4** | 구조체여부 숨김 | 🟢 **바로 착수 가능** | D29 |
| **T-5** | 규모 노출 | 🟢 **바로 착수 가능** | 현행 유지 (단 C-3와 같은 파일) |
| **T-6** | 원인·보수·위치보조·메모 숨김 | 🟡 **조건부 가능** | 폼에 있는데 목록에 없는 필드 3개 — Q73(비차단) |
| **T-7** | 사진메뉴 최상단·미리보기칸=추가버튼 | 🟢 **바로 착수 가능** | 슬롯 구조라 순서 교체가 싸다 |
| **T-8** | 사이드바 크기조절 | 🟢 **바로 착수 가능** | **롱프레스 진입으로 판정** (§4-T8 근거) |
| **T-9** | 미니맵 숨김 | 🟢 **바로 착수 가능** | 렌더 한 곳(`CanvasRoute.tsx:959`) |

착수 가능 9 · 조건부 3 · 불가 4.

---

## 2. 확정 스펙

### C-1 · 화살표 머리 크기를 도면 축척에 고정

#### 지금 무엇에 비례하는가 (코드 확인 결과)

| 위치 | 코드 | 의미 |
|---|---|---|
| `canvas-core/constants.ts:192` | `arrowHead: 22` | 기본 촉 길이, **이미지 px** |
| `canvas-core/style.ts:70` | `arrowHead: s?.arrowHead ?? global.arrowHead` | 개별 오버라이드 이미 지원 |
| `canvas-core/renderModel.ts:586` | `const head = Math.max(6, st.arrowHead * zoom)` | 여기까지는 **이미 도면 축척 고정**이다 |
| `canvas-core/interaction.ts:326` | `head: Math.max(6, st.arrowHead * vp.zoom)` | 드래그 중 고스트도 같은 식 |
| **`canvas-core/shapes.ts:267`** | **`const h = Math.min(head, len * 0.5);`** | ⭐ **여기가 원인** |
| `canvas-core/shapes.ts:284` | 같은 식 (`arrowShaftEnd`) | 몸통 끝점도 같이 줄어든다 |

`renderModel.ts:602` 는 `arrowHeadPolygon(next, tip, head)` 로 호출한다 —
`from=next`, `to=tip` 이므로 `len` 은 **꺾은선의 머리쪽 첫 구간 길이**(`|points[0] − points[1]|`)다.
그래서 첫 구간이 `22 × 2 × zoom` px 보다 짧으면 촉이 그 구간의 절반으로 줄어든다.
**사용자가 본 "첫 지시선 길이에 따라 화살표 크기가 생성된다" 가 정확히 이것이다.**

#### 기준값 제안 — 새 필드를 만들지 않는다

`titleBlock.ts` 의 `scale` 은 **문자열**(`'NONE'` · `'1:100'`)이라 계산에 못 쓴다(`titleBlock.ts:62`).
`tbScale` 은 도곽 전용 비례값이다. 따라서 **기존 값 재사용 = `RENDER_DEFAULTS.arrowHead`(22 이미지 px) × `vp.zoom`**
이 그대로 "도면 축척 고정" 기준이다. 새 데이터·새 설정 항목 **0개**.

#### 수정 스펙

1. `canvas-core/constants.ts` — 상수 신설
   `export const ARROW_HEAD_MAX_RATIO = 0.5;` (전체 꺾은선 길이 대비 촉 길이 상한)
2. `canvas-core/renderModel.ts` — 화살표 렌더 함수(`:583~606`)에서
   `arrowHeadPolygon` 에 넘기기 **전에** 촉 길이를 확정한다.
   ```
   const total = 꺾은선 전체 길이(points 전 구간 합)
   const head = Math.min(Math.max(6, st.arrowHead * zoom), total * ARROW_HEAD_MAX_RATIO)
   ```
   → 상한 기준이 **첫 구간 → 전체 길이** 로 바뀐다. 꺾인 화살표에서 첫 구간이 짧아도 촉이 안 줄어든다.
3. `canvas-core/interaction.ts:326` — 고스트도 **같은 식**으로 맞춘다.
   안 맞추면 "그릴 땐 컸는데 손을 떼면 작아진다" 가 된다.
4. `canvas-core/shapes.ts` 의 `Math.min(head, len * 0.5)` 는 **그대로 둔다** — 마지막 안전장치다.
   완전 제거 여부는 Q67.
5. 테스트(`canvas-core`): 첫 구간이 짧은 2구간 화살표에서 촉 길이가 `arrowHead × zoom` 과 같은지.

**저장 데이터 변경 0 · 타입 변경 0 · DB_VERSION 무관.**

---

### C-2 · 결함 이동 스냅 — **증상은 실재한다. 재현 절차를 물을 필요가 없다**

지시받은 대로 `snapAlign.ts` · `snapResolve.ts` · `hitTest.ts` · `defectGeom.ts` 를 읽었다.
**"보이는 영역과 실제 스냅 기준이 갈라지는 지점" 이 코드에 실재한다.** 그 지점은 네 파일이 아니라
`apps/web` 의 **컨텍스트 주입부**다.

#### 갈라지는 지점 (원인 사슬)

| # | 파일:줄 | 코드 | 결과 |
|---|---|---|---|
| ① | `apps/web/src/routes/CanvasRoute.tsx:474~478` | `balloonRadius: DEFAULT_GLOBAL_STYLE.balloonRadius * (drawing.labelScale ?? 1)` → `<CanvasView globalStyle=…>`(`:905`) | **렌더**는 배율이 반영된 34×s 를 쓴다 |
| ② | **`apps/web/src/store.ts:407`** | **`globalStyle: DEFAULT_GLOBAL_STYLE,`** | ⭐ **리듀서(`runInput`)는 항상 34 를 쓴다** |
| ③ | `apps/web/src/routes/CanvasRoute.tsx:414` | `globalStyle: DEFAULT_GLOBAL_STYLE,` | `memoScreensOf`·`ghostOf` 도 34 |
| ④ | `apps/web/src/routes/CanvasRoute.tsx:642` | `globalStyle: DEFAULT_GLOBAL_STYLE,` | `ContextToolbar` 위치 계산도 34 |

`labelScale` 은 **도면 단위 저장 필드**다(`project-core/types.ts:206`, F6).
캔버스 상단 `−` `100%` `+` 버튼(`CanvasRoute.tsx:845·857·865`)이 바꾼다.
**"말풍선 크기조절" 이 바로 이 값이다.**

#### 이 하나가 만드는 증상 4가지 — 전부 사용자 원문과 일치한다

1. **히트 영역이 보이는 풍선과 다르다.**
   `hitTest.ts:84` 는 `Math.max(s.balloonR + HIT_PAD_PX, HIT_MIN_LABEL_PX)` 를 쓰는데
   `s.balloonR` 이 `defectGeom.ts:366` 에서 리듀서의 `style.balloonRadius`(=34) × zoom 으로 만들어진다.
   → 풍선을 키우면 **보이는 가장자리를 눌러도 안 잡히고**, 줄이면 빈 곳이 잡힌다.
   ⇒ *"영역이 보이는 것과 다름"*
2. **드래그를 시작하는 순간 풍선이 점프한다.**
   `interaction.ts:1081` `grabOffsetScreen = { screen.label − ev.screen }` 인데 `screen.label` 이
   리듀서 기준(34)으로 계산된 자동배치 위치다. 자동배치 거리는 `autoLabelNorm` 에서
   `balloonRadius × LABEL_AUTO_DIST_FACTOR`(`defectGeom.ts:205`)라 **배율에 정비례**한다.
   → `placed=false` 인 풍선(=아직 한 번도 안 옮긴 번호)은 잡는 순간 어긋난 오프셋이 굳는다.
3. **정렬 스냅이 보이는 줄과 다른 줄에 걸린다.**
   `snapAlign.ts:28~30` 의 후보는 `s.label.x/y` 다. 위 ②와 같은 이유로 자동배치 라벨의 후보 좌표가
   화면에 그려진 위치와 다르다. → `resolveSnaps` 가 돌려준 가이드선은 맞는데 풍선이 그 선에 안 붙는다.
   `snapResolve.ts` 머리말이 경고한 §2-8-c 상황이 **정확히** 벌어진다.
   ⇒ *"결함 이동 스냅 조정"*
4. **리더선이 풍선 테두리에서 안 끊긴다.**
   `hitTest.ts:270` `stadiumBoundaryDist(…, s.balloonR, …)` 도 34 기준이라
   배율을 키우면 리더선이 풍선 **안쪽까지** 뚫고 들어가 보인다.

#### 부수 발견 (같은 계열, 별건으로 기록)

`defectGeom.ts:366` 은 `balloonR = style.balloonRadius * vp.zoom` 을 **클램프 없이** 싣는데,
`labelHalfExtra`(`:369`)와 `renderModel.ts:398`(`br = Math.max(4, s.balloonR)`)은 4px 하한을 쓴다.
→ 아주 축소했을 때 스타디움 폭 계산과 원 반경 계산의 기준이 갈린다.
실무 영향은 작다(히트에는 `HIT_MIN_LABEL_PX` 하한이 따로 있다). **이번 범위에서 고치지 않는다** — 기록만.

#### 수정 스펙

1. **계산을 한 벌로 모은다.**
   `apps/web/src/export/locationMap.ts:292` 의 `globalStyleFor(d: Drawing)` 가 이미 같은 계산을 한다.
   이것을 **`apps/web/src/canvas/labelStyle.ts`(신설) 의 `globalStyleForLabelScale(scale: number | null): GlobalStyle`**
   로 끌어올리고, `locationMap.globalStyleFor` 는 여기에 위임만 한다.
   → 계산이 3벌(`CanvasRoute` · `locationMap` · 신설) → **1벌**.
2. **`scale === 1 || scale === null` 이면 `DEFAULT_GLOBAL_STYLE` 을 그대로(같은 객체 참조) 돌려준다.**
   기존 메모이제이션·회귀 동작이 한 글자도 안 바뀐다는 것을 코드로 보장한다.
3. `store.ts` `AppState` 에 `labelScale: number`(기본 `1`) 를 추가한다.
   - `initialAppState` 에 `labelScale: 1`
   - `LOAD` 액션 payload 에 실어 도면 전환 시 갱신
   - `CanvasRoute.setLabelScale`(`:514~`)이 repo 저장과 **함께** dispatch
   - ⚠️ `canvas-core` 의 `DrawingRef` 는 **건드리지 않는다** — 코어 타입 변경 0
4. `store.ts:407` → `globalStyle: globalStyleForLabelScale(state.labelScale)`
5. `CanvasRoute.tsx:414`·`:642` → 이미 있는 `globalStyle` memo(`:474`)를 재사용
6. **테스트(canvas-core)** — `balloonStadium.test.ts` 옆에 추가:
   `balloonRadius` 를 키운 `globalStyle` 로 `buildScreens` 했을 때
   ① 늘어난 풍선 가장자리가 `hitTest` 에서 `LABEL` 로 잡히는가
   ② `buildAlignSnapshot` 후보 좌표가 `defectScreen` 의 `label` 과 같은가

**저장 데이터 변경 0 · DB_VERSION 1 유지 · `canvas-core` 변경 0(테스트 제외).**

---

### C-3 · 규모 — 면적 직접입력 삭제

`apps/web/src/ui/defectForm/SizeBlock.tsx` 한 파일이다.

**지금:** `sizeMode === 'AREA'` 면 면적 `NumberField` 가 **입력 가능**(`:128~137`)이고,
가로×세로는 `[가로 × 세로로 계산 ▾]` 토글 안에 **접혀 있다**(`:149~185`).
직접 입력하면 `areaWMm/areaHMm` 를 `null` 로 지운다(`:136`).

**요청:** 가로×세로가 기본, 면적은 그 결과만 노출. 직접입력 삭제.

**수정 스펙 (Q68 답변 후 확정):**
- 면적 `NumberField` → `readOnly` + `readOnlyHint="가로×세로로 자동 계산됩니다"` (WL 모드의 면적 칸과 **같은 모양**, `:115~124` 패턴 재사용)
- 가로·세로를 **항상 펼친 채**로 (`rectOpen` 상태·토글 버튼 제거)
- `setRectSide`(`:58~62`)는 그대로 — 여전히 `areaM2` 를 채워 저장한다
- 미사용이 되는 import(`AREA_PRESETS`·`AREA_STEP`) 제거
- **`project-core` 는 손대지 않는다.** `effectiveAreaM2`(`size.ts:38`)의 `AREA → a.areaM2` 규칙,
  `outputSize` 의 "AREA 면 폭·길이 0" 규칙, 절대규칙 4(소수 4자리 절사, 개소 안 곱함)는 그대로다.

⚠️ **차단** — 이미 `areaM2` 만 있고 `areaWMm/areaHMm` 가 `null` 인 결함(=옛 직접입력분)을
어떻게 보여줄지가 안 정해졌다. → **Q68**

---

### C-4 · 더블클릭 + 드래그 영역선택 — 이 항목의 진짜 크기

**다중선택 모델은 코드에 없다.** `canvas-core/types.ts:358`:
```ts
export type Selection = {
  defectId: string | null;   // ← 단수. 배열이 아니다
  part: Part | null;
  markId: string | null;
  pathId?: string | null; memoId?: string | null; handle?: Handle | null;
};
```
`hitTest` 도 `pick(hits, selection)` 으로 **하나만** 돌려준다.
`store.ts` 의 `toolbarFor` · `clampToolbar`(`:221`) 도 단수 전제다.

**추가로 제스처가 기존 동작과 정면 충돌한다.**
`interaction.ts:681~694` — 빈 곳 더블클릭 = **화면 맞춤(`fitState`)**. 이건 지금 쓰이는 동작이다.
그리고 브라우저는 두 번째 클릭이 드래그로 이어지면 `dblclick` 을 **보내지 않는다** —
즉 "더블클릭 + 드래그" 는 지금의 `DOUBLE_CLICK` 이벤트로는 만들 수 없고,
어댑터(`CanvasView.tsx`)가 "직전 클릭 후 N ms 안의 두 번째 pointerdown" 을 직접 판정해야 한다.

**이 항목이 실제로 건드리는 것 (파일 10개 이상 = 스킬 기준상 반드시 쪼개야 함):**

| 계층 | 파일 | 무엇 |
|---|---|---|
| 코어 타입 | `types.ts` | `Selection` 확장 or `CanvasState.multi: string[]` 신설, `DragKind: 'MARQUEE'` |
| 코어 판정 | `interaction.ts` | 마퀴 드래그 시작/진행/확정, `DOUBLE_CLICK` 분기, `DELETE_SELECTION` 다중화 |
| 코어 판정 | `hitTest.ts` | 사각형 ∩ 결함 판정(신설 — 지금은 점 히트만 있다) |
| 코어 렌더 | `renderModel.ts` | 마퀴 사각형 · 다중 선택 하이라이트 |
| 코어 커맨드 | `commands.ts` | `DELETE_DEFECTS`(복수) · `MOVE_DEFECTS`(복수) — Undo 1스텝 |
| 앱 | `CanvasView.tsx` | 더블클릭-드래그 판정, 이벤트 합성 |
| 앱 | `store.ts` | `toolbarFor`·`clampToolbar`·Undo·사진 연쇄삭제 |
| 앱 | `CanvasRoute.tsx` | Inspector/ContextToolbar 를 N>1 일 때 무엇으로 바꿀지 |
| 앱 | `Sidebar.tsx` | 리스트 다중 하이라이트 |
| 앱 | `Inspector.tsx` | "N건 선택됨" 상태 |

**⇒ 착수 불가. Q69 답변 없이는 데이터 구조가 굳는다.**

---

### C-5 · 말풍선 종류(결함/신규/보수완료) 변경 UI

**D27 이 확정한 것:** 색은 안 바꾼다. `resolveStyle` 이 `global.statusColor[defect.status]` 를 읽으므로
`status` 만 바꾸면 색은 따라온다(`style.ts:61`).

**이미 있는 것 (재사용):**
- 커맨드 `SET_DEFECT_STATUS { defectId, from, to }` (`commands.ts:157`)
  · 적용 `commands.ts:301`, 역연산 `commands.ts:520`, 이름 `commands.ts:200` — **완비**
- 액션 `{ t: 'SET_DEFECT_STATUS' }` (`store.ts:154`), 리듀서 `setDefectStatus`(`store.ts:530`)
- 편집 툴바 `apps/web/src/canvas/ContextToolbar.tsx` — 팝오버 패턴(`색상` 버튼)이 그대로 쓸 수 있는 형태

**막는 것 (그래서 착수 불가):** `store.ts:538~545` 의 허용 전이 화이트리스트
```
allowed = (PREV_PENDING → CURRENT)
       || (CURRENT → PREV_PENDING && d.prevDefectId !== null)
```
- `REPAIRED` 로 가는 길·`REPAIRED` 에서 나오는 길이 **전부 막혀 있다** — C-5의 3항목 중 하나가 못 간다
- `CURRENT → PREV_PENDING` 은 `prevDefectId` 가 있어야만 된다.
  이 가드는 이유가 있다 — 없는 결함을 전회차로 만들면 `includePrevPending=false` 출력에서 **통째로 사라진다**(U43)
- `isLocked(d) = status !== 'CURRENT'`(`defectGeom.ts:388`). 한 번 결함/보수완료로 바꾸면
  그 결함은 **잠긴다**. 잠긴 상태에서 다시 종류를 바꾸는 통로를 열어야 하는데,
  `ContextToolbar` 는 `locked` 면 버튼을 전부 비활성화한다(`ContextToolbar.tsx:111`)

**⇒ Q70. "사용자가 보게 될 동작 + 출력 누락 위험" 이라 임의로 못 정한다.**

---

### P-1 · 도면 이미지 축척 조절바 — **기능은 이미 있다**

| 이미 있는 것 | 위치 |
|---|---|
| 저장 필드 `Drawing.imgScale` | `project-core/types.ts:204` |
| 범위·클램프 `MIN_SCALE 0.3` / `MAX_SCALE 2.5` / `clampScale` | `project-core/a4.ts:29~37` |
| **조절바(range) + 프리셋 6개 + 경고 문구** | `apps/web/src/routes/DrawingScaleDialog.tsx` |
| 적용 로직 `applyScale` | `apps/web/src/routes/ProjectSetup.tsx:347~` |
| 런타임 합성 캐시 `needsCompose` / `cachedCompositeUrl` / `composeA4` | `canvas/drawingComposite.ts` · `data/imageIngest.ts:326` |
| 캔버스에서 그 결과를 쓰는 배선 | `CanvasRoute.tsx:306~351` |

**즉 P-1 은 "새 기능" 이 아니라 "진입점이 도면관리(ProjectSetup) 안에만 있어서 못 찾는" 문제다.**

#### 🔵 마이그레이션 판정 — **불필요. DB_VERSION 1 유지 가능하다**

`renormalize.ts` 와 **얽히지 않는다.** 코드로 확인:
- `renormalizeAll` 호출부는 `ProjectSetup.tsx:441` **한 곳뿐**이고 그것은 `[A4로 맞추기]`(F1) 다
- `applyScale`(`ProjectSetup.tsx:347~363`)은 `imgScale` 과 `imgLayout` **두 숫자만** 쓰고
  결함·메모 좌표는 한 글자도 안 건드린다 (파일 머리말 `DrawingScaleDialog.tsx:5`, `types.ts:201`)
- 합성 결과 이미지는 저장소가 아니라 **런타임 캐시**에만 들어간다(`drawingComposite.ts:4~8`)

⇒ **좌표 0~1 정규화 불변식(절대규칙 1) 무영향 · 스토어 스키마 변경 0 · DB_VERSION 1 유지.**

#### 수정 스펙

1. `CanvasRoute` 상단바 도면 도구줄(번호 풍선 `−/+` 옆, `:840~870`)에 **`[도면 크기]` 버튼** 추가
2. 누르면 **기존 `DrawingScaleDialog` 를 그대로 띄운다** (컴포넌트 재사용, 새로 만들지 않는다)
3. 적용 로직은 `ProjectSetup.applyScale` 과 **같은 것**을 쓴다 —
   두 벌로 만들면 `imgLayout` 스케일링(`scaledImgLayout`)이 갈라진다.
   → `applyScale` 을 `apps/web/src/data/drawingScale.ts`(신설)로 끌어올려 양쪽이 호출
4. **`imgLayout` 이 없는 옛 도면은 지금과 똑같이 거부한다**
   (`"이 도면은 A4 정규화 전에 등록되었습니다. 먼저 [A4로 맞추기]를 해주세요"` 토스트).
   여기서 자동으로 A4 정규화를 돌리면 `renormalizeAll` 이 **기존 결함 좌표를 전부 옮긴다** — 절대 하지 않는다.
5. 슬라이더를 끄는 동안의 실시간 미리보기: `composeA4` 가 비동기 래스터 합성이라
   **매 tick 재합성하지 않는다.** 도곽 다이얼로그(U21)와 같이 **놓았을 때(`onChange` 확정)만** 합성한다.

---

### P-2 · 번호풍선 격자 스냅 정렬 (D28)

#### 새로 만드는 것

**1) `packages/canvas-core/src/labelGrid.ts` (신설, 순수 함수)**
```ts
export type GridAlignItem = {
  defectId: string; from: NPoint; to: NPoint; fromPlaced: boolean; toPlaced: boolean;
};
export function gridAlignLabels(
  defects: readonly Defect[], globalStyle: GlobalStyle,
  iw: number, ih: number, displayNumbers: Record<string,string>,
): GridAlignItem[];
```
규칙:
- **계산 공간 = 이미지 px.** 정규화 공간(0~1)에서 격자를 만들면 종횡비 때문에 정사각 격자가 안 된다
  (절대규칙 *"기하 판정은 스크린 px"* 과 같은 이유). 스냅 후 `/iw`, `/ih` 로 정규화해 돌려준다.
- 격자 원점 = 이미지 (0,0). 간격 `pitch = style.balloonRadius × GRID_PITCH_FACTOR`(기본 2.5).
  → `labelScale` 이 이미 `balloonRadius` 에 반영되므로 **도면마다 자동으로 맞는다.** 새 저장 필드 0개.
- 출발점은 `effectiveLabelNorm(...)` — `placed=false` 인 번호도 그 자리에서 격자로 간다.
- **결정론적이어야 한다**(재현성). 처리 순서 = `seq` 오름차순.
  같은 셀 충돌 시 뒤에 오는 것이 나선 탐색(우→하→좌→상)으로 가장 가까운 빈 셀로 밀린다.
- `isLocked(d)` 인 결함은 **제외**(Q71에서 확정 대기).
- 변화량 0인 항목은 결과에서 뺀다 — 빈 커맨드를 Undo 스택에 올리지 않는다.

**2) 커맨드 1개 = Undo 1스텝** (`commands.ts`)
```ts
| { k: 'ALIGN_LABELS'; items: GridAlignItem[] }
```
- `applyCommand`: `items` 전부에 `label = {x,y,placed:true}` 적용
- `invertCommand`: `items` 의 `from/to`·`fromPlaced/toPlaced` 스왑
- `describeCommand`: `'번호 정렬'`
- 선례: `DELETE_MEMO_PATH` 가 이미 배치 payload 다(U23, "한 드래그 = Undo 1스텝").
  **`MOVE_LABEL` 을 N개 쌓지 않는다** — 그러면 Ctrl+Z 를 N번 눌러야 한다.

**3) 이벤트 · UI**
- `InputEvent` 에 `{ k: 'ALIGN_LABELS_GRID' }` 추가 → 리듀서가 커맨드 1개를 낸다
  (앱 액션이 아니라 코어 이벤트로 두면 Undo·저장 대기열 배선이 공짜다)
- PC 캔버스 상단바 `[번호 정렬]` 버튼. 되돌리기 토스트 1개
  (U-2 정책상 *"삭제+되돌리기"* 류는 유지 대상이다)

#### 저장·재출력 영향

- 저장되는 것은 **기존 필드 `Defect.label.{x,y,placed}` 뿐**. 새 필드·새 스토어 0 · **DB_VERSION 1 유지**
- 출력 **번호**는 계산값이라(절대규칙 2) 안 바뀐다. `ExportRun` 번호 매핑 스냅샷도 무영향
- ⚠️ **다만** `[같은 번호로 다시 받기]` 로 조사위치도를 다시 뽑으면 **번호는 같고 풍선 위치는 새 위치**로 나온다.
  `ExportRun` 은 번호 매핑만 저장하고 좌표는 저장하지 않기 때문이다. → §4 지적사항 [모호] 참조

---

### T-1 ~ T-9 · 태블릿 사이드바

경계 규칙을 지킨다: `ui/defectForm/*` 은 store·repo·캔버스를 import 하지 않는다.
**모두 prop 으로만 제어한다.** PC 와 폼을 두 벌로 만들지 않는다
(`TabletSheet.tsx:5~6` 이 이미 못 박은 원칙 — *"안에 들어가는 것은 PC 와 똑같은 `<Inspector>` 하나"*).

#### 공통 배선

`DefectInfoForm` 에 필드 표시 프로파일 prop 하나를 새로 만든다.
```ts
/** 태블릿 현장 입력용 축약 폼. 값은 건드리지 않고 렌더만 생략한다 (D29) */
compact?: boolean;
```
`Inspector` 도 같은 prop 을 받아 `DefectInfoForm` 과 `photoSlot` 순서에 쓴다.
`CanvasRoute` 가 이미 들고 있는 `tablet`(`useUiMode`) 을 그대로 내려보낸다.

| # | 요구 | 코드 지점 | 스펙 |
|---|---|---|---|
| **T-1** | 조사구분 외관조사 고정·숨김 | `DefectInfoForm.tsx:113~124` | `compact` 면 `SegmentField` 를 렌더하지 않는다. **값은 저장한다** — 태블릿에서 새 결함을 만들 때 `surveyKind: 'EXTERIOR'` 가 들어가는지 `interaction.ts` CREATE 경로/`defaultAttrs` 기본값을 builder 가 확인해 보장할 것(D29 "조사구분은 외관조사로 저장") |
| **T-2** | 구조유형 노출 | `:127~145` | **변경 없음** |
| **T-3** | 부재 5종 제한 | `:148~156` + `project-core/items/*` | D30 = 마스터에 `태블릿 노출` 플래그. **Q72 전까지 착수 금지** |
| **T-4** | 구조체여부 숨김 | `:159~171` | `compact` 면 미렌더. 값 유지(D29) |
| **T-5** | 규모 노출 | `:199~204` | **변경 없음** (단 C-3 가 같은 컴포넌트를 고친다 — 같은 배치로 묶을 것) |
| **T-6** | 원인·보수·위치보조·메모 숨김 | `:221~232` · `:235~246` · `:249~266` · `:269~283` | `compact` 면 4개 전부 미렌더. 값 유지(D29) |
| **T-7** | 사진메뉴 최상단 | `Inspector.tsx:172` (`{photoSlot}`) | `compact` 면 `{photoSlot}` 을 `<DefectInfoForm>` **앞으로** 옮긴다. 슬롯 구조라 한 줄 이동 |
| **T-7** | 미리보기 칸 = 추가 버튼 | `ui/photos/PhotoSection.tsx:240~245` | `.photos__grid` 의 **첫 타일**을 "추가 타일"(점선 테두리 + `+`)로 두고, 사진은 그 **오른쪽부터** 채운다. 사진 0장일 때의 `photos__empty` 문구는 태블릿에서 숨긴다. 헤더의 `+ 사진 추가` 버튼(`:189~203`)은 그대로 둔다(두 경로가 같은 `<input type=file>` 을 쓴다) |
| **T-8** | 사이드바 크기조절 | `styles.css:68` `--inspector-w` · `:134` `.body` 그리드 | 아래 §4-T8 |
| **T-9** | 미니맵 숨김 | `CanvasRoute.tsx:958~967` | `{tablet && <Minimap …/>}` 렌더를 제거한다. **`shell/Minimap.tsx` 파일은 지우지 않는다** — 되돌리기 비용을 0으로 둔다 |

#### T-8 상세 — "1초 이상 누르면" 은 **롱프레스 진입**이다 (판정 + 근거)

**판정: 롱프레스로 리사이즈 모드에 진입한다. 상시 드래그가 아니다.**

근거 3가지:
1. **원문에 시간 조건이 명시돼 있다.** 상시 드래그라면 "1초 이상" 이라는 조건이 존재할 이유가 없다.
   *"경계선을 드래그하면"* 이라고 썼을 것이다.
2. **상시 드래그는 이 레이아웃에서 물리적으로 못 만든다.** 경계는 CSS 그리드 열 경계
   (`styles.css:134` `grid-template-columns: var(--sidebar-w) minmax(0,1fr) var(--inspector-w)`)라
   폭이 0이다. 손가락으로 잡으려면 히트 띠를 24~44pt 로 넓혀야 하는데, 그 띠가
   사이드바 첫 열 컨트롤(`.inspector .idf-grid` 버튼들, `styles.css:3097`)과 캔버스 우측 끝을
   동시에 덮어 **결함 표기 오탭**이 난다. 현장에서 가장 비싼 실수다.
3. **이 코드베이스는 같은 문제를 이미 한 번 풀었다.** 세로 바텀시트는 **눈에 보이는 두꺼운 손잡이**
   (`TabletSheet.tsx:129~`)로 풀었다. 가로에서 같은 손잡이를 상시 노출하면 캔버스가 그만큼 좁아진다.
   → *"평소엔 없고, 길게 눌러야 나타난다"* 가 이 코드베이스의 기존 해법과 모순되지 않는 유일한 형태다.

동작 정의:
```
경계 히트띠(투명, 12px) 위에서 pointerdown
  → 1000ms 동안 이동 8px 이내로 유지
  → [리사이즈 모드 진입] 경계선이 파랑(--accent)으로 굵어지고 진동 피드백(가능하면)
  → 이후 같은 포인터의 이동이 --inspector-w 를 실시간 변경
  → pointerup / pointercancel 에 모드 종료 + 폭 저장
1000ms 전에 8px 넘게 움직이면 → 진입 취소. 그 이벤트는 원래 대상(캔버스 팬)에게 넘어간다
```
- 폭 범위: `min 260px` ~ `max 다음 중 작은 값(화면폭 × 0.6, 560px)`
- 사이드바 내부 UI 최적화: **JS 로 재계산하지 않는다.** `.inspector` 에 컨테이너 쿼리
  (또는 `--inspector-w` 를 읽는 `clamp()`)로 그리드 열 수·버튼 높이·사진 타일 크기를 CSS 로만 바꾼다.
  → 리사이즈 중 리렌더가 없어야 60fps 가 나온다
- 저장: **`localStorage`**(기기별 UI 선호). `meta` KV 가 아니다 — 프로젝트 데이터가 아니다(U49)

---

## 3. 작업 분해 (builder 전달용)

**같은 파일을 건드리는 작업은 한 덩어리로 묶었다** — 과거 동시편집 사고 2건(`CanvasRoute.tsx`) 재발 방지.
🔒 표시된 파일은 **그 배치 외에는 아무도 못 건드린다.**

| # | 배치 | 작업 | 주 산출물(🔒=배타 점유) | 의존 | 난이도 |
|---|---|---|---|---|---|
| **B1** | 화살표 축척 | C-1 | 🔒`canvas-core/shapes.ts` `renderModel.ts` `constants.ts` `interaction.ts`(1줄) + 테스트 | Q67(비차단) | 하 |
| **B2** | 스타일 소스 통일 | C-2 | 🔒`apps/web/src/canvas/labelStyle.ts`(신설) 🔒`store.ts` + `export/locationMap.ts`(위임 전환) + `canvas-core` 테스트 | 없음 | 중 |
| **B3** | 캔버스 라우트 묶음 | P-1 · T-9 · T-8 · C-2 배선 | 🔒`routes/CanvasRoute.tsx` 🔒`data/drawingScale.ts`(신설) 🔒`styles.css` | **B2 이후** (같은 파일) | 중 |
| **B4** | 결함정보 폼 묶음 | C-3 · T-1 · T-2 · T-4 · T-5 · T-6 | 🔒`ui/defectForm/SizeBlock.tsx` 🔒`ui/defectForm/DefectInfoForm.tsx` 🔒`ui/Inspector.tsx` | **Q68** | 중 |
| **B5** | 사진 섹션 | T-7 | 🔒`ui/photos/PhotoSection.tsx` + `styles.css`(B3 이후) | B3·B4 이후 | 하 |
| **B6** | 격자 정렬 | P-2 | 🔒`canvas-core/labelGrid.ts`(신설) `commands.ts` `types.ts` `interaction.ts` + 앱 배선 | **B1 이후**(interaction.ts) · Q71 | 상 |
| **B7** | 다중선택 | C-4 | 코어 5파일 + 앱 5파일 — **다시 쪼갤 것** | **Q69 차단** | 최상 |
| **B8** | 말풍선 종류 | C-5 | `store.ts` `ContextToolbar.tsx` `Inspector.tsx` | **Q70 차단** + B2·B4 이후 | 중 |
| **B9** | 부재 태블릿 노출 | T-3 | `project-core/items/{types,seed,resolve,edit}.ts` + `routes/settings/MemberColumn.tsx` + `DefectInfoForm.tsx` | **Q72 차단** + B4 이후 | 상 |

**권장 진행 순서:** B1 → B2 → B3 → B4 → B5 (여기까지 답 없이 갈 수 있다) →
답변 도착 후 B6 → B8 → B9 → B7.

**파일 충돌 지도 (동시 실행 금지 쌍):**
- `CanvasRoute.tsx` — B2(배선)·B3(P-1/T-9/T-8) → **B3 하나로 합쳤다**
- `styles.css` — B3·B5 → **순차**
- `canvas-core/interaction.ts` — B1(1줄)·B6·B7 → **순차**
- `DefectInfoForm.tsx` — B4·B9 → **순차**
- `store.ts` — B2·B8 → **순차**

---

## 4. 지적 사항

| 유형 | 위치 | 내용 | 심각도 |
|---|---|---|---|
| **누락** | scope C-5 · D27 | D27은 **색**만 확정했다. `REPAIRED` 전이 허용 여부·잠긴 결함에서의 종류 변경·`prevDefectId` 없는 결함을 전회차로 만드는 문제가 전부 미정 | 🔴 높음 |
| **모순** | scope T-3 vs `project-core/items/seed.ts:30~48` | 요청의 *"기둥·보·벽체·슬래브·마감재"* 중 **"벽체"·"슬래브"·"마감재" 라는 이름의 시드 부재가 없다.** 시드는 `벽(구조체)`·`벽(비구조체)`·`바닥 슬래브`·`천장 슬래브`·`계단 슬래브`·`계단참 슬래브`·`천장 마감재` 로 쪼개져 있다(17종) | 🔴 높음 |
| **모호** | scope C-4 | *"더블클릭 + 드래그"* — ① 더블클릭으로 모드를 켜고 그 다음 드래그인가 ② 두 번째 누름에서 바로 끌기인가. ②는 브라우저가 `dblclick` 을 안 보내 지금 이벤트로 표현 불가 | 🔴 높음 |
| **누락** | scope C-4 | 영역선택으로 잡은 여러 결함을 **이동**할 때 스냅·정렬 가이드를 어떻게 하는가. 잠긴 결함이 섞이면? | 🔴 높음 |
| **모순** | scope C-4 vs `interaction.ts:681~694` | 빈 곳 더블클릭 = **화면 맞춤(fit)** 이 이미 쓰이는 동작이다. 영역선택을 붙이면 이 동작이 사라지거나 다른 제스처로 옮겨야 한다 | 🟠 보통 |
| **누락** | scope C-3 | 이미 `areaM2` 만 있고 `areaWMm/areaHMm` 가 `null` 인 결함(옛 직접입력분)의 표시·편집 방법 | 🟠 보통 |
| **누락** | scope T-6 | 폼에 있는데 요청 목록 어디에도 없는 필드 3개 — **진행 여부**(`:185`) · **누수 여부**(`:207`) · **유사결함 불러오기**(`:88`) | 🟠 보통 |
| **모호** | D28 / P-2 | 격자 **간격**의 출처가 안 정해졌다. 정렬 **대상 범위**(도면 전체 / 층 / 선택분)도 미정. 잠긴 결함 포함 여부도 미정 | 🟠 보통 |
| **모호** | P-2 ↔ `ExportRun` | `ExportRun` 은 **번호 매핑만** 저장하고 좌표는 저장하지 않는다. 정렬 후 `[같은 번호로 다시 받기]` 로 조사위치도를 다시 뽑으면 **번호는 같은데 풍선 위치는 달라진 파일**이 나온다. 출력 재현성 규칙의 경계면 | 🟠 보통 |
| **모호** | C-1 | 꺾인 화살표에서 첫 구간이 촉보다 짧을 때 촉이 두 번째 구간까지 넘어가도 되는가 | 🟢 낮음 |
| **경미(기존 코드)** | `defectGeom.ts:366` vs `renderModel.ts:398` | `balloonR` 은 클램프 없이 싣는데 `labelHalfExtra`·렌더는 `Math.max(4, …)` 를 쓴다. 기준이 갈린다. 실무 영향 작음(히트에 `HIT_MIN_LABEL_PX` 하한이 따로 있다) — **이번에 고치지 않는다. 기록만** | 🟢 낮음 |
| **경미(기존 코드)** | `interaction.ts:1540` | 정렬 스냅 결과 `pos` 에 `softClampLabel` 을 먹인다. 소프트 리밋 경계에서는 가이드선은 그려지는데 라벨이 그 선에 안 붙는다(§2-8-c 위반). 발생 조건이 좁아 **이번 범위 밖** | 🟢 낮음 |
| **관찰** | `constants.ts:181~194` | `labelScale` 은 `balloonRadius`(→`fontSize`)만 키운다. `markRadius`·`markStroke`·`arrowHead`·`leaderWidth` 는 안 따라온다. 번호만 커지고 표기는 그대로다 — 요청에 없어 **손대지 않았다** | 🟢 낮음 |

---

## 5. 사용자 확인 필요

`QUESTIONS.md` 에 **Q67 ~ Q73** 으로 기록했다.

| # | 항목 | 차단 여부 |
|---|---|---|
| **Q67** | C-1 — 짧은 첫 구간에서 촉이 그 구간을 넘어가도 되는가 | 비차단 (추천 B) |
| **Q68** | C-3 — 이미 저장된 "면적 직접입력" 값을 어떻게 보여주는가 | 🔴 **차단** |
| **Q69** | C-4 — 영역선택 제스처 정의 + 다중선택으로 무엇까지 하는가 | 🔴 **차단** |
| **Q70** | C-5 — 종류 변경으로 허용할 전이 범위와 잠금 처리 | 🔴 **차단** |
| **Q71** | P-2 — 격자 간격 출처 · 정렬 대상 범위 · 잠긴 결함 | 비차단 (추천 A) |
| **Q72** | T-3 — "기둥·보·벽체·슬래브·마감재" 가 시드 17종 중 무엇인가 + 기존 프로젝트 기본값 | 🔴 **차단** |
| **Q73** | T-6 — 진행여부 · 누수여부 · 유사결함 불러오기를 태블릿에 남기는가 | 비차단 (추천 A) |

세운 가정: `ASSUMPTIONS.md` **U45 ~ U52** (전부 비차단).

---

## 6. 고유 함정 8종 대조 결과

| # | 함정 | 이번 범위 영향 | 판정 |
|---|---|---|---|
| 1 | 번호 3종 | P-2 는 **위치만** 바꾼다. 출력 번호는 계산값 그대로 | ✅ 안전 |
| 2 | 좌표 정규화 | P-1(`imgScale`)은 좌표 무관(코드 확인). P-2 는 이미지 px 로 계산 후 정규화로 되돌림 | ✅ 안전 |
| 3 | 오프라인 우선 | 모든 변경이 기존 로컬 우선 경로(`applyAndPush`·repo) 위 | ✅ 안전 |
| 4 | 항목 계층 | T-3 는 D30 대로 **마스터 플래그 + 스냅샷**. 이름 하드코딩 금지 | ⚠️ Q72 |
| 5 | 스타일 상속 | C-1 은 `resolveStyle` 의 `s?.arrowHead ?? global.arrowHead` 를 안 건드린다 | ✅ 안전 |
| 6 | 면적 단위 | C-3 는 `areaFromMm`(mm²→㎡, `trunc4`)만 쓴다. 개소 안 곱함 | ✅ 안전 |
| 7 | 층 sortOrder | 이번 범위 무관 | — |
| 8 | 전회차 상태 3종 | **C-5 가 정면으로 건드린다** — 전이 조건 재정의 필요 | 🔴 Q70 |
| 추가 | DB_VERSION 1 유지 | C-1·C-2·C-3·P-1·P-2·T-1·T-2·T-4~T-9 전부 **스키마 변경 0**. T-3만 `ItemSettings` 확장(읽기 시점 정규화로 흡수 가능) | ✅ / ⚠️T-3 |
| 추가 | 색 예약 | D27 로 지켜졌다. `STATUS_COLOR` 무변경 | ✅ 안전 |

---

## 변경 이력

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-09-03 | 최초 작성 | UI·동작 개선 16건 스펙 검토 |
