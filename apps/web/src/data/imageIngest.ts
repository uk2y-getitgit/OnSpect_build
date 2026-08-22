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
import { parseDrawingFileName, type FileNameGuess } from '@onspect/project-core';

/** 허용 MIME (§2-8-b) */
export const ACCEPT_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const;
export const ACCEPT_ATTR = ACCEPT_MIME.join(',');

/** 파일당 상한 */
export const MAX_FILE_BYTES = 40 * 1024 * 1024;
/** 1회 업로드 장수 */
export const MAX_FILES_PER_UPLOAD = 20;
/** 래스터 장변 상한 */
export const MAX_RASTER_EDGE = 4096;
/** 썸네일 장변 */
export const THUMB_EDGE = 320;
/**
 * 확대 배수 상한.
 *
 * **1 = 확대하지 않는다.** 스펙 §2-8-b 는 최대 2배까지 허용하지만 쓰지 않는다:
 *   · 래스터는 없는 디테일을 만들지 못하면서 바이트만 4배가 된다
 *   · 벡터를 키워도 `imageLoader` 가 `imageWidth` 기준으로 다시 래스터화하므로 이득이 없고,
 *     `imageWidth`(정규화 좌표의 분모)만 원본과 달라져 표기 크기의 상대 비율이 바뀐다
 */
export const MAX_VECTOR_UPSCALE = 1;

export type ReadyCandidate = {
  key: string;
  status: 'READY';
  fileName: string;
  mime: string;
  /** 원본 파일 크기 */
  byteSize: number;
  /** 래스터 픽셀 — **정규화 좌표의 분모가 된다** */
  imageWidth: number;
  imageHeight: number;
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
    const scale = scaleFor(decoded.width, decoded.height, decoded.isVector);
    const w = Math.max(1, Math.round(decoded.width * scale));
    const h = Math.max(1, Math.round(decoded.height * scale));

    const renderBlob = await toPngBlob(decoded.source, w, h);
    const tScale = Math.min(1, THUMB_EDGE / Math.max(w, h));
    const thumbBlob = await toPngBlob(
      decoded.source,
      Math.max(1, Math.round(w * tScale)),
      Math.max(1, Math.round(h * tScale)),
    );
    decoded.release();

    return {
      ...base,
      status: 'READY',
      mime,
      imageWidth: w,
      imageHeight: h,
      renderBlob,
      // 원본을 함께 보관한다 (D5 ④) — PDF 지원이 켜졌을 때 다시 렌더해야 하고,
      // Phase 5 서버가 업로드해야 하는 것도 래스터가 아니라 원본이다
      sourceBlob: file,
      thumbBlob,
      sourceLabel: `${w}×${h} · ${fmtBytes(file.size)}`,
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

async function decode(file: File, mime: string): Promise<Decoded> {
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
async function decodeSvg(file: File): Promise<Decoded> {
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

function decodeViaImage(file: File, isVector: boolean): Promise<Decoded> {
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
 * 장변 4096px 상한.
 * **래스터는 확대하지 않는다** — 없는 디테일을 만들지 못하면서 바이트만 4배가 된다.
 * 벡터(SVG)만 최대 2배까지 키워 확대했을 때의 선명도를 확보한다.
 */
function scaleFor(w: number, h: number, isVector: boolean): number {
  const long = Math.max(w, h);
  if (long <= 0) return 1;
  const cap = MAX_RASTER_EDGE / long;
  return Math.min(isVector ? MAX_VECTOR_UPSCALE : 1, cap);
}

async function toPngBlob(source: CanvasImageSource, w: number, h: number): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('캔버스 컨텍스트를 만들 수 없습니다');
  // 도면은 흰 종이다. 투명 배경을 그대로 두면 캔버스에서 배경이 비친다
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);

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
