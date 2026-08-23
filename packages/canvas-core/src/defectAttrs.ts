/**
 * `DefectAttrs` 초기값과 옛 레코드 정규화 — S4 스펙 §3-2 · §3-3.
 *
 * **필드가 늘어도 고쳐야 할 곳이 여기 하나다.**
 * 결함을 만드는 자리는 전부 `...EMPTY_DEFECT_ATTRS` 를 펼친다 —
 * 신규 생성 2곳(`interaction.ts`) · 테스트 헬퍼 · 샘플 데이터 · 저장소 읽기.
 *
 * ⚠️ `canvas-core` 는 이 값을 **해석하지 않는다.** 초기화와 정규화만 한다.
 */
import type { Defect, DefectAttrs, DefectSizeMode } from './types.js';

export const EMPTY_DEFECT_ATTRS: DefectAttrs = {
  surveyKind: 'EXTERIOR',
  locationNote: null,
  structureType: null,

  memberId: null,
  memberName: null,
  structural: null,

  defectTypeId: null,
  defectTypeName: null,

  sizeMode: 'WL',
  widthMm: null,
  lengthMm: null,
  areaM2: null,
  areaWMm: null,
  areaHMm: null,
  countEa: null,

  progress: 'NONE',
  leak: false,

  causeId: null,
  causeName: null,
  repairId: null,
  repairName: null,

  memo: null,
};

/**
 * `sizeMode` 가 없는 옛 레코드의 모드 추론 (§3-3).
 * 폭·길이가 있으면 WL, 아니고 면적이 있으면 AREA, 둘 다 없으면 WL.
 */
export function inferSizeMode(a: {
  widthMm?: number | null;
  lengthMm?: number | null;
  areaM2?: number | null;
}): DefectSizeMode {
  if ((a.widthMm ?? null) !== null || (a.lengthMm ?? null) !== null) return 'WL';
  if ((a.areaM2 ?? null) !== null) return 'AREA';
  return 'WL';
}

/**
 * 옛 결함 레코드를 읽는 즉시 채운다. **DB 버전을 올리지 않는다** —
 * S2a 의 `sketch` 처리와 같은 방식이다 (ASSUMPTIONS E11).
 *
 * `countEa` 가 null 이면 그대로 둔다. 읽을 때 1 로 해석하지, 저장 데이터를 조용히 바꾸지 않는다.
 */
export function normalizeDefectAttrs(d: Defect): Defect {
  const hasSketch = Array.isArray(d.sketch);
  const hasMode = d.sizeMode === 'WL' || d.sizeMode === 'AREA';
  // 이미 정규화된 레코드는 **같은 객체를 그대로 돌려준다** (참조 비교로 재렌더를 줄인다)
  if (
    hasSketch &&
    hasMode &&
    d.progress !== undefined &&
    d.surveyKind !== undefined &&
    d.prevDefectId !== undefined
  ) {
    return d;
  }
  return {
    ...EMPTY_DEFECT_ATTRS,
    ...d,
    sketch: hasSketch ? d.sketch : [],
    sizeMode: hasMode ? d.sizeMode : inferSizeMode(d),
    // F7 — 이전 필드가 없던 옛 레코드는 "전회차 참조 없음"으로 채운다
    prevDefectId: d.prevDefectId ?? null,
    surveyKind: d.surveyKind ?? EMPTY_DEFECT_ATTRS.surveyKind,
    progress: d.progress ?? EMPTY_DEFECT_ATTRS.progress,
    leak: d.leak ?? EMPTY_DEFECT_ATTRS.leak,
  };
}
