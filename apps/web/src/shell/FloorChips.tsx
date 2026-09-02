/**
 * 층 칩 스트립 (T2-3 · 스펙 `50_plan-reviewer_spec_Phase5_TeamSync.md` §6-2).
 *
 * PC 의 층 전환은 좌측 `Sidebar` 동·층 트리 하나뿐이다. 태블릿에서는 그 트리가
 * 사이드바를 접으면 통째로 사라지고(엄지가 닿기도 멀다) — 이 칩 스트립은 그 자리를
 * **보완**한다. Sidebar 를 대체하지 않는다. 둘 다 같은 `onSelectFloor` 로 이어진다.
 *
 * 정렬은 `CanvasRoute` 가 이미 만들어 둔 `orderedFloors`(동 → `sortOrder` 오름차순,
 * `project-core/sortByOrder` 그대로)를 받는다 — 이 파일은 새 정렬 규칙을 만들지 않는다.
 */
import { useEffect, useRef } from 'react';
import type { Drawing, Floor } from '@onspect/project-core';

export type FloorChipsProps = {
  /** 이미 (동, `sortOrder`) 오름차순으로 정렬된 목록 — `CanvasRoute.orderedFloors` */
  floors: Floor[];
  drawingByFloor: Map<string, Drawing>;
  defectCountByFloor: Map<string, number>;
  currentFloorId: string;
  onSelect: (floor: Floor) => void;
};

export function FloorChips({
  floors,
  drawingByFloor,
  defectCountByFloor,
  currentFloorId,
  onSelect,
}: FloorChipsProps) {
  const stripRef = useRef<HTMLDivElement | null>(null);

  // 층이 다른 경로(사이드바 트리 · URL 이동)로 바뀌어도 지금 칩이 스트립 안에 보이게 한다
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-floor-id="${currentFloorId}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [currentFloorId]);

  if (floors.length < 2) return null; // 층이 하나뿐이면 전환할 것이 없다

  return (
    <div
      ref={stripRef}
      className="stage__floorchips"
      data-floating
      role="tablist"
      aria-label="층 전환"
    >
      {floors.map((f) => {
        const n = defectCountByFloor.get(f.id) ?? 0;
        const has = drawingByFloor.has(f.id);
        const active = f.id === currentFloorId;
        return (
          <button
            key={f.id}
            type="button"
            role="tab"
            data-floor-id={f.id}
            aria-selected={active}
            className="floorchip"
            data-active={active || undefined}
            title={has ? f.name : `${f.name} — 도면이 없어 결함을 찍을 수 없습니다`}
            onClick={() => onSelect(f)}
          >
            <span className="floorchip__name">{f.name}</span>
            {!has && <span className="floorchip__nodrawing" aria-hidden="true" />}
            {n > 0 && <span className="floorchip__count num">{n}</span>}
          </button>
        );
      })}
    </div>
  );
}
