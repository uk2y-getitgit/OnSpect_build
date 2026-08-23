/**
 * 좌측 패널 — **동 ▸ 층 2단 트리** + 조사항목(결함) 리스트.
 *
 * 리스트 행을 누르면 해당 표기로 팬 + 하이라이트, 캔버스에서 선택하면 행이 스크롤되어 강조된다.
 *
 * ⚠️ 알려진 버그 3: `도면이 없습니다` 문구가 여기와 캔버스 두 곳에 있었다.
 *    **캔버스에만 남기고** 여기는 작은 `도면 없음` 배지만 둔다 (§2-10-c).
 */
import { useEffect, useMemo, useRef } from 'react';
import { countIncomplete, describeMissing, isIncomplete, type Defect } from '@onspect/canvas-core';
import { sortByOrder, type Building, type Drawing, type Floor } from '@onspect/project-core';

const STATUS_LABEL: Record<Defect['status'], string> = {
  CURRENT: '현회차',
  PREV_PENDING: '전회차',
  REPAIRED: '보수완료',
};

export type SidebarProps = {
  buildings: Building[];
  floors: Floor[];
  drawingByFloor: Map<string, Drawing>;
  defectCountByFloor: Map<string, number>;
  floorId: string;
  defects: Defect[];
  hasDrawing: boolean;
  selectedId: string | null;
  reveal: string | null;
  onSelectFloor: (floor: Floor) => void;
  onSelectDefect: (id: string) => void;
  onRevealDone: () => void;
};

export function Sidebar({
  buildings,
  floors,
  drawingByFloor,
  defectCountByFloor,
  floorId,
  defects,
  hasDrawing,
  selectedId,
  reveal,
  onSelectFloor,
  onSelectDefect,
  onRevealDone,
}: SidebarProps) {
  const listRef = useRef<HTMLUListElement | null>(null);
  const incomplete = countIncomplete(defects);
  // F7 — 전회차(PREV_PENDING·REPAIRED) / 금회차(CURRENT) 로 갈라 보여준다.
  // 전차 등록으로 결함을 가져온 용역이 아니면(전회차 0건) 굳이 나누지 않는다
  const prevCount = defects.filter((d) => d.status === 'PREV_PENDING' || d.status === 'REPAIRED').length;
  const currentCount = defects.length - prevCount;

  const tree = useMemo(() => {
    const byBuilding = new Map<string, Floor[]>();
    for (const f of floors) {
      const arr = byBuilding.get(f.buildingId);
      if (arr) arr.push(f);
      else byBuilding.set(f.buildingId, [f]);
    }
    // 층 정렬 = (building.sortOrder, floor.sortOrder) 오름차순 (§2-7-c)
    return sortByOrder(buildings).map((b) => ({
      building: b,
      floors: sortByOrder(byBuilding.get(b.id) ?? []),
    }));
  }, [buildings, floors]);

  // 캔버스에서 선택 → 해당 행으로 스크롤
  useEffect(() => {
    if (!reveal) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-defect-id="${reveal}"]`);
    el?.scrollIntoView({ block: 'nearest' });
    onRevealDone();
  }, [reveal, onRevealDone]);

  const onlyOneBuilding = tree.length === 1;

  return (
    <aside className="sidebar" aria-label="동·층과 조사항목">
      <section className="panel">
        <h2 className="panel__title">동 · 층</h2>
        <div className="tree" role="tree" aria-label="동과 층">
          {tree.map(({ building, floors: fs }) => (
            <div key={building.id} className="tree__group" role="group" aria-label={building.name}>
              {!onlyOneBuilding && (
                <div className="tree__building" title={building.name}>
                  {building.name}
                </div>
              )}
              {fs.length === 0 ? (
                <p className="tree__hint">층이 없습니다</p>
              ) : (
                <ul className="tree__list">
                  {fs.map((f) => {
                    const n = defectCountByFloor.get(f.id) ?? 0;
                    const selected = f.id === floorId;
                    const has = drawingByFloor.has(f.id);
                    return (
                      <li key={f.id} role="none">
                        <button
                          type="button"
                          role="treeitem"
                          aria-selected={selected}
                          className="tree__row"
                          data-selected={selected}
                          title={
                            has ? f.name : `${f.name} — 도면이 없어 결함을 찍을 수 없습니다`
                          }
                          onClick={() => onSelectFloor(f)}
                        >
                          <span className="tree__name">{f.name}</span>
                          {!has && <span className="chip chip--muted">도면 없음</span>}
                          <span className="tree__count num">{n}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="panel panel--grow">
        <h2 className="panel__title">
          조사항목
          <span className="panel__meta">
            {prevCount > 0 ? (
              <span title="전회차 — 아직 확인하지 않았거나 보수완료 처리된 결함">
                전회차 <span className="num">{prevCount}</span> · 금회차{' '}
                <span className="num">{currentCount}</span>
              </span>
            ) : (
              <>
                <span className="num">{defects.length}</span>건
              </>
            )}
            {incomplete > 0 && (
              <span className="badge badge--warn" title="부재 또는 결함유형이 비어 있는 결함">
                미완성 <span className="num">{incomplete}</span>건
              </span>
            )}
          </span>
        </h2>

        {defects.length === 0 ? (
          <div className="empty empty--compact">
            {hasDrawing ? (
              <>
                <p className="empty__title">아직 입력된 결함이 없습니다</p>
                <p className="empty__body">
                  우측 <b>점</b> 도구를 켜고 도면을 클릭하면 결함이 1건 추가됩니다.
                </p>
              </>
            ) : (
              // `도면이 없습니다` 안내와 [도면 올리기] 는 **캔버스 한 곳에만** 둔다 (§2-10-c).
              // 여기는 이 패널이 왜 비었는지만 한 줄로 말한다
              <p className="empty__body">도면을 올리면 이 자리에 조사항목이 쌓입니다.</p>
            )}
          </div>
        ) : (
          <ul className="dlist" ref={listRef} role="listbox" aria-label="결함 목록">
            {defects.map((d) => {
              const selected = d.id === selectedId;
              const incompleteRow = isIncomplete(d);
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    data-defect-id={d.id}
                    data-selected={selected}
                    className="dlist__row"
                    data-status={d.status}
                    onClick={() => onSelectDefect(d.id)}
                    title={`${d.memberName ?? '부재 미입력'} · ${d.defectTypeName ?? '결함유형 미입력'}`}
                  >
                    <span className="dlist__seq num" data-status={d.status}>
                      {d.seq}
                    </span>
                    <span className="dlist__body">
                      <span className="dlist__member">{d.memberName ?? '— 부재 미입력'}</span>
                      <span className="dlist__type">
                        {d.defectTypeName ?? '— 결함유형 미입력'}
                      </span>
                    </span>
                    <span className="dlist__tail">
                      {incompleteRow && (
                        <span className="dot dot--warn" title={describeMissing(d)} aria-label="미완성" />
                      )}
                      <span className="chip chip--status" data-status={d.status}>
                        {STATUS_LABEL[d.status]}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </aside>
  );
}
