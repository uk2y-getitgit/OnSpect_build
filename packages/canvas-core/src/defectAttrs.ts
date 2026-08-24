/**
 * `DefectAttrs` 초기값과 옛 레코드 정규화 — S4 스펙 §3-2 · §3-3.
 *
 * **필드가 늘어도 고쳐야 할 곳이 여기 하나다.**
 * 결함을 만드는 자리는 전부 `...EMPTY_DEFECT_ATTRS` 를 펼친다 —
 * 신규 생성 2곳(`interaction.ts`) · 테스트 헬퍼 · 샘플 데이터 · 저장소 읽기.
 *
 * ⚠️ `canvas-core` 는 이 값을 **해석하지 않는다.** 초기화와 정규화만 한다.
 *    다만 **필드별 메타데이터(초기값 · 키 목록 · 이어받기 여부)의 정본은 이 파일이다** (D13).
 *    `project-core` 는 이 상수들을 모른다 — 필드가 늘면 여기부터 고친다.
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
 * 직전 입력을 다음 결함으로 **이어받을지** 여부 (S6 · D9).
 *
 * `true` 는 "분류·판정" — 같은 부재·결함유형·원인·보수방안이 반복되는 것은
 * *"이 결함이 무엇인가"* 의 반복이다.
 * `false` 는 "측정값·개별정보" — 폭·길이·개소·위치보조·메모는 *"이 한 건이 어디에 얼마나"* 라
 * 결함마다 다르다. 이어받으면 엉뚱한 수치가 새 결함에 몰래 남는다.
 *
 * ⚠️ 배열이 아니라 **`Record<keyof DefectAttrs, boolean>`** 인 이유(J3):
 * 모든 키를 강제하므로 `DefectAttrs` 에 필드가 늘면 **타입 검사가 깨지고**
 * "이건 이어받나?" 를 그 자리에서 정하게 된다. 배열이면 새 필드가 아무도 모르게
 * "새로 받음" 으로 떨어진다.
 */
export const DEFECT_SEED_CARRY: Record<keyof DefectAttrs, boolean> = {
  // 폼에 노출되지 않고 어느 화면도 이 값을 바꾸지 않는다 — 이어받을 것이 없다 (J4)
  surveyKind: false,
  locationNote: false,
  structureType: true,

  memberId: true,
  memberName: true,
  structural: true,

  defectTypeId: true,
  defectTypeName: true,

  // 모드는 이어받고 **측정값은 매번 새로 받는다**
  sizeMode: true,
  widthMm: false,
  lengthMm: false,
  areaM2: false,
  areaWMm: false,
  areaHMm: false,
  countEa: false,

  progress: true,
  leak: true,

  causeId: true,
  causeName: true,
  repairId: true,
  repairName: true,

  memo: false,
};

/**
 * 직전 결함의 속성에서 **이어받는 필드만 골라 담는다** (S6 · D9).
 *
 * ⚠️ 이어받지 않는 필드는 `undefined` 를 넣는 것이 아니라 **키 자체를 만들지 않는다**(J1).
 * 결함 생성 자리는 전부 `{ ...EMPTY_DEFECT_ATTRS, ...(ctx.defectSeed ?? {}) }` 스프레드고,
 * 스프레드는 **값이 `undefined` 라도 키가 있으면 덮어쓴다.** 키를 만들면
 * `EMPTY_DEFECT_ATTRS.widthMm = null` 이 지워지고 `widthMm: undefined` 가 그대로
 * 저장 레코드까지 실려 간다 → `changedAttrKeys` 가 헛돌고 `normalizeDefectAttrs` 의
 * 조기 반환이 매번 깨진다.
 *
 * `memberId: null` 같은 **명시적 `null` 은 그대로 실린다** — 사용자가 부재를 비운 것을
 * "안 바뀜" 으로 되돌리면 안 된다.
 */
export function pickDefectSeed(a: DefectAttrs): Partial<DefectAttrs> {
  const out: Record<string, unknown> = {};
  for (const k of DEFECT_ATTR_KEYS) if (DEFECT_SEED_CARRY[k]) out[k] = a[k];
  return out as Partial<DefectAttrs>;
}

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
