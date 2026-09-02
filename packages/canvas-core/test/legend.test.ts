/**
 * F5-2 범례 — Numdraw 실측 명세(§F5-2) 기준값 + **D15 상태 범례**.
 *
 * ⚠️ **U-3 (2026-09-02) — 결함유형 범례가 사라졌다.** 문자 기호 행(`rows`)·`legendSymbol`
 * 을 검증하던 케이스는 기능과 함께 지웠다. 범례에 남은 것은 상태 행 하나뿐이다.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LEGEND,
  legendLayout,
  legendOps,
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

function cfg(status: LegendStatusRow[] = [], lgScale = 1): LegendConfig {
  return { ...DEFAULT_LEGEND, lgScale, statusRows: status };
}

const STATUS2: LegendStatusRow[] = [
  { color: STATUS_COLOR.CURRENT, desc: STATUS_LEGEND_LABEL.CURRENT },
  { color: STATUS_COLOR.REPAIRED, desc: STATUS_LEGEND_LABEL.REPAIRED },
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

/** U-3 — 도면 위 좁은 표라 회차 괄호를 뺐다. 상태 셀렉터 라벨과 **일부러 다르다** */
describe('STATUS_LEGEND_LABEL — U-3 축약 문구', () => {
  it('신규 · 결함 · 보수완료', () => {
    expect(STATUS_LEGEND_LABEL).toEqual({
      CURRENT: '신규',
      PREV_PENDING: '결함',
      REPAIRED: '보수완료',
    });
  });
});

describe('legendLayout — 우측 상단 정렬', () => {
  it('행이 없으면 배치가 없다', () => {
    expect(legendLayout(cfg([]), A4)).toBeNull();
  });

  it('꺼져 있으면 배치가 없다', () => {
    expect(legendLayout({ ...cfg(STATUS2), enabled: false }, A4)).toBeNull();
  });

  it('우측 여백 30px 에 맞춰 오른쪽 끝이 붙는다', () => {
    const L = legendLayout(cfg(STATUS2), A4)!;
    expect(L.x + L.w).toBe(A4.w - 30);
    expect(L.y).toBe(30);
  });

  it('높이 = 행수 × rowH', () => {
    expect(legendLayout(cfg(STATUS2), A4)!.h).toBe(2 * 24);
    expect(legendLayout(cfg(STATUS2), A4)!.statusCount).toBe(2);
  });

  it('기호열은 최소 폭 + 좌우 padX 이상이다', () => {
    const L = legendLayout(cfg(STATUS2), A4)!;
    expect(L.symW).toBeGreaterThanOrEqual(28 + 10 * 2);
  });

  it('lgScale 이 전체를 비례 조정한다', () => {
    const a = legendLayout(cfg(STATUS2, 1), A4)!;
    const b = legendLayout(cfg(STATUS2, 2), A4)!;
    expect(b.rowH).toBe(a.rowH * 2);
    expect(b.fontSize).toBe(a.fontSize * 2);
    expect(b.w).toBeGreaterThan(a.w);
  });

  it('설명이 길수록 상자가 넓어진다', () => {
    const short = legendLayout(cfg([{ color: STATUS_COLOR.CURRENT, desc: '신규' }]), A4)!;
    const long = legendLayout(
      cfg([{ color: STATUS_COLOR.CURRENT, desc: '신규 및 백태·누수 흔적' }]),
      A4,
    )!;
    expect(long.w).toBeGreaterThan(short.w);
    expect(long.x).toBeLessThan(short.x); // 오른쪽 끝은 그대로, 왼쪽으로 자란다
  });
});

/**
 * D15 §5-2 — 상태 범례.
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

  it('켠 것 중 실제로 있는 것만, 항상 신규 → 결함 → 보수완료 순', () => {
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
    expect(statusRows({ ...ALL_OFF, statusRepaired: true }, defects).map((r) => r.desc)).toEqual([
      STATUS_LEGEND_LABEL.REPAIRED,
    ]);
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

describe('legendOps', () => {
  it('행이 없으면 아무것도 그리지 않는다', () => {
    expect(legendOps(cfg([]), A4, VP)).toEqual([]);
  });

  it('배경 + 열 구분선 1개 + 행 구분선(n-1)개', () => {
    const ops = legendOps(cfg(STATUS2), A4, VP);
    expect(ops.filter((o) => o.k === 'rect')).toHaveLength(1);
    // 열 구분선 1 + 행 구분선 1 = 2
    expect(ops.filter((o) => o.k === 'line')).toHaveLength(2);
  });

  it('U-3 — 문자 기호 행이 사라져 가운데 정렬 텍스트가 없다', () => {
    const ops = legendOps(cfg(STATUS2), A4, VP);
    expect(ops.filter((o) => o.k === 'text')).toHaveLength(0);
  });

  it('행 구분선은 전부 같은 굵기다 (블록 경계 굵은 선이 없다)', () => {
    const widths = legendOps(cfg(STATUS2), A4, VP)
      .filter((o) => o.k === 'line')
      .map((o) => (o.k === 'line' ? o.width : 0));
    expect(new Set(widths).size).toBe(1);
  });

  it('상태 행마다 그 색으로 채운 원 1개', () => {
    const ops = legendOps(cfg(STATUS2), A4, VP);
    const circles = ops.filter((o) => o.k === 'circle');
    expect(circles).toHaveLength(2);
    expect(circles.map((o) => (o.k === 'circle' ? o.fill : ''))).toEqual([
      STATUS_COLOR.CURRENT,
      STATUS_COLOR.REPAIRED,
    ]);
  });

  it('상태 설명 문구가 설명열에 좌측 정렬로 나간다', () => {
    const descs = legendOps(cfg(STATUS2), A4, VP)
      .filter((o) => o.k === 'textLeft')
      .map((o) => (o.k === 'textLeft' ? o.text : ''));
    expect(descs).toEqual([STATUS_LEGEND_LABEL.CURRENT, STATUS_LEGEND_LABEL.REPAIRED]);
  });

  it('첫 행이 상자 맨 위에서 시작한다 — 위에 빈 블록이 남지 않는다', () => {
    const L = legendLayout(cfg(STATUS2), A4)!;
    const first = legendOps(cfg(STATUS2), A4, VP).find((o) => o.k === 'circle');
    if (first?.k !== 'circle') throw new Error('circle');
    expect(first.c.y).toBe(L.y + L.rowH / 2);
  });

  it('뷰포트 줌·팬을 그대로 따라간다', () => {
    const ops = legendOps(cfg(STATUS2), A4, { zoom: 2, tx: 40, ty: 10 });
    const box = ops[0]!;
    if (box.k !== 'rect') throw new Error('rect');
    const L = legendLayout(cfg(STATUS2), A4)!;
    expect(box.at).toEqual({ x: 40 + L.x * 2, y: 10 + L.y * 2 });
    expect(box.w).toBe(L.w * 2);
  });
});
