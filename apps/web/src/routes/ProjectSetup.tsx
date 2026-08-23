/**
 * P3 용역 구성 — 동 · 층 · 도면 (T6 · T7 + T12 구조 복사).
 *
 * 왼쪽이 동, 오른쪽이 그 동의 층이다. 층 행에 도면이 붙는다 (S1 은 층당 1장 — Q15 A안).
 *
 * ⚠️ `sortOrder` 숫자를 **UI 에 노출하지 않는다.** 사용자는 드래그만 한다. 내부 값이다 (§2-7-b).
 *    다만 드래그로만 되는 조작은 키보드 사용자에게 없는 기능이라, `⋯` 메뉴에 `위로/아래로` 를 함께 둔다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Defect } from '@onspect/canvas-core';
import {
  changedOrders,
  floorsNeedingOrderCheck,
  normalizeName,
  projectDisplayName,
  reorder,
  sortByOrder,
  validateBuildingName,
  validateDrawingName,
  validateFloorName,
  type Building,
  type CopyStructureResult,
  clampScale,
  type Drawing,
  type DrawingLegend,
  type DrawingTitleBlock,
  type Floor,
  type Project,
} from '@onspect/project-core';
import { useAppData } from '../data/appData';
import { makeBuilding, makeFloor } from '../data/factory';
import { navigate } from '../router';
import { EmptyState } from '../ui/Form';
import { MoreMenu } from '../ui/Menu';
import { ConfirmDialog } from '../ui/Overlays';
import { useToast } from '../ui/ToastHost';
import { DrawingThumb } from '../ui/DrawingThumb';
import { DrawingScaleDialog } from './DrawingScaleDialog';
import { TitleBlockDialog } from './TitleBlockDialog';
import { releaseComposite } from '../canvas/drawingComposite';
import { scaledImgLayout } from '../data/imageIngest';

type Editing =
  | { kind: 'BUILDING'; id: string; value: string }
  | { kind: 'NEW_BUILDING'; value: string }
  | { kind: 'FLOOR'; id: string; value: string }
  | { kind: 'NEW_FLOOR'; value: string }
  | { kind: 'DRAWING'; id: string; value: string }
  | null;

type Confirming =
  | { kind: 'DELETE_BUILDING'; building: Building; floors: number; drawings: number; defects: number }
  | { kind: 'DELETE_FLOOR'; floor: Floor; drawings: number; defects: number }
  | { kind: 'DELETE_DRAWING'; drawing: Drawing; floor: Floor; defects: number }
  | { kind: 'COPY_STRUCTURE'; existingBuildings: number }
  | null;

export function ProjectSetup({ projectId }: { projectId: string }) {
  const { storage, guard, reload, reloadKey } = useAppData();
  const toast = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [defects, setDefects] = useState<Defect[]>([]);
  /** F5-3 — 도면 크기 조절 대상 */
  const [scaling, setScaling] = useState<Drawing | null>(null);
  const [scaleBusy, setScaleBusy] = useState(false);
  /** F5-1 — 도곽 설정 대상 */
  const [titling, setTitling] = useState<Drawing | null>(null);
  const [titleBusy, setTitleBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [prevName, setPrevName] = useState<string | null>(null);
  /** 사용자가 동을 직접 골랐는가. 골랐다면 다시 읽어도 그 선택을 존중한다 */
  const userPicked = useRef(false);

  // ── 로드 ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (storage.phase !== 'READY') return;
    let alive = true;
    setLoading(true);
    void (async () => {
      const b = await storage.repo.loadBundle(projectId);
      if (!alive) return;
      if (!b) {
        setNotFound(true);
        return;
      }
      setProject(b.project);
      setBuildings(b.buildings);
      setFloors(b.floors);
      setDrawings(b.drawings);
      setDefects(b.defects);
      setSelectedBuildingId((cur) => {
        if (userPicked.current && cur && b.buildings.some((x) => x.id === cur)) return cur;
        // 사용자가 고른 적이 없으면 **층이 있는 첫 동**을 연다.
        // 업로드가 새 동을 만든 직후 빈 동이 열려 있으면 방금 올린 도면이 안 보인다
        const ordered = sortByOrder(b.buildings);
        const withFloors = ordered.find((x) => b.floors.some((f) => f.buildingId === x.id));
        return withFloors?.id ?? ordered[0]?.id ?? null;
      });
      setLoading(false);
      if (b.project.prevProjectId) {
        const prev = await storage.repo.getProject(b.project.prevProjectId);
        if (alive) setPrevName(prev ? projectDisplayName(prev) : null);
      } else if (alive) {
        setPrevName(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [storage, projectId, reloadKey]);

  useEffect(() => {
    if (!notFound) return;
    toast('해당 용역을 찾을 수 없습니다', { kind: 'warn' });
    navigate({ name: 'LIST' });
  }, [notFound, toast]);

  // ── 파생 ────────────────────────────────────────────────────────────────
  const orderedBuildings = useMemo(() => sortByOrder(buildings), [buildings]);
  const buildingFloors = useMemo(
    () => sortByOrder(floors.filter((f) => f.buildingId === selectedBuildingId)),
    [floors, selectedBuildingId],
  );
  const drawingByFloor = useMemo(() => {
    const m = new Map<string, Drawing>();
    for (const d of drawings) m.set(d.floorId, d);
    return m;
  }, [drawings]);
  const defectsByFloor = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of defects) m.set(d.floorId, (m.get(d.floorId) ?? 0) + 1);
    return m;
  }, [defects]);
  const floorsByBuilding = useMemo(() => {
    const m = new Map<string, Floor[]>();
    for (const f of floors) {
      const arr = m.get(f.buildingId);
      if (arr) arr.push(f);
      else m.set(f.buildingId, [f]);
    }
    return m;
  }, [floors]);
  const orderCheck = useMemo(() => floorsNeedingOrderCheck(buildingFloors), [buildingFloors]);

  const firstFloorWithDrawing = useMemo(() => {
    const all = sortByOrder(floors);
    // 동 순서 → 층 순서 (§2-7-c)
    const rank = new Map(orderedBuildings.map((b, i) => [b.id, i]));
    return (
      [...all]
        .sort((a, b) => (rank.get(a.buildingId) ?? 0) - (rank.get(b.buildingId) ?? 0) || a.sortOrder - b.sortOrder)
        .find((f) => drawingByFloor.has(f.id)) ?? null
    );
  }, [floors, orderedBuildings, drawingByFloor]);

  // ── 쓰기 (로컬 우선: 메모리 먼저, 저장은 뒤따른다) ──────────────────────
  const saveBuildings = useCallback(
    (changed: Building[], nextAll: Building[]) => {
      setBuildings(nextAll);
      if (changed.length > 0 && storage.phase === 'READY') {
        void guard(() => storage.repo.putBuildings(changed));
      }
    },
    [storage, guard],
  );
  const saveFloors = useCallback(
    (changed: Floor[], nextAll: Floor[]) => {
      setFloors(nextAll);
      if (changed.length > 0 && storage.phase === 'READY') {
        void guard(() => storage.repo.putFloors(changed));
      }
    },
    [storage, guard],
  );

  const addBuilding = useCallback(
    (raw: string) => {
      if (storage.phase !== 'READY') return false;
      const v = validateBuildingName(raw);
      if (!v.ok) {
        setEditError(v.message);
        return false;
      }
      const b = makeBuilding(storage.deviceId, projectId, normalizeName(raw), buildings);
      setBuildings((cur) => [...cur, b]);
      userPicked.current = true;
      setSelectedBuildingId(b.id);
      void guard(() => storage.repo.putBuildings([b])).then(reload);
      return true;
    },
    [storage, projectId, buildings, guard, reload],
  );

  const renameBuilding = useCallback(
    (id: string, raw: string) => {
      const v = validateBuildingName(raw);
      if (!v.ok) {
        setEditError(v.message);
        return false;
      }
      const next = buildings.map((b) => (b.id === id ? { ...b, name: normalizeName(raw) } : b));
      saveBuildings(next.filter((b) => b.id === id), next);
      return true;
    },
    [buildings, saveBuildings],
  );

  const moveBuilding = useCallback(
    (id: string, toIndex: number) => {
      const after = reorder(orderedBuildings, id, toIndex);
      const changed = changedOrders(orderedBuildings, after);
      if (changed.length === 0) return;
      const map = new Map(after.map((x) => [x.id, x.sortOrder]));
      const nextAll = buildings.map((b) => ({ ...b, sortOrder: map.get(b.id) ?? b.sortOrder }));
      setBuildings(nextAll);
      if (storage.phase === 'READY') void guard(() => storage.repo.putBuildings(changed));
    },
    [orderedBuildings, buildings, storage, guard],
  );

  const addFloor = useCallback(
    (raw: string) => {
      if (storage.phase !== 'READY' || !selectedBuildingId) return false;
      const v = validateFloorName(raw);
      if (!v.ok) {
        setEditError(v.message);
        return false;
      }
      const f = makeFloor(
        storage.deviceId,
        projectId,
        selectedBuildingId,
        normalizeName(raw),
        buildingFloors,
      );
      setFloors((cur) => [...cur, f]);
      void guard(() => storage.repo.putFloors([f])).then(reload);
      return true;
    },
    [storage, projectId, selectedBuildingId, buildingFloors, guard, reload],
  );

  const renameFloor = useCallback(
    (id: string, raw: string) => {
      const v = validateFloorName(raw);
      if (!v.ok) {
        setEditError(v.message);
        return false;
      }
      // ⚠️ 이름을 바꿔도 sortOrder 는 **자동으로 바뀌지 않는다** (§2-7-b).
      //    이미 정렬해 둔 순서를 이름 수정이 흐트러뜨리면 안 된다.
      const nextAll = floors.map((f) => (f.id === id ? { ...f, name: normalizeName(raw) } : f));
      saveFloors(nextAll.filter((f) => f.id === id), nextAll);
      return true;
    },
    [floors, saveFloors],
  );

  const moveFloor = useCallback(
    (id: string, toIndex: number) => {
      const after = reorder(buildingFloors, id, toIndex);
      const changed = changedOrders(buildingFloors, after);
      if (changed.length === 0) return;
      const map = new Map(after.map((x) => [x.id, x.sortOrder]));
      const nextAll = floors.map((f) => ({ ...f, sortOrder: map.get(f.id) ?? f.sortOrder }));
      saveFloors(
        changed.map((c) => ({ ...(floors.find((f) => f.id === c.id) as Floor), sortOrder: c.sortOrder })),
        nextAll,
      );
    },
    [buildingFloors, floors, saveFloors],
  );

  const renameDrawing = useCallback(
    (id: string, raw: string) => {
      const v = validateDrawingName(raw);
      if (!v.ok) {
        setEditError(v.message);
        return false;
      }
      const next = drawings.map((d) => (d.id === id ? { ...d, name: normalizeName(raw) } : d));
      setDrawings(next);
      const target = next.find((d) => d.id === id);
      if (target && storage.phase === 'READY') void guard(() => storage.repo.putDrawing(target));
      return true;
    },
    [drawings, storage, guard],
  );

  /**
   * F5-3 — 배율 적용. **좌표는 한 글자도 건드리지 않는다.**
   * 저장하는 것은 `imgScale`(숫자)과 `imgLayout`(도면 영역) 뿐이고,
   * 합성된 이미지는 저장소가 아니라 런타임 캐시에만 들어간다.
   */
  const applyScale = useCallback(
    (dw: Drawing, raw: number) => {
      const next = clampScale(raw);
      const from = clampScale(dw.imgScale ?? 1);
      if (!dw.imgLayout) {
        toast('이 도면은 A4 정규화 전에 등록되었습니다. 먼저 [A4로 맞추기]를 해주세요', {
          kind: 'warn',
        });
        return;
      }
      setScaleBusy(true);
      const updated: Drawing = {
        ...dw,
        imgScale: next,
        imgLayout: scaledImgLayout(dw.imgLayout, from, next),
        updatedAt: Date.now(),
      };
      setDrawings((cur) => cur.map((d) => (d.id === dw.id ? updated : d)));
      releaseComposite(dw.id); // 캔버스가 새 배율로 다시 합성하도록
      void (async () => {
        if (storage.phase === 'READY') await guard(() => storage.repo.putDrawing(updated));
        setScaleBusy(false);
        setScaling(null);
        toast(`도면 크기를 ${Math.round(next * 100)}%로 바꿨습니다`);
      })();
    },
    [storage, guard, toast],
  );

  /** F5-1·F5-2 — 도곽·범례 설정 저장. 저장되는 것은 숫자·문자뿐이고 좌표는 건드리지 않는다 */
  const applyTitleBlock = useCallback(
    (dw: Drawing, tb: DrawingTitleBlock, lg: DrawingLegend) => {
      setTitleBusy(true);
      const updated: Drawing = { ...dw, titleBlock: tb, legend: lg, updatedAt: Date.now() };
      setDrawings((cur) => cur.map((d) => (d.id === dw.id ? updated : d)));
      void (async () => {
        if (storage.phase === 'READY') await guard(() => storage.repo.putDrawing(updated));
        setTitleBusy(false);
        setTitling(null);
        toast('도곽 · 범례 설정을 저장했습니다');
      })();
    },
    [storage, guard, toast],
  );

  // ── 삭제 ────────────────────────────────────────────────────────────────
  const askDeleteBuilding = useCallback(
    (b: Building) => {
      const fs = floorsByBuilding.get(b.id) ?? [];
      const ds = fs.filter((f) => drawingByFloor.has(f.id)).length;
      const xs = fs.reduce((n, f) => n + (defectsByFloor.get(f.id) ?? 0), 0);
      if (fs.length === 0) {
        void doDeleteBuilding(b);
        return;
      }
      setConfirming({ kind: 'DELETE_BUILDING', building: b, floors: fs.length, drawings: ds, defects: xs });
    },
    [floorsByBuilding, drawingByFloor, defectsByFloor],
  );

  const doDeleteBuilding = useCallback(
    async (b: Building) => {
      if (storage.phase !== 'READY') return;
      const fs = (floorsByBuilding.get(b.id) ?? []).map((f) => f.id);
      setBuildings((cur) => cur.filter((x) => x.id !== b.id));
      setFloors((cur) => cur.filter((f) => f.buildingId !== b.id));
      setDrawings((cur) => cur.filter((d) => !fs.includes(d.floorId)));
      setDefects((cur) => cur.filter((d) => !fs.includes(d.floorId)));
      setSelectedBuildingId((cur) =>
        cur === b.id ? (orderedBuildings.find((x) => x.id !== b.id)?.id ?? null) : cur,
      );
      await guard(() => storage.repo.deleteBuilding(b.id));
      reload();
      toast(`'${b.name}'을 삭제했습니다`);
    },
    [storage, floorsByBuilding, orderedBuildings, guard, reload, toast],
  );

  const askDeleteFloor = useCallback(
    (f: Floor) => {
      const ds = drawingByFloor.has(f.id) ? 1 : 0;
      const xs = defectsByFloor.get(f.id) ?? 0;
      if (ds === 0 && xs === 0) {
        void doDeleteFloor(f);
        return;
      }
      setConfirming({ kind: 'DELETE_FLOOR', floor: f, drawings: ds, defects: xs });
    },
    [drawingByFloor, defectsByFloor],
  );

  const doDeleteFloor = useCallback(
    async (f: Floor) => {
      if (storage.phase !== 'READY') return;
      setFloors((cur) => cur.filter((x) => x.id !== f.id));
      setDrawings((cur) => cur.filter((d) => d.floorId !== f.id));
      setDefects((cur) => cur.filter((d) => d.floorId !== f.id));
      await guard(() => storage.repo.deleteFloor(f.id));
      reload();
      toast(`'${f.name}'을 삭제했습니다`);
    },
    [storage, guard, reload, toast],
  );

  const doDeleteDrawing = useCallback(
    async (d: Drawing) => {
      if (storage.phase !== 'READY') return;
      setDrawings((cur) => cur.filter((x) => x.id !== d.id));
      await guard(() => storage.repo.deleteDrawing(d.id));
      reload();
      toast('도면을 삭제했습니다. 결함 표기 위치는 그대로 보관됩니다');
    },
    [storage, guard, reload, toast],
  );

  // ── 구조 복사 (§2-13) ───────────────────────────────────────────────────
  const doCopyStructure = useCallback(async () => {
    if (storage.phase !== 'READY' || !project?.prevProjectId) return;
    const r = (await guard(() =>
      storage.repo.copyStructure(project.prevProjectId!, project.id),
    )) as CopyStructureResult | null;
    if (!r) return;
    reload();
    toast(
      `동 ${r.buildings}개 · 층 ${r.floors}개 · 도면 ${r.drawings}장을 복사했습니다. 결함은 복사되지 않습니다.`,
      { ttl: 6000 },
    );
  }, [storage, project, guard, reload, toast]);

  // ── 렌더 ────────────────────────────────────────────────────────────────
  if (loading || !project) {
    return (
      <div className="page">
        <div className="page__head">
          <h1 className="page__title">불러오는 중…</h1>
        </div>
      </div>
    );
  }

  const displayName = projectDisplayName(project);
  const canOpenCanvas = firstFloorWithDrawing !== null;

  return (
    <div className="page page--setup">
      <div className="page__head">
        <div className="page__headMain">
          <button type="button" className="btn btn--ghost" onClick={() => navigate({ name: 'LIST' })}>
            ← 용역 목록
          </button>
          <h1 className="page__title page__title--project" title={displayName}>
            {displayName}
          </h1>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => navigate({ name: 'EDIT', projectId })}
          >
            이름 · 정보 수정
          </button>
        </div>
        <div className="page__actions">
          <button
            type="button"
            className="btn"
            title="이 용역의 결함 입력 항목(부재 · 결함유형 · 발생원인 · 보수방안)을 구성합니다"
            onClick={() => navigate({ name: 'SETTINGS', projectId, fromFloorId: null })}
          >
            설정
          </button>
          {project.prevProjectId && (
            <button
              type="button"
              className="btn"
              title={prevName ? `이전 회차: ${prevName}` : '이전 회차'}
              onClick={() =>
                setConfirming({ kind: 'COPY_STRUCTURE', existingBuildings: buildings.length })
              }
            >
              이전 용역의 동 · 층 · 도면 복사
            </button>
          )}
          <button
            type="button"
            className="btn btn--primary"
            disabled={!canOpenCanvas}
            title={canOpenCanvas ? '도면 캔버스를 엽니다' : '먼저 도면을 올려주세요'}
            onClick={() =>
              firstFloorWithDrawing &&
              navigate({ name: 'CANVAS', projectId, floorId: firstFloorWithDrawing.id })
            }
          >
            캔버스 열기 ▶
          </button>
        </div>
      </div>

      <div className="setup">
        {/* ── 동 ────────────────────────────────────────────────────── */}
        <section className="panel setup__buildings" aria-label="동 구성">
          <h2 className="panel__title">
            동
            <span className="panel__meta">
              <span className="num">{buildings.length}</span>개
            </span>
          </h2>

          <OrderableList
            items={orderedBuildings.map((b) => ({ id: b.id, name: b.name }))}
            onMove={moveBuilding}
            renderRow={(item, index) => {
              const b = orderedBuildings[index]!;
              void item;
              const isEditing = editing?.kind === 'BUILDING' && editing.id === b.id;
              const selected = b.id === selectedBuildingId;
              const nFloors = (floorsByBuilding.get(b.id) ?? []).length;
              if (isEditing) {
                return (
                  <InlineEdit
                    value={editing.value}
                    error={editError}
                    label="동 이름"
                    onChange={(v) => setEditing({ kind: 'BUILDING', id: b.id, value: v })}
                    onCommit={() => {
                      if (renameBuilding(b.id, editing.value)) {
                        setEditing(null);
                        setEditError(null);
                      }
                    }}
                    onCancel={() => {
                      setEditing(null);
                      setEditError(null);
                    }}
                  />
                );
              }
              return (
                <>
                  <button
                    type="button"
                    className="orow__main"
                    data-selected={selected}
                    aria-current={selected}
                    title={b.name}
                    onClick={() => {
                      userPicked.current = true;
                      setSelectedBuildingId(b.id);
                    }}
                    onDoubleClick={() => {
                      setEditError(null);
                      setEditing({ kind: 'BUILDING', id: b.id, value: b.name });
                    }}
                  >
                    <span className="orow__name">{b.name}</span>
                    <span className="orow__count num">{nFloors}</span>
                  </button>
                  <MoreMenu
                    label={`${b.name} 추가 작업`}
                    items={[
                      {
                        label: '이름 변경',
                        onSelect: () => {
                          setEditError(null);
                          setEditing({ kind: 'BUILDING', id: b.id, value: b.name });
                        },
                      },
                      {
                        label: '위로',
                        disabled: index === 0,
                        onSelect: () => moveBuilding(b.id, index - 1),
                      },
                      {
                        label: '아래로',
                        disabled: index === orderedBuildings.length - 1,
                        onSelect: () => moveBuilding(b.id, index + 1),
                      },
                      {
                        label: '삭제',
                        danger: true,
                        separatorBefore: true,
                        onSelect: () => askDeleteBuilding(b),
                      },
                    ]}
                  />
                </>
              );
            }}
          />

          {editing?.kind === 'NEW_BUILDING' ? (
            <div className="orow orow--new">
              <InlineEdit
                value={editing.value}
                error={editError}
                label="새 동 이름"
                selectOnMount
                onChange={(v) => setEditing({ kind: 'NEW_BUILDING', value: v })}
                onCommit={() => {
                  if (addBuilding(editing.value)) {
                    setEditing(null);
                    setEditError(null);
                  }
                }}
                onCancel={() => {
                  setEditing(null);
                  setEditError(null);
                }}
              />
            </div>
          ) : (
            <button
              type="button"
              className="btn btn--add"
              onClick={() => {
                setEditError(null);
                setEditing({ kind: 'NEW_BUILDING', value: `동 ${buildings.length + 1}` });
              }}
            >
              + 동 추가
            </button>
          )}
        </section>

        {/* ── 층 · 도면 ─────────────────────────────────────────────── */}
        <section className="panel setup__floors" aria-label="층과 도면">
          <h2 className="panel__title">
            층 · 도면
            <span className="panel__meta">
              <span className="num">{buildingFloors.length}</span>개 · 도면{' '}
              <span className="num">{buildingFloors.filter((f) => drawingByFloor.has(f.id)).length}</span>장
            </span>
          </h2>

          {!selectedBuildingId ? (
            <EmptyState title="왼쪽에서 동을 먼저 추가해 주세요" />
          ) : (
            <>
              {buildingFloors.length === 0 && editing?.kind !== 'NEW_FLOOR' && (
                <EmptyState
                  title="아직 층이 없습니다"
                  body="지하3층 · 1층 · 옥탑처럼 이름을 넣으면 순서가 자동으로 잡힙니다. 순서가 마음에 들지 않으면 끌어서 바꾸세요."
                />
              )}

              <OrderableList
                items={buildingFloors.map((f) => ({ id: f.id, name: f.name }))}
                onMove={moveFloor}
                renderRow={(item, index) => {
                  const f = buildingFloors[index]!;
                  const dw = drawingByFloor.get(f.id) ?? null;
                  const nDefect = defectsByFloor.get(f.id) ?? 0;

                  if (editing?.kind === 'FLOOR' && editing.id === f.id) {
                    return (
                      <InlineEdit
                        value={editing.value}
                        error={editError}
                        label="층 이름"
                        onChange={(v) => setEditing({ kind: 'FLOOR', id: f.id, value: v })}
                        onCommit={() => {
                          if (renameFloor(f.id, editing.value)) {
                            setEditing(null);
                            setEditError(null);
                          }
                        }}
                        onCancel={() => {
                          setEditing(null);
                          setEditError(null);
                        }}
                      />
                    );
                  }

                  return (
                    <>
                      <div className="frow__body">
                        <button
                          type="button"
                          className="frow__name"
                          title={`${f.name} — 두 번 누르면 이름을 바꿉니다`}
                          onDoubleClick={() => {
                            setEditError(null);
                            setEditing({ kind: 'FLOOR', id: f.id, value: f.name });
                          }}
                          onClick={() =>
                            dw && navigate({ name: 'CANVAS', projectId, floorId: f.id })
                          }
                        >
                          {f.name}
                        </button>
                        {orderCheck.has(f.id) && (
                          <span
                            className="badge badge--warn"
                            title="이름과 현재 순서가 어긋납니다. 끌어서 제자리에 놓으세요"
                          >
                            순서 확인
                          </span>
                        )}
                        {nDefect > 0 && (
                          <span className="badge" title="이 층에 입력된 결함">
                            결함 <span className="num">{nDefect}</span>
                          </span>
                        )}
                      </div>

                      <div className="frow__drawing">
                        {dw ? (
                          editing?.kind === 'DRAWING' && editing.id === dw.id ? (
                            <InlineEdit
                              value={editing.value}
                              error={editError}
                              label="도면 이름"
                              onChange={(v) => setEditing({ kind: 'DRAWING', id: dw.id, value: v })}
                              onCommit={() => {
                                if (renameDrawing(dw.id, editing.value)) {
                                  setEditing(null);
                                  setEditError(null);
                                }
                              }}
                              onCancel={() => {
                                setEditing(null);
                                setEditError(null);
                              }}
                            />
                          ) : (
                            <>
                              <DrawingThumb drawing={dw} projectId={projectId} />
                              <span className="frow__dname" title={dw.name}>
                                {dw.name}
                              </span>
                              <span className="frow__dsize num" title="렌더 해상도">
                                {dw.imageWidth}×{dw.imageHeight}
                              </span>
                              <MoreMenu
                                label={`${f.name} 도면 작업`}
                                items={[
                                  {
                                    label: '도면 이름 변경',
                                    onSelect: () => {
                                      setEditError(null);
                                      setEditing({ kind: 'DRAWING', id: dw.id, value: dw.name });
                                    },
                                  },
                                  {
                                    label: '도곽 · 범례 설정',
                                    onSelect: () => setTitling(dw),
                                  },
                                  {
                                    label: '도면 크기 조절',
                                    disabled: !dw.imgLayout,
                                    onSelect: () => setScaling(dw),
                                  },
                                  {
                                    label: '도면 교체',
                                    onSelect: () =>
                                      navigate({ name: 'UPLOAD', projectId, floorId: f.id }),
                                  },
                                  {
                                    label: '층 이름 변경',
                                    onSelect: () => {
                                      setEditError(null);
                                      setEditing({ kind: 'FLOOR', id: f.id, value: f.name });
                                    },
                                  },
                                  {
                                    label: '위로',
                                    disabled: index === 0,
                                    onSelect: () => moveFloor(f.id, index - 1),
                                  },
                                  {
                                    label: '아래로',
                                    disabled: index === buildingFloors.length - 1,
                                    onSelect: () => moveFloor(f.id, index + 1),
                                  },
                                  {
                                    label: '도면 삭제',
                                    danger: true,
                                    separatorBefore: true,
                                    onSelect: () =>
                                      setConfirming({
                                        kind: 'DELETE_DRAWING',
                                        drawing: dw,
                                        floor: f,
                                        defects: nDefect,
                                      }),
                                  },
                                  {
                                    label: '층 삭제',
                                    danger: true,
                                    onSelect: () => askDeleteFloor(f),
                                  },
                                ]}
                              />
                            </>
                          )
                        ) : (
                          <>
                            <span className="chip chip--muted" title="아직 도면이 없습니다">
                              도면 없음
                            </span>
                            <button
                              type="button"
                              className="btn btn--small"
                              onClick={() => navigate({ name: 'UPLOAD', projectId, floorId: f.id })}
                            >
                              도면 올리기
                            </button>
                            <MoreMenu
                              label={`${f.name} 추가 작업`}
                              items={[
                                {
                                  label: '층 이름 변경',
                                  onSelect: () => {
                                    setEditError(null);
                                    setEditing({ kind: 'FLOOR', id: f.id, value: f.name });
                                  },
                                },
                                {
                                  label: '위로',
                                  disabled: index === 0,
                                  onSelect: () => moveFloor(f.id, index - 1),
                                },
                                {
                                  label: '아래로',
                                  disabled: index === buildingFloors.length - 1,
                                  onSelect: () => moveFloor(f.id, index + 1),
                                },
                                {
                                  label: '층 삭제',
                                  danger: true,
                                  separatorBefore: true,
                                  onSelect: () => askDeleteFloor(f),
                                },
                              ]}
                            />
                          </>
                        )}
                      </div>
                    </>
                  );
                }}
                rowClassName="frow"
              />

              {editing?.kind === 'NEW_FLOOR' ? (
                <div className="orow orow--new">
                  <InlineEdit
                    value={editing.value}
                    error={editError}
                    label="새 층 이름"
                    selectOnMount
                    placeholder="지하1층 · 1층 · 옥탑"
                    onChange={(v) => setEditing({ kind: 'NEW_FLOOR', value: v })}
                    onCommit={() => {
                      if (addFloor(editing.value)) {
                        // 연달아 여러 층을 넣는 것이 흔하다. 입력 칸을 열어 둔다
                        setEditing({ kind: 'NEW_FLOOR', value: '' });
                        setEditError(null);
                      }
                    }}
                    onCancel={() => {
                      setEditing(null);
                      setEditError(null);
                    }}
                  />
                </div>
              ) : (
                <div className="setup__floorActions">
                  <button
                    type="button"
                    className="btn btn--add"
                    onClick={() => {
                      setEditError(null);
                      setEditing({ kind: 'NEW_FLOOR', value: '' });
                    }}
                  >
                    + 층 추가
                  </button>
                  {/* 층이 0개여도 열 수 있다 — 파일명이 `강당-지상1층.png` 형식이면
                      업로드 화면이 동·층을 제안해 만들어 준다 (테스트 편의) */}
                  <button
                    type="button"
                    className="btn"
                    title="여러 장을 한 번에 올리고 층을 배정합니다. 파일명에서 동·층을 자동으로 채웁니다"
                    onClick={() => navigate({ name: 'UPLOAD', projectId, floorId: null })}
                  >
                    도면 여러 장 올리기
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {confirming?.kind === 'DELETE_BUILDING' && (
        <ConfirmDialog
          title="이 동을 삭제할까요?"
          body={
            <p>
              <b className="quote">{confirming.building.name}</b>을 삭제하면 층{' '}
              <b className="num">{confirming.floors}</b>개 · 도면{' '}
              <b className="num">{confirming.drawings}</b>장 · 결함{' '}
              <b className="num">{confirming.defects}</b>건이 함께 삭제됩니다.
            </p>
          }
          confirmLabel="삭제"
          onConfirm={() => {
            const b = confirming.building;
            setConfirming(null);
            void doDeleteBuilding(b);
          }}
          onCancel={() => setConfirming(null)}
        />
      )}

      {confirming?.kind === 'DELETE_FLOOR' && (
        <ConfirmDialog
          title="이 층을 삭제할까요?"
          body={
            <p>
              <b className="quote">{confirming.floor.name}</b>을 삭제하면 도면{' '}
              <b className="num">{confirming.drawings}</b>장 · 결함{' '}
              <b className="num">{confirming.defects}</b>건이 함께 삭제됩니다.
            </p>
          }
          confirmLabel="삭제"
          onConfirm={() => {
            const f = confirming.floor;
            setConfirming(null);
            void doDeleteFloor(f);
          }}
          onCancel={() => setConfirming(null)}
        />
      )}

      {confirming?.kind === 'DELETE_DRAWING' && (
        <ConfirmDialog
          title="이 도면을 삭제할까요?"
          body={
            <>
              <p>
                <b className="quote">{confirming.floor.name}</b>의 도면을 삭제합니다.
              </p>
              <p className="muted">
                결함 <b className="num">{confirming.defects}</b>건의 표기 위치는 그대로 보관되며, 같은
                층에 새 도면을 올리면 같은 상대 위치에 다시 나타납니다.
              </p>
            </>
          }
          confirmLabel="도면 삭제"
          onConfirm={() => {
            const d = confirming.drawing;
            setConfirming(null);
            void doDeleteDrawing(d);
          }}
          onCancel={() => setConfirming(null)}
        />
      )}

      {confirming?.kind === 'COPY_STRUCTURE' && (
        <ConfirmDialog
          title="이전 용역의 동 · 층 · 도면을 복사할까요?"
          danger={false}
          body={
            <>
              <p>
                {prevName ? (
                  <>
                    <b className="quote">{prevName}</b> 의 구조를 이 용역으로 복사합니다.
                  </>
                ) : (
                  '이전 회차의 구조를 이 용역으로 복사합니다.'
                )}
              </p>
              <p className="muted">
                <b>결함은 복사되지 않습니다.</b>
                {confirming.existingBuildings > 0 && (
                  <>
                    {' '}
                    지금 있는 동 <b className="num">{confirming.existingBuildings}</b>개는 그대로 두고
                    복사본이 뒤에 추가됩니다.
                  </>
                )}
              </p>
            </>
          }
          confirmLabel="복사"
          onConfirm={() => {
            setConfirming(null);
            void doCopyStructure();
          }}
          onCancel={() => setConfirming(null)}
        />
      )}

      {titling && (
        <TitleBlockDialog
          drawing={titling}
          project={project}
          legendTypes={legendTypesOf(defects, titling.id)}
          busy={titleBusy}
          onApply={(tb, lg) => applyTitleBlock(titling, tb, lg)}
          onClose={() => {
            if (!titleBusy) setTitling(null);
          }}
        />
      )}

      {scaling && (
        <DrawingScaleDialog
          drawing={scaling}
          defectCount={defectsByFloor.get(scaling.floorId) ?? 0}
          busy={scaleBusy}
          onApply={(v) => applyScale(scaling, v)}
          onClose={() => {
            if (!scaleBusy) setScaling(null);
          }}
        />
      )}
    </div>
  );
}

// ── 부품 ───────────────────────────────────────────────────────────────────

function InlineEdit({
  value,
  label,
  error,
  placeholder,
  selectOnMount = false,
  onChange,
  onCommit,
  onCancel,
}: {
  value: string;
  label: string;
  error: string | null;
  placeholder?: string;
  selectOnMount?: boolean;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    // 기본값을 **선택 상태로** 넣어 바로 덮어쓸 수 있게 한다 (§2-6)
    if (selectOnMount) el.select();
  }, [selectOnMount]);

  return (
    <div className="inline-edit">
      <label className="visually-hidden" htmlFor="inline-edit-input">
        {label}
      </label>
      <input
        id="inline-edit-input"
        ref={ref}
        className="input input--inline"
        value={value}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onCommit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }
        }}
      />
      <button type="button" className="btn btn--small btn--primary" onClick={onCommit}>
        확인
      </button>
      <button type="button" className="btn btn--small" onClick={onCancel}>
        취소
      </button>
      {error && (
        <span className="inline-edit__error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

/**
 * 드래그로 순서를 바꾸는 목록.
 * 표시 순서가 진실이고, `sortOrder` 는 그 뒤를 따라간다 (§2-7-b).
 */
function OrderableList({
  items,
  onMove,
  renderRow,
  rowClassName = 'orow',
}: {
  items: { id: string; name: string }[];
  onMove: (id: string, toIndex: number) => void;
  renderRow: (item: { id: string; name: string }, index: number) => React.ReactNode;
  rowClassName?: string;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  return (
    <ul className="olist">
      {items.map((item, i) => (
        <li
          key={item.id}
          className={rowClassName}
          data-dragging={dragId === item.id || undefined}
          data-dropover={overIndex === i && dragId !== null && dragId !== item.id ? 'true' : undefined}
          onDragOver={(e) => {
            if (!dragId) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setOverIndex(i);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragId && dragId !== item.id) onMove(dragId, i);
            setDragId(null);
            setOverIndex(null);
          }}
        >
          <span
            className="orow__handle"
            draggable
            role="button"
            tabIndex={-1}
            aria-hidden="true"
            title="끌어서 순서 변경"
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', item.id);
              setDragId(item.id);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOverIndex(null);
            }}
          >
            ⠿
          </span>
          {renderRow(item, i)}
        </li>
      ))}
    </ul>
  );
}

/** F5-2 — 이 도면에 실제로 쓰인 결함유형 이름 (범례 미리보기용) */
function legendTypesOf(defects: readonly Defect[], drawingId: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const d of [...defects].sort((a, b) => a.seq - b.seq)) {
    if (d.drawingId !== drawingId) continue;
    const name = (d.defectTypeName ?? '').trim();
    if (name === '' || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}
