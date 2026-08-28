/**
 * 결함 리스트 인쇄 뷰 (A4 세로 9열) — Phase 4 스펙 §3-5 · §4-9.
 *
 * 표 본체는 `PrintDamageTable` 과 **같은 컴포넌트**다 (PhotoPolish §2-9).
 * 결함 리스트는 병합 머리도 원인 범례도 쓰지 않는다 — **플래그로 명시한다**
 * (`DEFECT_LIST_COLUMNS` 도 `group: '손상규모'` 를 갖고 있어 자동 판정이면 조용히 켜진다).
 */
import type { DamageTableModel } from '@onspect/project-core';
import { PrintDamageTable } from './PrintDamageTable';

export function PrintDefectList({ model }: { model: DamageTableModel }) {
  return (
    <PrintDamageTable model={model} subtitle="결함 리스트" groupHeader={false} legend={false} />
  );
}
