/**
 * F1 — 도면 사이즈 통일. Numdraw 실측 방식을 그대로 이식한다
 * (`_workspace/12_수정사항_S3중간.md` §F1 — 원본 Numdraw 코드는 예약 실행 환경에 없다.
 * 이 문서가 원본을 대신한다).
 *
 * 150 DPI 고정. 원본 이미지를 A4 캔버스에 **contain 배치**하고, 그 A4 캔버스를
 * 도면으로 삼는다. 방향은 **A4 가로 고정**이다(사용자 명시 — Numdraw 처럼 자동판별하지 않는다).
 *
 * ⚠️ 순수 계산. DOM 을 참조하지 않는다 — 실제 합성(canvas 그리기)은 apps/web 이 한다.
 */

/** 150 DPI 기준 mm→px 환산 */
export const A4_DPI = 150;
export const A4_PX_PER_MM = A4_DPI / 25.4;

/** A4 가로(landscape) 고정 크기 — Numdraw 실측과 동일 */
export const A4_LANDSCAPE = { w: 1754, h: 1240 } as const;

export type FitRect = { x: number; y: number; w: number; h: number };

/** 도면 영역 — A4 캔버스 안에서 실제 도면 그림이 차지하는 사각형 (F5-4) */
export type ImgLayout = { offX: number; offY: number; dW: number; dH: number };

/**
 * 원본(natW×natH)을 A4 캔버스(a4w×a4h) 안에 배치할 사각형을 계산한다.
 *   · 상하좌우 10mm 여백
 *   · 하단 20mm 도곽(F5-1 TitleBlock) 예약
 *   · 남는 영역 안에서 비율을 유지하며 최대로 키운다(contain), 중앙 배치
 */
export function calcFitRect(
  natW: number,
  natH: number,
  a4w: number = A4_LANDSCAPE.w,
  a4h: number = A4_LANDSCAPE.h,
): FitRect {
  // 가로면 297mm 기준으로 px/mm 를 구한다(landscape 고정이므로 항상 297:210)
  const pxMm = a4w / 297;
  const mPx = Math.round(10 * pxMm);
  const tbPx = Math.round(20 * pxMm);
  const avW = a4w - 2 * mPx;
  const avH = Math.max(10, a4h - 2 * mPx - tbPx);

  const safeW = Math.max(1, natW);
  const safeH = Math.max(1, natH);
  const scl = Math.min(avW / safeW, avH / safeH);

  const w = Math.max(1, Math.round(safeW * scl));
  const h = Math.max(1, Math.round(safeH * scl));
  const x = Math.round(mPx + (avW - w) / 2);
  const y = Math.round(mPx + (avH - h) / 2);
  return { x, y, w, h };
}

export function fitRectToImgLayout(r: FitRect): ImgLayout {
  return { offX: r.x, offY: r.y, dW: r.w, dH: r.h };
}
