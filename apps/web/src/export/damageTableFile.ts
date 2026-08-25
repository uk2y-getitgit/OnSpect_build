/**
 * 손상결함표 · 결함 리스트 → 엑셀 시트 — Phase 4 스펙 §3-4 표 구조 · §3-5.
 *
 * **행 값은 계산하지 않는다.** `project-core/export/damageTable.ts` 가 만든 `DamageTableModel`
 * 을 시트 좌표로 옮기기만 한다 — 두 산출물이 같은 모델을 쓰므로 열만 다르고 값은 같다.
 *
 * 표 구조 (§3-4):
 * ```
 * 1행  {project.name}                                   ← 전체 병합
 * 2행  {params.doc.headerLine2}                         ← 전체 병합
 * 3행  <계 속>                                          ← 전체 병합
 * 4행  NO·위치·… (4~5행 세로 병합)  |  손상규모 (4열 가로 병합)
 * 5행                                 |  폭 · 길이 · 면적 · 개소
 * 6행~ ■ {층이름}  ← 층이 바뀔 때마다 (전체 병합)
 *      본문 행
 * 끝   (빈 줄) 발생원인:  1. 건조수축  2. …
 * ```
 */
import {
  DAMAGE_SIZE_GROUP,
  formatDamageCell,
  type DamageTableModel,
} from '@onspect/project-core';
import type { SheetCell, SheetSpec } from './xlsx';

const HEADER_BG = '#eef2f7';
const SECTION_BG = '#f6f8fa';

/** 엑셀 인쇄에서 반복돼야 하는 머리말 행 수 (§3-4). M2 — 라이브러리가 지원하지 않는다 */
export const DAMAGE_REPEAT_ROWS = 5;

export function damageTableSheet(model: DamageTableModel, sheetName: string): SheetSpec {
  const cols = model.columns;
  const width = cols.length;
  const rows: (SheetCell | null)[][] = [];

  // 1~3행 머리말 — 전체 병합
  rows.push(fullWidth(model.title, width, { bold: true, align: 'center' }));
  rows.push(fullWidth(model.headerLine2, width, { align: 'center' }));
  rows.push(fullWidth(model.continued, width, { align: 'right' }));

  // 4행 — 단독 열은 4~5행 세로 병합, `손상규모` 는 하위 4열 가로 병합
  const head1: (SheetCell | null)[] = [];
  const head2: (SheetCell | null)[] = [];
  let i = 0;
  while (i < cols.length) {
    const col = cols[i]!;
    if (col.group === null) {
      head1.push({
        v: col.header,
        rowSpan: 2,
        align: 'center',
        bold: true,
        border: true,
        bg: HEADER_BG,
      });
      head2.push(null);
      i += 1;
      continue;
    }
    // 같은 그룹이 연속하는 만큼 묶는다 — 결함 리스트처럼 일부만 남아도 폭이 맞는다
    let n = 1;
    while (i + n < cols.length && cols[i + n]!.group === col.group) n += 1;
    head1.push({
      v: col.group ?? DAMAGE_SIZE_GROUP,
      span: n,
      align: 'center',
      bold: true,
      border: true,
      bg: HEADER_BG,
    });
    for (let k = 1; k < n; k += 1) head1.push(null);
    for (let k = 0; k < n; k += 1) {
      head2.push({
        v: cols[i + k]!.header,
        align: 'center',
        bold: true,
        border: true,
        bg: HEADER_BG,
      });
    }
    i += n;
  }
  rows.push(head1);
  rows.push(head2);

  // 본문
  for (const section of model.sections) {
    rows.push(
      fullWidth(section.title, width, { bold: true, align: 'left', border: true, bg: SECTION_BG }),
    );
    for (const r of section.rows) {
      rows.push(
        cols.map((col) => {
          const raw = r.cells[col.key];
          // 숫자는 숫자로 넣는다 — 엑셀에서 합계·정렬이 된다.
          // 표시 형식은 일반 서식이라 `0.0005` · `0.5` 가 꼬리 0 없이 그대로 보인다(M1).
          const v = typeof raw === 'number' ? raw : formatDamageCell(col, raw);
          return { v, align: col.align, border: true } satisfies SheetCell;
        }),
      );
    }
  }

  // 발생원인 범례 — 표 끝 별도 블록 (K21)
  if (model.causeLegend.length > 0) {
    rows.push(fullWidth('', width, {}));
    rows.push(
      fullWidth(
        `발생원인:  ${model.causeLegend.map((c) => `${c.code}. ${c.name}`).join('   ')}`,
        width,
        { align: 'left' },
      ),
    );
  }

  return {
    name: sheetName,
    cols: cols.map((c) => c.width),
    rows,
    landscape: cols.length > 9,
  };
}

function fullWidth(
  v: string,
  width: number,
  style: Omit<SheetCell, 'v' | 'span'>,
): (SheetCell | null)[] {
  const out: (SheetCell | null)[] = [{ v, span: width, ...style }];
  for (let i = 1; i < width; i += 1) out.push(null);
  return out;
}
