/**
 * P3-B 층 선택 — 한 동의 층 · 도면 (D58~D60, 2026-09-09).
 *
 * "용역명 진입 → 동 진입(`BuildingsRoute`) → 층 선택(여기) → 캔버스 진입" 흐름의 3번째 화면.
 * 예전 `ProjectSetup.tsx` 의 오른쪽 패널(층·도면)이 그대로 여기로 옮겨왔다 — 로직은
 * 동일하고, "왼쪽 동 목록에서 고른 동" 대신 라우트 파라미터 `buildingId` 를 쓸 뿐이다.
 *
 * 층 행을 클릭하면 캔버스로 들어간다 (T6·T7+T12 구조 복사, S1 은 층당 1장 — Q15 A안).
 *
 * ⚠️ `sortOrder` 숫자를 **UI 에 노출하지 않는다.** 사용자는 드래그만 한다. 내부 값이다 (§2-7-b).
 *    다만 드래그로만 되는 조작은 키보드 사용자에게 없는 기능이라, `⋯` 메뉴에 `위로/아래로` 를 함께 둔다.
 *
 * **뒤로가기 대상은 동 개수에 따라 갈린다** — 동이 2개 이상이면 `BuildingsRoute` 로,
 * 1개뿐이면 그 화면이 자동으로 건너뛰어지므로(D60) 바로 용역 목록으로. 그렇지 않으면
 * "뒤로" 를 눌러도 동 화면이 즉시 다시 여기로 튕겨 나와 아무 반응이 없는 것처럼 보인다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Defect, Memo } from '@onspect/canvas-core';
import {
  A4_LANDSCAPE,
  calcFitRect,
  changedOrders,
  floorCodeOf,
  floorsNeedingOrderCheck,
  FLOOR_CODE_MAX,
  normalizeFloorCode,
  normalizeName,
  projectDisplayName,
  promoteProjectDecor,
  reorder,
  sortByOrder,
  validateDrawingName,
  validateFloorName,
  type Building,
  DEFAULT_DRAWING_TITLE_BLOCK,
  fitRectToImgLayout,
  isA4Normalized,
  type Drawing,
  type Floor,
  type Project,
  type ProjectLegend,
  type ProjectTitleBlock,
} from '@onspect/project-core';
import { useAppData } from '../data/appData';
import { makeFloor } from '../data/factory';
import { navigate } from '../router';
import { EmptyState } from '../ui/Form';
import { MoreMenu } from '../ui/Menu';
import { ConfirmDialog } from '../ui/Overlays';
import { useToast } from '../ui/ToastHost';
import { DrawingThumb } from '../ui/DrawingThumb';
import { DrawingScaleDialog } from './DrawingScaleDialog';
import { TitleBlockDialog } from './TitleBlockDialog';
import { releaseComposite } from '../canvas/drawingComposite';
import {
  countRenormalizeTargets,
  renormalizeAll,
  transformAll,
  type RenormalizeCounts,
} from '../data/renormalize';
import {
  applyDrawingScale,
  drawingScaleAppliedMessage,
  rebakeScaledRender,
  SCALE_NEEDS_A4_MESSAGE,
} from '../data/drawingScale';

type Editing =
  | { kind: 'FLOOR'; id: string; value: string }
  | { kind: 'NEW_FLOOR'; value: string }
  | { kind: 'DRAWING'; id: string; value: string }
  | null;

type Confirming =
  | { kind: 'DELETE_FLOOR'; floor: Floor; drawings: number; defects: number }
  | { kind: 'DELETE_DRAWING'; drawing: Drawing; floor: Floor; defects: number }
  | { kind: 'RENORMALIZE'; drawing: Drawing; floor: Floor; counts: RenormalizeCounts }
  | null;

/** F1 — 되돌리기용 스냅샷. 변환 **전** 레코드를 그대로 들고 있는다 */
type RenormUndo = { drawing: Drawing; defects: Defect[]; memos: Memo[]; label: string };

export function FloorsRoute({ projectId, buildingId }: { projectId: string; buildingId: string }) {
  const { storage, guard, reload, reloadKey } = useAppData();
  const toast = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [renormUndo, setRenormUndo] = useState<RenormUndo | null>(null);
  const [renormBusy, setRenormBusy] = useState(false);
  const [scaling, setScaling] = useState<Drawing | null>(null);
  const [scaleBusy, setScaleBusy] = useState(false);
  const [titling, setTitling] = useState<Drawing | null>(null);
  const [titleBusy, setTitleBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
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
      if (!b || !b.buildings.some((x) => x.id === buildingId)) {
        setNotFound(true);
        return;
      }
      const promoted = promoteProjectDecor(b.project, b.drawings, b.floors);
      if (promoted) void guard(() => storage.repo.putProject(promoted));
      setProject(promoted ?? b.project);
      setBuildings(b.buildings);
      setFloors(b.floors);
      setDrawings(b.drawings);
      setDefects(b.defects);
      setMemos(b.memos);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [storage, projectId, buildingId, reloadKey, guard]);

  useEffect(() => {
    if (!notFound) return;
    toast('해당 동을 찾을 수 없습니다', { kind: 'warn' });
    navigate({ name: 'BUILDINGS', projectId });
  }, [notFound, toast, projectId]);

  // ── 파생 ────────────────────────────────────────────────────────────────
  const building = useMemo(() => buildings.find((b) => b.id === buildingId) ?? null, [buildings, buildingId]);
  const buildingFloors = useMemo(
    () => sortByOrder(floors.filter((f) => f.buildingId === buildingId)),
    [floors, buildingId],
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
  const orderCheck = useMemo(() => floorsNeedingOrderCheck(buildingFloors), [buildingFloors]);

  // 동이 2개 이상일 때만 "← 동 목록" 이 의미가 있다(D60 참고 — 1개면 그 화면이 즉시 건너뛴다)
  const multiBuilding = buildings.length > 1;

  // ── 쓰기 ────────────────────────────────────────────────────────────────
  const saveFloors = useCallback(
    (changed: Floor[], nextAll: Floor[]) => {
      setFloors(nextAll);
      if (changed.length > 0 && storage.phase === 'READY') {
        void guard(() => storage.repo.putFloors(changed));
      }
    },
    [storage, guard],
  );

  const addFloor = useCallback(
    (raw: string) => {
      if (storage.phase !== 'READY') return false;
      const v = validateFloorName(raw);
      if (!v.ok) {
        setEditError(v.message);
        return false;
      }
      const f = makeFloor(storage.deviceId, projectId, buildingId, normalizeName(raw), buildingFloors);
      setFloors((cur) => [...cur, f]);
      void guard(() => storage.repo.putFloors([f])).then(reload);
      return true;
    },
    [storage, projectId, buildingId, buildingFloors, guard, reload],
  );

  const renameFloor = useCallback(
    (id: string, raw: string) => {
      const v = validateFloorName(raw);
      if (!v.ok) {
        setEditError(v.message);
        return false;
      }
      // ⚠️ 이름을 바꿔도 sortOrder 는 **자동으로 바뀌지 않는다** (§2-7-b).
      const nextAll = floors.map((f) => (f.id === id ? { ...f, name: normalizeName(raw) } : f));
      saveFloors(nextAll.filter((f) => f.id === id), nextAll);
      return true;
    },
    [floors, saveFloors],
  );

  const setFloorCode = useCallback(
    (id: string, raw: string) => {
      const code = normalizeFloorCode(raw);
      const cur = floors.find((f) => f.id === id);
      if (!cur || (cur.code ?? null) === code) return;
      const next: Floor = { ...cur, code, updatedAt: Date.now() };
      saveFloors([next], floors.map((f) => (f.id === id ? next : f)));
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

  /** F5-3 — 배율 적용. D37(2026-09-03) — 결함·메모 좌표도 함께 옮긴다. */
  const applyScale = useCallback(
    (dw: Drawing, raw: number) => {
      const r = applyDrawingScale(dw, raw);
      if (!r.ok) {
        toast(SCALE_NEEDS_A4_MESSAGE, { kind: 'warn' });
        return;
      }
      setScaleBusy(true);
      const updated = r.drawing;
      const moved = transformAll(dw.id, r.transform, defects, memos);
      void (async () => {
        let next = updated;
        if (storage.phase === 'READY') {
          const repo = storage.repo;
          const ok = await guard(async () => {
            await repo.writeRenormalize(updated, moved.defects, moved.memos);
            return true;
          });
          if (!ok) {
            setScaleBusy(false);
            return;
          }
          const rebaked = await guard(() => rebakeScaledRender(repo, updated));
          if (rebaked) {
            next = rebaked;
            setRenormUndo((u) => (u && u.drawing.id === dw.id ? null : u));
          }
        }
        setScaleBusy(false);
        releaseComposite(dw.id);
        setDrawings((cur) => cur.map((x) => (x.id === dw.id ? next : x)));
        const dmap = new Map(moved.defects.map((d) => [d.id, d]));
        const mmap = new Map(moved.memos.map((m) => [m.id, m]));
        setDefects((cur) => cur.map((d) => dmap.get(d.id) ?? d));
        setMemos((cur) => cur.map((m) => mmap.get(m.id) ?? m));
        setScaling(null);
        toast(drawingScaleAppliedMessage(r.scale));
      })();
    },
    [storage, guard, toast, defects, memos],
  );

  /** F5-1·F5-2 — 도곽·범례 설정 저장. D16 — 용역 설정(`Project` 1건) + 도면명(`Drawing` 1건). */
  const applyTitleBlock = useCallback(
    (dw: Drawing, tb: ProjectTitleBlock, lg: ProjectLegend, drawingName: string | null) => {
      if (!project) return;
      setTitleBusy(true);
      const now = Date.now();
      const nextProject: Project = { ...project, titleBlock: tb, legend: lg, updatedAt: now };
      const nextDrawing: Drawing = {
        ...dw,
        titleBlock: { ...(dw.titleBlock ?? DEFAULT_DRAWING_TITLE_BLOCK), drawingName },
        updatedAt: now,
      };
      setProject(nextProject);
      setDrawings((cur) => cur.map((d) => (d.id === dw.id ? nextDrawing : d)));
      void (async () => {
        if (storage.phase === 'READY') {
          await guard(() => storage.repo.putProject(nextProject));
          await guard(() => storage.repo.putDrawing(nextDrawing));
        }
        setTitleBusy(false);
        setTitling(null);
        toast('도곽 · 범례 설정을 저장했습니다 — 이 용역의 모든 도면에 적용됩니다');
      })();
    },
    [storage, guard, toast, project],
  );

  // ── F1 [A4로 맞추기] ────────────────────────────────────────────────────
  const askRenormalize = useCallback(
    (dw: Drawing, f: Floor) => {
      if (isA4Normalized(dw)) {
        toast('이미 A4 가로 비율입니다. 바꿀 것이 없습니다');
        return;
      }
      setConfirming({
        kind: 'RENORMALIZE',
        drawing: dw,
        floor: f,
        counts: countRenormalizeTargets(dw.id, defects, memos),
      });
    },
    [defects, memos, toast],
  );

  const doRenormalize = useCallback(
    (dw: Drawing) => {
      if (storage.phase !== 'READY' || isA4Normalized(dw)) return;
      setRenormBusy(true);
      const layout = fitRectToImgLayout(calcFitRect(dw.imageWidth, dw.imageHeight));
      const before = {
        drawing: dw,
        defects: defects.filter((d) => d.drawingId === dw.id),
        memos: memos.filter((m) => m.drawingId === dw.id),
      };
      const moved = renormalizeAll(dw.id, layout, defects, memos);
      const updated: Drawing = {
        ...dw,
        imageWidth: A4_LANDSCAPE.w,
        imageHeight: A4_LANDSCAPE.h,
        imgLayout: layout,
        renormalizedAt: Date.now(),
        updatedAt: Date.now(),
      };

      void (async () => {
        const ok = await guard(async () => {
          await storage.repo.writeRenormalize(updated, moved.defects, moved.memos);
          return true;
        });
        setRenormBusy(false);
        if (!ok) return;
        releaseComposite(dw.id);
        applyRenormLocal(updated, moved.defects, moved.memos);
        setRenormUndo({ ...before, label: dw.name });
        toast(`${dw.name}을(를) A4 가로에 맞췄습니다`);
      })();
    },
    [storage, guard, defects, memos, toast],
  );

  const applyRenormLocal = useCallback((dw: Drawing, ds: readonly Defect[], ms: readonly Memo[]) => {
    setDrawings((cur) => cur.map((x) => (x.id === dw.id ? dw : x)));
    const dmap = new Map(ds.map((d) => [d.id, d]));
    const mmap = new Map(ms.map((m) => [m.id, m]));
    setDefects((cur) => cur.map((d) => dmap.get(d.id) ?? d));
    setMemos((cur) => cur.map((m) => mmap.get(m.id) ?? m));
  }, []);

  const undoRenormalize = useCallback(() => {
    const snap = renormUndo;
    if (!snap || storage.phase !== 'READY') return;
    setRenormBusy(true);
    void (async () => {
      const ok = await guard(async () => {
        await storage.repo.writeRenormalize(snap.drawing, snap.defects, snap.memos);
        return true;
      });
      setRenormBusy(false);
      if (!ok) return;
      releaseComposite(snap.drawing.id);
      applyRenormLocal(snap.drawing, snap.defects, snap.memos);
      setRenormUndo(null);
      toast('A4 맞추기를 되돌렸습니다');
    })();
  }, [renormUndo, storage, guard, applyRenormLocal, toast]);

  // ── 삭제 ────────────────────────────────────────────────────────────────
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

  // ── 렌더 ────────────────────────────────────────────────────────────────
  if (loading || !project || !building) {
    return (
      <div className="page">
        <div className="page__head">
          <h1 className="page__title">불러오는 중…</h1>
        </div>
      </div>
    );
  }

  const displayName = projectDisplayName(project);
  const backTarget = multiBuilding
    ? { label: '← 동 목록', onClick: () => navigate({ name: 'BUILDINGS', projectId }) }
    : { label: '← 용역 목록', onClick: () => navigate({ name: 'LIST' }) };

  return (
    <div className="page">
      <div className="page__head">
        <div className="page__headMain">
          <button type="button" className="btn btn--ghost" onClick={backTarget.onClick}>
            {backTarget.label}
          </button>
          <h1 className="page__title page__title--project" title={`${displayName} — ${building.name}`}>
            {multiBuilding ? `${displayName} · ${building.name}` : displayName}
          </h1>
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
        </div>
      </div>

      <section className="panel setup__floors" aria-label="층과 도면">
        <h2 className="panel__title">
          {building.name} · 층 · 도면
          <span className="panel__meta">
            <span className="num">{buildingFloors.length}</span>개 · 도면{' '}
            <span className="num">{buildingFloors.filter((f) => drawingByFloor.has(f.id)).length}</span>장
          </span>
        </h2>

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
            void item;
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
                    onClick={() => dw && navigate({ name: 'CANVAS', projectId, floorId: f.id })}
                  >
                    {f.name}
                  </button>
                  {orderCheck.has(f.id) && (
                    <span className="badge badge--warn" title="이름과 현재 순서가 어긋납니다. 끌어서 제자리에 놓으세요">
                      순서 확인
                    </span>
                  )}
                  {nDefect > 0 && (
                    <span className="badge" title="이 층에 입력된 결함">
                      결함 <span className="num">{nDefect}</span>
                    </span>
                  )}
                  <FloorCodeInput floor={f} onCommit={setFloorCode} />
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
                              label: 'A4로 맞추기',
                              disabled: isA4Normalized(dw),
                              onSelect: () => askRenormalize(dw, f),
                            },
                            { label: '도곽 · 범례 설정', onSelect: () => setTitling(dw) },
                            {
                              label: '도면 크기 조절',
                              disabled: !dw.imgLayout,
                              onSelect: () => setScaling(dw),
                            },
                            {
                              label: '도면 교체',
                              onSelect: () => navigate({ name: 'UPLOAD', projectId, floorId: f.id }),
                            },
                            {
                              label: '층 이름 변경',
                              onSelect: () => {
                                setEditError(null);
                                setEditing({ kind: 'FLOOR', id: f.id, value: f.name });
                              },
                            },
                            { label: '위로', disabled: index === 0, onSelect: () => moveFloor(f.id, index - 1) },
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
                                setConfirming({ kind: 'DELETE_DRAWING', drawing: dw, floor: f, defects: nDefect }),
                            },
                            { label: '층 삭제', danger: true, onSelect: () => askDeleteFloor(f) },
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
                          { label: '위로', disabled: index === 0, onSelect: () => moveFloor(f.id, index - 1) },
                          {
                            label: '아래로',
                            disabled: index === buildingFloors.length - 1,
                            onSelect: () => moveFloor(f.id, index + 1),
                          },
                          { label: '층 삭제', danger: true, separatorBefore: true, onSelect: () => askDeleteFloor(f) },
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
      </section>

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

      {confirming?.kind === 'RENORMALIZE' && (
        <ConfirmDialog
          title="이 도면을 A4 가로에 맞출까요?"
          danger={false}
          body={
            <>
              <p>
                <b className="quote">{confirming.floor.name}</b>의 도면을 A4 가로
                (<span className="num">1754×1240</span>) 지면에 비율을 지켜 다시 배치합니다.
              </p>
              <p>
                <b>
                  결함 <span className="num">{confirming.counts.defects}</span>건의 위치가 자동으로
                  옮겨집니다.
                </b>{' '}
                <span className="muted">
                  (표기 {confirming.counts.marks}개 · 그리기 {confirming.counts.sketches}획 · 메모{' '}
                  {confirming.counts.memos}개)
                </span>
              </p>
              <p className="muted">
                도면 그림 위의 상대 위치는 그대로 유지됩니다. 실행한 뒤 화면 아래{' '}
                <b>[되돌리기]</b>로 원래대로 돌릴 수 있습니다.
              </p>
            </>
          }
          confirmLabel="A4로 맞추기"
          onConfirm={() => {
            const dw = confirming.drawing;
            setConfirming(null);
            doRenormalize(dw);
          }}
          onCancel={() => setConfirming(null)}
        />
      )}

      {renormUndo && (
        <div className="renorm-undo" role="status">
          <span>
            <b className="quote">{renormUndo.label}</b>을(를) A4 가로에 맞췄습니다
          </span>
          <button type="button" className="btn btn--small" disabled={renormBusy} onClick={undoRenormalize}>
            되돌리기
          </button>
          <button
            type="button"
            className="iconbtn iconbtn--small"
            aria-label="닫기"
            onClick={() => setRenormUndo(null)}
          >
            ✕
          </button>
        </div>
      )}

      {titling && (
        <TitleBlockDialog
          drawing={titling}
          project={project}
          busy={titleBusy}
          onApply={(tb, lg, name) => applyTitleBlock(titling, tb, lg, name)}
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

// ── 부품 (예전 ProjectSetup.tsx 그대로) ─────────────────────────────────────

/**
 * D19 · D20 — 층 접두어 입력칸. **접두어는 옵트인이다.**
 * 비워 두면 이름에서 딴 **제안값을 회색 placeholder 로** 보여준다.
 */
function FloorCodeInput({ floor, onCommit }: { floor: Floor; onCommit: (id: string, raw: string) => void }) {
  const saved = floor.code ?? null;
  const [value, setValue] = useState(saved ?? '');
  const lastSaved = useRef(saved);

  // 다른 경로(재로드 · 이름 변경)로 값이 바뀌면 편집 중이 아닐 때만 따라간다
  if (lastSaved.current !== saved) {
    lastSaved.current = saved;
    if ((normalizeFloorCode(value) ?? '') !== (saved ?? '')) setValue(saved ?? '');
  }

  // placeholder(제안) 전용 — 출력에는 쓰이지 않는다 (D20)
  const auto = floorCodeOf({ name: floor.name, code: null });

  /**
   * `Escape` 취소 가드 (검수 보통2).
   *
   * `blur()` 는 네이티브 focusout 을 **동기로** 일으키고 React 위임 리스너가 그 자리에서
   * `onBlur` 를 부른다. 그때 `value` 는 `setValue` 반영 **전** 클로저 값 —
   * 즉 취소하려던 문자열이 그대로 저장된다. 그래서 커밋을 한 번 건너뛴다.
   */
  const skipCommit = useRef(false);

  return (
    <input
      className="input frow__code"
      type="text"
      value={value}
      maxLength={FLOOR_CODE_MAX}
      placeholder={auto ?? '접두어'}
      aria-label={`${floor.name} 출력 접두어`}
      title={
        auto === null
          ? '출력 결함번호 접두어입니다. 비우면 접두어 없이 번호만 나갑니다'
          : `출력 결함번호 접두어입니다. 비우면 접두어 없이 번호만 나갑니다 (${auto} 를 넣으면 ${auto}-01)`
      }
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (skipCommit.current) {
          skipCommit.current = false;
          return;
        }
        onCommit(floor.id, value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          skipCommit.current = true;
          setValue(saved ?? '');
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
    />
  );
}

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

/** 드래그로 순서를 바꾸는 목록. 표시 순서가 진실이고, `sortOrder` 는 그 뒤를 따라간다 (§2-7-b). */
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
