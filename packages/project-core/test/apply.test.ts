/**
 * S4-T3 — 연동 규칙 (§3-6 · §4-2). code-reviewer 경계 조건을 그대로 옮겼다.
 *
 * 고정 소규모 픽스처를 직접 만든다 — 씨앗(전조합)은 "무효화" 경로를 재현할 수 없어서다
 * (모든 부재가 모든 결함유형에 연결돼 있으면 목록에서 빠지는 케이스가 안 생긴다).
 */
import { describe, expect, it } from 'vitest';
import { seedAttrs, setDefectType, setMember, setSizeMode, setStructureType, type AttrsLike } from '../src/index.js';
import type { ItemSettings } from '../src/index.js';

const NOW = 1_700_000_000_000;

/**
 * RC: m1(벽) · m2(기둥) 둘 다 연결. SS: m1 만 연결(m2 는 SS 에 없다).
 * m1 → dt1(수직균열·WL) · dt2(망상균열·AREA) 둘 다. m2 → dt1 만(dt2 는 m2 에 없다).
 * dt1 → c1(건조수축·기본) · c2(하중변화). dt2 → c1(기본) 만(c2 는 dt2 에 없다).
 * dt1 → r1(표면처리·기본) · r2(에폭시). dt2 → r1(기본) 만.
 */
function fixture(): ItemSettings {
  return {
    id: 'p1',
    scope: 'PROJECT',
    projectId: 'p1',
    settingsVersion: 1,
    snapshotFrom: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    deviceId: 'dev',
    createdBy: null,
    members: [
      { id: 'm1', name: '벽', structural: 'STRUCTURAL', createdAt: NOW, updatedAt: NOW },
      { id: 'm2', name: '기둥', structural: 'NON_STRUCTURAL', createdAt: NOW, updatedAt: NOW },
    ],
    defectTypes: [
      { id: 'dt1', name: '수직균열', defaultSizeMode: 'WL', createdAt: NOW, updatedAt: NOW },
      { id: 'dt2', name: '망상균열', defaultSizeMode: 'AREA', createdAt: NOW, updatedAt: NOW },
    ],
    causes: [
      { id: 'c1', name: '건조수축', code: 1, createdAt: NOW, updatedAt: NOW },
      { id: 'c2', name: '하중변화', code: 2, createdAt: NOW, updatedAt: NOW },
    ],
    repairs: [
      { id: 'r1', name: '표면처리공법', createdAt: NOW, updatedAt: NOW },
      { id: 'r2', name: '에폭시 주입공법', createdAt: NOW, updatedAt: NOW },
    ],
    linkStructureMember: [
      { structureType: 'RC', memberId: 'm1', favorite: true, sortOrder: 10 },
      { structureType: 'RC', memberId: 'm2', favorite: true, sortOrder: 20 },
      { structureType: 'SS', memberId: 'm1', favorite: true, sortOrder: 10 },
    ],
    linkMemberDefectType: [
      { memberId: 'm1', defectTypeId: 'dt1', sizeMode: 'WL', favorite: true, sortOrder: 10 },
      { memberId: 'm1', defectTypeId: 'dt2', sizeMode: 'AREA', favorite: true, sortOrder: 20 },
      { memberId: 'm2', defectTypeId: 'dt1', sizeMode: 'WL', favorite: true, sortOrder: 10 },
    ],
    linkDefectTypeCause: [
      { defectTypeId: 'dt1', causeId: 'c1', isDefault: true, sortOrder: 10 },
      { defectTypeId: 'dt1', causeId: 'c2', isDefault: false, sortOrder: 20 },
      { defectTypeId: 'dt2', causeId: 'c1', isDefault: true, sortOrder: 10 },
    ],
    linkDefectTypeRepair: [
      { defectTypeId: 'dt1', repairId: 'r1', isDefault: true, sortOrder: 10 },
      { defectTypeId: 'dt1', repairId: 'r2', isDefault: false, sortOrder: 20 },
      { defectTypeId: 'dt2', repairId: 'r1', isDefault: true, sortOrder: 10 },
    ],
  };
}

const EMPTY: AttrsLike = {
  structureType: null,
  memberId: null,
  memberName: null,
  structural: null,
  defectTypeId: null,
  defectTypeName: null,
  sizeMode: 'WL',
  causeId: null,
  causeName: null,
  repairId: null,
  repairName: null,
};

describe('setStructureType', () => {
  it('현재 부재가 새 구조유형 목록에 있으면 그대로 유지한다', () => {
    const a = { ...EMPTY, memberId: 'm1', memberName: '벽' };
    const next = setStructureType(a, fixture(), 'SS');
    expect(next.structureType).toBe('SS');
    expect(next.memberId).toBe('m1'); // m1 은 SS 에도 있다
  });

  it('현재 부재가 새 목록에 없으면 부재·결함유형·원인·보수방안을 전부 비운다', () => {
    const a = {
      ...EMPTY,
      memberId: 'm2',
      memberName: '기둥',
      defectTypeId: 'dt1',
      defectTypeName: '수직균열',
      causeId: 'c1',
      causeName: '건조수축',
      repairId: 'r1',
      repairName: '표면처리공법',
    };
    const next = setStructureType(a, fixture(), 'SS'); // m2 는 SS 에 없다
    expect(next.memberId).toBeNull();
    expect(next.memberName).toBeNull();
    expect(next.defectTypeId).toBeNull();
    expect(next.causeId).toBeNull();
    expect(next.repairId).toBeNull();
  });

  it('규모모드·규모 숫자는 이 함수가 모르는 필드라도(AttrsLike 밖) 그대로 보존된다', () => {
    const a = { ...EMPTY, memberId: 'm2', sizeMode: 'AREA' as const, widthMm: 123 };
    const next = setStructureType(a, fixture(), 'SS');
    expect((next as typeof a).widthMm).toBe(123);
  });
});

describe('setMember', () => {
  it('① structural 을 새 부재의 기본값으로 되돌린다(수동 지정 해제)', () => {
    const a = { ...EMPTY, structural: 'STRUCTURAL' as const }; // 사용자가 손으로 구조체로 지정해 뒀다 가정
    const next = setMember(a, fixture(), 'm2'); // m2 마스터 기본값은 비구조체
    expect(next.structural).toBe('NON_STRUCTURAL');
  });

  it('② 결함유형이 새 부재 목록에 있으면 유지한다', () => {
    const a = { ...EMPTY, memberId: 'm1', defectTypeId: 'dt1', defectTypeName: '수직균열' };
    const next = setMember(a, fixture(), 'm2'); // dt1 은 m2 에도 있다
    expect(next.defectTypeId).toBe('dt1');
  });

  it('② 결함유형이 새 부재 목록에 없으면 결함유형·원인·보수방안을 비운다', () => {
    const a = {
      ...EMPTY,
      memberId: 'm1',
      defectTypeId: 'dt2',
      defectTypeName: '망상균열',
      causeId: 'c1',
      repairId: 'r1',
    };
    const next = setMember(a, fixture(), 'm2'); // dt2 는 m2 에 없다
    expect(next.defectTypeId).toBeNull();
    expect(next.causeId).toBeNull();
    expect(next.repairId).toBeNull();
  });

  it('목록에 없는 memberId 를 주면 아무것도 바꾸지 않는다(방어적)', () => {
    const a = { ...EMPTY, memberId: 'm1' };
    const next = setMember(a, fixture(), 'no-such-id');
    expect(next).toEqual(a);
  });
});

describe('setDefectType', () => {
  it('① sizeMode 는 (부재, 결함유형) 링크 값을 따른다 — 마스터 기본값이 아니다', () => {
    const a = { ...EMPTY, memberId: 'm1', sizeMode: 'WL' as const };
    const next = setDefectType(a, fixture(), 'dt2'); // m1-dt2 링크는 AREA
    expect(next.sizeMode).toBe('AREA');
  });

  it('② 현재 원인·보수방안이 새 목록에 있으면 유지한다', () => {
    const a = { ...EMPTY, memberId: 'm1', causeId: 'c2', causeName: '하중변화', repairId: 'r2', repairName: '에폭시 주입공법' };
    const next = setDefectType(a, fixture(), 'dt1'); // dt1 에는 c2·r2 둘 다 있다
    expect(next.causeId).toBe('c2');
    expect(next.repairId).toBe('r2');
  });

  it('② 현재 원인·보수방안이 새 목록에 없으면 새 기본값으로 교체한다', () => {
    const a = { ...EMPTY, memberId: 'm1', causeId: 'c2', causeName: '하중변화', repairId: 'r2', repairName: '에폭시 주입공법' };
    const next = setDefectType(a, fixture(), 'dt2'); // dt2 에는 c2·r2 가 없다 — 기본값(c1·r1)으로
    expect(next.causeId).toBe('c1');
    expect(next.causeName).toBe('건조수축');
    expect(next.repairId).toBe('r1');
    expect(next.repairName).toBe('표면처리공법');
  });

  it('③ 규모 숫자(이 함수가 모르는 필드)는 모드가 바뀌어도 유지된다', () => {
    const a = { ...EMPTY, memberId: 'm1', sizeMode: 'WL' as const, widthMm: 0.2, lengthMm: 2000 };
    const next = setDefectType(a, fixture(), 'dt2'); // WL → AREA 로 모드는 바뀐다
    expect(next.sizeMode).toBe('AREA');
    expect((next as typeof a).widthMm).toBe(0.2);
    expect((next as typeof a).lengthMm).toBe(2000);
  });
});

describe('setSizeMode — 왕복해도 반대편 값을 지우지 않는다 (F15)', () => {
  it('모드만 바뀐다. 다른 필드는 이 함수가 건드리지 않는다', () => {
    const a = { ...EMPTY, sizeMode: 'WL' as const, widthMm: 0.2, areaM2: 0.5 };
    const toArea = setSizeMode(a, 'AREA');
    expect(toArea.sizeMode).toBe('AREA');
    expect((toArea as typeof a).widthMm).toBe(0.2);
    expect((toArea as typeof a).areaM2).toBe(0.5);
    const backToWl = setSizeMode(toArea, 'WL');
    expect(backToWl.sizeMode).toBe('WL');
    expect((backToWl as typeof a).widthMm).toBe(0.2);
    expect((backToWl as typeof a).areaM2).toBe(0.5);
  });
});

describe('seedAttrs — 프로젝트 기본 구조유형만 패치로 낸다', () => {
  it('프로젝트 기본 구조유형이 있으면 그 값을 패치로 낸다', () => {
    expect(seedAttrs(fixture(), { defaultStructureType: 'SRC' })).toEqual({ structureType: 'SRC' });
  });
  it('기본값이 없으면 빈 패치를 낸다 — EMPTY_DEFECT_ATTRS 를 덮어쓰지 않는다', () => {
    expect(seedAttrs(fixture(), { defaultStructureType: null })).toEqual({});
  });
});
