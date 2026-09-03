/**
 * P-2 (D28 · Q71) — 번호 풍선 격자 스냅 정렬.
 *
 * 회귀 위험 두 가지를 고정한다:
 *  ① **결정성** — 같은 입력이면 언제나 같은 그림. 두 번 눌러 결과가 달라지면 보고서 재현이 깨진다
 *  ② **종횡비** — 정규화 공간에서 균등 격자를 만들면 도면이 가로로 길 때 격자가 찌그러진다
 */
import { describe, expect, it } from 'vitest';
import {
  alignLabelsToGrid,
  applyCommand,
  invertCommand,
  labelGridStepImgPx,
  LABEL_GRID_FACTOR,
  type Command,
} from '../src/index.js';
import { defect } from './helpers.js';

describe('alignLabelsToGrid — 격자 스냅', () => {
  it('가장 가까운 격자점으로 옮긴다', () => {
    const out = alignLabelsToGrid([{ defectId: 'a', x: 0.11, y: 0.19 }], 0.1, 0.1);
    expect(out[0]!.x).toBeCloseTo(0.1, 10);
    expect(out[0]!.y).toBeCloseTo(0.2, 10);
  });

  it('입력 순서를 그대로 지킨다 — 호출자가 인덱스로 짝지을 수 있어야 한다', () => {
    const out = alignLabelsToGrid(
      [
        { defectId: 'z', x: 0.9, y: 0.9 },
        { defectId: 'a', x: 0.1, y: 0.1 },
      ],
      0.1,
      0.1,
    );
    expect(out.map((o) => o.defectId)).toEqual(['z', 'a']);
  });

  it('stepX 와 stepY 가 다르면 각 축을 따로 스냅한다 (종횡비 보정)', () => {
    const out = alignLabelsToGrid([{ defectId: 'a', x: 0.26, y: 0.26 }], 0.5, 0.1);
    expect(out[0]!.x).toBeCloseTo(0.5, 10);
    expect(out[0]!.y).toBeCloseTo(0.3, 10);
  });

  it('같은 칸으로 반올림되는 둘은 겹치지 않는다', () => {
    const out = alignLabelsToGrid(
      [
        { defectId: 'a', x: 0.5, y: 0.5 },
        { defectId: 'b', x: 0.51, y: 0.5 },
      ],
      0.1,
      0.1,
    );
    expect(`${out[0]!.x},${out[0]!.y}`).not.toBe(`${out[1]!.x},${out[1]!.y}`);
  });

  it('결정적이다 — 같은 입력을 두 번 넣으면 같은 결과', () => {
    const input = [
      { defectId: 'c', x: 0.5, y: 0.5 },
      { defectId: 'a', x: 0.5, y: 0.5 },
      { defectId: 'b', x: 0.5, y: 0.5 },
    ];
    expect(alignLabelsToGrid(input, 0.1, 0.1)).toEqual(alignLabelsToGrid(input, 0.1, 0.1));
  });

  it('이미 격자에 맞은 것은 그대로 둔다', () => {
    const out = alignLabelsToGrid([{ defectId: 'a', x: 0.3, y: 0.4 }], 0.1, 0.1);
    expect(out[0]!.x).toBeCloseTo(0.3, 10);
    expect(out[0]!.y).toBeCloseTo(0.4, 10);
  });

  it('간격이 0 이하면 아무것도 안 옮긴다 (도면 크기를 아직 모를 때)', () => {
    const input = [{ defectId: 'a', x: 0.123, y: 0.456 }];
    expect(alignLabelsToGrid(input, 0, 0.1)).toEqual(input);
    expect(alignLabelsToGrid(input, 0.1, -1)).toEqual(input);
  });

  it('격자 간격은 풍선 크기에 비례한다 — 새 저장 필드가 필요 없는 이유', () => {
    expect(labelGridStepImgPx(34)).toBe(34 * LABEL_GRID_FACTOR);
  });
});

describe('ALIGN_LABELS 커맨드 — Undo 1스텝', () => {
  const a = defect('a', 1, { x: 0.2, y: 0.2 }, { x: 0.11, y: 0.11 }, {
    label: { defectId: 'a', x: 0.11, y: 0.11, anchorMarkId: 'a-m0', placed: false },
  });
  const b = defect('b', 2, { x: 0.4, y: 0.4 }, { x: 0.31, y: 0.31 });
  const cmd: Command = {
    k: 'ALIGN_LABELS',
    items: [
      {
        defectId: 'a',
        from: { x: 0.11, y: 0.11 },
        to: { x: 0.1, y: 0.1 },
        fromPlaced: false,
        toPlaced: true,
      },
      {
        defectId: 'b',
        from: { x: 0.31, y: 0.31 },
        to: { x: 0.3, y: 0.3 },
        fromPlaced: true,
        toPlaced: true,
      },
    ],
  };

  it('한 커맨드가 여러 결함의 풍선을 옮긴다', () => {
    const out = applyCommand([a, b], cmd);
    expect(out.find((d) => d.id === 'a')!.label).toMatchObject({ x: 0.1, y: 0.1, placed: true });
    expect(out.find((d) => d.id === 'b')!.label).toMatchObject({ x: 0.3, y: 0.3, placed: true });
  });

  it('되돌리기 한 번으로 위치와 placed 가 모두 복귀한다', () => {
    const moved = applyCommand([a, b], cmd);
    const back = applyCommand(moved, invertCommand(cmd));
    expect(back.find((d) => d.id === 'a')!.label).toMatchObject({
      x: 0.11,
      y: 0.11,
      placed: false,
    });
    expect(back.find((d) => d.id === 'b')!.label).toMatchObject({
      x: 0.31,
      y: 0.31,
      placed: true,
    });
  });

  it('결함점(마크)은 건드리지 않는다', () => {
    const out = applyCommand([a, b], cmd);
    expect(out.find((d) => d.id === 'a')!.marks).toEqual(a.marks);
  });

  it('items 에 없는 결함은 그대로 둔다', () => {
    const c = defect('c', 3, { x: 0.6, y: 0.6 }, { x: 0.6, y: 0.62 });
    const out = applyCommand([a, b, c], cmd);
    expect(out.find((d) => d.id === 'c')!.label).toEqual(c.label);
  });
});
