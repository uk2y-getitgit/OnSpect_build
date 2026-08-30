/**
 * 앱 상태 — 문서(Defect[]) + Undo 스택 + 캔버스 상태 + UI 부수효과.
 *
 * 어댑터는 코어 상태를 직접 mutate 하지 않는다(경계 규칙 5).
 * 캔버스 상태 변경은 전부 `reduce()`, 문서 변경은 전부 `applyCommand()` 를 통한다.
 *
 * ⚠️ **모든 쓰기는 로컬 우선이다** (불변식 3).
 *    커맨드가 확정되는 순간 메모리 상태가 바뀌고, 저장(IndexedDB)은 그 뒤를 따라간다.
 *    **UI 는 저장 완료를 기다리지 않는다.** 서버를 `await` 하는 코드는 한 줄도 없다.
 *    저장 대상은 `writes` 에 쌓이고 `CanvasRoute` 가 250ms 디바운스로 흘려보낸다 (§2-9-e).
 */
import {
  applyToDoc,
  attrsOf,
  canRedo,
  changedAttrKeys,
  canUndo,
  DEFAULT_GLOBAL_STYLE,
  defectTargetOf,
  describeCommand,
  EMPTY_HISTORY,
  initialCanvasState,
  isLocked,
  memoTargetsOf,
  pushHistory,
  redo as redoStack,
  reduce,
  undo as undoStack,
  type CanvasState,
  type Command,
  type Defect,
  type DefectAttrs,
  type Doc,
  type DrawingRef,
  type Effect,
  type History,
  type InputEvent,
  type Memo,
  type ReduceContext,
} from '@onspect/canvas-core';
import type { ToastItem } from './ui/Overlays';

export type Toast = ToastItem;

export type ConfirmState = { defectId: string; reason: 'LAST_MARK' | 'EXPLICIT' } | null;
export type MenuState = { x: number; y: number; defectId: string } | null;

/** 아직 저장되지 않은 변경 (§2-9-e 레코드 단위 upsert) */
export type PendingWrites = {
  /** 값이 바뀔 때마다 오른다. 저장 이펙트의 트리거 */
  seq: number;
  upsert: Defect[];
  remove: string[];
  /** 메모는 다른 스토어다. 결함과 섞지 않는다 */
  memoUpsert: Memo[];
  memoRemove: string[];
};

export const NO_WRITES: PendingWrites = {
  seq: 0,
  upsert: [],
  remove: [],
  memoUpsert: [],
  memoRemove: [],
};

export type AppState = {
  projectId: string;
  defects: Defect[];
  /** 메모 레이어. **결함이 아니다** — 결함 리스트에 나타나지 않는다 (§S2a-1) */
  memos: Memo[];
  history: History;
  canvas: CanvasState;
  floorId: string;
  writes: PendingWrites;
  toasts: Toast[];
  confirm: ConfirmState;
  menu: MenuState;
  /** 리스트를 이 결함으로 스크롤해 달라는 요청 */
  reveal: string | null;
  /** 값이 바뀌면 우측 패널로 포커스를 옮긴다 */
  focusTick: number;
  /** 텍스트 편집기를 열어야 할 메모. `EDIT_MEMO` 이펙트가 채운다 */
  editingMemoId: string | null;
  /**
   * 새 결함에 얹을 **프로젝트 고정 기본값**. 지금은 이 용역의 기본 구조유형뿐이다.
   *
   * 이 용역의 **설정 스냅샷**에서 온다(S2b · D6) —
   * `project-core` 의 `seedAttrs()` 결과를 라우트가 `LOAD` 로 넣어 준다.
   *
   * ⚠️ 2026-08-28 D18 — **직전 입력 자동 이어받기(D9)는 폐기됐다.**
   *    이 값은 `LOAD` 이후 **절대 갱신되지 않는다.** 분류·판정을 재사용하려면
   *    결함정보 폼의 `[유사결함 불러오기]` 로 사용자가 직접 고른다.
   */
  defaultAttrs: Partial<DefectAttrs>;
  idSeed: number;
  toastSeed: number;
};

export type Action =
  | { t: 'INPUT'; ev: InputEvent }
  | { t: 'SET_FLOOR'; floorId: string; drawing: DrawingRef | null }
  | {
      t: 'LOAD';
      projectId: string;
      defects: Defect[];
      memos: Memo[];
      defaultAttrs?: Partial<DefectAttrs>;
    }
  /**
   * 결함 속성 편집 (S2b). 폼은 **다음 값 전체**를 올린다 — 연동 규칙(§3-6)이 한 필드
   * 변경으로 3~4 필드를 함께 바꾸기 때문이다. 여기서 `SET_DEFECT_ATTRS` 커맨드로 바꿔
   * 마커 이동과 **같은 Undo 스택**에 쌓고, 같은 저장 대기열로 흘려보낸다.
   */
  /**
   * `toast` 를 주면 **커밋에 성공했을 때만** 그 문구를 [되돌리기] 가능 토스트로 띄운다.
   * `[유사결함 불러오기]`(D18) 가 쓴다 — 조기 반환(잠김·변경 없음)에서는 아무 말도 하지 않는다.
   */
  | { t: 'SET_DEFECT_ATTRS'; defectId: string; attrs: DefectAttrs; toast?: string }
  | { t: 'FLUSHED'; seq: number }
  | { t: 'UNDO' }
  | { t: 'REDO' }
  | { t: 'DISMISS_TOAST'; id: number }
  | { t: 'CLOSE_MENU' }
  | { t: 'CLOSE_CONFIRM' }
  | { t: 'CLEAR_REVEAL' }
  | { t: 'EDIT_MEMO'; memoId: string | null };

export function initialAppState(init: {
  projectId: string;
  floorId: string;
  defects: Defect[];
  memos?: Memo[];
}): AppState {
  return {
    projectId: init.projectId,
    defects: init.defects,
    memos: init.memos ?? [],
    history: EMPTY_HISTORY,
    canvas: initialCanvasState(),
    floorId: init.floorId,
    writes: NO_WRITES,
    toasts: [],
    confirm: null,
    menu: null,
    reveal: null,
    focusTick: 0,
    editingMemoId: null,
    defaultAttrs: {},
    idSeed: 1,
    toastSeed: 1,
  };
}

export function defectsOfDrawing(defects: readonly Defect[], drawingId: string | null): Defect[] {
  if (!drawingId) return [];
  return defects
    .filter((d) => d.drawingId === drawingId)
    .sort((a, b) => (a.seq !== b.seq ? a.seq - b.seq : a.id < b.id ? -1 : 1));
}

export function memosOfDrawing(memos: readonly Memo[], drawingId: string | null): Memo[] {
  if (!drawingId) return [];
  return memos.filter((m) => m.drawingId === drawingId);
}

/**
 * 캔버스가 그릴 숫자. **여기가 주입 지점이다** (§2-1-b).
 * Phase 4 조사위치도 출력은 같은 렌더 모델에 `assignNumbers()` 결과를 넣어 재사용한다.
 */
export function displayNumbersOf(defects: readonly Defect[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of defects) out[d.id] = String(d.seq);
  return out;
}

export function appReducer(state: AppState, action: Action): AppState {
  switch (action.t) {
    case 'INPUT':
      return runInput(state, action.ev);

    case 'LOAD':
      return {
        ...state,
        projectId: action.projectId,
        defects: action.defects,
        memos: action.memos,
        defaultAttrs: action.defaultAttrs ?? {},
        history: EMPTY_HISTORY,
        writes: NO_WRITES,
      };

    case 'SET_DEFECT_ATTRS':
      return setDefectAttrs(state, action.defectId, action.attrs, action.toast);

    case 'EDIT_MEMO':
      return { ...state, editingMemoId: action.memoId };

    case 'FLUSHED':
      // 흘려보낸 뒤에도 새 변경이 들어왔으면 그대로 둔다
      return state.writes.seq === action.seq ? { ...state, writes: NO_WRITES } : state;

    case 'SET_FLOOR': {
      return runInput(
        { ...state, floorId: action.floorId, menu: null, confirm: null },
        { k: 'SET_DRAWING', drawing: action.drawing },
      );
    }

    case 'UNDO': {
      if (!canUndo(state.history)) return state;
      const r = undoStack(docOf(state), state.history);
      const withWrites = recordCommandWrites(
        {
          ...state,
          defects: r.doc.defects as Defect[],
          memos: r.doc.memos as Memo[],
          history: r.history,
        },
        r.command,
      );
      return {
        ...withToast(
          withWrites,
          'info',
          r.command ? `되돌렸습니다 — ${describeCommand(r.command)}` : '되돌렸습니다',
          false,
        ),
        canvas: dropStaleSelection(withWrites).canvas,
        // 되돌리기로 사라진 메모의 편집기가 떠 있으면 닫는다
        editingMemoId: withWrites.memos.some((m) => m.id === state.editingMemoId)
          ? state.editingMemoId
          : null,
      };
    }

    case 'REDO': {
      if (!canRedo(state.history)) return state;
      const r = redoStack(docOf(state), state.history);
      const withWrites = recordCommandWrites(
        {
          ...state,
          defects: r.doc.defects as Defect[],
          memos: r.doc.memos as Memo[],
          history: r.history,
        },
        r.command,
      );
      return {
        ...withToast(
          withWrites,
          'info',
          r.command ? `다시 실행 — ${describeCommand(r.command)}` : '다시 실행했습니다',
          false,
        ),
        canvas: dropStaleSelection(withWrites).canvas,
      };
    }

    case 'DISMISS_TOAST':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };

    case 'CLOSE_MENU':
      return { ...state, menu: null };

    case 'CLOSE_CONFIRM':
      return { ...state, confirm: null };

    case 'CLEAR_REVEAL':
      return { ...state, reveal: null };

    default:
      return state;
  }
}

function docOf(state: AppState): Doc {
  return { defects: state.defects, memos: state.memos };
}

/**
 * 저장 대기열에 올린다. 적용 **후** 문서에서 해당 레코드를 찾아
 * 있으면 upsert, 없으면 remove 로 분류한다 — Undo 도 같은 경로를 탄다.
 */
function recordWrite(state: AppState, defectId: string | null): AppState {
  if (!defectId) return state;
  const d = state.defects.find((x) => x.id === defectId) ?? null;
  const upsert = state.writes.upsert.filter((x) => x.id !== defectId);
  const remove = state.writes.remove.filter((x) => x !== defectId);
  if (d) upsert.push(d);
  else remove.push(defectId);
  return { ...state, writes: { ...state.writes, seq: state.writes.seq + 1, upsert, remove } };
}

function recordMemoWrite(state: AppState, memoId: string | null): AppState {
  if (!memoId) return state;
  const m = state.memos.find((x) => x.id === memoId) ?? null;
  const memoUpsert = state.writes.memoUpsert.filter((x) => x.id !== memoId);
  const memoRemove = state.writes.memoRemove.filter((x) => x !== memoId);
  if (m) memoUpsert.push(m);
  else memoRemove.push(memoId);
  return {
    ...state,
    writes: { ...state.writes, seq: state.writes.seq + 1, memoUpsert, memoRemove },
  };
}

/** 커맨드 하나가 건드린 것을 결함·메모 양쪽에서 대기열에 올린다 */
function recordCommandWrites(state: AppState, c: Command | null): AppState {
  if (!c) return state;
  // ⚠️ 지우개(D14)는 커맨드 **하나가 여러 메모**를 건드린다 — 드래그 1회가 커맨드 1건이라
  //    첫 메모만 올리면 나머지가 저장되지 않는다
  return memoTargetsOf(c).reduce(recordMemoWrite, recordWrite(state, defectTargetOf(c)));
}

/** 선택 대상이 사라졌으면 선택을 해제한다 (undo 로 생성이 취소된 경우) */
function dropStaleSelection(state: AppState): AppState {
  const sel = state.canvas.selection;
  const defectGone = sel.defectId !== null && !state.defects.some((d) => d.id === sel.defectId);
  const memoGone = !!sel.memoId && !state.memos.some((m) => m.id === sel.memoId);
  if (!defectGone && !memoGone) return state;
  return {
    ...state,
    canvas: {
      ...state.canvas,
      selection: { defectId: null, part: null, markId: null, pathId: null, memoId: null, handle: null },
      hover: null,
    },
  };
}

function runInput(state: AppState, ev: InputEvent): AppState {
  let seed = state.idSeed;
  const drawingId = state.canvas.drawing?.id ?? null;
  const drawingDefects = defectsOfDrawing(state.defects, drawingId);

  const ctx: ReduceContext = {
    defects: drawingDefects,
    // 히트 영역이 **그려진 풍선과 같아지도록** 번호를 넘긴다 (검수 심각2).
    // 화면 렌더(`CanvasView`)와 같은 소스를 쓴다 — 두 벌로 만들면 반드시 어긋난다
    displayNumbers: displayNumbersOf(drawingDefects),
    memos: memosOfDrawing(state.memos, drawingId),
    globalStyle: DEFAULT_GLOBAL_STYLE,
    makeId: () => {
      seed += 1;
      return `n${seed.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    },
    // 코어는 시간을 모른다. 어댑터가 넣어 준다 (경계 규칙 1)
    now: () => Date.now(),
    floorId: state.floorId,
    projectId: state.projectId,
    defaultAttrs: state.defaultAttrs,
  };

  const r = reduce(state.canvas, ev, ctx);

  let next: AppState = { ...state, canvas: r.state, idSeed: seed };

  // 1. 커맨드를 문서에 적용하고 Undo 스택에 쌓는다 (로컬 우선 — 서버를 기다리지 않는다)
  for (const c of r.commands) next = applyAndPush(next, c);

  // 2. 부수효과 처리
  for (const e of r.effects) next = runEffect(next, e);

  return next;
}

/**
 * 결함 속성 변경을 커맨드로 바꿔 문서·Undo·저장 대기열에 한 번에 태운다.
 *
 * · **바뀐 게 없으면 아무 일도 하지 않는다** — 폼이 같은 값을 다시 올려도 이력이 쌓이지 않는다
 * · **잠긴 결함(전회차)은 거부한다** — 폼도 `disabled` 지만 마지막 관문을 여기 둔다
 * · 병합 키는 바뀐 필드 묶음이다. 같은 필드를 800ms 안에 또 고치면 Undo 한 단계로 합쳐진다
 *   (`pushHistory` 안의 `mergeAttrCommand`)
 * · `toastText` 를 주면 **커밋에 성공했을 때만** [되돌리기] 토스트를 띄운다 (D18)
 */
function setDefectAttrs(
  state: AppState,
  defectId: string,
  next: DefectAttrs,
  toastText?: string,
): AppState {
  const d = state.defects.find((x) => x.id === defectId);
  if (!d || isLocked(d)) return state;
  const from = attrsOf(d);
  const to = attrsOf(next);
  const changed = changedAttrKeys(from, to);
  if (changed.length === 0) return state;
  const committed = applyAndPush(state, {
    k: 'SET_DEFECT_ATTRS',
    defectId,
    from,
    to,
    mergeKey: changed.join('|'),
    // 코어는 시간을 모른다. 어댑터가 넣어 준다 (경계 규칙 1)
    at: Date.now(),
  });
  // ⚠️ 토스트는 **조기 반환 두 개를 통과한 뒤**여야 한다 — 잠긴 결함이나 값이 그대로일 때
  //    "불러왔습니다" 라고 말하면 거짓말이 된다.
  return toastText ? withToast(committed, 'info', toastText, true) : committed;
}

function applyAndPush(state: AppState, c: Command): AppState {
  const doc = applyToDoc(docOf(state), c);
  const applied: AppState = {
    ...state,
    defects: doc.defects as Defect[],
    memos: doc.memos as Memo[],
    history: pushHistory(state.history, c),
  };
  // ⚠️ 저장은 **커밋 시점에만** 한다. 드래그 중 매 프레임 저장하지 않는다 (§2-9-e)
  return recordCommandWrites(applied, c);
}

function runEffect(state: AppState, e: Effect): AppState {
  switch (e.k) {
    case 'TOAST':
      return withToast(state, e.kind, e.text, e.undoable ?? false);
    case 'CONFIRM_DELETE_DEFECT':
      return { ...state, confirm: { defectId: e.defectId, reason: e.reason } };
    case 'CONTEXT_MENU':
      return { ...state, menu: { x: e.screen.x, y: e.screen.y, defectId: e.defectId } };
    case 'FOCUS_PANEL':
      return { ...state, focusTick: state.focusTick + 1, reveal: e.defectId };
    case 'REVEAL_DEFECT':
      return { ...state, reveal: e.defectId };
    case 'EDIT_MEMO':
      return { ...state, editingMemoId: e.memoId };
    case 'UNDO':
      return appReducer(state, { t: 'UNDO' });
    case 'REDO':
      return appReducer(state, { t: 'REDO' });
    default:
      return state;
  }
}

function withToast(
  state: AppState,
  kind: 'info' | 'warn',
  text: string,
  undoable: boolean,
): AppState {
  const id = state.toastSeed;
  // 같은 문구가 연달아 쌓이지 않게 최근 3개만 유지한다.
  // ⚠️ [되돌리기] 는 **가장 최근 토스트에만** 남긴다. 옛 토스트의 버튼을 누르면
  //    그 조작이 아니라 마지막 조작이 취소되어 사용자를 속이게 된다.
  const kept = state.toasts
    .filter((t) => t.text !== text)
    .map((t) => (undoable && t.undoable ? { ...t, undoable: false } : t));
  const toasts = [...kept, { id, kind, text, undoable }];
  return { ...state, toasts: toasts.slice(-3), toastSeed: id + 1 };
}
