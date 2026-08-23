/**
 * S4-T1 — `DefectAttrs` 합성과 옛 레코드 정규화 (스펙 §3-2 · §3-3).
 * **DB 버전을 올리지 않고** 읽는 시점에 채운다.
 */
import { describe, expect, it } from 'vitest';
import { EMPTY_DEFECT_ATTRS, inferSizeMode, normalizeDefectAttrs } from '../src/defectAttrs.js';
import type { Defect } from '../src/types.js';
import { defect } from './helpers.js';

/** S1·S2a 가 저장한 옛 레코드 — 신규 필드가 하나도 없다 */
function legacy(over: Record<string, unknown> = {}): Defect {
  return {
    id: 'd-old',
    projectId: 'p',
    drawingId: 'dw',
    floorId: 'f',
    seq: 1,
    status: 'CURRENT',
    marks: [],
    label: { defectId: 'd-old', x: 0.5, y: 0.5, anchorMarkId: null, placed: false },
    style: null,
    memberName: '슬래브',
    defectTypeName: '균열',
    widthMm: 0.2,
    lengthMm: 2500,
    areaM2: null,
    countEa: null,
    memo: null,
    ...over,
  } as unknown as Defect;
}

describe('EMPTY_DEFECT_ATTRS', () => {
  it('기본값이 스펙과 같다', () => {
    expect(EMPTY_DEFECT_ATTRS.sizeMode).toBe('WL');
    expect(EMPTY_DEFECT_ATTRS.progress).toBe('NONE');
    expect(EMPTY_DEFECT_ATTRS.surveyKind).toBe('EXTERIOR');
    expect(EMPTY_DEFECT_ATTRS.leak).toBe(false);
    expect(EMPTY_DEFECT_ATTRS.countEa).toBeNull();
    expect(EMPTY_DEFECT_ATTRS.memberId).toBeNull();
  });

  it('폭은 구간이 아니라 숫자다 (D7)', () => {
    const d = defect('d1', 1, { x: 0.5, y: 0.5 }, { x: 0.6, y: 0.6 }, { widthMm: 0.2 });
    expect(d.widthMm).toBe(0.2);
    expect(typeof d.widthMm).toBe('number');
  });
});

describe('inferSizeMode', () => {
  it('폭·길이가 있으면 WL', () => {
    expect(inferSizeMode({ widthMm: 0.2, lengthMm: 2000 })).toBe('WL');
    expect(inferSizeMode({ lengthMm: 2000 })).toBe('WL');
  });
  it('폭·길이가 없고 면적만 있으면 AREA', () => {
    expect(inferSizeMode({ areaM2: 0.5 })).toBe('AREA');
  });
  it('둘 다 없으면 WL', () => {
    expect(inferSizeMode({})).toBe('WL');
    expect(inferSizeMode({ widthMm: null, lengthMm: null, areaM2: null })).toBe('WL');
  });
});

describe('normalizeDefectAttrs', () => {
  it('옛 레코드에 없는 필드를 EMPTY 값으로 채운다', () => {
    const n = normalizeDefectAttrs(legacy());
    expect(n.sketch).toEqual([]);
    expect(n.sizeMode).toBe('WL');
    expect(n.progress).toBe('NONE');
    expect(n.leak).toBe(false);
    expect(n.surveyKind).toBe('EXTERIOR');
    expect(n.causeId).toBeNull();
    expect(n.areaWMm).toBeNull();
  });

  it('기존 값은 덮어쓰지 않는다', () => {
    const n = normalizeDefectAttrs(legacy());
    expect(n.memberName).toBe('슬래브');
    expect(n.widthMm).toBe(0.2);
    expect(n.lengthMm).toBe(2500);
  });

  it('면적만 있는 옛 레코드는 AREA 로 추론된다', () => {
    const n = normalizeDefectAttrs(legacy({ widthMm: null, lengthMm: null, areaM2: 0.42 }));
    expect(n.sizeMode).toBe('AREA');
    expect(n.areaM2).toBe(0.42);
  });

  it('countEa 가 null 이면 null 그대로 둔다 (저장 데이터를 조용히 바꾸지 않는다)', () => {
    expect(normalizeDefectAttrs(legacy()).countEa).toBeNull();
  });

  it('이미 정규화된 레코드는 같은 객체를 돌려준다', () => {
    const d = defect('d1', 1, { x: 0.5, y: 0.5 }, { x: 0.6, y: 0.6 });
    expect(normalizeDefectAttrs(d)).toBe(d);
  });
});
