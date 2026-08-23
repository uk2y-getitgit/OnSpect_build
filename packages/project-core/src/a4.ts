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

// ── F5-3 도면 크기 조절 ────────────────────────────────────────────────────
/**
 * 도면 그림이 A4 지면 안에서 차지하는 배율. Numdraw 실측값 그대로.
 *
 * ⚠️ **넘버링 좌표는 절대 함께 옮기지 않는다** (F5-3 원문). Numdraw 는 배율이 바뀌면
 * 넘버링 좌표를 같은 비율로 이동시켰지만, 우리 좌표는 0~1 정규화(불변식 #1)라
 * 그 코드를 이식하면 **두 번 변환되어 어긋난다.**
 */
export const MIN_SCALE = 0.3;
export const MAX_SCALE = 2.5;
export const DEFAULT_SCALE = 1;

/** 범위 밖·NaN·null 을 전부 안전한 숫자로 만든다 (Numdraw `clampScale` 이식) */
export function clampScale(v: unknown): number {
  const n = Number(v) || DEFAULT_SCALE;
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, n));
}

/** 도면 영역 — A4 캔버스 안에서 실제 도면 그림이 차지하는 사각형 (F5-4) */
export type ImgLayout = { offX: number; offY: number; dW: number; dH: number };

/**
 * 원본(natW×natH)을 A4 캔버스(a4w×a4h) 안에 배치할 사각형을 계산한다.
 *   · 상하좌우 10mm 여백
 *   · 하단 20mm 도곽(F5-1 TitleBlock) 예약
 *   · 남는 영역 안에서 비율을 유지하며 최대로 키운다(contain), 중앙 배치
 *
 * `scale`(F5-3)은 그 contain 결과에 곱하는 **도면 크기 조절** 값이다. 1 이 기본이고,
 * 1 을 넘으면 A4 지면 밖으로 넘쳐 잘릴 수 있다(Numdraw 와 같은 동작). 중앙 배치는 유지된다.
 */
export function calcFitRect(
  natW: number,
  natH: number,
  a4w: number = A4_LANDSCAPE.w,
  a4h: number = A4_LANDSCAPE.h,
  scale: number = DEFAULT_SCALE,
): FitRect {
  // 가로면 297mm 기준으로 px/mm 를 구한다(landscape 고정이므로 항상 297:210)
  const pxMm = a4w / 297;
  const mPx = Math.round(10 * pxMm);
  const tbPx = Math.round(20 * pxMm);
  const avW = a4w - 2 * mPx;
  const avH = Math.max(10, a4h - 2 * mPx - tbPx);

  const safeW = Math.max(1, natW);
  const safeH = Math.max(1, natH);
  const scl = Math.min(avW / safeW, avH / safeH) * clampScale(scale);

  const w = Math.max(1, Math.round(safeW * scl));
  const h = Math.max(1, Math.round(safeH * scl));
  const x = Math.round(mPx + (avW - w) / 2);
  const y = Math.round(mPx + (avH - h) / 2);
  return { x, y, w, h };
}

export function fitRectToImgLayout(r: FitRect): ImgLayout {
  return { offX: r.x, offY: r.y, dW: r.w, dH: r.h };
}

// ── F1 재정규화 — 기존 도면을 A4 로 맞추기 ─────────────────────────────────
/**
 * ⚠️ **실사용자 데이터의 좌표를 바꾸는 조작이다.**
 *
 * 정규화 좌표(불변식 #1)는 "그 도면 렌더 이미지 전체(0~1)" 기준이다. A4 로 맞추면
 * 같은 그림이 이제 A4 지면 안의 **일부 사각형**(`imgLayout`)에만 놓인다.
 * 옛 좌표를 그대로 두면 모든 표기가 흰 여백 쪽으로 밀려 보인다.
 *
 * 변환식 (AD15):
 *   `newNorm = (imgLayout.off + oldNorm × imgLayout.d) / a4Size`
 *
 * 순수 아핀 변환이라 정확히 역이 있다 — 되돌리기가 수학적으로 보장된다.
 */
export type NormPoint = { x: number; y: number };

/** 변환 계수. 점·크기 어디에나 이 하나로 적용한다 */
export type A4Transform = { ox: number; oy: number; sx: number; sy: number };

export function a4Transform(
  layout: ImgLayout,
  a4: { w: number; h: number } = A4_LANDSCAPE,
): A4Transform {
  return {
    ox: layout.offX / a4.w,
    oy: layout.offY / a4.h,
    sx: layout.dW / a4.w,
    sy: layout.dH / a4.h,
  };
}

/** 옛 좌표 → A4 지면 좌표 */
export function toA4Norm(p: NormPoint, t: A4Transform): NormPoint {
  return { x: t.ox + p.x * t.sx, y: t.oy + p.y * t.sy };
}

/** A4 지면 좌표 → 옛 좌표 (되돌리기) */
export function fromA4Norm(p: NormPoint, t: A4Transform): NormPoint {
  return { x: (p.x - t.ox) / t.sx, y: (p.y - t.oy) / t.sy };
}

/**
 * **크기**(영역의 w·h)는 오프셋 없이 배율만 곱한다.
 * 위치와 같은 함수를 쓰면 크기에 여백이 더해져 도형이 커진다.
 */
export function scaleA4Size(size: NormPoint, t: A4Transform): NormPoint {
  return { x: size.x * t.sx, y: size.y * t.sy };
}

export function unscaleA4Size(size: NormPoint, t: A4Transform): NormPoint {
  return { x: size.x / t.sx, y: size.y / t.sy };
}

/** 이미 A4 정규화된 도면인가 — 그러면 [A4로 맞추기]가 할 일이 없다 */
export function isA4Normalized(d: {
  imgLayout: ImgLayout | null;
  imageWidth: number;
  imageHeight: number;
}): boolean {
  return (
    d.imgLayout !== null &&
    d.imageWidth === A4_LANDSCAPE.w &&
    d.imageHeight === A4_LANDSCAPE.h
  );
}
