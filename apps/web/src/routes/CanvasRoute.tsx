/**
 * P5 도면 캔버스 — Phase 3 화면이 실데이터 위에서 돈다 (T9 · T10).
 *
 * 픽스처는 사라졌다. 도면은 IndexedDB Blob 에서 오고, 결함은 저장된 것을 읽어 온다.
 * 점을 찍으면 **새로고침해도 남는다.**
 *
 * 저장 규칙 (§2-9-e):
 *   · 커맨드 확정 시점에만 저장한다. 드래그 중 매 프레임 저장하지 않는다
 *   · 250ms 디바운스. 단 `visibilitychange(hidden)` · `beforeunload` · 라우트 이탈 시 **즉시 플러시**
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  buildScreens,
  canRedo,
  canUndo,
  DEFAULT_GLOBAL_STYLE,
  ghostOf,
  isLocked,
  memoScreensOf,
  previewOf,
  type InputEvent,
  type ReduceContext,
  ZOOM_WHEEL_STEP,
} from '@onspect/canvas-core';
import {
  projectDisplayName,
  sortByOrder,
  type Building,
  type Drawing,
  type Floor,
  type Project,
} from '@onspect/project-core';
import { CanvasView } from '../canvas/CanvasView';
import { ContextToolbar } from '../canvas/ContextToolbar';
import { MemoEditor } from '../canvas/MemoEditor';
import { ToolPalette } from '../canvas/ToolPalette';
import { revokeAll } from '../canvas/imageLoader';
import { titleBlockConfigFor } from '../canvas/pageDecor';
import {
  cachedCompositeUrl,
  clearCompositeCache,
  compositeUrl,
  isDefaultScale,
} from '../canvas/drawingComposite';
import { useAppData } from '../data/appData';
import { revokeProjectUrls } from '../data/idb/blobs';
import {
  appReducer,
  defectsOfDrawing,
  displayNumbersOf,
  initialAppState,
  memosOfDrawing,
} from '../store';
import { navigate, replace } from '../router';
import { Sidebar } from '../ui/Sidebar';
import { Inspector } from '../ui/Inspector';
import { ConfirmDialog, ContextMenu, Toasts } from '../ui/Overlays';
import { useToast } from '../ui/ToastHost';

const FLUSH_DEBOUNCE_MS = 250;

export function CanvasRoute({ projectId, floorId }: { projectId: string; floorId: string | null }) {
  const { storage, guard } = useAppData();
  const toast = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [drawingUrl, setDrawingUrl] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [state, dispatch] = useReducer(
    appReducer,
    { projectId, floorId: floorId ?? '', defects: [], memos: [] },
    initialAppState,
  );
  const inspectorRef = useRef<HTMLDivElement | null>(null);
  const send = useCallback((ev: InputEvent) => dispatch({ t: 'INPUT', ev }), []);

  // ── 로드 ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (storage.phase !== 'READY') return;
    let alive = true;
    void storage.repo.loadBundle(projectId).then((b) => {
      if (!alive) return;
      if (!b) {
        setNotFound(true);
        return;
      }
      setProject(b.project);
      setBuildings(b.buildings);
      setFloors(b.floors);
      setDrawings(b.drawings);
      dispatch({ t: 'LOAD', projectId, defects: b.defects, memos: b.memos });
      setLoaded(true);
      void guard(() => storage.repo.touchProject(projectId, Date.now()));
    });
    return () => {
      alive = false;
    };
  }, [storage, projectId, guard]);

  useEffect(() => {
    if (!notFound) return;
    toast('해당 용역을 찾을 수 없습니다', { kind: 'warn' });
    navigate({ name: 'LIST' });
  }, [notFound, toast]);

  // 용역을 벗어날 때 objectURL 과 래스터를 전부 해제한다 (§2-8-c)
  useEffect(
    () => () => {
      revokeProjectUrls(projectId);
      revokeAll();
      clearCompositeCache();
    },
    [projectId],
  );

  // ── 파생 ────────────────────────────────────────────────────────────────
  const drawingByFloor = useMemo(() => {
    const m = new Map<string, Drawing>();
    for (const d of drawings) m.set(d.floorId, d);
    return m;
  }, [drawings]);

  const orderedFloors = useMemo(() => {
    const rank = new Map(sortByOrder(buildings).map((b, i) => [b.id, i]));
    return [...floors].sort(
      (a, b) =>
        (rank.get(a.buildingId) ?? 0) - (rank.get(b.buildingId) ?? 0) || a.sortOrder - b.sortOrder,
    );
  }, [floors, buildings]);

  /** P5 진입 시 여는 층 = sortOrder 가 가장 작은, **도면이 있는** 층 (§2-3) */
  const resolvedFloor = useMemo(() => {
    if (!loaded) return null;
    if (floorId) {
      const hit = floors.find((f) => f.id === floorId);
      if (hit) return hit;
    }
    return orderedFloors.find((f) => drawingByFloor.has(f.id)) ?? orderedFloors[0] ?? null;
  }, [loaded, floorId, floors, orderedFloors, drawingByFloor]);

  // 층 전환은 **화면 전이가 아니라 URL 갱신**이다 (§2-3)
  useEffect(() => {
    if (!resolvedFloor || resolvedFloor.id === floorId) return;
    replace({ name: 'CANVAS', projectId, floorId: resolvedFloor.id });
  }, [resolvedFloor, floorId, projectId]);

  const currentDrawing = resolvedFloor ? (drawingByFloor.get(resolvedFloor.id) ?? null) : null;

  // 층·도면이 정해지면 캔버스에 건다
  useEffect(() => {
    if (!resolvedFloor) return;
    dispatch({
      t: 'SET_FLOOR',
      floorId: resolvedFloor.id,
      drawing: currentDrawing
        ? {
            id: currentDrawing.id,
            imageWidth: currentDrawing.imageWidth,
            imageHeight: currentDrawing.imageHeight,
          }
        : null,
    });
  }, [resolvedFloor?.id, currentDrawing?.id]);

  // 도면 Blob → objectURL. **네트워크를 타지 않는다** (§2-9-d)
  //
  // F5-3 — 도면 크기 조절(`imgScale`)이 기본(1)이 아니면 저장된 렌더 Blob 대신
  // **원본을 그 배율로 다시 합성한 결과**를 쓴다. 합성 결과는 저장소가 아니라
  // `drawingComposite` 런타임 캐시에만 있다. 결함 좌표는 건드리지 않는다.
  useEffect(() => {
    if (storage.phase !== 'READY' || !currentDrawing) {
      setDrawingUrl(null);
      return;
    }
    const repo = storage.repo;
    const dw = currentDrawing;
    let alive = true;

    const useStored = () =>
      repo.objectUrl(dw.renderBlobKey, projectId).then((u) => {
        if (alive) setDrawingUrl(u);
      });

    if (isDefaultScale(dw.imgScale)) {
      void useStored();
    } else {
      const scale = dw.imgScale ?? 1;
      const cached = cachedCompositeUrl(dw.id, scale);
      if (cached) setDrawingUrl(cached);
      void repo
        .readBlob(dw.sourceBlobKey)
        .then((b) => (b ? compositeUrl(dw.id, b, scale) : null))
        .then((u) => {
          if (!alive) return;
          if (u) setDrawingUrl(u);
          else void useStored();
        })
        .catch(() => {
          // 원본을 못 읽거나 합성이 실패하면 저장된 렌더로 되돌아간다 — 화면이 비지 않게
          if (alive) void useStored();
        });
    }
    return () => {
      alive = false;
    };
  }, [storage, currentDrawing?.renderBlobKey, currentDrawing?.imgScale, projectId]);

  // ── 저장 (로컬 우선 · 커밋 시점 · 250ms 디바운스) ───────────────────────
  const writesRef = useRef(state.writes);
  writesRef.current = state.writes;

  const flush = useCallback(() => {
    const w = writesRef.current;
    if (w.seq === 0 || storage.phase !== 'READY') return;
    const { seq, upsert, remove, memoUpsert, memoRemove } = w;
    dispatch({ t: 'FLUSHED', seq });
    void guard(async () => {
      if (upsert.length > 0) await storage.repo.upsertDefects(upsert);
      if (remove.length > 0) await storage.repo.deleteDefects(remove);
      // 메모는 다른 스토어다 (§S2a-1). 결함 집계에 섞이지 않는다
      if (memoUpsert.length > 0) await storage.repo.upsertMemos(memoUpsert);
      if (memoRemove.length > 0) await storage.repo.deleteMemos(memoRemove);
      return true;
    });
  }, [storage, guard]);

  useEffect(() => {
    if (state.writes.seq === 0) return;
    const h = window.setTimeout(flush, FLUSH_DEBOUNCE_MS);
    return () => window.clearTimeout(h);
  }, [state.writes.seq, flush]);

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onHidden);
      flush(); // 라우트 이탈 시 즉시 플러시
    };
  }, [flush]);

  // ── 캔버스 파생 ─────────────────────────────────────────────────────────
  const defects = useMemo(
    () => defectsOfDrawing(state.defects, state.canvas.drawing?.id ?? null),
    [state.defects, state.canvas.drawing?.id],
  );

  const defectCountByFloor = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of state.defects) m.set(d.floorId, (m.get(d.floorId) ?? 0) + 1);
    return m;
  }, [state.defects]);

  /** 메모는 결함 리스트·결함 건수 어디에도 들어가지 않는다 (§S2a-1) */
  const memos = useMemo(
    () => memosOfDrawing(state.memos, state.canvas.drawing?.id ?? null),
    [state.memos, state.canvas.drawing?.id],
  );

  /** 코어에 넘기는 컨텍스트 — 파생 계산(memoScreensOf · ghostOf)도 같은 값을 쓴다 */
  const reduceCtx = useMemo<ReduceContext>(
    () => ({
      defects,
      memos,
      globalStyle: DEFAULT_GLOBAL_STYLE,
      makeId: () => '',
      floorId: state.floorId,
      projectId,
    }),
    [defects, memos, state.floorId, projectId],
  );

  const memoScreens = useMemo(
    () => memoScreensOf(state.canvas, reduceCtx),
    [state.canvas, reduceCtx],
  );

  const ghost = useMemo(() => ghostOf(state.canvas, reduceCtx), [state.canvas, reduceCtx]);

  const editingMemo = useMemo(
    () => memos.find((m) => m.id === state.editingMemoId) ?? null,
    [memos, state.editingMemoId],
  );

  const editingMemoBox = useMemo(
    () => memoScreens.find((m) => m.memoId === state.editingMemoId) ?? null,
    [memoScreens, state.editingMemoId],
  );

  const displayNumbers = useMemo(() => displayNumbersOf(defects), [defects]);

  // F5-1 도곽 — 저장 형태(project-core) → 렌더 형태(canvas-core) 로 잇는다 (D13)
  const titleBlock = useMemo(
    () => titleBlockConfigFor(currentDrawing, project),
    [currentDrawing, project],
  );

  const selected = useMemo(
    () => defects.find((d) => d.id === state.canvas.selection.defectId) ?? null,
    [defects, state.canvas.selection.defectId],
  );

  // 컨텍스트 플로팅 툴바 위치 — 선택된 표기 아래. 대상을 덮지 않는다
  const toolbarAt = useMemo(() => {
    // 드래그 중에는 툴바를 숨긴다 — 손을 따라다니면 도면을 가린다
    if (!selected || !state.canvas.drawing || state.canvas.drag) return null;
    const screens = buildScreens({
      drawing: state.canvas.drawing,
      viewport: state.canvas.viewport,
      defects,
      globalStyle: DEFAULT_GLOBAL_STYLE,
      preview: previewOf(state.canvas),
    });
    const s = screens.find((x) => x.defectId === selected.id);
    if (!s) return null;
    let top = s.label.y - s.balloonR;
    let bottom = s.label.y + s.balloonR;
    for (const m of s.marks) {
      top = Math.min(top, m.center.y - s.markR);
      bottom = Math.max(bottom, m.center.y + s.markR);
    }
    const below = bottom + 14;
    const y = below + 40 < state.canvas.canvas.h ? below : Math.max(8, top - 14 - 34);
    return {
      x: Math.min(Math.max(s.label.x, 150), Math.max(150, state.canvas.canvas.w - 150)),
      y,
    };
  }, [selected, state.canvas, defects]);

  const selectFloor = useCallback(
    (f: Floor) => {
      replace({ name: 'CANVAS', projectId, floorId: f.id });
    },
    [projectId],
  );

  const selectDefect = useCallback(
    (id: string) => send({ k: 'SELECT_DEFECT', defectId: id, reveal: true }),
    [send],
  );

  const goUpload = useCallback(
    (fid: string) => {
      flush();
      navigate({ name: 'UPLOAD', projectId, floorId: fid });
    },
    [projectId, flush],
  );

  useEffect(() => {
    if (state.focusTick > 0) inspectorRef.current?.focus({ preventScroll: true });
  }, [state.focusTick]);

  const menuDefectLocked = useMemo(() => {
    if (!state.menu) return false;
    const d = state.defects.find((x) => x.id === state.menu!.defectId);
    return d ? isLocked(d) : false;
  }, [state.menu, state.defects]);

  const undoable = canUndo(state.history);
  const redoable = canRedo(state.history);
  const zoomPct = Math.round(state.canvas.viewport.zoom * 100);
  const displayName = project ? projectDisplayName(project) : '';

  return (
    <div className="app" data-sidebar={sidebarOpen ? 'open' : 'closed'}>
      <header className="topbar">
        <div className="topbar__left">
          <button
            type="button"
            className="iconbtn"
            aria-pressed={!sidebarOpen}
            aria-label={sidebarOpen ? '좌측 패널 접기' : '좌측 패널 펼치기'}
            title={sidebarOpen ? '좌측 패널 접기' : '좌측 패널 펼치기'}
            onClick={() => setSidebarOpen((v) => !v)}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <line x1="7.5" y1="3.5" x2="7.5" y2="16.5" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              flush();
              navigate({ name: 'SETUP', projectId });
            }}
            title="용역 구성으로 돌아갑니다"
          >
            ← 용역 구성
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            title="결함 입력 항목을 구성합니다. 닫으면 이 층으로 돌아옵니다"
            onClick={() => {
              flush();
              navigate({ name: 'SETTINGS', projectId, fromFloorId: resolvedFloor?.id ?? null });
            }}
          >
            설정
          </button>
          <span className="topbar__project" title={displayName}>
            {displayName}
          </span>
          {resolvedFloor && <span className="chip chip--muted">{resolvedFloor.name}</span>}
        </div>

        <div className="topbar__right">
          <div className="btngroup" role="group" aria-label="편집 되돌리기">
            <button
              type="button"
              className="btn btn--icon"
              disabled={!undoable}
              title="되돌리기 (Ctrl+Z)"
              onClick={() => dispatch({ t: 'UNDO' })}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M7 5 3 9l4 4" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="M3 9h8a4.5 4.5 0 1 1 0 9H8" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              <span>되돌리기</span>
            </button>
            <button
              type="button"
              className="btn btn--icon"
              disabled={!redoable}
              title="다시 실행 (Ctrl+Shift+Z)"
              onClick={() => dispatch({ t: 'REDO' })}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M13 5l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="M17 9H9a4.5 4.5 0 1 0 0 9h3" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              <span>다시 실행</span>
            </button>
          </div>

          <div className="btngroup" role="group" aria-label="확대 축소">
            <button
              type="button"
              className="btn btn--icon"
              title="축소 (−)"
              aria-label="축소"
              disabled={!state.canvas.drawing}
              onClick={() => send({ k: 'ZOOM_BUTTON', factor: 1 / ZOOM_WHEEL_STEP })}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <line x1="5" y1="10" x2="15" y2="10" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </button>
            {/* 알려진 버그 2: 도면 없는 층에서 배율 자리가 빈칸이 되어 버튼이 눌려 붙었다.
                `—` 로 자리를 지키고 이유를 툴팁에 적는다 (§2-10-c) */}
            <span
              className="zoom num"
              title={state.canvas.drawing ? '현재 배율' : '도면이 없습니다'}
              aria-label={state.canvas.drawing ? `현재 배율 ${zoomPct}퍼센트` : '배율 없음'}
            >
              {state.canvas.drawing ? `${zoomPct}%` : '—'}
            </span>
            <button
              type="button"
              className="btn btn--icon"
              title="확대 (+)"
              aria-label="확대"
              disabled={!state.canvas.drawing}
              onClick={() => send({ k: 'ZOOM_BUTTON', factor: ZOOM_WHEEL_STEP })}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <line x1="5" y1="10" x2="15" y2="10" stroke="currentColor" strokeWidth="1.8" />
                <line x1="10" y1="5" x2="10" y2="15" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            </button>
            <button
              type="button"
              className="btn"
              title="전체 맞춤 (0 · 빈 곳 더블클릭)"
              disabled={!state.canvas.drawing}
              onClick={() => send({ k: 'FIT' })}
            >
              전체 맞춤
            </button>
          </div>
        </div>
      </header>

      <div className="body">
        {sidebarOpen && (
          <Sidebar
            buildings={buildings}
            floors={floors}
            drawingByFloor={drawingByFloor}
            defectCountByFloor={defectCountByFloor}
            floorId={resolvedFloor?.id ?? ''}
            defects={defects}
            hasDrawing={currentDrawing !== null}
            selectedId={state.canvas.selection.defectId}
            reveal={state.reveal}
            onSelectFloor={selectFloor}
            onSelectDefect={selectDefect}
            onRevealDone={() => dispatch({ t: 'CLEAR_REVEAL' })}
          />
        )}

        <main className="stage">
          <CanvasView
            state={state.canvas}
            defects={defects}
            memoScreens={memoScreens}
            ghost={ghost}
            displayNumbers={displayNumbers}
            titleBlock={titleBlock}
            send={send}
            drawingUrl={drawingUrl}
            onUploadDrawing={() => resolvedFloor && goUpload(resolvedFloor.id)}
          >
            {editingMemo && (
              <MemoEditor
                box={editingMemoBox}
                initialText={editingMemo.text}
                onCommit={(text) => {
                  send({ k: 'COMMIT_MEMO_TEXT', memoId: editingMemo.id, text });
                  dispatch({ t: 'EDIT_MEMO', memoId: null });
                }}
                onCancel={() => {
                  // 새로 만든 빈 메모를 Esc 로 닫으면 남겨 둘 이유가 없다
                  if (editingMemo.text.trim() === '') {
                    send({ k: 'COMMIT_MEMO_TEXT', memoId: editingMemo.id, text: '' });
                  }
                  dispatch({ t: 'EDIT_MEMO', memoId: null });
                }}
              />
            )}
          </CanvasView>

          {/* `data-floating` 요소는 안전 영역 계산에 들어간다 (§2-10-a) */}
          <div className="stage__palette" data-floating>
            <ToolPalette
              tool={state.canvas.tool}
              disabled={!state.canvas.drawing}
              onChange={(tool) => send({ k: 'SET_TOOL', tool })}
            />
          </div>

          {selected && toolbarAt && (
            <ContextToolbar
              defect={selected}
              markId={state.canvas.selection.markId}
              at={toolbarAt}
              locked={isLocked(selected)}
              onDelete={() => send({ k: 'DELETE_SELECTION' })}
              onResetLabel={() => send({ k: 'RESET_LABEL', defectId: selected.id })}
              onSetColor={(color) => send({ k: 'SET_MARK_COLOR', defectId: selected.id, color })}
              onSetAreaShape={(shape) => send({ k: 'SET_AREA_STYLE', defectId: selected.id, shape })}
              onSetAreaFill={(fill) => send({ k: 'SET_AREA_STYLE', defectId: selected.id, fill })}
              onResetStyle={() => send({ k: 'RESET_STYLE', defectId: selected.id })}
            />
          )}

          {state.menu && (
            <ContextMenu
              x={state.menu.x}
              y={state.menu.y}
              locked={menuDefectLocked}
              onDelete={() => send({ k: 'DELETE_SELECTION' })}
              onClose={() => dispatch({ t: 'CLOSE_MENU' })}
            />
          )}

          <div className="stage__help" data-floating>
            <kbd>휠</kbd> 줌 · <kbd>Space</kbd>드래그 팬 · <kbd>Alt</kbd> 스냅 해제 ·{' '}
            <kbd>Shift</kbd> 축 고정 · 정사각/정원 · <kbd>Ctrl+Z</kbd> 되돌리기
          </div>
        </main>

        <Inspector
          ref={inspectorRef}
          defect={selected}
          onResetLabel={() => selected && send({ k: 'RESET_LABEL', defectId: selected.id })}
          onDelete={() => send({ k: 'DELETE_SELECTION' })}
        />
      </div>

      {state.confirm && (
        <ConfirmDialog
          title="이 결함을 삭제할까요?"
          body={
            state.confirm.reason === 'LAST_MARK'
              ? '마지막 남은 표기입니다. 지우면 결함 1건이 함께 삭제됩니다. 되돌리기로 되살릴 수 있습니다.'
              : '결함 1건이 삭제됩니다. 되돌리기로 되살릴 수 있습니다.'
          }
          confirmLabel="삭제"
          onConfirm={() => {
            const id = state.confirm!.defectId;
            dispatch({ t: 'CLOSE_CONFIRM' });
            send({ k: 'CONFIRM_DELETE_DEFECT', defectId: id });
          }}
          onCancel={() => dispatch({ t: 'CLOSE_CONFIRM' })}
        />
      )}

      <Toasts
        toasts={state.toasts}
        onDismiss={(id) => dispatch({ t: 'DISMISS_TOAST', id })}
        onUndo={() => dispatch({ t: 'UNDO' })}
      />
    </div>
  );
}
