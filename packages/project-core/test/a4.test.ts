/**
 * F1 — A4 가로 정규화. Numdraw 실측 방식 이식 (`_workspace/12_수정사항_S3중간.md` §F1).
 */
import { describe, expect, it } from 'vitest';
import { A4_LANDSCAPE, calcFitRect, fitRectToImgLayout } from '../src/index.js';

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
