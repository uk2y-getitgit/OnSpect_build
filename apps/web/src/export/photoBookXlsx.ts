/**
 * 사진첩 엑셀 시트 조립 — 사진첩 엑셀 다운로드 (2026-09-11, 사용자 요청).
 *
 * ⭐ **인쇄 뷰(`PrintPhotoBook`)와 같은 데이터(`PhotoBookPage[]`)·같은 합성 이미지
 *    (`renderPhotoBookImages`)를 쓴다** — 자르기·회전·주석이 인쇄판과 항상 일치한다.
 *    `photoBookImages.ts`의 "화면과 출력이 같은 합성 함수를 쓴다" 원칙을 여기도 따른다 —
 *    합성을 다시 만들지 않는다.
 *
 * 레이아웃만 다르다: 인쇄는 2×3 그리드(고정 지면), 엑셀은 **사진 1장 = 1행** 표 다 —
 * 정렬·필터·행 추가삭제가 엑셀에서 자연스럽게 되는 것이 이 기능의 목적이다.
 *
 * ⭐ **일회성 출력물이다** — 사용자 확인(AskUserQuestion, 2026-09-11): 엑셀에서 고쳐도
 *    OnSpect 데이터로 재반영되지 않는다. 가져오기(import)는 범위 밖이다.
 *
 * 이미지는 합성 원본을 그대로 넣지 않고 여기서 다시 다운스케일한다 — 결함 수백 건이면
 * 원본 그대로는 파일이 수백MB가 된다. 리사이즈는 `photoIngest.ts`(사진 업로드가 썸네일을
 * 만들 때 쓰는 것과 같은 함수, `fitEdge`·`toJpegBlob`)를 재사용한다 — 세 번째 리사이즈
 * 코드를 새로 만들지 않는다.
 */
import type { PhotoBookPage } from '@onspect/project-core';
import { decodeImage, fitEdge, toJpegBlob } from '../data/photoIngest';
import { IMAGE_DPI, type SheetCell, type SheetImage, type SheetSpec } from './xlsx';
import type { PhotoBookImages } from './photoBookImages';

/** 썸네일 장변(px). 손상결함표류보다 훨씬 작게 잡는다 — 사진 수백 장이 한 파일에 들어간다 */
const THUMB_EDGE_PX = 220;
const THUMB_QUALITY = 0.8;
/** px → pt 환산. `xlsx.ts`의 `IMAGE_DPI`를 그대로 가져다 쓴다 — 상수를 따로 안 둬야 어긋날 일이 없다 */
const PT_PER_PX = 72 / IMAGE_DPI;
const ROW_PAD_PT = 8;
const MIN_ROW_PT = 20;
const PHOTO_COL_WIDTH_CH = 32;
const HEADER_BG = '#eef2f7';

export type PhotoBookXlsxWarning = { defectNo: string; reason: string };

export type PhotoBookXlsxResult = {
  sheet: SheetSpec;
  /** 사진을 못 불러왔거나 리사이즈에 실패한 칸 — 사용자에게 몇 건인지 알리는 용도 */
  warnings: PhotoBookXlsxWarning[];
};

export async function buildPhotoBookXlsxSheet(
  pages: readonly PhotoBookPage[],
  images: PhotoBookImages,
  sheetName: string,
): Promise<PhotoBookXlsxResult> {
  const hasBuilding = pages.some((p) => p.buildingName !== null);
  const headerLabels = hasBuilding
    ? ['결함번호', '동', '사진', '캡션']
    : ['결함번호', '사진', '캡션'];
  const photoColIndex = hasBuilding ? 2 : 1; // 0-based

  const header: (SheetCell | null)[] = headerLabels.map((label) => ({
    v: label,
    bold: true,
    align: 'center',
    border: true,
    bg: HEADER_BG,
  }));

  const rows: (SheetCell | null)[][] = [header];
  const sheetImages: SheetImage[] = [];
  const warnings: PhotoBookXlsxWarning[] = [];

  for (const page of pages) {
    for (const cell of page.cells) {
      const rowIndex = rows.length; // 0-based — 이 행을 push 하면 갖게 될 인덱스
      const src = images.byCell[cell.key];
      let thumb: { blob: Blob; w: number; h: number } | null = null;

      if (src) {
        try {
          const raw = await (await fetch(src.url)).blob();
          const decoded = await decodeImage(raw);
          try {
            const size = fitEdge(decoded.width, decoded.height, THUMB_EDGE_PX);
            const blob = await toJpegBlob(decoded.source, size.w, size.h, THUMB_QUALITY);
            thumb = { blob, w: size.w, h: size.h };
          } finally {
            decoded.release();
          }
        } catch (e) {
          warnings.push({
            defectNo: cell.defectNo,
            reason: e instanceof Error ? e.message : String(e),
          });
        }
      } else {
        warnings.push({ defectNo: cell.defectNo, reason: '사진을 불러오지 못했습니다' });
      }

      const rowHeightPt = Math.max(MIN_ROW_PT, Math.round((thumb?.h ?? 0) * PT_PER_PX) + ROW_PAD_PT);

      const row: (SheetCell | null)[] = [{ v: cell.defectNo, border: true, height: rowHeightPt }];
      if (hasBuilding) row.push({ v: page.buildingName ?? '', border: true });
      // 사진 칸 — 성공하면 비워 둔다(이미지가 그 위에 얹힌다). 실패하면 이유가 보이게 남긴다
      row.push({ v: thumb ? '' : '(사진 못 불러옴)', border: true });
      row.push({ v: cell.caption, border: true });
      rows.push(row);

      if (thumb) {
        sheetImages.push({
          content: thumb.blob,
          contentType: 'image/jpeg',
          width: thumb.w,
          height: thumb.h,
          row: rowIndex,
          column: photoColIndex,
        });
      }
    }
  }

  const sheet: SheetSpec = {
    name: sheetName,
    cols: hasBuilding ? [10, 12, PHOTO_COL_WIDTH_CH, 40] : [10, PHOTO_COL_WIDTH_CH, 40],
    rows,
    images: sheetImages,
  };

  return { sheet, warnings };
}
