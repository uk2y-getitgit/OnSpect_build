/**
 * 엑셀 어댑터 — Phase 4 스펙 §4-8 (**K10**).
 *
 * ⭐ **엑셀 라이브러리를 호출하는 곳은 이 파일 하나뿐이다.**
 *    행 데이터를 만드는 `project-core/export/*` 는 라이브러리를 전혀 모른다 —
 *    서식이 바뀌거나 라이브러리를 갈아치워도 고칠 곳이 한 곳이다.
 *
 * ⭐ **`await import()` 로 동적 로드한다.** 출력 화면에 들어가기 전까지 번들에 실리지 않는다.
 *
 * ⭐ **폴백이 있다.** 라이브러리 로드가 실패해도 CSV(UTF-8 BOM)로 낸다(§4-8 마지막 행).
 *    착수를 막지 않기 위한 안전장치이고, 화면은 `fellBack` 을 보고 사용자에게 알린다.
 *
 * 선정: `write-excel-file@4`(MIT). 브라우저 우선 설계이고 병합(`columnSpan`/`rowSpan`) ·
 * 테두리 · 정렬 · 열 너비를 전부 지원한다. Node 폴리필이 필요 없다(§4-8 1순위 그대로).
 * **인쇄 반복 행은 지원하지 않는다** — M2 참조.
 */
import { csvBlob } from './download';

export type SheetCell = {
  v: string | number | null;
  /** 가로 병합 — 이 칸이 뒤 `span - 1` 칸을 먹는다. 먹힌 칸은 배열에 `null` 로 남긴다 */
  span?: number;
  /** 세로 병합 */
  rowSpan?: number;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  /** 표 본문의 격자선. 기본 false */
  border?: boolean;
  /** 엑셀 표시 형식(`0.0000` 등). 비우면 일반 서식 — 꼬리 0 없이 보인다 */
  numFmt?: string;
  /** 배경색 `#eef2f7` */
  bg?: string;
};

export type SheetSpec = {
  name: string;
  /** 열 너비(문자 단위) */
  cols: number[];
  /** 병합에 먹힌 칸은 `null` */
  rows: (SheetCell | null)[][];
  /** 13열짜리 손상결함표처럼 가로가 긴 표 */
  landscape?: boolean;
};

export type WorkbookResult = {
  blob: Blob;
  ext: 'xlsx' | 'csv';
  /** 라이브러리가 막혀 CSV 로 냈는가 — 화면이 이 값을 보고 알린다 */
  fellBack: boolean;
  /** 폴백 사유(개발자용). 정상이면 null */
  reason: string | null;
};

const BORDER_STYLE = 'thin';
const BORDER_COLOR = '#9aa4b2';

/**
 * 스펙 §4-8 시그니처 그대로. **실패하면 던진다** — 폴백이 필요하면 `writeWorkbook()` 을 쓴다.
 */
export async function writeXlsx(sheets: readonly SheetSpec[]): Promise<Blob> {
  if (sheets.length === 0) throw new Error('시트가 없습니다');
  // 이 패키지는 루트 `exports` 가 없다 — **`/browser` 서브패스**를 써야 한다.
  // (`/node` 는 fs·stream 을 끌어와 Vite 에서 폴리필이 필요하다)
  const mod = (await import('write-excel-file/browser')) as unknown as {
    default: (sheets: unknown[], options?: unknown) => { toBlob: () => Promise<Blob> };
  };
  const payload = sheets.map((s) => ({
    data: toSheetData(s),
    sheet: s.name,
    columns: s.cols.map((w) => ({ width: w })),
    ...(s.landscape ? { orientation: 'landscape' as const } : {}),
  }));
  return mod.default(payload, { fontFamily: SHEET_FONT, fontSize: SHEET_FONT_SIZE }).toBlob();
}

/** 한글이 있는 통합문서의 기본 글꼴. 없는 PC 에서는 엑셀이 대체 글꼴을 쓴다 */
const SHEET_FONT = '맑은 고딕';
const SHEET_FONT_SIZE = 10;

/**
 * 엑셀을 먼저 시도하고, 막히면 **CSV(UTF-8 BOM)** 로 낸다.
 * 병합 헤더는 CSV 에서 텍스트로 펼쳐진다 — 서식은 없지만 데이터는 온전하다.
 */
export async function writeWorkbook(sheets: readonly SheetSpec[]): Promise<WorkbookResult> {
  try {
    const blob = await writeXlsx(sheets);
    return { blob, ext: 'xlsx', fellBack: false, reason: null };
  } catch (e) {
    return {
      blob: sheetsToCsv(sheets),
      ext: 'csv',
      fellBack: true,
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

/** 폴백 안내 문구 — 화면 두 곳(옵션 패널·완료 토스트)이 같은 문장을 쓴다 */
export const CSV_FALLBACK_NOTICE = '엑셀 서식 없이 CSV 로 저장됩니다';

// ── 변환 ───────────────────────────────────────────────────────────────────
type LibCell = Record<string, unknown>;

function toSheetData(s: SheetSpec): (LibCell | null)[][] {
  return s.rows.map((row) => row.map(toLibCell));
}

function toLibCell(c: SheetCell | null): LibCell | null {
  if (c === null) return null;
  const out: LibCell = {};
  if (c.v === null) {
    // 값 없는 칸도 테두리를 그리려면 빈 문자열이 필요하다
    out.value = '';
    out.type = String;
  } else if (typeof c.v === 'number') {
    out.value = c.v;
    out.type = Number;
  } else {
    out.value = c.v;
    out.type = String;
  }
  if (c.span && c.span > 1) out.columnSpan = c.span;
  if (c.rowSpan && c.rowSpan > 1) out.rowSpan = c.rowSpan;
  if (c.align) out.align = c.align;
  out.alignVertical = 'center';
  if (c.bold) out.fontWeight = 'bold';
  if (c.numFmt) out.format = c.numFmt;
  if (c.bg) out.backgroundColor = c.bg;
  if (c.border) {
    out.borderStyle = BORDER_STYLE;
    out.borderColor = BORDER_COLOR;
  }
  return out;
}

/**
 * CSV 폴백. 시트가 여러 장이면 시트 이름 줄로 구분해 한 파일에 이어 붙인다 —
 * CSV 는 시트 개념이 없다.
 */
export function sheetsToCsv(sheets: readonly SheetSpec[]): Blob {
  const out: (string | number | null)[][] = [];
  sheets.forEach((s, i) => {
    if (sheets.length > 1) {
      if (i > 0) out.push([]);
      out.push([`# ${s.name}`]);
    }
    for (const row of s.rows) out.push(row.map((c) => (c === null ? null : c.v)));
  });
  return csvBlob(out);
}
