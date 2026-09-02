/**
 * 뷰포트 — Fit · 커서 기준 줌 · 팬 클램프. 스펙 §2-5 "줌·팬 한계".
 *
 * 이징·관성은 넣지 않는다. 0ms 즉시 반영이다 (ui-quality §6).
 */
import { FIT_MARGIN, PAN_KEEP_VISIBLE, ZOOM_MAX, ZOOM_MIN_FACTOR } from './constants.js';
import { clamp, toNorm } from './geometry.js';
import type { InputEvent, Size, SPoint, Viewport } from './types.js';

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

// ── 마지막 뷰포트 영속 (Phase 5 T2-5) ──────────────────────────────────────
/**
 * **저장용 뷰 상태** — 화면 중앙이 가리키는 정규화 좌표 + 배율.
 *
 * `Viewport` 를 그대로(`tx`·`ty`) 저장하지 않는다. 그 둘은 **그때의 캔버스 크기에 묶인
 * 스크린 px** 이라, 태블릿을 돌리거나 창 크기를 바꾼 뒤 다시 열면 엉뚱한 자리가 나온다.
 * 화면 중앙의 정규화 좌표는 캔버스 크기와 무관하다 — 도면 좌표를 0~1 로 저장하는
 * 불변식 #1 과 같은 이유다.
 *
 * ⚠️ `cx`·`cy` 는 0~1 을 **벗어날 수 있다.** 도면보다 화면이 크면(전체 맞춤보다 더 축소하면)
 *    화면 중앙이 도면 밖이다. 여기서 자르면 저장 → 복원이 조용히 위치를 바꾼다.
 *    한계는 복원 때 `centerOn` → `clampPan` 이 잡는다.
 */
export type ViewCenter = { zoom: number; cx: number; cy: number };

/**
 * 지금 뷰포트를 저장 형태로 바꾼다. 저장할 수 없으면 `null`
 * (도면·캔버스 크기가 아직 0 이거나 값이 성하지 않을 때).
 *
 * NaN 방어는 핀치(`GESTURE_PINCH`)와 같은 이유다 — 성하지 않은 값이 한 번 저장되면
 * 다음에 그 용역을 열 때마다 되살아난다.
 */
export function viewCenterOf(
  vp: Viewport,
  iw: number,
  ih: number,
  canvas: Size,
): ViewCenter | null {
  if (iw <= 0 || ih <= 0 || canvas.w <= 0 || canvas.h <= 0) return null;
  if (!Number.isFinite(vp.zoom) || vp.zoom <= 0) return null;
  if (!Number.isFinite(vp.tx) || !Number.isFinite(vp.ty)) return null;
  const n = toNorm({ x: canvas.w / 2, y: canvas.h / 2 }, vp, iw, ih);
  if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) return null;
  return { zoom: vp.zoom, cx: n.x, cy: n.y };
}

/**
 * 저장해 둔 뷰를 되돌리는 **입력 이벤트 2개**.
 *
 * 뷰포트를 통째로 밀어 넣는 새 이벤트를 만들지 않는다 — 기존 두 이벤트의 합성이면
 * 배율 한계(`zoomLimits`)와 팬 한계(`clampPan`)를 **코어가 이미 하던 그대로** 태울 수 있다:
 *   ① `ZOOM_BUTTON` — 화면 중앙을 고정한 채 저장 배율로 (한계를 넘으면 잘린다)
 *   ② `CENTER_ON_NORM` — 저장된 지점을 화면 중앙으로 (배율은 안 건드린다)
 * 순서가 중요하다. 배율을 먼저 맞춰야 중앙 정렬이 최종 배율 기준으로 계산된다.
 *
 * `currentZoom` 이 성하지 않으면 빈 배열이다 — 아무 일도 일어나지 않는다.
 */
export function restoreViewEvents(v: ViewCenter, currentZoom: number): InputEvent[] {
  if (!Number.isFinite(v.zoom) || v.zoom <= 0) return [];
  if (!Number.isFinite(v.cx) || !Number.isFinite(v.cy)) return [];
  if (!Number.isFinite(currentZoom) || currentZoom <= 0) return [];
  const out: InputEvent[] = [];
  const factor = v.zoom / currentZoom;
  if (factor !== 1) out.push({ k: 'ZOOM_BUTTON', factor });
  out.push({ k: 'CENTER_ON_NORM', n: { x: v.cx, y: v.cy } });
  return out;
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
