/**
 * 스타일 상속 — 스펙 §2-9-c.
 *
 * ⚠️ 위치(라벨 좌표)는 절대 여기를 거치지 않는다. 위치는 geometry 다 (§2-1-c, 함정 #5).
 * 라벨을 끌었다는 이유로 `defect.style` 이 null → 객체로 바뀌면
 * 정리한 결함이 전부 전역 스타일 상속에서 이탈한다.
 */
import {
  AREA_DEFAULT_FILL,
  AREA_DEFAULT_SHAPE,
  RENDER_DEFAULTS,
  STATUS_COLOR,
  STATUS_OPACITY,
} from './constants.js';
import type { Defect, GlobalStyle, ResolvedStyle, StyleOverride } from './types.js';

export const DEFAULT_GLOBAL_STYLE: GlobalStyle = {
  markRadius: RENDER_DEFAULTS.markRadius,
  markStroke: RENDER_DEFAULTS.markStroke,
  balloonRadius: RENDER_DEFAULTS.balloonRadius,
  balloonStroke: RENDER_DEFAULTS.balloonStroke,
  leaderWidth: RENDER_DEFAULTS.leaderWidth,
  fontFactor: RENDER_DEFAULTS.fontFactor,
  haloFactor: RENDER_DEFAULTS.haloFactor,
  arrowHead: RENDER_DEFAULTS.arrowHead,
  areaShape: AREA_DEFAULT_SHAPE,
  areaFill: AREA_DEFAULT_FILL,
  sketchWidth: RENDER_DEFAULTS.sketchWidth,
  statusColor: { ...STATUS_COLOR },
  statusOpacity: { ...STATUS_OPACITY },
};

/**
 * 개별 스타일을 부분 갱신한다. 키가 하나도 남지 않으면 **null 로 되돌려** 전역 상속에 복귀시킨다.
 *
 * ⚠️ 위치·크기는 절대 여기 들어오지 않는다. 그건 `geometry` 다 (§2-1-c, 함정 #5).
 * 라벨을 옮겼다는 이유로 `style` 이 null → 객체가 되면, 정리한 결함이 전부
 * 전역 스타일 상속에서 이탈한다.
 */
export function patchStyle(
  cur: StyleOverride | null,
  patch: Partial<StyleOverride>,
): StyleOverride | null {
  const next: StyleOverride = { ...(cur ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null) delete (next as Record<string, unknown>)[k];
    else (next as Record<string, unknown>)[k] = v;
  }
  return Object.keys(next).length === 0 ? null : next;
}

/**
 * 부수효과 없는 순수 함수. 캔버스는 이것을 **읽기만** 한다.
 * 개별 style 이 지정한 값이 우선이고, 없으면 status 기본값 → 전역값 순.
 */
export function resolveStyle(defect: Defect, global: GlobalStyle): ResolvedStyle {
  const s = defect.style;
  const balloonRadius = s?.balloonRadius ?? global.balloonRadius;
  const fontSize = balloonRadius * global.fontFactor;
  return {
    color: s?.color ?? global.statusColor[defect.status],
    opacity: s?.opacity ?? global.statusOpacity[defect.status],
    markRadius: s?.markRadius ?? global.markRadius,
    markStroke: s?.markStroke ?? global.markStroke,
    balloonRadius,
    balloonStroke: s?.balloonStroke ?? global.balloonStroke,
    leaderWidth: s?.leaderWidth ?? global.leaderWidth,
    fontSize,
    haloWidth: fontSize * global.haloFactor,
    arrowHead: s?.arrowHead ?? global.arrowHead,
    areaShape: s?.areaShape ?? global.areaShape,
    areaFill: s?.areaFill ?? global.areaFill,
    sketchWidth: s?.sketchWidth ?? global.sketchWidth,
  };
}
