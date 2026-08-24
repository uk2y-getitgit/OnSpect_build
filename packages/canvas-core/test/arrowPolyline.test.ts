/**
 * 방향(화살표) — S2a-2 3차 재개정, 2026-08-24.
 *
 * 마우스가 실제로 지나간 대로 그린 꺾은선을 저장한다(번호 위치에서 역산하지 않는다).
 * `points[0]` = 화살촉(첫 구간이 진행하는 반대 방향을 가리킨다), 마지막 점 = 번호 쪽 끝.
 * 첫 구간은 45도(8방향), 이후 구간은 직전 구간 기준 ±90도로만 꺾인다(최대 2번).
 * 생성 드래그 자체(도구 조작)는 s2a.test.ts 가 다룬다. 여기서는 그 아래에 깔린
 * 순수 함수(advanceArrowDrag)와 옛 레코드 호환, 렌더/히트 통합을 본다.
 */
import { describe, expect, it } from 'vitest';
import { advanceArrowDrag } from '../src/arrowRoute.js';
import { arrowLastLegAngleDeg, centerOfGeometry, normalizeArrowMarks } from '../src/defectGeom.js';
import { hitTest, leaderSegment } from '../src/hitTest.js';
import { buildScreens } from '../src/renderModel.js';
import { geometryBounds, translateGeometry } from '../src/shapes.js';
import type { Mark, MarkGeometry, Selection } from '../src/types.js';
import { defect, GS } from './helpers.js';

describe('advanceArrowDrag — 순수 함수, 마우스를 그대로 따라간다', () => {
  const origin = { x: 100, y: 100 };

  it('최소 이동량 전에는 방향이 안 잡힌다(점 1개)', () => {
    const r = advanceArrowDrag([origin], [], { x: 102, y: 101 });
    expect(r.points).toEqual([origin]);
    expect(r.angles).toEqual([]);
  });

  it('오른쪽으로 끌면 0도로 잠기고, 그 축으로 투영된 점이 나온다', () => {
    const r = advanceArrowDrag([origin], [], { x: 300, y: 100 });
    expect(r.angles).toEqual([0]);
    expect(r.points[1]!.x).toBeCloseTo(300, 6);
    expect(r.points[1]!.y).toBeCloseTo(100, 6);
  });

  it('한 번 잠긴 방향은 옆으로 조금 움직여도(임계값 미만) 안 바뀐다 — 그 축으로 늘어난다', () => {
    const a = advanceArrowDrag([origin], [], { x: 300, y: 100 });
    const b = advanceArrowDrag(a.points, a.angles, { x: 400, y: 105 }); // 옆으로 5px, 임계값(18) 미만
    expect(b.angles).toEqual([0]); // 안 꺾인다
    expect(b.points[1]!.x).toBeCloseTo(400, 6);
    expect(b.points[1]!.y).toBeCloseTo(100, 6); // y 는 축에 붙어 있다
  });

  it('임계값 이상 옆으로 벗어나면 직전 구간 기준 90도로 꺾인다 (1번째 굴절)', () => {
    const a = advanceArrowDrag([origin], [], { x: 300, y: 100 }); // 0도 구간
    const b = advanceArrowDrag(a.points, a.angles, { x: 300, y: 150 }); // 아래로 50px 벗어남
    expect(b.angles).toEqual([0, 90]); // 90도(스크린 좌표계, 아래=+y=90도) 로 꺾인다
    expect(b.points).toHaveLength(3);
    expect(b.points[1]).toEqual({ x: 300, y: 100 }); // 굴절점 = 벗어나기 시작한 지점(along)
    expect(b.points[2]!.y).toBeCloseTo(150, 6);
  });

  it('두 번째로 옆으로 벗어나면 또 90도(반대쪽) — 최대 2번째 굴절', () => {
    const a = advanceArrowDrag([origin], [], { x: 300, y: 100 }); // 0도
    const b = advanceArrowDrag(a.points, a.angles, { x: 300, y: 150 }); // 90도로 1차 굴절
    const c = advanceArrowDrag(b.points, b.angles, { x: 250, y: 150 }); // 왼쪽으로 벗어남(2차 굴절)
    expect(c.angles).toHaveLength(3); // 시작 + 굴절 2번 = 구간 3개
    expect(c.angles[0]).toBe(0);
    expect(c.angles[2]).toBe(180); // 90도 구간에서 왼쪽으로 벗어나면 상대 -90 → 절대 180
  });

  it('이미 최대 구간 수(3)에 도달하면 더는 안 꺾이고 마지막 구간만 늘어난다', () => {
    const a = advanceArrowDrag([origin], [], { x: 300, y: 100 });
    const b = advanceArrowDrag(a.points, a.angles, { x: 300, y: 150 });
    const c = advanceArrowDrag(b.points, b.angles, { x: 250, y: 150 });
    const d = advanceArrowDrag(c.points, c.angles, { x: 250, y: 400 }); // 또 벗어나려 해도
    expect(d.angles).toHaveLength(3); // 안 늘어난다
    expect(d.points).toHaveLength(4); // 점 개수도 그대로(마지막 점만 갱신)
  });
});

describe('normalizeArrowMarks — 옛 레코드 호환 (두 세대)', () => {
  it('가장 옛 형식 {from,to} 를 points 배열로 바꾼다', () => {
    const legacy = {
      id: 'm1', defectId: 'd1', type: 'ARROW',
      geometry: { k: 'ARROW', from: { x: 0.1, y: 0.2 }, to: { x: 0.3, y: 0.4 } } as unknown as MarkGeometry,
      sortOrder: 0,
    } as Mark;
    const out = normalizeArrowMarks([legacy]);
    const g = out[0]!.geometry;
    if (g.k !== 'ARROW') throw new Error('ARROW');
    expect(g.points[0]).toEqual({ x: 0.1, y: 0.2 });
    expect(g.points[1]).toEqual({ x: 0.3, y: 0.4 });
  });

  it('세션 중간 형식 {x,y,angleDeg} 도 points 배열로 바꾼다 (각도는 그대로 존중)', () => {
    const mid = {
      id: 'm1', defectId: 'd1', type: 'ARROW',
      geometry: { k: 'ARROW', x: 0.2, y: 0.2, angleDeg: 90 } as unknown as MarkGeometry,
      sortOrder: 0,
    } as Mark;
    const out = normalizeArrowMarks([mid]);
    const g = out[0]!.geometry;
    if (g.k !== 'ARROW') throw new Error('ARROW');
    expect(g.points[0]).toEqual({ x: 0.2, y: 0.2 });
    expect(g.points[1]!.y).toBeGreaterThan(g.points[0]!.y); // 90도 = 아래쪽
    expect(g.points[1]!.x).toBeCloseTo(g.points[0]!.x, 6);
  });

  it('이미 지금 형식이면 같은 배열을 그대로 돌려준다 (참조 동일)', () => {
    const m: Mark = {
      id: 'm1', defectId: 'd1', type: 'ARROW',
      geometry: { k: 'ARROW', points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }] },
      sortOrder: 0,
    };
    const marks = [m];
    expect(normalizeArrowMarks(marks)).toBe(marks);
  });

  it('POINT · AREA_RECT 마크는 손대지 않는다', () => {
    const m: Mark = { id: 'm1', defectId: 'd1', type: 'POINT', geometry: { k: 'POINT', x: 0.5, y: 0.5 }, sortOrder: 0 };
    const marks = [m];
    expect(normalizeArrowMarks(marks)).toBe(marks);
  });
});

describe('centerOfGeometry(ARROW) — 번호 쪽 끝(마지막 점)', () => {
  it('2점이든 여러 점이든 마지막 점을 돌려준다', () => {
    const g2: MarkGeometry = { k: 'ARROW', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] };
    expect(centerOfGeometry(g2)).toEqual({ x: 1, y: 1 });
    const g4: MarkGeometry = {
      k: 'ARROW',
      points: [{ x: 0, y: 0 }, { x: 0.2, y: 0 }, { x: 0.2, y: 0.3 }, { x: 0.5, y: 0.3 }],
    };
    expect(centerOfGeometry(g4)).toEqual({ x: 0.5, y: 0.3 });
  });
});

describe('translateGeometry / geometryBounds(ARROW) — 점 전체에 적용된다', () => {
  const g: MarkGeometry = {
    k: 'ARROW',
    points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.5 }, { x: 0.2, y: 0.05 }],
  };

  it('translateGeometry 는 모든 점을 옮긴다', () => {
    const moved = translateGeometry(g, 0.1, -0.05);
    if (moved.k !== 'ARROW') throw new Error('ARROW');
    const expected = [{ x: 0.2, y: 0.05 }, { x: 0.4, y: 0.45 }, { x: 0.3, y: 0 }];
    expect(moved.points).toHaveLength(3);
    moved.points.forEach((p, i) => {
      expect(p.x).toBeCloseTo(expected[i]!.x, 9);
      expect(p.y).toBeCloseTo(expected[i]!.y, 9);
    });
  });

  it('geometryBounds 는 점 전체를 감싸는 bbox 다 (끝점 2개만이 아니다)', () => {
    const b = geometryBounds(g);
    expect(b.x).toBeCloseTo(0.1, 6);
    expect(b.y).toBeCloseTo(0.05, 6); // 중간 점의 y=0.05 가 최소값
    expect(b.w).toBeCloseTo(0.2, 6);
    expect(b.h).toBeCloseTo(0.45, 6);
  });
});

describe('arrowLastLegAngleDeg — 종횡비 보정 각도', () => {
  it('4:1 비종 도면에서도 마지막 구간이 진짜 화면 각도로 나온다', () => {
    // 이미지 4000×1000. 정규화 (0.1,0.1)→(0.2,0.1) 은 화면에서 완전히 수평(0도)이다
    const a = arrowLastLegAngleDeg([{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.1 }], 4000, 1000);
    expect(a).toBeCloseTo(0, 3);
  });

  it('점이 1개뿐이면 null', () => {
    expect(arrowLastLegAngleDeg([{ x: 0.1, y: 0.1 }], 1000, 1000)).toBeNull();
  });
});

describe('defectScreen / hitTest — 화살표는 그린 그대로 렌더·히트된다', () => {
  const DRAWING = { id: 'dw', imageWidth: 1000, imageHeight: 1000 };
  const VP = { zoom: 1, tx: 0, ty: 0 };
  const NONE: Selection = { defectId: null, part: null, markId: null };

  it('MarkScreen.points 가 저장된 꺾은선 그대로 스크린 변환된다', () => {
    const d = defect('a', 1, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.5 }, {
      marks: [{ id: 'a-m0', defectId: 'a', type: 'ARROW', geometry: { k: 'ARROW', points: [{ x: 0.5, y: 0.5 }, { x: 0.7, y: 0.5 }] }, sortOrder: 0 }],
    });
    const screens = buildScreens({ drawing: DRAWING, viewport: VP, defects: [d], globalStyle: GS, preview: null });
    const pts = screens[0]!.marks[0]!.points;
    expect(pts).toEqual([{ x: 500, y: 500 }, { x: 700, y: 500 }]);
  });

  it('꺾인 커넥터의 굴절 지점 근처를 클릭해도 잡힌다', () => {
    const d = defect('a', 1, { x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }, {
      marks: [{
        id: 'a-m0', defectId: 'a', type: 'ARROW',
        geometry: { k: 'ARROW', points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.5 }] },
        sortOrder: 0,
      }],
    });
    const screens = buildScreens({ drawing: DRAWING, viewport: VP, defects: [d], globalStyle: GS, preview: null });
    const hit = hitTest({ x: 500, y: 100 }, screens, NONE);
    expect(hit?.part).toBe('MARK');
    expect(hit?.markId).toBe('a-m0');
  });

  it('커넥터에서 멀리 떨어지면 잡히지 않는다', () => {
    const d = defect('a', 1, { x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, {
      marks: [{ id: 'a-m0', defectId: 'a', type: 'ARROW', geometry: { k: 'ARROW', points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }] }, sortOrder: 0 }],
    });
    const screens = buildScreens({ drawing: DRAWING, viewport: VP, defects: [d], globalStyle: GS, preview: null });
    const hit = hitTest({ x: 300, y: 400 }, screens, NONE);
    expect(hit).toBeNull();
  });

  it('번호가 화살표 끝(마지막 점)에서 가까우면 일반 리더선은 안 그려진다', () => {
    const d = defect('a', 1, { x: 0.1, y: 0.1 }, { x: 0.301, y: 0.1 }, {
      marks: [{ id: 'a-m0', defectId: 'a', type: 'ARROW', geometry: { k: 'ARROW', points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 }] }, sortOrder: 0 }],
      label: { defectId: 'a', x: 0.301, y: 0.1, anchorMarkId: 'a-m0', placed: true },
    });
    const screens = buildScreens({ drawing: DRAWING, viewport: VP, defects: [d], globalStyle: GS, preview: null });
    expect(leaderSegment(screens[0]!)).toBeNull();
  });

  it('번호를 화살표 끝에서 멀리 옮기면 일반 리더선이 그 지점부터 새로 이어진다', () => {
    const d = defect('a', 1, { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }, {
      marks: [{ id: 'a-m0', defectId: 'a', type: 'ARROW', geometry: { k: 'ARROW', points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.1 }] }, sortOrder: 0 }],
      label: { defectId: 'a', x: 0.9, y: 0.9, anchorMarkId: 'a-m0', placed: true },
    });
    const screens = buildScreens({ drawing: DRAWING, viewport: VP, defects: [d], globalStyle: GS, preview: null });
    const seg = leaderSegment(screens[0]!);
    expect(seg).not.toBeNull();
    expect(seg!.a).toEqual({ x: 300, y: 100 }); // 화살표의 마지막 점에서 시작
  });
});
