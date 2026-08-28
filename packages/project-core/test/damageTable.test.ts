/**
 * Phase 4-T11 · T13 — 손상결함표 · 결함 리스트 (§3-4 · §3-5).
 *
 * 이 파일이 지키는 것:
 *   · 면적은 `outputSize()` 가 낸 값 그대로다 (불변식 #4 · F17). 여기서 다시 계산하지 않는다
 *   · 발생원인은 마스터 `code` 를 **그대로** 인쇄한다 (F6). 재부여하지 않는다
 *   · 사진번호가 없으면 `—` (§4-2 실측)
 *   · 결함 리스트는 **같은 행**에 열만 줄인 것이다 (K9)
 */
import { describe, expect, it } from 'vitest';
import {
  DAMAGE_COLUMNS,
  DEFECT_LIST_COLUMNS,
  buildDamageTable,
  buildDefectList,
  buildLocations,
  damageColumn,
  formatCauseLegend,
  numText,
  type DamageDefect,
  type DamageTableInput,
  type NumberingRow,
} from '../src/index.js';

function def(id: string, over: Partial<DamageDefect> = {}): DamageDefect {
  return {
    id,
    floorId: 'f1',
    locationNote: null,
    memberId: 'm1',
    memberName: '외벽',
    structural: null,
    defectTypeName: '수직균열',
    sizeMode: 'WL',
    widthMm: 0.2,
    lengthMm: 2500,
    areaM2: null,
    countEa: 2,
    progress: 'NONE',
    leak: false,
    causeId: 'c1',
    causeName: null,
    ...over,
  };
}

function row(defectId: string, no: number, photoNo: number | null, floorId = 'f1'): NumberingRow {
  return { defectId, floorId, no, photoNo };
}

function input(over: Partial<DamageTableInput> = {}): DamageTableInput {
  return {
    rows: [row('a', 1, 1)],
    defects: [def('a')],
    floors: [{ id: 'f1', name: '지하1층', buildingId: 'b1' }],
    buildings: [{ id: 'b1', name: '본관' }],
    members: [{ id: 'm1', structural: 'STRUCTURAL' }],
    causes: [
      { id: 'c1', name: '건조수축', code: 1, createdAt: 0, updatedAt: 0 },
      { id: 'c2', name: '동결융해', code: 5, createdAt: 0, updatedAt: 0 },
    ],
    projectName: '○○아파트 3차',
    headerLine2: '제2장 현장조사',
    ...over,
  };
}

describe('damageRow — 셀 값 규칙 (§3-4)', () => {
  it('규모 4열은 outputSize() 결과를 그대로 쓴다 (개소를 곱하지 않는다)', () => {
    const t = buildDamageTable(input());
    const c = t.sections[0]!.rows[0]!.cells;
    expect(c.widthMm).toBe(0.2);
    expect(c.lengthMm).toBe(2500);
    // 0.2mm × 2500mm = 0.0005㎡ — 개소 2 를 곱하지 않는다
    expect(c.areaM2).toBe(0.0005);
    expect(c.countEa).toBe(2);
  });

  it('AREA 모드면 폭·길이는 0 이고 면적은 직접 입력값이다', () => {
    const t = buildDamageTable(
      input({
        defects: [def('a', { sizeMode: 'AREA', areaM2: 0.5, widthMm: null, lengthMm: null })],
      }),
    );
    const c = t.sections[0]!.rows[0]!.cells;
    expect([c.widthMm, c.lengthMm, c.areaM2]).toEqual([0, 0, 0.5]);
  });

  it('구조체 유형은 결함 값 우선, 없으면 부재 마스터 (F16)', () => {
    const a = buildDamageTable(input()).sections[0]!.rows[0]!;
    expect(a.cells.structural).toBe('구조체');

    const b = buildDamageTable(
      input({ defects: [def('a', { structural: 'NON_STRUCTURAL' })] }),
    ).sections[0]!.rows[0]!;
    expect(b.cells.structural).toBe('비구조체');

    const c = buildDamageTable(
      input({ defects: [def('a', { memberId: null, structural: null })] }),
    ).sections[0]!.rows[0]!;
    expect(c.cells.structural).toBe('');
  });

  it('발생원인은 마스터 code 를 그대로 인쇄한다 (F6 — 재부여하지 않는다)', () => {
    const t = buildDamageTable(input({ defects: [def('a', { causeId: 'c2' })] }));
    expect(t.sections[0]!.rows[0]!.cells.cause).toBe(5);
  });

  it('원인 조회에 실패하면 causeName, 그것도 없으면 빈 칸', () => {
    const t = buildDamageTable(
      input({
        rows: [row('a', 1, null), row('b', 2, null)],
        defects: [
          def('a', { causeId: null, causeName: '시공불량' }),
          def('b', { causeId: null, causeName: null }),
        ],
      }),
    );
    const rows = t.sections[0]!.rows;
    expect(rows[0]!.cells.cause).toBe('시공불량');
    expect(rows[1]!.cells.cause).toBe('');
  });

  it('진행상황·누수여부는 O / X', () => {
    const t = buildDamageTable(
      input({ defects: [def('a', { progress: 'ONGOING', leak: true })] }),
    );
    const c = t.sections[0]!.rows[0]!.cells;
    expect([c.progress, c.leak]).toEqual(['O', 'O']);
  });

  it('사진번호가 없으면 표시 문자열이 — 다 (§4-2 실측)', () => {
    const t = buildDamageTable(input({ rows: [row('a', 1, null)] }));
    const r = t.sections[0]!.rows[0]!;
    expect(r.cells.photoNo).toBeNull();
    expect(r.text.photoNo).toBe('—');
  });

  it('NO 는 NumberingRow 를 그대로 쓴다 — 표가 다시 세지 않는다 (불변식 #2)', () => {
    const t = buildDamageTable(input({ rows: [row('a', 93, 92)] }));
    expect(t.sections[0]!.rows[0]!.cells.no).toBe(93);
    expect(t.sections[0]!.rows[0]!.cells.photoNo).toBe(92);
  });

  /** D19 §5-5 — 접두어는 **표기**만 바꾼다. `NumberingRow.no` 는 여전히 정수다 */
  it('floorCodes 가 있으면 NO 열이 `B1F-01` 로 나간다', () => {
    const t = buildDamageTable(input({ rows: [row('a', 1, 1)], floorCodes: { f1: 'B1F' } }));
    const r = t.sections[0]!.rows[0]!;
    expect(r.cells.no).toBe('B1F-01');
    expect(r.text.no).toBe('B1F-01');
  });

  it('그 층에 접두어가 없으면(=null) 정수 그대로 — 기존 출력물 무변경', () => {
    const t = buildDamageTable(input({ rows: [row('a', 7, 1)], floorCodes: { f1: null } }));
    expect(t.sections[0]!.rows[0]!.cells.no).toBe(7);
    expect(t.sections[0]!.rows[0]!.text.no).toBe('7');
  });

  it('층마다 다른 접두어가 붙는다', () => {
    const t = buildDamageTable(
      input({
        rows: [row('a', 1, 1, 'f1'), row('b', 1, 2, 'f2')],
        defects: [def('a'), def('b')],
        floors: [
          { id: 'f1', name: '지하1층', buildingId: 'b1' },
          { id: 'f2', name: '지상1층', buildingId: 'b1' },
        ],
        floorCodes: { f1: 'B1F', f2: '1F' },
      }),
    );
    expect(t.sections.map((s) => s.rows[0]!.text.no)).toEqual(['B1F-01', '1F-01']);
  });
});

describe('위치 열 (K17)', () => {
  it('동이 1개면 층 이름만', () => {
    const loc = buildLocations(input());
    expect(loc['a']).toBe('지하1층');
  });

  it('동이 2개 이상이면 {동} {층}', () => {
    const loc = buildLocations(
      input({
        buildings: [
          { id: 'b1', name: '본관' },
          { id: 'b2', name: '별관' },
        ],
      }),
    );
    expect(loc['a']).toBe('본관 지하1층');
  });

  it('locationNote 가 있으면 뒤에 붙는다', () => {
    const loc = buildLocations(input({ defects: [def('a', { locationNote: '계단실' })] }));
    expect(loc['a']).toBe('지하1층 계단실');
  });
});

describe('표 구조 (§3-4)', () => {
  it('층이 바뀔 때마다 ■ 섹션이 갈린다', () => {
    const t = buildDamageTable(
      input({
        rows: [row('a', 1, null, 'f1'), row('b', 2, null, 'f2'), row('c', 3, null, 'f2')],
        defects: [def('a'), def('b', { floorId: 'f2' }), def('c', { floorId: 'f2' })],
        floors: [
          { id: 'f1', name: '지하1층', buildingId: 'b1' },
          { id: 'f2', name: '지상1층', buildingId: 'b1' },
        ],
      }),
    );
    expect(t.sections.map((s) => s.title)).toEqual(['■ 지하1층', '■ 지상1층']);
    expect(t.sections.map((s) => s.rows.length)).toEqual([1, 2]);
    expect(t.rowCount).toBe(3);
  });

  it('머리말 3행 — 용역명 / 입력한 2행 / <계 속>', () => {
    const t = buildDamageTable(input({ headerLine2: '제3장 상세조사' }));
    expect([t.title, t.headerLine2, t.continued]).toEqual([
      '○○아파트 3차',
      '제3장 상세조사',
      '<계 속>',
    ]);
  });

  it('원인 범례는 이 출력에 등장한 코드만 오름차순 (K21)', () => {
    const t = buildDamageTable(
      input({
        rows: [row('a', 1, null), row('b', 2, null)],
        defects: [def('a', { causeId: 'c2' }), def('b', { causeId: 'c1' })],
      }),
    );
    expect(t.causeLegend).toEqual([
      { code: 1, name: '건조수축' },
      { code: 5, name: '동결융해' },
    ]);
    expect(formatCauseLegend(t.causeLegend)).toBe('1. 건조수축  5. 동결융해');
  });

  it('원인이 하나도 안 쓰였으면 범례가 비어 있다', () => {
    const t = buildDamageTable(input({ defects: [def('a', { causeId: null })] }));
    expect(t.causeLegend).toEqual([]);
  });

  it('mapping 에 있으나 사라진 결함은 건너뛴다 (§3-3 재현성 3행)', () => {
    const t = buildDamageTable(input({ rows: [row('a', 1, null), row('gone', 2, null)] }));
    expect(t.rowCount).toBe(1);
    expect(t.sections[0]!.rows.map((r) => r.defectId)).toEqual(['a']);
  });

  it('결함이 하나도 없어도 터지지 않는다', () => {
    const t = buildDamageTable(input({ rows: [], defects: [] }));
    expect(t.sections).toEqual([]);
    expect(t.rowCount).toBe(0);
  });
});

describe('열 정의', () => {
  it('손상결함표는 13열이고 손상규모 그룹이 4열이다', () => {
    expect(DAMAGE_COLUMNS).toHaveLength(13);
    expect(DAMAGE_COLUMNS.filter((c) => c.group === '손상규모').map((c) => c.key)).toEqual([
      'widthMm',
      'lengthMm',
      'areaM2',
      'countEa',
    ]);
  });

  it('결함 리스트는 9열 축약이고 손상결함표에서 4열을 뺀 것이다 (K9)', () => {
    expect(DEFECT_LIST_COLUMNS).toHaveLength(9);
    const dropped = DAMAGE_COLUMNS.map((c) => c.key).filter(
      (k) => !DEFECT_LIST_COLUMNS.includes(k),
    );
    expect(dropped).toEqual(['structural', 'progress', 'leak', 'cause']);
  });

  it('결함 리스트는 손상결함표와 같은 셀 값을 쓴다 — 열만 다르다', () => {
    const full = buildDamageTable(input());
    const list = buildDefectList(input());
    expect(list.columns.map((c) => c.key)).toEqual([...DEFECT_LIST_COLUMNS]);
    expect(list.sections[0]!.rows[0]!.cells).toEqual(full.sections[0]!.rows[0]!.cells);
  });

  it('알 수 없는 열은 즉시 실패한다 — 조용히 빈 열을 내지 않는다', () => {
    // @ts-expect-error 의도적으로 잘못된 키
    expect(() => damageColumn('nope')).toThrow();
  });
});

describe('숫자 표시 (M1)', () => {
  it('소수 자리로 맞춘 뒤 꼬리 0 을 지운다', () => {
    expect(numText(0.2, 1)).toBe('0.2');
    expect(numText(1, 1)).toBe('1');
    expect(numText(0.0005, 4)).toBe('0.0005');
    expect(numText(0.5, 4)).toBe('0.5');
    expect(numText(2500, 0)).toBe('2500');
    expect(numText(0, 4)).toBe('0');
  });
});
