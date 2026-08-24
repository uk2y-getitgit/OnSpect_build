/**
 * Phase 4-T1 — 출력 번호부여 (§3-1 · 상세기획 §4-3).
 *
 * 이 파일이 지키는 것: **번호는 저장되지 않고 매번 계산되지만, 같은 입력이면 항상 같다.**
 * 여기가 흔들리면 4개 산출물의 번호가 서로 어긋나고 **조용히 틀린다**.
 */
import { describe, expect, it } from 'vitest';
import {
  assignNumbers,
  defaultNumberingParams,
  formatFloorRange,
  type NumberingDefect,
  type NumberingParams,
} from '../src/index.js';

function d(
  id: string,
  floorId: string,
  seq: number,
  over: Partial<NumberingDefect> = {},
): NumberingDefect {
  return {
    id,
    floorId,
    drawingId: `dw-${floorId}`,
    seq,
    status: 'CURRENT',
    surveyKind: 'EXTERIOR',
    ...over,
  };
}

function params(over: Partial<NumberingParams> = {}): NumberingParams {
  return { ...defaultNumberingParams(['f1']), ...over };
}

describe('assignNumbers — 기본', () => {
  it('선택한 층의 결함에 1부터 번호를 매긴다', () => {
    const r = assignNumbers([d('a', 'f1', 1), d('b', 'f1', 2), d('c', 'f1', 3)], params());
    expect(r.rows.map((x) => x.no)).toEqual([1, 2, 3]);
    expect(r.rows.map((x) => x.defectId)).toEqual(['a', 'b', 'c']);
    expect(r.byDefect['b']).toEqual({ no: 2, photoNo: null });
  });

  it('층 목록에 없는 층의 결함은 제외한다', () => {
    const r = assignNumbers([d('a', 'f1', 1), d('z', 'f9', 1)], params());
    expect(r.rows.map((x) => x.defectId)).toEqual(['a']);
    expect(r.excluded).toEqual([{ defectId: 'z', reason: 'FLOOR_NOT_SELECTED' }]);
  });

  it('seq → drawingId → id 순으로 완전 결정론이다 (입력 배열 순서에 기대지 않는다)', () => {
    const set: NumberingDefect[] = [
      d('c', 'f1', 5, { drawingId: 'dw-b' }),
      d('a', 'f1', 5, { drawingId: 'dw-a' }),
      d('b', 'f1', 5, { drawingId: 'dw-b' }),
      d('x', 'f1', 1),
    ];
    const forward = assignNumbers(set, params());
    const backward = assignNumbers([...set].reverse(), params());
    expect(forward.rows.map((x) => x.defectId)).toEqual(['x', 'a', 'b', 'c']);
    expect(backward.rows).toEqual(forward.rows);
  });
});

describe('사진번호 — §4-2 실측 (사진 없는 결함이 중간에 끼면 어긋난다)', () => {
  it('NO 는 연속으로 늘고 사진번호만 건너뛴다', () => {
    const defects = [d('a', 'f1', 1), d('b', 'f1', 2), d('c', 'f1', 3), d('e', 'f1', 4)];
    const r = assignNumbers(defects, params(), {
      hasPhoto: new Set(['a', 'b', 'e']), // c 만 대표사진이 없다
    });
    expect(r.rows.map((x) => x.no)).toEqual([1, 2, 3, 4]);
    expect(r.rows.map((x) => x.photoNo)).toEqual([1, 2, null, 3]);
  });

  it('사진 없는 결함은 warnings.noPhoto 로 알린다 (제외하지 않는다 — D3)', () => {
    const r = assignNumbers([d('a', 'f1', 1), d('c', 'f1', 2)], params(), {
      hasPhoto: new Set(['a']),
    });
    expect(r.warnings.noPhoto).toEqual(['c']);
    expect(r.rows).toHaveLength(2);
  });
});

describe('번호 모드', () => {
  const defects = [
    d('a', 'f1', 1),
    d('b', 'f1', 2),
    d('c', 'f2', 1),
    d('e', 'f2', 2),
    d('f', 'f2', 3),
  ];

  it('CONTINUOUS — 층이 바뀌어도 이어서 센다', () => {
    const r = assignNumbers(defects, params({ floorIds: ['f1', 'f2'], mode: 'CONTINUOUS' }));
    expect(r.rows.map((x) => x.no)).toEqual([1, 2, 3, 4, 5]);
    expect(r.floorRanges).toEqual([
      { floorId: 'f1', count: 2, from: 1, to: 2 },
      { floorId: 'f2', count: 3, from: 3, to: 5 },
    ]);
  });

  it('PER_FLOOR — 층마다 1번부터', () => {
    const r = assignNumbers(defects, params({ floorIds: ['f1', 'f2'], mode: 'PER_FLOOR' }));
    expect(r.rows.map((x) => x.no)).toEqual([1, 2, 1, 2, 3]);
    expect(r.floorRanges).toEqual([
      { floorId: 'f1', count: 2, from: 1, to: 2 },
      { floorId: 'f2', count: 3, from: 1, to: 3 },
    ]);
  });

  it('K6 — PER_FLOOR 면 사진번호도 층마다 1부터', () => {
    const r = assignNumbers(defects, params({ floorIds: ['f1', 'f2'], mode: 'PER_FLOOR' }), {
      hasPhoto: new Set(['a', 'b', 'c', 'e', 'f']),
    });
    expect(r.rows.map((x) => x.photoNo)).toEqual([1, 2, 1, 2, 3]);
  });

  it('CONTINUOUS 면 사진번호도 이어서 센다', () => {
    const r = assignNumbers(defects, params({ floorIds: ['f1', 'f2'], mode: 'CONTINUOUS' }), {
      hasPhoto: new Set(['a', 'b', 'c', 'e', 'f']),
    });
    expect(r.rows.map((x) => x.photoNo)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('층 순서 = 출력 순서 (§4-4)', () => {
  const defects = [d('a', 'f1', 1), d('c', 'f2', 1)];

  it('칩을 누른 순서를 바꾸면 번호가 바뀐다', () => {
    const asc = assignNumbers(defects, params({ floorIds: ['f1', 'f2'] }));
    const desc = assignNumbers(defects, params({ floorIds: ['f2', 'f1'] }));
    expect(asc.byDefect['a']?.no).toBe(1);
    expect(desc.byDefect['a']?.no).toBe(2);
    expect(desc.rows.map((x) => x.defectId)).toEqual(['c', 'a']);
  });

  it('같은 파라미터면 항상 같은 결과다', () => {
    const p = params({ floorIds: ['f2', 'f1'] });
    expect(assignNumbers(defects, p)).toEqual(assignNumbers(defects, p));
  });

  it('같은 층을 두 번 눌러도 한 번만 센다', () => {
    const r = assignNumbers(defects, params({ floorIds: ['f1', 'f2', 'f1'] }));
    expect(r.floorRanges.map((x) => x.floorId)).toEqual(['f1', 'f2']);
    expect(r.rows).toHaveLength(2);
  });

  it('빈 층(결함 0건)이 선택돼 있어도 터지지 않고 from/to 가 null 이다', () => {
    const r = assignNumbers(defects, params({ floorIds: ['f1', 'fEmpty', 'f2'] }));
    expect(r.floorRanges[1]).toEqual({ floorId: 'fEmpty', count: 0, from: null, to: null });
    expect(r.byDefect['c']?.no).toBe(2); // 빈 층이 번호를 먹지 않는다
    expect(formatFloorRange(r.floorRanges[1]!)).toBe('—');
    expect(formatFloorRange(r.floorRanges[0]!)).toBe('1');
  });
});

describe('필터 4종', () => {
  const defects = [
    d('cur', 'f1', 1),
    d('prev', 'f1', 2, { status: 'PREV_PENDING' }),
    d('rep', 'f1', 3, { status: 'REPAIRED' }),
    d('det', 'f1', 4, { surveyKind: 'DETAIL' }),
    d('inc', 'f1', 5),
  ];
  const ctx = { incomplete: new Set(['inc']) };

  it('기본값 — 보수완료만 빠진다', () => {
    const r = assignNumbers(defects, params(), ctx);
    expect(r.rows.map((x) => x.defectId)).toEqual(['cur', 'prev', 'det', 'inc']);
    expect(r.excluded).toEqual([{ defectId: 'rep', reason: 'STATUS' }]);
  });

  it('includeRepaired — 보수완료를 넣는다', () => {
    const r = assignNumbers(defects, params({ includeRepaired: true }), ctx);
    expect(r.rows.map((x) => x.defectId)).toContain('rep');
  });

  it('includePrevPending=false — 전회차 미보수를 뺀다', () => {
    const r = assignNumbers(defects, params({ includePrevPending: false }), ctx);
    expect(r.rows.map((x) => x.defectId)).not.toContain('prev');
    expect(r.excluded).toContainEqual({ defectId: 'prev', reason: 'STATUS' });
  });

  it('surveyKinds — 외관조사만', () => {
    const r = assignNumbers(defects, params({ surveyKinds: ['EXTERIOR'] }), ctx);
    expect(r.rows.map((x) => x.defectId)).toEqual(['cur', 'prev', 'inc']);
    expect(r.excluded).toContainEqual({ defectId: 'det', reason: 'SURVEY_KIND' });
  });

  it('D3 — 미완성 결함은 기본으로 포함되고 경고만 뜬다', () => {
    const r = assignNumbers(defects, params(), ctx);
    expect(r.rows.map((x) => x.defectId)).toContain('inc');
    expect(r.warnings.incomplete).toEqual(['inc']);
  });

  it('includeIncomplete=false — 명시적으로 껐을 때만 빠진다', () => {
    const r = assignNumbers(defects, params({ includeIncomplete: false }), ctx);
    expect(r.rows.map((x) => x.defectId)).not.toContain('inc');
    expect(r.excluded).toContainEqual({ defectId: 'inc', reason: 'INCOMPLETE' });
    expect(r.warnings.incomplete).toEqual([]);
  });
});

describe('순수성', () => {
  it('입력 배열을 변형하지 않는다', () => {
    const defects = [d('b', 'f1', 2), d('a', 'f1', 1)];
    const copy = defects.map((x) => ({ ...x }));
    const p = params();
    const floorIds = p.floorIds;
    assignNumbers(defects, p);
    expect(defects).toEqual(copy);
    expect(p.floorIds).toBe(floorIds);
    expect(p.floorIds).toEqual(['f1']);
  });
});
