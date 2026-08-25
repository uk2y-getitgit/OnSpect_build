/**
 * 결함 리스트 (A4 세로) — Phase 4 스펙 §3-5 · K9 · Q35.
 *
 * ⭐ **손상결함표와 같은 `damageRow()` 를 쓰고 열만 줄인다.**
 *    행 계산을 복제하면 같은 결함이 두 표에서 다르게 보이고, 그건 조용히 틀린다.
 *
 * A4 세로 가용 폭 ≈ 180mm 에 13열은 들어가지 않는다. 뺀 4열
 * (`structural`·`progress`·`leak`·`cause`)은 손상결함표에서 확인하는 항목이고,
 * 리스트는 **현장 대조·검수용 빠른 목록**이다.
 *
 * 페이지네이션은 **CSS 가 정한다**(§3-5). 자바스크립트로 페이지당 행 수를 계산하지 않는다 —
 * 계산하면 폰트·확대율이 바뀔 때마다 어긋난다.
 */
import {
  buildDamageTable,
  type DamageColumnKey,
  type DamageTableInput,
  type DamageTableModel,
} from './damageTable.js';

/** 9열 축약 (K9). 서식이 바뀌면 이 배열만 고친다 */
export const DEFECT_LIST_COLUMNS: readonly DamageColumnKey[] = [
  'no',
  'location',
  'member',
  'defectType',
  'widthMm',
  'lengthMm',
  'areaM2',
  'countEa',
  'photoNo',
];

/** 결함 리스트 모델 — 같은 행 생성기에 열만 갈아 끼운다 */
export function buildDefectList(input: Omit<DamageTableInput, 'columns'>): DamageTableModel {
  return buildDamageTable({ ...input, columns: DEFECT_LIST_COLUMNS });
}
