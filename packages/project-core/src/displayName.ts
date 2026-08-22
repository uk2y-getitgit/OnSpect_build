/**
 * 표시명 생성 — S1 스펙 §2-5.
 *
 * ⚠️ **표시명은 저장하지 않는다. 매번 파생한다** (ASSUMPTIONS S1·D6).
 * 출력번호를 저장하지 않는 것(불변식 2)과 같은 원리다 —
 * 계산할 수 있는 것을 저장하면 규칙이 바뀔 때 기존 데이터가 옛 형식으로 굳는다.
 *
 * 형식: `{연도} {시기} {용역명} {구분}` · 구분자는 반각 공백 1개
 * 예:  `2026 상반기 ○○아파트 3차 정기안전점검`
 */
import { HALF_LABEL, KIND_LABEL, type Project } from './types.js';

/** 용역명이 비었을 때 미리보기에 쓰는 자리 표시 (§2-5) */
export const NAME_PLACEHOLDER = '____';

/** 저장 직전 1회 적용. 앞뒤 공백 제거 + 내부 연속 공백을 1개로 접는다 */
export function normalizeName(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

export function projectDisplayName(p: Project): string {
  return formatDisplayName(p.year, p.half, p.name, p.kind);
}

/**
 * 폼 미리보기용 — 아직 Project 레코드가 없는 상태에서도 쓴다.
 * 용역명이 비면 감추지 않고 자리를 비워 보여준다 (§2-5 "미리보기 자체를 감추지 않는다").
 */
export function formatDisplayName(
  year: number,
  half: Project['half'],
  name: string,
  kind: Project['kind'],
): string {
  const n = normalizeName(name);
  return `${year} ${HALF_LABEL[half]} ${n === '' ? NAME_PLACEHOLDER : n} ${KIND_LABEL[kind]}`;
}

/**
 * 검색 매칭 (§2-5) — 공백을 지우고 소문자로 비교한다.
 * `2026상반기아파트` 로도 찾힌다.
 */
export function squash(s: string): string {
  return s.toLowerCase().replace(/\s/g, '');
}

export function matchesQuery(query: string, p: Project): boolean {
  const q = squash(query);
  if (q === '') return true;
  return squash(projectDisplayName(p)).includes(q);
}

/** 오늘 날짜로부터 시기 기본값 — 1~6월이면 상반기 (§2-5) */
export function defaultHalf(now: Date): Project['half'] {
  return now.getMonth() < 6 ? 'H1' : 'H2';
}

/** 같은 (year, half, kind, name) 용역이 이미 있는가. 중복은 허용하되 경고한다 (§2-5) */
export function findDuplicate(
  projects: readonly Project[],
  draft: { year: number; half: Project['half']; kind: Project['kind']; name: string },
  excludeId?: string,
): Project | null {
  const n = normalizeName(draft.name);
  return (
    projects.find(
      (p) =>
        p.id !== excludeId &&
        p.deletedAt === null &&
        p.year === draft.year &&
        p.half === draft.half &&
        p.kind === draft.kind &&
        normalizeName(p.name) === n,
    ) ?? null
  );
}
