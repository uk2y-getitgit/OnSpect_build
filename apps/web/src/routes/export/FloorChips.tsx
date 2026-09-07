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

/**
 * D45 B-2 — 동 그룹. **`floors` 등장 순서를 그대로 따른다**
 * (`exportFloors()` = 동 순위 → `sortOrder`). 여기서 다시 정렬하지 않는다.
 */
type BuildingGroup = { id: string; name: string; floors: ExportFloor[] };

function groupByBuilding(floors: readonly ExportFloor[]): BuildingGroup[] {
  const out: BuildingGroup[] = [];
  const byId = new Map<string, BuildingGroup>();
  for (const f of floors) {
    let g = byId.get(f.buildingId);
    if (!g) {
      g = { id: f.buildingId, name: f.buildingName.trim(), floors: [] };
      byId.set(f.buildingId, g);
      out.push(g);
    }
    g.floors.push(f);
  }
  return out;
}

export function FloorChips({ floors, selected, ranges, onChange }: FloorChipsProps) {
  const rangeOf = new Map(ranges.map((r) => [r.floorId, r]));
  const orderOf = new Map(selected.map((id, i) => [id, i + 1]));
  const groups = groupByBuilding(floors);
  /** 동이 1개면 그룹 헤더도 동 단위 버튼도 그리지 않는다 — 화면이 지금과 완전히 같다 (P1) */
  const multiBuilding = groups.length >= 2;

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  const selectAll = () => onChange(floors.map((f) => f.id));

  // ── 동 단위 선택 (D45 B-2) ───────────────────────────────────────────────
  /** `[이 동 전체]` — 이 동의 층을 **현재 선택 뒤에 이어 붙인다**(누른 순서 = 출력 순서 규칙 유지) */
  const addBuilding = (g: BuildingGroup) => {
    const has = new Set(selected);
    onChange([...selected, ...g.floors.map((f) => f.id).filter((id) => !has.has(id))]);
  };
  /** `[이 동만]` — 선택을 비우고 이 동의 층만 지하→지상 순으로 넣는다. **"동별로 뽑기"의 진입점** */
  const onlyBuilding = (g: BuildingGroup) => onChange(g.floors.map((f) => f.id));
  /** `[이 동 해제]` — 이 동의 층만 선택에서 뺀다 */
  const removeBuilding = (g: BuildingGroup) => {
    const mine = new Set(g.floors.map((f) => f.id));
    onChange(selected.filter((id) => !mine.has(id)));
  };

  /**
   * ⚠️ `sortOrder` 는 **동 안에서의 순번**이다(불변식 #5 · D45 B-1).
   *    동을 무시하고 정렬하면 `A동 1층 → B동 1층 → A동 2층 …` 으로 동이 섞인다.
   *    **동 순위가 1차 키**, `sortOrder` 가 2차 키다. 동 순위는 `floors` 가 이미
   *    `exportFloors()` 순서(동 순위 → sortOrder)로 들어오므로 **등장 순서**로 얻는다 —
   *    이 파일은 새 정렬 규칙을 만들지 않는다.
   */
  const buildingRank = new Map<string, number>();
  for (const f of floors) {
    if (!buildingRank.has(f.buildingId)) buildingRank.set(f.buildingId, buildingRank.size);
  }
  const orderedIds = (dir: 1 | -1) =>
    [...floors]
      .sort((a, b) => {
        const ra = buildingRank.get(a.buildingId) ?? 0;
        const rb = buildingRank.get(b.buildingId) ?? 0;
        if (ra !== rb) return ra - rb;
        if (a.sortOrder !== b.sortOrder) return (a.sortOrder - b.sortOrder) * dir;
        return a.id < b.id ? -dir : a.id > b.id ? dir : 0;
      })
      .map((f) => f.id);

  const downUp = () => onChange(orderedIds(1));
  const upDown = () => onChange(orderedIds(-1));
  const clear = () => onChange([]);

  /**
   * 칩 한 장. **동 이름 접두는 넣지 않는다** — 동이 2개 이상이면 그룹 헤더가 이미 말하고 있어
   * 중복이다(D45 B-2-5). 동이 1개면 예전에도 접두가 없었다.
   */
  const chip = (f: ExportFloor) => {
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
        <span className="xp-chip__name">{f.name}</span>
        <span className="xp-chip__range">{r ? formatFloorRange(r) : `${f.defectCount}건`}</span>
        {!f.hasDrawing && (
          <span className="xp-chip__flag" title="도면이 없어 조사위치도가 나오지 않습니다">
            도면 없음
          </span>
        )}
      </button>
    );
  };

  const empty = <p className="muted">층이 없습니다. 용역 구성에서 먼저 추가해 주세요.</p>;

  return (
    <div className="xp-floors">
      {multiBuilding ? (
        <div className="xp-bgroups">
          {groups.map((g) => {
            const mine = g.floors.map((f) => f.id);
            const picked = mine.filter((id) => selected.includes(id)).length;
            // 이름이 빈 동은 없는 것처럼 취급할 수 없다 — 그룹은 존재하므로 자리표시자를 쓴다(P4)
            const label = g.name === '' ? '(이름 없는 동)' : g.name;
            return (
              <section className="xp-bgroup" key={g.id} aria-label={`${label} 층 선택`}>
                <header className="xp-bgroup__head">
                  <h4 className="xp-bgroup__name">
                    {label}
                    <span className="xp-bgroup__count num">
                      {picked}/{mine.length}
                    </span>
                  </h4>
                  <div className="xp-bgroup__tools">
                    <button
                      type="button"
                      className="btn btn--small"
                      onClick={() => addBuilding(g)}
                      disabled={picked === mine.length}
                      title={`${label}의 층을 현재 선택 뒤에 이어 붙입니다`}
                    >
                      이 동 전체
                    </button>
                    <button
                      type="button"
                      className="btn btn--small"
                      onClick={() => onlyBuilding(g)}
                      title={`선택을 비우고 ${label}의 층만 지하→지상 순으로 넣습니다`}
                    >
                      이 동만
                    </button>
                    <button
                      type="button"
                      className="btn btn--small"
                      onClick={() => removeBuilding(g)}
                      disabled={picked === 0}
                      title={`${label}의 층만 선택에서 뺍니다`}
                    >
                      이 동 해제
                    </button>
                  </div>
                </header>
                <div className="xp-floors__chips">{g.floors.map(chip)}</div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="xp-floors__chips" role="group" aria-label="출력할 층">
          {floors.map(chip)}
          {floors.length === 0 && empty}
        </div>
      )}

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
