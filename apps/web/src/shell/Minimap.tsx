/**
 * 미니맵 (T2-4 · 스펙 `50_plan-reviewer_spec_Phase5_TeamSync.md` §6-2).
 *
 * 도면 축소 썸네일 위에 지금 뷰포트를 사각형으로 얹는다. 탭하면 그 지점이 화면
 * 중앙으로 온다 — 이동은 **새로 만들지 않는다.** `CENTER_ON_NORM`(Phase5 트랙A,
 * `packages/canvas-core/src/viewport.ts` · `interaction.ts` 643행)을 그대로 쓴다.
 * 코어는 이 파일의 존재를 모른다.
 *
 * 썸네일은 새 이미지를 따로 로드하지 않는다. 캔버스가 이미 그리고 있는
 * `drawingUrl`(디코드된 같은 이미지)을 CSS 로 축소해 재사용한다.
 */
import { useRef } from 'react';
import { clamp01, toNorm, type NPoint, type Size, type Viewport } from '@onspect/canvas-core';

export type MinimapProps = {
  drawingUrl: string | null;
  imageWidth: number;
  imageHeight: number;
  viewport: Viewport;
  /** `state.canvas.canvas` — 캔버스 요소의 스크린 크기 (px) */
  canvas: Size;
  onCenterOn: (n: NPoint) => void;
};

export function Minimap({
  drawingUrl,
  imageWidth,
  imageHeight,
  viewport,
  canvas,
  onCenterOn,
}: MinimapProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);

  if (!drawingUrl || imageWidth <= 0 || imageHeight <= 0) return null;

  // 지금 화면에 보이는 영역을 도면 정규화 좌표로 — 화면 좌상단·우하단을 역변환한다
  const tl = toNorm({ x: 0, y: 0 }, viewport, imageWidth, imageHeight);
  const br = toNorm({ x: canvas.w, y: canvas.h }, viewport, imageWidth, imageHeight);
  const left = clamp01(tl.x);
  const top = clamp01(tl.y);
  const right = clamp01(br.x);
  const bottom = clamp01(br.y);

  const tap = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = boxRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    onCenterOn({
      x: clamp01((e.clientX - r.left) / r.width),
      y: clamp01((e.clientY - r.top) / r.height),
    });
  };

  return (
    <div className="minimap" data-floating>
      <div
        ref={boxRef}
        className="minimap__box"
        style={{ aspectRatio: `${imageWidth} / ${imageHeight}` }}
        role="button"
        tabIndex={0}
        aria-label="미니맵 — 탭하면 그 지점으로 이동합니다"
        onPointerDown={tap}
        onKeyDown={(e) => {
          // 키보드 사용자에게 최소한의 통로 — 가운데로 이동
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onCenterOn({ x: 0.5, y: 0.5 });
          }
        }}
      >
        <img className="minimap__img" src={drawingUrl} alt="" draggable={false} />
        <div
          className="minimap__viewport"
          style={{
            left: `${left * 100}%`,
            top: `${top * 100}%`,
            width: `${Math.max(0, right - left) * 100}%`,
            height: `${Math.max(0, bottom - top) * 100}%`,
          }}
        />
      </div>
    </div>
  );
}
