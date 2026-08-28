/**
 * 사진 합성 렌더러 — PhotoPolish 스펙 §2-2. **웹 어댑터 전용**(경계 규칙 10).
 *
 * ⭐ **화면과 출력이 이 함수 하나를 쓴다.** 두 벌로 그리면 반드시 갈라진다 —
 *    `photo.ts` 가 *"각자 find(isPrimary) 하지 않는다"* 로 이미 막아 둔 것과 같은 종류의 사고다.
 *
 * ⭐ **합성 순서 (§2-1, 절대 바꾸지 않는다)**
 * ```
 * 렌더본  →  주석 그리기  →  자르기(crop)  →  회전(rotate)
 * ```
 * 주석을 자르기 **전에** 그리므로 잘려 나간 영역의 획이 자동으로 사라진다(별도 클리핑 불필요).
 * 좌표는 항상 자르기 전 프레임 기준이라 **자른 뒤 다시 자르기를 열어도 주석이 안 움직인다.**
 *
 * ⚠️ 디코드는 `photoIngest.ts::decodeImage`(`<img>` 방식)를 **재사용한다.**
 *    `createImageBitmap` 은 EXIF 방향을 적용하지 않아 쓰면 안 된다.
 *
 * ⚠️ **objectURL 생성·해제는 호출자 책임이다** (`export/locationMap.ts` 의
 *    `renderLocationMaps`/`releaseLocationMaps` 패턴과 같다).
 *
 * ⚠️ 실패하면 **예외를 던지지 않고 `null`** 을 돌려준다. 호출자는 원본 URL 로 폴백한다 —
 *    주석 한 장 때문에 사진첩 인쇄가 통째로 죽으면 안 된다.
 */
import {
  ARROW_HEAD_RATIO,
  arrowHeadPoints,
  hasPhotoEdits,
  strokePx,
  type Photo,
  type PhotoAnnotation,
} from '@onspect/project-core';
import { decodeImage, type Decoded } from './photoIngest.js';

/** 재압축 품질. 원본 렌더본이 0.85 로 이미 구워졌으므로 손실을 더 키우지 않는다 */
export const COMPOSE_QUALITY = 0.9;

export type ComposeInput = Pick<Photo, 'edits' | 'annotations'>;

export type ComposedPhoto = {
  blob: Blob;
  /** 합성 결과 픽셀 — 회전까지 적용된 최종 크기다 */
  width: number;
  height: number;
};

/**
 * 자르기·주석이 있는가. **없으면 합성하지 않고 원본 URL 을 그대로 쓴다**(빠른 경로).
 * 회전은 여기 포함하지 않는다 — CSS `transform` 으로 정확히 표현되므로 합성이 필요 없다.
 */
export function needsCompose(p: ComposeInput): boolean {
  return hasPhotoEdits(p);
}

/**
 * 합성 결과가 달라지는 입력만 모은 서명.
 * 캐시 키·`useEffect` 의존성에 쓴다 — 배열 참조가 바뀔 때마다 다시 굽지 않게 한다.
 */
export function composeSignature(p: Pick<Photo, 'renderBlobKey' | 'edits' | 'annotations'>): string {
  const c = p.edits?.crop ?? null;
  const crop = c === null ? '-' : `${c.x},${c.y},${c.w},${c.h}`;
  const rot = p.edits?.rotate ?? 0;
  const anns = (p.annotations ?? [])
    .map((a) =>
      a.k === 'ARROW'
        ? `A${a.from.x},${a.from.y},${a.to.x},${a.to.y},${a.color},${a.width}`
        : `S${a.color},${a.width},${a.points.map((q) => `${q.x}:${q.y}`).join(';')}`,
    )
    .join('|');
  return `${p.renderBlobKey}#${crop}#${rot}#${anns}`;
}

/** 렌더본 Blob → 자르기·주석·회전이 전부 구워진 JPEG */
export async function composePhoto(src: Blob, p: ComposeInput): Promise<ComposedPhoto | null> {
  let decoded: Decoded | null = null;
  try {
    decoded = await decodeImage(src);
    return await composeFromDecoded(decoded, p);
  } catch {
    return null;
  } finally {
    decoded?.release();
  }
}

/**
 * 이미 objectURL 이 있을 때의 경로 — 화면(미리보기·인쇄 뷰)이 쓴다.
 * 저장소가 이미 만들어 캐시한 URL 을 Blob 으로 되돌렸다가 다시 URL 로 만드는 낭비를 없앤다.
 * 그 URL 은 **저장소 캐시 소유라 여기서 해제하지 않는다.**
 */
export async function composePhotoFromUrl(
  url: string,
  p: ComposeInput,
): Promise<ComposedPhoto | null> {
  try {
    const decoded = await decodeUrl(url);
    return await composeFromDecoded(decoded, p);
  } catch {
    // 폴백은 호출자가 한다 — 원본 URL 이 그대로 인쇄된다
    return null;
  }
}

/** ⭐ 합성 순서가 여기 한 곳에만 있다 — 화면·출력이 갈릴 여지가 없다 */
async function composeFromDecoded(
  decoded: Pick<Decoded, 'source' | 'width' | 'height'>,
  p: ComposeInput,
): Promise<ComposedPhoto | null> {
  const W = decoded.width;
  const H = decoded.height;
  if (W <= 0 || H <= 0) return null;

  // ① 렌더 프레임 그대로 + 주석
  const base = makeCanvas(W, H);
  base.ctx.drawImage(decoded.source, 0, 0, W, H);
  drawAnnotations(base.ctx, p.annotations ?? [], W, H);

  // ② 자르기 — 좌표는 **자르기 전 프레임** 기준이다
  const crop = p.edits?.crop ?? null;
  let stage: HTMLCanvasElement = base.canvas;
  if (crop !== null) {
    const sw = Math.max(1, Math.min(W, Math.round(crop.w * W)));
    const sh = Math.max(1, Math.min(H, Math.round(crop.h * H)));
    const sx = Math.max(0, Math.min(W - sw, Math.round(crop.x * W)));
    const sy = Math.max(0, Math.min(H - sh, Math.round(crop.y * H)));
    const cut = makeCanvas(sw, sh);
    cut.ctx.drawImage(base.canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    stage = cut.canvas;
  }

  // ③ 회전 — 90·270 이면 가로·세로가 맞바뀐다
  const rotate = p.edits?.rotate ?? 0;
  let out = stage;
  if (rotate === 90 || rotate === 180 || rotate === 270) {
    const quarter = rotate === 90 || rotate === 270;
    const ow = quarter ? stage.height : stage.width;
    const oh = quarter ? stage.width : stage.height;
    const rot = makeCanvas(ow, oh);
    rot.ctx.translate(ow / 2, oh / 2);
    rot.ctx.rotate((rotate * Math.PI) / 180);
    rot.ctx.drawImage(stage, -stage.width / 2, -stage.height / 2);
    out = rot.canvas;
  }

  const blob = await toBlob(out);
  if (!blob) return null;
  return { blob, width: out.width, height: out.height };
}

// ── 주석 그리기 ────────────────────────────────────────────────────────────
/**
 * 정규화 좌표(렌더 프레임) → 픽셀. 굵기는 **장변 대비 비율**이므로 `strokePx()` 로 환산한다.
 * 화살촉은 `arrowHeadPoints()`(project-core 순수 함수)를 쓴다 —
 * **화면 SVG 와 여기가 같은 함수를 쓰게 하려는 것이 그 함수의 존재 이유**다.
 */
export function drawAnnotations(
  ctx: CanvasRenderingContext2D,
  annotations: readonly PhotoAnnotation[],
  W: number,
  H: number,
): void {
  if (annotations.length === 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const a of annotations) {
    const lw = strokePx(a.width, W, H);
    ctx.strokeStyle = a.color;
    ctx.lineWidth = lw;

    if (a.k === 'STROKE') {
      if (a.points.length < 2) continue;
      ctx.beginPath();
      a.points.forEach((p, i) => {
        const x = p.x * W;
        const y = p.y * H;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      continue;
    }

    const from = { x: a.from.x * W, y: a.from.y * H };
    const to = { x: a.to.x * W, y: a.to.y * H };
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    const [h1, h2] = arrowHeadPoints(from, to, lw * ARROW_HEAD_RATIO);
    ctx.beginPath();
    ctx.moveTo(h1.x, h1.y);
    ctx.lineTo(to.x, to.y);
    ctx.lineTo(h2.x, h2.y);
    ctx.stroke();
  }
  ctx.restore();
}

// ── 보조 ───────────────────────────────────────────────────────────────────
function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스 컨텍스트를 만들 수 없습니다');
  // JPEG 는 투명을 모른다 — 흰 배경을 깔지 않으면 여백이 검게 나온다
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx };
}

function toBlob(c: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', COMPOSE_QUALITY));
}

/** `decodeImage` 와 같은 `<img>` 경로 — URL 을 이미 갖고 있을 때만 다르다 */
function decodeUrl(url: string): Promise<Pick<Decoded, 'source' | 'width' | 'height'>> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () =>
      resolve({ source: img, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('디코드할 수 없는 이미지입니다'));
    img.src = url;
  });
}
