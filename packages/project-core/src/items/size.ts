/**
 * 규모(폭×길이 / 면적) 계산 — S4 스펙 §3-5-c · 함정 #6. 전부 순수 함수.
 *
 * 면적(㎡) = (폭mm ÷ 1000) × (길이mm ÷ 1000), 소수 4자리 **절사**(반올림 아님).
 * **개소는 어디에도 곱하지 않는다** — 면적은 1개소 기준값이다(실측: 개소2인데 0.0004).
 *
 * ⚠️ canvas-core 를 import 하지 않는다(D13). 필요한 필드만 담은 로컬 타입(`SizeInput`)을 쓴다 —
 * 실제 `DefectAttrs` 값을 그대로 넘겨도 구조적 타이핑으로 맞는다.
 */
import type { SizeMode } from './types.js';

export type SizeInput = {
  sizeMode: SizeMode;
  widthMm: number | null;
  lengthMm: number | null;
  /** AREA 모드의 직접 입력값 */
  areaM2: number | null;
  countEa: number | null;
};

/** 소수 4자리 **절사**. 부동소수 잡음 방지용 ε 를 더한다 */
export function trunc4(m2: number): number {
  return Math.trunc(m2 * 1e4 + 1e-9) / 1e4;
}

/**
 * 두 mm 값의 면적(㎡). **mm² 로 곱한 뒤 나눈다** — 0.0001 × 2.5 처럼 미리 나누면
 * 부동소수 오차가 커져 실측 4행 중 일부가 틀린다(F17).
 */
export function areaFromMm(widthMm: number, lengthMm: number): number {
  return trunc4((widthMm * lengthMm) / 1e6);
}

/**
 * 표시·출력이 쓰는 실효 면적.
 * WL 이면 폭·길이에서 파생(둘 다 있을 때만), AREA 면 저장된 직접 입력값.
 */
export function effectiveAreaM2(a: SizeInput): number | null {
  if (a.sizeMode === 'AREA') return a.areaM2;
  if (a.widthMm === null || a.lengthMm === null) return null;
  return areaFromMm(a.widthMm, a.lengthMm);
}

/**
 * 손상결함표 4열. **개소는 어디에도 곱하지 않는다.**
 * `sizeMode === 'AREA'` 면 폭·길이는 **0** 으로 낸다(실측 누수흔적 행 `0 / 0 / 0.5`).
 * 가로×세로로 계산해 넣은 경우도 저장 시점에 `areaM2` 로 합쳐지므로 마찬가지로 0 이다(Q19 · F4).
 */
export function outputSize(a: SizeInput): {
  widthMm: number;
  lengthMm: number;
  areaM2: number;
  countEa: number;
} {
  const countEa = a.countEa ?? 1;
  if (a.sizeMode === 'AREA') {
    return { widthMm: 0, lengthMm: 0, areaM2: a.areaM2 ?? 0, countEa };
  }
  const widthMm = a.widthMm ?? 0;
  const lengthMm = a.lengthMm ?? 0;
  return { widthMm, lengthMm, areaM2: areaFromMm(widthMm, lengthMm), countEa };
}

/* ------------------------------------------------------------------ *
 * C-3 (D31) — 면적 직접입력 폐지 후, 값의 **출처**를 판정한다.
 *
 * 면적 칸은 이제 읽기전용이다. 그런데 이미 저장된 결함 중에는 `areaM2` 만 있고
 * `areaWMm`·`areaHMm` 가 `null` 인 것이 있다 — 예전 "AREA(직접)" 입력분이다.
 * 이 값은 손상결함표에 그대로 인쇄되므로 **지우지 않는다.** 화면에도 그대로 보여준다.
 * ------------------------------------------------------------------ */

/** 면적의 출처 판정에 필요한 필드만. `DefectAttrs` 를 그대로 넘겨도 구조적 타이핑으로 맞는다 */
export type RectAreaInput = {
  areaM2: number | null;
  areaWMm: number | null;
  areaHMm: number | null;
};

/**
 * - `RECT` — 가로·세로가 둘 다 있다. 면적은 여기서 파생된다
 * - `LEGACY_DIRECT` — 가로·세로 없이 면적만 있다. 예전 직접입력분(D31)
 * - `EMPTY` — 아직 아무 값도 없다
 */
export type AreaSource = 'RECT' | 'LEGACY_DIRECT' | 'EMPTY';

export function areaSource(a: RectAreaInput): AreaSource {
  if (a.areaWMm !== null && a.areaHMm !== null && a.areaWMm > 0 && a.areaHMm > 0) return 'RECT';
  if (a.areaM2 !== null) return 'LEGACY_DIRECT';
  return 'EMPTY';
}

/**
 * 면적 칸에 **보여줄** 값.
 * 가로·세로가 있으면 거기서 계산하고(저장된 `areaM2` 와 어긋나도 계산이 이긴다),
 * 없으면 저장된 직접입력값을 그대로 보여준다.
 */
export function displayAreaM2(a: RectAreaInput): number | null {
  if (areaSource(a) === 'RECT') return areaFromMm(a.areaWMm as number, a.areaHMm as number);
  return a.areaM2;
}

/**
 * 가로·세로를 고쳤을 때 **저장할** `areaM2`.
 *
 * 둘 다 있을 때만 덮어쓴다(D31 "가로·세로를 새로 입력하면 그때 덮어쓴다").
 * 하나라도 비어 있으면 이전 값을 **그대로 둔다** — 옛 직접입력값이 조작 중에
 * 사라지지 않게 하기 위해서다(F15 "모드를 전환해도 반대편 값을 지우지 않는다" 와 같은 원칙).
 */
export function resolveAreaM2OnRectEdit(
  prevAreaM2: number | null,
  areaWMm: number | null,
  areaHMm: number | null,
): number | null {
  if (areaWMm !== null && areaHMm !== null && areaWMm > 0 && areaHMm > 0) {
    return areaFromMm(areaWMm, areaHMm);
  }
  return prevAreaM2;
}
