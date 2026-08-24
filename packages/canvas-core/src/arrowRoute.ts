/**
 * 방향(화살표) 드래그 — S2a-2 3차 재개정(2026-08-24).
 *
 * "마우스가 실제로 지나간 방향대로" 꺾은선을 기록한다 — 번호 위치에서 거꾸로 계산한
 * 경로가 아니다. 첫 구간은 45도(8방향), 그 뒤로 구간이 새로 열릴 때마다 **직전 구간
 * 기준 ±90도**로만 꺾인다. 최대 `ARROW_MAX_LEGS`(=3구간, 꺾임 2번)까지다.
 *
 * ⚠️ 스크린 px 에서 계산한다(§2-2-a, 함정 #2) — 정규화 공간은 도면 종횡비만큼
 * 눌려 있어서 45/90도가 화면에서 그 각도로 보이지 않는다.
 */
import { ARROW_BEND_THRESHOLD_PX, ARROW_MAX_LEGS, CLICK_SLOP_PX } from './constants.js';
import { angleDeg, dist, radians } from './geometry.js';
import { nearestAngle, SET_8 } from './snapAngle.js';
import type { SPoint } from './types.js';

function unitOf(deg: number): SPoint {
  const a = radians(deg);
  return { x: Math.cos(a), y: Math.sin(a) };
}

function normAngle360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** origin 에서 각도 `deg` 방향의 반직선 위에, `cur` 를 그 축으로 투영한 점 */
function projectAlong(origin: SPoint, deg: number, cur: SPoint): SPoint {
  const u = unitOf(deg);
  const dx = cur.x - origin.x;
  const dy = cur.y - origin.y;
  const along = dx * u.x + dy * u.y;
  return { x: origin.x + u.x * along, y: origin.y + u.y * along };
}

/**
 * 드래그 한 번 안에서 매 마우스 이동마다 다음 미리보기를 계산한다.
 *
 * @param points 지금까지의 점들(스크린). `points[0]` = 화살촉(누른 지점, 고정).
 *   길이 1 = 아직 방향 미확정. 그 뒤로는 마지막 점이 "지금 마우스를 따라 늘어나는 열린 구간"이다
 * @param angles `points.length - 1` 개, 각 구간의 고정 각도(도). 마지막 값이 열린 구간의 각도
 * @param cur 지금 마우스 위치(스크린)
 */
export function advanceArrowDrag(
  points: readonly SPoint[],
  angles: readonly number[],
  cur: SPoint,
): { points: SPoint[]; angles: number[] } {
  const origin = points[0]!;

  // 아직 방향이 안 잡혔다 — 최소 이동량을 넘겨야 45도(8방향)로 잠근다
  if (angles.length === 0) {
    if (dist(origin, cur) < CLICK_SLOP_PX) return { points: [origin], angles: [] };
    const a = nearestAngle(angleDeg(origin, cur), SET_8);
    return { points: [origin, projectAlong(origin, a, cur)], angles: [a] };
  }

  const openStart = points[points.length - 2]!;
  const openAngle = angles[angles.length - 1]!;
  const u = unitOf(openAngle);
  const dx = cur.x - openStart.x;
  const dy = cur.y - openStart.y;
  const along = dx * u.x + dy * u.y;
  const perp = dx * -u.y + dy * u.x; // u 를 90도 돌린 축 성분

  // 아직 옆으로 안 벗어났거나, 이미 최대 구간 수에 도달 — 지금 구간만 늘인다(방향은 그대로)
  if (Math.abs(perp) < ARROW_BEND_THRESHOLD_PX || angles.length >= ARROW_MAX_LEGS) {
    const live = { x: openStart.x + u.x * along, y: openStart.y + u.y * along };
    return { points: [...points.slice(0, -1), live], angles: [...angles] };
  }

  // 옆으로 벗어났다 — 지금까지 온 만큼(along)에서 구간을 확정하고, 벗어난 쪽으로 새 구간을 연다.
  // 새 구간은 **직전 구간 기준 ±90도** 둘 중 하나로만 스냅한다(자유각 없음)
  const bend = { x: openStart.x + u.x * along, y: openStart.y + u.y * along };
  const candidates = [normAngle360(openAngle + 90), normAngle360(openAngle - 90)];
  const nextAngle = nearestAngle(angleDeg(bend, cur), candidates);
  const live = projectAlong(bend, nextAngle, cur);
  return { points: [...points.slice(0, -1), bend, live], angles: [...angles, nextAngle] };
}
