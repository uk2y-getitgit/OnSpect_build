/**
 * S6 — 직전 입력 기억 (D9).
 *
 * 여기서 고정하는 것은 **어느 필드를 이어받는가**와,
 * 이어받지 않는 필드가 `undefined` 가 아니라 **키 부재**로 빠지는가다.
 * 후자가 이번 작업에서 유일하게 저장 데이터를 망칠 수 있는 지점이다(T-A) —
 * 결함 생성 자리가 전부 스프레드라 `undefined` 키 하나면 `EMPTY_DEFECT_ATTRS` 의
 * `null` 기본값이 지워진 채 IndexedDB 로 간다.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFECT_ATTR_KEYS,
  DEFECT_SEED_CARRY,
  EMPTY_DEFECT_ATTRS,
  pickDefectSeed,
} from '../src/defectAttrs.js';
import { initialCanvasState, reduce, type ReduceContext } from '../src/interaction.js';
import { toScreen } from '../src/geometry.js';
import type { Defect, DefectAttrs, Keys } from '../src/types.js';
import { GS } from './helpers.js';

/** 직전 결함 — 사용자가 폼을 다 채운 상태 */
const PREV: DefectAttrs = {
  ...EMPTY_DEFECT_ATTRS,
  surveyKind: 'EXTERIOR',
  locationNote: '거실',
  structureType: 'RC',

  memberId: 'm1',
  memberName: '슬래브',
  structural: 'STRUCTURAL',

  defectTypeId: 't1',
  defectTypeName: '균열',

  sizeMode: 'AREA',
  widthMm: 0.3,
  lengthMm: 1200,
  areaM2: 2.4,
  areaWMm: 2000,
  areaHMm: 1200,
  countEa: 3,

  progress: 'ONGOING',
  leak: true,

  causeId: 'c1',
  causeName: '건조수축',
  repairId: 'r1',
  repairName: '표면처리',

  memo: '3층 계단 옆',
};

/** 이어받지 않는 9개 — D9 표의 오른쪽 칸 + surveyKind(J4) */
const FRESH_KEYS = [
  'surveyKind',
  'locationNote',
  'widthMm',
  'lengthMm',
  'areaM2',
  'areaWMm',
  'areaHMm',
  'countEa',
  'memo',
] as const satisfies readonly (keyof DefectAttrs)[];

/** 이어받는 13개 — D9 표의 왼쪽 칸 */
const CARRY_KEYS = [
  'structureType',
  'memberId',
  'memberName',
  'structural',
  'defectTypeId',
  'defectTypeName',
  'sizeMode',
  'progress',
  'leak',
  'causeId',
  'causeName',
  'repairId',
  'repairName',
] as const satisfies readonly (keyof DefectAttrs)[];

describe('DEFECT_SEED_CARRY — 이어받는 필드 표', () => {
  it('DefectAttrs 의 모든 키를 빠짐없이 덮는다', () => {
    expect(Object.keys(DEFECT_SEED_CARRY).sort()).toEqual([...DEFECT_ATTR_KEYS].sort());
  });

  it('D9 표 그대로다 — 이어받음 13 · 새로 받음 9', () => {
    expect(DEFECT_ATTR_KEYS.filter((k) => DEFECT_SEED_CARRY[k]).sort()).toEqual(
      [...CARRY_KEYS].sort(),
    );
    expect(DEFECT_ATTR_KEYS.filter((k) => !DEFECT_SEED_CARRY[k]).sort()).toEqual(
      [...FRESH_KEYS].sort(),
    );
    expect(CARRY_KEYS.length + FRESH_KEYS.length).toBe(DEFECT_ATTR_KEYS.length);
  });
});

describe('pickDefectSeed — 골라 담기', () => {
  it('⚠️ 새로 받는 필드는 키 자체가 없다 (undefined 가 아니다)', () => {
    const seed = pickDefectSeed(PREV) as Record<string, unknown>;
    // `toBeUndefined()` 로는 T-A 를 못 잡는다. **키 부재**를 단언해야 한다
    for (const k of FRESH_KEYS) expect(Object.hasOwn(seed, k)).toBe(false);
    expect(Object.hasOwn(seed, 'widthMm')).toBe(false);
    expect(Object.hasOwn(seed, 'locationNote')).toBe(false);
    expect(Object.hasOwn(seed, 'countEa')).toBe(false);
    expect(Object.hasOwn(seed, 'memo')).toBe(false);
    expect(Object.hasOwn(seed, 'areaM2')).toBe(false);
  });

  it('담긴 키는 정확히 이어받는 13개다', () => {
    expect(Object.keys(pickDefectSeed(PREV)).sort()).toEqual([...CARRY_KEYS].sort());
  });

  it('이어받는 값이 그대로 실린다', () => {
    const seed = pickDefectSeed(PREV);
    expect(seed).toEqual({
      structureType: 'RC',
      memberId: 'm1',
      memberName: '슬래브',
      structural: 'STRUCTURAL',
      defectTypeId: 't1',
      defectTypeName: '균열',
      sizeMode: 'AREA',
      progress: 'ONGOING',
      leak: true,
      causeId: 'c1',
      causeName: '건조수축',
      repairId: 'r1',
      repairName: '표면처리',
    });
  });

  it('명시적 null 도 그대로 실린다 — "부재를 비웠다" 를 "안 바뀜" 으로 되돌리지 않는다', () => {
    const cleared: DefectAttrs = { ...PREV, memberId: null, memberName: null, structural: null };
    const seed = pickDefectSeed(cleared) as Record<string, unknown>;
    expect(Object.hasOwn(seed, 'memberId')).toBe(true);
    expect(seed.memberId).toBeNull();
    expect(seed.memberName).toBeNull();
    expect(seed.structural).toBeNull();
  });

  it('합성 왕복 — 새로 받는 9개가 EMPTY_DEFECT_ATTRS 와 정확히 같다', () => {
    const merged = { ...EMPTY_DEFECT_ATTRS, ...pickDefectSeed(PREV) } as Record<string, unknown>;
    for (const k of FRESH_KEYS) {
      expect(merged[k]).toBe(EMPTY_DEFECT_ATTRS[k]);
      expect(merged[k]).not.toBeUndefined();
    }
    // 합성 결과는 여전히 22개 필드 전부를 갖는다
    expect(Object.keys(merged).sort()).toEqual([...DEFECT_ATTR_KEYS].sort());
  });

  it('씨앗을 다시 씨앗으로 만들어도 같다 (멱등)', () => {
    const once = pickDefectSeed(PREV);
    const twice = pickDefectSeed({ ...EMPTY_DEFECT_ATTRS, ...once });
    expect(twice).toEqual(once);
  });
});

describe('실제 생성 경로 — reduce() 로 만든 새 결함', () => {
  const DRAWING = { id: 'dw', imageWidth: 2400, imageHeight: 1600 };
  const K: Keys = { space: false, alt: false, shift: false, ctrl: false };

  function createDefect(seed?: ReduceContext['defectSeed']): Defect {
    let n = 0;
    const ctx: ReduceContext = {
      defects: [],
      globalStyle: GS,
      makeId: () => `id${(n += 1)}`,
      defectSeed: seed,
    };
    let st = initialCanvasState();
    st = reduce(st, { k: 'RESIZE', size: { w: 1000, h: 700 } }, ctx).state;
    st = reduce(st, { k: 'SET_DRAWING', drawing: DRAWING }, ctx).state;
    st = reduce(st, { k: 'SET_TOOL', tool: 'POINT' }, ctx).state;
    const at = toScreen({ x: 0.5, y: 0.5 }, st.viewport, 2400, 1600);
    const down = reduce(st, { k: 'POINTER_DOWN', pointerId: 1, screen: at, button: 0, keys: K }, ctx);
    const up = reduce(down.state, { k: 'POINTER_UP', pointerId: 1, screen: at, keys: K }, ctx);
    const c = [...down.commands, ...up.commands].find((x) => x.k === 'CREATE_DEFECT');
    if (!c || c.k !== 'CREATE_DEFECT') throw new Error('CREATE_DEFECT 가 나오지 않았다');
    return c.defect;
  }

  it('분류·판정은 이어받고, 측정값·개별정보는 비어 있다', () => {
    const d = createDefect(pickDefectSeed(PREV));

    // 이어받음
    expect(d.structureType).toBe('RC');
    expect(d.memberId).toBe('m1');
    expect(d.memberName).toBe('슬래브');
    expect(d.structural).toBe('STRUCTURAL');
    expect(d.defectTypeId).toBe('t1');
    expect(d.defectTypeName).toBe('균열');
    expect(d.sizeMode).toBe('AREA');
    expect(d.progress).toBe('ONGOING');
    expect(d.leak).toBe(true);
    expect(d.causeName).toBe('건조수축');
    expect(d.repairName).toBe('표면처리');

    // 새로 받음 — **null 이지 undefined 가 아니다**
    expect(d.widthMm).toBeNull();
    expect(d.lengthMm).toBeNull();
    expect(d.areaM2).toBeNull();
    expect(d.areaWMm).toBeNull();
    expect(d.areaHMm).toBeNull();
    expect(d.countEa).toBeNull();
    expect(d.locationNote).toBeNull();
    expect(d.memo).toBeNull();
    expect(d.surveyKind).toBe('EXTERIOR');
    for (const k of FRESH_KEYS) expect(Object.hasOwn(d, k)).toBe(true);
  });

  it('좌표·스타일은 씨앗의 영향을 받지 않는다 (불변식 1 · T-H)', () => {
    const d = createDefect(pickDefectSeed(PREV));
    const m = d.marks[0];
    if (!m || m.geometry.k !== 'POINT') throw new Error('POINT 마크가 없다');
    // 불변식 1 — 좌표는 0~1 정규화다
    expect(m.geometry.x).toBeGreaterThanOrEqual(0);
    expect(m.geometry.x).toBeLessThanOrEqual(1);
    expect(m.geometry.y).toBeGreaterThanOrEqual(0);
    expect(m.geometry.y).toBeLessThanOrEqual(1);
    expect(m.geometry.x).toBeCloseTo(0.5, 3);
    expect(m.geometry.y).toBeCloseTo(0.5, 3);
  });
});
