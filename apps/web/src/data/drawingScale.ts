/**
 * F5-3 · P-1 — 도면 이미지 배율 적용. **계산은 여기 한 벌뿐이다.**
 *
 * 진입점이 둘이다: 도면관리(`ProjectSetup`) 와 캔버스 상단바(`CanvasRoute`, P-1).
 * 두 곳에서 각자 계산하면 `imgLayout` 스케일링(`scaledImgLayout`)이 갈라져
 * 같은 도면이 어디서 열었느냐에 따라 다른 크기로 합성된다.
 *
 * ⚠️ **결함·메모 좌표는 한 글자도 건드리지 않는다** (불변식 #1 — 좌표는 0~1 정규화).
 *    바뀌는 것은 `imgScale`(숫자) 과 `imgLayout`(A4 지면 안 도면 영역) 둘뿐이고,
 *    합성된 이미지는 저장소가 아니라 런타임 캐시(`canvas/drawingComposite`)에만 들어간다.
 *    → 저장 스키마 변경 0 · **DB_VERSION 1 유지** · `renormalizeAll` 과 무관하다.
 */
import { clampScale, type Drawing } from '@onspect/project-core';
import { scaledImgLayout } from './imageIngest';

/**
 * `imgLayout` 이 없는 옛 도면(A4 정규화 전 등록)에 대한 거부 문구.
 *
 * ⚠️ 여기서 자동으로 A4 정규화를 돌리면 `renormalizeAll` 이 **기존 결함 좌표를 전부 옮긴다.**
 *    절대 하지 않는다. 사용자가 [A4로 맞추기]를 직접 눌러야 한다.
 */
export const SCALE_NEEDS_A4_MESSAGE =
  '이 도면은 A4 정규화 전에 등록되었습니다. 먼저 [A4로 맞추기]를 해주세요';

export type DrawingScaleResult =
  /** `imgLayout` 이 없다 — 호출부는 `SCALE_NEEDS_A4_MESSAGE` 를 경고 토스트로 띄운다 */
  | { ok: false }
  /** 적용할 다음 도면 레코드. 호출부가 상태 갱신 · 캐시 해제 · repo 저장을 한다 */
  | { ok: true; drawing: Drawing; scale: number };

export function applyDrawingScale(dw: Drawing, raw: number, now = Date.now()): DrawingScaleResult {
  if (!dw.imgLayout) return { ok: false };
  const next = clampScale(raw);
  const from = clampScale(dw.imgScale ?? 1);
  return {
    ok: true,
    scale: next,
    drawing: {
      ...dw,
      imgScale: next,
      imgLayout: scaledImgLayout(dw.imgLayout, from, next),
      updatedAt: now,
    },
  };
}

/** 적용 완료 토스트 문구 — 두 진입점이 같은 말을 하도록 */
export function drawingScaleAppliedMessage(scale: number): string {
  return `도면 크기를 ${Math.round(scale * 100)}%로 바꿨습니다`;
}
