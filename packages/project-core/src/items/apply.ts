/**
 * 결함 속성 연동 규칙 — S4 스펙 §3-6 · §4-2. 전부 순수 함수.
 *
 * 폼(`DefectInfoForm`)은 값을 그리기만 하고, 필드 하나를 바꿨을 때 다른 필드가
 * 어떻게 따라가는지는 여기서만 계산한다. RN·Phase 4 출력이 같은 함수를 다시 쓴다.
 *
 * ⚠️ canvas-core 를 import 하지 않는다(D13). 필요한 필드만 담은 로컬 타입(`AttrsLike`)을
 * 쓴다 — apps/web 이 실제 `DefectAttrs` 값을 그대로 넘겨도 구조적 타이핑으로 맞는다.
 * 제네릭(`<T extends AttrsLike>`)이라 `progress`·`leak`·`memo` 같은 이 파일이 모르는
 * 필드도 입력 그대로 보존된다.
 */
import type { StructureType } from '../types.js';
import {
  causesOf,
  defaultCauseOf,
  defaultRepairOf,
  defectTypeById,
  defectTypesOf,
  memberById,
  membersOf,
  repairsOf,
  sizeModeOf,
} from './resolve.js';
import type { ItemSettings, SizeMode, Structural } from './types.js';

export type AttrsLike = {
  structureType: StructureType | null;
  memberId: string | null;
  memberName: string | null;
  structural: Structural | null;
  defectTypeId: string | null;
  defectTypeName: string | null;
  sizeMode: SizeMode;
  causeId: string | null;
  causeName: string | null;
  repairId: string | null;
  repairName: string | null;
};

const CLEAR_MEMBER_DOWN = {
  memberId: null,
  memberName: null,
  structural: null,
  defectTypeId: null,
  defectTypeName: null,
  causeId: null,
  causeName: null,
  repairId: null,
  repairName: null,
} as const;

const CLEAR_DEFECT_TYPE_DOWN = {
  defectTypeId: null,
  defectTypeName: null,
  causeId: null,
  causeName: null,
  repairId: null,
  repairName: null,
} as const;

/**
 * 구조유형을 바꾼다. 부재 목록이 갈린다 — 현재 부재가 새 목록에 없으면
 * 부재·결함유형·원인·보수방안을 전부 비운다(§3-6). 규모 숫자·모드는 건드리지 않는다 —
 * 실수로 값을 잃는 것이 가장 나쁘다(F15 와 같은 원리).
 *
 * 이 함수는 "비웠는지" 를 알려주지 않는다 — 안내 토스트(`이 구조유형에는 '{부재}' 가
 * 없어 선택을 해제했습니다`)는 호출자가 호출 전/후 `memberId` 를 비교해 띄운다.
 * 순수 함수에 토스트 문구를 심으면 RN 에서 재사용할 수 없다.
 */
export function setStructureType<T extends AttrsLike>(a: T, s: ItemSettings, v: StructureType): T {
  const validMembers = membersOf(s, v);
  const memberStillValid = a.memberId !== null && validMembers.some((m) => m.id === a.memberId);
  if (memberStillValid) return { ...a, structureType: v };
  return { ...a, structureType: v, ...CLEAR_MEMBER_DOWN };
}

/**
 * 부재를 바꾼다.
 *   ① `structural` 을 **새 부재의 기본값으로 되돌린다** (수동 지정 해제 — F16)
 *   ② 결함유형 목록이 갈린다. 현재 결함유형이 새 목록에 있으면 유지, 없으면 비운다
 */
export function setMember<T extends AttrsLike>(a: T, s: ItemSettings, memberId: string): T {
  const m = memberById(s, memberId);
  if (!m) return a;
  const validTypes = defectTypesOf(s, memberId);
  const typeStillValid = a.defectTypeId !== null && validTypes.some((d) => d.id === a.defectTypeId);
  const base: T = { ...a, memberId: m.id, memberName: m.name, structural: m.structural };
  if (typeStillValid) return base;
  return { ...base, ...CLEAR_DEFECT_TYPE_DOWN };
}

/**
 * 결함유형을 바꾼다.
 *   ① `sizeMode` ← 그 (부재, 결함유형) 링크의 값 (마스터 기본값이 아니다)
 *   ② 원인·보수방안: 현재 값이 새 목록에 있으면 유지, 없으면 새 기본값으로 교체
 *   ③ 규모 숫자(폭·길이·면적…)는 건드리지 않는다 — 모드가 바뀌어도 값은 유지된다(F15)
 */
export function setDefectType<T extends AttrsLike>(a: T, s: ItemSettings, defectTypeId: string): T {
  const dt = defectTypeById(s, defectTypeId);
  if (!dt) return a;

  const causes = causesOf(s, defectTypeId);
  const causeStillValid = a.causeId !== null && causes.some((c) => c.id === a.causeId);
  const causePatch = causeStillValid
    ? { causeId: a.causeId, causeName: a.causeName }
    : optionToFields(defaultCauseOf(s, defectTypeId), 'causeId', 'causeName');

  const repairs = repairsOf(s, defectTypeId);
  const repairStillValid = a.repairId !== null && repairs.some((r) => r.id === a.repairId);
  const repairPatch = repairStillValid
    ? { repairId: a.repairId, repairName: a.repairName }
    : optionToFields(defaultRepairOf(s, defectTypeId), 'repairId', 'repairName');

  return {
    ...a,
    defectTypeId: dt.id,
    defectTypeName: dt.name,
    sizeMode: sizeModeOf(s, a.memberId, defectTypeId),
    ...causePatch,
    ...repairPatch,
  };
}

/**
 * 규모모드를 그 자리에서 바꾼다. **반대편 값은 지우지 않는다** (§3-5-b · F15) —
 * 되돌아오면 그대로 복원된다. `widthMm`/`lengthMm`/`areaM2` 등은 이 함수가 모르는
 * 필드라도(`AttrsLike` 에 없다) 스프레드로 그대로 보존된다.
 */
export function setSizeMode<T extends AttrsLike>(a: T, mode: SizeMode): T {
  return { ...a, sizeMode: mode };
}

/**
 * 새 결함에 설정 기본값을 얹을 **패치**를 만든다 — 프로젝트 기본 구조유형만 채운다.
 * 부재·결함유형은 "기본값" 개념이 없어(사용자가 현장에서 고르는 값) 여기서 정하지 않는다.
 *
 * ⚠️ 이 함수는 `DefectAttrs` 전체가 아니라 **패치**(`Partial`)를 돌려준다 — 나머지 필드의
 * 초기값(`EMPTY_DEFECT_ATTRS`)은 canvas-core 소관이고 이 패키지는 그 상수를 모른다(D13).
 * 호출자(apps/web)가 `{ ...EMPTY_DEFECT_ATTRS, ...seedAttrs(settings, project) }` 로 합친다.
 */
export function seedAttrs(
  _s: ItemSettings,
  project: { defaultStructureType: StructureType | null },
): Partial<AttrsLike> {
  if (!project.defaultStructureType) return {};
  return { structureType: project.defaultStructureType };
}

// ── 내부 헬퍼 ────────────────────────────────────────────────────────────────
function optionToFields<IdKey extends string, NameKey extends string>(
  opt: { id: string; name: string } | null,
  idKey: IdKey,
  nameKey: NameKey,
): Record<IdKey, string | null> & Record<NameKey, string | null> {
  return {
    [idKey]: opt?.id ?? null,
    [nameKey]: opt?.name ?? null,
  } as Record<IdKey, string | null> & Record<NameKey, string | null>;
}
