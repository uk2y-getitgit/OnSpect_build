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
  statusRows,
  STATUS_COLOR,
  STATUS_LEGEND_LABEL,
  type LegendConfig,
  type LegendStatusRow,
} from '../src/index.js';

const A4 = { w: 1754, h: 1240 };
const VP = { zoom: 1, tx: 0, ty: 0 };

function cfg(
  rows: { sym: string; desc: string }[],
  lgScale = 1,
  status: LegendStatusRow[] = [],
): LegendConfig {
  return { ...DEFAULT_LEGEND, lgScale, rows, statusRows: status };
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

/**
 * D15 §5-2 — 상태 범례. 결함유형 범례(D8)와 **별개 블록**이다.
 *
 * ⭐ 이 파일이 지키는 가장 중요한 것: **켜져 있어도 그 도면에 없는 상태는 안 그린다.**
 *    범례는 "이 도면의 이 색이 무슨 뜻인가"를 설명하는 표다 — 없는 색을 설명하면 거짓말이 된다.
 */
const ALL_ON = { statusNew: true, statusPending: true, statusRepaired: true };
const ALL_OFF = { statusNew: false, statusPending: false, statusRepaired: false };

describe('statusRows — 켜져 있어도 없는 상태는 그리지 않는다', () => {
  it('기본(전부 꺼짐)이면 빈 배열 — 기존 출력물이 한 글자도 안 바뀐다', () => {
    expect(statusRows(ALL_OFF, [{ status: 'CURRENT' }, { status: 'REPAIRED' }])).toEqual([]);
  });

  it('⭐ 켜져 있어도 그 상태의 결함이 없으면 행이 안 생긴다', () => {
    const rows = statusRows(ALL_ON, [{ status: 'CURRENT' }]);
    expect(rows.map((r) => r.desc)).toEqual([STATUS_LEGEND_LABEL.CURRENT]);
  });

  it('결함이 하나도 없으면 전부 켜도 빈 배열', () => {
    expect(statusRows(ALL_ON, [])).toEqual([]);
  });

  it('켠 것 중 실제로 있는 것만, 항상 신규 → 미보수 → 보수완료 순', () => {
    const defects = [
      { status: 'REPAIRED' as const },
      { status: 'CURRENT' as const },
      { status: 'PREV_PENDING' as const },
    ];
    expect(statusRows(ALL_ON, defects).map((r) => r.desc)).toEqual([
      STATUS_LEGEND_LABEL.CURRENT,
      STATUS_LEGEND_LABEL.PREV_PENDING,
      STATUS_LEGEND_LABEL.REPAIRED,
    ]);
    // 끈 것은 있어도 안 나온다
    expect(
      statusRows({ ...ALL_OFF, statusRepaired: true }, defects).map((r) => r.desc),
    ).toEqual([STATUS_LEGEND_LABEL.REPAIRED]);
  });

  it('예약색을 그대로 쓴다 (빨강 · 보라 · 회색)', () => {
    const rows = statusRows(ALL_ON, [
      { status: 'CURRENT' },
      { status: 'PREV_PENDING' },
      { status: 'REPAIRED' },
    ]);
    expect(rows.map((r) => r.color)).toEqual([
      STATUS_COLOR.CURRENT,
      STATUS_COLOR.PREV_PENDING,
      STATUS_COLOR.REPAIRED,
    ]);
  });

  it('중복 상태가 여러 건이어도 행은 1개', () => {
    const rows = statusRows(ALL_ON, [{ status: 'CURRENT' }, { status: 'CURRENT' }]);
    expect(rows).toHaveLength(1);
  });
});

const STATUS2: LegendStatusRow[] = [
  { color: STATUS_COLOR.CURRENT, desc: STATUS_LEGEND_LABEL.CURRENT },
  { color: STATUS_COLOR.REPAIRED, desc: STATUS_LEGEND_LABEL.REPAIRED },
];

describe('legendLayout — 상태 블록 포함', () => {
  it('결함유형 행이 0이어도 상태 행이 있으면 그린다', () => {
    const L = legendLayout(cfg([], 1, STATUS2), A4)!;
    expect(L).not.toBeNull();
    expect(L.h).toBe(2 * 24);
    expect(L.typeCount).toBe(0);
    expect(L.statusCount).toBe(2);
  });

  it('둘 다 비면 그리지 않는다', () => {
    expect(legendLayout(cfg([], 1, []), A4)).toBeNull();
  });

  it('꺼져 있으면 상태 행이 있어도 그리지 않는다', () => {
    expect(legendLayout({ ...cfg([], 1, STATUS2), enabled: false }, A4)).toBeNull();
  });

  it('높이 = (결함유형 + 상태) 행수 × rowH', () => {
    expect(legendLayout(cfg(ROWS, 1, STATUS2), A4)!.h).toBe(4 * 24);
  });

  it('상태 설명이 길면 상자가 넓어진다 (오른쪽 끝은 그대로)', () => {
    const a = legendLayout(cfg(ROWS), A4)!;
    const b = legendLayout(cfg(ROWS, 1, STATUS2), A4)!;
    expect(b.w).toBeGreaterThan(a.w);
    expect(b.x + b.w).toBe(A4.w - 30);
  });
});

describe('legendOps — 상태 블록', () => {
  it('상태 행마다 그 색으로 채운 원 1개', () => {
    const ops = legendOps(cfg(ROWS, 1, STATUS2), A4, VP);
    const circles = ops.filter((o) => o.k === 'circle');
    expect(circles).toHaveLength(2);
    expect(circles.map((o) => (o.k === 'circle' ? o.fill : ''))).toEqual([
      STATUS_COLOR.CURRENT,
      STATUS_COLOR.REPAIRED,
    ]);
  });

  it('결함유형 블록과 상태 블록 사이에 구분선이 하나 더 굵게 들어간다', () => {
    const ops = legendOps(cfg(ROWS, 1, STATUS2), A4, VP);
    const lines = ops.filter((o) => o.k === 'line');
    // 열 구분선 1 + 행 구분선 3(4행이므로) = 4
    expect(lines).toHaveLength(4);
    const widths = lines.map((o) => (o.k === 'line' ? o.width : 0));
    // 두 블록 경계선 하나만 두껍다
    expect(widths.filter((w) => w === Math.max(...widths))).toHaveLength(1);
  });

  it('결함유형 행이 없으면 경계 굵은 선도 없다', () => {
    const ops = legendOps(cfg([], 1, STATUS2), A4, VP);
    const widths = ops.filter((o) => o.k === 'line').map((o) => (o.k === 'line' ? o.width : 0));
    expect(new Set(widths).size).toBe(1);
  });

  it('상태 설명 문구가 설명열에 나간다', () => {
    const ops = legendOps(cfg(ROWS, 1, STATUS2), A4, VP);
    const descs = ops
      .filter((o) => o.k === 'textLeft')
      .map((o) => (o.k === 'textLeft' ? o.text : ''));
    expect(descs).toEqual([
      '균열',
      '박리·박락',
      STATUS_LEGEND_LABEL.CURRENT,
      STATUS_LEGEND_LABEL.REPAIRED,
    ]);
  });

  it('상태 행은 결함유형 행 **아래**에 온다', () => {
    const L = legendLayout(cfg(ROWS, 1, STATUS2), A4)!;
    const ops = legendOps(cfg(ROWS, 1, STATUS2), A4, VP);
    const firstCircle = ops.find((o) => o.k === 'circle');
    if (firstCircle?.k !== 'circle') throw new Error('circle');
    expect(firstCircle.c.y).toBeGreaterThan(L.y + L.typeCount * L.rowH);
  });

  it('D8 은 그대로다 — 상태 행이 없으면 어떤 op 도 예약색을 쓰지 않는다', () => {
    const json = JSON.stringify(legendOps(cfg(ROWS), A4, VP)).toLowerCase();
    expect(json).not.toContain('#e5342a');
    expect(json).not.toContain('#7c4dff');
  });
});
