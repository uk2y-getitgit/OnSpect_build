/**
 * F1 — A4 가로 정규화. Numdraw 실측 방식 이식 (`_workspace/12_수정사항_S3중간.md` §F1).
 */
import { describe, expect, it } from 'vitest';
import {
  A4_LANDSCAPE,
  a4Transform,
  calcFitRect,
  clampScale,
  fitRectToImgLayout,
  fromA4Norm,
  isA4Normalized,
  MAX_SCALE,
  MIN_SCALE,
  scaleA4Size,
  toA4Norm,
  unscaleA4Size,
} from '../src/index.js';

describe('A4_LANDSCAPE — 실측 고정값', () => {
  it('1754×1240 (150 DPI, 297×210mm)', () => {
    expect(A4_LANDSCAPE).toEqual({ w: 1754, h: 1240 });
  });
});

describe('calcFitRect — Numdraw 실측 배치 규칙', () => {
  it('여백·도곽 예약을 뺀 뒤 남는 영역 계산이 실측 공식과 일치한다', () => {
    // pxMm = 1754/297, mPx = round(10*pxMm) = 59, tbPx = round(20*pxMm) = 118
    // avW = 1754 - 118 = 1636, avH = 1240 - 118 - 118 = 1004
    // 정사각형(1000×1000) 을 넣으면 더 좁은 쪽(avH=1004 대신 avW=1636 중 작은 값)에 맞춰진다
    const r = calcFitRect(1000, 1000);
    expect(r.w).toBeLessThanOrEqual(1636);
    expect(r.h).toBeLessThanOrEqual(1004);
    // 정사각 원본이므로 배치도 정사각이어야 한다
    expect(r.w).toBe(r.h);
    // 세로가 병목이므로 (avH < avW) 세로에 꽉 찬다
    expect(r.h).toBe(1004);
  });

  it('가로로 넓은 원본(4000×800, 5:1)은 가로가 병목이 되어 avW 에 꽉 찬다', () => {
    const r = calcFitRect(4000, 800);
    expect(r.w).toBe(1636);
    expect(r.h).toBe(Math.round(1636 / 5));
  });

  it('중앙 배치 — 여백이 좌우/상하 대칭이다 (허용 오차 1px, 반올림)', () => {
    const r = calcFitRect(1000, 1000); // 정사각 → 세로 꽉 참, 가로는 중앙에 여백
    const leftGap = r.x - 59; // mPx = 59
    const rightGap = 1754 - 59 - (r.x + r.w);
    expect(Math.abs(leftGap - rightGap)).toBeLessThanOrEqual(1);
  });

  it('배치 사각형은 항상 A4 캔버스 안에 있다 (극단적 종횡비에서도)', () => {
    const cases: [number, number][] = [[10000, 1], [1, 10000], [1, 1], [297, 210]];
    for (const [w, h] of cases) {
      const r = calcFitRect(w, h);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(1754);
      expect(r.y + r.h).toBeLessThanOrEqual(1240);
    }
  });

  it('비율을 유지한다 (allowing 반올림 오차)', () => {
    const r = calcFitRect(2000, 1000); // 2:1
    expect(r.w / r.h).toBeCloseTo(2, 1);
  });

  it('작은 캔버스(썸네일)에 비례해도 같은 상대 배치를 낸다', () => {
    const full = calcFitRect(4000, 800, 1754, 1240);
    const thumb = calcFitRect(4000, 800, 175, 124); // 정확히 1/10 축소
    // 상대 위치(비율)가 거의 같아야 한다
    expect(thumb.x / 175).toBeCloseTo(full.x / 1754, 1);
    expect(thumb.w / 175).toBeCloseTo(full.w / 1754, 1);
  });

  it('natW·natH 가 0 이어도 죽지 않는다 (방어적)', () => {
    const r = calcFitRect(0, 0);
    expect(r.w).toBeGreaterThanOrEqual(1);
    expect(r.h).toBeGreaterThanOrEqual(1);
  });
});

describe('fitRectToImgLayout', () => {
  it('x,y,w,h 를 offX,offY,dW,dH 로 그대로 옮긴다', () => {
    const r = calcFitRect(1000, 1000);
    expect(fitRectToImgLayout(r)).toEqual({ offX: r.x, offY: r.y, dW: r.w, dH: r.h });
  });
});

// ── F5-3 도면 크기 조절 ────────────────────────────────────────────────────
describe('clampScale — Numdraw 실측 상수', () => {
  it('범위는 0.3 ~ 2.5 다', () => {
    expect(MIN_SCALE).toBe(0.3);
    expect(MAX_SCALE).toBe(2.5);
  });

  it('범위 밖은 잘라낸다', () => {
    expect(clampScale(0.1)).toBe(0.3);
    expect(clampScale(9)).toBe(2.5);
    expect(clampScale(1.25)).toBe(1.25);
  });

  it('숫자가 아니거나 0 이면 1 로 본다', () => {
    expect(clampScale(null)).toBe(1);
    expect(clampScale(undefined)).toBe(1);
    expect(clampScale('abc')).toBe(1);
    expect(clampScale(0)).toBe(1);
    expect(clampScale(NaN)).toBe(1);
  });
});

describe('calcFitRect(scale) — 배치만 바뀌고 좌표계는 그대로다', () => {
  it('배율 1 은 기본 배치와 완전히 같다', () => {
    expect(calcFitRect(1000, 800, A4_LANDSCAPE.w, A4_LANDSCAPE.h, 1)).toEqual(
      calcFitRect(1000, 800),
    );
  });

  it('배율만큼 크기가 커지고 중앙 배치가 유지된다', () => {
    const base = calcFitRect(1000, 800);
    const big = calcFitRect(1000, 800, A4_LANDSCAPE.w, A4_LANDSCAPE.h, 2);
    expect(big.w).toBeGreaterThan(base.w);
    expect(big.h).toBeGreaterThan(base.h);
    // 중심이 유지된다 (반올림 오차 1px 허용)
    expect(Math.abs(base.x + base.w / 2 - (big.x + big.w / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs(base.y + base.h / 2 - (big.y + big.h / 2))).toBeLessThanOrEqual(1);
  });

  it('원본 종횡비는 배율과 무관하게 유지된다', () => {
    for (const s of [0.3, 0.5, 1, 1.7, 2.5]) {
      const r = calcFitRect(4000, 800, A4_LANDSCAPE.w, A4_LANDSCAPE.h, s);
      expect(Math.abs(r.w / r.h - 5)).toBeLessThan(0.05);
    }
  });

  it('범위 밖 배율은 clampScale 을 탄다', () => {
    expect(calcFitRect(1000, 800, A4_LANDSCAPE.w, A4_LANDSCAPE.h, 99)).toEqual(
      calcFitRect(1000, 800, A4_LANDSCAPE.w, A4_LANDSCAPE.h, MAX_SCALE),
    );
  });
});

// ── F1 재정규화 (AD15) ─────────────────────────────────────────────────────
describe('a4Transform — 재정규화 변환식', () => {
  const layout = fitRectToImgLayout(calcFitRect(4000, 800));

  it('AD15 식 그대로다: (off + old × d) / a4', () => {
    const t = a4Transform(layout);
    const p = toA4Norm({ x: 0.5, y: 0.5 }, t);
    expect(p.x).toBeCloseTo((layout.offX + 0.5 * layout.dW) / A4_LANDSCAPE.w, 10);
    expect(p.y).toBeCloseTo((layout.offY + 0.5 * layout.dH) / A4_LANDSCAPE.h, 10);
  });

  it('변환 결과는 항상 도면 영역(imgLayout) 안이다 → [0,1] 을 벗어나지 않는다', () => {
    const t = a4Transform(layout);
    for (const p of [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 0.3, y: 0.7 },
    ]) {
      const q = toA4Norm(p, t);
      expect(q.x).toBeGreaterThanOrEqual(0);
      expect(q.x).toBeLessThanOrEqual(1);
      expect(q.y).toBeGreaterThanOrEqual(0);
      expect(q.y).toBeLessThanOrEqual(1);
    }
  });

  it('왕복 변환은 원위치로 돌아온다 (되돌리기가 수학적으로 보장된다)', () => {
    for (const [w, h] of [
      [4000, 800],
      [800, 4000],
      [1000, 1000],
      [1754, 1240],
    ] as const) {
      const t = a4Transform(fitRectToImgLayout(calcFitRect(w, h)));
      for (const p of [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 0.123456, y: 0.987654 },
        { x: -0.4, y: 1.4 }, // 라벨은 [0,1] 밖으로 나갈 수 있다 (소프트 리밋)
      ]) {
        const back = fromA4Norm(toA4Norm(p, t), t);
        expect(back.x).toBeCloseTo(p.x, 10);
        expect(back.y).toBeCloseTo(p.y, 10);
      }
    }
  });

  it('크기는 오프셋 없이 배율만 먹는다 (위치 식을 쓰면 도형이 커진다)', () => {
    const t = a4Transform(layout);
    const s = scaleA4Size({ x: 0.2, y: 0.4 }, t);
    expect(s.x).toBeCloseTo(0.2 * t.sx, 10);
    expect(s.y).toBeCloseTo(0.4 * t.sy, 10);
    const back = unscaleA4Size(s, t);
    expect(back.x).toBeCloseTo(0.2, 10);
    expect(back.y).toBeCloseTo(0.4, 10);
  });

  it('배율이 1 인 항등 배치면 변환도 항등이다', () => {
    const t = a4Transform({ offX: 0, offY: 0, dW: A4_LANDSCAPE.w, dH: A4_LANDSCAPE.h });
    const p = toA4Norm({ x: 0.42, y: 0.17 }, t);
    expect(p).toEqual({ x: 0.42, y: 0.17 });
  });
});

describe('isA4Normalized', () => {
  it('imgLayout 이 있고 크기가 A4 면 이미 정규화된 것이다', () => {
    expect(
      isA4Normalized({
        imgLayout: { offX: 1, offY: 1, dW: 2, dH: 2 },
        imageWidth: 1754,
        imageHeight: 1240,
      }),
    ).toBe(true);
  });

  it('imgLayout 이 없으면 옛 도면이다', () => {
    expect(isA4Normalized({ imgLayout: null, imageWidth: 1754, imageHeight: 1240 })).toBe(false);
  });

  it('크기가 A4 가 아니면 옛 도면이다', () => {
    expect(
      isA4Normalized({ imgLayout: { offX: 0, offY: 0, dW: 1, dH: 1 }, imageWidth: 800, imageHeight: 600 }),
    ).toBe(false);
  });
});
