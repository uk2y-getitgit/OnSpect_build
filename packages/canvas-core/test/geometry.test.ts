import { describe, expect, it } from 'vitest';
import {
  angularDistance,
  distPointSegment,
  lockAxis,
  roundNorm,
  toNorm,
  toScreen,
} from '../src/geometry.js';
import { clampPan, fitViewport, zoomAt, zoomLimits } from '../src/viewport.js';
import { PAN_KEEP_VISIBLE } from '../src/constants.js';

const IW = 2400;
const IH = 1600;
const CANVAS = { w: 1000, h: 700 };

describe('T1 · 좌표 변환', () => {
  it('toNorm(toScreen(n)) === n (왕복 무손실)', () => {
    const vp = { zoom: 0.37, tx: 12.5, ty: -88.25 };
    for (const n of [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 0.4213, y: 0.7788 },
      { x: -0.3, y: 1.4 },
    ]) {
      const back = toNorm(toScreen(n, vp, IW, IH), vp, IW, IH);
      expect(back.x).toBeCloseTo(n.x, 10);
      expect(back.y).toBeCloseTo(n.y, 10);
    }
  });

  it('저장 정밀도는 소수 6자리', () => {
    expect(roundNorm({ x: 0.123456789, y: 0.987654321 })).toEqual({ x: 0.123457, y: 0.987654 });
  });

  it('선분-점 거리 — 끝점 밖은 끝점까지의 거리', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    expect(distPointSegment({ x: 5, y: 3 }, a, b)).toBeCloseTo(3);
    expect(distPointSegment({ x: -4, y: 0 }, a, b)).toBeCloseTo(4);
    expect(distPointSegment({ x: 14, y: 0 }, a, b)).toBeCloseTo(4);
  });

  it('angularDistance 는 0~180 로 정규화된 최소 각차', () => {
    expect(angularDistance(5, 0)).toBeCloseTo(5);
    expect(angularDistance(-5, 0)).toBeCloseTo(5);
    expect(angularDistance(355, 0)).toBeCloseTo(5);
    expect(angularDistance(179, -179)).toBeCloseTo(2);
  });

  it('Shift 축 고정은 Δ가 큰 축만 살린다', () => {
    expect(lockAxis({ x: 30, y: 5 }, { x: 0, y: 0 })).toEqual({ x: 30, y: 0 });
    expect(lockAxis({ x: 5, y: 30 }, { x: 0, y: 0 })).toEqual({ x: 0, y: 30 });
  });
});

describe('T1 · 뷰포트', () => {
  it('Fit 은 도면 전체를 화면 중앙에 넣는다', () => {
    const vp = fitViewport(IW, IH, CANVAS);
    expect(vp.tx).toBeGreaterThanOrEqual(0);
    expect(vp.ty).toBeGreaterThanOrEqual(0);
    expect(IW * vp.zoom).toBeLessThanOrEqual(CANVAS.w + 0.001);
    expect(IH * vp.zoom).toBeLessThanOrEqual(CANVAS.h + 0.001);
    // 좌우 여백이 같다 = 중앙
    expect(vp.tx).toBeCloseTo((CANVAS.w - IW * vp.zoom) / 2, 6);
  });

  it('zoomAt 후에도 커서 아래 정규화 좌표가 불변', () => {
    const vp0 = fitViewport(IW, IH, CANVAS);
    const { min, max } = zoomLimits(IW, IH, CANVAS);
    const cursor = { x: 321, y: view(210) };
    const before = toNorm(cursor, vp0, IW, IH);
    let vp = vp0;
    for (let i = 0; i < 12; i += 1) vp = zoomAt(vp, cursor, 1.1, min, max);
    const after = toNorm(cursor, vp, IW, IH);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });

  it('줌은 [fit×0.5, 8.0] 을 넘지 않는다', () => {
    const vp0 = fitViewport(IW, IH, CANVAS);
    const { min, max } = zoomLimits(IW, IH, CANVAS);
    let vp = vp0;
    for (let i = 0; i < 200; i += 1) vp = zoomAt(vp, { x: 0, y: 0 }, 1.1, min, max);
    expect(vp.zoom).toBeCloseTo(max, 10);
    for (let i = 0; i < 400; i += 1) vp = zoomAt(vp, { x: 0, y: 0 }, 1 / 1.1, min, max);
    expect(vp.zoom).toBeCloseTo(min, 10);
  });

  it('도면을 화면 밖으로 완전히 밀어낼 수 없다', () => {
    const vp0 = fitViewport(IW, IH, CANVAS);
    const pushed = clampPan({ ...vp0, tx: 999999, ty: -999999 }, IW, IH, CANVAS);
    const dw = IW * vp0.zoom;
    const dh = IH * vp0.zoom;
    const visW = Math.min(pushed.tx + dw, CANVAS.w) - Math.max(pushed.tx, 0);
    const visH = Math.min(pushed.ty + dh, CANVAS.h) - Math.max(pushed.ty, 0);
    expect(visW).toBeGreaterThanOrEqual(Math.min(PAN_KEEP_VISIBLE * dw, CANVAS.w) - 0.001);
    expect(visH).toBeGreaterThanOrEqual(Math.min(PAN_KEEP_VISIBLE * dh, CANVAS.h) - 0.001);
  });
});

function view(v: number): number {
  return v;
}
