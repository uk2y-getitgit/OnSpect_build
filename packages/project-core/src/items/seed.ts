/**
 * 씨앗 데이터 — S3 스펙 §2-7 (ASSUMPTIONS F5 / Q20).
 *
 * 설정이 비면 결함을 입력할 수 없다. 그래서 첫 실행에 ORG 문서를 이 표로 만든다.
 * **모든 씨앗 항목은 설정 화면에서 이름 변경·삭제·정렬·즐겨찾기 해제가 가능하다.**
 * 되돌릴 수 없는 결정이 아니다.
 *
 * 씨앗 id 는 **고정 슬러그**다(`seed-m-1` …). 난수가 아니라서
 *   · `[기본 항목 세트 다시 불러오기]` 가 "이름을 고친 항목"을 다시 만들지 않고
 *   · 단위테스트가 읽힌다.
 */
import { normalizeName } from '../displayName.js';
import type { StructureType } from '../types.js';
import { ITEM_STEP, ORG_SETTINGS_ID, SETTINGS_VERSION, STRUCTURE_TYPE_TABS } from './types.js';
import type {
  CauseMaster,
  DefectTypeMaster,
  ItemSettings,
  LinkDefectTypeCause,
  LinkDefectTypeRepair,
  LinkMemberDefectType,
  LinkStructureMember,
  MemberMaster,
  RepairMaster,
  SizeMode,
  Structural,
} from './types.js';

// ── §2-7-a 부재 17종 ───────────────────────────────────────────────────────
export const SEED_MEMBERS: readonly { name: string; structural: Structural }[] = [
  { name: '벽(구조체)', structural: 'STRUCTURAL' },
  { name: '벽(비구조체)', structural: 'NON_STRUCTURAL' },
  { name: '기둥', structural: 'STRUCTURAL' },
  { name: '보', structural: 'STRUCTURAL' },
  { name: '바닥 슬래브', structural: 'STRUCTURAL' },
  { name: '천장 슬래브', structural: 'STRUCTURAL' },
  { name: '파라펫', structural: 'NON_STRUCTURAL' },
  { name: '계단 슬래브', structural: 'STRUCTURAL' },
  { name: '계단참 슬래브', structural: 'STRUCTURAL' },
  { name: '치장벽돌', structural: 'NON_STRUCTURAL' },
  { name: '계단 난간', structural: 'NON_STRUCTURAL' },
  { name: '천장 마감재', structural: 'NON_STRUCTURAL' },
  { name: '드라이비트', structural: 'NON_STRUCTURAL' },
  { name: '외부벽체', structural: 'NON_STRUCTURAL' },
  { name: '담장', structural: 'NON_STRUCTURAL' },
  { name: '캐노피', structural: 'NON_STRUCTURAL' },
  { name: '경계석', structural: 'NON_STRUCTURAL' },
];

// ── §2-7-b 결함유형 13종 ───────────────────────────────────────────────────
export const SEED_DEFECT_TYPES: readonly { name: string; sizeMode: SizeMode }[] = [
  { name: '수직균열', sizeMode: 'WL' },
  { name: '수평균열', sizeMode: 'WL' },
  { name: '경사균열', sizeMode: 'WL' },
  { name: '망상균열', sizeMode: 'AREA' },
  { name: '마감균열', sizeMode: 'WL' },
  { name: '습식균열', sizeMode: 'AREA' },
  { name: '마감박리', sizeMode: 'AREA' },
  { name: '마감박리/박락', sizeMode: 'AREA' },
  { name: '접합부 이격', sizeMode: 'WL' },
  { name: '철근노출', sizeMode: 'AREA' },
  { name: '누수흔적', sizeMode: 'AREA' },
  { name: '파손', sizeMode: 'AREA' },
  { name: '백태', sizeMode: 'AREA' },
];

// ── §2-7-c 발생원인 4종 (코드번호는 실측 그대로) ───────────────────────────
export const SEED_CAUSES: readonly { name: string; code: number }[] = [
  { name: '건조수축', code: 1 },
  { name: '하중변화', code: 2 },
  { name: '재료분리, 시공불량', code: 3 },
  { name: '이질재 접합', code: 4 },
];

// ── §2-7-d 보수방안 5종 ────────────────────────────────────────────────────
export const SEED_REPAIRS: readonly string[] = [
  '표면처리공법',
  '에폭시 주입공법',
  'V커팅 후 충진공법',
  '단면복구공법',
  '경과관찰',
];

/** 기본값으로 지정되는 항목 (실측 `기본값` 배지) */
export const SEED_DEFAULT_CAUSE = '건조수축';
export const SEED_DEFAULT_REPAIR = '표면처리공법';

export const seedMemberId = (i: number): string => `seed-m-${i + 1}`;
export const seedDefectTypeId = (i: number): string => `seed-dt-${i + 1}`;
export const seedCauseId = (i: number): string => `seed-c-${i + 1}`;
export const seedRepairId = (i: number): string => `seed-r-${i + 1}`;

type SeedArgs = {
  id: string;
  scope: 'ORG' | 'PROJECT';
  projectId: string | null;
  deviceId: string;
  now: number;
};

/**
 * 씨앗 한 벌을 그대로 담은 문서를 만든다.
 *
 * 링크는 **전조합**이다 (§2-7-a·b):
 *   · 구조유형 3종 × 부재 17종 = 51
 *   · 부재 17종 × 결함유형 13종 = 221
 *   · 결함유형 13종 × 원인 4종 = 52 / × 보수방안 5종 = 65
 * 처음부터 어느 부재를 골라도 목록이 비어 있지 않다. 정리는 사용자가 한다.
 */
export function createSeedSettings(args: SeedArgs): ItemSettings {
  const { deviceId, now } = args;
  const stamp = { createdAt: now, updatedAt: now };

  const members: MemberMaster[] = SEED_MEMBERS.map((m, i) => ({
    id: seedMemberId(i),
    name: m.name,
    structural: m.structural,
    ...stamp,
  }));
  const defectTypes: DefectTypeMaster[] = SEED_DEFECT_TYPES.map((d, i) => ({
    id: seedDefectTypeId(i),
    name: d.name,
    defaultSizeMode: d.sizeMode,
    ...stamp,
  }));
  const causes: CauseMaster[] = SEED_CAUSES.map((c, i) => ({
    id: seedCauseId(i),
    name: c.name,
    code: c.code,
    ...stamp,
  }));
  const repairs: RepairMaster[] = SEED_REPAIRS.map((name, i) => ({
    id: seedRepairId(i),
    name,
    ...stamp,
  }));

  const linkStructureMember: LinkStructureMember[] = [];
  for (const st of STRUCTURE_TYPE_TABS) {
    members.forEach((m, i) => {
      linkStructureMember.push({
        structureType: st,
        memberId: m.id,
        favorite: true,
        sortOrder: (i + 1) * ITEM_STEP,
      });
    });
  }

  const linkMemberDefectType: LinkMemberDefectType[] = [];
  for (const m of members) {
    defectTypes.forEach((d, i) => {
      linkMemberDefectType.push({
        memberId: m.id,
        defectTypeId: d.id,
        // 링크를 만들 때 마스터 기본값을 **복사**한다. 이후 둘은 서로 독립이다 (§2-2)
        sizeMode: d.defaultSizeMode,
        favorite: true,
        sortOrder: (i + 1) * ITEM_STEP,
      });
    });
  }

  const linkDefectTypeCause: LinkDefectTypeCause[] = [];
  const linkDefectTypeRepair: LinkDefectTypeRepair[] = [];
  for (const d of defectTypes) {
    causes.forEach((c, i) => {
      linkDefectTypeCause.push({
        defectTypeId: d.id,
        causeId: c.id,
        isDefault: c.name === SEED_DEFAULT_CAUSE,
        sortOrder: (i + 1) * ITEM_STEP,
      });
    });
    repairs.forEach((r, i) => {
      linkDefectTypeRepair.push({
        defectTypeId: d.id,
        repairId: r.id,
        isDefault: r.name === SEED_DEFAULT_REPAIR,
        sortOrder: (i + 1) * ITEM_STEP,
      });
    });
  }

  return {
    id: args.id,
    scope: args.scope,
    projectId: args.projectId,
    settingsVersion: SETTINGS_VERSION,
    snapshotFrom: null,
    members,
    defectTypes,
    causes,
    repairs,
    linkStructureMember,
    linkMemberDefectType,
    linkDefectTypeCause,
    linkDefectTypeRepair,
    createdAt: now,
    updatedAt: now,
    deviceId,
    createdBy: null,
  };
}

/** 첫 실행에 만드는 조직 마스터 문서 */
export function createOrgSettings(deviceId: string, now: number): ItemSettings {
  return createSeedSettings({
    id: ORG_SETTINGS_ID,
    scope: 'ORG',
    projectId: null,
    deviceId,
    now,
  });
}

// ── 다시 불러오기 (§2-7-e · F27) ───────────────────────────────────────────

export type MergeSeedResult = {
  settings: ItemSettings;
  added: { members: number; defectTypes: number; causes: number; repairs: number; links: number };
};

const key = (s: string): string => normalizeName(s).toLowerCase();

/**
 * **병합이다. 덮어쓰기가 아니다.**
 * 사용자가 고친 이름·순서·기본값·규모모드를 하나도 되돌리지 않는다.
 *
 * 판정 순서: ① 씨앗 id 가 살아 있으면 건너뛴다(이름을 고쳤어도 그 항목이다)
 *            ② 같은 이름의 마스터가 있으면 건너뛴다(사용자가 직접 만든 것을 중복 생성하지 않는다)
 *            ③ 그 외에만 추가한다
 *
 * 링크는 **새로 추가한 마스터가 낀 것만** 깐다. 사용자가 정리해 둔 조합을 되살리지 않는다.
 */
export function mergeSeedInto(s: ItemSettings, now: number): MergeSeedResult {
  const next: ItemSettings = {
    ...s,
    members: [...s.members],
    defectTypes: [...s.defectTypes],
    causes: [...s.causes],
    repairs: [...s.repairs],
    linkStructureMember: [...s.linkStructureMember],
    linkMemberDefectType: [...s.linkMemberDefectType],
    linkDefectTypeCause: [...s.linkDefectTypeCause],
    linkDefectTypeRepair: [...s.linkDefectTypeRepair],
    updatedAt: now,
  };
  const added = { members: 0, defectTypes: 0, causes: 0, repairs: 0, links: 0 };

  const newMemberIds: string[] = [];
  const newDefectTypeIds: string[] = [];

  // ① 부재
  const memberIds = new Set(next.members.map((m) => m.id));
  const memberNames = new Set(next.members.map((m) => key(m.name)));
  SEED_MEMBERS.forEach((seed, i) => {
    const id = seedMemberId(i);
    if (memberIds.has(id) || memberNames.has(key(seed.name))) return;
    next.members.push({
      id,
      name: seed.name,
      structural: seed.structural,
      createdAt: now,
      updatedAt: now,
    });
    newMemberIds.push(id);
    added.members += 1;
  });

  // ② 결함유형
  const dtIds = new Set(next.defectTypes.map((d) => d.id));
  const dtNames = new Set(next.defectTypes.map((d) => key(d.name)));
  SEED_DEFECT_TYPES.forEach((seed, i) => {
    const id = seedDefectTypeId(i);
    if (dtIds.has(id) || dtNames.has(key(seed.name))) return;
    next.defectTypes.push({
      id,
      name: seed.name,
      defaultSizeMode: seed.sizeMode,
      createdAt: now,
      updatedAt: now,
    });
    newDefectTypeIds.push(id);
    added.defectTypes += 1;
  });

  // ③ 발생원인 — 코드번호는 문서 안에서 유일해야 한다
  const causeIds = new Set(next.causes.map((c) => c.id));
  const causeNames = new Set(next.causes.map((c) => key(c.name)));
  const usedCodes = new Set(next.causes.map((c) => c.code));
  const newCauseIds: string[] = [];
  SEED_CAUSES.forEach((seed, i) => {
    const id = seedCauseId(i);
    if (causeIds.has(id) || causeNames.has(key(seed.name))) return;
    let code = seed.code;
    while (usedCodes.has(code)) code += 1;
    usedCodes.add(code);
    next.causes.push({ id, name: seed.name, code, createdAt: now, updatedAt: now });
    newCauseIds.push(id);
    added.causes += 1;
  });

  // ④ 보수방안
  const repairIds = new Set(next.repairs.map((r) => r.id));
  const repairNames = new Set(next.repairs.map((r) => key(r.name)));
  const newRepairIds: string[] = [];
  SEED_REPAIRS.forEach((name, i) => {
    const id = seedRepairId(i);
    if (repairIds.has(id) || repairNames.has(key(name))) return;
    next.repairs.push({ id, name, createdAt: now, updatedAt: now });
    newRepairIds.push(id);
    added.repairs += 1;
  });

  // ── 링크 — 새로 추가된 마스터가 낀 조합만 ────────────────────────────────
  const hasSM = new Set(next.linkStructureMember.map((l) => `${l.structureType}|${l.memberId}`));
  for (const st of STRUCTURE_TYPE_TABS as readonly StructureType[]) {
    const inTab = next.linkStructureMember.filter((l) => l.structureType === st);
    let order = inTab.reduce((mx, l) => Math.max(mx, l.sortOrder), 0);
    for (const memberId of newMemberIds) {
      if (hasSM.has(`${st}|${memberId}`)) continue;
      order += ITEM_STEP;
      next.linkStructureMember.push({ structureType: st, memberId, favorite: true, sortOrder: order });
      added.links += 1;
    }
  }

  const hasMD = new Set(next.linkMemberDefectType.map((l) => `${l.memberId}|${l.defectTypeId}`));
  const dtOf = new Map(next.defectTypes.map((d) => [d.id, d]));
  const allMemberIds = next.members.map((m) => m.id);
  for (const memberId of allMemberIds) {
    const isNewMember = newMemberIds.includes(memberId);
    // 새 부재면 결함유형 전부, 기존 부재면 **새 결함유형만** 붙인다
    const targets = isNewMember ? next.defectTypes.map((d) => d.id) : newDefectTypeIds;
    if (targets.length === 0) continue;
    let order = next.linkMemberDefectType
      .filter((l) => l.memberId === memberId)
      .reduce((mx, l) => Math.max(mx, l.sortOrder), 0);
    for (const defectTypeId of targets) {
      if (hasMD.has(`${memberId}|${defectTypeId}`)) continue;
      order += ITEM_STEP;
      next.linkMemberDefectType.push({
        memberId,
        defectTypeId,
        sizeMode: dtOf.get(defectTypeId)?.defaultSizeMode ?? 'WL',
        favorite: true,
        sortOrder: order,
      });
      added.links += 1;
    }
  }

  const hasDC = new Set(next.linkDefectTypeCause.map((l) => `${l.defectTypeId}|${l.causeId}`));
  const hasDR = new Set(next.linkDefectTypeRepair.map((l) => `${l.defectTypeId}|${l.repairId}`));
  for (const d of next.defectTypes) {
    const isNewType = newDefectTypeIds.includes(d.id);
    const causeTargets = isNewType ? next.causes.map((c) => c.id) : newCauseIds;
    const repairTargets = isNewType ? next.repairs.map((r) => r.id) : newRepairIds;

    let cOrder = next.linkDefectTypeCause
      .filter((l) => l.defectTypeId === d.id)
      .reduce((mx, l) => Math.max(mx, l.sortOrder), 0);
    let hasDefaultCause = next.linkDefectTypeCause.some(
      (l) => l.defectTypeId === d.id && l.isDefault,
    );
    for (const causeId of causeTargets) {
      if (hasDC.has(`${d.id}|${causeId}`)) continue;
      cOrder += ITEM_STEP;
      next.linkDefectTypeCause.push({
        defectTypeId: d.id,
        causeId,
        isDefault: !hasDefaultCause,
        sortOrder: cOrder,
      });
      hasDefaultCause = true;
      added.links += 1;
    }

    let rOrder = next.linkDefectTypeRepair
      .filter((l) => l.defectTypeId === d.id)
      .reduce((mx, l) => Math.max(mx, l.sortOrder), 0);
    let hasDefaultRepair = next.linkDefectTypeRepair.some(
      (l) => l.defectTypeId === d.id && l.isDefault,
    );
    for (const repairId of repairTargets) {
      if (hasDR.has(`${d.id}|${repairId}`)) continue;
      rOrder += ITEM_STEP;
      next.linkDefectTypeRepair.push({
        defectTypeId: d.id,
        repairId,
        isDefault: !hasDefaultRepair,
        sortOrder: rOrder,
      });
      hasDefaultRepair = true;
      added.links += 1;
    }
  }

  return { settings: next, added };
}

/** `부재 2개 · 결함유형 1개를 추가했습니다.` — 0 인 항목은 문구에서 뺀다 */
export function describeMergeResult(r: MergeSeedResult['added']): string {
  const parts: string[] = [];
  if (r.members > 0) parts.push(`부재 ${r.members}개`);
  if (r.defectTypes > 0) parts.push(`결함유형 ${r.defectTypes}개`);
  if (r.causes > 0) parts.push(`발생원인 ${r.causes}개`);
  if (r.repairs > 0) parts.push(`보수방안 ${r.repairs}개`);
  if (parts.length === 0) return '기본 항목이 이미 전부 있습니다. 추가한 항목이 없습니다.';
  return `${parts.join(' · ')}를 추가했습니다.`;
}
