/**
 * 사진 자르기·주석 좌표 변환 — PhotoPolish 스펙 §2-1. **이 라운드의 심장이다.**
 *
 * ⭐ **기준 프레임 = 렌더 프레임**
 * ```
 * 렌더 프레임 = renderBlobKey 의 래스터 (EXIF 방향 이미 적용됨 · Photo.width/height 가 그 크기)
 *            = edits.rotate 를 적용하기 **전**
 * ```
 * `PhotoEdits.crop` · `PhotoAnnotation.points` · `from/to` 는 **전부 렌더 프레임 0~1 정규화**다
 * (불변식 #1 과 같은 이유 — 픽셀 금지).
 *
 * ⭐ **합성 순서는 화면과 출력이 똑같이 쓴다**
 * ```
 * 렌더본  →  주석 그리기  →  자르기(crop)  →  회전(rotate)
 * ```
 * 주석을 자르기 **전에** 그리므로 잘려 나간 영역의 획이 자동으로 사라지고(별도 클리핑 불필요),
 * 좌표가 항상 자르기 전 프레임 기준이라 **자른 뒤에 다시 자르기를 열어도 주석이 안 움직인다.**
 *
 * 편집기는 **사용자가 보는 대로(= 회전이 적용된 표시 프레임)** 조작하고, 저장 직전에 되돌린다.
 * 90° 배수라 정확한 변환이고, 왕복 항등이 단위테스트로 고정돼 있다.
 *
 * | rotate | 표시→렌더 (toSource) | 렌더→표시 (toDisplay) |
 * |---|---|---|
 * | 0   | `x=u, y=v`     | `u=x, v=y`     |
 * | 90  | `x=v, y=1-u`   | `u=1-y, v=x`   |
 * | 180 | `x=1-u, y=1-v` | `u=1-x, v=1-y` |
 * | 270 | `x=1-v, y=u`   | `u=y, v=1-x`   |
 *
 * 경계: **순수 함수다.** DOM·Blob·시간·난수를 참조하지 않는다.
 */
import type { PhotoRotate } from './photo.js';

export type Pt = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

/** 자르기 최소 크기 — 각 축 5%. 그보다 작게 끌면 멈춘다 (§2-3) */
export const CROP_MIN_SIZE = 0.05;

/**
 * `PhotoAnnotation.width` 3단 프리셋 — **렌더 프레임 장변 대비 비율(0~1)**. 픽셀이 아니다.
 *
 * 픽셀로 두면 자르기·출력 배율이 바뀔 때마다 선 굵기가 상대적으로 달라진다
 * (= 자르면 선이 얇아진다). 장변 2048 기준 8px / 16px / 29px.
 */
export const ANNOTATION_WIDTHS = { THIN: 0.004, NORMAL: 0.008, THICK: 0.014 } as const;
export type AnnotationWidthKey = keyof typeof ANNOTATION_WIDTHS;

/**
 * 주석 색 2종 — 디자인시스템 §3 대조 (§2-1).
 * 빨강은 `--defect-current` 와 같은 값이다: 사진 위 빨간 화살표는 안전진단 보고서의 관행이고
 * 의미도 정확히 같다("여기가 그 결함이다"). **2색 이상 늘리지 않는다.**
 */
export const ANNOTATION_COLORS = { RED: '#e5342a', YELLOW: '#ffd400' } as const;
export type AnnotationColorKey = keyof typeof ANNOTATION_COLORS;

/** 화살촉 길이 = 굵기 × 이 값 (§2-4) */
export const ARROW_HEAD_RATIO = 4;
/** 화살촉 벌어짐 각 ±25° */
export const ARROW_HEAD_ANGLE = (25 * Math.PI) / 180;

/** 저장 좌표·굵기 반올림 — 0.0001 × 2048 ≈ 0.2px 이라 눈에 안 보이고 레코드가 1/3 로 준다 */
export const ROUND4 = (n: number): number =>
  Number.isFinite(n) ? Math.round(n * 1e4) / 1e4 : 0;

// ── 점 ─────────────────────────────────────────────────────────────────────

/** 표시 프레임 → 렌더 프레임 (저장 직전에 부른다) */
export function toSourcePoint(p: Pt, rotate: PhotoRotate): Pt {
  switch (rotate) {
    case 90:
      return { x: p.y, y: 1 - p.x };
    case 180:
      return { x: 1 - p.x, y: 1 - p.y };
    case 270:
      return { x: 1 - p.y, y: p.x };
    default:
      return { x: p.x, y: p.y };
  }
}

/** 렌더 프레임 → 표시 프레임 (편집기를 열 때 부른다) */
export function toDisplayPoint(p: Pt, rotate: PhotoRotate): Pt {
  switch (rotate) {
    case 90:
      return { x: 1 - p.y, y: p.x };
    case 180:
      return { x: 1 - p.x, y: 1 - p.y };
    case 270:
      return { x: p.y, y: 1 - p.x };
    default:
      return { x: p.x, y: p.y };
  }
}

// ── 사각형 ─────────────────────────────────────────────────────────────────
// ⚠️ 90/270 이면 **가로·세로가 맞바뀐다.** 점 변환만 두 번 하면 음수 폭이 나온다

/** 표시 프레임 사각형 → 렌더 프레임 사각형 */
export function toSourceRect(r: Rect, rotate: PhotoRotate): Rect {
  switch (rotate) {
    case 90:
      return { x: r.y, y: 1 - r.x - r.w, w: r.h, h: r.w };
    case 180:
      return { x: 1 - r.x - r.w, y: 1 - r.y - r.h, w: r.w, h: r.h };
    case 270:
      return { x: 1 - r.y - r.h, y: r.x, w: r.h, h: r.w };
    default:
      return { x: r.x, y: r.y, w: r.w, h: r.h };
  }
}

/** 렌더 프레임 사각형 → 표시 프레임 사각형 */
export function toDisplayRect(r: Rect, rotate: PhotoRotate): Rect {
  switch (rotate) {
    case 90:
      return { x: 1 - r.y - r.h, y: r.x, w: r.h, h: r.w };
    case 180:
      return { x: 1 - r.x - r.w, y: 1 - r.y - r.h, w: r.w, h: r.h };
    case 270:
      return { x: r.y, y: 1 - r.x - r.w, w: r.h, h: r.w };
    default:
      return { x: r.x, y: r.y, w: r.w, h: r.h };
  }
}

/**
 * `[0,1]` 안으로 넣고 최소 크기를 보장한다.
 * 음수 폭·높이(반대 방향 드래그)도 여기서 정상화한다.
 */
export function clampRect(r: Rect, min: number = CROP_MIN_SIZE): Rect {
  const lo = Math.max(0, Math.min(1, min));
  // 반대 방향으로 끈 사각형을 먼저 바로잡는다
  let x = r.w < 0 ? r.x + r.w : r.x;
  let y = r.h < 0 ? r.y + r.h : r.y;
  let w = Math.abs(r.w);
  let h = Math.abs(r.h);

  w = Math.min(1, Math.max(lo, w));
  h = Math.min(1, Math.max(lo, h));
  x = Math.max(0, Math.min(1 - w, x));
  y = Math.max(0, Math.min(1 - h, y));
  return { x, y, w, h };
}

/**
 * 사실상 전체인가 — 각 값이 `0`/`1` 과 `eps` 이내면 **자르기를 저장하지 않는다**(`crop = null`).
 * 미세하게 어긋난 사각형이 레코드에 남아 "잘렸다" 배지가 뜨는 것을 막는다 (§2-3).
 */
export function isFullRect(r: Rect, eps = 0.001): boolean {
  return (
    Math.abs(r.x) <= eps &&
    Math.abs(r.y) <= eps &&
    Math.abs(r.w - 1) <= eps &&
    Math.abs(r.h - 1) <= eps
  );
}

/** 저장 직전 반올림 (§2-1) */
export function roundRect(r: Rect): Rect {
  return { x: ROUND4(r.x), y: ROUND4(r.y), w: ROUND4(r.w), h: ROUND4(r.h) };
}

export function roundPoint(p: Pt): Pt {
  return { x: ROUND4(p.x), y: ROUND4(p.y) };
}

// ── 화살촉 ─────────────────────────────────────────────────────────────────

/**
 * 화살촉 두 날개의 끝점.
 *
 * ⚠️ **등방 좌표계(픽셀)에서 부른다.** 정규화 좌표를 그대로 넣으면 종횡비 때문에
 * 촉이 찌그러진다 — 호출자가 `×W`, `×H` 를 먼저 곱한다.
 * 화면 SVG 와 출력 Canvas 가 **같은 함수를 쓰게 하려는 것이 이 함수의 존재 이유**다
 * (`<marker>` 를 쓰면 Canvas 가 그것을 흉내 낼 수 없다).
 *
 * 길이 0 이면 두 점 모두 `to` 를 돌려준다 — 호출자가 분기하지 않아도 된다.
 */
export function arrowHeadPoints(from: Pt, to: Pt, headLen: number): [Pt, Pt] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0 || !Number.isFinite(len) || headLen <= 0) {
    return [{ ...to }, { ...to }];
  }
  // 촉이 화살표 몸통보다 길어지지 않게 한다 (짧은 화살표에서 뒤집힌 것처럼 보인다)
  const L = Math.min(headLen, len);
  const a = Math.atan2(dy, dx);
  return [
    { x: to.x - L * Math.cos(a - ARROW_HEAD_ANGLE), y: to.y - L * Math.sin(a - ARROW_HEAD_ANGLE) },
    { x: to.x - L * Math.cos(a + ARROW_HEAD_ANGLE), y: to.y - L * Math.sin(a + ARROW_HEAD_ANGLE) },
  ];
}

/**
 * 정규화 굵기(장변 대비) → 그리기 공간의 실제 선 굵기.
 * 화면 SVG(`viewBox` 표시 픽셀)와 출력 Canvas 가 같은 식을 쓴다.
 */
export function strokePx(width: number, frameW: number, frameH: number): number {
  return Math.max(1, width * Math.max(frameW, frameH));
}
