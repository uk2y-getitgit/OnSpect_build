/**
 * 두 스냅의 병합 — 스펙 §2-8. **이번 범위에서 가장 사고가 나기 쉬운 지점이다.**
 *
 * 핵심 관찰: 각도 스냅이 4방향이면 각도 스냅은 **한 축만 고정한다.**
 *   90/270 → x 고정, y 자유    |    0/180 → y 고정, x 자유
 * 자유로운 축에는 정렬 스냅을 그대로 적용해도 모순이 없다.
 * → 리더선이 정확히 수직이면서 동시에 번호가 옆 번호와 가로 줄이 맞는다.
 *
 * ⚠️ §2-8-c: **적용되지 않은 스냅의 가이드선은 절대 그리지 않는다.**
 * 선은 보이는데 라벨이 그 선에 붙어 있지 않으면 사용자는 "정렬이 고장났다"고 인식한다.
 */
import {
  GUIDE_COLLINEAR_TOL_PX,
  GUIDE_OVERSHOOT_PX,
  SNAP_PRIORITY,
  type SnapPriority,
} from './constants.js';
import type { AlignHit, AlignSnapshot, AngleHit, Guide, SPoint } from './types.js';

export type ResolveResult = { pos: SPoint; guides: Guide[] };

export function resolveSnaps(
  raw: SPoint,
  ax: AlignHit | null,
  ay: AlignHit | null,
  ang: AngleHit | null,
  snapshot: AlignSnapshot | null,
  anchorS: SPoint | null,
  priority: SnapPriority = SNAP_PRIORITY,
): ResolveResult {
  if (ang === null) {
    const pos = { x: ax ? ax.v : raw.x, y: ay ? ay.v : raw.y };
    return { pos, guides: alignGuidesOf(ax, ay, pos, snapshot) };
  }

  const lock: 'X' | 'Y' | 'BOTH' =
    ang.angle === 90 || ang.angle === 270
      ? 'X'
      : ang.angle === 0 || ang.angle === 180
        ? 'Y'
        : 'BOTH';

  if (priority === 'ALIGN_FIRST') {
    const conflict =
      (lock === 'BOTH' && (ax !== null || ay !== null)) ||
      (lock === 'X' && ax !== null) ||
      (lock === 'Y' && ay !== null);
    if (conflict) {
      // 각도를 유지할 수 없다 → 각도 스냅을 통째로 버린다
      const pos = { x: ax ? ax.v : raw.x, y: ay ? ay.v : raw.y };
      return { pos, guides: alignGuidesOf(ax, ay, pos, snapshot) };
    }
  }

  if (lock === 'BOTH') {
    // 45도 계열: x·y 가 함께 묶이므로 정렬 스냅을 무시한다
    return { pos: ang.point, guides: [angleGuide(ang, anchorS)] };
  }

  const pos: SPoint = {
    x: lock === 'X' ? ang.point.x : ax ? ax.v : raw.x,
    y: lock === 'Y' ? ang.point.y : ay ? ay.v : raw.y,
  };

  // 고정된 축의 정렬 스냅은 무시하고 **가이드선도 그리지 않는다** (§2-8-c)
  const freeAlign = lock === 'X' ? ay : ax;
  const guides: Guide[] = [angleGuide(ang, anchorS)];
  if (freeAlign) {
    const g = lock === 'X'
      ? alignGuideY(freeAlign, pos, snapshot)
      : alignGuideX(freeAlign, pos, snapshot);
    if (g) guides.push(g);
  }
  return { pos, guides };
}

function alignGuidesOf(
  ax: AlignHit | null,
  ay: AlignHit | null,
  pos: SPoint,
  snapshot: AlignSnapshot | null,
): Guide[] {
  const out: Guide[] = [];
  if (ax) {
    const g = alignGuideX(ax, pos, snapshot);
    if (g) out.push(g);
  }
  if (ay) {
    const g = alignGuideY(ay, pos, snapshot);
    if (g) out.push(g);
  }
  return out;
}

/**
 * 세로 가이드선 (x 스냅).
 * 그 x 좌표를 공유하는 **모든 라벨**과 드래그 중인 라벨을 모아 최소~최대 y 범위를 잡고
 * 양끝을 GUIDE_OVERSHOOT_PX 만큼 뻗는다. → "이 3개가 지금 한 줄에 있다" 가 눈에 보인다.
 */
export function alignGuideX(
  hit: AlignHit,
  pos: SPoint,
  snapshot: AlignSnapshot | null,
): Guide | null {
  const ids: string[] = [];
  let lo = pos.y;
  let hi = pos.y;
  if (snapshot) {
    for (const [id, p] of Object.entries(snapshot.byId)) {
      if (Math.abs(p.x - hit.v) <= GUIDE_COLLINEAR_TOL_PX) {
        ids.push(id);
        lo = Math.min(lo, p.y);
        hi = Math.max(hi, p.y);
      }
    }
  }
  ids.sort();
  return {
    k: 'ALIGN_X',
    x: hit.v,
    y1: lo - GUIDE_OVERSHOOT_PX,
    y2: hi + GUIDE_OVERSHOOT_PX,
    ids,
  };
}

export function alignGuideY(
  hit: AlignHit,
  pos: SPoint,
  snapshot: AlignSnapshot | null,
): Guide | null {
  const ids: string[] = [];
  let lo = pos.x;
  let hi = pos.x;
  if (snapshot) {
    for (const [id, p] of Object.entries(snapshot.byId)) {
      if (Math.abs(p.y - hit.v) <= GUIDE_COLLINEAR_TOL_PX) {
        ids.push(id);
        lo = Math.min(lo, p.x);
        hi = Math.max(hi, p.x);
      }
    }
  }
  ids.sort();
  return {
    k: 'ALIGN_Y',
    y: hit.v,
    x1: lo - GUIDE_OVERSHOOT_PX,
    x2: hi + GUIDE_OVERSHOOT_PX,
    ids,
  };
}

/** 각도 스냅 표시 — 앵커 반대쪽으로 연장선을 뻗어 어느 축에 걸렸는지 보여준다 (§2-7-d) */
export function angleGuide(ang: AngleHit, anchorS: SPoint | null): Guide {
  const anchor = anchorS ?? { x: ang.point.x, y: ang.point.y };
  const dx = ang.point.x - anchor.x;
  const dy = ang.point.y - anchor.y;
  const l = Math.hypot(dx, dy) || 1;
  return {
    k: 'ANGLE',
    anchor,
    end: {
      x: ang.point.x + (dx / l) * GUIDE_OVERSHOOT_PX,
      y: ang.point.y + (dy / l) * GUIDE_OVERSHOOT_PX,
    },
    angle: ang.angle,
  };
}
