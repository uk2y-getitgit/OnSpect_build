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

/**
 * `DefectAttrs` 의 키 목록. **`EMPTY_DEFECT_ATTRS` 하나에서 파생**하므로
 * 필드가 늘어도 이 배열을 손댈 일이 없다.
 */
export const DEFECT_ATTR_KEYS = Object.keys(EMPTY_DEFECT_ATTRS) as (keyof DefectAttrs)[];

/**
 * `Defect` 에서 **도메인 속성만** 떼어 낸다 (S2b).
 * 폼은 `marks`·`label`·`style` 을 절대 보지 않는다 — 넘기지도 않는다(§4-2 경계).
 */
export function attrsOf(d: DefectAttrs): DefectAttrs {
  const out = {} as Record<string, unknown>;
  for (const k of DEFECT_ATTR_KEYS) out[k] = d[k];
  return out as DefectAttrs;
}

/**
 * 바뀐 속성 키 목록. 값이 같으면 빈 배열이다 (얕은 비교 — 모든 필드가 원시값이다).
 *
 * S2b 는 이 결과를 **Undo 병합 키**로 쓴다. `폭` 프리셋을 여섯 번 누르면
 * 매번 `['widthMm']` 이 나오므로 한 단계로 묶이고, 부재를 바꾸면 여러 키가 함께
 * 바뀌어 키 문자열이 달라지므로 앞 조작과 섞이지 않는다.
 */
export function changedAttrKeys(from: DefectAttrs, to: DefectAttrs): (keyof DefectAttrs)[] {
  const out: (keyof DefectAttrs)[] = [];
  for (const k of DEFECT_ATTR_KEYS) if (from[k] !== to[k]) out.push(k);
  return out;
}
