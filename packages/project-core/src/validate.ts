/**
 * 폼 검증 — S1 스펙 §2-5 / §2-6 / §2-7.
 *
 * 결과는 `{ ok:true }` 또는 `{ ok:false, field, message }`.
 * **메시지는 화면에 그대로 나간다.** 사용자가 무엇을 고쳐야 하는지 말해야 한다.
 */
import { normalizeName } from './displayName.js';

export type Invalid = { ok: false; field: string; message: string };
export type Valid = { ok: true };
export type ValidationResult = Valid | Invalid;

export const OK: Valid = { ok: true };

export const YEAR_MIN = 2000;
export const YEAR_MAX = 2100;
export const PROJECT_NAME_MAX = 60;
export const BUILDING_NAME_MAX = 40;
export const FLOOR_NAME_MAX = 30;
export const DRAWING_NAME_MAX = 80;

export function validateYear(raw: unknown): ValidationResult {
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').trim());
  if (!Number.isInteger(n)) return { ok: false, field: 'year', message: '연도를 숫자로 입력해 주세요' };
  if (n < YEAR_MIN || n > YEAR_MAX) {
    return { ok: false, field: 'year', message: `${YEAR_MIN} ~ ${YEAR_MAX} 사이로 입력해 주세요` };
  }
  return OK;
}

export function validateProjectName(raw: string): ValidationResult {
  const n = normalizeName(raw);
  if (n === '') return { ok: false, field: 'name', message: '용역명을 입력해 주세요' };
  if (n.length > PROJECT_NAME_MAX) {
    return { ok: false, field: 'name', message: `${PROJECT_NAME_MAX}자 이내로 입력해 주세요` };
  }
  return OK;
}

export function validateBuildingName(raw: string): ValidationResult {
  const n = normalizeName(raw);
  if (n === '') return { ok: false, field: 'buildingName', message: '동 이름을 입력해 주세요' };
  if (n.length > BUILDING_NAME_MAX) {
    return { ok: false, field: 'buildingName', message: `${BUILDING_NAME_MAX}자 이내로 입력해 주세요` };
  }
  return OK;
}

export function validateFloorName(raw: string): ValidationResult {
  const n = normalizeName(raw);
  if (n === '') return { ok: false, field: 'floorName', message: '층 이름을 입력해 주세요' };
  if (n.length > FLOOR_NAME_MAX) {
    return { ok: false, field: 'floorName', message: `${FLOOR_NAME_MAX}자 이내로 입력해 주세요` };
  }
  return OK;
}

export function validateDrawingName(raw: string): ValidationResult {
  const n = normalizeName(raw);
  if (n === '') return { ok: false, field: 'drawingName', message: '도면 이름을 입력해 주세요' };
  if (n.length > DRAWING_NAME_MAX) {
    return { ok: false, field: 'drawingName', message: `${DRAWING_NAME_MAX}자 이내로 입력해 주세요` };
  }
  return OK;
}

/** 용역 등록 폼 전체 — 첫 번째 오류 하나만 돌려준다 (폼은 위에서부터 고친다) */
export function validateProjectForm(draft: { year: unknown; name: string }): ValidationResult {
  const y = validateYear(draft.year);
  if (!y.ok) return y;
  return validateProjectName(draft.name);
}

/**
 * 이전 회차 순환 금지 (§2-4) — `prev` 사슬을 따라가다 자기 자신을 만나면 안 된다.
 * `chainOf(id)` 는 그 용역의 `prevProjectId` 를 돌려준다.
 */
export function wouldCycle(
  selfId: string,
  candidatePrevId: string | null,
  prevOf: (id: string) => string | null,
): boolean {
  if (!candidatePrevId) return false;
  if (candidatePrevId === selfId) return true;
  const seen = new Set<string>([selfId]);
  let cur: string | null = candidatePrevId;
  while (cur) {
    if (seen.has(cur)) return true;
    seen.add(cur);
    cur = prevOf(cur);
  }
  return false;
}
