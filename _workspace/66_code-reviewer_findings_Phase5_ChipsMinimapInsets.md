# 검수 결과 — Phase 5 T2-3(층칩) · T2-4(미니맵) · T2-6(안전영역) — 커밋 `cc7d267`

작성: code-reviewer · 2026-09-03
스펙: `_workspace/50_plan-reviewer_spec_Phase5_TeamSync.md` §6-2 (T2-3·T2-4·T2-6)
로그: `_workspace/64_builder_log_Phase5_ChipsMinimapInsets.md`
읽은 것: `git show cc7d267`(전 파일) · `apps/web/src/canvas/CanvasView.tsx` · `apps/web/src/routes/CanvasRoute.tsx`
· `apps/web/src/shell/{FloorChips,Minimap,TabletSheet}.tsx` · `apps/web/src/styles.css`(`.stage`·`.sheet`·
`.stage__palette`·`.minimap*`·`.floorchip*` 규칙 전부) · `packages/canvas-core/src/geometry.ts`·`viewport.ts`
· `packages/project-core/src/floorOrder.ts` · `apps/web/src/ui/Sidebar.tsx`(정렬부)
직접 실행: `npm run typecheck`(3패키지 통과) · `npm test`(canvas-core 392 + project-core 308 = 700, 전부 통과)

## 판정

**조건부 통과.** 심각 0건. 보통 2건(둘 다 "경계면 불일치" 유형 — 코드 자체는 참조 무결하지만
프로듀서/컨슈머 계산 기준이 미묘하게 다르다), 경미 1건.

---

## 지적 사항

### [보통] 미니맵 — 박스 종횡비가 이미지와 다를 때(세로형 도면) 탭 좌표·뷰포트 사각형이 어긋난다

- 파일: `apps/web/src/shell/Minimap.tsx:45-54`(탭 핸들러), `:75-83`(뷰포트 사각형) ·
  `apps/web/src/styles.css` `.minimap__box`(신규, `width:130px; max-height:100px;`)
- 문제: `.minimap__box` 는 `width:130px` 로 고정, `height` 는 인라인
  `aspectRatio: imageWidth/imageHeight` 로만 자동 계산된다. 이미지가 세로로 길어
  (`imageWidth/imageHeight < 130/100 = 1.3`) 계산된 자동 높이가 100px 를 넘으면
  `max-height:100px` 가 높이만 잘라낸다 — **CSS 는 이때 너비를 다시 줄여 종횡비를 맞추지
  않는다**(`aspect-ratio` 는 정의된 쪽(`width`)에서 없는 쪽(`height`)을 계산할 때만 쓰이고,
  그 결과가 `max-height` 에 걸리면 그 축만 잘린다 — 너비는 130px 그대로 남는다). 그 결과
  `.minimap__box` 는 130×100 인데 `<img>` 는 `object-fit:contain` 이라 실제 이미지는 그
  안에서 세로를 꽉 채우고 좌우에 여백(레터박스)을 남긴 채 중앙 정렬된다.
  - 탭 핸들러(45~54행)는 `(e.clientX - r.left) / r.width` 로 **박스 전체 폭** 기준 비율을
    정규화 좌표로 쓴다 — 이미지가 실제로 차지하는 좁은 중앙 띠가 아니라 여백까지 포함해
    나눈다. 좌우 여백을 탭하면 화면 밖(0 또는 1로 clamp)으로, 이미지 안쪽을 탭해도 실제
    지점보다 중앙 쪽으로 치우친 좌표가 계산된다.
  - 뷰포트 사각형(75~83행)도 `left/top/width/height` 를 **박스 기준 %** 로 그린다 — 같은
    이유로 실제로 렌더된(레터박스가 있는) 이미지 위치와 사각형이 어긋난다.
- 재현: 세로로 긴 도면(예: `imageWidth:imageHeight` 가 1:2, 좁고 긴 건물 평면도)을 열고
  태블릿에서 미니맵을 본다 → 이미지가 미니맵 박스 가운데 좁은 세로 띠로 렌더되고 좌우가
  빈다. 그 상태에서 이미지 왼쪽 가장자리를 탭하면 `CENTER_ON_NORM` 이 실제로는 이미지의
  왼쪽보다 훨씬 안쪽(또는 화면 밖 clamp 로 왼쪽 끝)으로 이동한다. 뷰포트 사각형도 실제
  보이는 이미지 띠와 안 맞게 그려진다.
- 정상 케이스: `imageWidth/imageHeight >= 1.3`(가로가 넉넉히 긴 도면)이면 자동 높이가
  100px 를 안 넘어 박스가 이미지와 정확히 같은 비율이 되고, 위 문제가 발생하지 않는다.
  일반적인 가로형 도면에서는 안 보이는 버그라 실기기 스모크로는 놓치기 쉽다.
- 수정 방향(택1):
  1. 탭·사각형 계산의 기준을 "박스" 가 아니라 "박스 안에서 실제로 이미지가 렌더된 사각형"
     으로 바꾼다 — `object-fit:contain` 이 만드는 letterbox 를 JS 로 재계산
     (`imgRect = containFit(boxRect, imageWidth, imageHeight)`) 해서 그 사각형 기준으로
     좌표를 나눈다.
  2. 아니면 CSS 를 고쳐 `.minimap__box` 가 **항상** 이미지와 같은 비율이 되도록
     `width`/`height` 를 JS 에서 직접 계산해 인라인으로 넣는다(`max-height` 로 자르지 않고,
     `min(130/Wi, 100/Hi) * Wi/Hi` 로 두 축을 함께 축소).
  안 1이 기존 `object-fit:contain` CSS 를 유지할 수 있어 더 작은 변경이다.

### [보통] T2-6 안전영역 — "같은 공식"이 아니라 "같은 상수·다른 높이 소스"다 (키보드 열림 시 어긋날 수 있다)

- 파일: `apps/web/src/shell/TabletSheet.tsx:60-62`(`viewportHeight`) ·
  `apps/web/src/routes/CanvasRoute.tsx:132-149`(`sheetBottomPx`) ·
  `apps/web/src/styles.css:4468-4470`(`.sheet[data-snap] { height: N% }`)
- 문제: `.sheet` 는 `position: fixed` 이고 조상 중 `transform`/`will-change`/`contain` 을
  가진 것이 없다(`  .app`·`.body` 확인함) — 그래서 CSS 의 `height: N%` 는 **초기
  containing block(레이아웃 뷰포트, 대략 `window.innerHeight`)** 기준으로 계산된다.
  반면 JS 쪽 `viewportHeight()` 는 `window.visualViewport?.height ?? window.innerHeight` 로
  **visualViewport 를 우선**한다. 이 둘은 평상시(주소창 고정·키보드 없음)에는 같은 값이지만,
  **온스크린 키보드가 열리면 갈라진다** — `visualViewport.height` 는 키보드만큼 줄어들고
  `innerHeight`(따라서 `.sheet` 의 실제 CSS 높이)는 그대로다.
  더 나쁜 것은: `CanvasRoute.tsx` 132~149행이 **`window.visualViewport` 의 `resize` 도
  구독**(`window.visualViewport?.addEventListener('resize', onResize)`)하고 있어서, 키보드가
  열리는 순간 `vh` 가 (visualViewport 기준으로) 더 작은 값으로 갱신되고, `sheetBottomPx =
  SHEET_SNAP_RATIO[snap] * vh` 도 더 작아진다 — 반면 `.sheet` 의 실제 렌더 높이(레이아웃
  뷰포트 기준)는 안 줄어든다. 즉 **키보드가 열려 있는 동안 `insets.bottom` 이 실제 시트
  높이보다 작게 계산**된다.
  하필 이 상황은 우연이 아니라 `TabletSheet.tsx` `onFocusCapture`(170~177행, 기존 코드)가
  **직접입력 칸 포커스 = 키보드 열림으로 보고 시트를 FULL 로 자동 전환**하는 바로 그
  경로라, "빗나가는 상태" 와 "FULL 전환이 실제로 일어나는 상태" 가 겹친다.
- 재현(태블릿 실기기 필요 — 코드상 추론): 세로 태블릿에서 결함을 선택 → 직접입력 칸(예:
  균열폭)에 포커스 → 시트가 FULL 로 자동 전환되며 온스크린 키보드가 뜬다 → 이 순간
  `visualViewport.height` 가 키보드만큼 줄어 `vh` 가 갱신되고 `sheetBottomPx` 도 그만큼
  작게 재계산된다 → `insets.bottom` 이 시트의 실제 화면상 높이보다 작아 도면
  콘텐츠(결함 번호 풍선 등)가 시트에 가려질 여지가 남는다. 정도는 브라우저·OS 버전에 따라
  달라진다(iOS Safari 와 Chrome 이 키보드에 대한 `visualViewport`/`innerHeight` 처리를
  다르게 한다) — **기기마다 재현 여부가 갈릴 수 있어 직접 확인이 필요하다.**
- builder 로그(64번 문서 93~97행)의 "알려진 한계"는 **손잡이 드래그 중** 픽셀 추적 누락만
  언급한다. 이 지적은 그것과 다른 경로(포커스로 인한 자동 FULL 전환)라 별도로 확인이
  필요하다.
- 수정 방향: `vh` 계산에 `window.visualViewport` 를 쓰지 말고 `window.innerHeight` 로
  통일하거나(= CSS `%` 의 실제 기준과 맞춘다), 반대로 CSS `.sheet` 높이를 `dvh`/`svh` 같은
  뷰포트 인식 단위로 바꿔 JS 쪽 `visualViewport` 기준과 맞춘다. **두 계산이 서로 다른
  높이 소스를 읽는 지금 상태를 "같은 공식" 이라고 부르면 안 된다** — 상수(비율)는 같지만
  입력(높이)이 다를 수 있다.
- 사용자 확인 체크리스트 보강 제안: 기존 64번 문서의 "시트를 PEEK→HALF→FULL 로 끌어
  올리면서" 항목은 **수동 드래그** 만 검증한다. **직접입력 칸을 탭해 키보드가 자동으로
  뜨는 경로**(포커스 기반 FULL 전환)도 별도로 확인해야 위 우려가 실기기에서 실제로
  나타나는지 알 수 있다.

### [경미] `sheetBottomPx` 계산은 사실 순수 함수인데 인라인으로 남아 테스트가 없다

- 파일: `apps/web/src/routes/CanvasRoute.tsx:576-582`
- 문제: 로그(64번 문서 61~63행)는 "이번 작업은 신규 순수 함수를 추가하지 않아 새 단위
  테스트를 안 늘렸다"고 적었다. 그런데 `sheetBottomPx` 의 알맹이 —
  `(!sheetMode || selected === null) ? 0 : Math.round(SHEET_SNAP_RATIO[sheetSnap] * vh)` —
  는 DB·전역 상태 없이 인자만으로 결정되는 순수 계산이다(단지 `useMemo` 안에 인라인으로
  박혀 있어 "숨어" 있을 뿐). 하필 이 식이 위 [보통] 두 번째 지적의 핵심이다 — 별도
  함수로 뽑아 `(sheetMode, selected, snap, vh) → number` 유닛테스트 몇 줄만 있었어도
  "0 이 되어야 하는 조건"(PC·미선택·가로) 회귀는 코드로 고정할 수 있었다.
- 수정 방향(급하지 않음): `computeSheetBottomPx` 같은 이름으로 뽑아 `apps/web/src` 안에
  두고 표 기반 테스트 5~6줄(PC→0, landscape→0, 미선택→0, PEEK/HALF/FULL 각 비율) 추가.
  기능 변경은 없다 — 회귀 방지용.

---

## 확인해 본 것 — builder 주장 검증 결과

| # | 주장 | 검증 방법 | 결과 |
|---|---|---|---|
| 1 | T2-6: `.sheet` 가 `position:fixed` 라 `[data-floating]` 스캔(`stage?.querySelectorAll`)에 안 잡힌다 | JSX 트리 확인 — `InspectorPlacement`(`TabletSheet` 포함)는 `<main className="stage">` 의 **형제**(둘 다 `.body` 의 직계 자식)다. `measureInsets` 의 `stage = el.parentElement`(= `.stage`) 기준 스캔은 구조적으로 `.sheet` 를 못 본다 | ✅ 사실 |
| 1 | `reserveBottomPx` 를 `Math.max` 로 병합하며, DOM 스캔 결과를 깎아먹는 경로는 없다 | `CanvasView.tsx` 199~205행 — `insets.bottom = Math.max(insets.bottom, reserveBottomRef.current)` 가 스캔 루프 **이후** 마지막에 한 번만 실행. 다른 곳에서 `insets.bottom` 을 덮어쓰는 대입 없음 | ✅ 사실 |
| 1 | PC·미선택·가로 태블릿에서 0 | `CanvasRoute.tsx` 578행 `if (!sheetMode \|\| selected === null) return 0` — `sheetMode = shell === 'tablet-portrait'` 이므로 PC·가로 둘 다 `sheetMode=false`. 기본 prop 값도 `reserveBottomPx = 0`(`CanvasView.tsx` 104행) | ✅ 사실 |
| 1 | 시트 스냅 전환마다 재계산되고, 관찰자(ResizeObserver/MutationObserver) 재구성 없이 처리 | `CanvasView.tsx` 228행 관찰자 effect 는 `[send]` 에만 의존해 재생성 안 됨. 232~234행 별도 effect가 `[reserveBottomPx]` 변화 시 같은 `measureInsetsRef.current()` 호출 — ref 클로저가 `reserveBottomRef.current`(매 렌더 갱신)를 읽으므로 관찰자를 새로 만들 필요가 없다 | ✅ 사실. 다만 "같은 공식" 이라는 표현은 위 [보통] 참고 |
| 2 | T2-4: `CENTER_ON_NORM`·`toNorm`·`clamp01` 을 코어에서 그대로 가져다 쓴다 | `Minimap.tsx` import 확인 — `@onspect/canvas-core` 에서 직접 import, 재구현 없음 | ✅ 사실 |
| 2 | 뷰포트 사각형이 화면 비율과 일치 | `toNorm({0,0}/{canvas.w,canvas.h}, viewport, iw, ih)` 이 코어 좌표계 관례(`toScreen`/`toNorm` 이 캔버스 호스트 로컬 px 를 전제)와 일치 — 이 부분은 맞다. **다만 박스 자체가 이미지 비율과 다를 수 있어(위 [보통] 1) 그 결과를 그리는 좌표계가 어긋난다** | 🟡 부분 사실 — 변환식은 맞으나 렌더 좌표계 전제가 세로형 도면에서 깨진다 |
| 3 | T2-3: `sortByOrder`(project-core) 재사용 | `FloorChips` 는 자체 정렬을 하지 않고 `CanvasRoute.orderedFloors` 를 그대로 받는다. `orderedFloors`(269~275행, 이번 커밋 이전부터 존재)는 `sortByOrder(buildings)` 로 동 순위를 매기고 층은 `a.sortOrder - b.sortOrder` 로 정렬 — `sortByOrder` 자체를 층에 재적용하진 않지만 **같은 정수 비교 규칙**이라 결과는 동일. `Sidebar.tsx` 62~65행도 독립적으로 `sortByOrder(buildings)` + `sortByOrder(floors)` 를 쓰는데 두 경로 다 "동 순위 → sortOrder 오름차순" 이라 결과가 갈릴 이유가 없다 | ✅ 사실 (다만 `orderedFloors` 자체는 이번 커밋 산출물이 아니라 기존 코드) |
| 3 | 칩에서 고른 층과 Sidebar 가 항상 같은 층을 가리킨다 | 둘 다 같은 `selectFloor` 콜백(`onSelect`/`onSelectFloor`)을 호출하고, 같은 `resolvedFloor.id` 를 `currentFloorId`/`selectedId`/`floorId` 로 공유 — 별도 상태 없음 | ✅ 사실 |
| 4 | `canvas-core` 무변경 | `git show --stat cc7d267` — `packages/canvas-core` 경로가 통계에 없음(변경 파일 7개 전부 `apps/web` + `_workspace`) | ✅ 사실 |
| 5 | PC 레이아웃 불변 | 새 CSS(`.stage__floorchips`·`.floorchip*`·`.minimap*`)는 `data-shell` 선택자로 감싸지 않았지만, 해당 클래스가 붙는 DOM 자체가 `{tablet && …}` 로만 렌더되어 PC 에서는 노드가 없다. `reserveBottomPx` 도 PC 에서 0 (위 1 참고) | ✅ 사실 |
| 6 | 신규 순수함수 없어 테스트 미추가 | `Minimap`·`FloorChips`·`CanvasView`·`CanvasRoute` diff 전체 확인 — 대부분 DOM/렌더 배선이 맞다. 다만 `sheetBottomPx` 산식은 뽑아내면 순수함수가 되는 로직이라 "숨은 순수함수 없음" 은 정확하지 않다 | 🟡 부분 사실 — [경미] 참고 |
| — | `npm run typecheck` 3패키지 통과 | 직접 실행 | ✅ 사실 |
| — | `npm test` 700개 통과, 회귀 없음 | 직접 실행 — canvas-core 392 + project-core 308 = 700, 전부 green | ✅ 사실 |

---

## 불변식 검수표

이번 변경은 불변식 8종(좌표 정규화·출력번호 미저장·로컬우선쓰기·면적계산·층정렬·마스터+연결·설정스냅샷·isPrimary)
을 다루는 데이터 계층에 손대지 않았다(화면 배선 + CSS + 순수 좌표변환 재사용뿐). 해당 없음으로 판단.

| # | 불변식 | 결과 | 근거 |
|---|---|---|---|
| 5 | 층 sortOrder 정수 비교 | ✅ 유지 | 위 "확인해 본 것" #3 — 새 정렬 규칙 없음, 기존 `orderedFloors`/`sortByOrder` 그대로 |
| 그 외 7종 | 해당 없음 | — | 이번 diff 는 `Defect`/`Photo`/`ItemSettings`/면적/isPrimary 경로를 건드리지 않음 |

---

## 확인하지 못한 것

- **실기기 렌더 결과**는 코드 추론으로만 판단했다(작업 지시대로 브라우저·개발서버 미실행).
  특히 [보통] 두 항목은 실제 화면에서 눈으로 확인해야 확정된다:
  - 세로형 도면을 실제로 열어 미니맵 레터박스·탭 오차가 보이는지
  - 태블릿에서 직접입력 칸에 포커스했을 때(키보드 자동 표시) 안전영역이 실제로 어긋나는지
    (iOS/Android, 브라우저별로 다를 수 있음)
- `.floorchip` 스트립과 태블릿 좌측 세로 팔레트(`max-height: calc(100% - 24px)`, 세로 중앙
  정렬)가 도구 수가 많아 팔레트가 길어질 때 상단에서 겹칠 가능성을 CSS 상 확인했으나
  (`.stage__floorchips` top:12px vs `.stage__palette` top:50%+translateY(-50%)), 실제
  도구 개수 기준 팔레트 높이를 계산할 수 없어 확정 짓지 않았다 — builder 도 "실기기 확인 후
  조정 필요"로 이미 명시했으므로 별도 지적으로 올리지 않고 여기 기록만 남긴다.
