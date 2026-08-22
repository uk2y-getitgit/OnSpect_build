/**
 * 선택 대상 가시성 — S1 스펙 §2-10. **알려진 버그 1건의 근본 원인이자 해결책이다.**
 *
 *   빠져 있던 규칙: **"선택한 대상은 항상 화면 안에 있어야 한다."**
 *
 * 재현: 1120px 창에서 좌측 리스트로 결함을 선택하면 번호 풍선이 우측 패널 뒤로 완전히 숨는다.
 * 정확한 가림 주체(그리드 컬럼이냐 떠 있는 툴 팔레트냐)는 **중요하지 않다.**
 * 어느 쪽이든 원인은 하나다 —
 * **캔버스가 "쓸 수 있는 영역" 이 아니라 "요소 전체 크기" 를 기준으로 뷰포트를 잡는다.**
 *
 * 그래서 안전 영역(safe rect) 개념을 넣고, 그 안에 들어오도록 뷰포트를 **최소한만** 민다.
 */
import { REVEAL_PAD_PX, ZOOM_MIN_FACTOR } from './constants.js';
import { buildScreens } from './renderModel.js';
import type { CanvasState, Defect, GlobalStyle, SafeInsets, Viewport } from './types.js';
import { clampPan, fitZoomOf } from './viewport.js';

export const NO_INSETS: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

type Rect = { x: number; y: number; w: number; h: number };

/** 안전 영역 — 떠 있는 UI 가 잡아먹는 가장자리를 뺀 나머지 */
export function safeRectOf(state: CanvasState): Rect {
  const i = state.safeInsets ?? NO_INSETS;
  const w = Math.max(1, state.canvas.w - i.left - i.right);
  const h = Math.max(1, state.canvas.h - i.top - i.bottom);
  return { x: i.left, y: i.top, w, h };
}

/**
 * 선택 결함의 마크 전부 + 라벨(풍선 반지름 포함)을 감싸는 스크린 bbox 를
 * `REVEAL_PAD_PX` 만큼 팽창한 사각형.
 */
export function targetRectOf(
  state: CanvasState,
  defects: readonly Defect[],
  globalStyle: GlobalStyle,
  defectId: string,
): Rect | null {
  if (!state.drawing) return null;
  const screens = buildScreens({
    drawing: state.drawing,
    viewport: state.viewport,
    defects,
    globalStyle,
    preview: null,
  });
  const s = screens.find((x) => x.defectId === defectId);
  if (!s) return null;

  let minX = s.label.x - s.balloonR;
  let maxX = s.label.x + s.balloonR;
  let minY = s.label.y - s.balloonR;
  let maxY = s.label.y + s.balloonR;
  for (const m of s.marks) {
    minX = Math.min(minX, m.center.x - s.markR);
    maxX = Math.max(maxX, m.center.x + s.markR);
    minY = Math.min(minY, m.center.y - s.markR);
    maxY = Math.max(maxY, m.center.y + s.markR);
  }
  return {
    x: minX - REVEAL_PAD_PX,
    y: minY - REVEAL_PAD_PX,
    w: maxX - minX + REVEAL_PAD_PX * 2,
    h: maxY - minY + REVEAL_PAD_PX * 2,
  };
}

/**
 * 이미 안전 영역 안이면 `null`. 아니면 옮겨야 할 뷰포트를 돌려준다 (§2-10-b).
 *
 * 1. `targetRect ⊆ safeRect`            → `null` (아무것도 하지 않는다)
 * 2. `targetRect` 가 `safeRect` 보다 크면 → zoom 을 맞을 때까지 낮추고 안전 영역 중앙에 놓는다.
 *                                          단 `fitZoom × ZOOM_MIN_FACTOR` 미만으로는 내리지 않는다
 * 3. 그 외                               → **축마다 필요한 만큼만** tx/ty 를 민다 (최소 이동)
 *
 * ⚠️ 이 보정은 **팬 클램프(`PAN_KEEP_VISIBLE`)보다 우선한다.**
 *    도면 밖으로 끌려나간 라벨(§2-1-a)을 보여주려면 클램프를 넘어야 하기 때문이다.
 */
export function ensureVisible(
  state: CanvasState,
  defects: readonly Defect[],
  globalStyle: GlobalStyle,
  defectId: string,
): Viewport | null {
  if (!state.drawing) return null;
  if (state.canvas.w <= 0 || state.canvas.h <= 0) return null;
  // 드래그 중에는 발동하지 않는다 — 화면이 손을 따라다니면 정밀 조작이 불가능해진다
  if (state.drag !== null) return null;

  const safe = safeRectOf(state);
  const target = targetRectOf(state, defects, globalStyle, defectId);
  if (!target) return null;

  const iw = state.drawing.imageWidth;
  const ih = state.drawing.imageHeight;

  // 2. 대상이 안전 영역보다 크면 줌을 낮춘다
  if (target.w > safe.w || target.h > safe.h) {
    const fitZoom = fitZoomOf(iw, ih, state.canvas);
    const minZoom = fitZoom * ZOOM_MIN_FACTOR;
    const shrink = Math.min(safe.w / target.w, safe.h / target.h);
    const zoom = Math.max(minZoom, state.viewport.zoom * shrink);

    // 대상 중심의 **이미지 좌표**를 구해 새 배율에서 안전 영역 중심에 놓는다
    const ix = (target.x + target.w / 2 - state.viewport.tx) / state.viewport.zoom;
    const iy = (target.y + target.h / 2 - state.viewport.ty) / state.viewport.zoom;
    return {
      zoom,
      tx: safe.x + safe.w / 2 - ix * zoom,
      ty: safe.y + safe.h / 2 - iy * zoom,
    };
  }

  // 3. 축마다 필요한 만큼만 민다
  const dx = shiftFor(target.x, target.w, safe.x, safe.w);
  const dy = shiftFor(target.y, target.h, safe.y, safe.h);
  if (dx === 0 && dy === 0) return null; // 1. 이미 안 → 아무것도 하지 않는다

  return { zoom: state.viewport.zoom, tx: state.viewport.tx + dx, ty: state.viewport.ty + dy };
}

/** 한 축에서 대상을 안전 구간 안으로 넣는 **최소 이동량** */
function shiftFor(t: number, tLen: number, s: number, sLen: number): number {
  if (t < s) return s - t; // 왼쪽/위로 삐져나감 → 오른쪽/아래로 민다
  if (t + tLen > s + sLen) return s + sLen - (t + tLen);
  return 0;
}

/**
 * 가시성 보정을 적용한 상태. 팬 클램프를 넘어야 하는 경우가 있으므로
 * **클램프 결과가 대상을 다시 밖으로 밀어내면 보정값을 그대로 쓴다** (§2-10-b).
 */
export function applyEnsureVisible(
  state: CanvasState,
  defects: readonly Defect[],
  globalStyle: GlobalStyle,
  defectId: string | null,
): CanvasState {
  if (!defectId || !state.drawing) return state;
  const vp = ensureVisible(state, defects, globalStyle, defectId);
  if (!vp) return state;

  const clamped = clampPan(vp, state.drawing.imageWidth, state.drawing.imageHeight, state.canvas);
  // 클램프가 보정을 되돌렸는지 확인한다. 되돌렸다면 이 규칙이 이긴다
  const clampedState: CanvasState = { ...state, viewport: clamped };
  const still = ensureVisible(clampedState, defects, globalStyle, defectId);
  const chosen = still === null ? clamped : vp;

  return {
    ...state,
    viewport: chosen,
    viewports: { ...state.viewports, [state.drawing.id]: chosen },
  };
}
