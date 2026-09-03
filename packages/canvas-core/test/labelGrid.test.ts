/**
 * P-2 — 번호 풍선 정렬 (2026-09-03 2차 재작성).
 *
 * 사용자 지시: *"지시점과 번호간 직교가 우선. 그다음 가까운 번호와 같은선상에 정렬"*
 *
 * 회귀 위험을 고정한다:
 *  ① **지시선이 수평이거나 수직이다** — 1순위. 2순위(줄 맞추기)가 이걸 깨면 안 된다
 *  ② **결정성** — 두 번 눌러 결과가 달라지면 보고서 재현이 깨진다
 *  ③ 번호가 지시점을 덮지 않는다
 */
import { describe, expect, it } from 'vitest';
import {
  alignLabelsToAnchors,
  applyCommand,
  invertCommand,
  labelAlignOptionsFor,
  LABEL_ALIGN_TOLERANCE_FACTOR,
  type Command,
  type LabelAnchorItem,
} from '../src/index.js';
import { defect } from './helpers.js';

const OPTS = { tol: 20, minOffset: 30, gap: 25 };
const item = (
  id: string,
  label: { x: number; y: number },
  anchor: { x: number; y: number } | null,
): LabelAnchorItem => ({ defectId: id, label, anchor });

/** 지시선이 수평이거나 수직인가 */
const isOrthogonal = (
  out: { x: number; y: number },
  anchor: { x: number; y: number },
): boolean => Math.abs(out.x - anchor.x) < 1e-9 || Math.abs(out.y - anchor.y) < 1e-9;

describe('1순위 — 지시점과 번호가 직교한다', () => {
  it('세로가 더 가까우면 번호를 지시점 바로 위/아래에 놓는다 (x 가 같아진다)', () => {
    const a = { x: 100, y: 100 };
    const out = alignLabelsToAnchors([item('a', { x: 118, y: 200 }, a)], OPTS);
    expect(out[0]!.x).toBeCloseTo(100, 9);
    expect(out[0]!.y).toBeGreaterThan(100);
  });

  it('가로가 더 가까우면 번호를 지시점 왼쪽/오른쪽에 놓는다 (y 가 같아진다)', () => {
    const a = { x: 100, y: 100 };
    const out = alignLabelsToAnchors([item('a', { x: 300, y: 112 }, a)], OPTS);
    expect(out[0]!.y).toBeCloseTo(100, 9);
    expect(out[0]!.x).toBeGreaterThan(100);
  });

  it('원래 있던 쪽으로 눕힌다 — 반대편으로 튀어 지시선이 도면을 가로지르지 않는다', () => {
    const a = { x: 200, y: 200 };
    const up = alignLabelsToAnchors([item('a', { x: 205, y: 60 }, a)], OPTS);
    const down = alignLabelsToAnchors([item('b', { x: 205, y: 340 }, a)], OPTS);
    expect(up[0]!.y).toBeLessThan(200);
    expect(down[0]!.y).toBeGreaterThan(200);
  });

  it('번호가 지시점을 덮지 않는다 — 최소 거리가 보장된다', () => {
    const a = { x: 100, y: 100 };
    const out = alignLabelsToAnchors([item('a', { x: 101, y: 103 }, a)], OPTS);
    const d = Math.hypot(out[0]!.x - a.x, out[0]!.y - a.y);
    expect(d).toBeGreaterThanOrEqual(OPTS.minOffset - 1e-9);
  });

  it('마크가 없는 결함은 제자리에 둔다', () => {
    const out = alignLabelsToAnchors([item('a', { x: 123, y: 456 }, null)], OPTS);
    expect(out[0]).toMatchObject({ x: 123, y: 456 });
  });
});

describe('2순위 — 남는 축을 이웃과 맞춘다 (직교를 깨지 않는다)', () => {
  it('세로 지시선끼리는 y 를 맞춰 가로줄이 선다', () => {
    const items = [
      item('a', { x: 100, y: 300 }, { x: 100, y: 100 }),
      item('b', { x: 300, y: 308 }, { x: 300, y: 100 }),
      item('c', { x: 500, y: 295 }, { x: 500, y: 100 }),
    ];
    const out = alignLabelsToAnchors(items, OPTS);
    expect(out[0]!.y).toBeCloseTo(out[1]!.y, 9);
    expect(out[1]!.y).toBeCloseTo(out[2]!.y, 9);
    // 그러면서도 x 는 각자의 지시점에 묶여 있다
    items.forEach((it, i) => expect(isOrthogonal(out[i]!, it.anchor!)).toBe(true));
  });

  it('가로 지시선끼리는 x 를 맞춰 세로줄이 선다', () => {
    const items = [
      item('a', { x: 400, y: 100 }, { x: 100, y: 100 }),
      item('b', { x: 408, y: 300 }, { x: 100, y: 300 }),
    ];
    const out = alignLabelsToAnchors(items, OPTS);
    expect(out[0]!.x).toBeCloseTo(out[1]!.x, 9);
    items.forEach((it, i) => expect(isOrthogonal(out[i]!, it.anchor!)).toBe(true));
  });

  it('방향이 다른 것끼리는 섞이지 않는다 — 무관한 값이 한 줄로 뭉치면 안 된다', () => {
    const vertical = item('v', { x: 100, y: 300 }, { x: 100, y: 100 });
    const horizontal = item('h', { x: 400, y: 305 }, { x: 100, y: 305 });
    const out = alignLabelsToAnchors([vertical, horizontal], OPTS);
    expect(isOrthogonal(out[0]!, vertical.anchor!)).toBe(true);
    expect(isOrthogonal(out[1]!, horizontal.anchor!)).toBe(true);
  });

  it('멀리 떨어진 것은 다른 줄로 남는다', () => {
    const out = alignLabelsToAnchors(
      [
        item('a', { x: 100, y: 200 }, { x: 100, y: 100 }),
        item('b', { x: 300, y: 900 }, { x: 300, y: 100 }),
      ],
      OPTS,
    );
    expect(Math.abs(out[0]!.y - out[1]!.y)).toBeGreaterThan(OPTS.tol);
  });
});

describe('겹침 · 결정성', () => {
  it('같은 자리로 겹치면 자유로운 축으로 밀되 직교는 유지한다', () => {
    const a = { x: 100, y: 100 };
    const items = [item('a', { x: 100, y: 300 }, a), item('b', { x: 100, y: 305 }, a)];
    const out = alignLabelsToAnchors(items, OPTS);
    expect(out[0]!.x).toBeCloseTo(100, 9);
    expect(out[1]!.x).toBeCloseTo(100, 9);
    expect(Math.abs(out[0]!.y - out[1]!.y)).toBeCloseTo(OPTS.gap, 9);
  });

  it('입력 순서를 그대로 지킨다', () => {
    const out = alignLabelsToAnchors(
      [
        item('z', { x: 900, y: 900 }, { x: 900, y: 700 }),
        item('a', { x: 100, y: 300 }, { x: 100, y: 100 }),
      ],
      OPTS,
    );
    expect(out.map((o) => o.defectId)).toEqual(['z', 'a']);
  });

  it('결정적이다 — 같은 입력을 두 번 넣으면 같은 결과', () => {
    const items = [
      item('c', { x: 100, y: 300 }, { x: 100, y: 100 }),
      item('a', { x: 100, y: 300 }, { x: 100, y: 100 }),
      item('b', { x: 100, y: 300 }, { x: 100, y: 100 }),
    ];
    expect(alignLabelsToAnchors(items, OPTS)).toEqual(alignLabelsToAnchors(items, OPTS));
  });

  it('한 번 정렬한 결과를 다시 정렬해도 그대로다 (멱등)', () => {
    const items = [
      item('a', { x: 118, y: 300 }, { x: 100, y: 100 }),
      item('b', { x: 305, y: 308 }, { x: 300, y: 100 }),
    ];
    const once = alignLabelsToAnchors(items, OPTS);
    const again = alignLabelsToAnchors(
      once.map((o, i) => item(o.defectId, { x: o.x, y: o.y }, items[i]!.anchor)),
      OPTS,
    );
    expect(again.map((o) => ({ x: o.x, y: o.y }))).toEqual(once.map((o) => ({ x: o.x, y: o.y })));
  });

  it('허용오차가 0 이하면 아무것도 안 옮긴다 (도면 크기를 아직 모를 때)', () => {
    const items = [item('a', { x: 123, y: 456 }, { x: 100, y: 100 })];
    expect(alignLabelsToAnchors(items, { ...OPTS, tol: 0 })).toEqual([
      { defectId: 'a', x: 123, y: 456 },
    ]);
  });

  it('기준값은 풍선 크기에서 나온다 — 새 저장 필드가 필요 없는 이유', () => {
    const o = labelAlignOptionsFor(34);
    expect(o.tol).toBe(34 * LABEL_ALIGN_TOLERANCE_FACTOR);
    expect(o.minOffset).toBeGreaterThan(o.tol);
    expect(o.gap).toBeGreaterThan(o.tol);
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
