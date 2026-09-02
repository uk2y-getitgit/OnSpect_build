/**
 * 태블릿 셸 — 화면 종류 · 방향 판정 (T2-1 · 스펙 `50_plan-reviewer_spec_Phase5_TeamSync.md` §4-2/§4-3).
 *
 * 여기서 정하는 것은 **딱 두 가지**다.
 *   1. 지금 이 화면은 손가락으로 쓰는가 (`mode`)
 *   2. 세로인가 가로인가 (`orientation`)
 * 그 둘을 합친 값이 `shell` 이고, `CanvasRoute` 가 `.app[data-shell]` 로 찍어 CSS 가 받는다.
 *
 * ── 판정 규칙 (앱 전체가 이미 쓰는 것과 **같은 규칙**이다) ─────────────────
 *  · 실기기: `(hover: none) and (pointer: coarse)` — 커서를 올려둘 수 없고 주 입력이 손가락.
 *    User-Agent 스니핑은 쓰지 않는다(신뢰 불가).
 *  · 강제 전환: `index.html` 부트스트랩이 `/tablet`·`/pc`·`?ui=` 를 보고 찍어 두는
 *    `<html data-ui-mode>`. **있으면 이것이 이긴다** — `styles.css` U-4 절의 속성 선택자가
 *    미디어쿼리를 덮어쓰는 것과 똑같은 우선순위다. 두 곳이 어긋나면 CSS 와 레이아웃이 따로 논다.
 *  · 부트스트랩이 실패해도(사생활 모드에서 localStorage 접근 불가) 미디어쿼리로 그대로 돈다.
 *
 * 방향은 표준 `matchMedia('(orientation: portrait)')` 로 본다.
 * `screen.orientation` 은 iPadOS Safari 16.4 미만에 없어 쓰지 않는다.
 *
 * ⚠️ **PC 에서는 아무것도 바뀌지 않는다.** `mode === 'pc'` 면 `shell` 은 `'pc'` 하나뿐이고
 *    방향은 계산만 될 뿐 어떤 CSS 도 그 값을 읽지 않는다.
 */
import { useEffect, useState } from 'react';
import { DEFAULT_HIT_PROFILE, type HitProfile } from '@onspect/canvas-core';

export type UiMode = 'pc' | 'tablet';
export type Orientation = 'portrait' | 'landscape';
/** `.app[data-shell]` 에 그대로 찍히는 값 */
export type Shell = 'pc' | 'tablet-landscape' | 'tablet-portrait';

const TOUCH_MQ = '(hover: none) and (pointer: coarse)';
const PORTRAIT_MQ = '(orientation: portrait)';

/**
 * 손가락 히트 프로파일 (트랙 A T5 · `ReduceContext.hitProfile`).
 *
 * 코어는 **주면 쓰고 안 주면 마우스 값**이다(`DEFAULT_HIT_PROFILE`). 그래서 이 값은
 * 태블릿 모드에서만 넘긴다 — PC 히트 판정은 한 픽셀도 바뀌지 않는다.
 *
 * 숫자 근거: 44pt 터치 타깃(iOS HIG). 손가락 접촉면이 8~10mm 라 마우스 값(4~12px)으로는
 * 번호 풍선도 화살표 몸통도 잡히지 않는다. `27_builder_log_Phase5_TrackA.md` 가 남겨 둔
 * 예시값(테스트의 `FAT`)을 그대로 채택했다 — 실기기에서 만져 보고 조정할 자리다.
 *
 * **얼려 둔다.** 코어의 기본 프로파일과 같은 이유다(`constants.ts`): 앱 전체가 공유하는
 * 객체라 어딘가에서 필드 하나를 대입하면 태블릿 히트 판정이 전역으로 바뀐다.
 */
export const TOUCH_HIT_PROFILE: Readonly<HitProfile> = Object.freeze({
  ...DEFAULT_HIT_PROFILE,
  pad: 22,
  minMark: 44,
  minLabel: 44,
  leader: 22,
  stroke: 22,
  handle: 30,
  clickSlop: 12,
  memoInk: 22,
});

function matches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches
    : false;
}

/** 강제 전환값이 있으면 그것, 없으면 실기기 판정 (위 주석의 우선순위) */
function readMode(): UiMode {
  const forced = typeof document !== 'undefined' ? document.documentElement.dataset.uiMode : null;
  if (forced === 'tablet' || forced === 'pc') return forced;
  return matches(TOUCH_MQ) ? 'tablet' : 'pc';
}

function readOrientation(): Orientation {
  return matches(PORTRAIT_MQ) ? 'portrait' : 'landscape';
}

export function shellOf(mode: UiMode, orientation: Orientation): Shell {
  if (mode === 'pc') return 'pc';
  return orientation === 'portrait' ? 'tablet-portrait' : 'tablet-landscape';
}

/** `MediaQueryList` 구독 — Safari 13 이하의 `addListener` 폴백까지 본다 */
function subscribe(query: string, fn: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mql = window.matchMedia(query);
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', fn);
    return () => mql.removeEventListener('change', fn);
  }
  mql.addListener(fn);
  return () => mql.removeListener(fn);
}

export type UiModeState = {
  mode: UiMode;
  orientation: Orientation;
  shell: Shell;
  /** `mode === 'tablet'` 의 줄임. 방향과 무관한 판단(터치 프로파일 등)에 쓴다 */
  tablet: boolean;
};

export function useUiMode(): UiModeState {
  const [mode, setMode] = useState<UiMode>(readMode);
  const [orientation, setOrientation] = useState<Orientation>(readOrientation);

  useEffect(() => {
    const sync = () => {
      setMode(readMode());
      setOrientation(readOrientation());
    };
    // 기기 판정이 늦게 바뀌는 경우(외장 마우스 연결/해제) + 회전
    const offTouch = subscribe(TOUCH_MQ, sync);
    const offOrient = subscribe(PORTRAIT_MQ, sync);
    // 강제 전환은 지금은 페이지 로드 시점에만 찍히지만, 나중에 앱 안에 토글이 생겨도
    // 그대로 따라가도록 속성 변화를 본다 (비용 0에 가깝다)
    const mo =
      typeof MutationObserver === 'function'
        ? new MutationObserver(() => setMode(readMode()))
        : null;
    mo?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ui-mode'] });
    // 첫 렌더와 실제 상태가 어긋난 경우를 한 번 맞춘다
    sync();
    return () => {
      offTouch();
      offOrient();
      mo?.disconnect();
    };
  }, []);

  return { mode, orientation, shell: shellOf(mode, orientation), tablet: mode === 'tablet' };
}
