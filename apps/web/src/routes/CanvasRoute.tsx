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
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as RPointerEvent,
} from 'react';
import {
  attrsOf,
  buildScreens,
  canAddPhotos,
  canRedo,
  canUndo,
  ghostOf,
  pendingGhostsOf,
  isLocked,
  memoScreensOf,
  pickCarryAttrs,
  previewOf,
  type InputEvent,
  type ReduceContext,
  ZOOM_WHEEL_STEP,
} from '@onspect/canvas-core';
import {
  DEFAULT_DRAWING_TITLE_BLOCK,
  projectDisplayName,
  promoteProjectDecor,
  seedAttrs,
  sortByOrder,
  type Building,
  type Drawing,
  type Floor,
  type ItemSettings,
  type Photo,
  type Project,
  type ProjectLegend,
  type ProjectTitleBlock,
  clampScale,
} from '@onspect/project-core';
import { AimControls, AimCrosshair } from '../canvas/AimOverlay';
import { aimCenterOf, aimTapEvents } from '../canvas/aimSynth';
import { CanvasView } from '../canvas/CanvasView';
import { ContextToolbar } from '../canvas/ContextToolbar';
import { MemoEditor } from '../canvas/MemoEditor';
import { ToolPalette } from '../canvas/ToolPalette';
import { revokeAll } from '../canvas/imageLoader';
import { globalStyleForLabelScale } from '../canvas/labelStyle';
import { legendConfigFor, titleBlockConfigFor } from '../canvas/pageDecor';
import { TitleBlockDialog } from './TitleBlockDialog';
import {
  cachedCompositeUrl,
  clearCompositeCache,
  compositeUrl,
  needsCompose,
  releaseComposite,
} from '../canvas/drawingComposite';
import { DrawingScaleDialog } from './DrawingScaleDialog';
import {
  applyDrawingScale,
  drawingScaleAppliedMessage,
  SCALE_NEEDS_A4_MESSAGE,
} from '../data/drawingScale';
import { transformAll } from '../data/renormalize';
import type { Defect, Memo } from '@onspect/canvas-core';
import { useAppData } from '../data/appData';
import { useLastView } from '../data/useLastView';
import { usePhotos } from '../data/usePhotos';
import { revokeProjectUrls } from '../data/idb/blobs';
import { PhotoSection } from '../ui/photos/PhotoSection';
import {
  appReducer,
  defectsOfDrawing,
  displayNumbersOf,
  initialAppState,
  memosOfDrawing,
} from '../store';
import { navigate, replace } from '../router';
import { TOUCH_HIT_PROFILE, useUiMode } from '../shell/useUiMode';
import { InspectorPlacement, type SheetSnap } from '../shell/TabletSheet';
import { FloorChips } from '../shell/FloorChips';
import { Sidebar } from '../ui/Sidebar';
import { Inspector } from '../ui/Inspector';
import { SimilarDefectPicker, type SimilarDefectItem } from '../ui/SimilarDefectPicker';
import { ConfirmDialog, ContextMenu, Toasts } from '../ui/Overlays';
import { useToast } from '../ui/ToastHost';

const FLUSH_DEBOUNCE_MS = 250;

/** 참조가 매 렌더 바뀌면 `usePhotos` 가 상태를 계속 리셋한다 */
const EMPTY_PHOTOS: Photo[] = [];

// F6 — 번호 풍선 크기. 도곽·범례의 크기 슬라이더(0.5~2배)와 같은 범위를 쓴다
const LABEL_SCALE_MIN = 0.5;
const LABEL_SCALE_MAX = 2;
const LABEL_SCALE_STEP = 0.1;

/**
 * T-8 — 태블릿 가로에서 결함정보 패널(`--inspector-w`) 폭을 손가락으로 바꾼다.
 *
 * ⭐ **롱프레스 진입이다. 상시 드래그가 아니다.**
 *    경계는 CSS 그리드 열 경계라 폭이 0이다. 손가락으로 잡으려면 히트 띠를 넓혀야 하는데,
 *    그 띠가 캔버스 우측 끝을 덮으면 **결함 표기 오탭**이 난다 — 현장에서 가장 비싼 실수다.
 *    그래서 평소에는 아무 일도 하지 않고, 1초를 버텨야 리사이즈 모드로 들어간다.
 *
 * 파라미터는 U50 확정값이다.
 */
const RESIZE_HOLD_MS = 1000;
const RESIZE_SLOP_PX = 8;
const INSPECTOR_W_MIN = 260;
const INSPECTOR_W_MAX_PX = 560;
const INSPECTOR_W_MAX_RATIO = 0.6;
/** 기기별 UI 선호값이다 — 프로젝트 데이터가 아니라 `localStorage` 에 둔다 (U49) */
const INSPECTOR_W_KEY = 'onspect.inspectorW';

function clampInspectorW(v: number, viewportW: number): number {
  const max = Math.max(INSPECTOR_W_MIN, Math.min(viewportW * INSPECTOR_W_MAX_RATIO, INSPECTOR_W_MAX_PX));
  return Math.round(Math.max(INSPECTOR_W_MIN, Math.min(max, v)));
}

function readStoredInspectorW(): number | null {
  try {
    const raw = window.localStorage.getItem(INSPECTOR_W_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    // 사파리 프라이빗 모드 등 — 폭 기억을 못 할 뿐, 화면은 기본값으로 그대로 뜬다
    return null;
  }
}

export function CanvasRoute({ projectId, floorId }: { projectId: string; floorId: string | null }) {
  const { storage, guard } = useAppData();
  const toast = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  /**
   * 결함정보 폼이 고를 항목 목록 — **이 용역의 설정 스냅샷**이다 (D6).
   * 전역(ORG) 문서가 아니다. 다른 용역의 설정을 바꿔도 여기 결함은 흔들리지 않는다.
   */
  const [settings, setSettings] = useState<ItemSettings | null>(null);
  /** S5 — 이 용역의 사진 전부(묶음 로드에서 한 번에 온다). 조작은 `usePhotos` 가 맡는다 */
  const [loadedPhotos, setLoadedPhotos] = useState<Photo[]>(EMPTY_PHOTOS);
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [drawingUrl, setDrawingUrl] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  /** F5-1·F5-2 — 도곽·범례 설정. 캔버스에서도 켜고 끌 수 있어야 한다는 사용자 지적(2026-08-24) —
   * 예전에는 용역 구성 화면에만 있었다. 다이얼로그·저장 로직은 그대로, 진입점만 하나 늘렸다 */
  const [titling, setTitling] = useState(false);
  const [titleBusy, setTitleBusy] = useState(false);
  /**
   * P-1 — 도면 이미지 축척 조절. **기능은 원래 있었다**(도면관리 안에만 있어 못 찾았다).
   * 다이얼로그(`DrawingScaleDialog`)도 적용 로직(`data/drawingScale`)도 도면관리와 **같은 것**을 쓴다.
   */
  const [scaling, setScaling] = useState(false);
  const [scaleBusy, setScaleBusy] = useState(false);
  /**
   * D16 실시간 미리보기 — 도곽·범례 다이얼로그가 **저장 전에** 흘려보낸 임시 값.
   * `null` = 오버라이드 없음(저장된 값을 쓴다). 다이얼로그가 닫히면 항상 `null` 로 돌아온다.
   */
  const [tbPreview, setTbPreview] = useState<ProjectTitleBlock | null>(null);
  const [lgPreview, setLgPreview] = useState<ProjectLegend | null>(null);

  /**
   * T2-1 태블릿 셸 — 이 화면이 손가락용인가, 세로인가 (`shell/useUiMode.ts`).
   * PC 면 `shell === 'pc'` 하나뿐이고 아래 분기가 전부 꺼진다 = **PC 동작 변화 0.**
   */
  const { shell, tablet } = useUiMode();
  /** 세로 태블릿에서만 결함정보가 바텀시트로 간다 (D10 · 스펙 §5-1) */
  const sheetMode = shell === 'tablet-portrait';
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('PEEK');

  /**
   * T-8 — 결함정보 패널 폭. `null` 이면 CSS 기본값(`--inspector-w`)을 그대로 쓴다.
   * **가로 태블릿에서만** 조절한다 — 세로는 바텀시트라 폭이라는 개념이 없고, PC 는 요구가 없다.
   */
  const appRef = useRef<HTMLDivElement | null>(null);
  const [inspectorW, setInspectorW] = useState<number | null>(() => readStoredInspectorW());
  const [resizing, setResizing] = useState(false);
  const resizeRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startW: number;
    timer: number;
    armed: boolean;
  } | null>(null);
  const resizeBandRef = useRef<HTMLDivElement | null>(null);

  /** 진행 중인 롱프레스/드래그를 흔적 없이 정리한다 */
  const endResize = useCallback((commit: boolean) => {
    const st = resizeRef.current;
    resizeRef.current = null;
    if (!st) return;
    window.clearTimeout(st.timer);
    const band = resizeBandRef.current;
    if (band?.hasPointerCapture(st.pointerId)) band.releasePointerCapture(st.pointerId);
    if (!st.armed) return;
    setResizing(false);
    if (!commit) return;
    // 드래그 중에는 DOM 의 CSS 변수만 갈았다(U51 — 프레임마다 리렌더하지 않는다).
    // 놓는 순간 한 번만 React 상태·localStorage 로 확정한다
    const el = appRef.current;
    const raw = el ? Number.parseFloat(el.style.getPropertyValue('--inspector-w')) : NaN;
    if (!Number.isFinite(raw)) return;
    const next = clampInspectorW(raw, window.innerWidth);
    setInspectorW(next);
    try {
      window.localStorage.setItem(INSPECTOR_W_KEY, String(next));
    } catch {
      // 저장에 실패해도 이번 세션의 폭은 유지된다
    }
  }, []);

  /**
   * 폭 조절이 의미 있는 화면인가.
   * 세로 태블릿은 결함정보가 바텀시트라 폭이라는 개념이 없고, PC 는 이 요구가 없다
   * → **PC 는 DOM 도 CSS 변수도 예전 그대로다 = 동작 변화 0.**
   */
  const canResizeInspector = tablet && !sheetMode;

  /** 저장된 폭을 화면 크기에 맞춰 다시 가둔다 — 회전하면 상한(화면×0.6)이 바뀐다 */
  const effectiveInspectorW =
    inspectorW === null ? null : clampInspectorW(inspectorW, window.innerWidth);

  /**
   * T2-6 — 바텀시트가 실제로 잡아먹는 하단 px. `TabletSheet` 가 자신의 렌더 높이를
   * `getBoundingClientRect` 로 실측해 `onHeightChange` 로 보고한 값을 그대로 받는다
   * (아래 `InspectorPlacement` 호출부). CSS 높이 공식(`SHEET_SNAP_RATIO * vh`)을 여기서
   * 다시 계산하지 않는다 — `vh` 를 구하는 기준이 온스크린 키보드가 열릴 때 CSS 의 실제
   * 기준과 갈라질 수 있어서다(2026-09-03 code-reviewer 지적, 66번 문서). 시트가 안 떠
   * 있으면(결함 미선택 · PC · 태블릿 가로) `TabletSheet` 가 마운트되지 않거나 언마운트되며
   * 0 을 보고한다.
   */
  const [sheetBottomPx, setSheetBottomPx] = useState(0);

  const [state, dispatch] = useReducer(
    appReducer,
    { projectId, floorId: floorId ?? '', defects: [], memos: [] },
    initialAppState,
  );
  const inspectorRef = useRef<HTMLDivElement | null>(null);
  const send = useCallback((ev: InputEvent) => dispatch({ t: 'INPUT', ev }), []);

  /**
   * T2-1 — 손가락 화면이면 넓은 히트 허용치를 **스토어에 넣는다.**
   * 코어(`reduce`)가 이 값을 타는 자리는 `store.ts` `runInput` 하나뿐이다.
   * PC 면 `null` 을 넣어 코어 기본값(마우스)으로 되돌린다 = 동작 불변.
   */
  useEffect(() => {
    dispatch({ t: 'SET_HIT_PROFILE', profile: tablet ? TOUCH_HIT_PROFILE : null });
  }, [tablet]);

  /**
   * T2-5 — 마지막 뷰포트(줌 배율 · 팬 위치)를 `meta` KV `lastView:{projectId}` 에 기억했다가
   * 이 용역을 다시 열 때 되돌린다. 저장·복원·디바운스·이탈 플러시가 전부 훅 안에 있다.
   * **저장소를 못 쓰거나 저장된 값이 없으면 아무 일도 일어나지 않는다** — 전체 맞춤 그대로다.
   */
  useLastView(projectId, state.canvas, send);


  /**
   * D22(Q55 안 A) 조준 모드 — 켜져 있으면 도면 위 손가락은 팬/줌만 하고,
   * 표기는 화면 중앙 십자선 + `[여기]` 로만 생긴다.
   *
   * 화면에 남는 상태다(저장하지 않는다). 한 번 켜면 여러 개를 연속으로 찍을 수 있게
   * **확정 후에도 꺼지지 않는다** — Q55 가 꼽은 안 A 의 장점("연속 표기가 빠르다").
   */
  const [aimOn, setAimOn] = useState(false);
  /** 조준이 화면 정중앙 좌표를 재려면 캔버스 호스트 요소가 필요하다 */
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const fireAim = useCallback(() => {
    const el = canvasHostRef.current;
    if (!el) return;
    // 십자선 자리를 손가락으로 탭한 것과 **같은 이벤트 쌍**을 기존 경로로 흘려보낸다.
    // 지금 켜진 도구가 무엇이든 코어가 알아서 판단한다 (코어 변경 0)
    for (const ev of aimTapEvents(aimCenterOf(el))) send(ev);
  }, [send]);

  // ── 로드 ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (storage.phase !== 'READY') return;
    let alive = true;
    void (async () => {
      const b = await storage.repo.loadBundle(projectId);
      if (!alive) return;
      if (!b) {
        setNotFound(true);
        return;
      }
      // 지연 스냅샷(§2-4) — S1·S2a 로 만든 옛 용역도 여는 시점에 자기 설정을 갖는다.
      // 저장소를 못 쓰면(사생활 보호 모드) null 로 두고 캔버스는 계속 돈다 — 폼만 접힌다
      let s: ItemSettings | null = null;
      try {
        s = await storage.repo.ensureProjectSettings(projectId);
      } catch {
        s = null;
      }
      if (!alive) return;
      // D16 승격(§5-3-c) — 도곽·범례를 용역 스코프로 올리면서 **이미 설정해 둔 값을 잃지 않는다.**
      // `ensureProjectSettings`(바로 위)와 같은 관용구: 여는 시점에 그 용역 것만 채운다.
      // 실패해도 캔버스는 계속 돈다 — 읽기 쪽이 어차피 기본값으로 폴백한다
      const promoted = promoteProjectDecor(b.project, b.drawings, b.floors);
      if (promoted) void guard(() => storage.repo.putProject(promoted));
      setProject(promoted ?? b.project);
      setBuildings(b.buildings);
      setFloors(b.floors);
      setDrawings(b.drawings);
      setSettings(s);
      setLoadedPhotos(b.photos.length > 0 ? b.photos : EMPTY_PHOTOS);
      // 지난 세션에 결함과 함께 지워졌어야 할 **고아 사진**을 이때 쓸어 담는다.
      // 결함 삭제는 Ctrl+Z 로 되돌릴 수 있어 그 자리에서 사진을 지우면 안 되고,
      // 새로고침한 지금은 되돌리기 스택이 이미 비어 있다 (검수 지적 1).
      // 화면에 목록을 넘긴 **뒤에** 돌리고, 결과를 기다리지 않는다 — 실패해도 캔버스는 뜬다
      void guard(() => storage.repo.purgeOrphanPhotos(projectId));
      dispatch({
        t: 'LOAD',
        projectId,
        defects: b.defects,
        memos: b.memos,
        // 새 결함에 얹을 **프로젝트 고정 기본값** — 지금은 용역의 기본 구조유형뿐이다.
        // 부재·결함유형은 현장에서 고르는 값이라 기본값을 두지 않는다.
        // ⚠️ 이 값은 세션 내내 갱신되지 않는다 (D18 — D9 자동 이어받기 폐기)
        defaultAttrs: s ? seedAttrs(s, b.project) : {},
      });
      setLoaded(true);
      void guard(() => storage.repo.touchProject(projectId, Date.now()));
    })();
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
      // C-2 — 도면마다 다른 풍선 배율. 전환과 **같은 액션**에 실어야 첫 입력이 어긋나지 않는다
      labelScale: currentDrawing?.labelScale ?? 1,
    });
    // ⚠️ `labelScale` 을 의존성에 넣지 않는다 — `SET_FLOOR` 는 `SET_DRAWING` 을 태워
    //    **뷰포트를 다시 맞춘다.** 배율만 바뀐 경우는 아래 `SET_LABEL_SCALE` 이 따로 처리한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    if (!needsCompose(dw)) {
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
  }, [
    storage,
    currentDrawing?.renderBlobKey,
    currentDrawing?.imgScale,
    currentDrawing?.renormalizedAt,
    projectId,
  ]);

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

  /**
   * F6 — 번호 풍선 크기. 도면마다 결함 밀도가 달라 도면 단위로 둔다(도곽·범례와 같은 스코프).
   * C-2 — **렌더 · 리듀서 · 파생 계산 · 툴바 위치가 전부 이 하나를 쓴다.**
   *        계산 본체는 `canvas/labelStyle.ts` 한 곳뿐이고, 배율 1 이면 `DEFAULT_GLOBAL_STYLE`
   *        **같은 참조**라 기본 도면의 메모이제이션이 한 번도 깨지지 않는다(U47).
   */
  const labelScale = currentDrawing?.labelScale ?? 1;
  const globalStyle = useMemo(() => globalStyleForLabelScale(labelScale), [labelScale]);

  /**
   * C-2 — 리듀서가 쓰는 배율을 화면과 맞춘다.
   * 도면 전환은 `SET_FLOOR` 가 같은 액션에서 처리하므로, 여기는 **같은 도면에서 배율만 바뀐**
   * 경우(F6 `−`/`+`)를 위한 것이다. 같은 값이면 리듀서가 상태를 갈지 않는다.
   */
  useEffect(() => {
    dispatch({ t: 'SET_LABEL_SCALE', scale: labelScale });
  }, [labelScale]);

  /** 코어에 넘기는 컨텍스트 — 파생 계산(memoScreensOf · ghostOf)도 같은 값을 쓴다 */
  const reduceCtx = useMemo<ReduceContext>(
    () => ({
      defects,
      memos,
      globalStyle,
      makeId: () => '',
      floorId: state.floorId,
      projectId,
      // T2-1 — 손가락 화면에서만 넓은 히트 허용치를 넘긴다(트랙 A T5).
      // **PC 는 넘기지 않는다** → 코어가 `DEFAULT_HIT_PROFILE`(마우스 값)을 쓴다 = 동작 불변.
      ...(tablet ? { hitProfile: TOUCH_HIT_PROFILE } : {}),
    }),
    [defects, memos, globalStyle, state.floorId, projectId, tablet],
  );

  const memoScreens = useMemo(
    () => memoScreensOf(state.canvas, reduceCtx),
    [state.canvas, reduceCtx],
  );

  const ghost = useMemo(() => ghostOf(state.canvas, reduceCtx), [state.canvas, reduceCtx]);
  // F2 — 사후연결 대기 중인 자유그리기 (아직 어느 결함에도 안 붙었다)
  const pending = useMemo(
    () => pendingGhostsOf(state.canvas, reduceCtx),
    [state.canvas, reduceCtx],
  );
  const pendingCount = state.canvas.pendingSketch?.paths.length ?? 0;

  const editingMemo = useMemo(
    () => memos.find((m) => m.id === state.editingMemoId) ?? null,
    [memos, state.editingMemoId],
  );

  const editingMemoBox = useMemo(
    () => memoScreens.find((m) => m.memoId === state.editingMemoId) ?? null,
    [memoScreens, state.editingMemoId],
  );

  const displayNumbers = useMemo(() => displayNumbersOf(defects), [defects]);

  // F5-1 도곽 — 저장 형태(project-core) → 렌더 형태(canvas-core) 로 잇는다 (D13).
  // ⭐ D16 — 값은 **용역**에서 온다. 도면에서 읽는 것은 `drawingName` 하나뿐.
  //    `tbPreview` 는 다이얼로그가 저장 전에 흘려보낸 임시 값이다(저장소를 안 때린다)
  const titleBlock = useMemo(
    () => titleBlockConfigFor(currentDrawing, project, tbPreview),
    [currentDrawing, project, tbPreview],
  );

  // F5-2 범례 — 행은 저장하지 않고 **이 도면에 실제로 있는 상태**에서 파생한다(D15).
  // 배경 레이어는 뷰포트가 바뀔 때만 다시 그리므로, 행 구성이 실제로 바뀔 때만
  // 새 객체가 나오도록 서명(키)으로 memo 를 건다 — 결함을 옮길 때마다 재렌더하지 않게.
  // ⭐ U-3 로 결함유형 행이 사라져 서명은 **상태 집합** 하나로 좁아졌다.
  const legendSig = useMemo(() => {
    const mine = defects.filter((d) => d.drawingId === currentDrawing?.id);
    return [...new Set(mine.map((d) => d.status))].sort().join('|');
  }, [defects, currentDrawing?.id]);
  const legend = useMemo(
    () => legendConfigFor(currentDrawing, defects, project, lgPreview),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentDrawing?.id, project?.legend, lgPreview, legendSig],
  );

  /** F5-1·F5-2 — 도곽·범례 설정 저장. ProjectSetup 의 같은 이름 함수와 동일한 로직 */
  /**
   * D16 — 저장이 **두 레코드로 갈린다.**
   * 용역 설정(`Project` 1건) + 이 도면의 도면명(`Drawing` 1건). 그 외 도면은 안 건드린다.
   */
  const applyTitleBlock = useCallback(
    (dw: Drawing, tb: ProjectTitleBlock, lg: ProjectLegend, drawingName: string | null) => {
      if (!project) return;
      setTitleBusy(true);
      const now = Date.now();
      const nextProject: Project = { ...project, titleBlock: tb, legend: lg, updatedAt: now };
      // 도면 레코드에는 `drawingName` 만 남는다. 나머지 8필드는 읽히지 않지만
      // **지우지 않는다** — 타입을 유지해 마이그레이션을 0건으로 둔다
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
        setTitling(false);
        toast('도곽 · 범례 설정을 저장했습니다 — 이 용역의 모든 도면에 적용됩니다');
      })();
    },
    [storage, guard, toast, project],
  );

  /**
   * T-8 — 롱프레스로 리사이즈 모드 진입.
   *
   * `1000ms` 동안 `8px` 이내로 버티면 들어간다. 그 전에 움직이면 취소다(U50).
   * ⚠️ 취소된 제스처는 캔버스 팬으로 **넘어가지 않는다** — 이미 발생한 pointerdown 을
   *    다른 요소로 다시 보낼 방법이 없다. 12px 띠 안에서만 생기는 손실이라 감수한다.
   */
  const onResizeDown = useCallback(
    (e: RPointerEvent<HTMLDivElement>) => {
      if (resizeRef.current) return;
      const band = resizeBandRef.current;
      const app = appRef.current;
      if (!band || !app) return;
      // 시작 폭은 **실제 계산값** 하나에서 읽는다 — 미디어쿼리든 저장값이든 이긴 것이 여기 남는다
      const measured = Number.parseFloat(
        window.getComputedStyle(app).getPropertyValue('--inspector-w'),
      );
      const startW = Number.isFinite(measured) ? measured : INSPECTOR_W_MIN;
      const pointerId = e.pointerId;
      resizeRef.current = {
        pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startW,
        armed: false,
        timer: window.setTimeout(() => {
          const st = resizeRef.current;
          if (!st || st.pointerId !== pointerId) return;
          st.armed = true;
          setResizing(true);
          // 손끝에 "잡혔다"를 알린다. 지원하지 않는 기기에서는 조용히 넘어간다
          try {
            navigator.vibrate?.(12);
          } catch {
            /* 진동은 있으면 좋고 없어도 그만이다 */
          }
        }, RESIZE_HOLD_MS),
      };
      band.setPointerCapture(pointerId);
    },
    [],
  );

  const onResizeMove = useCallback(
    (e: RPointerEvent<HTMLDivElement>) => {
      const st = resizeRef.current;
      if (!st || st.pointerId !== e.pointerId) return;
      if (!st.armed) {
        const moved = Math.hypot(e.clientX - st.startX, e.clientY - st.startY);
        if (moved > RESIZE_SLOP_PX) endResize(false);
        return;
      }
      // ⭐ React 상태를 갈지 않는다. CSS 변수만 직접 쓴다 (U51 — 드래그 중 리렌더 0)
      const app = appRef.current;
      if (!app) return;
      // 패널은 오른쪽에 있다 — 왼쪽으로 끌수록 넓어진다
      const next = clampInspectorW(st.startW + (st.startX - e.clientX), window.innerWidth);
      app.style.setProperty('--inspector-w', `${next}px`);
    },
    [endResize],
  );

  const onResizeUp = useCallback(
    (e: RPointerEvent<HTMLDivElement>) => {
      const st = resizeRef.current;
      if (!st || st.pointerId !== e.pointerId) return;
      endResize(true);
    },
    [endResize],
  );

  const onResizeCancel = useCallback(
    (e: RPointerEvent<HTMLDivElement>) => {
      const st = resizeRef.current;
      if (!st || st.pointerId !== e.pointerId) return;
      endResize(false);
    },
    [endResize],
  );

  /**
   * P-1 · F5-3 — 도면 이미지 배율.
   *
   * ## 2026-09-03 — 세 가지가 바뀌었다 (사용자 실사용 지시)
   * 1. **실시간 미리보기** — 슬라이더를 움직이는 대로 캔버스가 바로 바뀐다. 저장은 안 한다
   * 2. **결함·메모 좌표가 도면을 따라간다** — 예전에는 그림만 움직여 표기가 떨어져 나갔다
   * 3. **모든 도면 일괄 적용** — 전체를 120% 로 맞춘 뒤 한 층만 105% 로 다시 조절할 수 있다
   *
   * 미리보기·적용이 **같은 계산**(`computeScale`)을 쓴다. 갈라지면 손을 뗀 순간 그림이 튄다.
   * 그리고 언제나 **다이얼로그를 연 시점의 스냅샷에서** 계산한다 — 직전 미리보기에 누적하면
   * 슬라이더를 왕복할 때마다 배율이 곱해져 어긋난다.
   */
  const scaleSnapshot = useRef<{
    drawings: Drawing[];
    defects: Defect[];
    memos: Memo[];
  } | null>(null);
  /** 미리보기로 합성 캐시를 버린 도면들 — 취소할 때 이것만 되돌리면 된다 */
  const scaleTouched = useRef<Set<string>>(new Set());

  const computeScale = useCallback(
    (raw: number, all: boolean) => {
      const snap = scaleSnapshot.current;
      if (!snap || !currentDrawing) return null;
      const targets = all ? snap.drawings : snap.drawings.filter((d) => d.id === currentDrawing.id);
      const nextDrawings: Drawing[] = [];
      const nextDefects: Defect[] = [];
      const nextMemos: Memo[] = [];
      for (const dw of targets) {
        const r = applyDrawingScale(dw, raw);
        // `imgLayout` 이 없는 옛 도면은 조용히 건너뛴다. 여기서 자동 정규화하면
        // 그 도면의 결함 좌표가 사용자 동의 없이 전부 옮겨진다
        if (!r.ok) continue;
        nextDrawings.push(r.drawing);
        const moved = transformAll(dw.id, r.transform, snap.defects, snap.memos);
        nextDefects.push(...moved.defects);
        nextMemos.push(...moved.memos);
      }
      return { nextDrawings, nextDefects, nextMemos, skipped: targets.length - nextDrawings.length };
    },
    [currentDrawing],
  );

  const paintScale = useCallback(
    (res: { nextDrawings: Drawing[]; nextDefects: Defect[]; nextMemos: Memo[] }, persist: boolean) => {
      const snap = scaleSnapshot.current;
      const byId = new Map(res.nextDrawings.map((d) => [d.id, d]));

      /*
       * `모든 도면` 을 켰다가 다시 끄면, 앞서 미리보기로 바꿔 둔 **다른 도면들**이 그대로 남는다.
       * 적용 대상에서 빠진 것은 스냅샷으로 되돌린다 — 안 그러면 저장은 이 도면만 되는데
       * 화면에는 다른 층도 바뀐 채로 남아 "적용했는데 왜 저장이 안 됐지" 가 된다.
       */
      const revert = [...scaleTouched.current].filter((id) => !byId.has(id));
      const revertSet = new Set(revert);
      if (snap) for (const d of snap.drawings) if (revertSet.has(d.id)) byId.set(d.id, d);

      setDrawings((prev) => prev.map((d) => byId.get(d.id) ?? d));
      for (const id of byId.keys()) releaseComposite(id); // 다시 합성하도록 런타임 캐시만 버린다
      // 되돌린 것은 이미 원본 상태라 더 추적하지 않는다 — 계속 들고 있으면
      // 미리보기 프레임마다 그 도면들의 합성 캐시를 헛되이 버린다
      scaleTouched.current = new Set(res.nextDrawings.map((d) => d.id));

      dispatch({
        t: 'SET_DRAWING_GEOMETRY',
        defects: [
          ...res.nextDefects,
          ...(snap ? snap.defects.filter((d) => revertSet.has(d.drawingId)) : []),
        ],
        memos: [
          ...res.nextMemos,
          ...(snap ? snap.memos.filter((m) => revertSet.has(m.drawingId)) : []),
        ],
        // 되돌린 것까지 저장 대기열에 올려도 값이 원본과 같아 디스크에 쓸 내용이 없다.
        // 다만 `persist` 는 적용 순간에만 true 라 미리보기 중에는 아무것도 안 쓴다
        persist,
      });
    },
    [],
  );

  const openScaling = useCallback(() => {
    scaleSnapshot.current = { drawings, defects: state.defects, memos: state.memos };
    scaleTouched.current = new Set();
    setScaling(true);
  }, [drawings, state.defects, state.memos]);

  /** 취소 — 스냅샷으로 되돌린다. 저장한 적이 없으므로 디스크는 건드릴 것이 없다 */
  const closeScaling = useCallback(() => {
    const snap = scaleSnapshot.current;
    if (snap && scaleTouched.current.size > 0) {
      const byId = new Map(snap.drawings.map((d) => [d.id, d]));
      setDrawings((prev) => prev.map((d) => byId.get(d.id) ?? d));
      for (const id of scaleTouched.current) releaseComposite(id);
      const ids = scaleTouched.current;
      dispatch({
        t: 'SET_DRAWING_GEOMETRY',
        defects: snap.defects.filter((d) => ids.has(d.drawingId)),
        memos: snap.memos.filter((m) => ids.has(m.drawingId)),
        persist: false,
      });
    }
    scaleSnapshot.current = null;
    scaleTouched.current = new Set();
    setScaling(false);
  }, []);

  const previewScale = useCallback(
    (raw: number, all: boolean) => {
      const res = computeScale(raw, all);
      if (res) paintScale(res, false);
    },
    [computeScale, paintScale],
  );

  const applyScale = useCallback(
    (raw: number, all: boolean) => {
      const res = computeScale(raw, all);
      if (!res || res.nextDrawings.length === 0) {
        toast(SCALE_NEEDS_A4_MESSAGE, { kind: 'warn' });
        closeScaling();
        return;
      }
      setScaleBusy(true);
      paintScale(res, true);
      const saved = res.nextDrawings;
      const skipped = res.skipped;
      void (async () => {
        if (storage.phase === 'READY') {
          for (const d of saved) await guard(() => storage.repo.putDrawing(d));
        }
        setScaleBusy(false);
        scaleSnapshot.current = null;
        scaleTouched.current = new Set();
        setScaling(false);
        toast(
          skipped > 0
            ? `${drawingScaleAppliedMessage(clampScale(raw))} — ${skipped}장은 A4 정규화 전이라 건너뛰었습니다`
            : saved.length > 1
              ? `도면 ${saved.length}장의 크기를 ${Math.round(clampScale(raw) * 100)}%로 바꿨습니다`
              : drawingScaleAppliedMessage(clampScale(raw)),
        );
      })();
    },
    [computeScale, paintScale, closeScaling, storage, guard, toast],
  );

  /** F6 — 번호 풍선 크기 조절. `imgScale`(F5-3)과 달리 결함 좌표를 전혀 건드리지 않는다 */
  const setLabelScale = useCallback(
    (next: number) => {
      if (!currentDrawing) return;
      const clamped =
        Math.round(Math.max(LABEL_SCALE_MIN, Math.min(LABEL_SCALE_MAX, next)) * 100) / 100;
      const cur = currentDrawing.labelScale ?? 1;
      if (clamped === cur) return;
      const updated: Drawing = {
        ...currentDrawing,
        labelScale: clamped === 1 ? null : clamped,
        updatedAt: Date.now(),
      };
      setDrawings((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      if (storage.phase === 'READY') void guard(() => storage.repo.putDrawing(updated));
    },
    [currentDrawing, storage, guard],
  );

  const selected = useMemo(
    () => defects.find((d) => d.id === state.canvas.selection.defectId) ?? null,
    [defects, state.canvas.selection.defectId],
  );

  // ── T2-1 태블릿 세로 바텀시트 ───────────────────────────────────────────
  /**
   * 시트 밖 도면을 만지면 PEEK 로 내려간다 (§5-2). **닫지는 않는다** —
   * 결함이 선택돼 있는 한 요약 한 줄은 계속 보인다.
   *
   * `passive` 로 듣기만 한다. 캔버스 제스처(팬 · 핀치 · 표기)는 그대로 코어로 간다.
   */
  useEffect(() => {
    if (!sheetMode) return;
    const el = canvasHostRef.current;
    if (!el) return;
    const onDown = () => setSheetSnap('PEEK');
    el.addEventListener('pointerdown', onDown, { passive: true });
    return () => el.removeEventListener('pointerdown', onDown);
  }, [sheetMode]);

  /**
   * 결함을 새로 고르거나 방금 찍었으면 HALF 로 올린다 — 현장 입력의 90% 가 이 단에서 끝난다(§5-2).
   *
   * 위 캔버스 탭(PEEK)과 **같은 이벤트**에서 함께 일어난다. 순서상 이쪽이 나중이라,
   * 선택이 바뀐 탭은 HALF 로, 선택이 안 바뀐 조작(팬 · 핀치)은 PEEK 로 남는다.
   */
  const sheetDefectRef = useRef<string | null>(null);
  useEffect(() => {
    const id = selected?.id ?? null;
    if (id === sheetDefectRef.current) return;
    sheetDefectRef.current = id;
    if (id !== null && sheetMode) setSheetSnap('HALF');
  }, [selected?.id, sheetMode]);

  // ── D18 유사결함 불러오기 ───────────────────────────────────────────────
  const [similarOpen, setSimilarOpen] = useState(false);

  /**
   * 불러오기 후보 — **이 용역 전체**의 결함이다(현재 도면만이 아니다).
   * 사용자가 "비슷한 유형"을 찾을 때 층을 넘나드는 것이 자연스럽다.
   * 지금 선택된 결함은 뺀다 — 자기 자신을 불러와도 아무 일도 일어나지 않는다.
   *
   * 정렬은 `seq` 내림차순: 최근에 찍은 것이 위로 온다. 방금 입력한 결함을 다시 쓰는
   * 경우가 압도적으로 많다(D9 가 자동 이어받기였던 이유이기도 하다).
   */
  const similarItems = useMemo<SimilarDefectItem[]>(() => {
    const floorName = new Map(floors.map((f) => [f.id, f.name]));
    return state.defects
      .filter((d) => d.id !== selected?.id)
      .map((d) => ({
        id: d.id,
        seq: d.seq,
        memberName: d.memberName,
        defectTypeName: d.defectTypeName,
        floorName: floorName.get(d.floorId) ?? null,
        status: d.status,
      }))
      .sort((a, b) => b.seq - a.seq);
  }, [state.defects, selected?.id, floors]);

  // 선택이 사라지면(결함 삭제·선택 해제) 열려 있던 다이얼로그도 닫는다 —
  // 붙일 대상이 없는 채로 떠 있으면 고르는 순간 아무 일도 안 일어난다
  useEffect(() => {
    if (!selected) setSimilarOpen(false);
  }, [selected]);

  // ── S5 사진 ─────────────────────────────────────────────────────────────
  const photoOps = usePhotos(projectId, loadedPhotos, toast);
  const selectedPhotos = photoOps.photosOf(selected?.id ?? null);

  /**
   * G-8 (T-7) — 사진 추가와 상태 전이를 한 흐름으로 묶는다.
   * 상세기획 §Phase 2-D: *"촬영하는 순간 status = CURRENT, 보라 → 빨강"*.
   *
   * ⚠️ **전이는 사진이 실제로 붙었을 때만** 한다. 파일이 전부 거절됐거나(형식·용량)
   *    저장에 실패했는데 색만 빨갛게 바뀌면 사진 없는 금회차 결함이 보고서로 나간다.
   *    그래서 `addFiles` 가 돌려주는 **등록 장수**를 본다.
   * ⚠️ 여기서 `selected.status` 를 읽어 분기하지 않는다 — `await` 앞뒤로 상태가 바뀔 수 있다.
   *    허용 전이 판정은 최신 상태를 보는 리듀서(`setDefectStatus`)가 한다. 이미 `CURRENT`
   *    이거나 `REPAIRED` 면 조용히 무시되고 토스트도 뜨지 않는다.
   * ⚠️ 이것은 **이번 회차에 새로 찍은 사진**을 붙이는 경로다. 전회차 사진을 복사해 오는
   *    사진 승계(K13)와는 무관하다 — 그쪽은 여전히 막혀 있다.
   */
  const addPhotosTo = useCallback(
    async (defectId: string, files: File[]) => {
      const added = await photoOps.addFiles(defectId, files);
      if (added <= 0) return;
      dispatch({
        t: 'SET_DEFECT_STATUS',
        defectId,
        to: 'CURRENT',
        toast: '이번 회차 사진이 붙어 금회차 결함으로 전환했습니다',
      });
    },
    [photoOps.addFiles],
  );

  // 컨텍스트 플로팅 툴바 위치 — 선택된 표기 아래. 대상을 덮지 않는다
  const toolbarAt = useMemo(() => {
    // 드래그 중에는 툴바를 숨긴다 — 손을 따라다니면 도면을 가린다
    if (!selected || !state.canvas.drawing || state.canvas.drag) return null;
    // T-4 — **새로 그린 직후의 자동 선택에는 띄우지 않는다.** 연속으로 결함을 찍을 때
    //       방금 찍은 자리 위에 툴바가 덮여 다음 위치가 안 보였다. 판정은 스토어에 있다
    //       (생성 커맨드 발생 여부는 리듀서 안에서만 알 수 있다 — `store.ts` `toolbarFor`)
    if (state.toolbarFor !== selected.id) return null;
    const screens = buildScreens({
      drawing: state.canvas.drawing,
      viewport: state.canvas.viewport,
      defects,
      // C-2 — 툴바 위치도 **보이는 풍선**을 기준으로 잡아야 한다. 하드코딩하면 배율에서 어긋난다
      globalStyle,
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
  }, [selected, state.canvas, state.toolbarFor, defects, globalStyle]);

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
    // `data-shell` — T2-1. `pc` 에는 어떤 CSS 규칙도 걸려 있지 않다(styles.css "T2-1" 절)
    <div
      className="app"
      ref={appRef}
      data-sidebar={sidebarOpen ? 'open' : 'closed'}
      data-shell={shell}
      data-resizing={resizing ? 'on' : undefined}
      /* T-8 — 저장된 패널 폭. `null` 이면 스타일시트 기본값이 그대로 이긴다 */
      style={
        canResizeInspector && effectiveInspectorW !== null
          ? ({ '--inspector-w': `${effectiveInspectorW}px` } as CSSProperties)
          : undefined
      }
    >
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
          <button
            type="button"
            className="btn btn--ghost"
            title="이 도면의 도곽(용역명·도면명·축척) 표시 여부와 크기를 설정합니다"
            disabled={!currentDrawing}
            onClick={() => setTitling(true)}
          >
            도곽
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            title="손상결함표 · 결함 리스트 · 사진첩 · 조사위치도를 뽑습니다"
            onClick={() => {
              flush();
              navigate({ name: 'EXPORT', projectId });
            }}
          >
            출력
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

          <div className="btngroup" role="group" aria-label="번호 크기">
            <button
              type="button"
              className="btn btn--icon"
              title="번호 풍선 줄이기"
              aria-label="번호 풍선 줄이기"
              disabled={!currentDrawing}
              onClick={() => setLabelScale((currentDrawing?.labelScale ?? 1) - LABEL_SCALE_STEP)}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <line x1="7.5" y1="10" x2="12.5" y2="10" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </button>
            <span
              className="zoom num"
              title="번호 풍선 크기"
              aria-label={`번호 풍선 크기 ${Math.round((currentDrawing?.labelScale ?? 1) * 100)}퍼센트`}
            >
              {currentDrawing ? `${Math.round((currentDrawing.labelScale ?? 1) * 100)}%` : '—'}
            </span>
            <button
              type="button"
              className="btn btn--icon"
              title="번호 풍선 키우기"
              aria-label="번호 풍선 키우기"
              disabled={!currentDrawing}
              onClick={() => setLabelScale((currentDrawing?.labelScale ?? 1) + LABEL_SCALE_STEP)}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <line x1="7.5" y1="10" x2="12.5" y2="10" stroke="currentColor" strokeWidth="1.4" />
                <line x1="10" y1="7.5" x2="10" y2="12.5" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </button>
          </div>

          <button
            type="button"
            className="btn btn--ghost"
            title="A4 지면 안에서 도면 그림이 차지하는 크기를 바꿉니다 (결함 표기 위치는 그대로)"
            disabled={!currentDrawing}
            onClick={openScaling}
          >
            도면 크기
          </button>
          {/* P-2 (D28) — 번호 풍선을 격자에 맞춰 줄 세운다. 결함점은 안 움직이고
              잠긴 결함(전회차·보수완료)의 번호는 제외된다. Ctrl+Z 한 번에 전부 되돌아간다 */}
          <button
            type="button"
            className="btn btn--ghost"
            title="번호 풍선을 균일한 격자에 맞춰 정렬합니다 (결함 위치는 그대로, Ctrl+Z 로 한 번에 되돌리기)"
            disabled={!currentDrawing}
            onClick={() => dispatch({ t: 'ALIGN_LABELS' })}
          >
            번호 정렬
          </button>
        </div>
      </header>

      <div className="body">
        {/*
          T-8 — 결함정보 패널 경계의 **투명 히트 띠**(12px). 평소에는 아무 일도 하지 않는다.
          1초를 버텨야 리사이즈 모드로 들어간다 — 상시 드래그로 두면 이 띠가 캔버스 우측 끝을
          덮어 결함 표기 오탭이 난다. 가로 태블릿에서만 존재한다(세로는 바텀시트, PC 는 요구 없음)
        */}
        {canResizeInspector && (
          <div
            ref={resizeBandRef}
            className="inspector-resize"
            role="separator"
            aria-orientation="vertical"
            aria-label="결함정보 패널 폭 조절 — 1초간 누르고 있으면 조절 모드로 들어갑니다"
            onPointerDown={onResizeDown}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
            onPointerCancel={onResizeCancel}
          />
        )}
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
            pending={pending}
            displayNumbers={displayNumbers}
            titleBlock={titleBlock}
            legend={legend}
            globalStyle={globalStyle}
            send={send}
            aiming={aimOn}
            hostElRef={canvasHostRef}
            drawingUrl={drawingUrl}
            onUploadDrawing={() => resolvedFloor && goUpload(resolvedFloor.id)}
            reserveBottomPx={sheetBottomPx}
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

            {/* D22 십자선 — **호스트 안**이라 `left:50%/top:50%` 가 곧 합성 탭 좌표다.
                `pointer-events:none` 이므로 입력에는 관여하지 않는다 */}
            {aimOn && <AimCrosshair />}
          </CanvasView>

          {/* `data-floating` 요소는 안전 영역 계산에 들어간다 (§2-10-a) */}
          <div className="stage__palette" data-floating>
            <ToolPalette
              tool={state.canvas.tool}
              disabled={!state.canvas.drawing}
              onChange={(tool) => send({ k: 'SET_TOOL', tool })}
              aimOn={aimOn}
              onToggleAim={() => setAimOn((v) => !v)}
              memoInkColor={state.canvas.memoInkColor}
              onSetMemoInkColor={(color) => send({ k: 'SET_MEMO_INK_COLOR', color })}
            />
          </div>

          {/* T2-3 — 층 전환 보완. Sidebar 트리를 대체하지 않는다(같은 onSelectFloor) */}
          {tablet && (
            <FloorChips
              floors={orderedFloors}
              drawingByFloor={drawingByFloor}
              defectCountByFloor={defectCountByFloor}
              currentFloorId={resolvedFloor?.id ?? ''}
              onSelect={selectFloor}
            />
          )}

          {/* T-9 — 미니맵은 **띄우지 않는다**(사용자 요청: 태블릿에서 도면을 가린다).
              ⚠️ `shell/Minimap.tsx` 는 지우지 않았다(U52) — 되살리려면 이 자리에 다시 걸면 된다.
              이동은 `CENTER_ON_NORM`(코어) 이라 코어 쪽은 손댈 것이 없다 */}

          {/* D22 안내 띠 + `[여기]` — **호스트 밖**에 둔다(엄지가 핀치 접점으로 세어지지 않게).
              `data-floating` 을 붙이지 않는다 — 붙이면 조준을 켤 때마다 도면이 움찔한다 */}
          {aimOn && <AimControls disabled={!state.canvas.drawing} onConfirm={fireAim} />}

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

          {pendingCount > 0 && (
            <div className="stage__pending" data-floating role="status">
              <span className="stage__pending-txt">
                그리기 <b className="num">{pendingCount}</b>획 — 계속 그리거나 완료하세요
              </span>
              <button
                type="button"
                className="btn btn--small btn--primary"
                onClick={() => send({ k: 'PENDING_SKETCH_TO_NEW_DEFECT' })}
              >
                그리기 완료
              </button>
              <button
                type="button"
                className="btn btn--small"
                onClick={() => send({ k: 'CANCEL_PENDING_SKETCH' })}
              >
                취소
              </button>
            </div>
          )}

          <div className="stage__help" data-floating>
            <kbd>휠</kbd> 줌 · <kbd>Space</kbd>드래그 팬 · <kbd>Alt</kbd> 스냅 해제 ·{' '}
            <kbd>Shift</kbd> 축 고정 · 정사각/정원 · <kbd>Ctrl+Z</kbd> 되돌리기
          </div>
        </main>

        {/* T2-1 — **같은 `<Inspector>` 다.** 태블릿 세로에서만 바텀시트에 담기고,
            PC · 태블릿 가로에서는 지금까지처럼 우측 열에 그대로 선다(DOM 변화 0) */}
        <InspectorPlacement
          sheet={sheetMode}
          visible={selected !== null}
          snap={sheetSnap}
          onSnapChange={setSheetSnap}
          onHeightChange={setSheetBottomPx}
        >
          <Inspector
            ref={inspectorRef}
            defect={selected}
            settings={settings}
            saving={state.writes.seq > 0}
            photoSlot={
              selected ? (
                <PhotoSection
                  defectId={selected.id}
                  photos={selectedPhotos}
                  urls={photoOps.urls}
                  ensureUrls={photoOps.ensureUrls}
                  // 전회차 표기는 이 화면에서 값을 고칠 수 없다 — 사진 조작도 마찬가지다
                  disabled={isLocked(selected)}
                  // G-8 (T-7) — 예외는 **사진 추가 하나뿐**이다. 전회차(PREV_PENDING)에는 열어 준다.
                  // 상세기획 §Phase 2-D 의 "촬영하는 순간 CURRENT" 전이는 이 문이 있어야 발동한다
                  addDisabled={!canAddPhotos(selected)}
                  busy={photoOps.busy}
                  rejected={photoOps.rejected}
                  onClearRejected={photoOps.clearRejected}
                  onAdd={(files) => void addPhotosTo(selected.id, files)}
                  onSetPrimary={(photoId) => photoOps.setPrimary(selected.id, photoId)}
                  onRotate={photoOps.rotate}
                  onReplace={(photoId, file) => void photoOps.replaceFile(photoId, file)}
                  onRemove={photoOps.remove}
                  onReorder={(ids) => photoOps.reorder(selected.id, ids)}
                  onCaptionChange={photoOps.setCaption}
                  onCropChange={photoOps.setCrop}
                  onAnnotationsChange={photoOps.setAnnotations}
                />
              ) : null
            }
            onAttrsChange={(attrs) => {
              if (!selected) return;
              dispatch({ t: 'SET_DEFECT_ATTRS', defectId: selected.id, attrs });
              // 구조유형을 바꾸면 그 목록에 없는 부재가 조용히 사라진다(§3-6).
              // 순수 함수(apply.ts)는 문구를 모른다 — 알리는 것은 호출자 몫이다
              if (
                attrs.structureType !== selected.structureType &&
                selected.memberId !== null &&
                attrs.memberId === null
              ) {
                toast(
                  `이 구조유형에는 '${selected.memberName ?? '선택한 부재'}' 가 없어 선택을 해제했습니다`,
                  { kind: 'warn' },
                );
              }
            }}
            onLoadSimilar={() => setSimilarOpen(true)}
            similarCount={similarItems.length}
            onResetLabel={() => selected && send({ k: 'RESET_LABEL', defectId: selected.id })}
            onDelete={() => send({ k: 'DELETE_SELECTION' })}
            // C-5 (D33) — 표기 종류 변경. 허용 여부 판정은 뷰·리듀서 양쪽 다
            // `canSetStatus` 하나만 본다. 색은 status 를 따라 자동으로 바뀐다
            onStatusChange={
              selected
                ? (to) =>
                    dispatch({
                      t: 'SET_DEFECT_STATUS',
                      defectId: selected.id,
                      to,
                      toast: {
                        CURRENT: '결함으로 바꿨습니다',
                        NEW: '신규로 바꿨습니다',
                        PREV_PENDING: '전차로 바꿨습니다 — 값 편집이 잠깁니다',
                        REPAIRED: '보수완료로 바꿨습니다',
                      }[to],
                    })
                : undefined
            }
          />
        </InspectorPlacement>
      </div>

      {/* C-4 — 영역선택 일괄 삭제. 잠긴 결함은 이미 코어가 걸러냈고 그 수만 알려 준다 */}
      {state.confirm && 'defectIds' in state.confirm && (
        <ConfirmDialog
          title={`결함 ${state.confirm.defectIds.length}건을 삭제할까요?`}
          body={
            state.confirm.lockedCount > 0
              ? `결함 ${state.confirm.defectIds.length}건이 삭제됩니다. 선택한 것 중 ${state.confirm.lockedCount}건은 잠겨 있어 그대로 남습니다. 되돌리기로 한 번에 되살릴 수 있습니다.`
              : `결함 ${state.confirm.defectIds.length}건이 삭제됩니다. 되돌리기로 한 번에 되살릴 수 있습니다.`
          }
          confirmLabel="삭제"
          onConfirm={() => {
            const ids = 'defectIds' in state.confirm! ? state.confirm.defectIds : [];
            dispatch({ t: 'CLOSE_CONFIRM' });
            send({ k: 'CONFIRM_DELETE_DEFECTS', defectIds: ids });
          }}
          onCancel={() => dispatch({ t: 'CLOSE_CONFIRM' })}
        />
      )}

      {state.confirm && 'defectId' in state.confirm && (
        <ConfirmDialog
          title="이 결함을 삭제할까요?"
          body={
            state.confirm.reason === 'LAST_MARK'
              ? '마지막 남은 표기입니다. 지우면 결함 1건이 함께 삭제됩니다. 되돌리기로 되살릴 수 있습니다.'
              : '결함 1건이 삭제됩니다. 되돌리기로 되살릴 수 있습니다.'
          }
          confirmLabel="삭제"
          onConfirm={() => {
            const c = state.confirm!;
            dispatch({ t: 'CLOSE_CONFIRM' });
            if ('defectId' in c) send({ k: 'CONFIRM_DELETE_DEFECT', defectId: c.defectId });
          }}
          onCancel={() => dispatch({ t: 'CLOSE_CONFIRM' })}
        />
      )}

      {similarOpen && selected && (
        <SimilarDefectPicker
          items={similarItems}
          onClose={() => setSimilarOpen(false)}
          onPick={(item) => {
            setSimilarOpen(false);
            const src = state.defects.find((d) => d.id === item.id);
            if (!src) return;
            // ⭐ 분류·판정 14필드만 덮어쓴다 — 규모·개소·메모는 사용자가 이미 적었을 수 있고
            //    지우면 불러오기가 손해가 된다 (D18 (a))
            const next = { ...attrsOf(selected), ...pickCarryAttrs(attrsOf(src)) };
            const label = item.memberName ?? item.defectTypeName ?? '선택한 결함';
            dispatch({
              t: 'SET_DEFECT_ATTRS',
              defectId: selected.id,
              attrs: next,
              // 잠긴 결함·변경 없음이면 store 가 조기 반환하고 토스트도 안 뜬다
              // ⚠️ `sizeMode`(규모 입력 방식)는 14필드에 들어 있어 함께 바뀐다.
              //    측정값(폭·길이·면적)은 안 따라오므로 탭이 비어 보인다 — 문구로 미리 알린다
              toast: `${label}(${item.seq}번)의 분류·판정을 불러왔습니다. 규모 입력 방식(폭×길이/면적)도 함께 바뀌니 규모·개소·메모는 다시 입력하세요`,
            });
          }}
        />
      )}

      {titling && currentDrawing && (
        <TitleBlockDialog
          drawing={currentDrawing}
          project={project}
          busy={titleBusy}
          onApply={(tb, lg, name) => applyTitleBlock(currentDrawing, tb, lg, name)}
          onPreview={(tb, lg) => {
            setTbPreview(tb);
            setLgPreview(lg);
          }}
          onClose={() => {
            if (!titleBusy) setTitling(false);
          }}
        />
      )}

      {scaling && currentDrawing && (
        <DrawingScaleDialog
          drawing={currentDrawing}
          defectCount={defects.length}
          busy={scaleBusy}
          otherDrawingCount={drawings.filter((d) => d.id !== currentDrawing.id).length}
          onPreview={previewScale}
          onApply={applyScale}
          onClose={() => {
            if (!scaleBusy) closeScaling();
          }}
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
