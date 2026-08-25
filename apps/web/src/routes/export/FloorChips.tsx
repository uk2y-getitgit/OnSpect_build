/**
 * 층 선택 칩 — Phase 4 스펙 §4-1 1번 · §4-4.
 *
 * ⭐ **누른 순서가 곧 번호 순서다** (젠트릭스 방식). 라디오 2개(지하→지상 / 지상→지하)로는
 *    실무를 못 푼다 — 그 둘은 **보조 버튼**으로 흡수했다(§6 모순 항목).
 *
 * ⭐ 칩의 `1–12` 는 `assignNumbers()` 를 파라미터가 바뀔 때마다 다시 돌려 **실시간 갱신**한다.
 *    순수 함수라 비용이 없다. 칩을 다시 누르면 해제되고 뒤 칩들의 구간이 즉시 밀린다.
 */
import { formatFloorRange, type FloorRange } from '@onspect/project-core';
import type { ExportFloor } from '../../export/exportModel';

export type FloorChipsProps = {
  floors: readonly ExportFloor[];
  /** **누른 순서 그대로.** 이 배열이 출력 순서다 */
  selected: readonly string[];
  ranges: readonly FloorRange[];
  onChange: (next: string[]) => void;
};

export function FloorChips({ floors, selected, ranges, onChange }: FloorChipsProps) {
  const rangeOf = new Map(ranges.map((r) => [r.floorId, r]));
  const orderOf = new Map(selected.map((id, i) => [id, i + 1]));
  const multiBuilding = new Set(floors.map((f) => f.buildingId)).size >= 2;

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  const selectAll = () => onChange(floors.map((f) => f.id));
  const downUp = () =>
    onChange([...floors].sort((a, b) => a.sortOrder - b.sortOrder).map((f) => f.id));
  const upDown = () =>
    onChange([...floors].sort((a, b) => b.sortOrder - a.sortOrder).map((f) => f.id));
  const clear = () => onChange([]);

  return (
    <div className="xp-floors">
      <div className="xp-floors__chips" role="group" aria-label="출력할 층">
        {floors.map((f) => {
          const on = selected.includes(f.id);
          const r = rangeOf.get(f.id);
          return (
            <button
              key={f.id}
              type="button"
              className="xp-chip"
              aria-pressed={on}
              title={
                on
                  ? `${f.name} — ${orderOf.get(f.id)}번째로 출력됩니다. 다시 누르면 제외됩니다`
                  : `${f.name} — 누르면 출력에 포함됩니다 (결함 ${f.defectCount}건${f.hasDrawing ? '' : ' · 도면 없음'})`
              }
              onClick={() => toggle(f.id)}
            >
              {on && <span className="xp-chip__order">{orderOf.get(f.id)}</span>}
              <span className="xp-chip__name">
                {multiBuilding && f.buildingName ? `${f.buildingName} ` : ''}
                {f.name}
              </span>
              <span className="xp-chip__range">{r ? formatFloorRange(r) : `${f.defectCount}건`}</span>
              {!f.hasDrawing && (
                <span className="xp-chip__flag" title="도면이 없어 조사위치도가 나오지 않습니다">
                  도면 없음
                </span>
              )}
            </button>
          );
        })}
        {floors.length === 0 && <p className="muted">층이 없습니다. 용역 구성에서 먼저 추가해 주세요.</p>}
      </div>

      <div className="xp-floors__tools">
        <button type="button" className="btn btn--small" onClick={selectAll} disabled={floors.length === 0}>
          전체 선택
        </button>
        <button type="button" className="btn btn--small" onClick={downUp} disabled={floors.length === 0}>
          지하→지상
        </button>
        <button type="button" className="btn btn--small" onClick={upDown} disabled={floors.length === 0}>
          지상→지하
        </button>
        <button
          type="button"
          className="btn btn--small"
          onClick={clear}
          disabled={selected.length === 0}
          title={selected.length === 0 ? '선택된 층이 없습니다' : '선택을 모두 해제합니다'}
        >
          해제
        </button>
      </div>
    </div>
  );
}
