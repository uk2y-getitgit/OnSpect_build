/**
 * 미완성 결함 판정 — D3 (Q1 답변: A안, 점을 찍는 즉시 저장).
 *
 * ⚠️ 플래그를 **저장하지 않는다.** 필수항목 충족 여부에서 파생한다.
 * 저장하면 항목설정이 바뀔 때마다 플래그가 진실과 어긋난다.
 *
 * Phase 4 출력 경고가 이 함수를 그대로 재사용한다.
 * D3: 미완성이라고 출력에서 조용히 빼지 않는다 — **경고만** 한다.
 */
import type { Defect } from './types.js';

/** 결함 1건이 성립하기 위한 필수항목 */
export const REQUIRED_FIELDS = ['memberName', 'defectTypeName'] as const;

export type MissingField = (typeof REQUIRED_FIELDS)[number];

const FIELD_LABEL: Record<MissingField, string> = {
  memberName: '부재',
  defectTypeName: '결함유형',
};

function isBlank(v: string | null | undefined): boolean {
  return v === null || v === undefined || v.trim() === '';
}

/** 비어 있는 필수항목 목록 */
export function missingFields(defect: Defect): MissingField[] {
  const out: MissingField[] = [];
  if (isBlank(defect.memberName)) out.push('memberName');
  if (isBlank(defect.defectTypeName)) out.push('defectTypeName');
  return out;
}

export function isIncomplete(defect: Defect): boolean {
  return missingFields(defect).length > 0;
}

export function countIncomplete(defects: readonly Defect[]): number {
  let n = 0;
  for (const d of defects) if (isIncomplete(d)) n += 1;
  return n;
}

/** "부재 · 결함유형 미입력" 같은 사람이 읽는 문구 */
export function describeMissing(defect: Defect): string {
  const m = missingFields(defect);
  if (m.length === 0) return '';
  return `${m.map((f) => FIELD_LABEL[f]).join(' · ')} 미입력`;
}
