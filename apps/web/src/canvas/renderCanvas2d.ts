/**
 * DrawOp[] → CanvasRenderingContext2D. 웹 어댑터 전용.
 *
 * 코어가 준 좌표는 이미 스크린 CSS px 다. **DPR 곱셈은 여기서만** 한다(경계 규칙 7).
 * RN 으로 갈 때 이 파일만 Skia 로 다시 쓴다.
 */
import type { DrawOp } from '@onspect/canvas-core';
import type { LoadedDrawing } from './imageLoader';

const FONT_STACK = 'Pretendard, "Noto Sans KR", -apple-system, "Segoe UI", sans-serif';

/** CSS px 기준 좌표계로 맞춘다. 이후 모든 좌표는 CSS px 로 쓰면 된다 */
export function prepare(
  canvas: HTMLCanvasElement,
  cssW: number,
  cssH: number,
  dpr: number,
): CanvasRenderingContext2D | null {
  const w = Math.max(1, Math.round(cssW * dpr));
  const h = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  return ctx;
}

export function renderOps(
  ctx: CanvasRenderingContext2D,
  ops: readonly DrawOp[],
  image: LoadedDrawing | null,
): void {
  for (const op of ops) {
    ctx.save();
    switch (op.k) {
      case 'image': {
        if (image) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(image.source, op.at.x, op.at.y, op.w, op.h);
        }
        break;
      }
      case 'line': {
        ctx.globalAlpha = op.alpha ?? 1;
        ctx.strokeStyle = op.color;
        ctx.lineWidth = op.width;
        ctx.lineCap = op.cap ?? 'butt';
        if (op.dash) ctx.setLineDash(op.dash);
        ctx.beginPath();
        ctx.moveTo(op.a.x, op.a.y);
        ctx.lineTo(op.b.x, op.b.y);
        ctx.stroke();
        break;
      }
      case 'circle': {
        ctx.globalAlpha = op.alpha ?? 1;
        if (op.dash) ctx.setLineDash(op.dash);
        ctx.beginPath();
        ctx.arc(op.c.x, op.c.y, Math.max(0.1, op.r), 0, Math.PI * 2);
        if (op.fill) {
          ctx.fillStyle = op.fill;
          ctx.fill();
        }
        if (op.stroke) {
          ctx.strokeStyle = op.stroke;
          ctx.lineWidth = op.width ?? 1;
          ctx.stroke();
        }
        break;
      }
      case 'rect': {
        ctx.globalAlpha = op.alpha ?? 1;
        if (op.dash) ctx.setLineDash(op.dash);
        if (op.fill) {
          ctx.fillStyle = op.fill;
          ctx.fillRect(op.at.x, op.at.y, op.w, op.h);
        }
        if (op.stroke) {
          ctx.strokeStyle = op.stroke;
          ctx.lineWidth = op.width ?? 1;
          ctx.strokeRect(op.at.x, op.at.y, op.w, op.h);
        }
        break;
      }
      case 'ellipse': {
        ctx.globalAlpha = op.alpha ?? 1;
        if (op.dash) ctx.setLineDash(op.dash);
        ctx.beginPath();
        ctx.ellipse(op.c.x, op.c.y, Math.max(0.1, op.rx), Math.max(0.1, op.ry), 0, 0, Math.PI * 2);
        if (op.fill) {
          ctx.fillStyle = op.fill;
          ctx.fill();
        }
        if (op.stroke) {
          ctx.strokeStyle = op.stroke;
          ctx.lineWidth = op.width ?? 1;
          ctx.stroke();
        }
        break;
      }
      case 'polyline': {
        // 자유그리기 · 구름 테두리 · 화살촉
        if (op.pts.length >= 2) {
          ctx.globalAlpha = op.alpha ?? 1;
          if (op.dash) ctx.setLineDash(op.dash);
          ctx.lineCap = op.cap ?? 'butt';
          ctx.lineJoin = op.join ?? 'miter';
          ctx.beginPath();
          ctx.moveTo(op.pts[0]!.x, op.pts[0]!.y);
          for (let i = 1; i < op.pts.length; i += 1) ctx.lineTo(op.pts[i]!.x, op.pts[i]!.y);
          if (op.close) ctx.closePath();
          if (op.fill) {
            ctx.fillStyle = op.fill;
            ctx.fill();
          }
          if (!op.noStroke) {
            ctx.strokeStyle = op.color;
            ctx.lineWidth = op.width;
            ctx.stroke();
          }
        }
        break;
      }

      case 'textLeft': {
        // 메모 본문 — 왼쪽 정렬. 번호(`text`)와 달리 halo 를 쓰지 않는다:
        // 메모는 자기 배경(포스트잇 노랑) 위에 있어서 흰 외곽선이 오히려 지저분하다
        ctx.globalAlpha = op.alpha ?? 1;
        ctx.font = `${op.weight ?? 400} ${op.size}px ${FONT_STACK}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = op.color;
        ctx.fillText(op.text, op.at.x, op.at.y);
        break;
      }
      case 'text': {
        ctx.globalAlpha = op.alpha ?? 1;
        ctx.font = `${op.weight ?? 400} ${op.size}px ${FONT_STACK}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // 도면 선 위에서도 번호가 읽히도록 얇은 흰 외곽선 (디자인시스템 §7)
        if (op.halo) {
          ctx.lineJoin = 'round';
          ctx.strokeStyle = op.halo;
          ctx.lineWidth = op.haloWidth ?? 2;
          ctx.strokeText(op.text, op.at.x, op.at.y);
        }
        ctx.fillStyle = op.color;
        ctx.fillText(op.text, op.at.x, op.at.y);
        break;
      }
      default:
        break; // 알 수 없는 op 은 건너뛴다 (throw 금지)
    }
    ctx.restore();
  }
}
