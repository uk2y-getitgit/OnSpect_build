/**
 * 사진 파일 인입 — S5 스펙 §2-4. **웹 어댑터 전용**(경계 규칙 10. RN 은 이 층만 새로 쓴다).
 *
 *   File[]  (input[type=file][multiple][accept=image/*])
 *     → 용량 사전 확인 (도면과 같은 규칙 — 처리를 다 하고 마지막에 실패하지 않는다)
 *     → <img> 디코드          ← **EXIF 방향이 브라우저에서 자동 적용된다** (K5)
 *     → 장변 2048 → JPEG q0.85 = renderBlob
 *     → 장변  320 → JPEG q0.8  = thumbBlob
 *     → sourceBlob = 원본 File 그대로 (K4 — 원본을 버리지 않는다)
 *     → PhotoUpload[]
 *
 * **PC 웹이므로 "촬영"은 없다.** 폴더·파일 선택뿐이다(D1).
 * 실패한 파일이 있어도 **성공한 파일은 등록한다**(부분 성공). 실패는 섹션 안 인라인 경고로 남긴다.
 */
import {
  EMPTY_PHOTO_EDITS,
  nextPhotoSortOrder,
  type Photo,
} from '@onspect/project-core';
import { estimateStorage, newId } from './idb/db.js';
import { newBlobKey } from './idb/blobs.js';
import type { PhotoUpload } from './idb/photos.js';

/** 허용 MIME. **HEIC 는 브라우저가 디코드하지 못하므로 명시적으로 거절한다** (D1 의 PDF 와 같은 방식) */
export const PHOTO_ACCEPT_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PHOTO_ACCEPT_ATTR = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';

/** 장당 상한 */
export const MAX_PHOTO_BYTES = 30 * 1024 * 1024;
/** 1회 선택 상한 */
export const MAX_PHOTOS_PER_PICK = 50;

/** 렌더본 장변 — A4 반쪽(≈90mm) 300dpi ≈ 1060px 이라 넉넉하다 (K2) */
export const RENDER_EDGE = 2048;
export const RENDER_QUALITY = 0.85;
/** 썸네일 장변 */
export const PHOTO_THUMB_EDGE = 320;
export const THUMB_QUALITY = 0.8;

/** 여유 공간이 이만큼도 안 남으면 등록을 막는다 */
const STORAGE_HEADROOM = 8 * 1024 * 1024;

export type ReadyPhoto = {
  key: string;
  status: 'READY';
  fileName: string;
  mime: string;
  byteSize: number;
  /** 렌더 래스터 픽셀 (EXIF 방향 적용 후) */
  width: number;
  height: number;
  sourceBlob: Blob;
  renderBlob: Blob;
  thumbBlob: Blob;
  /** EXIF 미파싱 — `file.lastModified` 를 쓴다 (K5) */
  takenAt: number | null;
};

export type RejectedPhoto = {
  key: string;
  status: 'REJECTED';
  fileName: string;
  byteSize: number;
  /** 배지 문구 */
  badge: string;
  /** 행에 그대로 보여주는 설명 */
  reason: string;
};

export type PhotoCandidate = ReadyPhoto | RejectedPhoto;

export type PhotoIngestResult = {
  ready: ReadyPhoto[];
  rejected: RejectedPhoto[];
  /** 50장 초과로 잘린 장수 */
  droppedCount: number;
};

export type PhotoIngestProgress = { done: number; total: number; fileName: string };

let seq = 0;
function nextKey(): string {
  seq += 1;
  return `photo-cand-${seq}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  const mb = n / (1024 * 1024);
  return mb < 10 ? `${mb.toFixed(1)}MB` : `${Math.round(mb)}MB`;
}

/**
 * 파일 → 후보 목록. **한 파일이 실패해도 나머지는 계속 간다.**
 * 용량 사전 확인은 **디코드 전에** 한 번 한다 — 50장을 다 처리하고 마지막에 실패하는 것이 최악이다.
 */
export async function ingestPhotos(
  input: readonly File[],
  onProgress?: (p: PhotoIngestProgress) => void,
): Promise<PhotoIngestResult> {
  const files = input.slice(0, MAX_PHOTOS_PER_PICK);
  const droppedCount = input.length - files.length;

  const ready: ReadyPhoto[] = [];
  const rejected: RejectedPhoto[] = [];

  const quotaMessage = await checkQuota(files);
  if (quotaMessage !== null) {
    for (const f of files) {
      rejected.push({
        key: nextKey(),
        status: 'REJECTED',
        fileName: f.name,
        byteSize: f.size,
        badge: '저장 공간 부족',
        reason: quotaMessage,
      });
    }
    return { ready, rejected, droppedCount };
  }

  for (let i = 0; i < files.length; i += 1) {
    const f = files[i]!;
    onProgress?.({ done: i, total: files.length, fileName: f.name });
    const c = await ingestOne(f);
    if (c.status === 'READY') ready.push(c);
    else rejected.push(c);
  }
  onProgress?.({ done: files.length, total: files.length, fileName: '' });
  return { ready, rejected, droppedCount };
}

/** 도면과 같은 규칙 — 업로드 **전에** 거절한다 (§2-9-d) */
async function checkQuota(files: readonly File[]): Promise<string | null> {
  const est = await estimateStorage();
  if (!est || est.quota === 0) return null;
  // 원본 + 렌더본(대략 원본의 절반) + 썸네일
  const need = files.reduce((n, f) => n + f.size, 0) * 1.6;
  const free = est.quota - est.usage;
  if (free - need > STORAGE_HEADROOM) return null;
  return `이 브라우저에 남은 저장 공간이 부족합니다 (남음 ${formatBytes(Math.max(0, free))} · 필요 약 ${formatBytes(Math.round(need))}). 다른 용역을 정리한 뒤 다시 시도해 주세요.`;
}

async function ingestOne(file: File): Promise<PhotoCandidate> {
  const base = { key: nextKey(), fileName: file.name, byteSize: file.size };

  // HEIC/HEIF 는 **인식해서 명시적으로 거절한다.** 조용히 실패시키지 않는다
  if (/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)) {
    return {
      ...base,
      status: 'REJECTED',
      badge: 'HEIC 미지원',
      reason: 'HEIC 사진은 브라우저가 읽지 못합니다. JPG로 변환해 올려주세요.',
    };
  }

  const mime = normalizeMime(file);
  if (!(PHOTO_ACCEPT_MIME as readonly string[]).includes(mime)) {
    return {
      ...base,
      status: 'REJECTED',
      badge: '지원하지 않는 형식',
      reason: 'JPG · PNG · WEBP 파일만 올릴 수 있습니다.',
    };
  }

  if (file.size > MAX_PHOTO_BYTES) {
    return {
      ...base,
      status: 'REJECTED',
      badge: '용량 초과',
      reason: `사진 1장은 ${formatBytes(MAX_PHOTO_BYTES)}까지입니다. 이 파일은 ${formatBytes(file.size)}입니다.`,
    };
  }

  let decoded: Decoded | null = null;
  try {
    decoded = await decodeImage(file);
    const renderFit = fitEdge(decoded.width, decoded.height, RENDER_EDGE);
    const renderBlob = await toJpegBlob(decoded.source, renderFit.w, renderFit.h, RENDER_QUALITY);
    const thumbFit = fitEdge(decoded.width, decoded.height, PHOTO_THUMB_EDGE);
    const thumbBlob = await toJpegBlob(decoded.source, thumbFit.w, thumbFit.h, THUMB_QUALITY);

    return {
      ...base,
      status: 'READY',
      mime,
      width: renderFit.w,
      height: renderFit.h,
      sourceBlob: file,
      renderBlob,
      thumbBlob,
      takenAt: Number.isFinite(file.lastModified) ? file.lastModified : null,
    };
  } catch (e) {
    return {
      ...base,
      status: 'REJECTED',
      badge: '읽기 실패',
      reason: `사진을 읽을 수 없습니다. ${e instanceof Error ? e.message : String(e)}`,
    };
  } finally {
    decoded?.release();
  }
}

function normalizeMime(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.toLowerCase().replace(/^.*\./, '');
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return '';
}

type Decoded = { source: CanvasImageSource; width: number; height: number; release: () => void };

/**
 * ⚠️ **`<img>` 로 디코드한다.** `createImageBitmap` 이 아니다 —
 * `<img>` 는 브라우저가 EXIF 방향을 **자동으로 적용**해 준다(CSS `image-orientation: from-image` 가 기본).
 * EXIF 파서를 새 의존성으로 넣지 않고도 세로 사진이 눕지 않는다 (K5).
 */
function decodeImage(file: Blob): Promise<Decoded> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      resolve({
        source: img,
        // naturalWidth/Height 는 방향 보정이 적용된 값이다
        width: img.naturalWidth,
        height: img.naturalHeight,
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

/** 장변을 `edge` 로 맞춘다. **키우지 않는다** — 원본이 작으면 그대로 */
function fitEdge(w: number, h: number, edge: number): { w: number; h: number } {
  const long = Math.max(w, h);
  if (long <= 0) return { w: 1, h: 1 };
  const s = Math.min(1, edge / long);
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

async function toJpegBlob(
  source: CanvasImageSource,
  w: number,
  h: number,
  quality: number,
): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('캔버스 컨텍스트를 만들 수 없습니다');
  // JPEG 는 투명을 모른다. PNG 원본의 투명 영역이 검게 나오지 않도록 흰 배경을 깐다
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) =>
    c.toBlob(resolve, 'image/jpeg', quality),
  );
  if (!blob) throw new Error('이미지를 저장 형식으로 바꾸지 못했습니다');
  return blob;
}

/**
 * 후보 → 저장 레코드. **대표는 여기서 정하지 않는다** —
 * 읽기 정규화(`normalizePhotos`)가 "대표 0장이면 첫 장"을 보장하므로(K16),
 * 기존 사진이 하나도 없을 때만 첫 장에 `isPrimary` 를 켜 두면 충분하다.
 */
export function toPhotoUploads(
  ready: readonly ReadyPhoto[],
  ctx: { projectId: string; defectId: string; deviceId: string; existing: readonly Photo[] },
): PhotoUpload[] {
  const now = Date.now();
  let order = nextPhotoSortOrder(ctx.existing);
  const noneYet = ctx.existing.length === 0;

  return ready.map((r, i) => {
    const photo: Photo = {
      id: newId(),
      projectId: ctx.projectId,
      defectId: ctx.defectId,
      isPrimary: noneYet && i === 0,
      sortOrder: order,
      sourceBlobKey: newBlobKey(),
      renderBlobKey: newBlobKey(),
      thumbBlobKey: newBlobKey(),
      remoteUrl: null,
      fileName: r.fileName,
      mime: r.mime,
      byteSize: r.byteSize,
      width: r.width,
      height: r.height,
      takenAt: r.takenAt,
      device: null,
      edits: { ...EMPTY_PHOTO_EDITS },
      annotations: [],
      caption: null,
      createdAt: now,
      updatedAt: now,
      deviceId: ctx.deviceId,
      createdBy: null,
    };
    order += 10;
    return {
      photo,
      sourceBlob: r.sourceBlob,
      renderBlob: r.renderBlob,
      thumbBlob: r.thumbBlob,
    };
  });
}

/** 후보 1개가 저장에 쓸 대략 용량 */
export function estimatedPhotoBytes(r: ReadyPhoto): number {
  return r.sourceBlob.size + r.renderBlob.size + r.thumbBlob.size;
}
