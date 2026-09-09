/**
 * P3-A 동 선택 — 조직도형 진입 (D58~D60, 2026-09-09).
 *
 * 용역에 들어오면 첫 화면. 동을 세로 조직도(트리) 모양으로 보여주고, 동을 클릭하면
 * 그 동의 층 화면(`FloorsRoute`)으로 넘어간다.
 *
 * ⭐ **동이 정확히 1개면 이 화면을 건너뛴다**(D60) — 보여줄 선택지가 없다.
 *    `useAppData` 로 불러온 직후 그 동의 층 화면으로 `replace()` 한다(히스토리에 안 남는다 —
 *    뒤로가기를 눌렀을 때 "방금 봤지만 안 보였던" 이 화면으로 튕기면 안 된다).
 *
 * 예전에는 이 화면과 층 화면이 `ProjectSetup.tsx` 하나(왼쪽 동 · 오른쪽 층)였다.
 * 이번 라운드에서 "용역명 진입 → 동 진입 → 층 선택 → 캔버스 진입" 요청으로 둘로 쪼갰다 —
 * 동 단위 관리(추가·이름변경·순서변경·삭제)는 여기, 층·도면 관리는 `FloorsRoute` 몫이다.
 *
 * `standalone=false` — `UPLOAD` 화면의 배경으로 쓰일 때 전달된다. 이때는 **자동 건너뛰기를
 * 하지 않는다** — 안 그러면 업로드 모달이 떠 있는 중에 배경 라우트가 FLOORS 로 바뀌어버려서
 * `App.tsx` 의 `route.name === 'UPLOAD'` 매칭이 깨지고 모달 자체가 사라진다.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Defect } from '@onspect/canvas-core';
import {
  changedOrders,
  normalizeName,
  projectDisplayName,
  promoteProjectDecor,
  reorder,
  sortByOrder,
  validateBuildingName,
  type Building,
  type CopyStructureResult,
  type Drawing,
  type Floor,
  type Project,
} from '@onspect/project-core';
import { useAppData } from '../data/appData';
import { makeBuilding } from '../data/factory';
import { navigate, replace } from '../router';
import { EmptyState } from '../ui/Form';
import { MoreMenu } from '../ui/Menu';
import { ConfirmDialog } from '../ui/Overlays';
import { useToast } from '../ui/ToastHost';

type Editing = { kind: 'BUILDING'; id: string; value: string } | { kind: 'NEW_BUILDING'; value: string } | null;

type Confirming =
  | { kind: 'DELETE_BUILDING'; building: Building; floors: number; drawings: number; defects: number }
  | { kind: 'COPY_STRUCTURE'; existingBuildings: number }
  | null;

export function BuildingsRoute({
  projectId,
  standalone = true,
}: {
  projectId: string;
  standalone?: boolean;
}) {
  const { storage, guard, reload, reloadKey } = useAppData();
  const toast = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [prevName, setPrevName] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);

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
      // D16 승격(§5-3-c) — 진입점마다 건다. 여기도 그중 하나다
      const promoted = promoteProjectDecor(b.project, b.drawings, b.floors);
      if (promoted) void guard(() => storage.repo.putProject(promoted));
      setProject(promoted ?? b.project);
      setBuildings(b.buildings);
      setFloors(b.floors);
      setDrawings(b.drawings);
      setDefects(b.defects);
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
  }, [storage, projectId, reloadKey, guard]);

  useEffect(() => {
    if (!notFound) return;
    toast('해당 용역을 찾을 수 없습니다', { kind: 'warn' });
    navigate({ name: 'LIST' });
  }, [notFound, toast]);

  // ── 파생 ────────────────────────────────────────────────────────────────
  const orderedBuildings = useMemo(() => sortByOrder(buildings), [buildings]);
  const floorsByBuilding = useMemo(() => {
    const m = new Map<string, Floor[]>();
    for (const f of floors) {
      const arr = m.get(f.buildingId);
      if (arr) arr.push(f);
      else m.set(f.buildingId, [f]);
    }
    return m;
  }, [floors]);
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

  // D60 — 동이 정확히 1개면 조직도를 보여줄 것도 없다. 바로 그 동의 층 화면으로.
  useEffect(() => {
    if (!standalone || loading || notFound) return;
    if (orderedBuildings.length === 1) {
      replace({ name: 'FLOORS', projectId, buildingId: orderedBuildings[0]!.id });
    }
  }, [standalone, loading, notFound, orderedBuildings, projectId]);

  // ── 쓰기 ────────────────────────────────────────────────────────────────
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
      setBuildings(next);
      if (storage.phase === 'READY') void guard(() => storage.repo.putBuildings(next.filter((b) => b.id === id)));
      return true;
    },
    [buildings, storage, guard],
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
      await guard(() => storage.repo.deleteBuilding(b.id));
      reload();
      toast(`'${b.name}'을 삭제했습니다`);
    },
    [storage, floorsByBuilding, guard, reload, toast],
  );

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

  // 동이 1개뿐이면 위 effect 가 FLOORS 로 튕긴다 — 여기는 그 짧은 순간의 빈 화면
  if (standalone && orderedBuildings.length === 1) {
    return <div className="page" aria-hidden="true" />;
  }

  const displayName = projectDisplayName(project);

  return (
    <div className="page">
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
          <button
            type="button"
            className="btn"
            title="손상결함표 · 결함 리스트 · 사진첩 · 조사위치도를 뽑습니다"
            onClick={() => navigate({ name: 'EXPORT', projectId })}
          >
            산출물 출력
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
        </div>
      </div>

      {orderedBuildings.length === 0 ? (
        <EmptyState
          title="아직 동이 없습니다"
          body="동을 만들면 그 안에 층을 구성하고 도면을 올릴 수 있습니다."
          action={
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                setEditError(null);
                setEditing({ kind: 'NEW_BUILDING', value: '동 1' });
              }}
            >
              + 동 추가
            </button>
          }
        />
      ) : (
        <BuildingTree
          buildings={orderedBuildings}
          floorsByBuilding={floorsByBuilding}
          editing={editing}
          editError={editError}
          onOpen={(b) => navigate({ name: 'FLOORS', projectId, buildingId: b.id })}
          onMove={moveBuilding}
          onStartRename={(b) => {
            setEditError(null);
            setEditing({ kind: 'BUILDING', id: b.id, value: b.name });
          }}
          onChangeEditing={(v) =>
            setEditing((cur) => (cur ? { ...cur, value: v } : cur))
          }
          onCommitRename={(id) => {
            if (editing?.kind === 'BUILDING' && renameBuilding(id, editing.value)) {
              setEditing(null);
              setEditError(null);
            }
          }}
          onCancelEdit={() => {
            setEditing(null);
            setEditError(null);
          }}
          onDelete={askDeleteBuilding}
        />
      )}

      {editing?.kind === 'NEW_BUILDING' && (
        <div className="btree__addRow">
          <label className="visually-hidden" htmlFor="new-building-input">
            새 동 이름
          </label>
          <input
            id="new-building-input"
            className="input"
            autoFocus
            value={editing.value}
            aria-invalid={Boolean(editError)}
            onChange={(e) => setEditing({ kind: 'NEW_BUILDING', value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (addBuilding(editing.value)) {
                  setEditing({ kind: 'NEW_BUILDING', value: `동 ${buildings.length + 2}` });
                  setEditError(null);
                }
              } else if (e.key === 'Escape') {
                setEditing(null);
                setEditError(null);
              }
            }}
          />
          <button
            type="button"
            className="btn btn--small btn--primary"
            onClick={() => {
              if (addBuilding(editing.value)) {
                setEditing({ kind: 'NEW_BUILDING', value: `동 ${buildings.length + 2}` });
                setEditError(null);
              }
            }}
          >
            추가
          </button>
          <button
            type="button"
            className="btn btn--small"
            onClick={() => {
              setEditing(null);
              setEditError(null);
            }}
          >
            닫기
          </button>
          {editError && (
            <span className="inline-edit__error" role="alert">
              {editError}
            </span>
          )}
        </div>
      )}

      {orderedBuildings.length > 0 && editing?.kind !== 'NEW_BUILDING' && (
        <button
          type="button"
          className="btn btn--add btree__addBtn"
          onClick={() => {
            setEditError(null);
            setEditing({ kind: 'NEW_BUILDING', value: `동 ${buildings.length + 1}` });
          }}
        >
          + 동 추가
        </button>
      )}

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
    </div>
  );
}

// ── 조직도 트리 ──────────────────────────────────────────────────────────────

/**
 * 세로 조직도. 루트(용역명은 위 헤더에 이미 나오므로 여기선 안 그린다) 없이
 * 동 노드들을 한 줄에 나란히 놓고 위쪽에 짧은 연결선을 단다. 형제가 2개 이상이면
 * 노드들을 잇는 가로선도 함께 그린다(CSS `::before`).
 */
function BuildingTree({
  buildings,
  floorsByBuilding,
  editing,
  editError,
  onOpen,
  onMove,
  onStartRename,
  onChangeEditing,
  onCommitRename,
  onCancelEdit,
  onDelete,
}: {
  buildings: Building[];
  floorsByBuilding: Map<string, Floor[]>;
  editing: Editing;
  editError: string | null;
  onOpen: (b: Building) => void;
  onMove: (id: string, toIndex: number) => void;
  onStartRename: (b: Building) => void;
  onChangeEditing: (v: string) => void;
  onCommitRename: (id: string) => void;
  onCancelEdit: () => void;
  onDelete: (b: Building) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);

  return (
    <div className="btree">
      <div className="btree__trunk" aria-hidden="true" />
      <div className="btree__row" data-multi={buildings.length > 1 ? '1' : undefined}>
        {buildings.map((b, index) => {
          const nFloors = (floorsByBuilding.get(b.id) ?? []).length;
          const isEditing = editing?.kind === 'BUILDING' && editing.id === b.id;
          return (
            <div
              key={b.id}
              className="btree__node"
              data-dragging={dragId === b.id || undefined}
              draggable={!isEditing}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', b.id);
                setDragId(b.id);
              }}
              onDragEnd={() => setDragId(null)}
              onDragOver={(e) => {
                if (!dragId || dragId === b.id) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId && dragId !== b.id) onMove(dragId, index);
                setDragId(null);
              }}
            >
              {isEditing ? (
                <div className="btree__box btree__box--editing">
                  <label className="visually-hidden" htmlFor={`rename-building-${b.id}`}>
                    동 이름
                  </label>
                  <input
                    id={`rename-building-${b.id}`}
                    className="input input--inline"
                    autoFocus
                    value={editing.value}
                    aria-invalid={Boolean(editError)}
                    onChange={(e) => onChangeEditing(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onCommitRename(b.id);
                      else if (e.key === 'Escape') onCancelEdit();
                    }}
                  />
                  <div className="btree__editActions">
                    <button type="button" className="btn btn--small btn--primary" onClick={() => onCommitRename(b.id)}>
                      확인
                    </button>
                    <button type="button" className="btn btn--small" onClick={onCancelEdit}>
                      취소
                    </button>
                  </div>
                  {editError && (
                    <span className="inline-edit__error" role="alert">
                      {editError}
                    </span>
                  )}
                </div>
              ) : (
                <div className="btree__box">
                  <button
                    type="button"
                    className="btree__boxMain"
                    onClick={() => onOpen(b)}
                    onDoubleClick={() => onStartRename(b)}
                    title={`${b.name} — 두 번 누르면 이름을 바꿉니다`}
                  >
                    <span className="btree__boxName">{b.name}</span>
                    <span className="btree__boxMeta">
                      층 <span className="num">{nFloors}</span>개
                    </span>
                  </button>
                  <MoreMenu
                    label={`${b.name} 추가 작업`}
                    items={[
                      { label: '이름 변경', onSelect: () => onStartRename(b) },
                      { label: '위로', disabled: index === 0, onSelect: () => onMove(b.id, index - 1) },
                      {
                        label: '아래로',
                        disabled: index === buildings.length - 1,
                        onSelect: () => onMove(b.id, index + 1),
                      },
                      { label: '삭제', danger: true, separatorBefore: true, onSelect: () => onDelete(b) },
                    ]}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
