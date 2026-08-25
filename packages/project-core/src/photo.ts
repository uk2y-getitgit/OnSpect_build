/**
 * 사진(S5) — Phase 4 스펙 §2-1 · §2-2.
 *
 * ⭐ **불변식 #8: 결함당 사진 N장, `isPrimary` 는 정확히 1장.**
 *    이 규칙은 **저장 시점이 아니라 읽기 정규화로 강제한다**(K16).
 *    쓰기 경로가 여러 개(업로드·삭제·대표지정·순서변경·Undo)라 저장 쪽에서만 막으면
 *    반드시 새는 경로가 생긴다. E11(옛 레코드 읽기 정규화)과 같은 방식이고
 *    **DB 버전을 올리지 않는다.**
 *
 * 경계:
 *   · `Photo` 는 `project-core` 에 둔다. `canvas-core` 는 사진을 모른다(K14).
 *   · `Blob`·`File`·`URL` 이 여기 등장하지 않는다(경계 규칙 9). Blob 은 `blobKey: string` 뿐이다.
 */
import type { RecordBase } from './types.js';

/**
 * 비파괴 보정. **원본 Blob 은 손대지 않는다** (§2-C "원본 보존").
 * 자르기는 1차 범위 밖이지만 필드를 지금 확정해 둔다 — 나중 추가 비용이 0 이다(K3).
 */
export type PhotoEdits = {
  /**
   * **렌더 프레임 0~1 정규화** 사각형. null = 자르지 않음.
   *
   * ⭐ 기준 프레임이 확정돼 있다 (PhotoPolish 스펙 §2-1) —
   *    `renderBlobKey` 의 래스터(= `width`/`height`, EXIF 방향 적용 후)이고
   *    **`rotate` 를 적용하기 전**이다. 변환은 `photoTransform.ts` 가 정본이다.
   * ⚠️ 픽셀이 아니다 — 불변식 #1(도면 좌표 정규화)과 같은 이유다.
   */
  crop: { x: number; y: number; w: number; h: number } | null;
  /** 시계방향. EXIF 방향 보정 **이후**에 추가로 적용된다 */
  rotate: PhotoRotate;
};

export type PhotoRotate = 0 | 90 | 180 | 270;

/**
 * 주석 벡터. 좌표는 `crop` 과 **같은 렌더 프레임 0~1 정규화**다 (§2-1).
 *
 * `width` 는 **렌더 프레임 장변 대비 비율(0~1)** 이다 — 픽셀이 아니다.
 * 픽셀로 두면 자르기·출력 배율이 바뀔 때마다 선 굵기가 상대적으로 달라진다.
 * 프리셋은 `photoTransform.ts::ANNOTATION_WIDTHS`.
 */
export type PhotoAnnotation =
  | {
      k: 'STROKE';
      id: string;
      points: { x: number; y: number }[];
      color: string;
      width: number;
    }
  | {
      k: 'ARROW';
      id: string;
      from: { x: number; y: number };
      to: { x: number; y: number };
      color: string;
      width: number;
    };

export type Photo = RecordBase & {
  id: string;
  projectId: string;
  defectId: string;
  /** 결함당 정확히 1장 (불변식 #8) */
  isPrimary: boolean;
  /** 10 격자. 드래그 재정렬 시 목록 전체 재부여 (G6 와 같은 규칙) */
  sortOrder: number;

  /** 원본 파일 Blob 키. 필수 — 도면의 `sourceBlobKey` 와 같은 규칙(D5 ④ · K4) */
  sourceBlobKey: string;
  /** 렌더·출력용 장변 2048 JPEG. 원본이 이미 작으면 `sourceBlobKey` 와 같은 키일 수 있다 */
  renderBlobKey: string;
  /** 장변 320 썸네일 */
  thumbBlobKey: string;
  /** Phase 5 예약. 지금은 항상 null */
  remoteUrl: string | null;

  fileName: string;
  /**
   * ⚠️ **원본 파일 기준**이다. `renderBlobKey` 의 렌더본은 원본이 PNG 여도 **항상 JPEG** 이므로
   * 이 값으로 렌더본을 분기하면 조용히 틀린다.
   */
  mime: string;
  /** ⚠️ **원본 파일 기준**. 렌더본·썸네일 용량이 아니다 */
  byteSize: number;
  /** ⚠️ **렌더 래스터 픽셀** (장변 2048 이하 · EXIF 방향 적용 후). 원본 해상도가 아니다 */
  width: number;
  height: number;

  /** 촬영시각. EXIF 미파싱이므로 `file.lastModified` (K5) */
  takenAt: number | null;
  /** 촬영기기. 1차는 항상 null (K5) */
  device: string | null;

  edits: PhotoEdits;
  annotations: PhotoAnnotation[];
  /**
   * 사진첩 캡션 **수동 덮어쓰기**. null = 파생 캡션을 쓴다 (§4-6).
   * 1차는 UI 없이 예약만 — 항상 null.
   */
  caption: string | null;
};

export const EMPTY_PHOTO_EDITS: PhotoEdits = { crop: null, rotate: 0 };

/** 사진 `sortOrder` 격자. 항목 설정(`ITEM_STEP`)과 같은 규칙(G6) */
export const PHOTO_STEP = 10;

// ── 불변식 함수 (전부 순수) ────────────────────────────────────────────────

/**
 * **읽기 정규화.** `sortOrder` 오름차순 정렬 + 대표 정확히 1장 보장.
 *
 *   · 대표가 0장이면 **첫 장**이 대표가 된다
 *   · 대표가 2장 이상이면 `sortOrder` 가 가장 작은 것만 남는다
 *   · 옛 레코드(`edits`·`annotations` 누락)도 여기서 채운다 — DB 버전을 올리지 않는다(E11)
 *
 * 바꿀 것이 없으면 **같은 배열 참조를 그대로 돌려준다**(G12 와 같은 이유 — 참조가 바뀌면
 * React 가 목록을 통째로 다시 그린다).
 */
export function normalizePhotos(list: readonly Photo[]): Photo[] {
  const sorted = [...list].sort(comparePhotos);
  let changed = sorted.length !== list.length;
  for (let i = 0; i < sorted.length; i += 1) {
    if (sorted[i] !== list[i]) {
      changed = true;
      break;
    }
  }

  // 대표 결정: sortOrder 가 가장 작은 대표. 하나도 없으면 첫 장
  let primaryIdx = sorted.findIndex((p) => p.isPrimary);
  if (primaryIdx < 0 && sorted.length > 0) primaryIdx = 0;

  const out: Photo[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const p = sorted[i]!;
    const want = i === primaryIdx;
    const filled = fillDefaults(p);
    if (filled.isPrimary === want && filled === p) {
      out.push(p);
      continue;
    }
    changed = true;
    out.push(filled.isPrimary === want ? filled : { ...filled, isPrimary: want });
  }
  return changed ? out : (list as Photo[]);
}

/** 옛 레코드에 신규 필드를 채운다. 채울 것이 없으면 같은 객체를 돌려준다 */
function fillDefaults(p: Photo): Photo {
  if (
    p.edits !== undefined &&
    p.edits !== null &&
    p.annotations !== undefined &&
    p.caption !== undefined &&
    p.remoteUrl !== undefined
  ) {
    return p;
  }
  return {
    ...p,
    edits: p.edits ?? { ...EMPTY_PHOTO_EDITS },
    annotations: p.annotations ?? [],
    caption: p.caption ?? null,
    remoteUrl: p.remoteUrl ?? null,
  };
}

function comparePhotos(a: Photo, b: Photo): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** 지정한 1장만 대표가 된다. 목록에 없는 id 면 아무것도 바뀌지 않는다 */
export function setPrimary(list: readonly Photo[], photoId: string): Photo[] {
  if (!list.some((p) => p.id === photoId)) return normalizePhotos(list);
  const marked = list.map((p) => (p.isPrimary === (p.id === photoId) ? p : { ...p, isPrimary: p.id === photoId }));
  return normalizePhotos(marked);
}

/**
 * 지운 뒤 다시 정규화한다 → **대표를 지우면 다음 장이 자동 승계된다.**
 * (S5 완료 판정의 핵심 항목이다)
 */
export function removePhoto(list: readonly Photo[], photoId: string): Photo[] {
  return normalizePhotos(list.filter((p) => p.id !== photoId));
}

export function removePhotos(list: readonly Photo[], ids: readonly string[]): Photo[] {
  const gone = new Set(ids);
  return normalizePhotos(list.filter((p) => !gone.has(p.id)));
}

/**
 * `ids` 순서대로 `sortOrder = i * 10` 을 **목록 전체에 재부여**한다 (G6).
 * `ids` 에 없는 사진은 뒤에 원래 순서대로 붙는다 — 조용히 사라지지 않는다.
 */
export function reorderPhotos(list: readonly Photo[], ids: readonly string[]): Photo[] {
  const byId = new Map(list.map((p) => [p.id, p]));
  const ordered: Photo[] = [];
  for (const id of ids) {
    const p = byId.get(id);
    if (!p) continue;
    byId.delete(id);
    ordered.push(p);
  }
  for (const p of normalizePhotos([...byId.values()])) ordered.push(p);

  const out = ordered.map((p, i) =>
    p.sortOrder === i * PHOTO_STEP ? p : { ...p, sortOrder: i * PHOTO_STEP },
  );
  return normalizePhotos(out);
}

/** **사진번호·사진첩이 쓰는 유일한 조회 경로다.** 각자 `find(isPrimary)` 하지 않는다 */
export function primaryOf(list: readonly Photo[]): Photo | null {
  const norm = normalizePhotos(list);
  return norm.find((p) => p.isPrimary) ?? null;
}

/** 여러 결함의 사진을 한 번에 묶는다. 값은 전부 정규화된 목록이다 */
export function groupPhotosByDefect(list: readonly Photo[]): Map<string, Photo[]> {
  const m = new Map<string, Photo[]>();
  for (const p of list) {
    const arr = m.get(p.defectId);
    if (arr) arr.push(p);
    else m.set(p.defectId, [p]);
  }
  for (const [k, v] of m) m.set(k, normalizePhotos(v));
  return m;
}

/** `assignNumbers(…, { hasPhoto })` 에 그대로 넣는다 — 대표사진이 있는 결함 집합 */
export function defectIdsWithPrimaryPhoto(list: readonly Photo[]): Set<string> {
  const out = new Set<string>();
  for (const [defectId, photos] of groupPhotosByDefect(list)) {
    if (photos.some((p) => p.isPrimary)) out.add(defectId);
  }
  return out;
}

/** 다음 사진의 `sortOrder` (10 격자 뒤에 붙인다) */
export function nextPhotoSortOrder(list: readonly Photo[]): number {
  if (list.length === 0) return 0;
  return Math.max(...list.map((p) => p.sortOrder)) + PHOTO_STEP;
}

/** 시계방향 90° 회전 누적. EXIF 보정 **이후**에 적용된다 */
export function rotatePhoto(p: Photo, deltaDeg: number): Photo {
  const cur = p.edits?.rotate ?? 0;
  const next = (((cur + deltaDeg) % 360) + 360) % 360;
  const rotate = (next === 90 || next === 180 || next === 270 ? next : 0) as PhotoRotate;
  if (rotate === cur) return p;
  return { ...p, edits: { ...(p.edits ?? EMPTY_PHOTO_EDITS), rotate } };
}

/** 회전 후의 표시 크기 — 미리보기·사진첩 배치가 쓴다 */
export function displaySize(p: Pick<Photo, 'width' | 'height' | 'edits'>): {
  width: number;
  height: number;
} {
  const r = p.edits?.rotate ?? 0;
  return r === 90 || r === 270
    ? { width: p.height, height: p.width }
    : { width: p.width, height: p.height };
}

// ── 비파괴 보정 setter (전부 순수 · 바뀔 것이 없으면 같은 객체) ──────────────
//
// ⚠️ 좌표 규약은 `photoTransform.ts` 가 정본이다 — `crop`·`annotations` 는
//    **렌더 프레임(EXIF 방향 적용 후 · rotate 적용 전) 0~1 정규화**다.
//    표시 프레임 ↔ 렌더 프레임 변환은 편집기가 저장 직전에 한다.

/** 자르기 지정·해제. `null` = 자르지 않음 */
export function setPhotoCrop(p: Photo, crop: PhotoEdits['crop']): Photo {
  const cur = p.edits?.crop ?? null;
  if (sameCrop(cur, crop)) return p;
  return { ...p, edits: { ...(p.edits ?? EMPTY_PHOTO_EDITS), crop } };
}

function sameCrop(a: PhotoEdits['crop'], b: PhotoEdits['crop']): boolean {
  if (a === null || b === null) return a === b;
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/** 주석 목록 통째 교체 (편집기 `[적용]`). 빈 배열도 유효한 값이다 */
export function setPhotoAnnotations(p: Photo, annotations: readonly PhotoAnnotation[]): Photo {
  const cur = p.annotations ?? [];
  if (cur.length === 0 && annotations.length === 0) return p;
  return { ...p, annotations: [...annotations] };
}

/** 사진첩 캡션 수동 덮어쓰기. **빈 문자열은 `null` 로 저장한다** — 파생 캡션으로 되돌아간다 (§2-5) */
export function setPhotoCaption(p: Photo, caption: string | null): Photo {
  const next = (caption ?? '').trim() === '' ? null : (caption as string).trim();
  if ((p.caption ?? null) === next) return p;
  return { ...p, caption: next };
}

/**
 * 자르기·주석이 있는가 — 썸네일 `✎` 배지와 **합성 빠른 경로** 판정이 같은 함수를 쓴다 (§2-2).
 * 회전은 여기 포함하지 않는다. 회전은 CSS 만으로 정확히 표현되므로 합성이 필요 없다.
 */
export function hasPhotoEdits(p: Pick<Photo, 'edits' | 'annotations'>): boolean {
  return (p.edits?.crop ?? null) !== null || (p.annotations?.length ?? 0) > 0;
}
