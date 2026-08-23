/**
 * 도면 파일 인입 — S1 스펙 §2-8. **웹 어댑터 전용** (경계 규칙 10. RN 은 이 층만 새로 쓴다).
 *
 *   UploadSource(파일 N개) ──▶ PageCandidate[] ──▶ [층 배정 화면] ──▶ Drawing[]
 *                                 ▲                     ▲
 *                     imageIngest.ts (S1)         이 화면은 두 경로가 공유한다
 *                     pdfIngest.ts  (후속)
 *
 * 이미지 1파일 = 후보 1개, PDF 1파일 = 후보 N개일 뿐이고 **뒤쪽 화면·모델·저장은 한 벌**이다.
 * 그래서 PDF 지원(T13)은 나중에 모듈 하나를 더하면 끝난다 — 마이그레이션이 없다.
 */
import {
  A4_LANDSCAPE,
  calcFitRect,
  fitRectToImgLayout,
  parseDrawingFileName,
  type FileNameGuess,
  type ImgLayout,
} from '@onspect/project-core';

/** 허용 MIME (§2-8-b) */
export const ACCEPT_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const;
export const ACCEPT_ATTR = ACCEPT_MIME.join(',');

/** 파일당 상한 */
export const MAX_FILE_BYTES = 40 * 1024 * 1024;
/** 1회 업로드 장수 */
export const MAX_FILES_PER_UPLOAD = 20;
/** 썸네일 장변 */
export const THUMB_EDGE = 320;
/**
 * 벡터(SVG) 확대 배수 상한 — 원본 치수가 작을 때 선명도를 확보하려고 키워서 먹인다.
 *
 * F1 이후로는 `imageWidth`(정규화 좌표의 분모)가 항상 `A4_LANDSCAPE.w` 로 고정이라
 * 예전의 우려("imageWidth 가 원본과 달라져 표기 크기의 상대 비율이 바뀐다")는 더 이상
 * 해당하지 않는다. 그래도 **1 = 확대하지 않는다**를 유지한다 — 래스터 장변 상한이
 * A4 캔버스 크기(1754px)로 자연히 대체된 것처럼, 벡터 확대는 이번 범위 밖의 별개 튜닝이다.
 */
export const MAX_VECTOR_UPSCALE = 1;

export type ReadyCandidate = {
  key: string;
  status: 'READY';
  fileName: string;
  mime: string;
  /** 원본 파일 크기 */
  byteSize: number;
  /** 래스터 픽셀 — **정규화 좌표의 분모가 된다.** F1 이후 항상 A4_LANDSCAPE(1754×1240) */
  imageWidth: number;
  imageHeight: number;
  /** F1 — A4 캔버스 안에서 원본 그림이 차지하는 사각형 */
  imgLayout: ImgLayout;
  renderBlob: Blob;
  /** 원본 Blob. D5 ④ — 래스터와 같은 객체일 수 있다 */
  sourceBlob: Blob;
  thumbBlob: Blob;
  /** `2400×1600 · 1.8MB` */
  sourceLabel: string;
  /** 파일명에서 뽑은 동·층 **제안값** (확정이 아니다) */
  guess: FileNameGuess;
};

export type RejectedCandidate = {
  key: string;
  status: 'REJECTED';
  fileName: string;
  byteSize: number;
  /** 배지 문구 */
  badge: string;
  /** 행에 그대로 보여주는 설명 */
  reason: string;
};

export type PageCandidate = ReadyCandidate | RejectedCandidate;

export type IngestProgress = { done: number; total: number; fileName: string };

export type IngestResult = {
  candidates: PageCandidate[];
  /** 20장 초과로 잘린 장수 */
  droppedCount: number;
};

let seq = 0;
function nextKey(): string {
  seq += 1;
  return `cand-${seq}-${Math.random().toString(36).slice(2, 8)}`;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  const mb = n / (1024 * 1024);
  return mb < 10 ? `${mb.toFixed(1)}MB` : `${Math.round(mb)}MB`;
}

/**
 * 파일 → 후보 목록.
 * **한 파일이 실패해도 나머지는 계속 간다.** 모달을 닫지 않는다 (§2-8-b).
 */
export async function ingestFiles(
  input: readonly File[],
  onProgress?: (p: IngestProgress) => void,
): Promise<IngestResult> {
  const files = input.slice(0, MAX_FILES_PER_UPLOAD);
  const droppedCount = input.length - files.length;
  const candidates: PageCandidate[] = [];

  for (let i = 0; i < files.length; i += 1) {
    const f = files[i]!;
    onProgress?.({ done: i, total: files.length, fileName: f.name });
    candidates.push(await ingestOne(f));
  }
  onProgress?.({ done: files.length, total: files.length, fileName: '' });
  return { candidates, droppedCount };
}

async function ingestOne(file: File): Promise<PageCandidate> {
  const base = { key: nextKey(), fileName: file.name, byteSize: file.size };

  // PDF 는 **명시적으로 인식하고 거절한다.** 조용히 무시하지 않는다 (Q13 · T13)
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    return {
      ...base,
      status: 'REJECTED',
      badge: 'PDF 미지원',
      reason: 'PDF는 아직 지원하지 않습니다. PNG 또는 JPG로 변환해 올려주세요.',
    };
  }

  const mime = normalizeMime(file);
  if (!ACCEPT_MIME.includes(mime as (typeof ACCEPT_MIME)[number])) {
    return {
      ...base,
      status: 'REJECTED',
      badge: '지원하지 않는 형식',
      reason: 'PNG · JPG · WEBP · SVG 파일만 올릴 수 있습니다.',
    };
  }

  if (file.size > MAX_FILE_BYTES) {
    return {
      ...base,
      status: 'REJECTED',
      badge: '용량 초과',
      reason: `파일 1장은 ${fmtBytes(MAX_FILE_BYTES)}까지입니다. 이 파일은 ${fmtBytes(file.size)}입니다.`,
    };
  }

  try {
    const decoded = await decode(file, mime);

    // F1 — 원본 크기·비율에 상관없이 A4 가로 캔버스에 contain 배치한다 (불변식 #1 과
    // 충돌하지 않는다 — 오히려 모든 도면이 같은 종횡비가 되어 도움이 된다).
    // 벡터(SVG)는 원본 치수가 작을 수 있어 §2-8-b 대로 최대 2배까지 키워서 먹인다 —
    // 그래도 최종 해상도는 A4 캔버스(1754×1240)로 자연히 다시 눌린다.
    const vecScale = decoded.isVector ? MAX_VECTOR_UPSCALE : 1;
    const natW = decoded.width * vecScale;
    const natH = decoded.height * vecScale;

    const fit = calcFitRect(natW, natH, A4_LANDSCAPE.w, A4_LANDSCAPE.h);
    const imgLayout = fitRectToImgLayout(fit);
    const renderBlob = await toPngBlob(decoded.source, A4_LANDSCAPE.w, A4_LANDSCAPE.h, fit);

    // 썸네일도 같은 배치 비율로 — 실제 렌더와 다르게 보이면 안 된다
    const tScale = Math.min(1, THUMB_EDGE / Math.max(A4_LANDSCAPE.w, A4_LANDSCAPE.h));
    const thumbW = Math.max(1, Math.round(A4_LANDSCAPE.w * tScale));
    const thumbH = Math.max(1, Math.round(A4_LANDSCAPE.h * tScale));
    const thumbFit = calcFitRect(natW, natH, thumbW, thumbH);
    const thumbBlob = await toPngBlob(decoded.source, thumbW, thumbH, thumbFit);
    decoded.release();

    return {
      ...base,
      status: 'READY',
      mime,
      imageWidth: A4_LANDSCAPE.w,
      imageHeight: A4_LANDSCAPE.h,
      imgLayout,
      renderBlob,
      // 원본을 함께 보관한다 (D5 ④) — PDF 지원이 켜졌을 때 다시 렌더해야 하고,
      // Phase 5 서버가 업로드해야 하는 것도 래스터가 아니라 원본이다
      sourceBlob: file,
      thumbBlob,
      // 원본 해상도를 그대로 보여준다 — A4 캔버스 크기는 모든 도면이 똑같아 정보가 없다
      sourceLabel: `${decoded.width}×${decoded.height} · ${fmtBytes(file.size)}`,
      guess: parseDrawingFileName(file.name),
    };
  } catch (e) {
    return {
      ...base,
      status: 'REJECTED',
      badge: '읽기 실패',
      reason: `이미지를 읽을 수 없습니다. ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

function normalizeMime(file: File): string {
  if (file.type) return file.type;
  // 확장자만 있고 MIME 이 비는 경우(일부 드래그&드롭)
  const ext = file.name.toLowerCase().replace(/^.*\./, '');
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'svg') return 'image/svg+xml';
  return '';
}

type Decoded = {
  source: CanvasImageSource;
  width: number;
  height: number;
  isVector: boolean;
  release: () => void;
};

async function decode(file: Blob, mime: string): Promise<Decoded> {
  if (mime === 'image/svg+xml') return decodeSvg(file);

  // ⚠️ EXIF orientation 을 **래스터화 시 적용**한다.
  //    적용하지 않으면 세로로 찍은 도면 사진이 90도 누워 뜬다 (§2-8-b)
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        source: bmp,
        width: bmp.width,
        height: bmp.height,
        isVector: false,
        release: () => bmp.close(),
      };
    } catch {
      /* 아래 <img> 경로로 넘어간다 */
    }
  }
  return decodeViaImage(file, false);
}

/** SVG 는 `viewBox` / `width`·`height` 에서 원본 치수를 얻는다 (§2-8-b) */
async function decodeSvg(file: Blob): Promise<Decoded> {
  const text = await file.text();
  const dims = svgDimensions(text);
  const d = await decodeViaImage(file, true);
  return { ...d, width: dims.w || d.width || 1000, height: dims.h || d.height || 1000 };
}

function svgDimensions(text: string): { w: number; h: number } {
  const head = text.slice(0, 4000);
  const wAttr = /\bwidth\s*=\s*["']([\d.]+)/i.exec(head);
  const hAttr = /\bheight\s*=\s*["']([\d.]+)/i.exec(head);
  if (wAttr && hAttr) return { w: Math.round(Number(wAttr[1])), h: Math.round(Number(hAttr[1])) };
  const vb = /\bviewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/i.exec(head);
  if (vb) return { w: Math.round(Number(vb[1])), h: Math.round(Number(vb[2])) };
  return { w: 0, h: 0 };
}

function decodeViaImage(file: Blob, isVector: boolean): Promise<Decoded> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      resolve({
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        isVector,
        release: () => URL.revokeObjectURL(url),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('디코드할 수 없는 파일입니다'));
    };
    img.src = url;
  });
}

/**
 * 캔버스(canvasW×canvasH) 에 흰 배경을 깔고, `dest` 사각형 자리에 원본을 그린다.
 * `dest` 를 생략하면 캔버스 전체를 채운다(예전 동작과 동일).
 *
 * F1 이후로는 **A4 캔버스 크기가 곧 이 raster 의 최종 해상도**다 — 원본이 아무리 커도
 * `drawImage` 가 `dest.w`×`dest.h` 로 다시 그리므로, 예전에 `scaleFor`/`MAX_RASTER_EDGE` 가
 * 하던 "장변 상한" 역할을 A4 캔버스 크기(1754px)가 자연히 대신한다.
 */
async function toPngBlob(
  source: CanvasImageSource,
  canvasW: number,
  canvasH: number,
  dest: { x: number; y: number; w: number; h: number } = { x: 0, y: 0, w: canvasW, h: canvasH },
): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = canvasW;
  c.height = canvasH;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('캔버스 컨텍스트를 만들 수 없습니다');
  // 도면은 흰 종이다. 투명 배경을 그대로 두면 캔버스에서 배경이 비친다
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, dest.x, dest.y, dest.w, dest.h);

  const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('이미지를 저장 형식으로 바꾸지 못했습니다');
  return blob;
}

/** 후보 1개가 저장에 쓸 대략 용량 — 업로드 **전** 여유 확인용 (§2-9-d) */
export function estimatedBytes(c: PageCandidate): number {
  if (c.status !== 'READY') return 0;
  const sameSource = c.sourceBlob === c.renderBlob;
  return c.renderBlob.size + c.thumbBlob.size + (sameSource ? 0 : c.sourceBlob.size);
}

// ── F5-3 도면 크기 조절 — 재합성 ────────────────────────────────────────────
/**
 * 이미 저장된 **원본 Blob** 을 다시 A4 가로 캔버스에 합성한다. `scale` 은 도면 그림이
 * 지면 안에서 차지하는 배율(F5-3, `clampScale` 범위).
 *
 * ⚠️ 결과 Blob 을 저장소에 다시 쓰지 않는다 — 호출자(`canvas/drawingComposite.ts`)의
 * **런타임 캐시**에만 둔다(F5-3 "합성 결과는 페이지 객체가 아니라 별도 캐시").
 * 저장되는 것은 `Drawing.imgScale`(숫자 하나)과 `imgLayout` 뿐이다.
 */
export async function composeA4(
  source: Blob,
  scale = 1,
): Promise<{ renderBlob: Blob; imgLayout: ImgLayout }> {
  const mime = source.type || 'image/png';
  const decoded = await decode(source, mime);
  try {
    const vecScale = decoded.isVector ? MAX_VECTOR_UPSCALE : 1;
    const natW = decoded.width * vecScale;
    const natH = decoded.height * vecScale;
    const fit = calcFitRect(natW, natH, A4_LANDSCAPE.w, A4_LANDSCAPE.h, scale);
    const renderBlob = await toPngBlob(decoded.source, A4_LANDSCAPE.w, A4_LANDSCAPE.h, fit);
    return { renderBlob, imgLayout: fitRectToImgLayout(fit) };
  } finally {
    decoded.release();
  }
}

/**
 * 배율만 바꿨을 때의 새 도면 영역(`imgLayout`) — **이미지를 디코드하지 않고** 계산한다.
 * 옛 배치의 종횡비를 그대로 되살려 쓰므로 원본 Blob 이 필요 없다.
 * 옛 레코드(`imgLayout === null`)에는 쓸 수 없다 — 그때는 `composeA4` 를 쓴다.
 */
export function scaledImgLayout(base: ImgLayout, fromScale: number, toScale: number): ImgLayout {
  const unitW = base.dW / Math.max(1e-6, fromScale);
  const unitH = base.dH / Math.max(1e-6, fromScale);
  const fit = calcFitRect(unitW, unitH, A4_LANDSCAPE.w, A4_LANDSCAPE.h, toScale);
  return fitRectToImgLayout(fit);
}
