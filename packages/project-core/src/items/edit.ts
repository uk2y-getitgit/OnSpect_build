/**
 * 항목 편집 — 전부 **순수 함수**다. S3 스펙 §2-5-c · §2-5-d · §2-5-f.
 *
 * 화면은 여기 있는 함수만 부르고 결과 문서를 상태에 넣는다.
 * 저장(디바운스 `put`)은 그 뒤를 따라간다 — **UI 는 저장을 기다리지 않는다** (불변식 #3).
 *
 * 이 파일이 지키는 두 가지:
 *   ① **함정 #4** — `[추가]` 는 같은 이름의 마스터를 두 번 만들지 않는다. 링크만 더한다
 *   ② **기본값 불변** — 결함유형마다 원인·보수방안 기본값은 목록이 비지 않는 한 **정확히 1개**다
 */
import { normalizeName } from '../displayName.js';
import type { StructureType } from '../types.js';
import { nextSortOrder, reorderItems, sortItems } from './order.js';
import { ITEM_NAME_MAX, ITEM_STEP } from './types.js';
import type {
  CauseMaster,
  DefectTypeMaster,
  IdGen,
  ItemKind,
  ItemSettings,
  LinkDefectTypeCause,
  LinkDefectTypeRepair,
  MemberMaster,
  RepairMaster,
  SizeMode,
  Structural,
} from './types.js';

// ── 결과 타입 ──────────────────────────────────────────────────────────────
export type EditErrorCode =
  | 'EMPTY'
  | 'TOO_LONG'
  | 'DUPLICATE_IN_LIST'
  | 'DUPLICATE_NAME'
  | 'DUPLICATE_CODE'
  | 'BAD_CODE'
  | 'NOT_FOUND';

export type EditFailure = { ok: false; code: EditErrorCode; message: string };

export type AddSuccess = {
  ok: true;
  settings: ItemSettings;
  /** 마스터를 새로 만들지 않고 **기존 것을 이 목록에 연결**했다 (함정 #4 방어) */
  linkedExisting: boolean;
  id: string;
  name: string;
};

export type AddResult = AddSuccess | EditFailure;
export type ChangeResult = { ok: true; settings: ItemSettings } | EditFailure;

const fail = (code: EditErrorCode, message: string): EditFailure => ({ ok: false, code, message });

/** 이름 비교 키 — 정규화 후 대소문자·공백 무시 (§2-5-c) */
const key = (s: string): string => normalizeName(s).toLowerCase().replace(/\s/g, '');

function checkName(raw: string): { ok: true; name: string } | EditFailure {
  const name = normalizeName(raw);
  if (name === '') return fail('EMPTY', '이름을 입력해 주세요');
  if (name.length > ITEM_NAME_MAX) {
    return fail('TOO_LONG', `${ITEM_NAME_MAX}자 이내로 입력해 주세요`);
  }
  return { ok: true, name };
}

/** 문서를 얕게 복사하고 `updatedAt` 을 올린다. 배열은 바꾸는 것만 새로 만든다 */
function touch(s: ItemSettings, now: number): ItemSettings {
  return { ...s, updatedAt: now };
}

/**
 * 기본값을 그룹마다 **정확히 1개**로 맞춘다.
 * 비어 있으면 없음, 여러 개면 sortOrder 가 앞선 것 하나만 남는다 (§2-5-d).
 */
function withNormalizedDefaults<T extends { isDefault: boolean; sortOrder: number }>(
  links: readonly T[],
  groupOf: (l: T) => string,
  keyOf: (l: T) => string,
): T[] {
  const chosen = new Map<string, string>();
  const byGroup = new Map<string, T[]>();
  for (const l of links) {
    const g = groupOf(l);
    const arr = byGroup.get(g);
    if (arr) arr.push(l);
    else byGroup.set(g, [l]);
  }
  for (const [g, arr] of byGroup) {
    const sorted = sortItems(arr, keyOf);
    const cur = sorted.find((l) => l.isDefault) ?? sorted[0];
    if (cur) chosen.set(g, keyOf(cur));
  }
  return links.map((l) => {
    const want = chosen.get(groupOf(l)) === keyOf(l);
    return l.isDefault === want ? l : { ...l, isDefault: want };
  });
}

const causeGroup = (l: LinkDefectTypeCause): string => l.defectTypeId;
const causeKey = (l: LinkDefectTypeCause): string => l.causeId;
const repairGroup = (l: LinkDefectTypeRepair): string => l.defectTypeId;
const repairKey = (l: LinkDefectTypeRepair): string => l.repairId;

// ══════════════════════════════════════════════════════════════════════════
// 추가 (§2-5-c)
// ══════════════════════════════════════════════════════════════════════════

/** 구조유형 탭에 부재를 추가한다. 새 부재의 구조체 구분 기본값은 `구조체` */
export function addMember(
  s: ItemSettings,
  args: { structureType: StructureType; name: string; now: number; newId: IdGen },
): AddResult {
  const c = checkName(args.name);
  if (!c.ok) return c;
  const { name } = c;

  const inTab = s.linkStructureMember.filter((l) => l.structureType === args.structureType);
  const namesInTab = new Set(
    inTab
      .map((l) => s.members.find((m) => m.id === l.memberId)?.name)
      .filter((n): n is string => n !== undefined)
      .map(key),
  );
  if (namesInTab.has(key(name))) {
    return fail('DUPLICATE_IN_LIST', '이미 이 목록에 있습니다');
  }

  const existing = s.members.find((m) => key(m.name) === key(name));
  const members: MemberMaster[] = existing
    ? s.members
    : [
        ...s.members,
        {
          id: args.newId(),
          name,
          structural: 'STRUCTURAL',
          createdAt: args.now,
          updatedAt: args.now,
        },
      ];
  const master = existing ?? members[members.length - 1]!;

  return {
    ok: true,
    linkedExisting: existing !== undefined,
    id: master.id,
    name: master.name,
    settings: touch(
      {
        ...s,
        members,
        linkStructureMember: [
          ...s.linkStructureMember,
          {
            structureType: args.structureType,
            memberId: master.id,
            favorite: true,
            sortOrder: nextSortOrder(inTab),
          },
        ],
      },
      args.now,
    ),
  };
}

/** 부재에 결함유형을 추가한다. 새 결함유형의 기본 규모모드는 `폭×길이` */
export function addDefectType(
  s: ItemSettings,
  args: { memberId: string; name: string; now: number; newId: IdGen },
): AddResult {
  const c = checkName(args.name);
  if (!c.ok) return c;
  const { name } = c;

  const inMember = s.linkMemberDefectType.filter((l) => l.memberId === args.memberId);
  const namesInMember = new Set(
    inMember
      .map((l) => s.defectTypes.find((d) => d.id === l.defectTypeId)?.name)
      .filter((n): n is string => n !== undefined)
      .map(key),
  );
  if (namesInMember.has(key(name))) {
    return fail('DUPLICATE_IN_LIST', '이미 이 목록에 있습니다');
  }

  const existing = s.defectTypes.find((d) => key(d.name) === key(name));
  const defectTypes: DefectTypeMaster[] = existing
    ? s.defectTypes
    : [
        ...s.defectTypes,
        {
          id: args.newId(),
          name,
          defaultSizeMode: 'WL',
          createdAt: args.now,
          updatedAt: args.now,
        },
      ];
  const master = existing ?? defectTypes[defectTypes.length - 1]!;

  // 새 결함유형이면 원인·보수방안 목록이 비어 있다. 사용자가 컬럼3 에서 채운다
  return {
    ok: true,
    linkedExisting: existing !== undefined,
    id: master.id,
    name: master.name,
    settings: touch(
      {
        ...s,
        defectTypes,
        linkMemberDefectType: [
          ...s.linkMemberDefectType,
          {
            memberId: args.memberId,
            defectTypeId: master.id,
            sizeMode: master.defaultSizeMode,
            favorite: true,
            sortOrder: nextSortOrder(inMember),
          },
        ],
      },
      args.now,
    ),
  };
}

/** 다음 발생원인 코드번호 — 문서 안에서 유일해야 한다 (§2-5-f) */
export function nextCauseCode(s: ItemSettings): number {
  let max = 0;
  for (const c of s.causes) if (c.code > max) max = c.code;
  return max + 1;
}

export function addCause(
  s: ItemSettings,
  args: { defectTypeId: string; name: string; now: number; newId: IdGen },
): AddResult {
  const c = checkName(args.name);
  if (!c.ok) return c;
  const { name } = c;

  const inType = s.linkDefectTypeCause.filter((l) => l.defectTypeId === args.defectTypeId);
  const namesInType = new Set(
    inType
      .map((l) => s.causes.find((x) => x.id === l.causeId)?.name)
      .filter((n): n is string => n !== undefined)
      .map(key),
  );
  if (namesInType.has(key(name))) return fail('DUPLICATE_IN_LIST', '이미 이 목록에 있습니다');

  const existing = s.causes.find((x) => key(x.name) === key(name));
  const causes: CauseMaster[] = existing
    ? s.causes
    : [
        ...s.causes,
        {
          id: args.newId(),
          name,
          code: nextCauseCode(s),
          createdAt: args.now,
          updatedAt: args.now,
        },
      ];
  const master = existing ?? causes[causes.length - 1]!;

  const links: LinkDefectTypeCause[] = [
    ...s.linkDefectTypeCause,
    {
      defectTypeId: args.defectTypeId,
      causeId: master.id,
      isDefault: inType.length === 0,
      sortOrder: nextSortOrder(inType),
    },
  ];

  return {
    ok: true,
    linkedExisting: existing !== undefined,
    id: master.id,
    name: master.name,
    settings: touch(
      {
        ...s,
        causes,
        linkDefectTypeCause: withNormalizedDefaults(links, causeGroup, causeKey),
      },
      args.now,
    ),
  };
}

export function addRepair(
  s: ItemSettings,
  args: { defectTypeId: string; name: string; now: number; newId: IdGen },
): AddResult {
  const c = checkName(args.name);
  if (!c.ok) return c;
  const { name } = c;

  const inType = s.linkDefectTypeRepair.filter((l) => l.defectTypeId === args.defectTypeId);
  const namesInType = new Set(
    inType
      .map((l) => s.repairs.find((x) => x.id === l.repairId)?.name)
      .filter((n): n is string => n !== undefined)
      .map(key),
  );
  if (namesInType.has(key(name))) return fail('DUPLICATE_IN_LIST', '이미 이 목록에 있습니다');

  const existing = s.repairs.find((x) => key(x.name) === key(name));
  const repairs: RepairMaster[] = existing
    ? s.repairs
    : [...s.repairs, { id: args.newId(), name, createdAt: args.now, updatedAt: args.now }];
  const master = existing ?? repairs[repairs.length - 1]!;

  const links: LinkDefectTypeRepair[] = [
    ...s.linkDefectTypeRepair,
    {
      defectTypeId: args.defectTypeId,
      repairId: master.id,
      isDefault: inType.length === 0,
      sortOrder: nextSortOrder(inType),
    },
  ];

  return {
    ok: true,
    linkedExisting: existing !== undefined,
    id: master.id,
    name: master.name,
    settings: touch(
      {
        ...s,
        repairs,
        linkDefectTypeRepair: withNormalizedDefaults(links, repairGroup, repairKey),
      },
      args.now,
    ),
  };
}

// ══════════════════════════════════════════════════════════════════════════
// 마스터 속성 변경
// ══════════════════════════════════════════════════════════════════════════

/**
 * 이름 변경. 다른 마스터와 같은 이름이 되는 것은 거부한다 —
 * 허용하면 같은 이름 마스터가 둘이 되어 함정 #4 가 뒷문으로 들어온다.
 */
export function renameMaster(
  s: ItemSettings,
  kind: ItemKind,
  id: string,
  raw: string,
  now: number,
): ChangeResult {
  const c = checkName(raw);
  if (!c.ok) return c;
  const { name } = c;

  const bump = <T extends { id: string; name: string; updatedAt: number }>(arr: T[]): T[] =>
    arr.map((x) => (x.id === id ? { ...x, name, updatedAt: now } : x));

  const dup = <T extends { id: string; name: string }>(arr: readonly T[]): boolean =>
    arr.some((x) => x.id !== id && key(x.name) === key(name));

  switch (kind) {
    case 'MEMBER': {
      if (!s.members.some((x) => x.id === id)) return fail('NOT_FOUND', '항목을 찾지 못했습니다');
      if (dup(s.members)) return fail('DUPLICATE_NAME', '이미 같은 이름의 부재가 있습니다');
      return { ok: true, settings: touch({ ...s, members: bump(s.members) }, now) };
    }
    case 'DEFECT_TYPE': {
      if (!s.defectTypes.some((x) => x.id === id)) return fail('NOT_FOUND', '항목을 찾지 못했습니다');
      if (dup(s.defectTypes)) return fail('DUPLICATE_NAME', '이미 같은 이름의 결함유형이 있습니다');
      return { ok: true, settings: touch({ ...s, defectTypes: bump(s.defectTypes) }, now) };
    }
    case 'CAUSE': {
      if (!s.causes.some((x) => x.id === id)) return fail('NOT_FOUND', '항목을 찾지 못했습니다');
      if (dup(s.causes)) return fail('DUPLICATE_NAME', '이미 같은 이름의 발생원인이 있습니다');
      return { ok: true, settings: touch({ ...s, causes: bump(s.causes) }, now) };
    }
    case 'REPAIR': {
      if (!s.repairs.some((x) => x.id === id)) return fail('NOT_FOUND', '항목을 찾지 못했습니다');
      if (dup(s.repairs)) return fail('DUPLICATE_NAME', '이미 같은 이름의 보수방안이 있습니다');
      return { ok: true, settings: touch({ ...s, repairs: bump(s.repairs) }, now) };
    }
  }
}

/** 구조체 / 비구조체 — 부재 마스터의 속성이다 (결함마다 다시 지정할 수 있다) */
export function setMemberStructural(
  s: ItemSettings,
  memberId: string,
  structural: Structural,
  now: number,
): ItemSettings {
  return touch(
    {
      ...s,
      members: s.members.map((m) =>
        m.id === memberId ? { ...m, structural, updatedAt: now } : m,
      ),
    },
    now,
  );
}

/** 발생원인 코드번호 직접 편집. 문서 안에서 유일해야 한다 */
export function setCauseCode(
  s: ItemSettings,
  causeId: string,
  code: number,
  now: number,
): ChangeResult {
  if (!Number.isInteger(code) || code < 1 || code > 999) {
    return fail('BAD_CODE', '1 ~ 999 사이의 정수를 입력해 주세요');
  }
  if (!s.causes.some((c) => c.id === causeId)) return fail('NOT_FOUND', '항목을 찾지 못했습니다');
  if (s.causes.some((c) => c.id !== causeId && c.code === code)) {
    return fail('DUPLICATE_CODE', `코드번호 ${code} 는 이미 쓰고 있습니다`);
  }
  return {
    ok: true,
    settings: touch(
      { ...s, causes: s.causes.map((c) => (c.id === causeId ? { ...c, code, updatedAt: now } : c)) },
      now,
    ),
  };
}

// ══════════════════════════════════════════════════════════════════════════
// 링크 속성 변경
// ══════════════════════════════════════════════════════════════════════════

export function toggleMemberFavorite(
  s: ItemSettings,
  structureType: StructureType,
  memberId: string,
  now: number,
): ItemSettings {
  return touch(
    {
      ...s,
      linkStructureMember: s.linkStructureMember.map((l) =>
        l.structureType === structureType && l.memberId === memberId
          ? { ...l, favorite: !l.favorite }
          : l,
      ),
    },
    now,
  );
}

export function toggleDefectTypeFavorite(
  s: ItemSettings,
  memberId: string,
  defectTypeId: string,
  now: number,
): ItemSettings {
  return touch(
    {
      ...s,
      linkMemberDefectType: s.linkMemberDefectType.map((l) =>
        l.memberId === memberId && l.defectTypeId === defectTypeId
          ? { ...l, favorite: !l.favorite }
          : l,
      ),
    },
    now,
  );
}

/**
 * 규모모드 라디오. **링크를 바꾼다** — 그 (부재, 결함유형) 조합에서만 바뀐다.
 * 마스터의 `defaultSizeMode` 는 새 링크의 초기값 전용이라 손대지 않는다 (§7 지적 · §2-2).
 */
export function setLinkSizeMode(
  s: ItemSettings,
  memberId: string,
  defectTypeId: string,
  sizeMode: SizeMode,
  now: number,
): ItemSettings {
  return touch(
    {
      ...s,
      linkMemberDefectType: s.linkMemberDefectType.map((l) =>
        l.memberId === memberId && l.defectTypeId === defectTypeId ? { ...l, sizeMode } : l,
      ),
    },
    now,
  );
}

export function setDefaultCause(
  s: ItemSettings,
  defectTypeId: string,
  causeId: string,
  now: number,
): ItemSettings {
  return touch(
    {
      ...s,
      linkDefectTypeCause: s.linkDefectTypeCause.map((l) =>
        l.defectTypeId === defectTypeId ? { ...l, isDefault: l.causeId === causeId } : l,
      ),
    },
    now,
  );
}

export function setDefaultRepair(
  s: ItemSettings,
  defectTypeId: string,
  repairId: string,
  now: number,
): ItemSettings {
  return touch(
    {
      ...s,
      linkDefectTypeRepair: s.linkDefectTypeRepair.map((l) =>
        l.defectTypeId === defectTypeId ? { ...l, isDefault: l.repairId === repairId } : l,
      ),
    },
    now,
  );
}

// ══════════════════════════════════════════════════════════════════════════
// 목록에서 빼기 (링크만) — §2-5-d
// ══════════════════════════════════════════════════════════════════════════

export function unlinkMember(
  s: ItemSettings,
  structureType: StructureType,
  memberId: string,
  now: number,
): ItemSettings {
  return touch(
    {
      ...s,
      linkStructureMember: s.linkStructureMember.filter(
        (l) => !(l.structureType === structureType && l.memberId === memberId),
      ),
    },
    now,
  );
}

export function unlinkDefectType(
  s: ItemSettings,
  memberId: string,
  defectTypeId: string,
  now: number,
): ItemSettings {
  return touch(
    {
      ...s,
      linkMemberDefectType: s.linkMemberDefectType.filter(
        (l) => !(l.memberId === memberId && l.defectTypeId === defectTypeId),
      ),
    },
    now,
  );
}

/** 기본값이던 항목을 빼면 **남은 목록의 첫 항목**이 기본값이 된다 (§2-5-d) */
export function unlinkCause(
  s: ItemSettings,
  defectTypeId: string,
  causeId: string,
  now: number,
): ItemSettings {
  const links = s.linkDefectTypeCause.filter(
    (l) => !(l.defectTypeId === defectTypeId && l.causeId === causeId),
  );
  return touch(
    { ...s, linkDefectTypeCause: withNormalizedDefaults(links, causeGroup, causeKey) },
    now,
  );
}

export function unlinkRepair(
  s: ItemSettings,
  defectTypeId: string,
  repairId: string,
  now: number,
): ItemSettings {
  const links = s.linkDefectTypeRepair.filter(
    (l) => !(l.defectTypeId === defectTypeId && l.repairId === repairId),
  );
  return touch(
    { ...s, linkDefectTypeRepair: withNormalizedDefaults(links, repairGroup, repairKey) },
    now,
  );
}

// ══════════════════════════════════════════════════════════════════════════
// 마스터에서 완전히 삭제 — §2-5-d
// ══════════════════════════════════════════════════════════════════════════

/** 확인 다이얼로그에 **실측 건수**를 넣기 위한 집계 */
export type MasterUsage = {
  /** 이 마스터를 가리키는 링크 총 건수 */
  links: number;
  /** 부재: 구조유형 몇 개 / 결함유형: 부재 몇 개 / 원인·보수방안: 결함유형 몇 개 */
  owners: number;
};

export function masterUsage(s: ItemSettings, kind: ItemKind, id: string): MasterUsage {
  switch (kind) {
    case 'MEMBER': {
      const links = s.linkStructureMember.filter((l) => l.memberId === id);
      return { links: links.length, owners: new Set(links.map((l) => l.structureType)).size };
    }
    case 'DEFECT_TYPE': {
      const links = s.linkMemberDefectType.filter((l) => l.defectTypeId === id);
      return { links: links.length, owners: new Set(links.map((l) => l.memberId)).size };
    }
    case 'CAUSE': {
      const links = s.linkDefectTypeCause.filter((l) => l.causeId === id);
      return { links: links.length, owners: new Set(links.map((l) => l.defectTypeId)).size };
    }
    case 'REPAIR': {
      const links = s.linkDefectTypeRepair.filter((l) => l.repairId === id);
      return { links: links.length, owners: new Set(links.map((l) => l.defectTypeId)).size };
    }
  }
}

/**
 * 마스터 + 그 마스터를 가리키는 **모든 링크**를 지운다.
 *
 * ⚠️ 이미 입력된 결함은 그대로다. 결함은 `id` 와 `name` 을 둘 다 저장하므로
 *    설정을 지워도 보고서 데이터가 깨지지 않는다 (§2-5-e · F11).
 */
export function deleteMaster(s: ItemSettings, kind: ItemKind, id: string, now: number): ItemSettings {
  switch (kind) {
    case 'MEMBER':
      return touch(
        {
          ...s,
          members: s.members.filter((m) => m.id !== id),
          linkStructureMember: s.linkStructureMember.filter((l) => l.memberId !== id),
          linkMemberDefectType: s.linkMemberDefectType.filter((l) => l.memberId !== id),
        },
        now,
      );
    case 'DEFECT_TYPE': {
      const causeLinks = s.linkDefectTypeCause.filter((l) => l.defectTypeId !== id);
      const repairLinks = s.linkDefectTypeRepair.filter((l) => l.defectTypeId !== id);
      return touch(
        {
          ...s,
          defectTypes: s.defectTypes.filter((d) => d.id !== id),
          linkMemberDefectType: s.linkMemberDefectType.filter((l) => l.defectTypeId !== id),
          linkDefectTypeCause: causeLinks,
          linkDefectTypeRepair: repairLinks,
        },
        now,
      );
    }
    case 'CAUSE': {
      const links = s.linkDefectTypeCause.filter((l) => l.causeId !== id);
      return touch(
        {
          ...s,
          causes: s.causes.filter((c) => c.id !== id),
          linkDefectTypeCause: withNormalizedDefaults(links, causeGroup, causeKey),
        },
        now,
      );
    }
    case 'REPAIR': {
      const links = s.linkDefectTypeRepair.filter((l) => l.repairId !== id);
      return touch(
        {
          ...s,
          repairs: s.repairs.filter((r) => r.id !== id),
          linkDefectTypeRepair: withNormalizedDefaults(links, repairGroup, repairKey),
        },
        now,
      );
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 드래그 정렬 — 그 목록의 링크만 다시 매긴다 (STEP=10)
// ══════════════════════════════════════════════════════════════════════════

export function reorderMembers(
  s: ItemSettings,
  structureType: StructureType,
  movedMemberId: string,
  toIndex: number,
  now: number,
): ItemSettings {
  const inTab = s.linkStructureMember.filter((l) => l.structureType === structureType);
  const moved = reorderItems(inTab, (l) => l.memberId, movedMemberId, toIndex);
  const rest = s.linkStructureMember.filter((l) => l.structureType !== structureType);
  return touch({ ...s, linkStructureMember: [...rest, ...moved] }, now);
}

export function reorderDefectTypes(
  s: ItemSettings,
  memberId: string,
  movedDefectTypeId: string,
  toIndex: number,
  now: number,
): ItemSettings {
  const inMember = s.linkMemberDefectType.filter((l) => l.memberId === memberId);
  const moved = reorderItems(inMember, (l) => l.defectTypeId, movedDefectTypeId, toIndex);
  const rest = s.linkMemberDefectType.filter((l) => l.memberId !== memberId);
  return touch({ ...s, linkMemberDefectType: [...rest, ...moved] }, now);
}

export function reorderCauses(
  s: ItemSettings,
  defectTypeId: string,
  movedCauseId: string,
  toIndex: number,
  now: number,
): ItemSettings {
  const inType = s.linkDefectTypeCause.filter((l) => l.defectTypeId === defectTypeId);
  const moved = reorderItems(inType, causeKey, movedCauseId, toIndex);
  const rest = s.linkDefectTypeCause.filter((l) => l.defectTypeId !== defectTypeId);
  return touch({ ...s, linkDefectTypeCause: [...rest, ...moved] }, now);
}

export function reorderRepairs(
  s: ItemSettings,
  defectTypeId: string,
  movedRepairId: string,
  toIndex: number,
  now: number,
): ItemSettings {
  const inType = s.linkDefectTypeRepair.filter((l) => l.defectTypeId === defectTypeId);
  const moved = reorderItems(inType, repairKey, movedRepairId, toIndex);
  const rest = s.linkDefectTypeRepair.filter((l) => l.defectTypeId !== defectTypeId);
  return touch({ ...s, linkDefectTypeRepair: [...rest, ...moved] }, now);
}

/** 목록이 완전히 비었을 때 첫 항목의 sortOrder — 화면이 직접 계산하지 않게 둔다 */
export const FIRST_SORT_ORDER = ITEM_STEP;
