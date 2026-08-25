/**
 * 결함 리스트 인쇄 뷰 (A4 세로 9열) — Phase 4 스펙 §3-5 · §4-9.
 *
 * **페이지네이션을 계산하지 않는다.** `thead` 반복과 `break-inside: avoid` 를 CSS 가 처리한다.
 * 층 섹션 머리는 `break-after: avoid` 로 혼자 페이지 끝에 남지 않는다.
 */
import { formatDamageCell, type DamageTableModel } from '@onspect/project-core';

export function PrintDefectList({ model }: { model: DamageTableModel }) {
  const cols = model.columns;
  const total = cols.reduce((s, c) => s + c.width, 0);

  return (
    <div className="pv-page">
      <div className="pv-page__head">
        <h1 className="pv-page__title">{model.title}</h1>
        <p className="pv-page__sub">
          {model.headerLine2} · 결함 리스트 · {model.rowCount}건
        </p>
      </div>

      <table className="pv-table">
        <colgroup>
          {cols.map((c) => (
            <col key={c.key} style={{ width: `${((c.width / total) * 100).toFixed(2)}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key}>{c.header}</th>
            ))}
          </tr>
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
