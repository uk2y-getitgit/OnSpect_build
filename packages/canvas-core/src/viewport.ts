/**
 * 뷰포트 — Fit · 커서 기준 줌 · 팬 클램프. 스펙 §2-5 "줌·팬 한계".
 *
 * 이징·관성은 넣지 않는다. 0ms 즉시 반영이다 (ui-quality §6).
 */
import { FIT_MARGIN, PAN_KEEP_VISIBLE, ZOOM_MAX, ZOOM_MIN_FACTOR } from './constants.js';
import { clamp } from './geometry.js';
import type { Size, SPoint, Viewport } from './types.js';

export function fitZoomOf(iw: number, ih: number, canvas: Size, margin = FIT_MARGIN): number {
  if (iw <= 0 || ih <= 0 || canvas.w <= 0 || canvas.h <= 0) return 1;
  const usable = 1 - margin * 2;
  return Math.min((canvas.w * usable) / iw, (canvas.h * usable) / ih);
}

/** 도면 전체를 화면 중앙에 맞춘다 */
export function fitViewport(iw: number, ih: number, canvas: Size, margin = FIT_MARGIN): Viewport {
  const zoom = fitZoomOf(iw, ih, canvas, margin);
  return {
    zoom,
    tx: (canvas.w - iw * zoom) / 2,
    ty: (canvas.h - ih * zoom) / 2,
  };
}

export function zoomLimits(iw: number, ih: number, canvas: Size): { min: number; max: number } {
  const fz = fitZoomOf(iw, ih, canvas);
  return { min: fz * ZOOM_MIN_FACTOR, max: ZOOM_MAX };
}

/**
 * 커서 아래 지점을 고정한 채 줌한다.
 * 줌 후에도 `toNorm(cursor)` 가 불변이어야 한다 — T1 완료 조건.
 */
export function zoomAt(
  vp: Viewport,
  cursor: SPoint,
  factor: number,
  min: number,
  max: number,
): Viewport {
  const zoom = clamp(vp.zoom * factor, min, max);
  if (zoom === vp.zoom) return vp;
  const k = zoom / vp.zoom;
  return {
    zoom,
    tx: cursor.x - (cursor.x - vp.tx) * k,
    ty: cursor.y - (cursor.y - vp.ty) * k,
  };
}

/** 뷰포트 중심 기준 줌 (`+` / `-` 키, 줌 버튼) */
export function zoomAtCenter(
  vp: Viewport,
  canvas: Size,
  factor: number,
  min: number,
  max: number,
): Viewport {
  return zoomAt(vp, { x: canvas.w / 2, y: canvas.h / 2 }, factor, min, max);
}

/**
 * 팬 한계 — 도면 bbox 의 최소 PAN_KEEP_VISIBLE 비율이 항상 뷰포트 안에 남는다.
 * 도면을 화면 밖으로 완전히 밀어낼 수 없다.
 */
export function clampPan(vp: Viewport, iw: number, ih: number, canvas: Size): Viewport {
  const dw = iw * vp.zoom;
  const dh = ih * vp.zoom;
  return {
    zoom: vp.zoom,
    tx: clampAxis(vp.tx, dw, canvas.w),
    ty: clampAxis(vp.ty, dh, canvas.h),
  };
}

function clampAxis(t: number, drawingLen: number, canvasLen: number): number {
  if (drawingLen <= 0 || canvasLen <= 0) return t;
  const need = Math.min(PAN_KEEP_VISIBLE * drawingLen, canvasLen);
  const lo = need - drawingLen; // 도면 오른쪽 끝이 화면 왼쪽에 need 만큼 걸린 상태
  const hi = canvasLen - need; // 도면 왼쪽 끝이 화면 오른쪽에 need 만큼 걸린 상태
  if (lo > hi) return (canvasLen - drawingLen) / 2; // 이론상 불가하지만 방어적으로 중앙
  return clamp(t, lo, hi);
}

/** 특정 정규화 좌표가 화면 중앙에 오도록 팬한다 (리스트 → 캔버스 연동, T13) */
export function centerOn(
  vp: Viewport,
  n: { x: number; y: number },
  iw: number,
  ih: number,
  canvas: Size,
): Viewport {
  return clampPan(
    {
      zoom: vp.zoom,
      tx: canvas.w / 2 - n.x * iw * vp.zoom,
      ty: canvas.h / 2 - n.y * ih * vp.zoom,
    },
    iw,
    ih,
    canvas,
  );
}
