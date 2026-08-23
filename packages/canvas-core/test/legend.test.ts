/**
 * F5-2 범례 — Numdraw 실측 명세(§F5-2) + **D8(중립색 + 문자 기호)** 고정.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LEGEND,
  legendLayout,
  legendOps,
  legendSymbol,
  LG_FONT,
  LG_MARGIN,
  LG_PAD_X,
  LG_ROW_H,
  LG_SYM_MIN,
  type LegendConfig,
} from '../src/index.js';

const A4 = { w: 1754, h: 1240 };
const VP = { zoom: 1, tx: 0, ty: 0 };

function cfg(rows: { sym: string; desc: string }[], lgScale = 1): LegendConfig {
  return { ...DEFAULT_LEGEND, lgScale, rows };
}

const ROWS = [
  { sym: '균', desc: '균열' },
  { sym: '박', desc: '박리·박락' },
];

describe('실측 기준값', () => {
  it('font 12 · padX 10 · rowH 24 · margin 30 · symMin 28', () => {
    expect(LG_FONT).toBe(12);
    expect(LG_PAD_X).toBe(10);
    expect(LG_ROW_H).toBe(24);
    expect(LG_MARGIN).toBe(30);
    expect(LG_SYM_MIN).toBe(28);
  });
});

describe('legendSymbol — D8 문자 기호 (색을 만들지 않는다)', () => {
  it('첫 글자를 쓴다', () => {
    expect(legendSymbol('균열', new Set(), 0)).toBe('균');
  });

  it('첫 글자가 겹치면 두 글자로 넓힌다', () => {
    expect(legendSymbol('균열부', new Set(['균']), 1)).toBe('균열');
  });

  it('두 글자까지 겹치면 이름 전체 → 순번 순으로 물러난다', () => {
    expect(legendSymbol('균열', new Set(['균', '균열']), 3)).toBe('4');
  });

  it('빈 이름이면 순번', () => {
    expect(legendSymbol('   ', new Set(), 2)).toBe('3');
  });
});

describe('legendLayout — 우측 상단 정렬', () => {
  it('행이 없으면 배치가 없다', () => {
    expect(legendLayout(cfg([]), A4)).toBeNull();
  });

  it('꺼져 있으면 배치가 없다', () => {
    expect(legendLayout({ ...cfg(ROWS), enabled: false }, A4)).toBeNull();
  });

  it('우측 여백 30px 에 맞춰 오른쪽 끝이 붙는다', () => {
    const L = legendLayout(cfg(ROWS), A4)!;
    expect(L.x + L.w).toBe(A4.w - 30);
    expect(L.y).toBe(30);
  });

  it('높이 = 행수 × rowH', () => {
    expect(legendLayout(cfg(ROWS), A4)!.h).toBe(2 * 24);
  });

  it('기호열은 최소 폭 + 좌우 padX 이상이다', () => {
    const L = legendLayout(cfg(ROWS), A4)!;
    expect(L.symW).toBeGreaterThanOrEqual(28 + 10 * 2);
  });

  it('lgScale 이 전체를 비례 조정한다', () => {
    const a = legendLayout(cfg(ROWS, 1), A4)!;
    const b = legendLayout(cfg(ROWS, 2), A4)!;
    expect(b.rowH).toBe(a.rowH * 2);
    expect(b.fontSize).toBe(a.fontSize * 2);
    expect(b.w).toBeGreaterThan(a.w);
  });

  it('설명이 길수록 상자가 넓어진다', () => {
    const short = legendLayout(cfg([{ sym: '균', desc: '균열' }]), A4)!;
    const long = legendLayout(cfg([{ sym: '균', desc: '균열 및 백태·누수 흔적' }]), A4)!;
    expect(long.w).toBeGreaterThan(short.w);
    expect(long.x).toBeLessThan(short.x); // 오른쪽 끝은 그대로, 왼쪽으로 자란다
  });
});

describe('legendOps', () => {
  it('행이 없으면 아무것도 그리지 않는다', () => {
    expect(legendOps(cfg([]), A4, VP)).toEqual([]);
  });

  it('배경 + 열 구분선 1개 + 행 구분선(n-1)개', () => {
    const ops = legendOps(cfg(ROWS), A4, VP);
    expect(ops.filter((o) => o.k === 'rect')).toHaveLength(1);
    // 열 구분선 1 + 행 구분선 1 = 2
    expect(ops.filter((o) => o.k === 'line')).toHaveLength(2);
  });

  it('기호는 가운데, 설명은 좌측 정렬로 나간다', () => {
    const ops = legendOps(cfg(ROWS), A4, VP);
    const syms = ops.filter((o) => o.k === 'text').map((o) => (o.k === 'text' ? o.text : ''));
    const descs = ops
      .filter((o) => o.k === 'textLeft')
      .map((o) => (o.k === 'textLeft' ? o.text : ''));
    expect(syms).toEqual(['균', '박']);
    expect(descs).toEqual(['균열', '박리·박락']);
  });

  it('D8 — 어떤 op 도 결함 상태색(빨강·보라)을 쓰지 않는다', () => {
    const ops = legendOps(cfg(ROWS), A4, VP);
    const json = JSON.stringify(ops).toLowerCase();
    expect(json).not.toContain('#e5342a');
    expect(json).not.toContain('#7c4dff');
  });

  it('뷰포트 줌·팬을 그대로 따라간다', () => {
    const ops = legendOps(cfg(ROWS), A4, { zoom: 2, tx: 40, ty: 10 });
    const box = ops[0]!;
    if (box.k !== 'rect') throw new Error('rect');
    const L = legendLayout(cfg(ROWS), A4)!;
    expect(box.at).toEqual({ x: 40 + L.x * 2, y: 10 + L.y * 2 });
    expect(box.w).toBe(L.w * 2);
  });
});
