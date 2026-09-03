/**
 * 항목 4단 계층 (부재 · 결함유형 · 발생원인 · 보수방안) — S3 스펙 §2-2.
 *
 * **불변식 #6: 마스터 + 연결.** 원인·보수방안을 결함유형에 직접 종속시키지 않는다.
 * 문서(`ItemSettings`) 하나가 설정 한 벌이고, 문서 **안쪽은 정규화**를 유지한다 —
 * 중첩하면 `건조수축` 이 결함유형 수만큼 복제되고 코드번호가 흩어진다 (함정 #4).
 *
 * ⚠️ 순수 TS. DOM · IndexedDB · 난수 · 시간을 참조하지 않는다.
 *    새 id 와 현재 시각은 **전부 인자로 받는다** (`IdGen` · `now`).
 */
import type { RecordBase, StructureType } from '../types.js';

/** 구조체 / 비구조체 — 손상결함표 `구조체 유형` 열 */
export type Structural = 'STRUCTURAL' | 'NON_STRUCTURAL';

/** 폭×길이 / 면적 */
export type SizeMode = 'WL' | 'AREA';

/** 마스터 항목 4종의 공통 필드 */
export type MasterBase = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

/**
 * `tabletVisible` — T-3 (D30 · D34). 태블릿(현장) 결함정보 폼의 부재 선택지에 띄울지.
 *
 * **`undefined` 는 "켜짐" 이다.** 이미 저장된 용역 스냅샷에는 이 필드가 없다 —
 * 없으면 꺼짐으로 읽으면 이미 쓰던 용역의 부재 칸이 통째로 비어 현장에서 입력을 못 한다.
 * 판정은 반드시 `isTabletVisible()` 로 한다(`m.tabletVisible === true` 로 쓰지 마라).
 *
 * 이름을 코드에 박지 않는다(D30) — 새 용역의 초기값만 `seed.ts` 가 정하고,
 * 그 뒤로는 PC 항목설정에서 사용자가 켜고 끈다.
 */
export type MemberMaster = MasterBase & { structural: Structural; tabletVisible?: boolean };
export type DefectTypeMaster = MasterBase & { defaultSizeMode: SizeMode };
/** `code` 는 손상결함표 `발생원인 추정` 열에 그대로 인쇄된다. 문서 안에서 유일 (§2-5-f) */
export type CauseMaster = MasterBase & { code: number };
export type RepairMaster = MasterBase;

export type LinkStructureMember = {
  structureType: StructureType;
  memberId: string;
  favorite: boolean;
  sortOrder: number;
};

export type LinkMemberDefectType = {
  memberId: string;
  defectTypeId: string;
  /**
   * **이 (부재, 결함유형) 조합의 규모모드.**
   * 마스터의 `defaultSizeMode` 는 링크를 만들 때의 초기값일 뿐이다 (§2-2).
   */
  sizeMode: SizeMode;
  favorite: boolean;
  sortOrder: number;
};

export type LinkDefectTypeCause = {
  defectTypeId: string;
  causeId: string;
  isDefault: boolean;
  sortOrder: number;
};

export type LinkDefectTypeRepair = {
  defectTypeId: string;
  repairId: string;
  isDefault: boolean;
  sortOrder: number;
};

/**
 * 설정 한 벌 = `itemSettings` 레코드 1건 (§2-1).
 *
 * `id` 는 `'ORG'` 또는 `projectId` 다. 읽기는 **항상 기본키로** 한다 —
 * `by_project` 인덱스는 쓰지 않는다 (ORG 는 `projectId` 가 null 이라 인덱스에 안 들어간다).
 */
export type ItemSettings = RecordBase & {
  id: string;
  scope: 'ORG' | 'PROJECT';
  /** ORG 이면 null */
  projectId: string | null;
  /** 문서 내부 형식 버전. **DB schemaVersion 과 별개다** */
  settingsVersion: number;
  /** 스냅샷을 뜬 시점의 `ORG.updatedAt`. null = ORG 문서 자신 */
  snapshotFrom: number | null;

  members: MemberMaster[];
  defectTypes: DefectTypeMaster[];
  causes: CauseMaster[];
  repairs: RepairMaster[];

  linkStructureMember: LinkStructureMember[];
  linkMemberDefectType: LinkMemberDefectType[];
  linkDefectTypeCause: LinkDefectTypeCause[];
  linkDefectTypeRepair: LinkDefectTypeRepair[];
};

/** 마스터 4종 구분 — 삭제·이름변경이 공통 함수 하나로 처리된다 */
export type ItemKind = 'MEMBER' | 'DEFECT_TYPE' | 'CAUSE' | 'REPAIR';

// ── 상수 ───────────────────────────────────────────────────────────────────
/** 전역(조직) 마스터 문서의 기본키 */
export const ORG_SETTINGS_ID = 'ORG';
/** 문서 내부 형식 버전 */
export const SETTINGS_VERSION = 1;
/** 항목 sortOrder 격자. 층과 같은 STEP=10 (음수 규약은 여기에 없다) */
export const ITEM_STEP = 10;
/** 항목 이름 길이 상한 (§2-5-b) */
export const ITEM_NAME_MAX = 40;

/** 구조유형 탭 순서 — 젠트릭스 실측 그대로 `RC · SS · SRC` (§2-5-a) */
export const STRUCTURE_TYPE_TABS: readonly StructureType[] = ['RC', 'SS', 'SRC'];

export const STRUCTURE_TYPE_LABEL: Record<StructureType, string> = {
  RC: 'RC',
  SS: 'SS',
  SRC: 'SRC',
};

export const STRUCTURAL_LABEL: Record<Structural, string> = {
  STRUCTURAL: '구조체',
  NON_STRUCTURAL: '비구조체',
};

export const SIZE_MODE_LABEL: Record<SizeMode, string> = {
  WL: '폭×길이',
  AREA: '면적',
};

export const ITEM_KIND_LABEL: Record<ItemKind, string> = {
  MEMBER: '부재',
  DEFECT_TYPE: '결함유형',
  CAUSE: '발생원인',
  REPAIR: '보수방안',
};

/** 새 id 생성기. `project-core` 는 난수를 만들지 않는다 — 어댑터가 넣어 준다 */
export type IdGen = () => string;
