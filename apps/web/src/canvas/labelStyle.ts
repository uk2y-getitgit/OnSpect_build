/**
 * 번호 풍선 스타일 소스 — **한 벌만 존재한다** (C-2).
 *
 * F6 의 `Drawing.labelScale` 은 도면 단위 저장 필드다. 이 값이 반영된 `GlobalStyle` 을
 * 만드는 계산이 예전에는 세 벌(`CanvasRoute` 렌더 memo · `export/locationMap.globalStyleFor` ·
 * 그리고 리듀서·툴바 쪽의 `DEFAULT_GLOBAL_STYLE` 하드코딩)로 갈라져 있었고,
 * 그 결과 **보이는 풍선과 히트 영역·자동배치 거리·정렬 스냅 후보가 서로 다른 반경**을 썼다.
 *
 * 증상(사용자 원문): *"영역이 보이는 것과 다름"* · *"결함 이동 스냅"*.
 * 원인 사슬은 `_workspace/70_plan-reviewer_spec_UIBehavior0903.md` §C-2 에 있다.
 *
 * 규칙:
 *   1. 렌더 · 리듀서(`ReduceContext.globalStyle`) · 파생 계산(`buildScreens`) · 출력은
 *      **반드시 이 함수 하나**를 통해 `GlobalStyle` 을 얻는다. 두 벌로 만들면 반드시 어긋난다.
 *   2. `canvas-core` 는 건드리지 않는다 — `labelScale` 은 앱 표시설정이지 코어 타입이 아니다(U46).
 */
import { DEFAULT_GLOBAL_STYLE, type GlobalStyle } from '@onspect/canvas-core';

/**
 * `labelScale` 이 반영된 `GlobalStyle`.
 *
 * ⭐ **배율이 1(또는 미설정)이면 `DEFAULT_GLOBAL_STYLE` 을 *같은 객체 참조*로 돌려준다** (U47).
 *    새 객체를 만들면 `useMemo`/`ReduceContext` 의존성이 매 호출마다 바뀌어 캔버스가 통째로
 *    다시 그려진다. 기본 도면의 동작이 한 글자도 안 바뀌는 것을 이 참조 동일성으로 보장한다.
 */
export function globalStyleForLabelScale(scale: number | null | undefined): GlobalStyle {
  const s = scale ?? 1;
  if (!Number.isFinite(s) || s === 1) return DEFAULT_GLOBAL_STYLE;
  return { ...DEFAULT_GLOBAL_STYLE, balloonRadius: DEFAULT_GLOBAL_STYLE.balloonRadius * s };
}
