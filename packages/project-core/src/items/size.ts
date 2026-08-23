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
