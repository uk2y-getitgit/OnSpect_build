/**
 * D18 — `[유사결함 불러오기]` 가 복사해 오는 필드.
 *
 * ⚠️ 2026-08-28 **D9(직전 입력 자동 이어받기)는 폐기됐다.** 씨앗을 자동 갱신하던
 * `state.defectSeed` 인프라는 통째로 사라졌고, 남은 것은 *무엇을 복사하는가* 의 판정표뿐이다.
 * 그래서 이 파일은 이제 **순수 함수 `pickCarryAttrs` 와 그 표**만 고정한다.
 *
 * 여기서 고정하는 것은 **어느 필드를 복사하는가**와,
 * 복사하지 않는 필드가 `undefined` 가 아니라 **키 부재**로 빠지는가다.
 * 후자가 유일하게 저장 데이터를 망칠 수 있는 지점이다(T-A) —
 * 합성 자리가 전부 스프레드라 `undefined` 키 하나면 `null` 기본값이 지워진 채 IndexedDB 로 간다.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFECT_ATTR_KEYS,
  DEFECT_CARRY_FIELDS,
  EMPTY_DEFECT_ATTRS,
  pickCarryAttrs,
} from '../src/defectAttrs.js';
import { initialCanvasState, reduce, type ReduceContext } from '../src/interaction.js';
import { toScreen } from '../src/geometry.js';
import type { Defect, DefectAttrs, Keys } from '../src/types.js';
import { GS } from './helpers.js';

/** 사용자가 불러오기 목록에서 고른 결함 — 폼을 다 채운 상태 */
const PICKED: DefectAttrs = {
  ...EMPTY_DEFECT_ATTRS,
  // ⭐ 복사함으로 바뀐 필드(PhotoPolish §2-7 · Q44). 기본값과 다른 값을 넣어야
  //    "복사한다" 를 실제로 증명한다 — EXTERIOR 로 두면 복사하든 말든 결과가 같다
  surveyKind: 'DETAIL',
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

/** 복사하지 않는 8개 — 표의 오른쪽 칸 */
const FRESH_KEYS = [
  'locationNote',
  'widthMm',
  'lengthMm',
  'areaM2',
  'areaWMm',
  'areaHMm',
  'countEa',
  'memo',
] as const satisfies readonly (keyof DefectAttrs)[];

/** 복사하는 14개 — 표의 왼쪽 칸 + 조사구분(§2-7 · Q44) */
const CARRY_KEYS = [
  'surveyKind',
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

describe('DEFECT_CARRY_FIELDS — 복사하는 필드 표', () => {
  it('DefectAttrs 의 모든 키를 빠짐없이 덮는다', () => {
    expect(Object.keys(DEFECT_CARRY_FIELDS).sort()).toEqual([...DEFECT_ATTR_KEYS].sort());
  });

  it('D18 불러오기 표 — 복사 14 · 새로 받음 8 (조사구분 포함)', () => {
    expect(DEFECT_ATTR_KEYS.filter((k) => DEFECT_CARRY_FIELDS[k]).sort()).toEqual(
      [...CARRY_KEYS].sort(),
    );
    expect(DEFECT_ATTR_KEYS.filter((k) => !DEFECT_CARRY_FIELDS[k]).sort()).toEqual(
      [...FRESH_KEYS].sort(),
    );
    expect(CARRY_KEYS.length + FRESH_KEYS.length).toBe(DEFECT_ATTR_KEYS.length);
  });
});

describe('pickCarryAttrs — 골라 담기', () => {
  it('⚠️ 새로 받는 필드는 키 자체가 없다 (undefined 가 아니다)', () => {
    const carry = pickCarryAttrs(PICKED) as Record<string, unknown>;
    // `toBeUndefined()` 로는 T-A 를 못 잡는다. **키 부재**를 단언해야 한다
    for (const k of FRESH_KEYS) expect(Object.hasOwn(carry, k)).toBe(false);
    expect(Object.hasOwn(carry, 'widthMm')).toBe(false);
    expect(Object.hasOwn(carry, 'locationNote')).toBe(false);
    expect(Object.hasOwn(carry, 'countEa')).toBe(false);
    expect(Object.hasOwn(carry, 'memo')).toBe(false);
    expect(Object.hasOwn(carry, 'areaM2')).toBe(false);
  });

  it('담긴 키는 정확히 복사하는 14개다', () => {
    expect(Object.keys(pickCarryAttrs(PICKED)).sort()).toEqual([...CARRY_KEYS].sort());
  });

  it('복사하는 값이 그대로 실린다', () => {
    expect(pickCarryAttrs(PICKED)).toEqual({
      surveyKind: 'DETAIL',
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
    const cleared: DefectAttrs = { ...PICKED, memberId: null, memberName: null, structural: null };
    const carry = pickCarryAttrs(cleared) as Record<string, unknown>;
    expect(Object.hasOwn(carry, 'memberId')).toBe(true);
    expect(carry.memberId).toBeNull();
    expect(carry.memberName).toBeNull();
    expect(carry.structural).toBeNull();
  });

  it('⭐ 현재 결함에 덮어써도 규모·개소·메모는 살아남는다 (D18 (a) 의 핵심)', () => {
    // 불러오기는 "지금 선택된 결함" 위에 얹는다. 사용자가 이미 적어 둔 실측치를
    // 지우면 안 된다 — 지우면 불러오기가 손해가 된다
    const current: DefectAttrs = {
      ...EMPTY_DEFECT_ATTRS,
      widthMm: 0.5,
      lengthMm: 800,
      countEa: 2,
      locationNote: '2층 화장실',
      memo: '재조사 필요',
    };
    const merged = { ...current, ...pickCarryAttrs(PICKED) };
    expect(merged.widthMm).toBe(0.5);
    expect(merged.lengthMm).toBe(800);
    expect(merged.countEa).toBe(2);
    expect(merged.locationNote).toBe('2층 화장실');
    expect(merged.memo).toBe('재조사 필요');
    // 분류·판정은 갈아 끼워졌다
    expect(merged.memberName).toBe('슬래브');
    expect(merged.defectTypeName).toBe('균열');
    expect(merged.repairName).toBe('표면처리');
  });

  it('합성 왕복 — 새로 받는 8개가 EMPTY_DEFECT_ATTRS 와 정확히 같다', () => {
    const merged = { ...EMPTY_DEFECT_ATTRS, ...pickCarryAttrs(PICKED) } as Record<string, unknown>;
    for (const k of FRESH_KEYS) {
      expect(merged[k]).toBe(EMPTY_DEFECT_ATTRS[k]);
      expect(merged[k]).not.toBeUndefined();
    }
    // 합성 결과는 여전히 필드 전부를 갖는다
    expect(Object.keys(merged).sort()).toEqual([...DEFECT_ATTR_KEYS].sort());
  });

  it('두 번 골라 담아도 같다 (멱등)', () => {
    const once = pickCarryAttrs(PICKED);
    const twice = pickCarryAttrs({ ...EMPTY_DEFECT_ATTRS, ...once });
    expect(twice).toEqual(once);
  });
});

describe('실제 생성 경로 — reduce() 로 만든 새 결함', () => {
  const DRAWING = { id: 'dw', imageWidth: 2400, imageHeight: 1600 };
  const K: Keys = { space: false, alt: false, shift: false, ctrl: false };

  function createDefect(defaults?: ReduceContext['defaultAttrs']): Defect {
    let n = 0;
    const ctx: ReduceContext = {
      defects: [],
      globalStyle: GS,
      makeId: () => `id${(n += 1)}`,
      defaultAttrs: defaults,
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

  it('⭐ D18 — 새 결함은 빈 폼이다. 프로젝트 기본 구조유형만 채워진다', () => {
    // `defaultAttrs` 는 용역을 여는 순간 정해지고 갱신되지 않는다(D18 (d)).
    // 이것까지 없애면 결함을 찍을 때마다 구조유형을 다시 골라야 한다
    const d = createDefect({ structureType: 'RC' });
    expect(d.structureType).toBe('RC');
    // 분류·판정은 자동으로 따라오지 않는다 — 불러오기 버튼으로만 온다
    expect(d.memberId).toBeNull();
    expect(d.memberName).toBeNull();
    expect(d.defectTypeId).toBeNull();
    expect(d.defectTypeName).toBeNull();
    expect(d.causeId).toBeNull();
    expect(d.repairId).toBeNull();
    // 새로 받음 — **null 이지 undefined 가 아니다**
    expect(d.widthMm).toBeNull();
    expect(d.lengthMm).toBeNull();
    expect(d.areaM2).toBeNull();
    expect(d.countEa).toBeNull();
    expect(d.locationNote).toBeNull();
    expect(d.memo).toBeNull();
    for (const k of FRESH_KEYS) expect(Object.hasOwn(d, k)).toBe(true);
  });

  it('defaultAttrs 가 없어도 22 필드가 전부 null 기본값으로 존재한다', () => {
    const d = createDefect() as unknown as Record<string, unknown>;
    for (const k of DEFECT_ATTR_KEYS) {
      expect(Object.hasOwn(d, k)).toBe(true);
      expect(d[k]).toBe(EMPTY_DEFECT_ATTRS[k]);
    }
  });

  it('좌표·스타일은 기본값의 영향을 받지 않는다 (불변식 1 · T-H)', () => {
    const d = createDefect({ structureType: 'RC' });
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
