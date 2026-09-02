# 구현 로그 — Phase 5 검수 반영: 미니맵 세로형 좌표 어긋남 + 안전영역 높이 소스 불일치

작성: builder · 2026-09-03
지적: `_workspace/66_code-reviewer_findings_Phase5_ChipsMinimapInsets.md` [보통1] · [보통2]
(경미1 `sheetBottomPx` 순수함수 추출 건은 [보통2] 수정 방식이 바뀌면서 인라인 산식 자체가
사라져 해당 없음이 됨 — 아래 "설계 메모" 참고)
전제로 읽은 것: `apps/web/src/shell/Minimap.tsx` · `apps/web/src/shell/TabletSheet.tsx` ·
`apps/web/src/routes/CanvasRoute.tsx`(1030행대 `InspectorPlacement` 호출부·579행대 옛
`sheetBottomPx`) · `packages/canvas-core/src/viewport.ts`(`fitViewport`/`fitZoomOf`) ·
`packages/canvas-core/src/geometry.ts`(`toScreen`/`toNorm`) · `packages/canvas-core/src/index.ts`
(재export 확인)

## 완료

| 작업 | 파일 | 상태 |
|---|---|---|
| [보통1] 미니맵 세로형 도면 좌표 어긋남 수정 | `apps/web/src/shell/Minimap.tsx` | 완료 |
| [보통2] 안전영역 높이 소스 통일 | `apps/web/src/shell/TabletSheet.tsx` · `apps/web/src/routes/CanvasRoute.tsx` | 완료 |

### 설계 메모

**[보통1] 미니맵.** 지적대로 "박스 전체" 기준 계산을 "실제로 이미지가 그려지는 사각형(레터박스
뺀 영역)" 기준으로 바꿨다. 다만 지적이 제안한 새 `containFit` 헬퍼를 새로 만들지 않았다 —
`.minimap__box`를 "캔버스", 도면을 그 안에 맞춘 뷰포트로 보면 이미 `canvas-core`에 있는
`fitViewport(iw, ih, canvas, margin)`이 정확히 같은 계산이다(짧은 축 기준으로 축소하고 남는
축을 가운데 정렬 — `object-fit:contain`과 동일한 산식). `margin=0`으로 호출해 코어에 새 함수를
추가하지 않고 재사용했다(코어 변경 0 — 스펙이 요구하는 "코어는 이 파일의 존재를 모른다" 유지).

- `boxRef`에 `ResizeObserver`를 달아 박스의 **실제 렌더 크기**(`getBoundingClientRect`, CSS
  `width:130px` + `max-height:100px` + `aspect-ratio`가 최종 계산한 값)를 `boxSize` state로
  받는다. CSS 규칙을 JS 상수로 다시 베끼지 않기 위해서다 — CSS가 무엇을 계산하든 DOM이 알려주는
  값을 그대로 읽는다(T2-6 수정과 같은 원칙, 아래 참고).
- 뷰포트 사각형: `fitViewport(imageWidth, imageHeight, boxSize, 0)`으로 "박스 안 레터박스
  뷰포트"를 구하고, 기존에 쓰던 `toNorm`(뷰포트 → 도면 정규화)의 짝인 `toScreen`(도면 정규화 →
  박스 로컬 px)으로 좌상단·우하단을 변환한 뒤 `boxSize`로 나눠 퍼센트로 그린다.
- 탭 핸들러: 같은 방식으로 `fitViewport(iw, ih, {실측 r.width/height}, 0)`를 그 자리에서 구해
  `toNorm(클릭 지점 - 박스 원점, vp, iw, ih)`으로 도면 정규화 좌표를 바로 얻는다. 예전처럼
  "박스 폭/높이로 나누기"를 하지 않으므로 레터박스 여백을 탭해도(짧은 축 방향 바깥) 좌표가
  `clamp01`로 안전하게 잘린다.
- `boxSize`가 아직 측정되지 않은 첫 렌더(0×0)에는 뷰포트 사각형을 0 크기로 둔다(계산은 하되
  화면엔 아무것도 안 그림) — `ResizeObserver`가 `observe()` 즉시(스펙상 첫 콜백은 동기적으로
  큐잉됨) 실측값을 보고하므로 사실상 한 프레임 안에 정상값으로 갱신된다.
- 가로형 도면(`imageWidth/imageHeight >= 1.3`, 박스=이미지 비율 같음)에서는 `fitViewport`가
  레터박스 없이 박스를 꽉 채우는 뷰포트를 돌려주므로 기존 동작과 수치가 동일하다 — 회귀 없음.

**[보통2] 안전영역.** 지적의 두 수정 방향 중 **"`getBoundingClientRect()`로 `.sheet` 의 실제
렌더 높이를 직접 재는" 쪽**을 택했다(지적문 원문: "더 근본적이다 — 계산식 두 벌을 유지하는 대신
하나의 진실 소스로"). `vh`를 어느 API로 구하든(`visualViewport` vs `innerHeight`) 결국
"CSS가 계산한 결과"를 다시 계산해서 맞히려는 시도라 온스크린 키보드처럼 두 API가 갈라지는
순간마다 또 틀릴 수 있다 — DOM이 이미 계산해 놓은 값을 그냥 읽으면 그 문제 자체가 사라진다.

- `TabletSheet`(`apps/web/src/shell/TabletSheet.tsx`)에 `onHeightChange?: (px: number) => void`
  prop을 추가했다. `sheetRef`에 `ResizeObserver`를 달아 마운트 시 1회, 이후 높이가 바뀔 때마다
  (스냅 전환 트랜지션 · 드래그 중 인라인 `style.height` · 브라우저 리사이즈 무엇이 원인이든)
  `getBoundingClientRect().height`를 그대로 보고한다. 언마운트 시(시트가 사라질 때) `0`을 한 번
  더 보고한다.
- `InspectorPlacement`가 이 prop을 그대로 `<TabletSheet>`에 전달한다. `sheet===false`(PC·태블릿
  가로)에서는 `TabletSheet`가 아예 마운트되지 않으므로 `onHeightChange`가 호출되지 않는다 —
  호출자 쪽 초기값(0)이 그대로 유지된다.
- `CanvasRoute.tsx`: 옛 `vh` state/effect(`viewportHeight()` 구독, `visualViewport`+`resize`
  리스너)와 `sheetBottomPx = useMemo(() => SHEET_SNAP_RATIO[sheetSnap] * vh, ...)` 산식을
  전부 제거했다. 대신 `const [sheetBottomPx, setSheetBottomPx] = useState(0)`만 남기고
  `<InspectorPlacement onHeightChange={setSheetBottomPx} .../>`로 실측값을 그대로 받는다.
  `SHEET_SNAP_RATIO`·`viewportHeight` import도 더 이상 안 쓰여서 제거했다(`type SheetSnap`만
  남김).
- `TabletSheet.tsx`의 `viewportHeight()` 함수 자체는 지우지 않았다 — 드래그 중 손잡이 위치를
  3단 픽셀 범위로 clamp하거나(`onPointerMove`) 놓은 지점에서 가장 가까운 단을 고르는
  (`nearestSnap`) 순수 내부 로직에서 여전히 쓴다. 이 두 용도는 "시트 자신의 목표 높이를
  스스로 계산"하는 것이라 DOM 실측과 순환 참조가 안 생긴다(안전영역 계산과는 별개 경로) —
  지적 대상이 아니었고, 건드리면 범위를 넘는 리팩터가 된다.
- **부수효과(의도한 것):** 드래그 중에는 `sheetRef`의 인라인 `style.height`가 픽셀 단위로
  실시간으로 바뀌므로 `ResizeObserver`가 그 값도 그대로 따라간다. 옛 산식은 `sheetSnap`(드롭
  시점에만 바뀜) 기준이라 **드래그 중에는 안전영역이 갱신되지 않는 한계**가 있었다(64번 로그
  "알려진 한계"). 이번 변경으로 그 한계도 같이 없어졌다 — 별도 작업으로 취급하지 않았고 새로
  건드린 코드도 없다(DOM 실측이라는 같은 메커니즘의 자연스러운 결과).
- **경미1 대응:** 옛 `sheetBottomPx` 산식(`(!sheetMode || selected===null) ? 0 :
  Math.round(SHEET_SNAP_RATIO[snap]*vh)`)은 이번 수정으로 완전히 삭제됐다 — 인라인 계산 자체가
  없어졌으므로 "숨은 순수함수를 뽑아 테스트" 할 대상이 사라졌다. 새로 남은 것은 리액트 state
  하나(`setSheetBottomPx`)와 `TabletSheet`의 DOM 실측 effect뿐이라 순수함수로 뽑을 계산이 없다.
  `apps/web`에는 테스트 러너가 없어(package.json에 `test` 스크립트 없음, 루트 `npm test`도
  canvas-core·project-core만 돈다) 애초에 단위테스트 대상이 아니었다.

## 미완료 / 막힌 것

없음.

## 검증한 것

- `npm run typecheck` — canvas-core · project-core · web 3패키지 전부 통과.
- `npm test` — canvas-core 392 + project-core 308 = 700개 전부 통과(변경 없음 — apps/web은
  테스트 러너가 없어 대상 아님, 새 순수함수도 추가하지 않았음. 위 경미1 대응 참고).
- `npm run build` — `vite build` 성공(기존에도 있던 500kB 청크 경고는 이번 변경과 무관, 파일
  분리·수정만 했고 새 의존성을 추가하지 않았다).
- PC 레이아웃 불변 — 코드 추적: `Minimap`은 `CanvasRoute.tsx` 959행 `{tablet && <Minimap .../>}`
  로만 마운트된다(변경 안 함, 이번 diff는 컴포넌트 내부 좌표계산만 건드렸다) → PC(`tablet=false`)
  에서는 이 컴포넌트 자체가 렌더되지 않아 새 `ResizeObserver`도 안 붙는다. `TabletSheet`도
  `InspectorPlacement`가 `sheet===false`(PC·태블릿 가로)일 때 `<>{children}</>`만 반환해
  마운트되지 않으므로(변경 안 한 기존 분기) `onHeightChange`가 호출되지 않고 `sheetBottomPx`는
  초기값 0 그대로 — `CanvasView`의 `reserveBottomPx` prop도 0으로 유지돼 안전영역 계산 결과가
  PC에서 바뀌지 않는다.
- 가로형 도면(기존 정상 케이스) 회귀 없음 — 코드 추적: `imageWidth/imageHeight`가 박스 비율과
  같거나 더 넓을 때 `fitViewport`가 반환하는 `zoom`은 `min(boxW/iw, boxH/ih)`이고 레터박스가 안
  생기는 조건에서는 예전 "박스 전체 기준 나누기"와 동일한 산술 결과가 된다(레터박스 오프셋
  `tx`/`ty` 가 0이 되므로 `toScreen`이 예전 `left*100%`/`top*100%` 계산과 수치상 일치).

## 직접 확인해주실 것

- [ ] **세로형 도면**(예: 좁고 긴 건물 평면도, `imageWidth:imageHeight`가 대략 1:2 이상)을 열고
      태블릿 화면 폭으로 미니맵을 확인 → 도면이 미니맵 박스 안에서 레터박스(좌우 여백)와 함께
      제대로 보이고, 뷰포트 사각형이 실제 도면 이미지 위에 겹쳐 그려지는지(여백 위가 아니라).
- [ ] 세로형 도면 미니맵에서 이미지의 **왼쪽 가장자리 근처**를 탭 → 도면이 실제로 그 지점
      근처로 이동하는지(레터박스 여백을 탭했을 때만 화면 가장자리로 clamp 되는지).
- [ ] 세로 태블릿에서 결함 선택 → 직접입력 칸(예: 균열폭)에 포커스 → 시트가 FULL로 자동
      전환되며 온스크린 키보드가 뜨는 상황에서, 도면의 결함 번호 풍선 등이 시트에 가려지지
      않는지(안전영역이 시트 실제 높이만큼 확보되는지).
- [ ] 시트 손잡이를 손가락으로 끌어 올리는 동안(PEEK→HALF→FULL) 도면 콘텐츠가 시트에 가려지지
      않고 실시간으로 안전영역이 따라오는지(이전에는 드롭한 뒤에만 갱신됐던 것이 이번 수정으로
      드래그 중에도 따라가도록 바뀌었다 — §"부수효과" 참고).

## 알려진 한계

- `ResizeObserver`의 콜백 타이밍은 브라우저 구현에 따라 미세하게 다를 수 있다(스펙상 레이아웃
  이후 페인트 전에 큐잉되지만, CSS 트랜지션이 걸린 구간에서는 프레임마다 다시 호출되지 않고
  스로틀링될 수 있음) — 스냅 전환 애니메이션이 재생되는 짧은 구간(수백 ms) 동안 안전영역 갱신이
  최종값에 아주 약간 늦게 수렴할 가능성이 있다. 정지 상태·드래그 상태에서는 문제가 없다(둘 다
  코드 추적으로 확인). 애니메이션 중 프레임 단위 정합성은 실기기에서만 확인 가능해 위 체크리스트
  범위 밖으로 뒀다.
- 미니맹/시트 두 수정 모두 code-reviewer 66번 문서가 이미 명시한 대로 **실기기 렌더 결과는
  코드 추론으로만 검증**했다 — 브라우저·개발서버를 띄우지 않았다(작업 지시 및 CLAUDE.md 규칙).
