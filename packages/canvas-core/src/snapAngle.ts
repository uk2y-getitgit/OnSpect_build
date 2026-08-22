/**
 * 리더선 각도 스냅 — 스펙 §2-7.
 *
 * 움직이는 것은 **라벨(번호 풍선)만**이다. 앵커(마크)는 절대 안 움직인다.
 * 마크는 결함의 실제 위치다 — 보기 좋게 하려고 실제 위치를 옮기면 보고서가 틀린다.
 *
 * ⚠️ 각도는 **스크린 좌표**에서 잰다. 정규화 좌표에서 재면 종횡비 때문에
 * 화면상 직교가 아닌 선을 "직교화했다"고 표시하게 된다 (§2-2-a).
 *
 * ⭐ 각도 임계만 쓰면 리더선이 길수록 스냅으로 인한 실제 이동거리가 커진다.
 *    r=400px 에서 5도는 35px 점프 — 라벨이 손에서 튀어나간 느낌이 든다.
 *    각도와 픽셀을 **동시에** 만족할 때만 스냅한다.
 */
import {
  ANGLE_ENTER_DEG,
  ANGLE_MAX_SHIFT_PX,
  ANGLE_RELEASE_DEG,
  ANGLE_SNAP_45,
  LEADER_MIN_PX,
} from './constants.js';
import { angularDistance, degrees, radians } from './geometry.js';
import type { AngleHit, SPoint } from './types.js';

const SET_4 = [0, 90, 180, 270];
const SET_8 = [0, 45, 90, 135, 180, 225, 270, 315];

export function angleSnapSet(with45 = ANGLE_SNAP_45): number[] {
  return with45 ? SET_8 : SET_4;
}

export type AngleSnapOpts = {
  with45?: boolean;
  enterDeg?: number;
  releaseDeg?: number;
  maxShiftPx?: number;
  minLeaderPx?: number;
};

/**
 * @param anchorS 앵커의 스크린 좌표 (움직이지 않는다)
 * @param rawS    라벨 중심의 자유 위치 (스크린)
 * @param held    직전 프레임에 걸려 있던 스냅 (히스테리시스)
 * @param alt     Alt 유지 중이면 스냅 전체 비활성
 */
export function computeAngleSnap(
  anchorS: SPoint,
  rawS: SPoint,
  held: AngleHit | null,
  alt: boolean,
  opts: AngleSnapOpts = {},
): AngleHit | null {
  if (alt) return null;

  const enterDeg = opts.enterDeg ?? ANGLE_ENTER_DEG;
  const releaseDeg = opts.releaseDeg ?? ANGLE_RELEASE_DEG;
  const maxShift = opts.maxShiftPx ?? ANGLE_MAX_SHIFT_PX;
  const minLeader = opts.minLeaderPx ?? LEADER_MIN_PX;

  const vx = rawS.x - anchorS.x;
  const vy = rawS.y - anchorS.y;
  const r = Math.hypot(vx, vy);
  // 라벨이 마크에 붙어 있으면 각도가 요동쳐서 스냅이 마구 튄다
  if (r < minLeader) return null;

  const theta = degrees(Math.atan2(vy, vx));
  const set = angleSnapSet(opts.with45);

  let target = set[0] as number;
  let delta = angularDistance(theta, target);
  for (const s of set) {
    const d = angularDistance(theta, s);
    if (d < delta) {
      target = s;
      delta = d;
    }
  }

  const limit = held !== null && held.angle === target ? releaseDeg : enterDeg;
  if (delta > limit) return null;

  // ⭐ 스냅으로 라벨이 튈 실제 거리
  const shift = r * Math.sin(radians(delta));
  if (shift > maxShift) return null;

  const a = radians(target);
  // 거리 r 은 유지하고 각도만 바꾼다. "직교화" 의 정확한 의미
  return {
    angle: target,
    point: { x: anchorS.x + r * Math.cos(a), y: anchorS.y + r * Math.sin(a) },
    r,
  };
}
