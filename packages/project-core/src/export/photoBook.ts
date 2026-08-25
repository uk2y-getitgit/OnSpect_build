/**
 * 사진첩 (2열 × 3행 = 6장/페이지, A4 세로) — Phase 4 스펙 §3-6.
 *
 * ⭐ **번호를 세지 않는다.** `numbering.ts` 가 준 `NumberingRow` 순서를 그대로 따르므로
 *    사진번호 오름차순이 자동으로 보장된다(K20). 대표사진이 없는 결함은 `photoNo` 가 null 이고,
 *    그 결함은 **건너뛴다**.
 *
 * 경계: 순수 함수. `Blob`·`URL`·DOM 을 참조하지 않는다 —
 * 사진은 `renderBlobKey`(불투명 문자열)로만 오간다. objectURL 변환은 어댑터의 몫이다.
 */
import { outputSize, type SizeInput } from '../items/size.js';
import { primaryOf, type Photo, type PhotoEdits } from '../photo.js';
import { numText } from './damageTable.js';
import type { NumberingRow } from './numbering.js';

/** A4 세로 2열 × 3행 */
export const PHOTO_BOOK_PER_PAGE = 6;
export const PHOTO_BOOK_COLUMNS = 2;

/** 사진첩이 보는 결함의 최소 형태. 실제 `Defect` 를 그대로 넘기면 된다 */
export type PhotoBookDefect = SizeInput & {
  id: string;
  memberName: string | null;
  defectTypeName: string | null;
};

export type PhotoBookCell = {
  defectId: string;
  photoNo: number;
  /** 렌더 Blob 키 — 어댑터가 objectURL 로 바꾼다 */
  renderBlobKey: string;
  /** 회전(1차) · 자르기(예약). 렌더 시 적용한다 */
  edits: PhotoEdits;
  /** 3행 캡션을 줄로 나눈 것 — 인쇄 뷰가 쓴다 */
  lines: string[];
  /** `lines` 를 개행으로 이은 것 */
  caption: string;
};

export type PhotoBookPage = {
  index: number;
  /** `cells.length ≤ 6`. 마지막 페이지가 6 으로 안 나눠떨어져도 **칸 크기는 유지한다** */
  cells: PhotoBookCell[];
};

export type PhotoBookInput = {
  /** 출력 순서 그대로 (`assignNumbers().rows` 또는 `ExportRun` 재구성) */
  rows: readonly NumberingRow[];
  defects: readonly PhotoBookDefect[];
  /** 결함 id → 그 결함의 사진 목록. `groupPhotosByDefect()` 결과를 그대로 넣는다 */
  photosByDefect: ReadonlyMap<string, readonly Photo[]>;
  /** 결함 id → `위치` 문자열. `damageTable.ts::buildLocations()` 결과 */
  locations: Readonly<Record<string, string>>;
  /** 기본 6 */
  perPage?: number;
};

/**
 * 페이지 배치. **대표사진 기준**(§2-C · `primaryOf`).
 * 대표사진이 없는 결함은 `photoNo` 가 null 이므로 자동으로 빠진다.
 */
export function buildPhotoBook(input: PhotoBookInput): PhotoBookPage[] {
  const perPage = Math.max(1, input.perPage ?? PHOTO_BOOK_PER_PAGE);
  const defectById = new Map(input.defects.map((d) => [d.id, d]));

  const cells: PhotoBookCell[] = [];
  for (const r of input.rows) {
    if (r.photoNo === null) continue; // 대표사진 없음 — 사진첩에서 빠진다
    const d = defectById.get(r.defectId);
    if (!d) continue; // 재다운로드 중 지워진 결함
    const photo = primaryOf(input.photosByDefect.get(r.defectId) ?? []);
    if (!photo) continue; // 사진이 사라졌다 — 번호는 밀지 않고 칸만 비운다

    const lines = photoCaptionLines({
      photoNo: r.photoNo,
      location: input.locations[r.defectId] ?? '',
      defect: d,
      photoCaption: photo.caption,
    });

    cells.push({
      defectId: r.defectId,
      photoNo: r.photoNo,
      renderBlobKey: photo.renderBlobKey,
      edits: photo.edits,
      lines,
      caption: lines.join('\n'),
    });
  }

  const pages: PhotoBookPage[] = [];
  for (let i = 0; i < cells.length; i += perPage) {
    pages.push({ index: pages.length, cells: cells.slice(i, i + perPage) });
  }
  return pages;
}

/**
 * 캡션 3행 — 기획서 §6 예시 `"수직균열 0.2×0.5×3ea"` 를 그대로 따른다.
 *
 * ```
 * 1행: 사진 {photoNo}
 * 2행: {위치}  {부재명}
 * 3행: {결함유형} {폭}×{길이m}×{개소}ea   ← WL
 *      {결함유형} {면적}㎡×{개소}ea       ← AREA
 * ```
 *
 * ⚠️ **길이는 m 로 환산해 적는다** (`lengthMm/1000` — K19).
 * 예시의 `0.5` 가 m 다. mm 로 적으면 `0.2×2000×2ea` 가 되어 예시와 어긋난다.
 * 폭은 mm 원값 그대로다(D7 의 `0.2` 가 그대로 인쇄된다).
 */
export function photoCaptionLines(a: {
  photoNo: number;
  location: string;
  defect: PhotoBookDefect;
  /** 수동 캡션. 있으면 3행 대신 쓴다 (1차는 항상 null) */
  photoCaption: string | null;
}): string[] {
  const line1 = `사진 ${a.photoNo}`;
  const line2 = [a.location.trim(), (a.defect.memberName ?? '').trim()]
    .filter((s) => s !== '')
    .join('  ');
  const line3 = (a.photoCaption ?? '').trim() || photoSizeCaption(a.defect);
  return [line1, line2, line3].filter((s, i) => i === 0 || s !== '');
}

/** 3행 파생 캡션 — `수직균열 0.2×0.5×3ea` / `누수흔적 0.5㎡×2ea` */
export function photoSizeCaption(d: PhotoBookDefect): string {
  const size = outputSize(d);
  const name = (d.defectTypeName ?? '').trim();
  const ea = `${numText(size.countEa, 0)}ea`;
  const body =
    d.sizeMode === 'AREA'
      ? `${numText(size.areaM2, 4)}㎡×${ea}`
      : `${numText(size.widthMm, 2)}×${numText(size.lengthMm / 1000, 3)}×${ea}`;
  return name === '' ? body : `${name} ${body}`;
}
