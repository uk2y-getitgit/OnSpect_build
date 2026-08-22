/**
 * 기하 — 스펙 §2-2.
 *
 * ⚠️ 각도·거리·정렬 판정은 **전부 스크린(S) 좌표에서** 한다.
 * 정규화(N) 공간은 도면 종횡비만큼 눌려 있어서, 4000×2000 도면이면
 * N 공간의 45도가 화면에서 63.4도가 된다. (§2-2-a, 함정 #2)
 */
import { NORM_PRECISION } from './constants.js';
import type { NPoint, SPoint, Viewport } from './types.js';

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

export function sub(a: SPoint, b: SPoint): SPoint {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function add(a: SPoint, b: SPoint): SPoint {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function scale(a: SPoint, k: number): SPoint {
  return { x: a.x * k, y: a.y * k };
}

export function len(a: SPoint): number {
  return Math.hypot(a.x, a.y);
}

export function dist(a: SPoint, b: SPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 길이 1로 정규화. 영벡터면 (0,0) */
export function unit(a: SPoint): SPoint {
  const l = len(a);
  return l === 0 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

// ── 좌표 변환 (§2-2) ───────────────────────────────────────────────────────
export function toScreen(n: NPoint, vp: Viewport, iw: number, ih: number): SPoint {
  return { x: n.x * iw * vp.zoom + vp.tx, y: n.y * ih * vp.zoom + vp.ty };
}

export function toNorm(s: SPoint, vp: Viewport, iw: number, ih: number): NPoint {
  return { x: (s.x - vp.tx) / vp.zoom / iw, y: (s.y - vp.ty) / vp.zoom / ih };
}

/** 이미지 px 길이 → 스크린 px 길이. zoom 이 등방이므로 스칼라 곱 하나면 된다 */
export function imgToScreenLen(v: number, vp: Viewport): number {
  return v * vp.zoom;
}

// ── 각도 ───────────────────────────────────────────────────────────────────
export const DEG = 180 / Math.PI;

export function degrees(rad: number): number {
  return rad * DEG;
}

export function radians(deg: number): number {
  return deg / DEG;
}

/** from → to 벡터의 각도(도). 스크린 좌표계이므로 y는 아래로 증가 */
export function angleDeg(from: SPoint, to: SPoint): number {
  return degrees(Math.atan2(to.y - from.y, to.x - from.x));
}

/** 0~180 으로 정규화된 최소 각차 */
export function angularDistance(a: number, b: number): number {
  return Math.abs((((a - b) % 360) + 540) % 360 - 180);
}

// ── 선분-점 거리 (리더선 히트) ─────────────────────────────────────────────
export function distPointSegment(p: SPoint, a: SPoint, b: SPoint): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const l2 = abx * abx + aby * aby;
  if (l2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2;
  t = clamp(t, 0, 1);
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}

// ── 저장 정밀도 (§2-2-b) ───────────────────────────────────────────────────
export function roundTo(v: number, digits: number): number {
  const f = 10 ** digits;
  // Number.EPSILON 보정 없이 단순 반올림. 6자리에서 부동소수 잡음은 무의미하다
  return Math.round(v * f) / f;
}

/** 정규화 좌표를 저장 정밀도(소수 6자리)로 맞춘다 */
export function roundNorm(p: NPoint): NPoint {
  return { x: roundTo(p.x, NORM_PRECISION), y: roundTo(p.y, NORM_PRECISION) };
}

/** 두 정규화 좌표가 저장 정밀도에서 같은가 */
export function normEquals(a: NPoint, b: NPoint): boolean {
  const r = 10 ** -NORM_PRECISION / 2;
  return Math.abs(a.x - b.x) < r && Math.abs(a.y - b.y) < r;
}

/**
 * Shift 축 고정 — 드래그 시작점 기준으로 Δ가 큰 축만 살린다 (§2-5).
 * 스크린 좌표에서 판정한다.
 */
export function lockAxis(raw: SPoint, startCenter: SPoint): SPoint {
  const dx = Math.abs(raw.x - startCenter.x);
  const dy = Math.abs(raw.y - startCenter.y);
  return dx >= dy ? { x: raw.x, y: startCenter.y } : { x: startCenter.x, y: raw.y };
}

/** 사각형 교차 판정 (뷰 컬링용) */
export function rectsIntersect(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;
}
