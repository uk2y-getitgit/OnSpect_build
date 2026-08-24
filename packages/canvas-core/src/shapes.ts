/**
 * 도형 기하 — 방향(화살표) · 영역(사각/타원) · 자유그리기.
 *
 * ⚠️ **모든 판정은 스크린(S) px 에서 한다** (§2-2-a, 함정 #2).
 * 정규화(N) 공간은 도면 종횡비만큼 눌려 있어서, 4000×2000 도면이면 N 공간의 45도가
 * 화면에서 63.4도가 된다. 거리·각도·해치 간격을 N 에서 재면 전부 틀린다.
 *
 * 이 파일은 순수 함수만 담는다. 상태·시간·난수를 모른다.
 */
import { AREA_HANDLES, type Handle, type MarkGeometry, type NPoint, type SPoint } from './types.js';
import { clamp, dist, distPointSegment, sub, unit } from './geometry.js';

// ── 사각형 ─────────────────────────────────────────────────────────────────
export type SRect = { x: number; y: number; w: number; h: number };

/** 폭·높이를 음수 없이 정규화한다. 대각 드래그는 어느 방향으로도 갈 수 있다 */
export function normalizeRect(x0: number, y0: number, x1: number, y1: number): SRect {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0),
    h: Math.abs(y1 - y0),
  };
}

/** Shift 정사각/정원 — 더 긴 축에 맞춘다. 시작점(고정 모서리) 기준 */
export function squareTo(start: SPoint, end: SPoint): SPoint {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const s = Math.max(Math.abs(dx), Math.abs(dy));
  return {
    x: start.x + (dx < 0 ? -s : s),
    y: start.y + (dy < 0 ? -s : s),
  };
}

export function rectCenter(r: SRect): SPoint {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/**
 * 영역(사각/타원) 중심에서 `target` 방향으로 뻗은 반직선이 **테두리와 만나는 점**.
 * 지시선은 영역 중앙이 아니라 이 점에 붙는다(§2-7-b 개정, 2026-08-24) — 중앙에 붙으면
 * 큰 영역일수록 선이 도형 속을 가로질러 어색해 보인다는 사용자 지적.
 *
 * **스크린 px 에서 계산한다** — 정규화 공간은 도면 종횡비만큼 눌려 있어 방향이 틀어진다(함정 #2).
 * `target` 이 중심과 겹치면(드문 경우) 방향이 없으므로 중심을 그대로 돌려준다.
 */
export function areaBoundaryPoint(
  r: SRect,
  kind: 'AREA_RECT' | 'AREA_ELLIPSE',
  target: SPoint,
): SPoint {
  const c = rectCenter(r);
  const d = sub(target, c);
  if (d.x === 0 && d.y === 0) return c;
  const halfW = r.w / 2;
  const halfH = r.h / 2;
  if (kind === 'AREA_RECT') {
    // 중심에서 각 변까지의 "그 방향" 거리 중 더 가까운(먼저 만나는) 쪽이 실제 교차점이다
    const tx = d.x !== 0 ? halfW / Math.abs(d.x) : Infinity;
    const ty = d.y !== 0 ? halfH / Math.abs(d.y) : Infinity;
    const t = Math.min(tx, ty);
    return { x: c.x + d.x * t, y: c.y + d.y * t };
  }
  // AREA_ELLIPSE — 반직선과 타원의 교차점 (표준 매개식: 반지름(u) = ab / √(b²ux² + a²uy²))
  const u = unit(d);
  const a = halfW;
  const b = halfH;
  const denom = Math.sqrt(b * b * u.x * u.x + a * a * u.y * u.y);
  if (denom === 0) return c;
  const t = (a * b) / denom;
  return { x: c.x + u.x * t, y: c.y + u.y * t };
}

/** 8방향 핸들의 좌표. 순서는 `AREA_HANDLES` 와 같다 */
export function handlePoints(r: SRect): { handle: Handle; at: SPoint }[] {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const x2 = r.x + r.w;
  const y2 = r.y + r.h;
  const map: Record<string, SPoint> = {
    NW: { x: r.x, y: r.y },
    N: { x: cx, y: r.y },
    NE: { x: x2, y: r.y },
    E: { x: x2, y: cy },
    SE: { x: x2, y: y2 },
    S: { x: cx, y: y2 },
    SW: { x: r.x, y: y2 },
    W: { x: r.x, y: cy },
  };
  return AREA_HANDLES.map((h) => ({ handle: h, at: map[h]! }));
}

/** 핸들을 끌었을 때의 새 사각형. 뒤집혀도 `normalizeRect` 가 바로잡는다 */
export function resizeRect(r: SRect, handle: Handle, to: SPoint): SRect {
  let x0 = r.x;
  let y0 = r.y;
  let x1 = r.x + r.w;
  let y1 = r.y + r.h;
  if (handle === 'NW' || handle === 'W' || handle === 'SW') x0 = to.x;
  if (handle === 'NE' || handle === 'E' || handle === 'SE') x1 = to.x;
  if (handle === 'NW' || handle === 'N' || handle === 'NE') y0 = to.y;
  if (handle === 'SW' || handle === 'S' || handle === 'SE') y1 = to.y;
  return normalizeRect(x0, y0, x1, y1);
}

/** 핸들 위에서 보여줄 커서 방향 */
export function handleCursor(h: Handle): 'ns-resize' | 'ew-resize' | 'nwse-resize' | 'nesw-resize' {
  if (h === 'N' || h === 'S') return 'ns-resize';
  if (h === 'E' || h === 'W') return 'ew-resize';
  if (h === 'NW' || h === 'SE') return 'nwse-resize';
  return 'nesw-resize';
}

// ── 히트: 테두리 · 내부 ─────────────────────────────────────────────────────
export function pointInRect(p: SPoint, r: SRect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/** 사각형 **테두리**까지의 거리 (안쪽/바깥쪽 모두 양수) */
export function distToRectBorder(p: SPoint, r: SRect): number {
  const x2 = r.x + r.w;
  const y2 = r.y + r.h;
  return Math.min(
    distPointSegment(p, { x: r.x, y: r.y }, { x: x2, y: r.y }),
    distPointSegment(p, { x: x2, y: r.y }, { x: x2, y: y2 }),
    distPointSegment(p, { x: x2, y: y2 }, { x: r.x, y: y2 }),
    distPointSegment(p, { x: r.x, y: y2 }, { x: r.x, y: r.y }),
  );
}

/** 외접 사각형 기준 타원 안쪽인가 */
export function pointInEllipse(p: SPoint, r: SRect): boolean {
  const rx = r.w / 2;
  const ry = r.h / 2;
  if (rx <= 0 || ry <= 0) return false;
  const c = rectCenter(r);
  const dx = (p.x - c.x) / rx;
  const dy = (p.y - c.y) / ry;
  return dx * dx + dy * dy <= 1;
}

/**
 * 타원 테두리까지의 근사 거리.
 * 정확한 해는 4차 방정식이라, 둘레를 폴리라인으로 근사해 최단 거리를 잰다.
 * 히트 판정에는 이 정확도로 충분하다 (허용 오차 6px).
 */
export function distToEllipseBorder(p: SPoint, r: SRect): number {
  const pts = ellipsePolyline(r, 48);
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const d = distPointSegment(p, a, b);
    if (d < best) best = d;
  }
  return best;
}

export function ellipsePolyline(r: SRect, segments = 64): SPoint[] {
  const rx = r.w / 2;
  const ry = r.h / 2;
  const c = rectCenter(r);
  const out: SPoint[] = [];
  for (let i = 0; i < segments; i += 1) {
    const t = (i / segments) * Math.PI * 2;
    out.push({ x: c.x + rx * Math.cos(t), y: c.y + ry * Math.sin(t) });
  }
  return out;
}

/** 폴리라인(자유그리기)까지의 최단 거리 */
export function distToPolyline(p: SPoint, pts: readonly SPoint[]): number {
  if (pts.length === 0) return Number.POSITIVE_INFINITY;
  if (pts.length === 1) return dist(p, pts[0]!);
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const d = distPointSegment(p, pts[i]!, pts[i + 1]!);
    if (d < best) best = d;
  }
  return best;
}

/** 폴리라인의 bbox. 뷰 컬링 · 이동 클램프에 쓴다 */
export function boundsOf(pts: readonly SPoint[]): SRect | null {
  if (pts.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// ── 화살표 ─────────────────────────────────────────────────────────────────
/**
 * 화살촉 삼각형 3점. `head` 는 스크린 px 길이.
 * 꼬리→머리 방향이 0 길이면 그릴 수 없으므로 null.
 */
export function arrowHeadPolygon(from: SPoint, to: SPoint, head: number): SPoint[] | null {
  const vx = to.x - from.x;
  const vy = to.y - from.y;
  const len = Math.hypot(vx, vy);
  if (len < 0.5) return null;
  // 화살촉이 몸통보다 길면 우스꽝스러워진다. 몸통의 절반으로 제한
  const h = Math.min(head, len * 0.5);
  const u = { x: vx / len, y: vy / len };
  const n = { x: -u.y, y: u.x };
  const base = { x: to.x - u.x * h, y: to.y - u.y * h };
  const half = h * 0.38;
  return [
    to,
    { x: base.x + n.x * half, y: base.y + n.y * half },
    { x: base.x - n.x * half, y: base.y - n.y * half },
  ];
}

/** 화살표 몸통은 화살촉 밑변에서 멈춘다. 겹쳐 그리면 촉이 뭉툭해 보인다 */
export function arrowShaftEnd(from: SPoint, to: SPoint, head: number): SPoint {
  const v = { x: to.x - from.x, y: to.y - from.y };
  const len = Math.hypot(v.x, v.y);
  if (len < 0.5) return to;
  const h = Math.min(head, len * 0.5);
  const u = unit(v);
  return { x: to.x - u.x * h * 0.9, y: to.y - u.y * h * 0.9 };
}

// ── 구름 (revision cloud) ──────────────────────────────────────────────────
/**
 * 닫힌 폴리라인을 따라 바깥쪽으로 부푼 호를 이어 붙인다.
 * `DrawOp` 에 호 프리미티브가 없으므로 폴리라인으로 근사한다 —
 * 어댑터(2D · Skia · PDF)가 전부 폴리라인만 알면 되게 두는 것이 목적이다.
 */
export function cloudPolyline(
  outline: readonly SPoint[],
  arcLen: number,
  bulge: number,
): SPoint[] {
  if (outline.length < 2) return [...outline];
  const step = Math.max(6, arcLen);
  const out: SPoint[] = [];
  const n = outline.length;
  for (let i = 0; i < n; i += 1) {
    const a = outline[i]!;
    const b = outline[(i + 1) % n]!;
    const segLen = dist(a, b);
    if (segLen < 0.01) continue;
    const count = Math.max(1, Math.round(segLen / step));
    for (let j = 0; j < count; j += 1) {
      const t0 = j / count;
      const t1 = (j + 1) / count;
      const p0 = lerpPoint(a, b, t0);
      const p1 = lerpPoint(a, b, t1);
      pushArc(out, p0, p1, bulge);
    }
  }
  return out;
}

function lerpPoint(a: SPoint, b: SPoint, t: number): SPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** p0→p1 을 바깥(법선 +방향)으로 부푼 반원으로 근사해 out 에 밀어 넣는다 */
function pushArc(out: SPoint[], p0: SPoint, p1: SPoint, bulge: number): void {
  const vx = p1.x - p0.x;
  const vy = p1.y - p0.y;
  const len = Math.hypot(vx, vy);
  if (len < 0.01) return;
  // 시계방향 외곽선 기준 바깥 법선
  const nx = vy / len;
  const ny = -vx / len;
  const h = len * bulge;
  const mid = { x: (p0.x + p1.x) / 2 + nx * h, y: (p0.y + p1.y) / 2 + ny * h };
  const STEPS = 5;
  for (let s = 0; s < STEPS; s += 1) {
    const t = s / STEPS;
    // 2차 베지어 — 시작점·바깥 제어점·끝점
    const mt = 1 - t;
    out.push({
      x: mt * mt * p0.x + 2 * mt * t * mid.x + t * t * p1.x,
      y: mt * mt * p0.y + 2 * mt * t * mid.y + t * t * p1.y,
    });
  }
}

export function rectOutline(r: SRect): SPoint[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}

// ── 45° 해치 ───────────────────────────────────────────────────────────────
/**
 * 사각형을 45° 로 가르는 선분들. 클리핑을 해석적으로 하므로
 * `DrawOp` 에 clip 프리미티브가 없어도 된다.
 *
 * 45° 선은 `x + y = c` 꼴이다. c 를 gap*√2 간격으로 훑는다.
 */
export function hatchRect(r: SRect, gap: number): { a: SPoint; b: SPoint }[] {
  const out: { a: SPoint; b: SPoint }[] = [];
  if (r.w <= 1 || r.h <= 1) return out;
  const step = Math.max(3, gap) * Math.SQRT2;
  const x2 = r.x + r.w;
  const y2 = r.y + r.h;
  const cMin = r.x + r.y;
  const cMax = x2 + y2;
  // 선 수 상한 — 아주 큰 영역에서 수천 개를 만들지 않는다
  const limit = 400;
  let n = 0;
  for (let c = Math.ceil(cMin / step) * step; c < cMax && n < limit; c += step, n += 1) {
    // x + y = c 와 사각형의 교점
    const xs = clamp(c - y2, r.x, x2);
    const xe = clamp(c - r.y, r.x, x2);
    if (xe - xs < 0.5) continue;
    out.push({ a: { x: xs, y: c - xs }, b: { x: xe, y: c - xe } });
  }
  return out;
}

/** 타원 해치 — 45° 선을 타원 방정식으로 잘라낸다 */
export function hatchEllipse(r: SRect, gap: number): { a: SPoint; b: SPoint }[] {
  const out: { a: SPoint; b: SPoint }[] = [];
  const rx = r.w / 2;
  const ry = r.h / 2;
  if (rx <= 1 || ry <= 1) return out;
  const c0 = rectCenter(r);
  const step = Math.max(3, gap) * Math.SQRT2;
  // 중심을 원점으로 옮기고, x/rx = u, y/ry = v 로 두면 단위원이 된다.
  // 직선 x + y = k → rx·u + ry·v = k. 단위원과의 교점을 푼다.
  const A = rx;
  const B = ry;
  const norm = Math.hypot(A, B);
  const kMax = norm; // |k| > norm 이면 교점 없음
  const limit = 400;
  let n = 0;
  for (let k = -Math.ceil(kMax / step) * step; k <= kMax && n < limit; k += step, n += 1) {
    if (Math.abs(k) >= kMax) continue;
    // 단위원 위에서 직선 A·u + B·v = k 의 두 교점
    const d = k / norm; // 원점~직선 거리
    const half = Math.sqrt(Math.max(0, 1 - d * d));
    const ux = (A / norm) * d;
    const uy = (B / norm) * d;
    // 직선 방향 벡터 (단위원 좌표계)
    const dx = -B / norm;
    const dy = A / norm;
    const p1 = { u: ux + dx * half, v: uy + dy * half };
    const p2 = { u: ux - dx * half, v: uy - dy * half };
    const a = { x: c0.x + p1.u * rx, y: c0.y + p1.v * ry };
    const b = { x: c0.x + p2.u * rx, y: c0.y + p2.v * ry };
    if (dist(a, b) < 1) continue;
    out.push({ a, b });
  }
  return out;
}

// ── 정규화 기하 헬퍼 (문서 갱신용) ────────────────────────────────────────
/** 기하 전체를 델타만큼 옮긴다. **정규화 공간에서의 평행이동은 종횡비와 무관하다** */
export function translateGeometry(g: MarkGeometry, dx: number, dy: number): MarkGeometry {
  switch (g.k) {
    case 'POINT':
      return { k: 'POINT', x: g.x + dx, y: g.y + dy };
    case 'ARROW':
      // 꺾은선 — 점 전체를 옮긴다. 방향(각 구간의 각도)은 상대 위치라 자연히 유지된다
      return { k: 'ARROW', points: g.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    case 'AREA_RECT':
    case 'AREA_ELLIPSE':
      return { ...g, x: g.x + dx, y: g.y + dy };
    default:
      return g;
  }
}

/** 기하의 정규화 bbox */
export function geometryBounds(g: MarkGeometry): { x: number; y: number; w: number; h: number } {
  switch (g.k) {
    case 'POINT':
      return { x: g.x, y: g.y, w: 0, h: 0 };
    case 'ARROW': {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of g.points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    case 'AREA_RECT':
    case 'AREA_ELLIPSE':
      return { x: g.x, y: g.y, w: g.w, h: g.h };
    default:
      return { x: 0, y: 0, w: 0, h: 0 };
  }
}

/**
 * 도면 밖으로 나가지 않게 **평행이동만으로** 밀어 넣는다 (불변식 #1 — 마크는 [0,1]).
 * 크기를 줄이지 않는다. 줄이면 사용자가 만든 형상이 조용히 바뀐다.
 */
export function clampGeometryInside(g: MarkGeometry): MarkGeometry {
  const b = geometryBounds(g);
  let dx = 0;
  let dy = 0;
  if (b.x < 0) dx = -b.x;
  else if (b.x + b.w > 1) dx = 1 - (b.x + b.w);
  if (b.y < 0) dy = -b.y;
  else if (b.y + b.h > 1) dy = 1 - (b.y + b.h);
  return dx === 0 && dy === 0 ? g : translateGeometry(g, dx, dy);
}

/** 자유그리기 한 획을 델타만큼 옮기되, bbox 가 도면 안에 남게 한다 */
export function translatePathInside(pts: readonly NPoint[], dx: number, dy: number): NPoint[] {
  const moved = pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of moved) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  let ax = 0;
  let ay = 0;
  if (minX < 0) ax = -minX;
  else if (maxX > 1) ax = 1 - maxX;
  if (minY < 0) ay = -minY;
  else if (maxY > 1) ay = 1 - maxY;
  return ax === 0 && ay === 0 ? moved : moved.map((p) => ({ x: p.x + ax, y: p.y + ay }));
}
