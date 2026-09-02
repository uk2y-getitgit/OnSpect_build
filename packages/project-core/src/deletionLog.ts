/**
 * 삭제 전파 장치 — Phase 5 스펙 §6-1 T1-3 (D25 · Q58 B안).
 *
 * `Building`·`Floor`·`Drawing`·`Defect`·`Photo`·`Memo` 는 지금처럼 **하드 삭제**를 유지한다.
 * 대신 `meta` KV 에 `deleted:{projectId}` 키로 삭제 기록을 함께 남긴다(`exportRun:`·`lastView:`
 * 와 같은 수법 — 스토어·인덱스·`DB_VERSION` 무변경).
 *
 * 이 기록은 **지금 아무도 읽지 않는다.** 나중에 T1-7(동기화 API)이 서버로 push 할 때 쓸
 * 재료다 — "지운 것이 다음 동기화에 되살아난다"(Q58)는 사고를 막는다.
 *
 * ⚠️ 이 파일은 순수 로직만 갖는다(경계 규칙 9). `meta` 스토어를 실제로 읽고 쓰는 것은
 * `apps/web/src/data/idb/deletionLog.ts` 다.
 */

export type DeletionKind = 'BUILDING' | 'FLOOR' | 'DRAWING' | 'DEFECT' | 'PHOTO' | 'MEMO';

const DELETION_KINDS: readonly DeletionKind[] = [
  'BUILDING',
  'FLOOR',
  'DRAWING',
  'DEFECT',
  'PHOTO',
  'MEMO',
];

export type DeletionEntry = {
  kind: DeletionKind;
  id: string;
  /** 삭제된 시각 */
  at: number;
  deviceId: string;
};

/** `meta` 스토어 키 접두사 — 스토어를 새로 만들지 않는다(K2 와 같은 수법) */
export const DELETION_LOG_KEY_PREFIX = 'deleted:';

export function deletionLogKey(projectId: string): string {
  return `${DELETION_LOG_KEY_PREFIX}${projectId}`;
}

export function isDeletionEntry(v: unknown): v is DeletionEntry {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Partial<DeletionEntry>;
  return (
    typeof r.kind === 'string' &&
    (DELETION_KINDS as readonly string[]).includes(r.kind) &&
    typeof r.id === 'string' &&
    r.id !== '' &&
    typeof r.at === 'number' &&
    Number.isFinite(r.at) &&
    typeof r.deviceId === 'string'
  );
}

/** 저장된 값은 믿지 않는다 — 옛 버전·다른 탭이 망가뜨린 값이 들어오면 배열 전체를 버린다 */
export function isDeletionLog(v: unknown): v is DeletionEntry[] {
  return Array.isArray(v) && v.every(isDeletionEntry);
}

/**
 * 삭제 기록 1건을 더한다. **같은 (kind, id) 는 먼저 지우고 새로 넣는다** — 같은 레코드가
 * 두 번 지워질 일은 없지만(하드 삭제라 두 번째는 대상이 없다), 중복이 쌓이지 않게 방어한다.
 * 부수효과 없음.
 */
export function appendDeletion(
  log: readonly DeletionEntry[],
  entry: DeletionEntry,
): DeletionEntry[] {
  return [...log.filter((e) => !(e.kind === entry.kind && e.id === entry.id)), entry];
}

/**
 * 되돌리기(Ctrl+Z)로 살아난 항목을 삭제 기록에서 뺀다(D25).
 * id 는 전역에서 유일하므로(`newId()`) kind 를 가리지 않고 지운다.
 *
 * 뺄 것이 없으면 **같은 배열 참조를 그대로 돌려준다** — 호출부가 이걸로 "쓸 필요가
 * 있었는가"를 판단해 불필요한 `meta` 쓰기를 건너뛴다.
 */
export function removeDeletions(
  log: readonly DeletionEntry[],
  ids: readonly string[],
): DeletionEntry[] {
  if (ids.length === 0 || log.length === 0) return log as DeletionEntry[];
  const doomed = new Set(ids);
  const next = log.filter((e) => !doomed.has(e.id));
  return next.length === log.length ? (log as DeletionEntry[]) : next;
}
