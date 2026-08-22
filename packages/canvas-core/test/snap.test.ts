import { describe, expect, it } from 'vitest';
import {
  ALIGN_ENTER_PX,
  ALIGN_RELEASE_PX,
  ANGLE_MAX_SHIFT_PX,
  LEADER_MIN_PX,
} from '../src/constants.js';
import { findAlignSnap } from '../src/snapAlign.js';
import { computeAngleSnap } from '../src/snapAngle.js';
import { resolveSnaps } from '../src/snapResolve.js';
import { toNorm, toScreen } from '../src/geometry.js';
import type { AlignCand, AlignHit, AlignSnapshot } from '../src/types.js';

const sortedCands = (...vs: Array<[number, string]>): AlignCand[] =>
  vs.map(([v, id]) => ({ v, id })).sort((a, b) => (a.v !== b.v ? a.v - b.v : a.id < b.id ? -1 : 1));

describe('T8 · 스마트 정렬 스냅', () => {
  it('진입 임계 6px — 6px 은 걸리고 6.1px 은 안 걸린다', () => {
    const cands = sortedCands([100, 'a']);
    expect(findAlignSnap(100 + ALIGN_ENTER_PX, cands, null)).not.toBeNull();
    expect(findAlignSnap(100 + ALIGN_ENTER_PX + 0.1, cands, null)).toBeNull();
  });

  it('후보가 6px 과 6.1px 에 있으면 6px 쪽만 잡는다', () => {
    const cands = sortedCands([94, 'near'], [93.9, 'far']);
    const hit = findAlignSnap(100, cands, null);
    expect(hit?.id).toBe('near');
  });

  it('히스테리시스 — 6에서 걸리고 10을 넘어야 풀린다', () => {
    const cands = sortedCands([100, 'a']);
    let held: AlignHit | null = findAlignSnap(104, cands, null);
    expect(held).not.toBeNull();
    // 8px 떨어져도 유지 (release 10)
    held = findAlignSnap(108, cands, held);
    expect(held?.id).toBe('a');
    // 10px 을 넘으면 풀린다
    held = findAlignSnap(100 + ALIGN_RELEASE_PX + 0.5, cands, held);
    expect(held).toBeNull();
  });

  it('같은 거리 후보 2개면 항상 같은 쪽(defectId 사전순)을 잡는다 — 재현성', () => {
    const cands = sortedCands([97, 'zzz'], [103, 'aaa']);
    for (let i = 0; i < 5; i += 1) {
      expect(findAlignSnap(100, cands, null)?.id).toBe('aaa');
    }
  });

  it('후보가 없으면 null', () => {
    expect(findAlignSnap(100, [], null)).toBeNull();
  });
});

describe('T9 · 리더선 각도 스냅', () => {
  const anchor = { x: 400, y: 400 };

  it('90도 ±5도 안이면 정확히 직교화되고 리더 길이는 유지된다', () => {
    // 아래쪽으로 100px, 약간 기울어진 상태 (약 3.4도)
    const raw = { x: anchor.x + 6, y: anchor.y + 100 };
    const r0 = Math.hypot(raw.x - anchor.x, raw.y - anchor.y);
    const hit = computeAngleSnap(anchor, raw, null, false);
    expect(hit).not.toBeNull();
    expect(hit!.angle).toBe(90);
    expect(hit!.point.x).toBeCloseTo(anchor.x, 10); // 화면상 정확히 수직
    expect(Math.hypot(hit!.point.x - anchor.x, hit!.point.y - anchor.y)).toBeCloseTo(r0, 10);
  });

  it('라벨이 마크에 겹친 상태(r < 24px)에서는 스냅하지 않는다', () => {
    const raw = { x: anchor.x + 1, y: anchor.y + LEADER_MIN_PX - 1 };
    expect(computeAngleSnap(anchor, raw, null, false)).toBeNull();
  });

  it('리더선이 아주 길면(r≈400px) 4.9도여도 스냅하지 않는다 (shift > 12px)', () => {
    const r = 400;
    const deg = 90 - 4.9;
    const raw = {
      x: anchor.x + r * Math.cos((deg * Math.PI) / 180),
      y: anchor.y + r * Math.sin((deg * Math.PI) / 180),
    };
    const shift = r * Math.sin((4.9 * Math.PI) / 180);
    expect(shift).toBeGreaterThan(ANGLE_MAX_SHIFT_PX);
    expect(computeAngleSnap(anchor, raw, null, false)).toBeNull();
  });

  it('짧은 리더선은 같은 각도에서 스냅한다 (shift ≤ 12px)', () => {
    const r = 100;
    const deg = 90 - 4.9;
    const raw = {
      x: anchor.x + r * Math.cos((deg * Math.PI) / 180),
      y: anchor.y + r * Math.sin((deg * Math.PI) / 180),
    };
    expect(computeAngleSnap(anchor, raw, null, false)?.angle).toBe(90);
  });

  it('Alt 를 누르고 있으면 비활성', () => {
    const raw = { x: anchor.x + 6, y: anchor.y + 100 };
    expect(computeAngleSnap(anchor, raw, null, true)).toBeNull();
  });

  it('히스테리시스 — 5도에서 걸리고 8도를 넘어야 풀린다', () => {
    const r = 60;
    const at = (deg: number) => ({
      x: anchor.x + r * Math.cos((deg * Math.PI) / 180),
      y: anchor.y + r * Math.sin((deg * Math.PI) / 180),
    });
    const held = computeAngleSnap(anchor, at(86), null, false);
    expect(held?.angle).toBe(90);
    expect(computeAngleSnap(anchor, at(83), held, false)?.angle).toBe(90); // 7도 — 유지
    expect(computeAngleSnap(anchor, at(81), held, false)).toBeNull(); // 9도 — 해제
  });

  it('45도 배수는 기본으로 꺼져 있다', () => {
    const r = 80;
    const raw = {
      x: anchor.x + r * Math.cos((46 * Math.PI) / 180),
      y: anchor.y + r * Math.sin((46 * Math.PI) / 180),
    };
    expect(computeAngleSnap(anchor, raw, null, false)).toBeNull();
    expect(computeAngleSnap(anchor, raw, null, false, { with45: true })?.angle).toBe(45);
  });

  it('⚠️ 종횡비 4000×800 도면에서도 90도 스냅이 **화면상** 정확히 수직이다', () => {
    const IW = 4000;
    const IH = 800;
    const vp = { zoom: 0.25, tx: 40, ty: 60 };

    const anchorN = { x: 0.5, y: 0.5 };
    const anchorS = toScreen(anchorN, vp, IW, IH);
    // 화면상 약 87도인 지점
    const rawS = { x: anchorS.x + 5, y: anchorS.y + 95 };

    const hit = computeAngleSnap(anchorS, rawS, null, false);
    expect(hit).not.toBeNull();

    // 스크린에서 수직
    expect(hit!.point.x).toBeCloseTo(anchorS.x, 10);
    // 저장(정규화) → 재렌더 왕복 후에도 수직이 유지된다
    const storedN = toNorm(hit!.point, vp, IW, IH);
    const backS = toScreen(storedN, vp, IW, IH);
    expect(backS.x).toBeCloseTo(anchorS.x, 8);

    // 90도는 x 가 보존되므로 두 공간에서 모두 90도다. 함정은 사선에서 드러난다:
    // 화면상 45도인 벡터를 정규화 공간에서 재면 완전히 다른 각도가 나온다.
    const diag = { x: anchorS.x + 100, y: anchorS.y + 100 }; // 화면상 정확히 45도
    const diagN = toNorm(diag, vp, IW, IH);
    const naiveDeg = (Math.atan2(diagN.y - anchorN.y, diagN.x - anchorN.x) * 180) / Math.PI;
    expect(Math.abs(naiveDeg - 45)).toBeGreaterThan(20); // 실제로 78.7도쯤 된다
  });
});

describe('T10 · 스냅 병합 (§2-8)', () => {
  const anchor = { x: 200, y: 200 };
  const snapshot: AlignSnapshot = { xs: [], ys: [], byId: { other: { x: 260, y: 300 } } };

  const vertical = () =>
    computeAngleSnap(anchor, { x: anchor.x + 4, y: anchor.y + 120 }, null, false)!;

  it('수직 스냅 중에도 y축 줄맞춤이 동시에 걸린다 (자유축)', () => {
    const ang = vertical();
    expect(ang.angle).toBe(90);
    const ay: AlignHit = { v: 300, id: 'other', d: 2 };
    const res = resolveSnaps({ x: 204, y: 302 }, null, ay, ang, snapshot, anchor);
    expect(res.pos.x).toBeCloseTo(anchor.x, 10); // 각도가 x 를 고정
    expect(res.pos.y).toBe(300); // 정렬이 y 를 고정
    expect(res.guides.some((g) => g.k === 'ANGLE')).toBe(true);
    expect(res.guides.some((g) => g.k === 'ALIGN_Y')).toBe(true);
  });

  it('같은 축 충돌 시 각도가 이기고 **정렬 가이드선이 사라진다** (§2-8-c)', () => {
    const ang = vertical();
    const ax: AlignHit = { v: 260, id: 'other', d: 3 };
    const res = resolveSnaps({ x: 257, y: 320 }, ax, null, ang, snapshot, anchor);
    expect(res.pos.x).toBeCloseTo(anchor.x, 10); // 각도 우선
    expect(res.guides.some((g) => g.k === 'ALIGN_X')).toBe(false); // 적용 안 된 가이드는 안 그린다
    expect(res.guides.some((g) => g.k === 'ANGLE')).toBe(true);
  });

  it('ALIGN_FIRST 로 바꾸면 충돌 시 각도를 통째로 버린다', () => {
    const ang = vertical();
    const ax: AlignHit = { v: 260, id: 'other', d: 3 };
    const res = resolveSnaps({ x: 257, y: 320 }, ax, null, ang, snapshot, anchor, 'ALIGN_FIRST');
    expect(res.pos.x).toBe(260);
    expect(res.guides.some((g) => g.k === 'ANGLE')).toBe(false);
    expect(res.guides.some((g) => g.k === 'ALIGN_X')).toBe(true);
  });

  it('각도 스냅이 없으면 x·y 정렬이 독립적으로 적용된다 (교차점 스냅)', () => {
    const ax: AlignHit = { v: 260, id: 'other', d: 1 };
    const ay: AlignHit = { v: 300, id: 'other', d: 1 };
    const res = resolveSnaps({ x: 259, y: 301 }, ax, ay, null, snapshot, anchor);
    expect(res.pos).toEqual({ x: 260, y: 300 });
    expect(res.guides).toHaveLength(2);
  });

  it('가이드선은 같은 좌표를 공유하는 라벨들을 모두 덮는다', () => {
    const shot: AlignSnapshot = {
      xs: [],
      ys: [],
      byId: { a: { x: 260, y: 100 }, b: { x: 260, y: 500 }, c: { x: 999, y: 300 } },
    };
    const ax: AlignHit = { v: 260, id: 'a', d: 0 };
    const res = resolveSnaps({ x: 260, y: 300 }, ax, null, null, shot, null);
    const g = res.guides.find((x) => x.k === 'ALIGN_X');
    expect(g).toBeDefined();
    if (g && g.k === 'ALIGN_X') {
      expect(g.ids).toEqual(['a', 'b']);
      expect(g.y1).toBeLessThan(100);
      expect(g.y2).toBeGreaterThan(500);
    }
  });
});
