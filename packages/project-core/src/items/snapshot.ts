/**
 * 과업 스냅샷 — **불변식 #7** (스펙 §2-4 · F8).
 *
 * 과업은 조직 설정을 **참조하지 않고 복사**한다.
 * 2025년 용어로 만든 보고서가 2026년 설정 변경으로 바뀌면 안 된다.
 *
 * 스냅샷은 **지연(lazy)** 이다. 일괄 마이그레이션을 돌리지 않고 DB 버전도 올리지 않는다 —
 * 용역을 처음 여는 시점에 `repo.ensureProjectSettings()` 가 여기를 부른다.
 */
import { SETTINGS_VERSION } from './types.js';
import type { ItemSettings } from './types.js';

/** 배열을 전부 새로 만든다. 원본과 어떤 객체도 공유하지 않는다 */
function cloneArrays(s: ItemSettings) {
  return {
    members: s.members.map((x) => ({ ...x })),
    defectTypes: s.defectTypes.map((x) => ({ ...x })),
    causes: s.causes.map((x) => ({ ...x })),
    repairs: s.repairs.map((x) => ({ ...x })),
    linkStructureMember: s.linkStructureMember.map((x) => ({ ...x })),
    linkMemberDefectType: s.linkMemberDefectType.map((x) => ({ ...x })),
    linkDefectTypeCause: s.linkDefectTypeCause.map((x) => ({ ...x })),
    linkDefectTypeRepair: s.linkDefectTypeRepair.map((x) => ({ ...x })),
  };
}

/**
 * ORG → 과업 스냅샷.
 * `snapshotFrom` 에 복사 시점의 `ORG.updatedAt` 을 남긴다 — 나중에 "언제 뜬 것인가"를 답할 수 있다.
 * **이후 ORG 가 바뀌어도 자동 반영하지 않는다.**
 */
export function snapshotForProject(
  org: ItemSettings,
  args: { projectId: string; deviceId: string; now: number },
): ItemSettings {
  return {
    id: args.projectId,
    scope: 'PROJECT',
    projectId: args.projectId,
    settingsVersion: SETTINGS_VERSION,
    snapshotFrom: org.updatedAt,
    ...cloneArrays(org),
    createdAt: args.now,
    updatedAt: args.now,
    deviceId: args.deviceId,
    createdBy: null,
  };
}

/**
 * `[이 설정을 기본값으로 저장]` — 과업 설정을 ORG 로 승격한다 (F1 · Q17).
 *
 * **이후 만드는 용역에만 반영된다.** 이미 스냅샷을 가진 용역은 바뀌지 않는다 (F2).
 * ORG 의 `createdAt` 은 유지한다 — 문서의 나이를 잃지 않기 위해서다.
 */
export function promoteToOrg(
  source: ItemSettings,
  org: ItemSettings | null,
  args: { deviceId: string; now: number },
): ItemSettings {
  return {
    id: org?.id ?? 'ORG',
    scope: 'ORG',
    projectId: null,
    settingsVersion: SETTINGS_VERSION,
    snapshotFrom: null,
    ...cloneArrays(source),
    createdAt: org?.createdAt ?? args.now,
    updatedAt: args.now,
    deviceId: args.deviceId,
    createdBy: null,
  };
}
