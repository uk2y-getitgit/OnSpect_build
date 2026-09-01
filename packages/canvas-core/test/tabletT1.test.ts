/**
 * T-1 — 필기메모를 **쓰는 도중**에는 점선 상자를 그리지 않는다.
 *
 * 배경: 한 획 = 메모 하나라서 커밋 즉시 그 메모가 자동 선택된다(`commitCreateMemoInk`).
 * D14 규칙("선택·hover 일 때만 상자")이 그대로 걸리는 바람에 글씨를 이어 쓰는 내내
 * 방금 쓴 획마다 점선 상자가 따라붙어 필기를 가렸다.
 *
 * 여기서 못박는 것 넷:
 *   1. 획을 긋는 중(down~up)에는 **선택 상태와 무관하게** 어떤 메모의 상자도 안 그린다
 *   2. 손을 뗀 직후에도 방금 쓴 메모(`inkMemoId`)의 상자는 안 그린다
 *   3. 세션이 끝나면(도구 변경 · 다른 곳 탭) D14 규칙이 **되살아난다** — "항상 숨김" 이 아니다
 *   4. 출력 경로(`inkSession` 을 안 넘김)는 한 글자도 안 바뀐다
 */
import { describe, expect, it } from 'vitest';
import {
  initialCanvasState,
  inkSessionOf,
  memoScreensOf,
  reduce,
  type ReduceContext,
} from '../src/interaction.js';
import { buildOverlay } from '../src/renderModel.js';
import { toScreen } from '../src/geometry.js';
import type { CanvasState, Keys, Memo, NPoint, SketchPath } from '../src/types.js';
import { GS } from './helpers.js';

const DRAWING = { id: 'dw', imageWidth: 2400, imageHeight: 1600 };
const K: Keys = { space: false, alt: false, shift: false, ctrl: false };

function memoOf(id: string, paths: SketchPath[]): Memo {
  return {
    id,
    projectId: 'p1',
    drawingId: 'dw',
    floorId: 'f1',
    pos: paths[0]!.points[0]!,
    text: '',
    paths,
    style: null,
    createdAt: 1,
    updatedAt: 1,
    deviceId: 'dev',
    createdBy: null,
  };
}

/** ctx.memos 를 나중에 갈아 끼울 수 있게 가변 배열을 물려 준다 (커밋된 메모를 문서에 반영) */
function boot(): { state: CanvasState; ctx: ReduceContext; doc: Memo[] } {
  const doc: Memo[] = [];
  let n = 0;
  const ctx: ReduceContext = {
    defects: [],
    get memos() {
      return doc;
    },
    globalStyle: GS,
    makeId: () => `t${(n += 1)}`,
    now: () => 1000,
  };
  let st = initialCanvasState();
  st = reduce(st, { k: 'RESIZE', size: { w: 1000, h: 700 } }, ctx).state;
  st = reduce(st, { k: 'SET_DRAWING', drawing: DRAWING }, ctx).state;
  st = reduce(st, { k: 'SET_TOOL', tool: 'MEMO' }, ctx).state;
  return { state: st, ctx, doc };
}

function at(state: CanvasState, n: NPoint) {
  return toScreen(n, state.viewport, DRAWING.imageWidth, DRAWING.imageHeight);
}

/** 한 획을 긋는다. 중간 상태(포인터를 아직 안 뗀 시점)도 함께 돌려준다 */
function stroke(
  state: CanvasState,
  ctx: ReduceContext,
  doc: Memo[],
  from: NPoint,
  to: NPoint,
  pointerId = 1,
): { during: CanvasState; after: CanvasState; memoId: string | null } {
  let s = reduce(state, { k: 'POINTER_DOWN', pointerId, screen: at(state, from), button: 0, keys: K }, ctx).state;
  s = reduce(s, { k: 'POINTER_MOVE', pointerId, screen: at(s, { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }), keys: K }, ctx).state;
  s = reduce(s, { k: 'POINTER_MOVE', pointerId, screen: at(s, to), keys: K }, ctx).state;
  const during = s;
  const up = reduce(s, { k: 'POINTER_UP', pointerId, screen: at(s, to), keys: K }, ctx);
  let memoId: string | null = null;
  for (const c of up.commands) {
    if (c.k === 'CREATE_MEMO') {
      memoId = c.memo.id;
      doc.push(c.memo); // 어댑터가 문서에 반영한 셈 친다
    }
  }
  return { during, after: up.state, memoId };
}

/** 지금 상태로 오버레이를 그렸을 때 나오는 메모 점선 상자 개수 */
function boxCount(state: CanvasState, ctx: ReduceContext, withSession = true): number {
  const ops = buildOverlay(
    {
      drawing: DRAWING,
      viewport: state.viewport,
      canvas: state.canvas,
      defects: [],
      displayNumbers: {},
      globalStyle: GS,
      selection: state.selection,
      hover: state.hover,
      guides: [],
      preview: null,
      dragDefectId: null,
      memos: memoScreensOf(state, ctx),
      ...(withSession ? { inkSession: inkSessionOf(state) } : {}),
    },
    [],
  );
  return ops.filter((o) => o.k === 'rect').length;
}

const A: NPoint = { x: 0.2, y: 0.2 };
const B: NPoint = { x: 0.3, y: 0.35 };
const C: NPoint = { x: 0.5, y: 0.2 };
const D: NPoint = { x: 0.6, y: 0.35 };

// ───────────────────────────────────────────────────────────────────────────
describe('T-1 · 필기 세션 상태(inkMemoId · inkSessionOf)', () => {
  it('처음에는 세션이 없다', () => {
    const { state } = boot();
    expect(state.inkMemoId).toBeNull();
    expect(inkSessionOf(state)).toEqual({ drawing: false, memoId: null });
  });

  it('MEMO 도구로 획을 긋는 중이면 drawing = true', () => {
    const { state, ctx, doc } = boot();
    const { during } = stroke(state, ctx, doc, A, B);
    expect(during.drag?.kind).toBe('CREATE_SKETCH');
    expect(inkSessionOf(during).drawing).toBe(true);
  });

  it('SKETCH(결함 자유그리기) 드래그는 필기 세션이 아니다 — 메모가 아니다', () => {
    const { state, ctx } = boot();
    let s = reduce(state, { k: 'SET_TOOL', tool: 'SKETCH' }, ctx).state;
    s = reduce(s, { k: 'POINTER_DOWN', pointerId: 1, screen: at(s, A), button: 0, keys: K }, ctx).state;
    s = reduce(s, { k: 'POINTER_MOVE', pointerId: 1, screen: at(s, B), keys: K }, ctx).state;
    expect(s.drag?.kind).toBe('CREATE_SKETCH');
    expect(inkSessionOf(s).drawing).toBe(false);
  });

  it('획을 떼면 방금 만든 메모가 세션의 주인이 된다 (선택 = 세션 = 같은 메모)', () => {
    const { state, ctx, doc } = boot();
    const { after, memoId } = stroke(state, ctx, doc, A, B);
    expect(memoId).not.toBeNull();
    expect(after.inkMemoId).toBe(memoId);
    expect(after.selection.memoId).toBe(memoId);
  });

  it('도구를 바꾸면 세션이 끝난다', () => {
    const { state, ctx, doc } = boot();
    const { after } = stroke(state, ctx, doc, A, B);
    const s = reduce(after, { k: 'SET_TOOL', tool: 'SELECT' }, ctx).state;
    expect(s.inkMemoId).toBeNull();
    // 선택 자체는 유지된다 — 세션만 끝난 것이다
    expect(s.selection.memoId).toBe(after.inkMemoId);
  });

  it('다른 곳을 탭해 선택이 옮겨가면 세션이 끝난다', () => {
    const { state, ctx, doc } = boot();
    const { after } = stroke(state, ctx, doc, A, B);
    const s = reduce(after, { k: 'SET_TOOL', tool: 'SELECT' }, ctx).state;
    const tapped = reduce(
      s,
      { k: 'POINTER_DOWN', pointerId: 2, screen: at(s, { x: 0.9, y: 0.9 }), button: 0, keys: K },
      ctx,
    ).state;
    expect(tapped.inkMemoId).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('T-1 · 점선 상자 렌더', () => {
  it('⭐ 획을 뗀 직후: 그 메모가 선택돼 있어도 상자를 안 그린다', () => {
    const { state, ctx, doc } = boot();
    const { after } = stroke(state, ctx, doc, A, B);
    expect(after.selection.memoId).toBe(after.inkMemoId); // 선택은 돼 있다
    expect(boxCount(after, ctx)).toBe(0); // 그래도 상자는 없다
  });

  it('⭐ 두 번째 획을 긋는 중: 첫 획(선택 상태)의 상자도 안 그린다', () => {
    const { state, ctx, doc } = boot();
    const first = stroke(state, ctx, doc, A, B);
    const second = stroke(first.after, ctx, doc, C, D, 2);
    // `during` = 두 번째 획을 아직 안 뗀 시점. 선택은 첫 획의 메모에 남아 있다
    expect(second.during.selection.memoId).toBe(first.memoId);
    expect(inkSessionOf(second.during).drawing).toBe(true);
    expect(boxCount(second.during, ctx)).toBe(0);
  });

  it('⭐ 획을 긋는 중이면 **관련 없는 다른 메모**가 선택돼 있어도 상자를 안 그린다', () => {
    const { state, ctx, doc } = boot();
    doc.push(memoOf('old', [{ id: 'p0', points: [C, D], width: 3 }]));
    const picked: CanvasState = {
      ...state,
      selection: { defectId: null, part: 'MEMO', markId: null, memoId: 'old' },
    };
    expect(boxCount(picked, ctx)).toBe(1); // 평상시에는 D14 대로 보인다
    const { during } = stroke(picked, ctx, doc, A, B);
    expect(boxCount(during, ctx)).toBe(0);
  });

  it('⭐ 세션이 끝나면(도구 변경) D14 규칙이 되살아난다 — "항상 숨김" 이 아니다', () => {
    const { state, ctx, doc } = boot();
    const { after } = stroke(state, ctx, doc, A, B);
    expect(boxCount(after, ctx)).toBe(0);
    const s = reduce(after, { k: 'SET_TOOL', tool: 'SELECT' }, ctx).state;
    expect(boxCount(s, ctx)).toBe(1);
  });

  it('⭐ 세션이 끝나면 지우개(ERASER) 도구에서도 선택·hover 상자가 보인다 (D14 유지)', () => {
    const { state, ctx, doc } = boot();
    const { after } = stroke(state, ctx, doc, A, B);
    const s = reduce(after, { k: 'SET_TOOL', tool: 'ERASER' }, ctx).state;
    const hovered: CanvasState = {
      ...s,
      selection: { defectId: null, part: null, markId: null, memoId: null },
      hover: { defectId: null, part: 'MEMO', markId: null, memoId: after.inkMemoId },
    };
    expect(boxCount(hovered, ctx)).toBe(1);
  });

  it('출력 경로(inkSession 미전달)는 D14 그대로다', () => {
    const { state, ctx, doc } = boot();
    const { after } = stroke(state, ctx, doc, A, B);
    // 같은 상태라도 세션을 안 넘기면 "선택됨" → 상자가 보인다.
    // 즉 T-1 은 출력(`locationMap`)에 한 글자도 영향을 주지 않는다
    expect(boxCount(after, ctx, false)).toBe(1);
  });

  it('획(polyline)은 세션과 무관하게 항상 그려진다', () => {
    const { state, ctx, doc } = boot();
    const { after } = stroke(state, ctx, doc, A, B);
    const ops = buildOverlay(
      {
        drawing: DRAWING,
        viewport: after.viewport,
        canvas: after.canvas,
        defects: [],
        displayNumbers: {},
        globalStyle: GS,
        selection: after.selection,
        hover: null,
        guides: [],
        preview: null,
        dragDefectId: null,
        memos: memoScreensOf(after, ctx),
        inkSession: inkSessionOf(after),
      },
      [],
    );
    expect(ops.filter((o) => o.k === 'polyline').length).toBeGreaterThan(0);
  });
});
