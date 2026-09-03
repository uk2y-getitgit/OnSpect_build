/**
 * P-2 — 번호 풍선 **직교 정렬** (2026-09-03 재작성).
 *
 * 회귀 위험 세 가지를 고정한다:
 *  ① **실제로 줄이 선다** — 이전 절대격자 판은 칸이 풍선 하나 크기라 거의 안 움직였다
 *  ② **결정성** — 같은 입력이면 언제나 같은 그림. 두 번 눌러 결과가 달라지면 보고서 재현이 깨진다
 *  ③ **종횡비** — 가로·세로 허용오차를 따로 받는다
 */
import { describe, expect, it } from 'vitest';
import {
  alignLabelsOrthogonal,
  applyCommand,
  invertCommand,
  labelAlignGapImgPx,
  labelAlignToleranceImgPx,
  LABEL_ALIGN_TOLERANCE_FACTOR,
  type Command,
  type LabelGridItem,
} from '../src/index.js';
import { defect } from './helpers.js';

const TOL = 0.05;
const GAP = 0.06;

describe('alignLabelsOrthogonal — 줄 맞추기', () => {
  it('조금씩 어긋난 x 들이 **하나의 세로줄**로 모인다 — 이것이 "직교" 다', () => {
    const out = alignLabelsOrthogonal(
      [
        { defectId: 'a', x: 0.30, y: 0.10 },
        { defectId: 'b', x: 0.32, y: 0.40 },
        { defectId: 'c', x: 0.31, y: 0.70 },
      ],
      TOL,
      TOL,
      GAP,
    );
    expect(out[0]!.x).toBeCloseTo(out[1]!.x, 12);
    expect(out[1]!.x).toBeCloseTo(out[2]!.x, 12);
    // 평균으로 잡는다 — 한쪽으로 끌려가지 않는다
    expect(out[0]!.x).toBeCloseTo(0.31, 12);
  });

  it('조금씩 어긋난 y 들이 하나의 가로줄로 모인다', () => {
    const out = alignLabelsOrthogonal(
      [
        { defectId: 'a', x: 0.10, y: 0.50 },
        { defectId: 'b', x: 0.40, y: 0.52 },
      ],
      TOL,
      TOL,
      GAP,
    );
    expect(out[0]!.y).toBeCloseTo(out[1]!.y, 12);
  });

  it('멀리 떨어진 것은 다른 줄로 남는다 — 도면 전체가 한 줄로 빨려들지 않는다', () => {
    const out = alignLabelsOrthogonal(
      [
        { defectId: 'a', x: 0.10, y: 0.10 },
        { defectId: 'b', x: 0.90, y: 0.10 },
      ],
      TOL,
      TOL,
      GAP,
    );
    expect(out[0]!.x).not.toBeCloseTo(out[1]!.x, 6);
  });

  it('조금씩 어긋난 값이 사슬처럼 이어져도 덩어리 폭은 허용오차를 안 넘는다', () => {
    // 0.30 · 0.34 · 0.38 · 0.42 — 이웃 간격은 전부 0.04(<0.05) 지만 전체 폭은 0.12
    const out = alignLabelsOrthogonal(
      [
        { defectId: 'a', x: 0.30, y: 0.1 },
        { defectId: 'b', x: 0.34, y: 0.3 },
        { defectId: 'c', x: 0.38, y: 0.5 },
        { defectId: 'd', x: 0.42, y: 0.7 },
      ],
      TOL,
      TOL,
      GAP,
    );
    const lines = new Set(out.map((o) => o.x.toFixed(6)));
    expect(lines.size).toBeGreaterThan(1);
  });

  it('입력 순서를 그대로 지킨다 — 호출자가 인덱스로 짝지을 수 있어야 한다', () => {
    const out = alignLabelsOrthogonal(
      [
        { defectId: 'z', x: 0.9, y: 0.9 },
        { defectId: 'a', x: 0.1, y: 0.1 },
      ],
      TOL,
      TOL,
      GAP,
    );
    expect(out.map((o) => o.defectId)).toEqual(['z', 'a']);
  });

  it('같은 자리로 겹친 둘은 세로줄을 유지한 채 아래로 밀린다', () => {
    const out = alignLabelsOrthogonal(
      [
        { defectId: 'a', x: 0.5, y: 0.5 },
        { defectId: 'b', x: 0.51, y: 0.5 },
      ],
      TOL,
      TOL,
      GAP,
    );
    expect(out[0]!.x).toBeCloseTo(out[1]!.x, 12); // 같은 세로줄
    expect(Math.abs(out[0]!.y - out[1]!.y)).toBeCloseTo(GAP, 12); // 겹치지 않는다
  });

  it('결정적이다 — 같은 입력을 두 번 넣으면 같은 결과', () => {
    const input: LabelGridItem[] = [
      { defectId: 'c', x: 0.5, y: 0.5 },
      { defectId: 'a', x: 0.5, y: 0.5 },
      { defectId: 'b', x: 0.5, y: 0.5 },
    ];
    expect(alignLabelsOrthogonal(input, TOL, TOL, GAP)).toEqual(
      alignLabelsOrthogonal(input, TOL, TOL, GAP),
    );
  });

  it('한 번 정렬한 결과를 다시 정렬해도 그대로다 (멱등)', () => {
    const input: LabelGridItem[] = [
      { defectId: 'a', x: 0.30, y: 0.10 },
      { defectId: 'b', x: 0.32, y: 0.40 },
      { defectId: 'c', x: 0.31, y: 0.70 },
    ];
    const once = alignLabelsOrthogonal(input, TOL, TOL, GAP);
    expect(alignLabelsOrthogonal(once, TOL, TOL, GAP)).toEqual(once);
  });

  it('가로·세로 허용오차를 따로 쓴다 (종횡비 보정)', () => {
    const out = alignLabelsOrthogonal(
      [
        { defectId: 'a', x: 0.30, y: 0.30 },
        { defectId: 'b', x: 0.34, y: 0.34 },
      ],
      0.1, // x 는 넉넉 → 같은 세로줄
      0.01, // y 는 빡빡 → 다른 가로줄
      GAP,
    );
    expect(out[0]!.x).toBeCloseTo(out[1]!.x, 12);
    expect(out[0]!.y).not.toBeCloseTo(out[1]!.y, 6);
  });

  it('허용오차가 0 이하면 아무것도 안 옮긴다 (도면 크기를 아직 모를 때)', () => {
    const input = [{ defectId: 'a', x: 0.123, y: 0.456 }];
    expect(alignLabelsOrthogonal(input, 0, TOL, GAP)).toEqual(input);
    expect(alignLabelsOrthogonal(input, TOL, -1, GAP)).toEqual(input);
  });

  it('허용오차는 풍선 지름 — 새 저장 필드가 필요 없는 이유', () => {
    expect(labelAlignToleranceImgPx(34)).toBe(34 * LABEL_ALIGN_TOLERANCE_FACTOR);
    // 미는 간격은 지름보다 넓어야 테두리가 안 닿는다
    expect(labelAlignGapImgPx(34)).toBeGreaterThan(labelAlignToleranceImgPx(34));
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
