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
  defectTargetsOf,
  describeCommand,
  EMPTY_HISTORY,
  initialCanvasState,
  alignLabelsToGrid,
  canSetStatus,
  effectiveLabelNorm,
  isLocked,
  labelGridStepImgPx,
  resolveStyle,
  memoTargetsOf,
  pushHistory,
  redo as redoStack,
  reduce,
  undo as undoStack,
  type CanvasState,
  type Command,
  type Defect,
  type DefectAttrs,
  type DefectStatus,
  type Doc,
  type DrawingRef,
  type Effect,
  type History,
  type HitProfile,
  type InputEvent,
  type Memo,
  type ReduceContext,
} from '@onspect/canvas-core';
import { globalStyleForLabelScale } from './canvas/labelStyle';
import type { ToastItem } from './ui/Overlays';

export type Toast = ToastItem;

export type ConfirmState =
  | { defectId: string; reason: 'LAST_MARK' | 'EXPLICIT' }
  /** C-4 — 영역선택 일괄 삭제. `defectIds` 는 이미 잠긴 것을 걸러낸 목록이다 */
  | { defectIds: readonly string[]; lockedCount: number }
  | null;
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
  /**
   * T-4 (2026-09-01) — **플로팅 편집 툴바(ContextToolbar)를 띄워도 되는 결함.**
   * `null` 이면 띄우지 않는다. 항상 `canvas.selection.defectId` 와 같거나 `null` 이다.
   *
   * 선택 자체와 분리한 이유: 결함을 새로 그리면 코어가 **자동으로 선택**한다
   * (`interaction.ts` CREATE_DEFECT 세 경로). 선택만 보고 툴바를 띄우면 연속으로
   * 결함을 찍을 때마다 방금 찍은 자리 위에 색상·모양·삭제 툴바가 덮여 다음 위치가 안 보인다.
   *
   * 규칙: **사용자가 캔버스에서 직접 고른 선택**(마커 탭 · 우클릭 · 더블클릭 · 리스트 선택)
   * 에만 툴바를 허용한다. 생성 직후의 자동 선택에는 허용하지 않는다.
   * 우측 Inspector 패널은 이 값과 무관하게 계속 뜬다 — 사이드라 도면을 가리지 않는다.
   */
  toolbarFor: string | null;
  /**
   * T2-1 — 손가락 히트 허용치 (트랙 A T5 · `ReduceContext.hitProfile`).
   *
   * `null` = 주지 않는다 → 코어가 `DEFAULT_HIT_PROFILE`(마우스 값)을 쓴다.
   * **PC 는 영원히 `null` 이라 히트 판정이 한 픽셀도 바뀌지 않는다.**
   *
   * 액션이 아니라 상태로 둔 이유: `INPUT` 을 보내는 곳이 늘어나도 한 곳만 보면 된다.
   * 어느 프로파일이 터치인지 아는 것은 어댑터뿐이다(경계 규칙 1 — 코어는 `navigator` 를 모른다).
   */
  hitProfile: HitProfile | null;
  /**
   * C-2 — 현재 도면의 번호 풍선 배율 (`Drawing.labelScale ?? 1`).
   *
   * ⭐ **리듀서가 쓰는 `globalStyle` 과 화면이 그리는 `globalStyle` 을 같게 만드는 값이다.**
   *    예전에는 렌더만 배율을 반영하고 리듀서는 `DEFAULT_GLOBAL_STYLE`(34) 을 하드코딩해서,
   *    풍선을 키우면 히트 영역·자동배치 거리·정렬 스냅 후보가 보이는 것과 어긋났다.
   *
   * `canvas-core` 의 `DrawingRef` 에 넣지 않은 이유: 이것은 **앱 표시설정**이다(U46).
   * `hitProfile` 과 같은 방식으로 어댑터가 `ReduceContext` 에 주입한다(경계 규칙 1).
   * 기본값 `1` 에서는 `globalStyleForLabelScale` 이 `DEFAULT_GLOBAL_STYLE` **같은 참조**를
   * 돌려주므로 PC 기본 도면의 동작은 한 픽셀도 바뀌지 않는다(U47).
   */
  labelScale: number;
  idSeed: number;
  toastSeed: number;
};

export type Action =
  | { t: 'INPUT'; ev: InputEvent }
  | { t: 'SET_FLOOR'; floorId: string; drawing: DrawingRef | null; labelScale: number }
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
  /**
   * G-8 (T-7) — 결함 상태 전이 `PREV_PENDING ↔ CURRENT`.
   *
   * 두 곳에서 온다:
   *   · 전회차 결함에 **이번 회차 사진이 실제로 붙었을 때** → `CURRENT` (상세기획 §Phase 2-D)
   *   · Inspector 의 `[전회차로 되돌리기]` → `PREV_PENDING` (가정 N8 — 자동 되돌림은 없다)
   *
   * 다른 전이(REPAIRED 관련)는 여기서 받지 않는다 — 리듀서가 조용히 무시한다.
   */
  | { t: 'SET_DEFECT_STATUS'; defectId: string; to: DefectStatus; toast?: string }
  /** P-2 (D28) — 지금 열린 도면의 번호 풍선을 격자에 맞춰 정렬한다 */
  | { t: 'ALIGN_LABELS' }
  /** T2-1 — 태블릿 모드 진입/이탈. `null` 이면 마우스 기본값으로 돌아간다 */
  | { t: 'SET_HIT_PROFILE'; profile: HitProfile | null }
  /**
   * C-2 — 번호 풍선 배율 변경 (`F6` 의 `−` `100%` `+`).
   * 저장(`Drawing.labelScale`)과 **같은 순간** 리듀서 기준도 갱신해야 둘이 안 갈라진다.
   */
  | { t: 'SET_LABEL_SCALE'; scale: number }
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
    toolbarFor: null,
    hitProfile: null,
    labelScale: 1,
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

/**
 * T-4 — `toolbarFor` 는 **항상 지금 선택된 결함이거나 `null`** 이라는 불변식을 지킨다.
 * 선택이 다른 결함으로 옮겨가거나(리스트 클릭·삭제·Undo로 사라짐) 해제되면 툴바를 닫는다.
 * 리듀서 출구 한 곳에서만 강제한다 — 케이스마다 챙기면 반드시 하나를 빠뜨린다.
 */
function clampToolbar(s: AppState): AppState {
  if (s.toolbarFor === null) return s;
  return s.canvas.selection.defectId === s.toolbarFor ? s : { ...s, toolbarFor: null };
}

export function appReducer(state: AppState, action: Action): AppState {
  return clampToolbar(reduceApp(state, action));
}

function reduceApp(state: AppState, action: Action): AppState {
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

    case 'SET_DEFECT_STATUS':
      return setDefectStatus(state, action.defectId, action.to, action.toast);

    case 'ALIGN_LABELS':
      return alignLabels(state);

    case 'EDIT_MEMO':
      return { ...state, editingMemoId: action.memoId };

    case 'SET_HIT_PROFILE':
      // 같은 값이면 상태를 갈지 않는다 — 방향 전환마다 캔버스가 통째로 다시 그려지지 않게
      return state.hitProfile === action.profile ? state : { ...state, hitProfile: action.profile };

    case 'SET_LABEL_SCALE':
      // 같은 값이면 상태를 갈지 않는다 (`SET_HIT_PROFILE` 과 같은 이유)
      return state.labelScale === action.scale ? state : { ...state, labelScale: action.scale };

    case 'FLUSHED':
      // 흘려보낸 뒤에도 새 변경이 들어왔으면 그대로 둔다
      return state.writes.seq === action.seq ? { ...state, writes: NO_WRITES } : state;

    case 'SET_FLOOR': {
      // C-2 — 도면이 바뀌면 그 도면의 풍선 배율도 **같은 액션 안에서** 갈아끼운다.
      //       한 틱이라도 늦으면 전환 직후 첫 입력이 이전 도면 배율로 히트 판정된다
      return runInput(
        {
          ...state,
          floorId: action.floorId,
          labelScale: action.labelScale,
          menu: null,
          confirm: null,
        },
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
  const withDefects = defectTargetsOf(c).reduce(recordWrite, state);
  return memoTargetsOf(c).reduce(recordMemoWrite, withDefects);
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
      // C-2 — UNDO/REDO 는 `reduce()` 를 안 타므로 코어의 유일한 세션 종료 지점
      //       `endInkSessionIfStale` 이 돌지 않는다. 선택을 비우는 여기서 필기 세션도
      //       같이 닫아 "선택이 없으면 세션도 없다" 는 불변을 코드로 닫는다 (T-1)
      inkMemoId: null,
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
    // C-2 — 화면과 **같은 소스**. 하드코딩된 34 를 쓰면 히트 영역이 보이는 풍선과 어긋난다
    globalStyle: globalStyleForLabelScale(state.labelScale),
    makeId: () => {
      seed += 1;
      return `n${seed.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    },
    // 코어는 시간을 모른다. 어댑터가 넣어 준다 (경계 규칙 1)
    now: () => Date.now(),
    floorId: state.floorId,
    projectId: state.projectId,
    defaultAttrs: state.defaultAttrs,
    // T2-1 — 태블릿에서만 채워진다. `null` 이면 키 자체를 넘기지 않아 코어가 마우스 값을 쓴다
    ...(state.hitProfile ? { hitProfile: state.hitProfile } : {}),
  };

  const r = reduce(state.canvas, ev, ctx);

  let next: AppState = { ...state, canvas: r.state, idSeed: seed };

  // 1. 커맨드를 문서에 적용하고 Undo 스택에 쌓는다 (로컬 우선 — 서버를 기다리지 않는다)
  for (const c of r.commands) next = applyAndPush(next, c);

  // 2. 부수효과 처리
  for (const e of r.effects) next = runEffect(next, e);

  // 3. T-4 — 이번 입력의 선택이 "사용자가 직접 고른 것" 인지 판정한다.
  //    ⚠️ 커맨드 목록은 **여기서만** 볼 수 있다. 나중에 상태만 보고는
  //       "방금 만들어진 결함" 과 "원래 있던 결함" 을 구분할 수 없다.
  return {
    ...next,
    toolbarFor: nextToolbarFor(state, next, ev, r.commands.some((c) => c.k === 'CREATE_DEFECT')),
  };
}

/**
 * T-4 — 캔버스에서 **사용자가 직접 고른** 선택. 이 이벤트들만 편집 툴바를 띄울 자격이 있다.
 * (`POINTER_UP`·`SET_TOOL` 같은 나머지는 직전 판정을 그대로 유지한다)
 *
 * `POINTER_DOWN` 은 여기 없다 — 이벤트 종류만으로는 부족해서
 * `nextToolbarFor` 안에서 "무엇을 눌렀는지"까지 따로 본다.
 */
const EXPLICIT_SELECT_EVENTS: ReadonlySet<InputEvent['k']> = new Set([
  'DOUBLE_CLICK',
  'CONTEXT_MENU',
  'SELECT_DEFECT', // 좌측 결함 리스트에서 고름
]);

function nextToolbarFor(
  prev: AppState,
  next: AppState,
  ev: InputEvent,
  created: boolean,
): string | null {
  const selId = next.canvas.selection.defectId;
  if (!selId) return null;
  // 방금 그린 결함의 자동 선택 — 툴바를 띄우면 다음 표기 자리를 가린다.
  // 같은 POINTER_DOWN 이 생성까지 했더라도 '직접 고름' 보다 이쪽이 우선이다.
  if (created) return null;
  // ⚠️ `POINTER_DOWN` 은 **무엇을 눌렀는지**까지 봐야 한다. 이벤트 종류만 보고
  //    "직접 고름" 으로 치면 — 결함을 찍은 직후 도면을 밀거나(팬) 핀치줌만 해도
  //    선택이 그대로 남아 있어서 방금 숨긴 툴바가 다시 뜬다(검수 보통1·경미1).
  if (ev.k === 'POINTER_DOWN') {
    // 이번 눌림으로 선택이 이 결함으로 **옮겨왔다** — 다른 마커를 탭한 경우
    const changed = prev.canvas.selection.defectId !== selId;
    // 이 결함의 표기·풍선·획을 **실제로 잡았다** — 이미 선택된 마커 재탭·이동 드래그.
    // (PAN·CREATE_SHAPE·CREATE_SKETCH·ERASE 드래그는 `defectId` 가 null 이고,
    //  핀치 두 번째 손가락은 `cancelDrag` 로 드래그 자체가 사라진다)
    const grabbed = next.canvas.drag?.defectId === selId;
    if (changed || grabbed) return selId;
    return prev.toolbarFor === selId ? selId : null; // 그 밖엔 직전 판정 유지
  }
  if (EXPLICIT_SELECT_EVENTS.has(ev.k)) return selId;
  return prev.toolbarFor === selId ? selId : null;
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

/**
 * G-8 (T-7) — 결함 상태 전이를 커맨드로 바꿔 문서·Undo·저장 대기열에 태운다.
 *
 * ⚠️ **`isLocked` 게이트를 통과하지 않는다.** 이 커맨드는 잠금의 *근거*(status)를 바꾸는
 *    유일한 통로다. `setDefectAttrs` 처럼 `isLocked` 로 막으면 전회차 결함은 영원히
 *    금회차가 될 수 없다 — 그래서 게이트 대신 **허용 전이 목록**으로 좁힌다.
 *
 * **C-5 (D33)** — 세 종류(신규 · 결함 · 보수완료)를 전부 열었다. 막는 것은 하나뿐이다:
 * `prevDefectId` 가 없는 결함을 전회차로 만드는 것 (`includePrevPending=false` 출력에서
 * 통째로 사라진다 — U43). 판정은 `canvas-core` 의 `canSetStatus` 한 곳에서만 한다.
 *
 * 뷰(`Inspector`)도 같은 함수로 버튼을 막지만 **마지막 관문은 여기다**
 * (`setDefectAttrs` 와 같은 원칙 — 검수 48 경미1).
 */
function setDefectStatus(
  state: AppState,
  defectId: string,
  to: DefectStatus,
  toastText?: string,
): AppState {
  const d = state.defects.find((x) => x.id === defectId);
  if (!d || d.status === to) return state;
  if (!canSetStatus(d, to)) return state;
  const committed = applyAndPush(state, {
    k: 'SET_DEFECT_STATUS',
    defectId,
    from: d.status,
    to,
  });
  // 토스트는 **조기 반환 뒤**다 — 이미 그 상태였는데 "전환했습니다" 라고 하면 거짓말이다
  return toastText ? withToast(committed, 'info', toastText, true) : committed;
}

/**
 * P-2 (D28 · Q71) — 지금 열린 도면의 번호 풍선을 격자에 맞춰 정렬한다.
 *
 * · 격자 간격 = `balloonRadius × 2.5`(이미지 px). 도면별 번호 크기(`labelScale`)가
 *   이미 `balloonRadius` 에 반영돼 있어 **도면마다 자동으로 맞고 새 저장 필드가 안 생긴다**
 * · 대상 = 지금 열린 도면 전체. **잠긴 결함(전회차·보수완료)은 제외** — 기존 잠금 규칙과 일관
 * · 결함점(마크)은 안 움직인다. 움직이는 것은 풍선뿐이고 지시선이 따라 늘어난다
 * · 커맨드 **하나** 로 올린다 → Ctrl+Z 한 번에 정렬 전체가 되돌아간다
 *
 * ⚠️ 시작 위치는 `label.x/y` 가 아니라 **화면에 그려진 위치**(`effectiveLabelNorm`)다.
 *    한 번도 안 옮긴 풍선(`placed=false`)은 저장값이 자동 배치 위치와 다르다 —
 *    저장값에서 스냅하면 눈에 보이는 것과 다른 곳으로 튄다(C-2 와 같은 함정).
 */
function alignLabels(state: AppState): AppState {
  const dw = state.canvas.drawing;
  // 도면 이미지 크기는 이미 `DrawingRef` 에 있다 — 어댑터가 따로 넣어 줄 필요가 없다
  if (!dw || !(dw.imageWidth > 0) || !(dw.imageHeight > 0)) return state;
  const iw = dw.imageWidth;
  const ih = dw.imageHeight;
  const drawingId = dw.id;
  const onDrawing = defectsOfDrawing(state.defects, drawingId);
  const targets = onDrawing.filter((d) => !isLocked(d));
  if (targets.length === 0) {
    return withToast(state, 'info', '정렬할 번호가 없습니다', false);
  }

  const global = globalStyleForLabelScale(state.labelScale);
  // 화면 렌더와 **같은 소스**로 번호를 넘긴다 — 넓어진 풍선만큼 자동 배치가 더 밀린다
  const numbers = displayNumbersOf(onDrawing);
  const before = targets.map((d) => {
    const p = effectiveLabelNorm(d, resolveStyle(d, global), iw, ih, numbers[d.id] ?? '');
    return { defectId: d.id, x: p.x, y: p.y };
  });

  const stepImgPx = labelGridStepImgPx(global.balloonRadius);
  const after = alignLabelsToGrid(before, stepImgPx / iw, stepImgPx / ih);

  const items = before.map((b, i) => {
    const a = after[i]!;
    const d = targets[i]!;
    return {
      defectId: b.defectId,
      from: { x: b.x, y: b.y },
      to: { x: a.x, y: a.y },
      fromPlaced: d.label.placed,
      // 정렬된 순간부터는 사용자가 정한 위치다 — 다시 자동 배치로 돌아가면 안 된다
      toPlaced: true,
    };
  });
  const moved = items.filter(
    (i) => i.from.x !== i.to.x || i.from.y !== i.to.y || i.fromPlaced !== i.toPlaced,
  );
  if (moved.length === 0) {
    return withToast(state, 'info', '이미 정렬돼 있습니다', false);
  }

  const committed = applyAndPush(state, { k: 'ALIGN_LABELS', items });
  return withToast(committed, 'info', `번호 ${moved.length}개를 정렬했습니다`, true);
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

    case 'CONFIRM_DELETE_DEFECTS':
      return { ...state, confirm: { defectIds: e.defectIds, lockedCount: e.lockedCount } };
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
