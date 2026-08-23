/**
 * 커맨드 + Undo 스택 — 스펙 T7 / §2-3.
 *
 * ⚠️ **뷰포트 변경은 Undo 대상이 아니다** (B9). Ctrl+Z 가 화면 스크롤을 되돌리면
 * 사용자가 혼란스럽다. 커맨드 스택에는 편집(이동·생성·삭제)만 쌓인다.
 *
 * 모든 적용은 불변 갱신이다. 어댑터는 코어 상태를 직접 mutate 하지 않는다(경계 규칙 5).
 */
import type {
  Defect,
  DefectAttrs,
  Mark,
  MarkGeometry,
  Memo,
  NPoint,
  SketchPath,
  StyleOverride,
} from './types.js';

/**
 * 편집 대상 문서 전체. 결함과 메모는 **다른 컬렉션**이지만
 * Undo 스택은 하나다 — 사용자에게 Ctrl+Z 는 하나뿐이기 때문이다.
 */
export type Doc = { defects: readonly Defect[]; memos: readonly Memo[] };

export type Command =
  | { k: 'CREATE_DEFECT'; defect: Defect }
  | { k: 'DELETE_DEFECT'; defect: Defect }
  | {
      k: 'MOVE_LABEL';
      defectId: string;
      from: NPoint;
      to: NPoint;
      fromPlaced: boolean;
      toPlaced: boolean;
    }
  | {
      k: 'MOVE_MARK';
      defectId: string;
      markId: string;
      from: NPoint;
      to: NPoint;
      /** 마크를 옮기면 라벨이 같은 델타만큼 따라온다 (A2). placed=false 면 null */
      labelFrom: NPoint | null;
      labelTo: NPoint | null;
    }
  | {
      k: 'DELETE_MARK';
      defectId: string;
      mark: Mark;
      index: number;
      fromAnchorId: string | null;
      toAnchorId: string | null;
    }
  | {
      k: 'ADD_MARK';
      defectId: string;
      mark: Mark;
      index: number;
      fromAnchorId: string | null;
      toAnchorId: string | null;
    }
  | {
      k: 'RESET_LABEL';
      defectId: string;
      from: NPoint;
      to: NPoint;
      fromPlaced: boolean;
      toPlaced: boolean;
    }
  // ── S2a ──────────────────────────────────────────────────────────────────
  /**
   * ARROW · AREA_* 의 기하 변경 (생성 후 이동 · 리사이즈 · 끝점 이동).
   * `MOVE_MARK` 는 POINT 전용으로 남겨 둔다 — 두 경로를 억지로 합치면
   * POINT 의 라벨 추종(A2) 규칙이 도형 리사이즈에도 잘못 새어 든다.
   */
  | {
      k: 'SET_MARK_GEOMETRY';
      defectId: string;
      markId: string;
      from: MarkGeometry;
      to: MarkGeometry;
      /** 전체 이동일 때만 라벨이 따라온다. 리사이즈에서는 null */
      labelFrom: NPoint | null;
      labelTo: NPoint | null;
    }
  | { k: 'ADD_SKETCH'; defectId: string; path: SketchPath; index: number }
  | { k: 'DELETE_SKETCH'; defectId: string; path: SketchPath; index: number }
  | { k: 'MOVE_SKETCH'; defectId: string; pathId: string; from: NPoint[]; to: NPoint[] }
  /** 개별 스타일 교체. **위치·크기는 절대 여기 들어오지 않는다** (§2-1-c) */
  | { k: 'SET_STYLE'; defectId: string; from: StyleOverride | null; to: StyleOverride | null }
  | { k: 'CREATE_MEMO'; memo: Memo }
  | { k: 'DELETE_MEMO'; memo: Memo }
  | { k: 'MOVE_MEMO'; memoId: string; from: NPoint; to: NPoint }
  | { k: 'SET_MEMO_TEXT'; memoId: string; from: string; to: string }
  // ── S2b ──────────────────────────────────────────────────────────────────
  /**
   * 결함의 **도메인 속성** 교체 (부재·결함유형·규모·원인·보수방안·메모…).
   * 위치·크기·스타일은 여기 들어오지 않는다 — `DefectAttrs` 에 그런 필드가 없다(함정 #5).
   */
  | {
      k: 'SET_DEFECT_ATTRS';
      defectId: string;
      from: DefectAttrs;
      to: DefectAttrs;
      /**
       * Undo 병합 키 = 이번에 바뀐 속성 키들(`changedAttrKeys` 결과)을 이어 붙인 문자열.
       * 같은 결함의 같은 키 묶음을 `ATTR_MERGE_WINDOW_MS` 안에 다시 고치면 한 단계로 합친다.
       * 빈 문자열이면 병합하지 않는다.
       */
      mergeKey: string;
      /** 병합 창 판정용 시각(ms). 코어는 시간을 모른다 — 어댑터가 넣어 준다 (경계 규칙 1) */
      at: number;
    };

/** 사람이 읽는 커맨드 이름 — 토스트·Undo 안내에 쓴다 */
export function describeCommand(c: Command): string {
  switch (c.k) {
    case 'CREATE_DEFECT':
      return '표기 추가';
    case 'DELETE_DEFECT':
      return '결함 삭제';
    case 'MOVE_LABEL':
      return '번호 이동';
    case 'MOVE_MARK':
      return '표기 이동';
    case 'DELETE_MARK':
      return '표기 삭제';
    case 'ADD_MARK':
      return '표기 추가';
    case 'RESET_LABEL':
      return '번호 위치 초기화';
    case 'SET_MARK_GEOMETRY':
      return '표기 변경';
    case 'ADD_SKETCH':
      return '그리기 추가';
    case 'DELETE_SKETCH':
      return '그리기 삭제';
    case 'MOVE_SKETCH':
      return '그리기 이동';
    case 'SET_STYLE':
      return '표기 스타일';
    case 'CREATE_MEMO':
      return '메모 추가';
    case 'DELETE_MEMO':
      return '메모 삭제';
    case 'MOVE_MEMO':
      return '메모 이동';
    case 'SET_MEMO_TEXT':
      return '메모 수정';
    case 'SET_DEFECT_ATTRS':
      return '결함정보 수정';
    default:
      return '변경';
  }
}

function replace(defects: readonly Defect[], id: string, fn: (d: Defect) => Defect): Defect[] {
  return defects.map((d) => (d.id === id ? fn(d) : d));
}

/** seq 오름차순 · 동률이면 id 사전순으로 정렬해 z-order 를 안정시킨다 */
function sorted(defects: Defect[]): Defect[] {
  return [...defects].sort((a, b) =>
    a.seq !== b.seq ? a.seq - b.seq : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
}

export function applyCommand(defects: readonly Defect[], c: Command): Defect[] {
  switch (c.k) {
    case 'CREATE_DEFECT':
      return sorted([...defects, c.defect]);

    case 'DELETE_DEFECT':
      return defects.filter((d) => d.id !== c.defect.id);

    case 'MOVE_LABEL':
    case 'RESET_LABEL':
      return replace(defects, c.defectId, (d) => ({
        ...d,
        // ⚠️ style 은 절대 건드리지 않는다. 위치는 geometry 다 (§2-1-c, 함정 #5)
        label: { ...d.label, x: c.to.x, y: c.to.y, placed: c.toPlaced },
      }));

    case 'MOVE_MARK':
      return replace(defects, c.defectId, (d) => ({
        ...d,
        marks: d.marks.map((m) =>
          m.id === c.markId && m.geometry.k === 'POINT'
            ? { ...m, geometry: { k: 'POINT', x: c.to.x, y: c.to.y } }
            : m,
        ),
        label:
          c.labelTo !== null
            ? { ...d.label, x: c.labelTo.x, y: c.labelTo.y }
            : d.label,
      }));

    case 'DELETE_MARK':
      return replace(defects, c.defectId, (d) => ({
        ...d,
        marks: d.marks.filter((m) => m.id !== c.mark.id),
        label: { ...d.label, anchorMarkId: c.toAnchorId },
      }));

    case 'ADD_MARK':
      return replace(defects, c.defectId, (d) => {
        const marks = [...d.marks];
        marks.splice(Math.min(c.index, marks.length), 0, c.mark);
        return { ...d, marks, label: { ...d.label, anchorMarkId: c.toAnchorId } };
      });

    // ── S2a ────────────────────────────────────────────────────────────────
    case 'SET_MARK_GEOMETRY':
      return replace(defects, c.defectId, (d) => ({
        ...d,
        marks: d.marks.map((m) => (m.id === c.markId ? { ...m, geometry: c.to } : m)),
        label:
          c.labelTo !== null ? { ...d.label, x: c.labelTo.x, y: c.labelTo.y } : d.label,
      }));

    case 'ADD_SKETCH':
      return replace(defects, c.defectId, (d) => {
        const sketch = [...(d.sketch ?? [])];
        sketch.splice(Math.min(c.index, sketch.length), 0, c.path);
        return { ...d, sketch };
      });

    case 'DELETE_SKETCH':
      return replace(defects, c.defectId, (d) => ({
        ...d,
        sketch: (d.sketch ?? []).filter((s) => s.id !== c.path.id),
      }));

    case 'MOVE_SKETCH':
      return replace(defects, c.defectId, (d) => ({
        ...d,
        sketch: (d.sketch ?? []).map((s) => (s.id === c.pathId ? { ...s, points: c.to } : s)),
      }));

    case 'SET_STYLE':
      return replace(defects, c.defectId, (d) => ({ ...d, style: c.to }));

    // ── S2b ────────────────────────────────────────────────────────────────
    // 속성만 통째로 갈아 끼운다. `seq` 가 그대로이므로 재정렬(sorted)이 필요 없다.
    case 'SET_DEFECT_ATTRS':
      return replace(defects, c.defectId, (d) => ({ ...d, ...c.to }));

    default:
      return defects as Defect[];
  }
}

/**
 * 메모 컬렉션에 대한 적용. 결함 커맨드가 오면 그대로 돌려준다.
 * `applyCommand` 와 짝을 이룬다 — 둘을 한 번에 쓰려면 `applyToDoc` 를 쓴다.
 */
export function applyMemoCommand(memos: readonly Memo[], c: Command): Memo[] {
  switch (c.k) {
    case 'CREATE_MEMO':
      return [...memos, c.memo];
    case 'DELETE_MEMO':
      return memos.filter((m) => m.id !== c.memo.id);
    case 'MOVE_MEMO':
      return memos.map((m) => {
        if (m.id !== c.memoId) return m;
        // F2 — 필기 메모는 **획도 같은 델타만큼 함께 옮긴다.**
        // `pos` 는 획 묶음의 좌상단이므로 둘이 어긋나면 상자와 글씨가 따로 논다.
        const dx = c.to.x - c.from.x;
        const dy = c.to.y - c.from.y;
        const paths =
          m.paths?.map((p) => ({
            ...p,
            points: p.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })),
          })) ?? null;
        return { ...m, pos: { x: c.to.x, y: c.to.y }, paths };
      });
    case 'SET_MEMO_TEXT':
      return memos.map((m) => (m.id === c.memoId ? { ...m, text: c.to } : m));
    default:
      return memos as Memo[];
  }
}

export function applyToDoc(doc: Doc, c: Command): Doc {
  return {
    defects: applyCommand(doc.defects, c),
    memos: applyMemoCommand(doc.memos, c),
  };
}

/** 이 커맨드가 건드리는 메모 id. 저장 대기열 분류에 쓴다 */
export function memoTargetOf(c: Command): string | null {
  switch (c.k) {
    case 'CREATE_MEMO':
    case 'DELETE_MEMO':
      return c.memo.id;
    case 'MOVE_MEMO':
    case 'SET_MEMO_TEXT':
      return c.memoId;
    default:
      return null;
  }
}

/** 이 커맨드가 건드리는 결함 id. 메모 커맨드면 null */
export function defectTargetOf(c: Command): string | null {
  switch (c.k) {
    case 'CREATE_DEFECT':
    case 'DELETE_DEFECT':
      return c.defect.id;
    case 'CREATE_MEMO':
    case 'DELETE_MEMO':
    case 'MOVE_MEMO':
    case 'SET_MEMO_TEXT':
      return null;
    default:
      return c.defectId;
  }
}

export function invertCommand(c: Command): Command {
  switch (c.k) {
    case 'CREATE_DEFECT':
      return { k: 'DELETE_DEFECT', defect: c.defect };
    case 'DELETE_DEFECT':
      return { k: 'CREATE_DEFECT', defect: c.defect };
    case 'MOVE_LABEL':
      return {
        k: 'MOVE_LABEL',
        defectId: c.defectId,
        from: c.to,
        to: c.from,
        fromPlaced: c.toPlaced,
        toPlaced: c.fromPlaced,
      };
    case 'RESET_LABEL':
      return {
        k: 'RESET_LABEL',
        defectId: c.defectId,
        from: c.to,
        to: c.from,
        fromPlaced: c.toPlaced,
        toPlaced: c.fromPlaced,
      };
    case 'MOVE_MARK':
      return {
        k: 'MOVE_MARK',
        defectId: c.defectId,
        markId: c.markId,
        from: c.to,
        to: c.from,
        labelFrom: c.labelTo,
        labelTo: c.labelFrom,
      };
    case 'DELETE_MARK':
      return {
        k: 'ADD_MARK',
        defectId: c.defectId,
        mark: c.mark,
        index: c.index,
        fromAnchorId: c.toAnchorId,
        toAnchorId: c.fromAnchorId,
      };
    case 'ADD_MARK':
      return {
        k: 'DELETE_MARK',
        defectId: c.defectId,
        mark: c.mark,
        index: c.index,
        fromAnchorId: c.toAnchorId,
        toAnchorId: c.fromAnchorId,
      };
    // ── S2a ────────────────────────────────────────────────────────────────
    case 'SET_MARK_GEOMETRY':
      return {
        k: 'SET_MARK_GEOMETRY',
        defectId: c.defectId,
        markId: c.markId,
        from: c.to,
        to: c.from,
        labelFrom: c.labelTo,
        labelTo: c.labelFrom,
      };
    case 'ADD_SKETCH':
      return { k: 'DELETE_SKETCH', defectId: c.defectId, path: c.path, index: c.index };
    case 'DELETE_SKETCH':
      return { k: 'ADD_SKETCH', defectId: c.defectId, path: c.path, index: c.index };
    case 'MOVE_SKETCH':
      return { k: 'MOVE_SKETCH', defectId: c.defectId, pathId: c.pathId, from: c.to, to: c.from };
    case 'SET_STYLE':
      return { k: 'SET_STYLE', defectId: c.defectId, from: c.to, to: c.from };
    case 'CREATE_MEMO':
      return { k: 'DELETE_MEMO', memo: c.memo };
    case 'DELETE_MEMO':
      return { k: 'CREATE_MEMO', memo: c.memo };
    case 'MOVE_MEMO':
      return { k: 'MOVE_MEMO', memoId: c.memoId, from: c.to, to: c.from };
    case 'SET_MEMO_TEXT':
      return { k: 'SET_MEMO_TEXT', memoId: c.memoId, from: c.to, to: c.from };
    case 'SET_DEFECT_ATTRS':
      return { ...c, from: c.to, to: c.from };
    default:
      return c;
  }
}

// ── Undo 스택 ──────────────────────────────────────────────────────────────
export type History = { undo: Command[]; redo: Command[] };

export const EMPTY_HISTORY: History = { undo: [], redo: [] };

export const HISTORY_LIMIT = 200;

/**
 * 결함 속성 편집의 Undo 병합 창 (S2b · 스펙 §7 "폭 프리셋을 6번 누르면 Ctrl+Z 가 6단계").
 * 타이핑 한 글자·프리셋 연타가 각각 한 단계로 쌓이면 되돌리기가 쓸모없어진다.
 */
export const ATTR_MERGE_WINDOW_MS = 800;

/**
 * 직전 커맨드와 합칠 수 있으면 합친 커맨드를, 아니면 null 을 돌려준다.
 * **같은 결함 · 같은 필드 묶음 · 창 안** 세 조건이 전부 맞을 때만 합친다 —
 * 부재를 바꾼 뒤 폭을 고친 것을 하나로 묶으면 Undo 가 사용자를 속인다.
 */
function mergeAttrCommand(prev: Command | undefined, next: Command): Command | null {
  if (!prev || prev.k !== 'SET_DEFECT_ATTRS' || next.k !== 'SET_DEFECT_ATTRS') return null;
  if (prev.defectId !== next.defectId) return null;
  if (prev.mergeKey === '' || prev.mergeKey !== next.mergeKey) return null;
  const dt = next.at - prev.at;
  if (dt < 0 || dt > ATTR_MERGE_WINDOW_MS) return null;
  // 합쳐도 **되돌아갈 지점(from)은 맨 처음 값**이다
  return { ...next, from: prev.from };
}

export function pushHistory(h: History, c: Command): History {
  const merged = mergeAttrCommand(h.undo[h.undo.length - 1], c);
  if (merged) return { undo: [...h.undo.slice(0, -1), merged], redo: [] };
  const undo = [...h.undo, c];
  if (undo.length > HISTORY_LIMIT) undo.shift();
  return { undo, redo: [] }; // 새 편집이 들어오면 redo 는 버린다
}

export function canUndo(h: History): boolean {
  return h.undo.length > 0;
}

export function canRedo(h: History): boolean {
  return h.redo.length > 0;
}

export type UndoResult = { doc: Doc; history: History; command: Command | null };

export function undo(doc: Doc, h: History): UndoResult {
  const last = h.undo[h.undo.length - 1];
  if (!last) return { doc, history: h, command: null };
  return {
    doc: applyToDoc(doc, invertCommand(last)),
    history: { undo: h.undo.slice(0, -1), redo: [...h.redo, last] },
    command: last,
  };
}

export function redo(doc: Doc, h: History): UndoResult {
  const last = h.redo[h.redo.length - 1];
  if (!last) return { doc, history: h, command: null };
  return {
    doc: applyToDoc(doc, last),
    history: { undo: [...h.undo, last], redo: h.redo.slice(0, -1) },
    command: last,
  };
}
