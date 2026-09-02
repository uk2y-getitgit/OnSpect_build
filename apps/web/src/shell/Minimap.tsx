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
import { useEffect, useRef, useState } from 'react';
import {
  clamp01,
  fitViewport,
  toNorm,
  toScreen,
  type NPoint,
  type Size,
  type Viewport,
} from '@onspect/canvas-core';

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
  /**
   * `.minimap__box` 는 `width:130px` 고정 + `max-height:100px` 인데, 세로로 긴 도면은
   * `object-fit:contain` 이 좌우로 레터박스를 만든다(code-reviewer 66번 문서 [보통1]).
   * 탭 좌표·뷰포트 사각형 둘 다 "박스 전체" 가 아니라 **실제로 이미지가 그려지는
   * 사각형** 기준이어야 한다. CSS 를 흉내 낸 별도 계산을 새로 만들지 않고, 박스를
   * "캔버스" 삼아 도면을 그 안에 맞추는 `fitViewport`(마진 0)를 그대로 재사용한다 —
   * `object-fit:contain` 과 동일한 산식(짧은 축 기준 축소 + 가운데 정렬)이다. 코어에
   * 새 함수를 추가하지 않는다.
   */
  const [boxSize, setBoxSize] = useState<Size>({ w: 0, h: 0 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const report = () => {
      const r = el.getBoundingClientRect();
      setBoxSize({ w: r.width, h: r.height });
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!drawingUrl || imageWidth <= 0 || imageHeight <= 0) return null;

  // 지금 화면에 보이는 영역을 도면 정규화 좌표로 — 화면 좌상단·우하단을 역변환한다
  const tl = toNorm({ x: 0, y: 0 }, viewport, imageWidth, imageHeight);
  const br = toNorm({ x: canvas.w, y: canvas.h }, viewport, imageWidth, imageHeight);
  const left = clamp01(tl.x);
  const top = clamp01(tl.y);
  const right = clamp01(br.x);
  const bottom = clamp01(br.y);

  // 박스 안에서 도면이 실제로 차지하는 사각형(box-local px) — 레터박스가 있으면 그만큼 뺀 값
  const boxValid = boxSize.w > 0 && boxSize.h > 0;
  const letterboxVp: Viewport = fitViewport(imageWidth, imageHeight, boxSize, 0);
  const rectTL = toScreen({ x: left, y: top }, letterboxVp, imageWidth, imageHeight);
  const rectBR = toScreen({ x: right, y: bottom }, letterboxVp, imageWidth, imageHeight);

  const tap = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = boxRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const vp = fitViewport(imageWidth, imageHeight, { w: r.width, h: r.height }, 0);
    const n = toNorm({ x: e.clientX - r.left, y: e.clientY - r.top }, vp, imageWidth, imageHeight);
    onCenterOn({ x: clamp01(n.x), y: clamp01(n.y) });
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
          style={
            boxValid
              ? {
                  left: `${(rectTL.x / boxSize.w) * 100}%`,
                  top: `${(rectTL.y / boxSize.h) * 100}%`,
                  width: `${(Math.max(0, rectBR.x - rectTL.x) / boxSize.w) * 100}%`,
                  height: `${(Math.max(0, rectBR.y - rectTL.y) / boxSize.h) * 100}%`,
                }
              : { left: 0, top: 0, width: 0, height: 0 }
          }
        />
      </div>
    </div>
  );
}
