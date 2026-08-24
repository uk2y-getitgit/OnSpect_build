/**
 * F1 `[A4로 맞추기]` — 좌표 일괄 변환.
 *
 * **실사용자 데이터의 좌표를 바꾸는 조작**이라 여기서 고정하는 것은 두 가지다:
 *   1. 결함·메모의 **모든** 좌표 필드가 빠짐없이 옮겨지는가
 *   2. 왕복 변환이 원위치로 돌아오는가 (되돌리기의 근거)
 */
import { describe, expect, it } from 'vitest';
import {
  IDENTITY_TRANSFORM,
  invertTransform,
  mapPoint,
  mapSize,
  transformDefect,
  transformMemo,
  type Memo,
  type NormTransform,
} from '../src/index.js';
import { defect } from './helpers.js';

// 4000×800 원본을 A4 가로에 넣었을 때와 비슷한 계수 (여백이 위아래로 크게 남는 경우)
const T: NormTransform = { ox: 0.0336, oy: 0.2, sx: 0.9327, sy: 0.264 };

function inkMemo(): Memo {
  return {
    id: 'm1',
    projectId: 'p',
    drawingId: 'dw',
    floorId: 'f',
    pos: { x: 0.2, y: 0.3 },
    text: '',
    paths: [{ id: 'p1', points: [{ x: 0.2, y: 0.3 }, { x: 0.4, y: 0.5 }], width: 3 }],
    style: null,
    createdAt: 1,
    updatedAt: 1,
    deviceId: 'dev',
    createdBy: null,
  };
}

describe('mapPoint / mapSize', () => {
  it('위치는 오프셋 + 배율', () => {
    expect(mapPoint({ x: 0.5, y: 0.5 }, T)).toEqual({
      x: Math.round((0.0336 + 0.5 * 0.9327) * 1e6) / 1e6,
      y: Math.round((0.2 + 0.5 * 0.264) * 1e6) / 1e6,
    });
  });

  it('크기는 배율만 — 오프셋이 더해지면 도형이 커진다', () => {
    expect(mapSize({ x: 0.5, y: 0.5 }, T)).toEqual({
      x: Math.round(0.5 * 0.9327 * 1e6) / 1e6,
      y: Math.round(0.5 * 0.264 * 1e6) / 1e6,
    });
  });

  it('항등 변환은 아무것도 바꾸지 않는다', () => {
    expect(mapPoint({ x: 0.42, y: 0.17 }, IDENTITY_TRANSFORM)).toEqual({ x: 0.42, y: 0.17 });
  });
});

describe('invertTransform — 되돌리기의 근거', () => {
  it('왕복 변환은 원위치로 돌아온다 (저장 정밀도 6자리 안에서)', () => {
    const inv = invertTransform(T);
    for (const p of [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 0.123456, y: 0.987654 },
      { x: -0.4, y: 1.4 }, // 라벨은 [0,1] 밖으로 나갈 수 있다
    ]) {
      const back = mapPoint(mapPoint(p, T), inv);
      expect(back.x).toBeCloseTo(p.x, 5);
      expect(back.y).toBeCloseTo(p.y, 5);
    }
  });

  it('역변환의 역변환은 원래 계수다', () => {
    const back = invertTransform(invertTransform(T));
    expect(back.ox).toBeCloseTo(T.ox, 10);
    expect(back.sx).toBeCloseTo(T.sx, 10);
    expect(back.oy).toBeCloseTo(T.oy, 10);
    expect(back.sy).toBeCloseTo(T.sy, 10);
  });
});

describe('transformDefect — 좌표를 하나도 빠뜨리지 않는다', () => {
  const base = defect('d1', 1, { x: 0.5, y: 0.5 }, { x: 0.6, y: 0.4 }, {
    marks: [
      {
        id: 'm-p',
        defectId: 'd1',
        type: 'POINT',
        geometry: { k: 'POINT', x: 0.5, y: 0.5 },
        sortOrder: 0,
      },
      {
        id: 'm-a',
        defectId: 'd1',
        type: 'ARROW',
        geometry: { k: 'ARROW', points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.2 }] },
        sortOrder: 1,
      },
      {
        id: 'm-r',
        defectId: 'd1',
        type: 'AREA_RECT',
        geometry: { k: 'AREA_RECT', x: 0.2, y: 0.2, w: 0.4, h: 0.3 },
        sortOrder: 2,
      },
    ],
    sketch: [{ id: 's1', points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }], width: 3 }],
  });

  it('마크 · 라벨 · 자유그리기가 모두 바뀐다', () => {
    const out = transformDefect(base, T);
    expect(out.marks[0]!.geometry).not.toEqual(base.marks[0]!.geometry);
    expect(out.marks[1]!.geometry).not.toEqual(base.marks[1]!.geometry);
    expect(out.marks[2]!.geometry).not.toEqual(base.marks[2]!.geometry);
    expect({ x: out.label.x, y: out.label.y }).not.toEqual({ x: base.label.x, y: base.label.y });
    expect(out.sketch[0]!.points[0]).not.toEqual(base.sketch[0]!.points[0]);
  });

  it('영역의 크기는 배율만 먹는다 (위치와 다른 식)', () => {
    const g = transformDefect(base, T).marks[2]!.geometry;
    if (g.k !== 'AREA_RECT') throw new Error('AREA_RECT');
    expect(g.w).toBeCloseTo(0.4 * T.sx, 5);
    expect(g.h).toBeCloseTo(0.3 * T.sy, 5);
    expect(g.x).toBeCloseTo(T.ox + 0.2 * T.sx, 5);
  });

  it('좌표가 아닌 것(속성 · 상태 · id · seq)은 건드리지 않는다', () => {
    const out = transformDefect(base, T);
    expect(out.id).toBe(base.id);
    expect(out.seq).toBe(base.seq);
    expect(out.status).toBe(base.status);
    expect(out.defectTypeName).toBe(base.defectTypeName);
    expect(out.widthMm).toBe(base.widthMm);
    expect(out.style).toBe(base.style);
  });

  it('왕복하면 원래 좌표로 돌아온다', () => {
    const back = transformDefect(transformDefect(base, T), invertTransform(T));
    const g0 = back.marks[0]!.geometry;
    if (g0.k !== 'POINT') throw new Error('POINT');
    expect(g0.x).toBeCloseTo(0.5, 5);
    expect(back.label.x).toBeCloseTo(base.label.x, 5);
    expect(back.sketch[0]!.points[1]!.y).toBeCloseTo(0.4, 5);
  });
});

describe('transformMemo', () => {
  it('앵커와 필기 획이 함께 움직인다', () => {
    const m = inkMemo();
    const out = transformMemo(m, T);
    expect(out.pos).toEqual(mapPoint(m.pos, T));
    expect(out.paths![0]!.points[0]).toEqual(mapPoint(m.paths![0]!.points[0]!, T));
  });

  it('옛 텍스트 메모(paths=null)도 앵커는 옮긴다', () => {
    const m = { ...inkMemo(), paths: null, text: '누수' };
    const out = transformMemo(m, T);
    expect(out.paths).toBeNull();
    expect(out.pos).toEqual(mapPoint(m.pos, T));
    expect(out.text).toBe('누수');
  });

  it('왕복하면 원위치', () => {
    const m = inkMemo();
    const back = transformMemo(transformMemo(m, T), invertTransform(T));
    expect(back.pos.x).toBeCloseTo(m.pos.x, 5);
    expect(back.paths![0]!.points[1]!.y).toBeCloseTo(0.5, 5);
  });
});
