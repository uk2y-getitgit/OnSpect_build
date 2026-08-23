/**
 * F5-1 도곽 — Numdraw 실측 명세(`_workspace/12_수정사항_S3중간.md` §F5-1) 고정.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TITLE_BLOCK,
  ellipsize,
  estimateEm,
  normalizeCols,
  TB_BLOCK_H,
  TB_BORDER_W,
  TB_COL0,
  TB_COL1,
  TB_MARGIN,
  resolveTitleBlock,
  titleBlockOps,
  wrapValue,
  type TitleBlockConfig,
} from '../src/index.js';

const A4 = { w: 1754, h: 1240 };
const VP = { zoom: 1, tx: 0, ty: 0 };

function cfg(over: Partial<TitleBlockConfig> = {}): TitleBlockConfig {
  return { ...DEFAULT_TITLE_BLOCK, projectTitle: '○○아파트', drawingName: '1층 위치도', ...over };
}

describe('실측 기준값', () => {
  it('margin 20 · borderW 1.5 · blockH 68 · col 0.42/0.46', () => {
    expect(TB_MARGIN).toBe(20);
    expect(TB_BORDER_W).toBe(1.5);
    expect(TB_BLOCK_H).toBe(68);
    expect(TB_COL0).toBe(0.42);
    expect(TB_COL1).toBe(0.46);
  });
});

describe('normalizeCols — SCALE 열이 사라지는 것을 막는다', () => {
  it('합이 0.90 이하면 그대로 둔다', () => {
    const r = normalizeCols(0.42, 0.46);
    expect(r.c0).toBeCloseTo(0.42);
    expect(r.c1).toBeCloseTo(0.46);
    expect(r.c2).toBeCloseTo(0.12);
  });

  it('합이 0.90 을 넘으면 col1 을 줄인다', () => {
    const r = normalizeCols(0.6, 0.5);
    expect(r.c0).toBeCloseTo(0.6);
    expect(r.c1).toBeCloseTo(0.3);
    expect(r.c0 + r.c1).toBeLessThanOrEqual(0.9 + 1e-9);
  });

  it('col0 이 지나치게 크면 그 자체를 가둔다', () => {
    const r = normalizeCols(0.99, 0.5);
    expect(r.c0).toBeLessThanOrEqual(0.85);
    expect(r.c1).toBeGreaterThanOrEqual(0.05);
    expect(r.c2).toBeGreaterThan(0);
  });
});

describe('estimateEm / wrapValue / ellipsize', () => {
  it('한글은 1em, 라틴은 0.55em 으로 근사한다', () => {
    expect(estimateEm('가나')).toBeCloseTo(2);
    expect(estimateEm('ab')).toBeCloseTo(1.1);
  });

  it('폭 안에 들어가면 한 줄이다', () => {
    expect(wrapValue('○○아파트', 20)).toEqual(['○○아파트']);
  });

  it('최대 2줄까지 나누고 넘치면 말줄임한다', () => {
    const lines = wrapValue('가나다라 마바사아 자차카타 파하가나 다라마바', 5);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.endsWith('…')).toBe(true);
  });

  it('한 어절이 줄보다 길면 강제로 자른다', () => {
    const lines = wrapValue('가나다라마바사아자차카타파하', 4);
    expect(lines.length).toBeLessThanOrEqual(2);
    for (const l of lines) expect(estimateEm(l)).toBeLessThanOrEqual(4.001);
  });

  it('빈 문자열은 줄이 없다', () => {
    expect(wrapValue('', 10)).toEqual([]);
    expect(wrapValue('   ', 10)).toEqual([]);
  });

  it('ellipsize 는 폭을 넘지 않는다', () => {
    const out = ellipsize('가나다라마바사', 3);
    expect(estimateEm(out)).toBeLessThanOrEqual(3.001);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('resolveTitleBlock — 결측·NaN 을 기본값으로 되돌린다', () => {
  it('null 이면 전부 기본값', () => {
    const r = resolveTitleBlock(null);
    expect(r.col0).toBe(TB_COL0);
    expect(r.tbScale).toBe(1);
    expect(r.scale).toBe('NONE');
  });

  it('NaN·0 은 기본값으로 되돌린다', () => {
    const r = resolveTitleBlock({ tbScale: Number.NaN, valueFontSz: 0 });
    expect(r.tbScale).toBe(1);
    expect(r.valueFontSz).toBe(DEFAULT_TITLE_BLOCK.valueFontSz);
  });
});

describe('titleBlockOps', () => {
  it('enabled=false 면 아무것도 그리지 않는다', () => {
    expect(titleBlockOps(cfg({ enabled: false }), A4, VP)).toEqual([]);
  });

  it('외곽 테두리는 strokeRect(M, M, W-2M, H-2M) 다', () => {
    const ops = titleBlockOps(cfg(), A4, VP);
    const outer = ops[0]!;
    expect(outer.k).toBe('rect');
    if (outer.k !== 'rect') return;
    expect(outer.at).toEqual({ x: 20, y: 20 });
    expect(outer.w).toBe(1754 - 40);
    expect(outer.h).toBe(1240 - 40);
  });

  it('표제란은 외곽 하단에 높이 68 로 붙는다', () => {
    const ops = titleBlockOps(cfg(), A4, VP);
    const block = ops[1]!;
    expect(block.k).toBe('rect');
    if (block.k !== 'rect') return;
    expect(block.h).toBe(68);
    expect(block.at.y).toBe(20 + (1240 - 40) - 68);
  });

  it('세로 구분선 2개가 열 비율 자리에 있다', () => {
    const ops = titleBlockOps(cfg(), A4, VP);
    const lines = ops.filter((o) => o.k === 'line');
    expect(lines).toHaveLength(2);
    const ow = 1754 - 40;
    if (lines[0]!.k === 'line') expect(lines[0]!.a.x).toBeCloseTo(20 + ow * 0.42, 5);
    if (lines[1]!.k === 'line') expect(lines[1]!.a.x).toBeCloseTo(20 + ow * (0.42 + 0.46), 5);
  });

  it('세 칸의 라벨이 전부 나온다', () => {
    const ops = titleBlockOps(cfg(), A4, VP);
    const texts = ops
      .filter((o) => o.k === 'text' || o.k === 'textLeft')
      .map((o) => (o.k === 'text' || o.k === 'textLeft' ? o.text : ''));
    expect(texts).toContain('PROJECT TITLE');
    expect(texts).toContain('DRAWING NAME');
    expect(texts).toContain('SCALE');
    expect(texts).toContain('○○아파트');
    expect(texts).toContain('NONE');
  });

  it('뷰포트 줌·팬을 그대로 따라간다 (도면과 함께 커진다)', () => {
    const ops = titleBlockOps(cfg(), A4, { zoom: 2, tx: 100, ty: 50 });
    const outer = ops[0]!;
    if (outer.k !== 'rect') throw new Error('rect');
    expect(outer.at).toEqual({ x: 100 + 40, y: 50 + 40 });
    expect(outer.w).toBe((1754 - 40) * 2);
  });

  it('tbScale 은 전체를 비례 조정한다', () => {
    const ops = titleBlockOps(cfg({ tbScale: 2 }), A4, VP);
    const block = ops[1]!;
    if (block.k !== 'rect') throw new Error('rect');
    expect(block.h).toBe(136);
  });
});
