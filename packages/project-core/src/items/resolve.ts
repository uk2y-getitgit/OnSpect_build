/**
 * 접점 계층 — S3 설정과 S4 폼을 잇는 **유일한 API** (스펙 §2-3).
 *
 * 폼도 설정 화면도 링크 배열을 직접 훑지 않는다. 여기 있는 순수 함수만 부른다.
 * 저장 구조가 바뀌어도 호출자는 이 시그니처만 보면 된다.
 *
 * 정렬은 `sortOrder` 오름차순 하나뿐이다. **즐겨찾기(★)는 정렬을 바꾸지 않는다** (§2-5-b · F19) —
 * 순서까지 바꾸면 드래그로 맞춘 순서가 무의미해진다.
 */
import type { StructureType } from '../types.js';
import { sortItems } from './order.js';
import type {
  CauseMaster,
  DefectTypeMaster,
  ItemSettings,
  MemberMaster,
  RepairMaster,
  SizeMode,
  Structural,
} from './types.js';

export type MemberOption = {
  id: string;
  name: string;
  structural: Structural;
  favorite: boolean;
  /** T-3 — 태블릿 부재 선택지에 띄울지. `undefined` 는 켜짐이다 (D34) */
  tabletVisible?: boolean;
};

/**
 * T-3 (D34) — 태블릿에 띄울 부재인가.
 *
 * **`undefined` 를 켜짐으로 읽는 것이 이 함수의 전부다.** 옛 용역 스냅샷에는 필드가 없어서
 * `=== true` 로 쓰면 이미 쓰던 용역의 부재 칸이 통째로 빈다.
 */
export function isTabletVisible(m: { tabletVisible?: boolean }): boolean {
  return m.tabletVisible !== false;
}
export type DefectTypeOption = {
  id: string;
  name: string;
  sizeMode: SizeMode;
  favorite: boolean;
};
export type CauseOption = { id: string; name: string; code: number; isDefault: boolean };
export type RepairOption = { id: string; name: string; isDefault: boolean };

// ── 마스터 조회 ────────────────────────────────────────────────────────────
export function memberById(s: ItemSettings, id: string | null): MemberMaster | null {
  if (id === null) return null;
  return s.members.find((m) => m.id === id) ?? null;
}
export function defectTypeById(s: ItemSettings, id: string | null): DefectTypeMaster | null {
  if (id === null) return null;
  return s.defectTypes.find((d) => d.id === id) ?? null;
}
export function causeById(s: ItemSettings, id: string | null): CauseMaster | null {
  if (id === null) return null;
  return s.causes.find((c) => c.id === id) ?? null;
}
export function repairById(s: ItemSettings, id: string | null): RepairMaster | null {
  if (id === null) return null;
  return s.repairs.find((r) => r.id === id) ?? null;
}

// ── 목록 ───────────────────────────────────────────────────────────────────
/** 이 구조유형에 연결된 부재. 마스터가 없는 링크는 조용히 건너뛴다 */
export function membersOf(s: ItemSettings, st: StructureType): MemberOption[] {
  const links = sortItems(
    s.linkStructureMember.filter((l) => l.structureType === st),
    (l) => l.memberId,
  );
  const out: MemberOption[] = [];
  for (const l of links) {
    const m = memberById(s, l.memberId);
    if (!m) continue;
    out.push({
      id: m.id,
      name: m.name,
      structural: m.structural,
      favorite: l.favorite,
      tabletVisible: m.tabletVisible,
    });
  }
  return out;
}

/** 이 부재의 결함유형. `sizeMode` 는 **링크 값**이다 (마스터 기본값이 아니다) */
export function defectTypesOf(s: ItemSettings, memberId: string): DefectTypeOption[] {
  const links = sortItems(
    s.linkMemberDefectType.filter((l) => l.memberId === memberId),
    (l) => l.defectTypeId,
  );
  const out: DefectTypeOption[] = [];
  for (const l of links) {
    const d = defectTypeById(s, l.defectTypeId);
    if (!d) continue;
    out.push({ id: d.id, name: d.name, sizeMode: l.sizeMode, favorite: l.favorite });
  }
  return out;
}

export function causesOf(s: ItemSettings, defectTypeId: string): CauseOption[] {
  const links = sortItems(
    s.linkDefectTypeCause.filter((l) => l.defectTypeId === defectTypeId),
    (l) => l.causeId,
  );
  const out: CauseOption[] = [];
  for (const l of links) {
    const c = causeById(s, l.causeId);
    if (!c) continue;
    out.push({ id: c.id, name: c.name, code: c.code, isDefault: l.isDefault });
  }
  return out;
}

export function repairsOf(s: ItemSettings, defectTypeId: string): RepairOption[] {
  const links = sortItems(
    s.linkDefectTypeRepair.filter((l) => l.defectTypeId === defectTypeId),
    (l) => l.repairId,
  );
  const out: RepairOption[] = [];
  for (const l of links) {
    const r = repairById(s, l.repairId);
    if (!r) continue;
    out.push({ id: r.id, name: r.name, isDefault: l.isDefault });
  }
  return out;
}

/** 결함유형의 기본 발생원인. 없으면 null */
export function defaultCauseOf(s: ItemSettings, defectTypeId: string): CauseOption | null {
  return causesOf(s, defectTypeId).find((c) => c.isDefault) ?? null;
}

/** 결함유형의 기본 보수방안. 없으면 null */
export function defaultRepairOf(s: ItemSettings, defectTypeId: string): RepairOption | null {
  return repairsOf(s, defectTypeId).find((r) => r.isDefault) ?? null;
}

/**
 * 이 (부재, 결함유형) 조합의 규모모드. 링크가 없으면 마스터 기본값, 그것도 없으면 `'WL'`.
 * S4 `apply.ts` 가 결함유형 선택 시 이 값을 읽는다.
 */
export function sizeModeOf(s: ItemSettings, memberId: string | null, defectTypeId: string): SizeMode {
  if (memberId !== null) {
    const link = s.linkMemberDefectType.find(
      (l) => l.memberId === memberId && l.defectTypeId === defectTypeId,
    );
    if (link) return link.sizeMode;
  }
  return defectTypeById(s, defectTypeId)?.defaultSizeMode ?? 'WL';
}

/** `항목 17 · ★ 17` 표기용 (§2-5-b · F20) */
export function countOf(list: readonly { favorite: boolean }[]): {
  total: number;
  favorite: number;
} {
  let favorite = 0;
  for (const x of list) if (x.favorite) favorite += 1;
  return { total: list.length, favorite };
}
