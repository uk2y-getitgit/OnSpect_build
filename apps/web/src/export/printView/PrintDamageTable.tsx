/**
 * 손상결함표 · 결함 리스트 **공용** 인쇄 뷰 — PhotoPolish 스펙 §2-9.
 *
 * ⭐ **두 산출물이 이 컴포넌트 하나를 쓴다.** 표를 두 벌로 쓰면 열 정의가 같아도
 *    셀 서식·페이지 규칙이 조용히 갈린다(`damageTable.ts` 가 행 생성기를 하나로 묶은 것과 같은 이유).
 *
 * ⚠️ **`groupHeader` 를 자동 판정하지 않는다.** `DEFECT_LIST_COLUMNS` 의 폭·길이·면적·개소도
 *    `DAMAGE_COLUMNS` 에서 온 같은 객체라 `group: '손상규모'` 를 **이미 갖고 있다** —
 *    자동으로 켜면 기존 결함 리스트 PDF 에 없던 병합 머리가 조용히 생긴다. 호출자가 명시한다.
 *
 * **페이지네이션을 계산하지 않는다.** `thead` 반복과 `break-inside: avoid` 를 CSS 가 처리한다.
 * 층 섹션 머리는 `break-after: avoid` 로 혼자 페이지 끝에 남지 않는다.
 */
import {
  formatCauseLegend,
  formatDamageCell,
  type DamageColumn,
  type DamageTableModel,
} from '@onspect/project-core';

export type PrintDamageTableProps = {
  model: DamageTableModel;
  /** 머리말 2행 뒤에 붙는 산출물 이름 — `손상결함표` · `결함 리스트` */
  subtitle: string;
  /** `손상규모` 묶음을 2행 머리로 병합한다. 나머지 열은 `rowSpan=2` */
  groupHeader: boolean;
  /** 표 아래에 이 출력에 실제로 등장한 발생원인 범례를 붙인다 (K21) */
  legend: boolean;
};

/** 연속한 같은 `group` 열끼리 묶는다. `group === null` 은 언제나 단독 묶음이다 */
type HeaderGroup = { group: string | null; cols: DamageColumn[] };

export function headerGroups(cols: readonly DamageColumn[]): HeaderGroup[] {
  const out: HeaderGroup[] = [];
  for (const c of cols) {
    const last = out[out.length - 1];
    if (last && c.group !== null && last.group === c.group) last.cols.push(c);
    else out.push({ group: c.group, cols: [c] });
  }
  return out;
}

export function PrintDamageTable({ model, subtitle, groupHeader, legend }: PrintDamageTableProps) {
  const cols = model.columns;
  const total = cols.reduce((s, c) => s + c.width, 0);
  const groups = groupHeader ? headerGroups(cols) : null;

  return (
    <div className="pv-page">
      <div className="pv-page__head">
        <h1 className="pv-page__title">{model.title}</h1>
        <p className="pv-page__sub">
          {model.headerLine2} · {subtitle} · {model.rowCount}건
        </p>
      </div>

      <table className="pv-table">
        <colgroup>
          {cols.map((c) => (
            <col key={c.key} style={{ width: `${((c.width / total) * 100).toFixed(2)}%` }} />
          ))}
        </colgroup>
        <thead>
          {groups === null ? (
            <tr>
              {cols.map((c) => (
                <th key={c.key}>{c.header}</th>
              ))}
            </tr>
          ) : (
            <>
              <tr>
                {groups.map((g) =>
                  g.group === null ? (
                    <th key={g.cols[0]!.key} rowSpan={2}>
                      {g.cols[0]!.header}
                    </th>
                  ) : (
                    <th key={`g-${g.group}-${g.cols[0]!.key}`} colSpan={g.cols.length}>
                      {g.group}
                    </th>
                  ),
                )}
              </tr>
              <tr>
                {groups
                  .filter((g) => g.group !== null)
                  .flatMap((g) => g.cols)
                  .map((c) => (
                    <th key={c.key}>{c.header}</th>
                  ))}
              </tr>
            </>
          )}
        </thead>
        <tbody>
          {model.sections.map((s) => (
            <PrintSection key={s.floorId} section={s} model={model} />
          ))}
          {model.rowCount === 0 && (
            <tr>
              <td colSpan={cols.length} className="pv-align-center">
                출력할 결함이 없습니다
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {legend && model.causeLegend.length > 0 && (
        <p className="pv-legend">
          {/* 엑셀(`damageTableFile.ts`)과 **같은 순수 함수**로 만든 문자열이다 — 두 산출물이 갈리지 않는다 */}
          <span className="pv-legend__label">발생원인</span>
          {formatCauseLegend(model.causeLegend)}
        </p>
      )}
    </div>
  );
}

function PrintSection({
  section,
  model,
}: {
  section: DamageTableModel['sections'][number];
  model: DamageTableModel;
}) {
  const cols = model.columns;
  return (
    <>
      <tr className="pv-table__section">
        <td colSpan={cols.length}>{section.title}</td>
      </tr>
      {section.rows.map((r) => (
        <tr key={r.defectId}>
          {cols.map((c) => (
            <td key={c.key} className={`pv-align-${c.align}`}>
              {formatDamageCell(c, r.cells[c.key])}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
