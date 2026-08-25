/**
 * PhotoPolish R-2 — 자르기·주석 좌표 변환 (§2-1).
 *
 * ⭐ 이 라운드에서 **가장 틀리기 쉬운 계산**이다. `apps/web` 에는 테스트 러너가 없으므로
 *    변환을 여기 순수 함수로 빼고 왕복 항등을 4개 회전값 전부에 대해 고정한다.
 *    틀리면 세로 사진에서 자르기 사각형이 90° 어긋난다.
 */
import { describe, expect, it } from 'vitest';
import {
  ANNOTATION_WIDTHS,
  ARROW_HEAD_RATIO,
  CROP_MIN_SIZE,
  ROUND4,
  arrowHeadPoints,
  clampRect,
  isFullRect,
  roundRect,
  strokePx,
  toDisplayPoint,
  toDisplayRect,
  toSourcePoint,
  toSourceRect,
  type PhotoRotate,
  type Rect,
} from '../src/index.js';

const ROTATES: readonly PhotoRotate[] = [0, 90, 180, 270];

const POINTS = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
  { x: 0.5, y: 0.5 },
  { x: 0.13, y: 0.87 },
  { x: 0.9, y: 0.1 },
];

const RECTS: Rect[] = [
  { x: 0, y: 0, w: 1, h: 1 },
  { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
  { x: 0.5, y: 0.05, w: 0.45, h: 0.9 },
  { x: 0, y: 0.6, w: 0.25, h: 0.4 },
];

function closePt(a: { x: number; y: number }, b: { x: number; y: number }): void {
  expect(a.x).toBeCloseTo(b.x, 10);
  expect(a.y).toBeCloseTo(b.y, 10);
}

function closeRect(a: Rect, b: Rect): void {
  expect(a.x).toBeCloseTo(b.x, 10);
  expect(a.y).toBeCloseTo(b.y, 10);
  expect(a.w).toBeCloseTo(b.w, 10);
  expect(a.h).toBeCloseTo(b.h, 10);
}

describe('점 변환 — 왕복 항등 (§2-1)', () => {
  it('toSource(toDisplay(p)) === p · 4개 회전값 전부', () => {
    for (const r of ROTATES) {
      for (const p of POINTS) closePt(toSourcePoint(toDisplayPoint(p, r), r), p);
    }
  });

  it('toDisplay(toSource(p)) === p · 4개 회전값 전부', () => {
    for (const r of ROTATES) {
      for (const p of POINTS) closePt(toDisplayPoint(toSourcePoint(p, r), r), p);
    }
  });

  it('rotate 0 은 항등이다 (빠른 경로가 조용히 틀리지 않는다)', () => {
    for (const p of POINTS) {
      expect(toSourcePoint(p, 0)).toEqual(p);
      expect(toDisplayPoint(p, 0)).toEqual(p);
    }
  });

  it('스펙 표 그대로 — 90° 는 x=v, y=1-u', () => {
    closePt(toSourcePoint({ x: 0.2, y: 0.7 }, 90), { x: 0.7, y: 0.8 });
    closePt(toDisplayPoint({ x: 0.7, y: 0.8 }, 90), { x: 0.2, y: 0.7 });
  });

  it('스펙 표 그대로 — 180° · 270°', () => {
    closePt(toSourcePoint({ x: 0.2, y: 0.7 }, 180), { x: 0.8, y: 0.3 });
    closePt(toSourcePoint({ x: 0.2, y: 0.7 }, 270), { x: 0.3, y: 0.2 });
    closePt(toDisplayPoint({ x: 0.8, y: 0.3 }, 180), { x: 0.2, y: 0.7 });
    closePt(toDisplayPoint({ x: 0.3, y: 0.2 }, 270), { x: 0.2, y: 0.7 });
  });

  it('90° 를 네 번 돌리면 제자리다', () => {
    for (const p of POINTS) {
      let q = p;
      for (let i = 0; i < 4; i += 1) q = toSourcePoint(q, 90);
      closePt(q, p);
    }
  });
});

describe('사각형 변환 — 90/270 은 가로·세로가 맞바뀐다', () => {
  it('toSource(toDisplay(r)) === r · 4개 회전값 전부', () => {
    for (const rot of ROTATES) {
      for (const r of RECTS) closeRect(toSourceRect(toDisplayRect(r, rot), rot), r);
    }
  });

  it('toDisplay(toSource(r)) === r · 4개 회전값 전부', () => {
    for (const rot of ROTATES) {
      for (const r of RECTS) closeRect(toDisplayRect(toSourceRect(r, rot), rot), r);
    }
  });

  it('⚠️ 폭·높이가 절대 음수가 되지 않는다 (점 변환만 두 번 하면 음수가 나온다)', () => {
    for (const rot of ROTATES) {
      for (const r of RECTS) {
        const s = toSourceRect(r, rot);
        expect(s.w).toBeGreaterThan(0);
        expect(s.h).toBeGreaterThan(0);
        expect(s.x).toBeGreaterThanOrEqual(-1e-12);
        expect(s.y).toBeGreaterThanOrEqual(-1e-12);
        expect(s.x + s.w).toBeLessThanOrEqual(1 + 1e-12);
        expect(s.y + s.h).toBeLessThanOrEqual(1 + 1e-12);
      }
    }
  });

  it('90° · 270° 는 w↔h 를 맞바꾼다', () => {
    const r: Rect = { x: 0.1, y: 0.2, w: 0.3, h: 0.5 };
    expect(toSourceRect(r, 90).w).toBeCloseTo(0.5, 10);
    expect(toSourceRect(r, 90).h).toBeCloseTo(0.3, 10);
    expect(toSourceRect(r, 270).w).toBeCloseTo(0.5, 10);
    expect(toSourceRect(r, 270).h).toBeCloseTo(0.3, 10);
    // 180 은 크기가 그대로다
    expect(toSourceRect(r, 180).w).toBeCloseTo(0.3, 10);
    expect(toSourceRect(r, 180).h).toBeCloseTo(0.5, 10);
  });

  it('전체 사각형은 어느 회전에서도 전체다', () => {
    const full: Rect = { x: 0, y: 0, w: 1, h: 1 };
    for (const rot of ROTATES) {
      closeRect(toSourceRect(full, rot), full);
      closeRect(toDisplayRect(full, rot), full);
    }
  });

  it('90° 실측 — 표시 좌상단이 렌더 좌하단으로 간다', () => {
    // 표시 프레임 좌상 1/4
    const s = toSourceRect({ x: 0, y: 0, w: 0.5, h: 0.5 }, 90);
    closeRect(s, { x: 0, y: 0.5, w: 0.5, h: 0.5 });
  });
});

describe('clampRect', () => {
  it('[0,1] 밖으로 나가지 않는다', () => {
    const r = clampRect({ x: -0.4, y: 0.8, w: 0.9, h: 0.9 });
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-12);
    expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-12);
  });

  it('최소 크기 0.05 를 보장한다', () => {
    const r = clampRect({ x: 0.5, y: 0.5, w: 0.001, h: 0 });
    expect(r.w).toBeCloseTo(CROP_MIN_SIZE, 10);
    expect(r.h).toBeCloseTo(CROP_MIN_SIZE, 10);
  });

  it('반대 방향으로 끈 사각형(음수 폭)을 바로잡는다', () => {
    const r = clampRect({ x: 0.8, y: 0.9, w: -0.5, h: -0.4 });
    closeRect(r, { x: 0.3, y: 0.5, w: 0.5, h: 0.4 });
  });

  it('멱등이다', () => {
    for (const r of RECTS) closeRect(clampRect(clampRect(r)), clampRect(r));
  });
});

describe('isFullRect · roundRect · ROUND4', () => {
  it('0.001 이내면 전체로 본다 — crop = null 로 저장한다', () => {
    expect(isFullRect({ x: 0, y: 0, w: 1, h: 1 })).toBe(true);
    expect(isFullRect({ x: 0.0004, y: 0, w: 0.9996, h: 1 })).toBe(true);
    expect(isFullRect({ x: 0.02, y: 0, w: 0.98, h: 1 })).toBe(false);
  });

  it('소수 4자리로 반올림한다', () => {
    expect(ROUND4(0.123456)).toBe(0.1235);
    expect(ROUND4(0.00004)).toBe(0);
    expect(ROUND4(Number.NaN)).toBe(0);
    expect(roundRect({ x: 0.111115, y: 0.2, w: 0.33333333, h: 1 })).toEqual({
      x: 0.1111,
      y: 0.2,
      w: 0.3333,
      h: 1,
    });
  });
});

describe('arrowHeadPoints — 화면 SVG 와 출력 Canvas 가 같은 함수를 쓴다', () => {
  it('오른쪽 화살표의 두 날개가 촉 뒤 대칭 위치에 온다', () => {
    const [a, b] = arrowHeadPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 20);
    expect(a.x).toBeLessThan(100);
    expect(b.x).toBeLessThan(100);
    expect(a.y).toBeCloseTo(-b.y, 10);
    expect(a.x).toBeCloseTo(b.x, 10);
    // 촉 길이만큼 떨어져 있다
    expect(Math.hypot(a.x - 100, a.y - 0)).toBeCloseTo(20, 10);
  });

  it('길이 0 이면 두 점 모두 to 다 (호출자가 분기하지 않아도 된다)', () => {
    const [a, b] = arrowHeadPoints({ x: 5, y: 5 }, { x: 5, y: 5 }, 20);
    expect(a).toEqual({ x: 5, y: 5 });
    expect(b).toEqual({ x: 5, y: 5 });
  });

  it('촉이 몸통보다 길어지지 않는다', () => {
    const [a] = arrowHeadPoints({ x: 0, y: 0 }, { x: 5, y: 0 }, 40);
    expect(Math.hypot(a.x - 5, a.y)).toBeLessThanOrEqual(5 + 1e-9);
  });

  it('회전해도 촉 각도가 유지된다', () => {
    const straight = arrowHeadPoints({ x: 0, y: 0 }, { x: 10, y: 0 }, 4);
    const diagonal = arrowHeadPoints({ x: 0, y: 0 }, { x: 10, y: 10 }, 4);
    const d1 = Math.hypot(straight[0].x - straight[1].x, straight[0].y - straight[1].y);
    const d2 = Math.hypot(diagonal[0].x - diagonal[1].x, diagonal[0].y - diagonal[1].y);
    expect(d1).toBeCloseTo(d2, 10);
  });
});

describe('굵기 — 렌더 프레임 장변 대비 비율 (§2-1)', () => {
  it('프리셋이 장변 2048 에서 8 / 16 / 29px 근처다', () => {
    expect(Math.round(strokePx(ANNOTATION_WIDTHS.THIN, 2048, 1536))).toBe(8);
    expect(Math.round(strokePx(ANNOTATION_WIDTHS.NORMAL, 2048, 1536))).toBe(16);
    expect(Math.round(strokePx(ANNOTATION_WIDTHS.THICK, 2048, 1536))).toBe(29);
  });

  it('장변 기준이라 세로 사진에서도 같은 굵기다', () => {
    expect(strokePx(ANNOTATION_WIDTHS.NORMAL, 1536, 2048)).toBeCloseTo(
      strokePx(ANNOTATION_WIDTHS.NORMAL, 2048, 1536),
      10,
    );
  });

  it('최소 1px 은 보장한다 — 썸네일에서 선이 사라지지 않는다', () => {
    expect(strokePx(ANNOTATION_WIDTHS.THIN, 20, 15)).toBe(1);
  });

  it('화살촉 길이 비율 상수가 스펙 값이다', () => {
    expect(ARROW_HEAD_RATIO).toBe(4);
  });
});
