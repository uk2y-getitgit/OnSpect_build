/**
 * 결함정보 폼의 프리셋 값표 — S4 스펙 §3-5-d, 한 파일에 모은다.
 *
 * ⚠️ **폭(mm)은 단일값 버튼이다 (DECISIONS.md D7).**
 * `[0.1][0.2][0.3][0.4][0.5][0.5 초과→직접입력]` — 구간 표기(`0.1~0.2mm`)를 쓰지 않는다.
 * D7 은 plan-reviewer 스펙(§3-5-d 의 구간 상한표)을 사용자가 직접 뒤집은 최종 결정이다.
 * 대표값 해석 논쟁 자체가 사라진다: 버튼을 누르면 **그 숫자가 그대로** 보고서 폭 열에 찍힌다.
 */

/** 폭(mm) 단일값 버튼 (D7). `0.5 초과` 는 별도 상수(WIDTH_OVER)로 다룬다 — 직접입력 전환용이지 프리셋이 아니다 */
export const WIDTH_PRESETS: readonly number[] = [0.1, 0.2, 0.3, 0.4, 0.5];
/** `0.5 초과 → 직접입력` 을 누르면 직접입력 모드로 전환하며 이 값을 초기값으로 채운다 (D7) */
export const WIDTH_OVER_INITIAL = 0.5;
export const WIDTH_STEP = 0.1;

/** 길이(mm) — 5열×3행 15종 */
export const LENGTH_PRESETS: readonly number[] = [
  100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1200, 1500, 1800, 2000, 3000,
];
export const LENGTH_STEP = 100;

/** 가로·세로(mm, AREA 의 보조 계산기) — 길이와 같은 15종을 쓴다 */
export const RECT_SIDE_PRESETS: readonly number[] = LENGTH_PRESETS;
export const RECT_SIDE_STEP = LENGTH_STEP;

/** 개소(EA) — 5열×2행 */
export const COUNT_PRESETS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const COUNT_STEP = 1;

/** 면적(㎡) — 4열×2행 */
export const AREA_PRESETS: readonly number[] = [0.1, 0.25, 0.5, 1, 2, 3, 5, 10];
export const AREA_STEP = 0.1;
