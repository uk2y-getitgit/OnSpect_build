/**
 * F5-3 · P-1 — 도면 이미지 배율 적용. **계산은 여기 한 벌뿐이다.**
 *
 * 진입점이 둘이다: 도면관리(`ProjectSetup`) 와 캔버스 상단바(`CanvasRoute`, P-1).
 * 두 곳에서 각자 계산하면 `imgLayout` 스케일링(`scaledImgLayout`)이 갈라져
 * 같은 도면이 어디서 열었느냐에 따라 다른 크기로 합성된다.
 *
 * ## 2026-09-03 — **결함 좌표가 도면을 따라간다** (사용자 지시로 F5-3 규칙 뒤집음)
 *
 * 예전에는 배율을 바꿔도 좌표를 안 건드렸다. 좌표가 **A4 지면** 기준 0~1 정규화라
 * 그게 "안전한" 선택처럼 보였지만, 실제로는 도면 그림만 커지고 결함 표기는 제자리에 남아
 * **가리키던 위치에서 떨어져 나갔다.** 사용자: *"도면크기가 변경되면 결함위치도 같이 가야함"*.
 *
 * 이제 배율을 바꾸면 그 도면의 결함·메모 좌표를 **옛 배치 → 새 배치**로 옮긴다.
 * 변환은 이미 있던 것을 그대로 쓴다 — `a4Transform`(도면-로컬 ↔ A4 지면) 두 번 태우면 끝이다.
 * `[A4로 맞추기]`(`renormalizeAll`)와 **같은 기계**를 쓰므로 계산이 두 벌로 갈라지지 않는다.
 *
 * ⚠️ 저장 스키마는 그대로다 — 바뀌는 것은 `imgScale`·`imgLayout` 과 **좌표값**뿐이다.
 *    새 필드가 없으니 **DB_VERSION 1 유지**.
 */
import { a4Transform, clampScale, type Drawing, type ImgLayout } from '@onspect/project-core';
import type { NormTransform } from '@onspect/canvas-core';
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
  /**
   * 적용할 다음 도면 레코드. 호출부가 상태 갱신 · 캐시 해제 · repo 저장을 한다.
   *
   * `transform` 은 **이 도면의 결함·메모 좌표에 그대로 먹이면 되는 변환**이다
   * (`transformAll`). 배율이 그대로면 항등 변환이라 좌표가 한 글자도 안 바뀐다.
   */
  | { ok: true; drawing: Drawing; scale: number; transform: NormTransform };

/**
 * 옛 배치 → 새 배치 좌표 변환.
 *
 * 좌표는 **A4 지면** 기준 0~1 이다. 도면 그림이 A4 안에서 움직였으니
 * `A4 → 도면-로컬`(옛 배치) → `도면-로컬 → A4`(새 배치) 를 이어 붙이면 된다.
 * 두 단계 모두 `a4Transform` 이 이미 만들어 준다.
 */
export function layoutTransform(from: ImgLayout, to: ImgLayout): NormTransform {
  const t0 = a4Transform(from);
  const t1 = a4Transform(to);
  const sx = t1.sx / t0.sx;
  const sy = t1.sy / t0.sy;
  return { sx, sy, ox: t1.ox - t0.ox * sx, oy: t1.oy - t0.oy * sy };
}

export function applyDrawingScale(dw: Drawing, raw: number, now = Date.now()): DrawingScaleResult {
  if (!dw.imgLayout) return { ok: false };
  const next = clampScale(raw);
  const from = clampScale(dw.imgScale ?? 1);
  const layout = scaledImgLayout(dw.imgLayout, from, next);
  return {
    ok: true,
    scale: next,
    transform: layoutTransform(dw.imgLayout, layout),
    drawing: { ...dw, imgScale: next, imgLayout: layout, updatedAt: now },
  };
}

/** 적용 완료 토스트 문구 — 두 진입점이 같은 말을 하도록 */
export function drawingScaleAppliedMessage(scale: number): string {
  return `도면 크기를 ${Math.round(scale * 100)}%로 바꿨습니다`;
}
