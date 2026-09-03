/**
 * 상호작용 상태 머신 — 스펙 §2-3 / §2-5.
 *
 *   (state, InputEvent, ctx) → (state', Command[], Effect[])
 *
 * 경계 규칙: 브라우저 이벤트 타입을 모른다. 어댑터가 정규화된 InputEvent 로 바꿔 넘긴다.
 * 시간·난수도 모른다 — id 생성기는 ctx 로 받는다.
 */
import {
  CREATE_MIN_DRAG_PX,
  DEFAULT_HIT_PROFILE,
  LABEL_SOFT_MAX,
  LABEL_SOFT_MIN,
  MEMO_INK,
  MEMO_INK_WIDTH,
  SKETCH_MAX_POINTS,
  SKETCH_MIN_STEP_PX,
  ZOOM_WHEEL_STEP,
  type HitProfile,
} from './constants.js';
import type { Command } from './commands.js';
import { EMPTY_DEFECT_ATTRS } from './defectAttrs.js';
import { newDefectBase } from './defectBase.js';
import {
  anchorNorm,
  arrowLastLegAngleDeg,
  autoLabelNorm,
  balloonHalfExtra,
  centerOfGeometry,
  centerOfMark,
  clampDefectsTranslate,
  effectiveLabelNorm,
  isLocked,
  sketchOf,
} from './defectGeom.js';
import type { DefectScreen, PreviewOverride } from './defectGeom.js';
import { advanceArrowDrag } from './arrowRoute.js';
import { clamp, dist, lockAxis, rectsIntersect, roundNorm, toNorm, toScreen } from './geometry.js';
import { inkAnchor, isInkMemo, memoScreens, type MemoScreen } from './memoGeom.js';
import {
  clampGeometryInside,
  normalizeRect,
  resizeRect,
  squareTo,
  translateGeometry,
  translatePathInside,
  handleCursor,
  type SRect,
} from './shapes.js';
import { hitTest, nearestMemoPath } from './hitTest.js';
import { buildScreens, type GhostShape, type InkSession } from './renderModel.js';
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
  DefectAttrs,
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
  /**
   * 기기 식별자. 메모의 `RecordBase` 와 **결함의 `DefectBase`** 를 채운다 (Phase 5 · D23).
   * 없으면 빈 문자열이 들어가고, 저장소가 읽는 시점에 `normalizeDefectBase` 가 현재 기기로 채운다.
   */
  deviceId?: string;
  /** 새 결함이 속할 층. 없으면 빈 문자열 */
  floorId?: string;
  /** 새 결함이 속할 용역. 캔버스는 해석하지 않는 불투명 문자열이다 */
  projectId?: string;
  /**
   * 새 결함에 얹을 **프로젝트 고정 기본값** (S2b). 지금은 용역의 기본 구조유형뿐이다.
   * **캔버스는 이 값을 해석하지 않는다** — 받아서 펼치기만 한다.
   * 무엇을 넣을지는 `project-core` 의 `seedAttrs()` 가 정한다.
   *
   * ⚠️ 2026-08-28 `defectSeed` 에서 이름을 바꿨다 (D18). D9(직전 입력 자동 이어받기)가
   * 폐기되면서 "직전 커밋이 이 값을 갈아 끼운다"는 성질이 사라졌다.
   * **이 값은 용역을 여는 순간 정해지고 세션 내내 갱신되지 않는다.**
   */
  defaultAttrs?: Partial<DefectAttrs>;
  /**
   * 히트 허용치 (Phase 5 T5). **생략하면 `DEFAULT_HIT_PROFILE`(= 지금까지의 마우스 값)** 이라
   * PC 동작은 한 픽셀도 바뀌지 않는다. 손가락으로 쓰는 화면에서만 넓은 값을 주입한다.
   *
   * 코어가 플랫폼을 판별하지 않는 이유: 코어는 `window` 도 `navigator` 도 모른다(경계 규칙 1).
   * 무엇이 마우스이고 무엇이 손가락인지는 **어댑터만 안다.**
   */
  hitProfile?: HitProfile;
  /**
   * 결함 id → 화면에 그려지는 번호 문자열. **히트 영역이 그림과 같아지도록** 넘긴다
   * (검수 심각2 — 긴 번호는 풍선이 좌우로 늘어난다).
   * 생략하면 풍선을 원으로 보고 판정한다 = 예전 동작.
   */
  displayNumbers?: Record<string, string>;
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
    multi: [],
    hover: null,
    drag: null,
    guides: [],
    keys: { ...NO_KEYS },
    cursor: 'default',
    busy: false,
    pendingSketch: null,
    inkMemoId: null,
    memoInkColor: MEMO_INK,
  };
}

/**
 * T-1 — 렌더러에 넘길 **필기 세션** 요약. 순수 파생값이다.
 *
 * `RenderInput.inkSession` 으로 들어가 `memoOps_` 가 점선 상자를 숨길지 정한다.
 * 출력(`locationMap`)은 이 값을 넘기지 않으므로 조사위치도는 영향을 받지 않는다.
 */
export function inkSessionOf(state: CanvasState): InkSession {
  return {
    // 획을 긋는 중 — 포인터 down~up. 선택 상태와 무관하게 **모든** 메모 상자를 숨긴다
    drawing: state.tool === 'MEMO' && state.drag?.kind === 'CREATE_SKETCH',
    // 방금 커밋한 획. 손을 뗀 뒤에도 세션이 끝날 때까지 상자를 숨긴다
    memoId: state.inkMemoId,
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

/**
 * C-4b — 진행 중인 **일괄 이동**의 대상과 델타. 없으면 `null`.
 *
 * 미리보기와 커밋이 같은 값을 본다 — 갈라지면 손을 뗀 순간 그림이 튄다.
 */
export function multiTranslateOf(
  state: CanvasState,
): { ids: ReadonlySet<string>; dx: number; dy: number } | null {
  const d = state.drag;
  if (!d || d.kind !== 'MOVE_MULTI' || !d.moved) return null;
  if (d.previewNorm.x === 0 && d.previewNorm.y === 0) return null;
  return { ids: new Set(state.multi), dx: d.previewNorm.x, dy: d.previewNorm.y };
}

export function screensOf(state: CanvasState, ctx: ReduceContext): DefectScreen[] {
  if (!state.drawing) return [];
  return buildScreens({
    drawing: state.drawing,
    viewport: state.viewport,
    defects: ctx.defects,
    globalStyle: ctx.globalStyle,
    preview: previewOf(state),
    displayNumbers: ctx.displayNumbers,
    translate: multiTranslateOf(state),
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
 * D14 지우개 — 커서 아래의 **필기 획 하나**를 지우는 커맨드를 만든다.
 * 아무것도 안 걸리면 `null` (빈 자리를 문지르면 아무 일도 일어나지 않는다).
 *
 * ⚠️ **필기 메모의 획만** 지운다. 결함의 자유그리기(`SKETCH`)·점·화살표·영역·
 * 번호 풍선·리더선은 여기 들어오지도 않는다 — `memoScreensOf` 는 메모만 준다.
 *
 * ⚠️ **획 1개 통째로**다. 획의 일부를 지우지 않는다 — 벡터 점 배열이라
 * 부분 삭제는 자료구조가 다르다(사진 주석 지우개와 같은 판단, PhotoPolish §2-4).
 *
 * 한 번에 **가장 가까운 획 하나만** 지운다. 겹친 획을 한꺼번에 날리면
 * *"다른 것이 지워지면 안 된다"* 는 사용자 요구를 어긴다 — 계속 문지르면 나머지도 지워진다.
 */
function eraseCommandAt(
  state: CanvasState,
  screen: SPoint,
  ctx: ReduceContext,
  eraseId: string,
): Command | null {
  const memos = memoScreensOf(state, ctx);
  const tol = hitProfileOf(ctx).memoInk;
  // 위에 그려진 것부터 — 히트 테스트(§2-4 7번)와 같은 순서다
  for (let i = memos.length - 1; i >= 0; i -= 1) {
    const ms = memos[i]!;
    if (!ms.paths) continue; // 텍스트 메모는 지우개 대상이 아니다 (지울 획이 없다)
    const idx = nearestMemoPath(screen, ms, tol);
    if (idx === null) continue;
    const hitPath = ms.paths[idx];
    const memo = findMemo(ctx, ms.memoId);
    if (!hitPath || !memo || !memo.paths) continue;
    // ⚠️ 스크린 인덱스 ≠ 레코드 인덱스다 — `memoScreen()` 이 점 1개짜리 획을 걸러낸다.
    //    반드시 id 로 찾는다
    const index = memo.paths.findIndex((p) => p.id === hitPath.id);
    const path = memo.paths[index];
    if (index < 0 || !path) continue;
    // 마지막 획이면 **메모 레코드째** 지운다 — 빈 메모를 남기지 않는다 (D14)
    if (memo.paths.length === 1) {
      return { k: 'DELETE_MEMO_PATH', eraseId, items: [], memos: [memo] };
    }
    return { k: 'DELETE_MEMO_PATH', eraseId, items: [{ memoId: memo.id, path, index }], memos: [] };
  }
  return null;
}

/**
 * 생성 중인 도형의 미리보기. 아직 문서에 없으므로 DefectScreen 이 아니다.
 * 어댑터는 `RenderInput.ghost` 에 그대로 넣는다.
 */
export function ghostOf(state: CanvasState, ctx: ReduceContext): GhostShape | null {
  if (!state.drawing) return null;
  const iw = state.drawing.imageWidth;
  const ih = state.drawing.imageHeight;
  const vp = state.viewport;
  const st = ctx.globalStyle;
  const color = st.statusColor.CURRENT;

  const d = state.drag;
  if (!d) return null;

  if (d.kind === 'CREATE_SKETCH' && d.pathPreview && d.pathPreview.length >= 2) {
    // F2 — 같은 드래그 커널을 쓰지만 **메모는 중립 앰버**로 미리보기한다.
    // 그리기(결함 상태색)와 그리는 도중에도 구분돼야 한다
    const memoTool = state.tool === 'MEMO';
    return {
      k: 'SKETCH',
      points: d.pathPreview.map((n) => toScreen(n, vp, iw, ih)),
      color: memoTool ? state.memoInkColor : color,
      width: Math.max(1, (memoTool ? MEMO_INK_WIDTH : st.sketchWidth) * vp.zoom),
    };
  }
  if (d.kind !== 'CREATE_SHAPE' || !d.geomPreview) return null;
  const g = d.geomPreview;
  if (g.k === 'ARROW') {
    // 지금까지 실제로 드래그한 대로다 — g.points 가 이미 그 라이브 미리보기다 (advanceArrowDrag)
    if (g.points.length < 2) return null;
    return {
      k: 'ARROW',
      points: g.points.map((p) => toScreen(p, vp, iw, ih)),
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

/**
 * F2 — 사후연결 대기 중인 자유그리기의 화면 미리보기.
 * 아직 문서에 없으므로 DefectScreen 이 아니다. 어댑터는 `RenderInput.pending` 에 넣는다.
 *
 * 색은 **현회차 상태색**을 그대로 쓴다 — 곧 결함에 붙을 그리기이기 때문이다.
 * "아직 안 붙었다"는 신호는 색이 아니라 **점선 + 안내 패널**이 준다.
 */
export function pendingGhostsOf(state: CanvasState, ctx: ReduceContext): GhostShape[] {
  const p = state.pendingSketch;
  if (!p || !state.drawing) return [];
  const iw = state.drawing.imageWidth;
  const ih = state.drawing.imageHeight;
  const vp = state.viewport;
  return p.paths
    .filter((path) => path.points.length >= 2)
    .map((path) => ({
      k: 'SKETCH' as const,
      points: path.points.map((n) => toScreen(n, vp, iw, ih)),
      color: ctx.globalStyle.statusColor.CURRENT,
      width: Math.max(1, path.width * vp.zoom),
    }));
}

/** 히트 허용치 — 주입 없으면 마우스 값 (T5) */
function hitProfileOf(ctx: ReduceContext): HitProfile {
  return ctx.hitProfile ?? DEFAULT_HIT_PROFILE;
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
  // F2 — 메모는 이제 손글씨다. 글자 입력 커서(text)가 아니라 그리기 커서
  MEMO: 'crosshair',
  // D14 — 지우개. 원형 커서 링은 만들지 않는다(코어는 커서를 그리지 않는다)
  ERASER: 'crosshair',
};

export function computeCursor(state: CanvasState, ctx: ReduceContext): Cursor {
  if (state.busy) return 'wait';
  if (!state.drawing) return 'default';
  if (state.drag) {
    if (state.drag.kind === 'PAN') return 'grabbing';
    if (state.drag.kind === 'RESIZE_SHAPE' && state.drag.handle) {
      return resizeCursor(state.drag.handle);
    }
    if (
      state.drag.kind === 'CREATE_SHAPE' ||
      state.drag.kind === 'CREATE_SKETCH' ||
      state.drag.kind === 'ERASE'
    ) {
      return 'crosshair';
    }
    return 'move';
  }
  if (state.keys.space) return 'grab';
  // D14 — 지우개는 hover 보다 앞선다. 메모 위에서 'move' 를 보여 주면
  // "끌어서 옮길 수 있다"는 거짓말이 된다 — 지우개는 옮기지 않는다
  if (state.tool === 'ERASER') return 'crosshair';
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

/**
 * 진행 중인 드래그를 **롤백**한다 (Phase 5 T3 · Escape 와 같은 규칙).
 *
 * 드래그는 커밋(POINTER_UP) 전까지 문서(Defect[])를 한 글자도 건드리지 않는다
 * — 위치는 `drag.previewNorm` / `drag.geomPreview` 안에만 있다. 그래서 **버리는 것이 곧 원위치**다:
 *   · 생성 중이던 임시 표기 → 커밋된 적이 없으니 아무것도 안 남는다
 *   · 이동 중이던 표기      → 미리보기가 사라지고 원래 좌표가 다시 보인다
 *   · 팬 드래그             → 지금까지 민 뷰포트는 **그대로 둔다** (시작 위치로 되감으면 화면이 튄다)
 *
 * 선택(selection)은 건드리지 않는다 — Escape 취소도 선택은 남긴다.
 */
function cancelDrag(state: CanvasState): CanvasState {
  if (!state.drag) return state;
  return { ...state, drag: null, guides: [] };
}

/**
 * 좌표가 실수 두 개로 성립하는가. NaN · Infinity · undefined 를 걸러낸다.
 *
 * 코어는 어댑터를 믿지 않는다 — 뷰포트는 한 번 오염되면 스스로 못 낫는 상태다
 * (`state.viewports` 에 도면별로 기억까지 된다).
 */
function finitePoint(p: { x: number; y: number } | null | undefined): boolean {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function fitState(state: CanvasState): CanvasState {
  if (!state.drawing || state.canvas.w <= 0 || state.canvas.h <= 0) return state;
  return withViewport(
    state,
    fitViewport(state.drawing.imageWidth, state.drawing.imageHeight, state.canvas),
  );
}

// ── 리듀서 ─────────────────────────────────────────────────────────────────
/**
 * T-1 — 필기 세션이 끝났는지 판정해 `inkMemoId` 를 비운다.
 *
 * 모든 이벤트 뒤에 한 번씩 도는 **단일 지점**이다. 선택을 바꾸는 곳이 열 군데가 넘는데
 * 그 전부에 `inkMemoId: null` 을 흩뿌리면 한 곳만 빠뜨려도 상자가 영영 안 나온다.
 *
 * 세션이 살아 있는 조건 (둘 다여야 한다):
 *   · 도구가 아직 MEMO 다        → 도구를 바꾸면 끝난다
 *   · 그 메모가 아직 선택돼 있다 → 다른 곳을 탭하면 끝난다
 */
function endInkSessionIfStale(r: ReduceResult): ReduceResult {
  const s = r.state;
  if (s.inkMemoId === null) return r;
  if (s.tool === 'MEMO' && s.selection.memoId === s.inkMemoId) return r;
  return { ...r, state: { ...s, inkMemoId: null } };
}

export function reduce(state: CanvasState, ev: InputEvent, ctx: ReduceContext): ReduceResult {
  return endInkSessionIfStale(reduceCore(state, ev, ctx));
}

function reduceCore(state: CanvasState, ev: InputEvent, ctx: ReduceContext): ReduceResult {
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

    // 필기메모 색상 선택(2026-09-03 사용자 요청) — 다음 획부터 적용된다. 이미 그린 메모는 안 바뀐다
    case 'SET_MEMO_INK_COLOR':
      return ok({ ...state, memoInkColor: ev.color }, ctx);

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

    // ── Phase 5 T2 · 핀치 ─────────────────────────────────────────────────
    // 신규 수학 없음. 기존 `zoomAt`(커서 고정 줌) + `clampPan`(팬 한계) 재사용이다.
    case 'GESTURE_PINCH_START':
      // 두 번째 손가락이 얹히는 순간 진행 중이던 드래그는 버린다 (T3 와 같은 규칙).
      // 커밋 전이라 드래그를 버리면 곧 원위치다 — 문서는 아직 손대지 않았다
      return ok(cancelDrag(state), ctx);

    case 'GESTURE_PINCH': {
      if (!state.drawing) return ok(state, ctx);
      /**
       * 좌표가 성한 값이 아니면 **그 프레임을 통째로 버린다.**
       * 어댑터는 "직전 프레임 중점" 으로 `pan` 을 내는데, 핀치 첫 프레임에는 직전이 없어
       * `undefined` 뺄셈 → NaN 이 나오기 쉽다. NaN 이 한 프레임만 들어와도 뷰포트가
       * NaN 으로 굳고 `viewports` 기억에까지 남아 FIT 전에는 복구되지 않는다.
       */
      if (!finitePoint(ev.center) || !finitePoint(ev.pan)) return ok(state, ctx);
      // 요소 드래그가 남아 있으면(START 를 놓친 어댑터) 여기서라도 버린다.
      // 정렬 스냅샷이 스크린 좌표라 뷰포트가 움직이면 유효성이 깨진다 (WHEEL 과 같은 이유)
      const base = cancelDrag(state);
      const { imageWidth, imageHeight } = state.drawing;
      const { min, max } = zoomLimits(imageWidth, imageHeight, base.canvas);
      const factor = Number.isFinite(ev.factor) && ev.factor > 0 ? ev.factor : 1;
      // ① 두 접점의 중점을 고정한 채 배율을 바꾸고 ② 그 중점이 움직인 만큼 민다.
      //    순서가 중요하다 — 줌을 먼저 해야 손가락 아래 도면 지점이 안 미끄러진다
      const zoomed = zoomAt(base.viewport, ev.center, factor, min, max);
      const panned: Viewport = {
        zoom: zoomed.zoom,
        tx: zoomed.tx + ev.pan.x,
        ty: zoomed.ty + ev.pan.y,
      };
      return ok(withViewport(base, panned), ctx); // withViewport 안에서 clampPan
    }

    case 'GESTURE_PINCH_END':
      // 코어는 제스처 상태를 들고 있지 않다 — END 를 잃어버려도 코어가 잠기지 않는다.
      // 활성 포인터 추적은 어댑터(T1)의 몫이다
      return ok(state, ctx);

    // ── Phase 5 T4 ────────────────────────────────────────────────────────
    case 'CENTER_ON_NORM': {
      if (!state.drawing) return ok(state, ctx);
      // 핀치와 같은 이유 — 성하지 않은 좌표 하나가 뷰포트를 영구히 오염시킨다
      if (!finitePoint(ev.n)) return ok(state, ctx);
      return ok(
        withViewport(
          state,
          centerOn(
            state.viewport,
            ev.n,
            state.drawing.imageWidth,
            state.drawing.imageHeight,
            state.canvas,
          ),
        ),
        ctx,
      );
    }

    case 'POINTER_DOWN':
      return onPointerDown(state, ev, ctx);

    case 'POINTER_MOVE':
      return onPointerMove(state, ev, ctx);

    case 'POINTER_UP':
      return onPointerUp(state, ev, ctx);

    case 'POINTER_CANCEL':
      // A2 와 같은 성질 — **취소된 포인터가 드래그의 주인일 때만** 취소한다.
      // 두 손가락 중 한쪽이 시스템에 뺏겼다고(스크롤·알림) 남의 드래그까지 죽이면 안 된다.
      // POINTER_MOVE · POINTER_UP 은 이미 같은 검사를 한다
      if (state.drag && state.drag.pointerId !== ev.pointerId) return ok(state, ctx);
      return ok(cancelDrag(state), ctx);

    case 'POINTER_LEAVE':
      return ok(state.drag ? state : { ...state, hover: null }, ctx);

    case 'DOUBLE_CLICK': {
      if (!state.drawing) return ok(state, ctx);
      // D14 — 지우개로 같은 자리를 두 번 문지르면 브라우저가 더블클릭을 함께 보낸다.
      // 그때 화면이 통째로 fit(줌 리셋)되면 사용자는 무슨 일이 일어났는지 모른다
      if (state.tool === 'ERASER') return ok(state, ctx);
      const screens = screensOf(state, ctx);
      const hit = hitTest(
        ev.screen,
        screens,
        state.selection,
        memoScreensOf(state, ctx),
        hitProfileOf(ctx),
      );
      if (!hit) return ok(fitState(state), ctx);
      // 메모 더블클릭 = 글 고치기 (§S2a-4).
      // F2 — **필기 메모는 글로 고칠 수 없다.** 옛 텍스트 메모만 편집기를 연다
      if (hit.part === 'MEMO' && hit.memoId) {
        const picked: CanvasState = {
          ...state,
          selection: { ...NO_SELECTION, part: 'MEMO', memoId: hit.memoId },
        };
        const m = findMemo(ctx, hit.memoId);
        if (m && isInkMemo(m)) {
          return ok(picked, ctx, [], [
            {
              k: 'TOAST',
              kind: 'info',
              text: '필기 메모입니다. 고치려면 지우고 다시 쓰세요',
            },
          ]);
        }
        return ok(picked, ctx, [], [{ k: 'EDIT_MEMO', memoId: hit.memoId }]);
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
      const hit = hitTest(
        ev.screen,
        screens,
        state.selection,
        memoScreensOf(state, ctx),
        hitProfileOf(ctx),
      );
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
      // U-2: 저장 결과(바뀐 글)가 도면에 바로 보인다 — 토스트 없음. 커맨드는 그대로 나간다
      return ok(state, ctx, [
        { k: 'SET_MEMO_TEXT', memoId: memo.id, from: memo.text, to: text },
      ]);
    }

    case 'SET_AREA_STYLE': {
      const d = findDefect(ctx, ev.defectId);
      if (!d || isLocked(d)) return ok(state, ctx);
      const patch: Record<string, unknown> = {};
      if (ev.shape !== undefined) patch.areaShape = ev.shape;
      if (ev.fill !== undefined) patch.areaFill = ev.fill;
      const to = patchStyle(d.style, patch as { areaShape?: AreaShape; areaFill?: AreaFill });
      // U-2: 모양이 캔버스에 바로 보인다 — 토스트 없음
      return ok(state, ctx, [{ k: 'SET_STYLE', defectId: d.id, from: d.style, to }]);
    }

    case 'SET_MARK_COLOR': {
      const d = findDefect(ctx, ev.defectId);
      if (!d || isLocked(d)) return ok(state, ctx);
      const to = patchStyle(d.style, { color: ev.color ?? undefined });
      // 색은 그 자리에서 바로 보인다 — 성공 확인 토스트 제거 (U-2 정책, Q62)
      return ok(state, ctx, [{ k: 'SET_STYLE', defectId: d.id, from: d.style, to }]);
    }

    case 'RESET_STYLE': {
      const d = findDefect(ctx, ev.defectId);
      if (!d || isLocked(d)) return ok(state, ctx);
      // U-2: 이미 기본값이면 바뀔 게 없다 — 조용히 넘어간다
      if (d.style === null) return ok(state, ctx);
      // U-2: 되돌아간 색·모양이 캔버스에 바로 보인다 — 토스트 없음
      return ok(state, ctx, [{ k: 'SET_STYLE', defectId: d.id, from: d.style, to: null }]);
    }

    // ── F2 자유그리기 사후연결 — 그리기 완료(항상 새 결함) ───────────────────
    case 'PENDING_SKETCH_TO_NEW_DEFECT':
      return pendingSketchToNewDefect(state, ctx);

    case 'CANCEL_PENDING_SKETCH': {
      if (!state.pendingSketch) return ok(state, ctx);
      // U-2: 대기 중이던 획이 화면에서 사라지는 것으로 취소가 보인다 — 토스트 없음
      return ok({ ...state, pendingSketch: null }, ctx);
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

    case 'CONFIRM_DELETE_DEFECTS': {
      const list = ev.defectIds
        .map((id) => findDefect(ctx, id))
        .filter((d): d is Defect => d !== null && !isLocked(d));
      if (list.length === 0) return ok({ ...state, multi: [] }, ctx);
      return ok(
        { ...state, selection: { ...NO_SELECTION }, multi: [], hover: null },
        ctx,
        [{ k: 'DELETE_DEFECTS', defects: list }],
        [
          {
            k: 'TOAST',
            kind: 'info',
            text: `결함 ${list.length}건이 삭제되었습니다`,
            undoable: true,
          },
        ],
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

  /**
   * Phase 5 T3 — **두 번째 포인터는 새 드래그를 시작하지 않는다.**
   *
   * 마우스는 포인터가 하나(pointerId 고정)라 이 분기에 걸리지 않는다 — PC 동작은 그대로다.
   * 터치에서는 다르다: 한 손가락으로 영역을 그리는 중에 두 번째 손가락이 닿으면
   * 예전 코드는 진행 중이던 `state.drag` 를 확인하지 않고 새 드래그로 **덮어써서**
   * 그리던 도형이 엉뚱한 곳에 남거나 옮기던 표기가 손가락을 따라가 버렸다.
   *
   * 여기서는 진행 중이던 드래그를 롤백하고 이 포인터는 **버린다.**
   * 어댑터(T1)는 이 직후 `GESTURE_PINCH_START` 를 보내 핀치로 이어간다 —
   * 즉 두 손가락은 "그리기" 가 아니라 항상 "화면 조작" 이다.
   */
  if (state.drag && state.drag.pointerId !== ev.pointerId) {
    return ok(cancelDrag({ ...state, keys: ev.keys }), ctx);
  }

  let next0 = { ...state, keys: ev.keys };

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

  // ── D14 지우개 ──────────────────────────────────────────────────────────
  // **히트 테스트보다 앞이다.** 지우개는 무엇을 선택하지도, 팬하지도 않는다.
  // 뒤에 두면 메모 위에서 누르는 순간 `MOVE_MEMO` 드래그가 먼저 잡혀 메모가 끌려간다
  if (next0.tool === 'ERASER') {
    const eraseId = ctx.makeId();
    const cmd = eraseCommandAt(next0, ev.screen, ctx, eraseId);
    const drag = newDrag('ERASE', ev.pointerId, ev.screen, next0.viewport, {
      eraseId,
      erasedCount: cmd ? 1 : 0,
    });
    // 선택을 비운다 — 지우개 모드에서 `Delete` 키가 **이전에 골라 둔 결함**을
    // 지우는 사고를 막는다 (D14 "다른 것은 절대 안 지운다")
    return ok(
      { ...next0, selection: { ...NO_SELECTION }, drag, guides: [], hover: null },
      ctx,
      cmd ? [cmd] : [],
    );
  }

  const screens = screensOf(next0, ctx);
  const memos = memoScreensOf(next0, ctx);
  const hit = hitTest(ev.screen, screens, next0.selection, memos, hitProfileOf(ctx));

  /*
   * C-4 — 새로 누르면 영역선택은 풀린다. **단, 이미 잡혀 있는 결함을 누른 것이면 유지한다** —
   * 그래야 여러 개를 잡아 놓고 그중 하나를 끌어 함께 옮길 수 있다.
   */
  if (!(hit?.defectId && next0.multi.includes(hit.defectId))) {
    next0 = { ...next0, multi: [] };
  } else if (next0.tool === 'SELECT' && next0.multi.length > 1) {
    /*
     * C-4b — 여러 개를 잡아 놓고 그중 하나를 끌면 **전부 같이 간다.**
     * 잠긴 결함을 잡은 것이면 여기로 오지 않는다 — 아래 단일 경로가 평소대로 거절한다.
     */
    const grabbed = findDefect(ctx, hit.defectId);
    if (grabbed && !isLocked(grabbed)) {
      return ok(
        {
          ...next0,
          selection: { ...NO_SELECTION },
          drag: newDrag('MOVE_MULTI', ev.pointerId, ev.screen, next0.viewport, {
            defectId: hit.defectId,
            previewNorm: { x: 0, y: 0 },
          }),
          guides: [],
        },
        ctx,
      );
    }
  }

  /**
   * 생성 도구가 켜져 있으면 **기존 표기를 잡기 전에** 생성을 시작한다.
   * 도구를 켜 놓고 도형 위에서 시작하는 것은 "저 위에 새로 그린다" 는 뜻이지
   * "저것을 옮긴다" 가 아니다.
   *
   * F4 예외 — **번호 풍선(LABEL)만은** 어떤 도구가 켜져 있어도 항상 먼저 잡힌다.
   * 히트 테스트 우선순위(§2-4)에서 라벨이 이미 최상위이므로, 여기서는 그 결과를
   * 도구보다 앞세우기만 하면 된다. 라벨이 아닌 다른 표기 위는 여전히 도구가 이긴다.
   *
   * 방향(화살표) — 2026-08-24 재개정. **눌러서 끄는 드래그**로 방향(45도 8방향)을
   * 정한다 — 영역과 같은 생성 드래그 경로(`startCreateShape`)를 탄다. 점만 클릭 한 번이다.
   */
  const createType = TOOL_MARK_TYPE[next0.tool];
  const labelGrabbed = hit?.part === 'LABEL';
  if (!labelGrabbed) {
    if (createType && createType !== 'POINT') {
      return startCreateShape(next0, ev.screen, createType, ev.pointerId, ctx);
    }
    // F2 — 메모도 자유그리기와 **같은 드래그 커널**을 탄다 (손글씨 메모).
    // 커밋 시점(onPointerUp)에 도구를 보고 결함 스케치 / 메모로 갈린다
    if (next0.tool === 'SKETCH' || next0.tool === 'MEMO') {
      return startCreateSketch(next0, ev.screen, ev.pointerId, ctx);
    }
  }

  // 빈 도면 → 팬 드래그. UP 에서 이동이 없었으면 선택 해제(또는 점 도구면 생성)
  if (!hit) {
    /*
     * C-4 (D32) — **선택 도구로 빈 곳부터 끌면 영역선택.**
     *
     * 팬을 잃지 않는다 — 중클릭과 Space+좌클릭이 위에서 이미 팬으로 빠졌다.
     * 더블클릭은 안 쓴다: 브라우저는 드래그로 이어진 두 번째 클릭에 `dblclick` 을
     * 보내지 않고, 빈 곳 더블클릭은 이미 화면 맞춤(fit)이 쓰고 있다.
     */
    if (next0.tool === 'SELECT' && next0.drawing) {
      const start = toNorm(
        ev.screen,
        next0.viewport,
        next0.drawing.imageWidth,
        next0.drawing.imageHeight,
      );
      return ok(
        {
          ...next0,
          selection: { ...NO_SELECTION },
          multi: [],
          drag: newDrag('MARQUEE', ev.pointerId, ev.screen, next0.viewport, {
            createStart: start,
            previewNorm: start,
          }),
          guides: [],
          hover: null,
        },
        ctx,
      );
    }
    return startPan(next0.tool === 'POINT');
  }

  // ── 메모 (결함이 아니다) ──────────────────────────────────────────────
  if (hit.part === 'MEMO' && hit.memoId) {
    const memo = findMemo(ctx, hit.memoId);
    const box = memos.find((m) => m.memoId === hit.memoId);
    const picked: CanvasState = {
      ...next0,
      selection: { ...NO_SELECTION, part: 'MEMO', memoId: hit.memoId },
    };
    if (!memo || !box) return ok(picked, ctx);
    /**
     * ⚠️ **잡은 지점 기준이 아니라 `memo.pos` 기준으로 오프셋을 잡는다.**
     *
     * 예전에는 `box.box`(획 bbox − pad)에서 잡았는데, 커밋은 `from: memo.pos → to: previewNorm`
     * **델타**로 나간다. 즉 `pos` 와 상자가 어긋난 만큼이 그대로 이동량에 더해졌다.
     *   · 항상 `MEMO_BOX_PAD`(6 이미지 px)만큼 미세하게 어긋났고,
     *   · 지우개가 왼쪽 획을 지우면 `pos`(앵커)는 그대로인데 bbox 만 오른쪽으로 밀려
     *     남은 글씨를 끌었을 때 **끈 거리보다 훨씬 멀리 튀었다.**
     *
     * `pos` 기준으로 잡으면 `previewNorm = pos + Δ` 가 되어 순수 델타가 된다 —
     * `pos` 가 실제 bbox 와 달라도(지우개 뒤 staleness) 무해하다.
     */
    const anchor = toScreen(
      memo.pos,
      next0.viewport,
      state.drawing.imageWidth,
      state.drawing.imageHeight,
    );
    const drag: DragState = {
      ...newDrag('MOVE_MEMO', ev.pointerId, ev.screen, next0.viewport, {}),
      memoId: memo.id,
      grabOffsetScreen: { x: anchor.x - ev.screen.x, y: anchor.y - ev.screen.y },
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

  // ── 영역 리사이즈 (§S2a-4). 화살표는 핸들이 없다(2026-08-24 개정) ───────
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
    // 번호 문자열까지 넘긴다 — 자동배치 위치가 `defectScreen` 이 그린 위치와 같아야 한다
    const originNorm = effectiveLabelNorm(defect, style, iw, ih, ctx.displayNumbers?.[defect.id] ?? '');
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
    // ARROW 는 shapeFrom(영역 전용)이 못 만든다 — 화살촉 하나만 있고 아직 방향도 없다.
    // 방향(45도 첫 구간)은 POINTER_MOVE 에서 실제로 끌기 시작해야 정해진다(advanceArrowDrag)
    geomPreview: type === 'ARROW' ? { k: 'ARROW', points: [n] } : shapeFrom(type, n, n),
    arrowAngles: type === 'ARROW' ? [] : null,
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

/**
 * 시작점·끝점(정규화)에서 영역 기하를 만든다.
 * **ARROW 는 여기로 오지 않는다** — 각도(45도 스냅)가 있어야 하는 도형이라
 * `onPointerMove`/`commitCreateShape` 의 CREATE_SHAPE 분기가 따로 만든다.
 */
function shapeFrom(type: MarkType, a: NPoint, b: NPoint): MarkGeometry {
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
    arrowAngles: null,
    eraseId: null,
    erasedCount: 0,
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
    const hit = hitTest(
      ev.screen,
      screens,
      state.selection,
      memoScreensOf(state, ctx),
      hitProfileOf(ctx),
    );
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
    return ok(same ? { ...state, keys: ev.keys } : { ...state, keys: ev.keys, hover }, ctx);
  }

  if (drag.pointerId !== ev.pointerId) return ok(state, ctx);

  // ── D14 지우개 — 지나가는 동안 계속 지운다 ───────────────────────────────
  // 커맨드는 매번 나가지만 `eraseId` 가 같아 `pushHistory` 가 **한 단계로 합친다**
  if (drag.kind === 'ERASE') {
    const cmd = eraseCommandAt(state, ev.screen, ctx, drag.eraseId ?? '');
    const next: CanvasState = {
      ...state,
      keys: ev.keys,
      drag: {
        ...drag,
        moved: true,
        erasedCount: drag.erasedCount + (cmd ? 1 : 0),
      },
    };
    return ok(next, ctx, cmd ? [cmd] : []);
  }

  const moved = drag.moved || dist(ev.screen, drag.startScreen) > hitProfileOf(ctx).clickSlop;
  const iw = state.drawing.imageWidth;
  const ih = state.drawing.imageHeight;

  // ── C-4b 일괄 이동 — 델타만 담는다. 문서는 손을 뗄 때 한 번에 바뀐다 ─────
  if (drag.kind === 'MOVE_MULTI') {
    const ids = new Set(state.multi);
    // 잠긴 결함은 따라오지 않는다 — 선택은 됐지만 이동 대상이 아니다
    const moving = (ctx.defects ?? []).filter((d) => ids.has(d.id) && !isLocked(d));
    const raw = {
      dx: (ev.screen.x - drag.startScreen.x) / drag.startViewport.zoom / iw,
      dy: (ev.screen.y - drag.startScreen.y) / drag.startViewport.zoom / ih,
    };
    const d2 = clampDefectsTranslate(moving, raw.dx, raw.dy);
    return ok(
      {
        ...state,
        keys: ev.keys,
        drag: { ...drag, moved, previewNorm: { x: d2.dx, y: d2.dy } },
      },
      ctx,
    );
  }

  // ── C-4 영역선택 — 사각형만 키운다. 문서도 선택도 아직 안 바꾼다 ─────────
  if (drag.kind === 'MARQUEE') {
    return ok(
      {
        ...state,
        keys: ev.keys,
        drag: { ...drag, moved, previewNorm: toNorm(ev.screen, drag.startViewport, iw, ih) },
      },
      ctx,
    );
  }

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

    // 방향(화살표) — 마우스가 실제로 지나간 대로 그린다. 첫 구간은 45도(8방향),
    // 그 뒤로 옆으로 벗어나면 직전 구간 기준 90도 상대로 최대 2번까지 꺾인다(advanceArrowDrag).
    // Shift 는 필요 없다 — 자유각이 아예 없으니 축 고정을 따로 둘 이유가 없다
    if (type === 'ARROW') {
      const g = drag.geomPreview;
      if (!g || g.k !== 'ARROW') return ok(state, ctx);
      const ptsS = g.points.map((p) => toScreen(p, state.viewport, iw, ih));
      const next = advanceArrowDrag(ptsS, drag.arrowAngles ?? [], ev.screen);
      const points = next.points.map((p) => {
        const n = toNorm(p, state.viewport, iw, ih);
        return { x: clamp(n.x, 0, 1), y: clamp(n.y, 0, 1) };
      });
      const geometry: MarkGeometry = { k: 'ARROW', points };
      return ok(
        {
          ...state,
          keys: ev.keys,
          guides: [],
          drag: { ...drag, moved, geomPreview: geometry, arrowAngles: next.angles },
        },
        ctx,
      );
    }

    // Shift = 정사각/정원(영역). **스크린에서** 판정해야 화면에서 반듯하다
    let endS: SPoint = ev.screen;
    if (ev.keys.shift) endS = squareTo(startS, endS);
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
    // ARROW 는 여기 오지 않는다 — 핸들이 없다(2026-08-24 개정, hitTest 가 더 이상
    // ARROW 에 대해 'HANDLE' 을 내지 않는다). 남는 것은 AREA_RECT · AREA_ELLIPSE 뿐이다
    let next: MarkGeometry = origin;
    if (origin.k === 'AREA_RECT' || origin.k === 'AREA_ELLIPSE') {
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

/**
 * C-4 — 사각형에 **걸친** 결함 id 들. 겹치기만 해도 잡는다(완전 포함 아님) —
 * 현장에서 대충 두르는 제스처라 완전 포함을 요구하면 거의 안 잡힌다.
 *
 * 잠긴 결함(전회차 · 보수완료)도 **선택은 된다.** 삭제 · 이동에서만 빠지고,
 * 그 사실은 그때 안내한다 — 선택 단계에서 조용히 빼면 "왜 안 잡히지" 가 된다.
 *
 * 판정 대상은 번호 풍선과 마크 중심이다. 자유그리기 획은 결함 표기가 아니라 제외한다.
 */
function defectsInRect(screens: readonly DefectScreen[], rect: SRect): string[] {
  const out: string[] = [];
  for (const s of screens) {
    const br = s.balloonR + s.labelHalfExtra;
    const hitLabel = rectsIntersect(
      s.label.x - br,
      s.label.y - br,
      br * 2,
      br * 2,
      rect.x,
      rect.y,
      rect.w,
      rect.h,
    );
    const hitMark =
      !hitLabel &&
      s.marks.some((m) =>
        m.rect
          ? rectsIntersect(m.rect.x, m.rect.y, m.rect.w, m.rect.h, rect.x, rect.y, rect.w, rect.h)
          : rectsIntersect(
              m.center.x - s.markR,
              m.center.y - s.markR,
              s.markR * 2,
              s.markR * 2,
              rect.x,
              rect.y,
              rect.w,
              rect.h,
            ),
      );
    if (hitLabel || hitMark) out.push(s.defectId);
  }
  return out;
}

/**
 * C-4 — 지금 그려지고 있는 영역선택 사각형(스크린 px). 없으면 `null`.
 *
 * 순수 파생값이다 — 저장·Undo 어디에도 안 들어간다. 렌더러가 이걸 받아 점선 상자를 그린다.
 */
export function marqueeRectOf(state: CanvasState): SRect | null {
  const d = state.drag;
  if (!d || d.kind !== 'MARQUEE' || !d.moved || !d.createStart || !state.drawing) return null;
  const iw = state.drawing.imageWidth;
  const ih = state.drawing.imageHeight;
  const a = toScreen(d.createStart, d.startViewport, iw, ih);
  const b = toScreen(d.previewNorm, d.startViewport, iw, ih);
  return normalizeRect(a.x, a.y, b.x, b.y);
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

  // ── C-4b 일괄 이동 확정 ────────────────────────────────────────────────
  if (drag.kind === 'MOVE_MULTI') {
    const dx = drag.previewNorm.x;
    const dy = drag.previewNorm.y;
    if (!drag.moved || (dx === 0 && dy === 0)) return ok(cleared, ctx);
    const ids = new Set(state.multi);
    const moving = (ctx.defects ?? []).filter((d) => ids.has(d.id) && !isLocked(d));
    if (moving.length === 0) return ok(cleared, ctx);
    const lockedCount = state.multi.length - moving.length;
    return ok(
      cleared,
      ctx,
      [{ k: 'TRANSLATE_DEFECTS', defectIds: moving.map((d) => d.id), dx, dy }],
      lockedCount > 0
        ? [
            {
              k: 'TOAST',
              kind: 'info',
              text: `${moving.length}건을 옮겼습니다 — ${lockedCount}건은 잠겨 있어 그대로입니다`,
              undoable: true,
            },
          ]
        : [],
    );
  }

  // ── C-4 영역선택 확정 — 사각형에 걸친 결함을 한꺼번에 잡는다 ───────────
  if (drag.kind === 'MARQUEE') {
    // 끌지 않은 클릭이면 그냥 선택 해제다. 빈 곳을 눌렀을 때의 기존 동작과 같다
    if (!drag.moved || !state.drawing || !drag.createStart) {
      return ok({ ...cleared, selection: { ...NO_SELECTION }, multi: [] }, ctx);
    }
    const iw = state.drawing.imageWidth;
    const ih = state.drawing.imageHeight;
    const a = toScreen(drag.createStart, drag.startViewport, iw, ih);
    const b = toScreen(drag.previewNorm, drag.startViewport, iw, ih);
    const rect = normalizeRect(a.x, a.y, b.x, b.y);
    const ids = defectsInRect(screensOf(state, ctx), rect);
    if (ids.length === 0) {
      return ok({ ...cleared, selection: { ...NO_SELECTION }, multi: [] }, ctx);
    }
    return ok(
      { ...cleared, selection: { ...NO_SELECTION }, multi: ids },
      ctx,
      [],
      [
        {
          k: 'TOAST',
          kind: 'info',
          text: `${ids.length}개를 선택했습니다 — Delete 로 삭제하거나 끌어서 옮기세요`,
        },
      ],
    );
  }

  if (drag.kind === 'PAN') {
    if (drag.moved) return ok(cleared, ctx);
    // 이동 없는 클릭
    if (drag.pointToolCandidate && state.drawing) {
      if (state.tool === 'POINT') return createDefectAt(cleared, ev.screen, ctx);
    }
    return ok({ ...cleared, selection: { ...NO_SELECTION } }, ctx);
  }

  // ── D14 지우개 — 커맨드는 이미 나갔다. 여기서는 결과만 알린다 ───────────
  if (drag.kind === 'ERASE') {
    if (drag.erasedCount === 0) return ok(cleared, ctx);
    return ok(
      cleared,
      ctx,
      [],
      [
        {
          k: 'TOAST',
          kind: 'info',
          text: drag.erasedCount === 1 ? '필기를 지웠습니다' : `필기 ${drag.erasedCount}획을 지웠습니다`,
          // 드래그 1회 = Undo 1스텝이므로 [되돌리기] 한 번이면 전부 돌아온다
          undoable: true,
        },
      ],
    );
  }

  // ── S2a 커밋 ─────────────────────────────────────────────────────────────
  if (drag.kind === 'CREATE_SHAPE') return commitCreateShape(cleared, drag, ctx);
  if (drag.kind === 'CREATE_SKETCH') {
    // F2 — 같은 드래그, 다른 결과물. 메모는 결함이 아니다
    return state.tool === 'MEMO'
      ? commitCreateMemoInk(cleared, drag, ctx)
      : commitCreateSketch(cleared, drag, ctx);
  }

  if (drag.kind === 'MOVE_MEMO') {
    const memo = findMemo(ctx, drag.memoId);
    if (!memo || !drag.moved) return ok(cleared, ctx);
    // U-2: 옮겨진 자리가 바로 보인다 — 토스트 없음. 커맨드(Undo 스택)는 그대로
    return ok(cleared, ctx, [
      {
        k: 'MOVE_MEMO',
        memoId: memo.id,
        from: roundNorm(memo.pos),
        to: roundNorm(drag.previewNorm),
      },
    ]);
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
      // U-2: 옮기거나 크기를 바꾼 결과는 그 자리에 바로 보이므로 알리지 않는다.
      // (Q62 — 애초 "제거" 표에는 없었으나, 옆의 위치변경 토스트와의 일관성을 위해 함께 뺐다)
      [],
    );
  }

  if (drag.kind === 'MOVE_SKETCH') {
    if (!drag.pathId || !drag.pathOrigin || !drag.pathPreview) return ok(cleared, ctx);
    // U-2: 옮겨진 획이 바로 보인다 — 토스트 없음
    return ok(cleared, ctx, [
      {
        k: 'MOVE_SKETCH',
        defectId: defect.id,
        pathId: drag.pathId,
        from: drag.pathOrigin.map(roundNorm),
        to: drag.pathPreview.map(roundNorm),
      },
    ]);
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
    // U-2: 번호가 새 자리에 바로 그려진다 — 토스트 없음
    return ok(cleared, ctx, [cmd]);
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
  // U-2: 옮겨진 표기가 바로 보인다 — 토스트 없음
  return ok(cleared, ctx, [cmd]);
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
    prevDefectId: null, // 새로 만든 결함 — 전회차 참조 없음 (F7)
    marks: [
      { id: markId, defectId, type: 'POINT', geometry: { k: 'POINT', x: at.x, y: at.y }, sortOrder: 0 },
    ],
    label: { defectId, x: auto.x, y: auto.y, anchorMarkId: markId, placed: false },
    sketch: [],
    style: null,
    // D3: 부재·결함유형이 비어 있어도 된다. 미완성 여부는 isIncomplete() 로 파생한다.
    // 속성 초기값은 **한 곳(EMPTY_DEFECT_ATTRS)** 에만 있다 — 필드가 늘어도 여기를 안 고친다
    ...EMPTY_DEFECT_ATTRS,
    // 병합 재료(Phase 5 · D23). 초기값은 **한 곳(newDefectBase)** 에만 있다
    ...newDefectBase(ctx.now ? ctx.now() : null, ctx.deviceId ?? ''),
    ...(ctx.defaultAttrs ?? {}),
  };

  // U-2: 새 표기가 캔버스에 바로 그려진다 — 토스트 없음. REVEAL 은 유지
  return ok(
    { ...state, selection: { defectId, part: 'MARK', markId } },
    ctx,
    [{ k: 'CREATE_DEFECT', defect }],
    [{ k: 'REVEAL_DEFECT', defectId }],
  );
}

// ── 영역 생성 커밋 (§S2a-2) — 방향(화살표)도 여기서 만든다(2026-08-24 재개정) ──
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
  if (g.k === 'ARROW') {
    // 방향이 아직 안 잡혔으면(점 1개뿐) 취소 — advanceArrowDrag 가 최소 이동량을 넘겨야
    // 두 번째 점을 낸다
    if (g.points.length < 2) {
      return ok(state, ctx, [], [
        { k: 'TOAST', kind: 'warn', text: '끌어서 방향을 정해 주세요' },
      ]);
    }
  } else {
    const a = { x: g.x, y: g.y };
    const b = g.k === 'AREA_RECT' || g.k === 'AREA_ELLIPSE' ? { x: g.x + g.w, y: g.y + g.h } : a;
    const aS = toScreen(a, state.viewport, iw, ih);
    const bS = toScreen(b, state.viewport, iw, ih);
    if (dist(aS, bS) < CREATE_MIN_DRAG_PX) {
      return ok(state, ctx, [], [
        { k: 'TOAST', kind: 'warn', text: '끌어서 크기를 지정해 주세요' },
      ]);
    }
  }

  const defectId = ctx.makeId();
  const markId = ctx.makeId();
  const geometry = roundGeometry(g);
  const anchor = centerOfGeometry(geometry);
  if (!anchor) return ok(state, ctx);

  let maxSeq = 0;
  for (const d of ctx.defects) if (d.seq > maxSeq) maxSeq = d.seq;
  // 방향 결함은 번호가 마지막 구간 방향을 따라 이어서 시작한다 — 그래야 번호로 가는
  // 리더선이 화살표 몸통과 한 줄로 보인다. 다른 타입은 기존 기본 각도(우상단 45도)
  const angleOverride =
    geometry.k === 'ARROW' ? (arrowLastLegAngleDeg(geometry.points, iw, ih) ?? undefined) : undefined;
  const auto = roundNorm(
    autoLabelNorm(anchor, ctx.globalStyle.balloonRadius, iw, ih, angleOverride),
  );

  const defect: Defect = {
    id: defectId,
    projectId: ctx.projectId ?? '',
    drawingId: state.drawing.id,
    floorId: ctx.floorId ?? '',
    seq: maxSeq + 1,
    status: 'CURRENT',
    prevDefectId: null, // 새로 만든 결함 — 전회차 참조 없음 (F7)
    marks: [{ id: markId, defectId, type: drag.createType, geometry, sortOrder: 0 }],
    label: { defectId, x: auto.x, y: auto.y, anchorMarkId: markId, placed: false },
    sketch: [],
    style: null,
    // D3: 부재·결함유형이 비어 있어도 된다. 미완성 여부는 isIncomplete() 로 파생한다.
    // 속성 초기값은 **한 곳(EMPTY_DEFECT_ATTRS)** 에만 있다 — 필드가 늘어도 여기를 안 고친다
    ...EMPTY_DEFECT_ATTRS,
    // 병합 재료(Phase 5 · D23). 초기값은 **한 곳(newDefectBase)** 에만 있다
    ...newDefectBase(ctx.now ? ctx.now() : null, ctx.deviceId ?? ''),
    ...(ctx.defaultAttrs ?? {}),
  };

  // U-2: 새 표기가 캔버스에 바로 그려진다 — 토스트 없음. REVEAL 은 유지
  return ok(
    { ...state, selection: { ...NO_SELECTION, defectId, part: 'MARK', markId } },
    ctx,
    [{ k: 'CREATE_DEFECT', defect }],
    [{ k: 'REVEAL_DEFECT', defectId }],
  );
}

/**
 * 자유그리기 커밋 — **F2 사후연결** (Q16 재결정).
 *
 * 선택된 결함이 있으면 그대로 붙인다(기존 동작). 없으면 **버리지 않고**
 * `pendingSketch` 에 담아 두고 붙일 곳을 고르게 한다 — 사용자 요구:
 * *"그리기는 자유그리기 후 결함번호 선택 또는 추가"*.
 * 대기 중에 더 그리면 획이 쌓인다.
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
  const path0: SketchPath = {
    id: ctx.makeId(),
    points: pts.map(roundNorm),
    width: ctx.globalStyle.sketchWidth,
  };

  // 그리기는 **항상 새 결함을 만든다** — 지금 다른 결함이 선택돼 있어도 몰래 거기
  // 붙지 않는다(2026-08-24, 사용자 지시로 F2 사후연결의 "붙이기" 경로를 없앴다).
  // "이 도형이 무슨 결함인지"는 그리기 자체가 답이지, 그리기 전에 우연히 선택돼
  // 있던 다른 결함이 아니다. 여러 획을 모아 한 결함으로 만들 수 있게 대기만 시키고,
  // 완료는 [그리기 완료]로 한다(→ pendingSketchToNewDefect).
  const prev = state.pendingSketch?.paths ?? [];
  const pending = { paths: [...prev, path0] };
  const text =
    prev.length === 0
      ? '그리기 1획 — 계속 그리거나 [그리기 완료]를 누르세요'
      : `그리기 ${pending.paths.length}획 대기 중`;
  return ok({ ...state, pendingSketch: pending }, ctx, [], [{ k: 'TOAST', kind: 'info', text }]);
}

// ── F2 사후연결 — 그리기 완료(항상 새 결함) ─────────────────────────────────
/**
 * 대기 중인 획의 **중심**에 새 결함(POINT 마크)을 만들고 그 획을 함께 넣는다.
 * 상세기획 §3-3 에서 `marks` 는 1개 이상이 필수라 스케치만으로는 결함이 될 수 없다.
 * 커맨드는 `CREATE_DEFECT` 하나뿐이라 Undo 한 번으로 통째로 되돌아간다.
 */
function pendingSketchToNewDefect(state: CanvasState, ctx: ReduceContext): ReduceResult {
  const pending = state.pendingSketch;
  if (!pending || pending.paths.length === 0 || !state.drawing) return ok(state, ctx);
  const iw = state.drawing.imageWidth;
  const ih = state.drawing.imageHeight;

  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const path of pending.paths) {
    for (const pt of path.points) {
      sx += pt.x;
      sy += pt.y;
      n += 1;
    }
  }
  if (n === 0) return ok(state, ctx);
  const at = roundNorm({ x: clamp(sx / n, 0, 1), y: clamp(sy / n, 0, 1) });

  const defectId = ctx.makeId();
  const markId = ctx.makeId();
  let maxSeq = 0;
  for (const d of ctx.defects) if (d.seq > maxSeq) maxSeq = d.seq;
  const auto = roundNorm(autoLabelNorm(at, ctx.globalStyle.balloonRadius, iw, ih));

  const defect: Defect = {
    id: defectId,
    projectId: ctx.projectId ?? '',
    drawingId: state.drawing.id,
    floorId: ctx.floorId ?? '',
    seq: maxSeq + 1,
    status: 'CURRENT',
    prevDefectId: null,
    marks: [
      { id: markId, defectId, type: 'POINT', geometry: { k: 'POINT', x: at.x, y: at.y }, sortOrder: 0 },
    ],
    label: { defectId, x: auto.x, y: auto.y, anchorMarkId: markId, placed: false },
    sketch: pending.paths,
    style: null,
    ...EMPTY_DEFECT_ATTRS,
    // 병합 재료(Phase 5 · D23). 초기값은 **한 곳(newDefectBase)** 에만 있다
    ...newDefectBase(ctx.now ? ctx.now() : null, ctx.deviceId ?? ''),
    ...(ctx.defaultAttrs ?? {}),
  };

  return ok(
    {
      ...state,
      pendingSketch: null,
      selection: { ...NO_SELECTION, defectId, part: 'MARK', markId },
    },
    ctx,
    [{ k: 'CREATE_DEFECT', defect }],
    // U-2: 만들어진 결함이 캔버스에 바로 보인다 — 토스트 없음. REVEAL 은 유지
    [{ k: 'REVEAL_DEFECT', defectId }],
  );
}

// ── 메모 생성 — F2 필기 메모 ───────────────────────────────────────────────
/**
 * 손글씨 메모 커밋. 사용자 요구: *"메모→자유그리기처럼 동작(필기메모)"*.
 *
 * 그리기(결함 스케치)와 **같은 드래그 커널**을 쓰지만 결과물이 다르다:
 *   · 결함에 붙지 않는다 — 별도 `memos` 스토어의 독립 레코드다
 *   · 결함 상태색을 쓰지 않는다 — 중립 앰버(`MEMO_INK`) + 점선 상자
 *   · 번호·리더선이 붙지 않고 결함 리스트에도 나오지 않는다
 *
 * 한 획 = 메모 하나다. 여러 획으로 이어 쓰고 싶으면 메모를 여러 개 만든다
 * (결함 스케치의 "사후연결 대기"처럼 묶는 개념은 메모에 없다 — 붙일 대상이 없기 때문).
 */
function commitCreateMemoInk(
  state: CanvasState,
  drag: DragState,
  ctx: ReduceContext,
): ReduceResult {
  const pts = drag.pathPreview ?? [];
  if (pts.length < 2) {
    return ok(state, ctx, [], [{ k: 'TOAST', kind: 'warn', text: '끌어서 메모를 써 주세요' }]);
  }
  if (!state.drawing) return ok(state, ctx);

  const path: SketchPath = {
    id: ctx.makeId(),
    points: pts.map(roundNorm),
    width: MEMO_INK_WIDTH,
  };
  const now = (ctx.now ?? (() => 0))();
  // 색상 선택(2026-09-03) — 기본 앰버 그대로면 예전처럼 style:null 로 남긴다(마이그레이션 없음).
  // 프리셋을 골랐을 때만 style.color 에 기록한다
  const memoStyle = state.memoInkColor === MEMO_INK ? null : { color: state.memoInkColor };
  const memo: Memo = {
    id: ctx.makeId(),
    projectId: ctx.projectId ?? '',
    drawingId: state.drawing.id,
    floorId: ctx.floorId ?? '',
    // 앵커는 획 묶음의 좌상단. MOVE_MEMO 가 pos 와 획을 같은 델타로 옮긴다
    pos: roundNorm(inkAnchor([path])),
    text: '',
    paths: [path],
    style: memoStyle,
    createdAt: now,
    updatedAt: now,
    deviceId: ctx.deviceId ?? '',
    createdBy: null,
  };
  return ok(
    {
      ...state,
      selection: { ...NO_SELECTION, part: 'MEMO', memoId: memo.id },
      // T-1 — 이번 획은 "쓰는 중" 으로 표시해 점선 상자를 붙이지 않는다.
      // 세션 종료(`endInkSessionIfStale`) 전까지 유지된다
      inkMemoId: memo.id,
    },
    ctx,
    // U-2: 쓴 글씨가 그 자리에 그대로 보인다 — 토스트 없음
    [{ k: 'CREATE_MEMO', memo }],
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
      return { k: 'ARROW', points: g.points.map((p) => roundNorm(p)) };
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
    // 꺾은선 전체가 한 점처럼 작은가 — 점들을 감싸는 bbox 로 판정한다
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of g.points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return maxX - minX < TINY && maxY - minY < TINY;
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
  const iw = state.drawing.imageWidth;
  const ih = state.drawing.imageHeight;
  // 방향(화살표) 결함은 초기화도 마지막 구간 방향을 따라간다 — 생성 직후와 같은 규칙
  const angleOverride =
    d.marks.length === 1 && d.marks[0]!.geometry.k === 'ARROW'
      ? (arrowLastLegAngleDeg(d.marks[0]!.geometry.points, iw, ih) ?? undefined)
      : undefined;
  // 늘어난 풍선 폭까지 반영한다 — 초기화 결과가 `defectScreen` 의 자동배치와 같아야 한다
  const extra = balloonHalfExtra(
    ctx.displayNumbers?.[d.id] ?? '',
    style.balloonRadius,
    style.fontSize,
  );
  const to = roundNorm(autoLabelNorm(a, style.balloonRadius, iw, ih, angleOverride, extra));
  // U-2: 이미 자동 배치면 바뀔 게 없다 — 조용히 넘어간다
  if (!d.label.placed) return ok(state, ctx);
  // U-2: 번호가 제자리로 돌아가는 게 바로 보인다 — 토스트 없음. 커맨드는 그대로
  return ok(state, ctx, [
    {
      k: 'RESET_LABEL',
      defectId,
      from: roundNorm({ x: d.label.x, y: d.label.y }),
      to,
      fromPlaced: d.label.placed,
      toPlaced: false,
    },
  ]);
}

// ── 삭제 (§2-8-e) ──────────────────────────────────────────────────────────
function onDelete(state: CanvasState, ctx: ReduceContext): ReduceResult {
  const sel = state.selection;

  /*
   * C-4 (D32) — 영역선택이 있으면 그쪽이 우선이다.
   *
   * 잠긴 결함(전회차 · 보수완료)은 **조용히 빠진다.** 선택은 됐지만 지워지지 않는다는
   * 사실을 확인 창에서 숫자로 말해 준다 — 아무 말 없이 빼면 "왜 몇 개는 안 지워지지" 가 된다.
   */
  if (state.multi.length > 0) {
    const targets = state.multi
      .map((id) => findDefect(ctx, id))
      .filter((d): d is Defect => d !== null);
    const deletable = targets.filter((d) => !isLocked(d));
    const lockedCount = targets.length - deletable.length;
    if (deletable.length === 0) {
      return ok({ ...state, multi: [] }, ctx, [], [
        {
          k: 'TOAST',
          kind: 'warn',
          text: '선택한 표기가 모두 잠겨 있어 삭제할 수 없습니다',
        },
      ]);
    }
    return ok(state, ctx, [], [
      {
        k: 'CONFIRM_DELETE_DEFECTS',
        defectIds: deletable.map((d) => d.id),
        lockedCount,
      },
    ]);
  }

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

  // 번호 풍선(LABEL)을 선택한 채 삭제하면 — 이것이 결함을 선택하는 가장 흔한 방법이다
  // (SELECT_DEFECT 가 항상 part:'LABEL' 로 선택한다) — **결함 자체**를 지운다.
  // 예전에는 여기서 거부하고 토스트만 냈는데, 그러면 잘못 찍은 결함을 지울 방법이
  // 사실상 없었다(2026-08-24 사용자 신고). 아래 공통 흐름(확인 후 결함 전체 삭제)으로
  // 그대로 떨어뜨린다 — part !== 'MARK' 이므로 reason 은 'EXPLICIT'.

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
    // F2 — 대기 중인 자유그리기가 있으면 그것부터 버린다(선택 해제보다 먼저).
    // 방향(화살표)은 이제 드래그 한 번으로 끝나므로(생성 중 Escape 는 drag 분기가 처리) 여기 없다
    // U-2: 대기 중이던 획이 화면에서 사라지는 것으로 취소가 보인다 — 토스트 없음
    if (s.pendingSketch && !s.drag) return ok({ ...s, pendingSketch: null }, ctx);
    if (s.drag) {
      // originNorm 으로 복귀 후 취소. 커밋하지 않았으므로 drag 를 버리면 원위치다
      // — 두 번째 포인터 취소(A2/T3)와 **같은 함수**를 탄다. 취소 규칙은 하나여야 한다
      return ok(cancelDrag(s), ctx);
    }
    return ok({ ...s, selection: { ...NO_SELECTION } }, ctx);
  }

  if (key === 'Delete' || key === 'Backspace') {
    // C-4 — 영역선택은 단일 `selection` 을 비운다. `defectId` 만 보면 여기서 막혀
    // `onDelete` 의 다중 분기까지 가지도 못한다 (사용자 신고 2026-09-03)
    if (!s.selection.defectId && s.multi.length === 0) return ok(s, ctx);
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
