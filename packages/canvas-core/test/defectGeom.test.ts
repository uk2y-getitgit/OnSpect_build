/**
 * 영역(사각·타원) 결함의 리더선 앵커 — 2026-08-24 수정.
 *
 * 예전에는 `centerOfGeometry(AREA_*)` 가 곧 리더선이 붙는 점이었다 — 도형 **중앙**.
 * 큰 영역일수록 선이 도형 속을 가로질러 어색해 보인다는 지적으로, 리더선은
 * 이제 "중앙 → 라벨" 방향의 **테두리 교차점**에 붙는다. `centerOfGeometry` 자체는
 * 건드리지 않았다 — auto-label 배치·번호 이동 델타 계산 등 다른 계산이 여전히
 * 중앙을 기준으로 삼기 때문이다. `defectScreen()` 이 리더선 앵커만 사후 보정한다.
 */
import { describe, expect, it } from 'vitest';
import { defectScreen } from '../src/defectGeom.js';
import { areaBoundaryPoint, type SRect } from '../src/shapes.js';
import { resolveStyle } from '../src/style.js';
import type { Viewport } from '../src/types.js';
import { defect, GS } from './helpers.js';

const VP: Viewport = { zoom: 1, tx: 0, ty: 0 };

describe('areaBoundaryPoint', () => {
  // center = (200, 150), halfW = 100, halfH = 50
  const rect: SRect = { x: 100, y: 100, w: 200, h: 100 };

  it('AREA_RECT — 라벨이 수평 방향이면 그 변 중앙에서 만난다', () => {
    const p = areaBoundaryPoint(rect, 'AREA_RECT', { x: 900, y: 150 });
    expect(p.x).toBeCloseTo(300); // 우측 변 x = 100 + 200
    expect(p.y).toBeCloseTo(150);
  });

  it('AREA_RECT — 대각선 방향이면 먼저 만나는 변에서 멈춘다 (도형 밖으로 안 나간다)', () => {
    // d = (200, -100) → tx = 100/200 = 0.5, ty = 50/100 = 0.5 → 동률, 우측 변과 상단 변이 만나는 모서리
    const p = areaBoundaryPoint(rect, 'AREA_RECT', { x: 400, y: 50 });
    expect(p.x).toBeCloseTo(300);
    expect(p.y).toBeCloseTo(100);
  });

  it('AREA_ELLIPSE — 결과가 타원 경계 방정식을 만족한다', () => {
    const p = areaBoundaryPoint(rect, 'AREA_ELLIPSE', { x: 900, y: 700 });
    const eq = (p.x - 200) ** 2 / 100 ** 2 + (p.y - 150) ** 2 / 50 ** 2;
    expect(eq).toBeCloseTo(1, 5);
  });

  it('target 이 중심과 겹치면 방향이 없어 중심을 그대로 돌려준다', () => {
    expect(areaBoundaryPoint(rect, 'AREA_RECT', { x: 200, y: 150 })).toEqual({ x: 200, y: 150 });
  });
});

describe('defectScreen — 영역 결함의 리더선은 테두리에 붙는다', () => {
  it('AREA_RECT 마크 1개 — anchor 가 도형 중앙이 아니다', () => {
    const d = defect('a', 1, { x: 0, y: 0 }, { x: 0.9, y: 0.9 }, {
      marks: [
        {
          id: 'a-m0',
          defectId: 'a',
          type: 'AREA_RECT',
          geometry: { k: 'AREA_RECT', x: 0.1, y: 0.1, w: 0.2, h: 0.1 },
          sortOrder: 0,
        },
      ],
      label: { defectId: 'a', x: 0.9, y: 0.9, anchorMarkId: 'a-m0', placed: true },
    });
    const style = resolveStyle(d, GS);
    const s = defectScreen(d, style, VP, 1000, 1000, null);
    // 도형 중심 = (0.2, 0.15) * 1000 = (200, 150)
    expect(s.anchor).not.toEqual({ x: 200, y: 150 });
    // 라벨이 우하단이므로 앵커는 도형의 우측 또는 하단 변 위여야 한다
    expect(s.anchor!.x <= 300 || s.anchor!.y <= 200).toBe(true);
  });

  it('AREA_ELLIPSE 도 같은 방식으로 테두리에 붙는다', () => {
    const d = defect('a', 1, { x: 0, y: 0 }, { x: 0, y: 0 }, {
      marks: [
        {
          id: 'a-m0',
          defectId: 'a',
          type: 'AREA_ELLIPSE',
          geometry: { k: 'AREA_ELLIPSE', x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
          sortOrder: 0,
        },
      ],
      label: { defectId: 'a', x: 0.05, y: 0.05, anchorMarkId: 'a-m0', placed: true },
    });
    const style = resolveStyle(d, GS);
    const s = defectScreen(d, style, VP, 1000, 1000, null);
    // 중심 = (200, 200), 반지름 100 — 경계 위의 점이어야 하므로 중심에서 거리 ≈ 반지름 범위
    const dist = Math.hypot(s.anchor!.x - 200, s.anchor!.y - 200);
    expect(dist).toBeGreaterThan(50);
    expect(dist).toBeLessThanOrEqual(100 + 1e-6);
  });

  it('POINT 마크는 그대로 중앙(= 점 자체)에 붙는다 — 회귀 없음', () => {
    const d = defect('a', 1, { x: 0.3, y: 0.4 }, { x: 0.5, y: 0.5 });
    const style = resolveStyle(d, GS);
    const s = defectScreen(d, style, VP, 1000, 1000, null);
    expect(s.anchor).toEqual({ x: 300, y: 400 });
  });

  it('마크가 2개 이상이면(centroid 앵커) 영역이어도 테두리 보정을 하지 않는다', () => {
    const d = defect('a', 1, { x: 0, y: 0 }, { x: 0.9, y: 0.9 }, {
      marks: [
        {
          id: 'a-m0',
          defectId: 'a',
          type: 'AREA_RECT',
          geometry: { k: 'AREA_RECT', x: 0.1, y: 0.1, w: 0.2, h: 0.1 },
          sortOrder: 0,
        },
        { id: 'a-m1', defectId: 'a', type: 'POINT', geometry: { k: 'POINT', x: 0.5, y: 0.5 }, sortOrder: 1 },
      ],
      label: { defectId: 'a', x: 0.9, y: 0.9, anchorMarkId: null, placed: true },
    });
    const style = resolveStyle(d, GS);
    const s = defectScreen(d, style, VP, 1000, 1000, null);
    // centroid of (200,150) and (500,500) = (350, 325) — 정확히 이 값이어야 보정이 안 걸린 것이다
    expect(s.anchor).toEqual({ x: 350, y: 325 });
  });
});
