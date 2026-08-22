/**
 * 상호작용 상태 머신 — 스펙 §2-3 / §2-5.
 *
 *   (state, InputEvent, ctx) → (state', Command[], Effect[])
 *
 * 경계 규칙: 브라우저 이벤트 타입을 모른다. 어댑터가 정규화된 InputEvent 로 바꿔 넘긴다.
 * 시간·난수도 모른다 — id 생성기는 ctx 로 받는다.
 */
import {
  CLICK_SLOP_PX,
  CREATE_MIN_DRAG_PX,
  LABEL_SOFT_MAX,
  LABEL_SOFT_MIN,
  SKETCH_MAX_POINTS,
  SKETCH_MIN_STEP_PX,
  ZOOM_WHEEL_STEP,
} from './constants.js';
import type { Command } from './commands.js';
import {
  anchorNorm,
  autoLabelNorm,
  centerOfGeometry,
  centerOfMark,
  effectiveLabelNorm,
  isLocked,
  sketchOf,
} from './defectGeom.js';
import type { DefectScreen, PreviewOverride } from './defectGeom.js';
import { clamp, dist, lockAxis, roundNorm, toNorm, toScreen } from './geometry.js';
import { memoScreens, type MemoScreen } from './memoGeom.js';
import {
  clampGeometryInside,
  normalizeRect,
  resizeRect,
  squareTo,
  translateGeometry,
  translatePathInside,
  handleCursor,
} from './shapes.js';
import { hitTest } from './hitTest.js';
import { buildScreens, type GhostShape } from './renderModel.js';
import { buildAlignSnapshot, findAlignSnap } from './snapAlign.js';
import { computeAngleSnap } from './snapAngle.js';
import { resolveSnaps } from './snapResolve.js';
import { patchStyle, resolveStyle } from './style.js';
import type {
  AreaFill,
  AreaShape,
  CanvasState,
  Cursor,
  Defect,
  DragState,
  Effect,
  GlobalStyle,
  Handle,
  InputEvent,
  Keys,
  MarkGeometry,
  MarkType,
  Memo,
  NPoint,
  Part,
  Selection,
  SketchPath,
  Size,
  SPoint,
  Tool,
  Viewport,
} from './types.js';
import { TOOL_MARK_TYPE } from './types.js';
import { applyEnsureVisible, NO_INSETS } from './visibility.js';
import { centerOn, clampPan, fitViewport, zoomAt, zoomAtCenter, zoomLimits } from './viewport.js';

export type ReduceContext = {
  /** 현재 도면의 결함들 */
  defects: readonly Defect[];
  /** 현재 도면의 메모들. **결함이 아니다** — 결함 리스트에 섞지 않는다 (§S2a-1) */
  memos?: readonly Memo[];
  globalStyle: GlobalStyle;
  /** uuid 생성기. 코어는 crypto 를 직접 부르지 않는다 */
  makeId: () => string;
  /** 레코드 타임스탬프. 코어는 Date.now() 를 직접 부르지 않는다 (경계 규칙 1) */
  now?: () => number;
  /** 기기 식별자. 메모 RecordBase 를 채운다 */
  deviceId?: string;
  /** 새 결함이 속할 층. 없으면 빈 문자열 */
  floorId?: string;
  /** 새 결함이 속할 용역. 캔버스는 해석하지 않는 불투명 문자열이다 */
  projectId?: string;
};

export type ReduceResult = {
  state: CanvasState;
  commands: Command[];
  effects: Effect[];
};

export const NO_KEYS: Keys = { space: false, alt: false, shift: false, ctrl: false };

export function initialCanvasState(canvas: Size = { w: 0, h: 0 }): CanvasState {
  return {
    drawing: null,
    canvas,
    safeInsets: { ...NO_INSETS },
    viewport: { zoom: 1, tx: 0, ty: 0 },
    viewports: {},
    tool: 'SELECT',
    selection: { ...NO_SELECTION },
    hover: null,
    drag: null,
    guides: [],
    keys: { ...NO_KEYS },
    cursor: 'default',
    busy: false,
  };
}

// ── 파생 조회 ──────────────────────────────────────────────────────────────

/** 드래그 중 미리보기 위치. 커밋 전까지 문서(Defect[])는 건드리지 않는다 */
export function previewOf(state: CanvasState): PreviewOverride {
  const d = state.drag;
  if (!d || d.kind === 'PAN' || d.kind === 'MOVE_MEMO' || !d.defectId) return null;
  if (d.kind === 'MOVE_LABEL') {
    return { defectId: d.defectId, label: d.previewNorm, markId: null, mark: null };
  }
  if (d.kind === 'MOVE_SKETCH') {
    return {
      defectId: d.defectId,
      label: null,
      markId: null,
      mark: null,
      pathId: d.pathId,
      pathPoints: d.pathPreview,
    };
  }
  if (d.kind === 'MOVE_SHAPE' || d.kind === 'RESIZE_SHAPE') {
    return {
      defectId: d.defectId,
      label: d.labelPreviewNorm,
      markId: d.markId,
      mark: null,
      markGeom: d.geomPreview,
    };
  }
  if (d.kind === 'MOVE_MARK') {
    return {
      defectId: d.defectId,
      label: d.labelPreviewNorm,
      markId: d.markId,
      mark: d.previewNorm,
    };
  }
  return null;
}

/** 메모 이동 미리보기 (스크린 좌표) */
export function memoPreviewOf(state: CanvasState): { memoId: string; pos: SPoint } | null {
  const d = state.drag;
  if (!d || d.kind !== 'MOVE_MEMO' || !d.memoId || !state.drawing) return null;
  const s = toScreen(
    d.previewNorm,
    state.viewport,
    state.drawing.imageWidth,
    state.drawing.imageHeight,
  );
  return { memoId: d.memoId, pos: s };
}

export function screensOf(state: CanvasState, ctx: ReduceContext): DefectScreen[] {
  if (!state.drawing) return [];
  return buildScreens({
    drawing: state.drawing,
    viewport: state.viewport,
    defects: ctx.defects,
    globalStyle: ctx.globalStyle,
    preview: previewOf(state),
  });
}

export function memoScreensOf(state: CanvasState, ctx: ReduceContext): MemoScreen[] {
  if (!state.drawing || !ctx.memos || ctx.memos.length === 0) return [];
  return memoScreens(
    ctx.memos,
    state.viewport,
    state.drawing.imageWidth,
    state.drawing.imageHeight,
    memoPreviewOf(state),
  );
}

/**
 * 생성 중인 도형의 미리보기. 아직 문서에 없으므로 DefectScreen 이 아니다.
 * 어댑터는 `RenderInput.ghost` 에 그대로 넣는다.
 */
export function ghostOf(state: CanvasState, ctx: ReduceContext): GhostShape | null {
  const d = state.drag;
  if (!d || !state.drawing) return null;
  const iw = state.drawing.imageWidth;
  const ih = state.drawing.imageHeight;
  const vp = state.viewport;
  const st = ctx.globalStyle;
  const color = st.statusColor.CURRENT;

  if (d.kind === 'CREATE_SKETCH' && d.pathPreview && d.pathPreview.length >= 2) {
    return {
      k: 'SKETCH',
      points: d.pathPreview.map((n) => toScreen(n, vp, iw, ih)),
      color,
      width: Math.max(1, st.sketchWidth * vp.zoom),
    };
  }
  if (d.kind !== 'CREATE_SHAPE' || !d.geomPreview) return null;
  const g = d.geomPreview;
  if (g.k === 'ARROW') {
    return {
      k: 'ARROW',
      from: toScreen(g.from, vp, iw, ih),
      to: toScreen(g.to, vp, iw, ih),
      color,
      width: Math.max(1, st.markStroke * vp.zoom),
      head: Math.max(6, st.arrowHead * vp.zoom),
    };
  }
  if (g.k === 'AREA_RECT' || g.k === 'AREA_ELLIPSE') {
    const a = toScreen({ x: g.x, y: g.y }, vp, iw, ih);
    return {
      k: g.k,
      rect: { x: a.x, y: a.y, w: g.w * iw * vp.zoom, h: g.h * ih * vp.zoom },
      color,
      width: Math.max(1, st.markStroke * vp.zoom),
      shape: st.areaShape,
    };
  }
  return null;
}

function findDefect(ctx: ReduceContext, id: string | null | undefined): Defect | null {
  if (!id) return null;
  return ctx.defects.find((d) => d.id === id) ?? null;
}

function findMemo(ctx: ReduceContext, id: string | null | undefined): Memo | null {
  if (!id || !ctx.memos) return null;
  return ctx.memos.find((m) => m.id === id) ?? null;
}

function selectionFromHit(hit: {
  defectId: string | null;
  part: Part;
  markId: string | null;
  pathId?: string | null;
  memoId?: string | null;
  handle?: Handle | null;
}): Selection {
  return {
    defectId: hit.defectId,
    part: hit.part,
    markId: hit.markId,
    pathId: hit.pathId ?? null,
    memoId: hit.memoId ?? null,
    handle: hit.handle ?? null,
  };
}

const NO_SELECTION = { defectId: null, part: null, markId: null, pathId: null, memoId: null, handle: null } as const;

// ── 커서 (ui-quality §3) ───────────────────────────────────────────────────
/** 도구를 바꿨는데 커서가 그대로면 사용자는 도구가 안 바뀐 줄 안다 */
const TOOL_CURSOR: Partial<Record<Tool, Cursor>> = {
  POINT: 'crosshair',
  ARROW: 'crosshair',
  AREA_RECT: 'crosshair',
  AREA_ELLIPSE: 'crosshair',
  SKETCH: 'crosshair',
  MEMO: 'text',
};

export function computeCursor(state: CanvasState, ctx: ReduceContext): Cursor {
  if (state.busy) return 'wait';
  if (!state.drawing) return 'default';
  if (state.drag) {
    if (state.drag.kind === 'PAN') return 'grabbing';
    if (state.drag.kind === 'RESIZE_SHAPE' && state.drag.handle) {
      return resizeCursor(state.drag.handle);
    }
    if (state.drag.kind === 'CREATE_SHAPE' || state.drag.kind === 'CREATE_SKETCH') {
      return 'crosshair';
    }
    return 'move';
  }
  if (state.keys.space) return 'grab';
  if (state.hover) {
    if (state.hover.part === 'HANDLE' && state.hover.handle) {
      return resizeCursor(state.hover.handle);
    }
    if (state.hover.part === 'MEMO') return 'move';
    const d = findDefect(ctx, state.hover.defectId);
    if (d && isLocked(d)) return 'pointer'; // 선택만 가능 (A8) — move 라고 거짓말하지 않는다
    if (state.hover.part === 'LEADER') return 'pointer';
    return 'move';
  }
  return TOOL_CURSOR[state.tool] ?? 'grab';
}

function resizeCursor(h: Handle): Cursor {
  if (h === 'FROM' || h === 'TO') return 'crosshair';
  return handleCursor(h);
}

function settle(state: CanvasState, ctx: ReduceContext): CanvasState {
  const cursor = computeCursor(state, ctx);
  return cursor === state.cursor ? state : { ...state, cursor };
}

function ok(state: CanvasState, ctx: ReduceContext, commands: Command[] = [], effects: Effect[] = []): ReduceResult {
  return { state: settle(state, ctx), commands, effects };
}

// ── 뷰포트 헬퍼 ────────────────────────────────────────────────────────────
function withViewport(state: CanvasState, vp: Viewport): CanvasState {
  if (!state.drawing) return { ...state, viewport: vp };
  const clamped = clampPan(vp, state.drawing.imageWidth, state.drawing.imageHeight, state.canvas);
  return {
    ...state,
    viewport: clamped,
    viewports: { ...state.viewports, [state.drawing.id]: clamped },
  };
}

/**
 * "선택한 대상은 항상 화면 안에 있어야 한다" (§2-10).
 * 드래그 중이거나 선택이 없으면 `applyEnsureVisible` 이 그대로 돌려준다.
 */
function keepSelectionVisible(state: CanvasState, ctx: ReduceContext): CanvasState {
  return applyEnsureVisible(state, ctx.defects, ctx.globalStyle, state.selection.defectId);
}

function fitState(state: CanvasState): CanvasState {
  if (!state.drawing || state.canvas.w <= 0 || state.canvas.h <= 0) return state;
  return withViewport(
    state,
    fitViewport(state.drawing.imageWidth, state.drawing.imageHeight, state.canvas),
  );
}

// ── 리듀서 ─────────────────────────────────────────────────────────────────
export function reduce(state: CanvasState, ev: InputEvent, ctx: ReduceContext): ReduceResult {
  switch (ev.k) {
    case 'SET_BUSY':
      return ok({ ...state, busy: ev.busy }, ctx);

    case 'SET_DRAWING': {
      const next: CanvasState = {
        ...state,
        drawing: ev.drawing,
        selection: { ...NO_SELECTION },
        hover: null,
        drag: null,
        guides: [],
      };
      if (!ev.drawing) return ok(next, ctx);
      const remembered = state.viewports[ev.drawing.id];
      const placed = remembered ? withViewport(next, remembered) : fitState(next);
      return ok(keepSelectionVisible(placed, ctx), ctx);
    }

    case 'RESIZE': {
      const next = { ...state, canvas: ev.size };
      if (!next.drawing) return ok(next, ctx);
      const hadViewport = state.canvas.w > 0 && state.canvas.h > 0 && state.viewports[next.drawing.id];
      const sized = hadViewport ? withViewport(next, next.viewport) : fitState(next);
      // 창을 좁혀도 선택 대상이 화면 안에 남는다 (§2-10-b)
      return ok(keepSelectionVisible(sized, ctx), ctx);
    }

    case 'SET_SAFE_INSETS': {
      const i = ev.insets;
      const cur = state.safeInsets;
      if (cur.top === i.top && cur.right === i.right && cur.bottom === i.bottom && cur.left === i.left) {
        return ok(state, ctx);
      }
      return ok(keepSelectionVisible({ ...state, safeInsets: i }, ctx), ctx);
    }

    case 'SET_TOOL':
      return ok({ ...state, tool: ev.tool, drag: null, guides: [] }, ctx);

    case 'FIT':
      return ok(fitState(state), ctx);

    case 'ZOOM_BUTTON': {
      if (!state.drawing) return ok(state, ctx);
      const { min, max } = zoomLimits(
        state.drawing.imageWidth,
        state.drawing.imageHeight,
        state.canvas,
      );
      return ok(withViewport(state, zoomAtCenter(state.viewport, state.canvas, ev.factor, min, max)), ctx);
    }

    case 'WHEEL': {
      if (!state.drawing) return ok(state, ctx);
      // 요소 드래그 중에는 뷰포트를 고정한다. 정렬 스냅샷이 스크린 좌표라 유효성이 깨진다
      if (state.drag && state.drag.kind !== 'PAN') return ok(state, ctx);
      const { min, max } = zoomLimits(
        state.drawing.imageWidth,
        state.drawing.imageHeight,
        state.canvas,
      );
      const factor = ev.deltaY < 0 ? ZOOM_WHEEL_STEP : 1 / ZOOM_WHEEL_STEP;
      return ok(withViewport(state, zoomAt(state.viewport, ev.screen, factor, min, max)), ctx);
    }

    case 'POINTER_DOWN':
      return onPointerDown(state, ev, ctx);

    case 'POINTER_MOVE':
      return onPointerMove(state, ev, ctx);

    case 'POINTER_UP':
      return onPointerUp(state, ev, ctx);

    case 'POINTER_CANCEL':
      return ok({ ...state, drag: null, guides: [] }, ctx);

    case 'POINTER_LEAVE':
      return ok(state.drag ? state : { ...state, hover: null }, ctx);

    case 'DOUBLE_CLICK': {
      if (!state.drawing) return ok(state, ctx);
      const screens = screensOf(state, ctx);
      const hit = hitTest(ev.screen, screens, state.selection, memoScreensOf(state, ctx));
      if (!hit) return ok(fitState(state), ctx);
      // 메모 더블클릭 = 글 고치기 (§S2a-4)
      if (hit.part === 'MEMO' && hit.memoId) {
        return ok(
          { ...state, selection: { ...NO_SELECTION, part: 'MEMO', memoId: hit.memoId } },
          ctx,
          [],
          [{ k: 'EDIT_MEMO', memoId: hit.memoId }],
        );
      }
      if (!hit.defectId) return ok(state, ctx);
      return ok(
        { ...state, selection: selectionFromHit(hit) },
        ctx,
        [],
        [{ k: 'FOCUS_PANEL', defectId: hit.defectId }],
      );
    }

    case 'CONTEXT_MENU': {
      if (!state.drawing) return ok(state, ctx);
      const screens = screensOf(state, ctx);
      const hit = hitTest(ev.screen, screens, state.selection, memoScreensOf(state, ctx));
      if (!hit || !hit.defectId) return ok(state, ctx); // 빈 도면: 기본 메뉴만 차단
      return ok(
        { ...state, selection: selectionFromHit(hit) },
        ctx,
        [],
        [{ k: 'CONTEXT_MENU', screen: ev.screen, defectId: hit.defectId }],
      );
    }

    // ── S2a ────────────────────────────────────────────────────────────────
    case 'SELECT_MEMO': {
      if (!ev.memoId) return ok({ ...state, selection: { ...NO_SELECTION } }, ctx);
      let next: CanvasState = {
        ...state,
        selection: { ...NO_SELECTION, part: 'MEMO', memoId: ev.memoId },
      };
      const memo = findMemo(ctx, ev.memoId);
      if (ev.reveal && state.drawing && memo) {
        next = withViewport(
          next,
          centerOn(
            next.viewport,
            memo.pos,
            state.drawing.imageWidth,
            state.drawing.imageHeight,
            state.canvas,
          ),
        );
      }
      return ok(next, ctx);
    }

    case 'COMMIT_MEMO_TEXT': {
      const memo = findMemo(ctx, ev.memoId);
      if (!memo) return ok(state, ctx);
      const text = ev.text;
      if (text === memo.text) return ok(state, ctx);
      // 빈 메모는 도면 위의 노란 얼룩일 뿐이다. 지운다
      if (text.trim() === '') {
        return ok(
          { ...state, selection: { ...NO_SELECTION }, hover: null },
          ctx,
          [{ k: 'DELETE_MEMO', memo }],
          [{ k: 'TOAST', kind: 'info', text: '빈 메모를 지웠습니다', undoable: true }],
        );
      }
      return ok(
        state,
        ctx,
        [{ k: 'SET_MEMO_TEXT', memoId: memo.id, from: memo.text, to: text }],
        [{ k: 'TOAST', kind: 'info', text: '메모가 저장되었습니다', undoable: true }],
      );
    }

    case 'SET_AREA_STYLE': {
      const d = findDefect(ctx, ev.defectId);
      if (!d || isLocked(d)) return ok(state, ctx);
      const patch: Record<string, unknown> = {};
      if (ev.shape !== undefined) patch.areaShape = ev.shape;
      if (ev.fill !== undefined) patch.areaFill = ev.fill;
      const to = patchStyle(d.style, patch as { areaShape?: AreaShape; areaFill?: AreaFill });
      return ok(
        state,
        ctx,
        [{ k: 'SET_STYLE', defectId: d.id, from: d.style, to }],
        [{ k: 'TOAST', kind: 'info', text: '영역 모양을 바꿨습니다', undoable: true }],
      );
    }

    case 'SET_MARK_COLOR': {
      const d = findDefect(ctx, ev.defectId);
      if (!d || isLocked(d)) return ok(state, ctx);
      const to = patchStyle(d.style, { color: ev.color ?? undefined });
      return ok(
        state,
        ctx,
        [{ k: 'SET_STYLE', defectId: d.id, from: d.style, to }],
        [
          {
            k: 'TOAST',
            kind: 'info',
            text: ev.color ? '색을 바꿨습니다' : '색을 상태 기본값으로 되돌렸습니다',
            undoable: true,
          },
        ],
      );
    }

    case 'RESET_STYLE': {
      const d = findDefect(ctx, ev.defectId);
      if (!d || isLocked(d)) return ok(state, ctx);
      if (d.style === null) {
        return ok(state, ctx, [], [
          { k: 'TOAST', kind: 'info', text: '이미 전체 설정을 따르고 있습니다' },
        ]);
      }
      return ok(
        state,
        ctx,
        [{ k: 'SET_STYLE', defectId: d.id, from: d.style, to: null }],
        [{ k: 'TOAST', kind: 'info', text: '전체 설정으로 되돌렸습니다', undoable: true }],
      );
    }

    case 'SELECT_DEFECT': {
      if (!ev.defectId) {
        return ok({ ...state, selection: { ...NO_SELECTION } }, ctx);
      }
      let next: CanvasState = {
        ...state,
        selection: { ...NO_SELECTION, defectId: ev.defectId, part: 'LABEL' },
      };
      if (ev.reveal && state.drawing) {
        const d = findDefect(ctx, ev.defectId);
        if (d) {
          const a = anchorNorm(d);
          if (a) {
            next = withViewport(
              next,
              centerOn(
                next.viewport,
                a,
                state.drawing.imageWidth,
                state.drawing.imageHeight,
                state.canvas,
              ),
            );
          }
        }
        // 중앙 정렬만으로는 번호 풍선이 떠 있는 UI 뒤에 남을 수 있다.
        // 안전 영역 판정으로 마지막 한 번 더 민다 (§2-10 — 알려진 버그 1)
        next = keepSelectionVisible(next, ctx);
      }
      return ok(next, ctx);
    }

    case 'RESET_LABEL':
      return onResetLabel(state, ev.defectId, ctx);

    case 'DELETE_SELECTION':
      return onDelete(state, ctx);

    case 'CONFIRM_DELETE_DEFECT': {
      const d = findDefect(ctx, ev.defectId);
      if (!d) return ok(state, ctx);
      return ok(
        { ...state, selection: { ...NO_SELECTION }, hover: null },
        ctx,
        [{ k: 'DELETE_DEFECT', defect: d }],
        [{ k: 'TOAST', kind: 'info', text: '결함이 삭제되었습니다', undoable: true }],
      );
    }

    case 'KEY_DOWN':
      return onKeyDown(state, ev.key, ev.keys, ctx);

    case 'KEY_UP':
      return ok({ ...state, keys: ev.keys }, ctx);

    default:
      return ok(state, ctx);
  }
}

// ── POINTER_DOWN ───────────────────────────────────────────────────────────
function onPointerDown(
  state: CanvasState,
  ev: Extract<InputEvent, { k: 'POINTER_DOWN' }>,
  ctx: ReduceContext,
): ReduceResult {
  if (!state.drawing || state.busy) return ok(state, ctx);
  const next0 = { ...state, keys: ev.keys };

  const startPan = (pointToolCandidate: boolean): ReduceResult =>
    ok(
      {
        ...next0,
        drag: newDrag('PAN', ev.pointerId, ev.screen, next0.viewport, {
          pointToolCandidate,
        }),
        guides: [],
      },
      ctx,
    );

  // 중클릭 · Space+좌클릭 → 팬
  if (ev.button === 1 || (ev.button === 0 && ev.keys.space)) return startPan(false);
  if (ev.button !== 0) return ok(next0, ctx);

  /**
   * 생성 도구가 켜져 있으면 **기존 표기를 잡기 전에** 생성을 시작한다.
   * 도구를 켜 놓고 도형 위에서 시작하는 것은 "저 위에 새로 그린다" 는 뜻이지
   * "저것을 옮긴다" 가 아니다.
   */
  const createType = TOOL_MARK_TYPE[next0.tool];
  if (createType && createType !== 'POINT') {
    return startCreateShape(next0, ev.screen, createType, ev.pointerId, ctx);
  }
  if (next0.tool === 'SKETCH') return startCreateSketch(next0, ev.screen, ev.pointerId, ctx);

  const screens = screensOf(next0, ctx);
  const memos = memoScreensOf(next0, ctx);
  const hit = hitTest(ev.screen, screens, next0.selection, memos);

  // 빈 도면 → 팬 드래그. UP 에서 이동이 없었으면 선택 해제(또는 점·메모 도구면 생성)
  if (!hit) return startPan(next0.tool === 'POINT' || next0.tool === 'MEMO');

  // ── 메모 (결함이 아니다) ──────────────────────────────────────────────
  if (hit.part === 'MEMO' && hit.memoId) {
    const memo = findMemo(ctx, hit.memoId);
    const box = memos.find((m) => m.memoId === hit.memoId);
    const picked: CanvasState = {
      ...next0,
      selection: { ...NO_SELECTION, part: 'MEMO', memoId: hit.memoId },
    };
    if (!memo || !box) return ok(picked, ctx);
    const drag: DragState = {
      ...newDrag('MOVE_MEMO', ev.pointerId, ev.screen, next0.viewport, {}),
      memoId: memo.id,
      grabOffsetScreen: { x: box.box.x - ev.screen.x, y: box.box.y - ev.screen.y },
      originNorm: { x: memo.pos.x, y: memo.pos.y },
      previewNorm: { x: memo.pos.x, y: memo.pos.y },
    };
    return ok({ ...picked, drag, guides: [] }, ctx);
  }

  const defect = findDefect(ctx, hit.defectId);
  if (!defect) return startPan(false);

  const selected: CanvasState = {
    ...next0,
    selection: {
      defectId: hit.defectId,
      part: hit.part,
      markId: hit.markId,
      pathId: hit.pathId ?? null,
      handle: hit.handle ?? null,
      memoId: null,
    },
  };

  // 리더선은 드래그 대상이 아니다. 형상이 앵커와 라벨이 결정하는 파생값이므로 (§2-4)
  if (hit.part === 'LEADER') return ok(selected, ctx);

  // 전회차 표기는 선택만 가능 (A8). 커서가 pointer 로 이미 알려주고 있다
  if (isLocked(defect)) return ok(selected, ctx);

  const screen = screens.find((s) => s.defectId === hit.defectId);
  if (!screen) return ok(selected, ctx);

  // ── 자유그리기 — 전체 이동만. 점 단위 편집은 범위 밖 (§S2a-4) ──────────
  if (hit.part === 'SKETCH' && hit.pathId) {
    const path = sketchOf(defect).find((p) => p.id === hit.pathId);
    if (!path) return ok(selected, ctx);
    const drag: DragState = {
      ...newDrag('MOVE_SKETCH', ev.pointerId, ev.screen, next0.viewport, {}),
      defectId: defect.id,
      pathId: path.id,
      originNorm: path.points[0] ?? { x: 0, y: 0 },
      previewNorm: path.points[0] ?? { x: 0, y: 0 },
      pathOrigin: path.points,
      pathPreview: path.points,
    };
    return ok({ ...selected, drag, guides: [] }, ctx);
  }

  // ── 영역 리사이즈 · 화살표 끝점 (§S2a-4) ───────────────────────────────
  if (hit.part === 'HANDLE' && hit.handle && hit.markId) {
    const m = defect.marks.find((x) => x.id === hit.markId);
    if (!m) return ok(selected, ctx);
    const drag: DragState = {
      ...newDrag('RESIZE_SHAPE', ev.pointerId, ev.screen, next0.viewport, {}),
      defectId: defect.id,
      markId: m.id,
      handle: hit.handle,
      geomOrigin: m.geometry,
      geomPreview: m.geometry,
      originNorm: centerOfGeometry(m.geometry) ?? { x: 0, y: 0 },
      previewNorm: centerOfGeometry(m.geometry) ?? { x: 0, y: 0 },
    };
    return ok({ ...selected, drag, guides: [] }, ctx);
  }

  const style = resolveStyle(defect, ctx.globalStyle);
  const iw = state.drawing.imageWidth;
  const ih = state.drawing.imageHeight;

  if (hit.part === 'LABEL') {
    const originNorm = effectiveLabelNorm(defect, style, iw, ih);
    const drag: DragState = {
      ...newDrag('MOVE_LABEL', ev.pointerId, ev.screen, next0.viewport, {}),
      defectId: defect.id,
      markId: null,
      grabOffsetScreen: { x: screen.label.x - ev.screen.x, y: screen.label.y - ev.screen.y },
      originNorm,
      originPlaced: defect.label.placed,
      previewNorm: originNorm,
      anchorScreen: screen.anchor,
      align: buildAlignSnapshot(screens, defect.id),
    };
    return ok({ ...selected, drag, guides: [] }, ctx);
  }

  // MARK
  const mark = defect.marks.find((m) => m.id === hit.markId);
  const center = mark ? centerOfMark(mark) : null;
  const ms = screen.marks.find((m) => m.id === hit.markId);
  if (!mark || !center || !ms) return ok(selected, ctx);

  // ARROW · AREA_* 전체 이동 (§S2a-4)
  if (mark.geometry.k !== 'POINT') {
    const drag: DragState = {
      ...newDrag('MOVE_SHAPE', ev.pointerId, ev.screen, next0.viewport, {}),
      defectId: defect.id,
      markId: mark.id,
      grabOffsetScreen: { x: ms.center.x - ev.screen.x, y: ms.center.y - ev.screen.y },
      originNorm: center,
      originPlaced: defect.label.placed,
      previewNorm: center,
      geomOrigin: mark.geometry,
      geomPreview: mark.geometry,
      // placed=false 면 라벨은 앵커에서 자동 파생되므로 따로 옮길 필요가 없다
      labelOriginNorm: defect.label.placed ? { x: defect.label.x, y: defect.label.y } : null,
      labelPreviewNorm: defect.label.placed ? { x: defect.label.x, y: defect.label.y } : null,
    };
    return ok({ ...selected, drag, guides: [] }, ctx);
  }

  const drag: DragState = {
    ...newDrag('MOVE_MARK', ev.pointerId, ev.screen, next0.viewport, {}),
    defectId: defect.id,
    markId: mark.id,
    grabOffsetScreen: { x: ms.center.x - ev.screen.x, y: ms.center.y - ev.screen.y },
    originNorm: center,
    originPlaced: defect.label.placed,
    previewNorm: center,
    // placed=false 면 라벨은 앵커에서 자동 파생되므로 따로 옮길 필요가 없다
    labelOriginNorm: defect.label.placed ? { x: defect.label.x, y: defect.label.y } : null,
    labelPreviewNorm: defect.label.placed ? { x: defect.label.x, y: defect.label.y } : null,
  };
  return ok({ ...selected, drag, guides: [] }, ctx);
}

// ── 생성 드래그 시작 (§S2a-2) ──────────────────────────────────────────────
/**
 * 방향 · 영역: 누른 지점이 꼬리(또는 한 모서리).
 * 도면 **밖**에서 시작하면 만들지 않는다 — 마크는 [0,1] 클램프 대상이다 (불변식 #1).
 */
function startCreateShape(
  state: CanvasState,
  screen: SPoint,
  type: MarkType,
  pointerId: number,
  ctx: ReduceContext,
): ReduceResult {
  if (!state.drawing) return ok(state, ctx);
  const n = toNorm(screen, state.viewport, state.drawing.imageWidth, state.drawing.imageHeight);
  if (n.x < 0 || n.x > 1 || n.y < 0 || n.y > 1) {
    return ok(state, ctx, [], [{ k: 'TOAST', kind: 'warn', text: '도면 안쪽에서 시작해 주세요' }]);
  }
  const drag: DragState = {
    ...newDrag('CREATE_SHAPE', pointerId, screen, state.viewport, {}),
    createStart: n,
    createType: type,
    geomPreview: shapeFrom(type, n, n),
  };
  return ok({ ...state, drag, guides: [], selection: { ...NO_SELECTION } }, ctx);
}

function startCreateSketch(
  state: CanvasState,
  screen: SPoint,
  pointerId: number,
  ctx: ReduceContext,
): ReduceResult {
  if (!state.drawing) return ok(state, ctx);
  const n = toNorm(screen, state.viewport, state.drawing.imageWidth, state.drawing.imageHeight);
  if (n.x < 0 || n.x > 1 || n.y < 0 || n.y > 1) {
    return ok(state, ctx, [], [{ k: 'TOAST', kind: 'warn', text: '도면 안쪽에서 시작해 주세요' }]);
  }
  const drag: DragState = {
    ...newDrag('CREATE_SKETCH', pointerId, screen, state.viewport, {}),
    createStart: n,
    pathPreview: [n],
  };
  return ok({ ...state, drag, guides: [] }, ctx);
}

/** 시작점·끝점(정규화)에서 타입별 기하를 만든다 */
function shapeFrom(type: MarkType, a: NPoint, b: NPoint): MarkGeometry {
  if (type === 'ARROW') return { k: 'ARROW', from: { ...a }, to: { ...b } };
  const r = normalizeRect(a.x, a.y, b.x, b.y);
  if (type === 'AREA_ELLIPSE') return { k: 'AREA_ELLIPSE', x: r.x, y: r.y, w: r.w, h: r.h };
  return { k: 'AREA_RECT', x: r.x, y: r.y, w: r.w, h: r.h };
}

function newDrag(
  kind: DragState['kind'],
  pointerId: number,
  startScreen: SPoint,
  startViewport: Viewport,
  extra: Partial<DragState>,
): DragState {
  return {
    kind,
    pointerId,
    startScreen,
    startViewport,
    grabOffsetScreen: { x: 0, y: 0 },
    originNorm: { x: 0, y: 0 },
    originPlaced: false,
    defectId: null,
    markId: null,
    labelOriginNorm: null,
    previewNorm: { x: 0, y: 0 },
    labelPreviewNorm: null,
    anchorScreen: null,
    align: null,
    snapState: { x: null, y: null, angle: null },
    moved: false,
    pointToolCandidate: false,
    createStart: null,
    createType: null,
    geomPreview: null,
    geomOrigin: null,
    handle: null,
    pathId: null,
    pathOrigin: null,
    pathPreview: null,
    memoId: null,
    ...extra,
  };
}

// ── POINTER_MOVE ───────────────────────────────────────────────────────────
function onPointerMove(
  state: CanvasState,
  ev: Extract<InputEvent, { k: 'POINTER_MOVE' }>,
  ctx: ReduceContext,
): ReduceResult {
  if (!state.drawing) return ok(state, ctx);
  const drag = state.drag;

  if (!drag) {
    const screens = screensOf(state, ctx);
    const hit = hitTest(ev.screen, screens, state.selection, memoScreensOf(state, ctx));
    const hover = hit
      ? {
          defectId: hit.defectId,
          part: hit.part,
          markId: hit.markId,
          pathId: hit.pathId ?? null,
          memoId: hit.memoId ?? null,
          handle: hit.handle ?? null,
        }
      : null;
    const same =
      (hover === null && state.hover === null) ||
      (hover !== null &&
        state.hover !== null &&
        hover.defectId === state.hover.defectId &&
        hover.part === state.hover.part &&
        hover.markId === state.hover.markId &&
        hover.pathId === (state.hover.pathId ?? null) &&
        hover.memoId === (state.hover.memoId ?? null) &&
        hover.handle === (state.hover.handle ?? null));
    const next = { ...state, keys: ev.keys };
    return ok(same ? next : { ...next, hover }, ctx);
  }

  if (drag.pointerId !== ev.pointerId) return ok(state, ctx);

  const moved = drag.moved || dist(ev.screen, drag.startScreen) > CLICK_SLOP_PX;
  const iw = state.drawing.imageWidth;
  const ih = state.drawing.imageHeight;

  if (drag.kind === 'PAN') {
    const vp: Viewport = {
      zoom: drag.startViewport.zoom,
      tx: drag.startViewport.tx + (ev.screen.x - drag.startScreen.x),
      ty: drag.startViewport.ty + (ev.screen.y - drag.startScreen.y),
    };
    return ok(withViewport({ ...state, keys: ev.keys, drag: { ...drag, moved } }, vp), ctx);
  }

  // ── S2a — 생성 · 도형 편집 ────────────────────────────────────────────────
  if (drag.kind === 'CREATE_SHAPE') {
    const start = drag.createStart;
    const type = drag.createType;
    if (!start || !type) return ok(state, ctx);
    const startS = toScreen(start, state.viewport, iw, ih);
    // Shift = 정사각/정원(영역) · 축 고정(방향). **스크린에서** 판정해야 화면에서 반듯하다
    let endS: SPoint = ev.screen;
    if (ev.keys.shift) endS = type === 'ARROW' ? lockAxis(endS, startS) : squareTo(startS, endS);
    const endN = toNorm(endS, state.viewport, iw, ih);
    const clampedEnd: NPoint = { x: clamp(endN.x, 0, 1), y: clamp(endN.y, 0, 1) };
    return ok(
      {
        ...state,
        keys: ev.keys,
        guides: [],
        drag: { ...drag, moved, geomPreview: shapeFrom(type, start, clampedEnd) },
      },
      ctx,
    );
  }

  if (drag.kind === 'CREATE_SKETCH') {
    const pts = drag.pathPreview ?? [];
    const last = pts[pts.length - 1];
    const lastS = last ? toScreen(last, state.viewport, iw, ih) : null;
    // 점 폭증 방지 — 일정 거리 이상 움직였을 때만 채택한다
    if (lastS && dist(ev.screen, lastS) < SKETCH_MIN_STEP_PX) {
      return ok({ ...state, keys: ev.keys, drag: { ...drag, moved } }, ctx);
    }
    if (pts.length >= SKETCH_MAX_POINTS) {
      return ok({ ...state, keys: ev.keys, drag: { ...drag, moved } }, ctx);
    }
    const n = toNorm(ev.screen, state.viewport, iw, ih);
    const next: NPoint = { x: clamp(n.x, 0, 1), y: clamp(n.y, 0, 1) };
    return ok(
      { ...state, keys: ev.keys, guides: [], drag: { ...drag, moved, pathPreview: [...pts, next] } },
      ctx,
    );
  }

  if (drag.kind === 'MOVE_SHAPE') {
    const origin = drag.geomOrigin;
    if (!origin) return ok(state, ctx);
    const startCenterS: SPoint = {
      x: drag.startScreen.x + drag.grabOffsetScreen.x,
      y: drag.startScreen.y + drag.grabOffsetScreen.y,
    };
    let centerS: SPoint = {
      x: ev.screen.x + drag.grabOffsetScreen.x,
      y: ev.screen.y + drag.grabOffsetScreen.y,
    };
    if (ev.keys.shift) centerS = lockAxis(centerS, startCenterS);
    const centerN = toNorm(centerS, state.viewport, iw, ih);
    const dx = centerN.x - drag.originNorm.x;
    const dy = centerN.y - drag.originNorm.y;
    const movedGeom = clampGeometryInside(translateGeometry(origin, dx, dy));
    // 실제 적용된 델타로 라벨을 따라 옮긴다 (A2). 클램프로 잘린 만큼도 그대로 반영된다
    const applied = deltaOf(origin, movedGeom);
    const labelPreview =
      drag.labelOriginNorm !== null
        ? softClampLabel({
            x: drag.labelOriginNorm.x + applied.dx,
            y: drag.labelOriginNorm.y + applied.dy,
          })
        : null;
    return ok(
      {
        ...state,
        keys: ev.keys,
        guides: [],
        drag: { ...drag, moved, geomPreview: movedGeom, labelPreviewNorm: labelPreview },
      },
      ctx,
    );
  }

  if (drag.kind === 'RESIZE_SHAPE') {
    const origin = drag.geomOrigin;
    const handle = drag.handle;
    if (!origin || !handle) return ok(state, ctx);
    const n = toNorm(ev.screen, state.viewport, iw, ih);
    const at: NPoint = { x: clamp(n.x, 0, 1), y: clamp(n.y, 0, 1) };
    let next: MarkGeometry = origin;
    if (origin.k === 'ARROW') {
      next =
        handle === 'FROM'
          ? { k: 'ARROW', from: at, to: origin.to }
          : { k: 'ARROW', from: origin.from, to: at };
    } else if (origin.k === 'AREA_RECT' || origin.k === 'AREA_ELLIPSE') {
      // 리사이즈는 **스크린에서** 계산한다. 정규화 공간에서 Shift 정사각을 하면 화면에서 안 반듯하다
      const o = toScreen({ x: origin.x, y: origin.y }, state.viewport, iw, ih);
      const rectS = {
        x: o.x,
        y: o.y,
        w: origin.w * iw * state.viewport.zoom,
        h: origin.h * ih * state.viewport.zoom,
      };
      const r = resizeRect(rectS, handle, toScreen(at, state.viewport, iw, ih));
      const a = toNorm({ x: r.x, y: r.y }, state.viewport, iw, ih);
      const b = toNorm({ x: r.x + r.w, y: r.y + r.h }, state.viewport, iw, ih);
      next = {
        k: origin.k,
        x: clamp(a.x, 0, 1),
        y: clamp(a.y, 0, 1),
        w: clamp(b.x, 0, 1) - clamp(a.x, 0, 1),
        h: clamp(b.y, 0, 1) - clamp(a.y, 0, 1),
      };
    }
    // 리사이즈는 라벨을 옮기지 않는다. 크기가 바뀐 것이지 위치가 통째로 바뀐 게 아니다
    return ok(
      { ...state, keys: ev.keys, guides: [], drag: { ...drag, moved, geomPreview: next } },
      ctx,
    );
  }

  if (drag.kind === 'MOVE_SKETCH') {
    const origin = drag.pathOrigin;
    if (!origin) return ok(state, ctx);
    const startN = toNorm(drag.startScreen, state.viewport, iw, ih);
    let cur: SPoint = ev.screen;
    if (ev.keys.shift) cur = lockAxis(cur, drag.startScreen);
    const curN = toNorm(cur, state.viewport, iw, ih);
    const pts = translatePathInside(origin, curN.x - startN.x, curN.y - startN.y);
    return ok(
      { ...state, keys: ev.keys, guides: [], drag: { ...drag, moved, pathPreview: pts } },
      ctx,
    );
  }

  if (drag.kind === 'MOVE_MEMO') {
    let at: SPoint = {
      x: ev.screen.x + drag.grabOffsetScreen.x,
      y: ev.screen.y + drag.grabOffsetScreen.y,
    };
    if (ev.keys.shift) {
      at = lockAxis(at, {
        x: drag.startScreen.x + drag.grabOffsetScreen.x,
        y: drag.startScreen.y + drag.grabOffsetScreen.y,
      });
    }
    const n = toNorm(at, state.viewport, iw, ih);
    // 메모는 결함이 아니므로 [0,1] 강제 클램프 대상이 아니다. 라벨과 같은 소프트 리밋을 쓴다
    return ok(
      { ...state, keys: ev.keys, guides: [], drag: { ...drag, moved, previewNorm: softClampLabel(n) } },
      ctx,
    );
  }

  const startCenter: SPoint = {
    x: drag.startScreen.x + drag.grabOffsetScreen.x,
    y: drag.startScreen.y + drag.grabOffsetScreen.y,
  };
  let raw: SPoint = {
    x: ev.screen.x + drag.grabOffsetScreen.x,
    y: ev.screen.y + drag.grabOffsetScreen.y,
  };
  if (ev.keys.shift) raw = lockAxis(raw, startCenter);

  if (drag.kind === 'MOVE_MARK') {
    // 마크 드래그에는 스냅을 적용하지 않는다. 결함의 실제 위치이므로 끌려가면 안 된다 (§2-8-d)
    const n = toNorm(raw, state.viewport, iw, ih);
    const clamped: NPoint = { x: clamp(n.x, 0, 1), y: clamp(n.y, 0, 1) };
    const labelPreview =
      drag.labelOriginNorm !== null
        ? softClampLabel({
            x: drag.labelOriginNorm.x + (clamped.x - drag.originNorm.x),
            y: drag.labelOriginNorm.y + (clamped.y - drag.originNorm.y),
          })
        : null;
    return ok(
      {
        ...state,
        keys: ev.keys,
        guides: [],
        drag: { ...drag, moved, previewNorm: clamped, labelPreviewNorm: labelPreview },
      },
      ctx,
    );
  }

  // MOVE_LABEL — 정렬 스냅 + 각도 스냅
  if (ev.keys.alt) {
    return ok(
      {
        ...state,
        keys: ev.keys,
        guides: [],
        drag: {
          ...drag,
          moved,
          previewNorm: softClampLabel(toNorm(raw, state.viewport, iw, ih)),
          snapState: { x: null, y: null, angle: null },
        },
      },
      ctx,
    );
  }

  const ax = drag.align ? findAlignSnap(raw.x, drag.align.xs, drag.snapState.x) : null;
  const ay = drag.align ? findAlignSnap(raw.y, drag.align.ys, drag.snapState.y) : null;
  const ang = drag.anchorScreen
    ? computeAngleSnap(drag.anchorScreen, raw, drag.snapState.angle, false)
    : null;

  const { pos, guides } = resolveSnaps(raw, ax, ay, ang, drag.align, drag.anchorScreen);

  return ok(
    {
      ...state,
      keys: ev.keys,
      guides,
      drag: {
        ...drag,
        moved,
        previewNorm: softClampLabel(toNorm(pos, state.viewport, iw, ih)),
        snapState: { x: ax, y: ay, angle: ang },
      },
    },
    ctx,
  );
}

/** 두 기하의 평행이동 델타. 클램프로 잘린 뒤의 **실제** 이동량을 얻는다 */
function deltaOf(a: MarkGeometry, b: MarkGeometry): { dx: number; dy: number } {
  const ca = centerOfGeometry(a);
  const cb = centerOfGeometry(b);
  if (!ca || !cb) return { dx: 0, dy: 0 };
  return { dx: cb.x - ca.x, dy: cb.y - ca.y };
}

/** 라벨은 클램프하지 않는다. 대신 소프트 리밋 밖으로는 드래그되지 않는다 (§2-1-a) */
function softClampLabel(n: NPoint): NPoint {
  return {
    x: clamp(n.x, LABEL_SOFT_MIN, LABEL_SOFT_MAX),
    y: clamp(n.y, LABEL_SOFT_MIN, LABEL_SOFT_MAX),
  };
}

// ── POINTER_UP ─────────────────────────────────────────────────────────────
function onPointerUp(
  state: CanvasState,
  ev: Extract<InputEvent, { k: 'POINTER_UP' }>,
  ctx: ReduceContext,
): ReduceResult {
  const drag = state.drag;
  if (!drag || drag.pointerId !== ev.pointerId) return ok({ ...state, keys: ev.keys }, ctx);

  const cleared: CanvasState = { ...state, keys: ev.keys, drag: null, guides: [] };

  if (drag.kind === 'PAN') {
    if (drag.moved) return ok(cleared, ctx);
    // 이동 없는 클릭
    if (drag.pointToolCandidate && state.drawing) {
      if (state.tool === 'POINT') return createDefectAt(cleared, ev.screen, ctx);
      if (state.tool === 'MEMO') return createMemoAt(cleared, ev.screen, ctx);
    }
    return ok({ ...cleared, selection: { ...NO_SELECTION } }, ctx);
  }

  // ── S2a 커밋 ─────────────────────────────────────────────────────────────
  if (drag.kind === 'CREATE_SHAPE') return commitCreateShape(cleared, drag, ctx);
  if (drag.kind === 'CREATE_SKETCH') return commitCreateSketch(cleared, drag, ctx);

  if (drag.kind === 'MOVE_MEMO') {
    const memo = findMemo(ctx, drag.memoId);
    if (!memo || !drag.moved) return ok(cleared, ctx);
    return ok(
      cleared,
      ctx,
      [
        {
          k: 'MOVE_MEMO',
          memoId: memo.id,
          from: roundNorm(memo.pos),
          to: roundNorm(drag.previewNorm),
        },
      ],
      [{ k: 'TOAST', kind: 'info', text: '메모를 옮겼습니다', undoable: true }],
    );
  }

  if (!drag.moved || !drag.defectId) return ok(cleared, ctx);

  const defect = findDefect(ctx, drag.defectId);
  if (!defect) return ok(cleared, ctx);

  if (drag.kind === 'MOVE_SHAPE' || drag.kind === 'RESIZE_SHAPE') {
    const mark = defect.marks.find((m) => m.id === drag.markId);
    if (!mark || !drag.geomOrigin || !drag.geomPreview) return ok(cleared, ctx);
    const to = roundGeometry(drag.geomPreview);
    // 0 크기로 줄여 놓고 손을 떼면 되돌린다. 보이지 않는 도형은 지울 수도 없다
    if (isDegenerate(to)) {
      return ok(cleared, ctx, [], [
        { k: 'TOAST', kind: 'warn', text: '너무 작아 적용하지 않았습니다' },
      ]);
    }
    const moveLabel = drag.kind === 'MOVE_SHAPE';
    return ok(
      cleared,
      ctx,
      [
        {
          k: 'SET_MARK_GEOMETRY',
          defectId: defect.id,
          markId: mark.id,
          from: roundGeometry(drag.geomOrigin),
          to,
          labelFrom: moveLabel && drag.labelOriginNorm ? roundNorm(drag.labelOriginNorm) : null,
          labelTo: moveLabel && drag.labelPreviewNorm ? roundNorm(drag.labelPreviewNorm) : null,
        },
      ],
      [
        {
          k: 'TOAST',
          kind: 'info',
          text: moveLabel ? '표기 위치가 변경되었습니다' : '표기 크기가 변경되었습니다',
          undoable: true,
        },
      ],
    );
  }

  if (drag.kind === 'MOVE_SKETCH') {
    if (!drag.pathId || !drag.pathOrigin || !drag.pathPreview) return ok(cleared, ctx);
    return ok(
      cleared,
      ctx,
      [
        {
          k: 'MOVE_SKETCH',
          defectId: defect.id,
          pathId: drag.pathId,
          from: drag.pathOrigin.map(roundNorm),
          to: drag.pathPreview.map(roundNorm),
        },
      ],
      [{ k: 'TOAST', kind: 'info', text: '그리기를 옮겼습니다', undoable: true }],
    );
  }

  if (drag.kind === 'MOVE_LABEL') {
    const to = roundNorm(drag.previewNorm);
    const cmd: Command = {
      k: 'MOVE_LABEL',
      defectId: defect.id,
      from: roundNorm({ x: defect.label.x, y: defect.label.y }),
      to,
      fromPlaced: defect.label.placed,
      toPlaced: true, // 사용자가 한 번이라도 옮기면 placed = true (B14)
    };
    return ok(cleared, ctx, [cmd], [{ k: 'TOAST', kind: 'info', text: '번호 위치가 변경되었습니다', undoable: true }]);
  }

  // MOVE_MARK
  const mark = defect.marks.find((m) => m.id === drag.markId);
  if (!mark || mark.geometry.k !== 'POINT') return ok(cleared, ctx);
  const cmd: Command = {
    k: 'MOVE_MARK',
    defectId: defect.id,
    markId: mark.id,
    from: roundNorm({ x: mark.geometry.x, y: mark.geometry.y }),
    to: roundNorm(drag.previewNorm),
    labelFrom: drag.labelOriginNorm ? roundNorm(drag.labelOriginNorm) : null,
    labelTo: drag.labelPreviewNorm ? roundNorm(drag.labelPreviewNorm) : null,
  };
  return ok(cleared, ctx, [cmd], [{ k: 'TOAST', kind: 'info', text: '표기 위치가 변경되었습니다', undoable: true }]);
}

// ── 점 마커 생성 (T11 · D3) ────────────────────────────────────────────────
function createDefectAt(state: CanvasState, screen: SPoint, ctx: ReduceContext): ReduceResult {
  if (!state.drawing) return ok(state, ctx);
  const iw = state.drawing.imageWidth;
  const ih = state.drawing.imageHeight;
  const n = toNorm(screen, state.viewport, iw, ih);

  // 마크는 [0,1] 클램프 대상이다. 도면 밖 클릭은 결함의 실제 위치가 될 수 없으므로 무시한다
  if (n.x < 0 || n.x > 1 || n.y < 0 || n.y > 1) {
    return ok(state, ctx, [], [{ k: 'TOAST', kind: 'warn', text: '도면 안쪽을 클릭해 주세요' }]);
  }

  const defectId = ctx.makeId();
  const markId = ctx.makeId();
  const at = roundNorm(n);

  let maxSeq = 0;
  for (const d of ctx.defects) if (d.seq > maxSeq) maxSeq = d.seq;

  const balloonRadius = ctx.globalStyle.balloonRadius;
  const auto = roundNorm(autoLabelNorm(at, balloonRadius, iw, ih));

  const defect: Defect = {
    id: defectId,
    projectId: ctx.projectId ?? '',
    drawingId: state.drawing.id,
    floorId: ctx.floorId ?? '',
    seq: maxSeq + 1,
    status: 'CURRENT',
    marks: [
      { id: markId, defectId, type: 'POINT', geometry: { k: 'POINT', x: at.x, y: at.y }, sortOrder: 0 },
    ],
    label: { defectId, x: auto.x, y: auto.y, anchorMarkId: markId, placed: false },
    sketch: [],
    style: null,
    // D3: 부재·결함유형이 비어 있어도 된다. 미완성 여부는 isIncomplete() 로 파생한다
    memberName: null,
    defectTypeName: null,
    widthMm: null,
    lengthMm: null,
    areaM2: null,
    countEa: null,
    memo: null,
  };

  return ok(
    { ...state, selection: { defectId, part: 'MARK', markId } },
    ctx,
    [{ k: 'CREATE_DEFECT', defect }],
    [
      { k: 'TOAST', kind: 'info', text: '표기가 추가되었습니다', undoable: true },
      { k: 'REVEAL_DEFECT', defectId },
    ],
  );
}

// ── 방향 · 영역 생성 커밋 (§S2a-2) ─────────────────────────────────────────
function commitCreateShape(
  state: CanvasState,
  drag: DragState,
  ctx: ReduceContext,
): ReduceResult {
  if (!state.drawing || !drag.createType || !drag.geomPreview || !drag.createStart) {
    return ok(state, ctx);
  }
  const iw = state.drawing.imageWidth;
  const ih = state.drawing.imageHeight;

  // 드래그 거리가 최소 임계값 미만이면 **생성을 취소한다.** 실수 클릭 방지 (§S2a-2)
  const g = drag.geomPreview;
  const a = g.k === 'ARROW' ? g.from : { x: g.k === 'POINT' ? g.x : g.x, y: g.k === 'POINT' ? g.y : g.y };
  const b =
    g.k === 'ARROW'
      ? g.to
      : g.k === 'AREA_RECT' || g.k === 'AREA_ELLIPSE'
        ? { x: g.x + g.w, y: g.y + g.h }
        : a;
  const aS = toScreen(a, state.viewport, iw, ih);
  const bS = toScreen(b, state.viewport, iw, ih);
  if (dist(aS, bS) < CREATE_MIN_DRAG_PX) {
    return ok(state, ctx, [], [
      { k: 'TOAST', kind: 'warn', text: '끌어서 크기를 지정해 주세요' },
    ]);
  }

  const defectId = ctx.makeId();
  const markId = ctx.makeId();
  const geometry = roundGeometry(g);
  const anchor = centerOfGeometry(geometry);
  if (!anchor) return ok(state, ctx);

  let maxSeq = 0;
  for (const d of ctx.defects) if (d.seq > maxSeq) maxSeq = d.seq;
  const auto = roundNorm(autoLabelNorm(anchor, ctx.globalStyle.balloonRadius, iw, ih));

  const defect: Defect = {
    id: defectId,
    projectId: ctx.projectId ?? '',
    drawingId: state.drawing.id,
    floorId: ctx.floorId ?? '',
    seq: maxSeq + 1,
    status: 'CURRENT',
    marks: [{ id: markId, defectId, type: drag.createType, geometry, sortOrder: 0 }],
    label: { defectId, x: auto.x, y: auto.y, anchorMarkId: markId, placed: false },
    sketch: [],
    style: null,
    // D3: 부재·결함유형이 비어 있어도 된다. 미완성 여부는 isIncomplete() 로 파생한다
    memberName: null,
    defectTypeName: null,
    widthMm: null,
    lengthMm: null,
    areaM2: null,
    countEa: null,
    memo: null,
  };

  return ok(
    { ...state, selection: { ...NO_SELECTION, defectId, part: 'MARK', markId } },
    ctx,
    [{ k: 'CREATE_DEFECT', defect }],
    [
      { k: 'TOAST', kind: 'info', text: '표기가 추가되었습니다', undoable: true },
      { k: 'REVEAL_DEFECT', defectId },
    ],
  );
}

/**
 * 자유그리기 커밋 — **선택된 결함에 붙인다** (§S2a-1 "결함번호와 연동된다").
 *
 * 상세기획 §3-3 에서 `marks` 는 1개 이상이 필수다. 그래서 스케치만으로는
 * 유효한 결함을 만들 수 없다. 선택된 결함이 없으면 만들지 않고 안내한다.
 * → ASSUMPTIONS E1 / QUESTIONS Q16 (비차단)
 */
function commitCreateSketch(
  state: CanvasState,
  drag: DragState,
  ctx: ReduceContext,
): ReduceResult {
  const pts = drag.pathPreview ?? [];
  if (pts.length < 2) {
    return ok(state, ctx, [], [{ k: 'TOAST', kind: 'warn', text: '끌어서 선을 그려 주세요' }]);
  }
  const target = findDefect(ctx, state.selection.defectId);
  if (!target) {
    return ok(state, ctx, [], [
      {
        k: 'TOAST',
        kind: 'warn',
        text: '그리기를 붙일 결함을 먼저 선택해 주세요',
      },
    ]);
  }
  if (isLocked(target)) {
    return ok(state, ctx, [], [
      { k: 'TOAST', kind: 'warn', text: '전회차 표기는 편집할 수 없습니다' },
    ]);
  }
  const path: SketchPath = {
    id: ctx.makeId(),
    points: pts.map(roundNorm),
    width: ctx.globalStyle.sketchWidth,
  };
  return ok(
    {
      ...state,
      selection: { ...NO_SELECTION, defectId: target.id, part: 'SKETCH', pathId: path.id },
    },
    ctx,
    [{ k: 'ADD_SKETCH', defectId: target.id, path, index: sketchOf(target).length }],
    [{ k: 'TOAST', kind: 'info', text: '그리기가 추가되었습니다', undoable: true }],
  );
}

// ── 메모 생성 (§S2a-2) ─────────────────────────────────────────────────────
function createMemoAt(state: CanvasState, screen: SPoint, ctx: ReduceContext): ReduceResult {
  if (!state.drawing) return ok(state, ctx);
  const n = toNorm(screen, state.viewport, state.drawing.imageWidth, state.drawing.imageHeight);
  const now = (ctx.now ?? (() => 0))();
  const memo: Memo = {
    id: ctx.makeId(),
    projectId: ctx.projectId ?? '',
    drawingId: state.drawing.id,
    floorId: ctx.floorId ?? '',
    pos: roundNorm(softClampLabel(n)),
    text: '',
    style: null,
    createdAt: now,
    updatedAt: now,
    deviceId: ctx.deviceId ?? '',
    createdBy: null,
  };
  return ok(
    { ...state, selection: { ...NO_SELECTION, part: 'MEMO', memoId: memo.id } },
    ctx,
    [{ k: 'CREATE_MEMO', memo }],
    // 빈 메모는 아무 뜻이 없다. 만들자마자 바로 쓰게 한다
    [{ k: 'EDIT_MEMO', memoId: memo.id }],
  );
}

// ── 저장 정밀도 (§2-2-b) ───────────────────────────────────────────────────
function roundGeometry(g: MarkGeometry): MarkGeometry {
  switch (g.k) {
    case 'POINT': {
      const p = roundNorm({ x: g.x, y: g.y });
      return { k: 'POINT', x: p.x, y: p.y };
    }
    case 'ARROW':
      return { k: 'ARROW', from: roundNorm(g.from), to: roundNorm(g.to) };
    case 'AREA_RECT':
    case 'AREA_ELLIPSE': {
      const a = roundNorm({ x: g.x, y: g.y });
      const s = roundNorm({ x: g.w, y: g.h });
      return { k: g.k, x: a.x, y: a.y, w: s.x, h: s.y };
    }
    default:
      return g;
  }
}

/** 저장할 가치가 없을 만큼 작은가 (정규화 기준 0.1% 미만) */
function isDegenerate(g: MarkGeometry): boolean {
  const TINY = 0.001;
  if (g.k === 'AREA_RECT' || g.k === 'AREA_ELLIPSE') return g.w < TINY && g.h < TINY;
  if (g.k === 'ARROW') {
    return Math.abs(g.to.x - g.from.x) < TINY && Math.abs(g.to.y - g.from.y) < TINY;
  }
  return false;
}

// ── 라벨 초기화 (§2-8-e) ───────────────────────────────────────────────────
function onResetLabel(state: CanvasState, defectId: string, ctx: ReduceContext): ReduceResult {
  const d = findDefect(ctx, defectId);
  if (!d || !state.drawing) return ok(state, ctx);
  const style = resolveStyle(d, ctx.globalStyle);
  const a = anchorNorm(d);
  if (!a) return ok(state, ctx);
  const to = roundNorm(
    autoLabelNorm(a, style.balloonRadius, state.drawing.imageWidth, state.drawing.imageHeight),
  );
  if (!d.label.placed) {
    return ok(state, ctx, [], [{ k: 'TOAST', kind: 'info', text: '이미 자동 배치 상태입니다' }]);
  }
  return ok(
    state,
    ctx,
    [
      {
        k: 'RESET_LABEL',
        defectId,
        from: roundNorm({ x: d.label.x, y: d.label.y }),
        to,
        fromPlaced: d.label.placed,
        toPlaced: false,
      },
    ],
    [{ k: 'TOAST', kind: 'info', text: '번호 위치를 초기화했습니다', undoable: true }],
  );
}

// ── 삭제 (§2-8-e) ──────────────────────────────────────────────────────────
function onDelete(state: CanvasState, ctx: ReduceContext): ReduceResult {
  const sel = state.selection;

  // 메모는 결함이 아니다. 확인 팝업 없이 지우고 되돌리기 토스트를 준다 (ui-quality §4)
  if (sel.part === 'MEMO' && sel.memoId) {
    const memo = findMemo(ctx, sel.memoId);
    if (!memo) return ok(state, ctx);
    return ok(
      { ...state, selection: { ...NO_SELECTION }, hover: null },
      ctx,
      [{ k: 'DELETE_MEMO', memo }],
      [{ k: 'TOAST', kind: 'info', text: '메모가 삭제되었습니다', undoable: true }],
    );
  }

  const d = findDefect(ctx, sel.defectId);
  if (!d) return ok(state, ctx);

  // 자유그리기 한 획만 지운다. 결함 자체는 남는다
  if (sel.part === 'SKETCH' && sel.pathId) {
    if (isLocked(d)) {
      return ok(state, ctx, [], [
        { k: 'TOAST', kind: 'warn', text: '전회차 표기는 삭제할 수 없습니다' },
      ]);
    }
    const list = sketchOf(d);
    const idx = list.findIndex((p) => p.id === sel.pathId);
    const path = list[idx];
    if (!path) return ok(state, ctx);
    return ok(
      { ...state, selection: { ...NO_SELECTION, defectId: d.id }, hover: null },
      ctx,
      [{ k: 'DELETE_SKETCH', defectId: d.id, path, index: idx }],
      [{ k: 'TOAST', kind: 'info', text: '그리기가 삭제되었습니다', undoable: true }],
    );
  }

  if (isLocked(d)) {
    return ok(state, ctx, [], [
      { k: 'TOAST', kind: 'warn', text: '전회차 표기는 삭제할 수 없습니다' },
    ]);
  }

  if (sel.part === 'LABEL') {
    return ok(state, ctx, [], [
      {
        k: 'TOAST',
        kind: 'warn',
        text: '번호 풍선은 지울 수 없습니다. [번호 위치 초기화]를 쓰세요',
      },
    ]);
  }

  if (sel.part === 'MARK' && sel.markId && d.marks.length > 1) {
    const idx = d.marks.findIndex((m) => m.id === sel.markId);
    const mark = d.marks[idx];
    if (!mark) return ok(state, ctx);
    const remaining = d.marks.filter((m) => m.id !== sel.markId);
    const toAnchor =
      d.label.anchorMarkId === sel.markId ? (remaining[0]?.id ?? null) : d.label.anchorMarkId;
    return ok(
      { ...state, selection: { defectId: d.id, part: null, markId: null }, hover: null },
      ctx,
      [
        {
          k: 'DELETE_MARK',
          defectId: d.id,
          mark,
          index: idx,
          fromAnchorId: d.label.anchorMarkId,
          toAnchorId: toAnchor,
        },
      ],
      [{ k: 'TOAST', kind: 'info', text: '표기가 삭제되었습니다', undoable: true }],
    );
  }

  // 마지막 남은 마크 → 확인 후 결함 전체 삭제 (A7)
  return ok(state, ctx, [], [
    {
      k: 'CONFIRM_DELETE_DEFECT',
      defectId: d.id,
      reason: sel.part === 'MARK' ? 'LAST_MARK' : 'EXPLICIT',
    },
  ]);
}

// ── 키보드 ─────────────────────────────────────────────────────────────────
function onKeyDown(
  state: CanvasState,
  key: string,
  keys: Keys,
  ctx: ReduceContext,
): ReduceResult {
  const s = { ...state, keys };

  if (key === 'Escape') {
    if (s.drag) {
      // originNorm 으로 복귀 후 취소. 커밋하지 않았으므로 drag 를 버리면 원위치다
      return ok({ ...s, drag: null, guides: [] }, ctx);
    }
    return ok({ ...s, selection: { ...NO_SELECTION } }, ctx);
  }

  if (key === 'Delete' || key === 'Backspace') {
    if (!s.selection.defectId) return ok(s, ctx);
    return onDelete(s, ctx);
  }

  if (keys.ctrl && (key === 'z' || key === 'Z')) {
    return ok(s, ctx, [], [{ k: keys.shift ? 'REDO' : 'UNDO' }]);
  }
  if (keys.ctrl && (key === 'y' || key === 'Y')) {
    return ok(s, ctx, [], [{ k: 'REDO' }]);
  }

  if (key === '0' || (keys.ctrl && key === '0')) return ok(fitState(s), ctx);

  if (key === '+' || key === '=') return reduce(s, { k: 'ZOOM_BUTTON', factor: ZOOM_WHEEL_STEP }, ctx);
  if (key === '-' || key === '_') {
    return reduce(s, { k: 'ZOOM_BUTTON', factor: 1 / ZOOM_WHEEL_STEP }, ctx);
  }

  return ok(s, ctx);
}
