/**
 * D14 — 필기메모 점선상자 숨김 · 획 히트 · 지우개.
 *
 * 여기서 고정하는 것 셋:
 *   1. 점선 상자는 **선택·hover 일 때만** 그린다 (텍스트 메모의 노란 상자는 그대로)
 *   2. 필기 메모는 **획 근처**에서만 잡힌다 — 획 사이 빈 공간·상자 테두리는 안 잡힌다
 *   3. 지우개는 **필기 메모의 획만** 지운다. 결함 표기는 한 개도 안 건드린다
 *
 * ⚠️ 3번이 이 작업에서 유일하게 사용자 데이터를 지울 수 있는 지점이다.
 *    "다른 점·화살표·번호가 지워지면 안 된다" 를 코드로 못박는다.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_HIT_PROFILE, HIT_MEMO_INK_PX } from '../src/constants.js';
import {
  applyToDoc,
  invertCommand,
  pushHistory,
  EMPTY_HISTORY,
  type Command,
} from '../src/commands.js';
import { toScreen } from '../src/geometry.js';
import { hitTest } from '../src/hitTest.js';
import { initialCanvasState, memoScreensOf, reduce, type ReduceContext } from '../src/interaction.js';
import { buildOverlay, buildScreens } from '../src/renderModel.js';
import { memoScreens } from '../src/memoGeom.js';
import type { CanvasState, Defect, Keys, Memo, NPoint, SketchPath } from '../src/types.js';
import { defect, GS } from './helpers.js';

const DRAWING = { id: 'dw', imageWidth: 2400, imageHeight: 1600 };
const K: Keys = { space: false, alt: false, shift: false, ctrl: false };

function inkPath(id: string, pts: NPoint[], width = 3): SketchPath {
  return { id, points: pts, width };
}

function memo(id: string, paths: SketchPath[] | null, text = ''): Memo {
  return {
    id,
    projectId: 'p1',
    drawingId: 'dw',
    floorId: 'f1',
    // 필기 메모의 pos 는 획 묶음 좌상단 앵커다
    pos: paths?.[0]?.points[0] ?? { x: 0.1, y: 0.1 },
    text,
    paths,
    style: null,
    createdAt: 1,
    updatedAt: 1,
    deviceId: 'dev',
    createdBy: null,
  };
}

/** 왼쪽 세로획 + 오른쪽 세로획. 두 획 **사이는 빈 공간**이다 */
const P1 = inkPath('p1', [
  { x: 0.2, y: 0.2 },
  { x: 0.2, y: 0.4 },
]);
const P2 = inkPath('p2', [
  { x: 0.5, y: 0.2 },
  { x: 0.5, y: 0.4 },
]);

function boot(memos: Memo[], defects: Defect[] = []): { state: CanvasState; ctx: ReduceContext } {
  let n = 0;
  const ctx: ReduceContext = {
    defects,
    memos,
    globalStyle: GS,
    makeId: () => `e${(n += 1)}`,
    now: () => 1000,
  };
  let st = initialCanvasState();
  st = reduce(st, { k: 'RESIZE', size: { w: 1000, h: 700 } }, ctx).state;
  st = reduce(st, { k: 'SET_DRAWING', drawing: DRAWING }, ctx).state;
  return { state: st, ctx };
}

function at(state: CanvasState, n: NPoint) {
  return toScreen(n, state.viewport, DRAWING.imageWidth, DRAWING.imageHeight);
}

// ── (a) 점선 상자 ──────────────────────────────────────────────────────────
describe('D14-a · 필기 메모의 점선 상자는 선택·hover 일 때만 보인다', () => {
  function boxOps(over: { selectedId?: string; hoverId?: string }, m: Memo) {
    const { state, ctx } = boot([m]);
    const screens = buildScreens({
      drawing: DRAWING,
      viewport: state.viewport,
      defects: [],
      globalStyle: GS,
      preview: null,
    });
    const ops = buildOverlay(
      {
        drawing: DRAWING,
        viewport: state.viewport,
        canvas: state.canvas,
        defects: [],
        displayNumbers: {},
        globalStyle: GS,
        selection: {
          defectId: null,
          part: over.selectedId ? 'MEMO' : null,
          markId: null,
          memoId: over.selectedId ?? null,
        },
        hover: over.hoverId
          ? { defectId: null, part: 'MEMO', markId: null, memoId: over.hoverId }
          : null,
        guides: [],
        preview: null,
        dragDefectId: null,
        memos: memoScreensOf(state, ctx),
      },
      screens,
    );
    return ops.filter((o) => o.k === 'rect');
  }

  const INK = memo('m1', [P1, P2]);
  const TEXT = memo('m2', null, '누수 확인');

  it('평상시에는 상자를 그리지 않는다 — 획만 남는다', () => {
    expect(boxOps({}, INK)).toHaveLength(0);
  });

  it('선택하면 그린다', () => {
    expect(boxOps({ selectedId: 'm1' }, INK)).toHaveLength(1);
  });

  it('hover 해도 그린다', () => {
    expect(boxOps({ hoverId: 'm1' }, INK)).toHaveLength(1);
  });

  it('⭐ 텍스트 메모의 노란 상자는 그대로다 — 그 상자가 메모 본체다', () => {
    expect(boxOps({}, TEXT).length).toBeGreaterThan(0);
  });

  it('획은 상자와 무관하게 항상 그려진다', () => {
    const { state, ctx } = boot([INK]);
    const ops = buildOverlay(
      {
        drawing: DRAWING,
        viewport: state.viewport,
        canvas: state.canvas,
        defects: [],
        displayNumbers: {},
        globalStyle: GS,
        selection: { defectId: null, part: null, markId: null },
        hover: null,
        guides: [],
        preview: null,
        dragDefectId: null,
        memos: memoScreensOf(state, ctx),
      },
      [],
    );
    expect(ops.filter((o) => o.k === 'polyline')).toHaveLength(2);
  });
});

// ── (b) 획 히트 ────────────────────────────────────────────────────────────
describe('D14-b · 필기 메모는 획 근처에서만 잡힌다', () => {
  const INK = memo('m1', [P1, P2]);

  function ms(state: CanvasState) {
    return memoScreens([INK], state.viewport, DRAWING.imageWidth, DRAWING.imageHeight, null);
  }
  const SEL = { defectId: null, part: null, markId: null } as const;

  it('획 위를 찍으면 잡힌다', () => {
    const { state } = boot([INK]);
    const hit = hitTest(at(state, { x: 0.2, y: 0.3 }), [], SEL, ms(state));
    expect(hit?.part).toBe('MEMO');
    expect(hit?.memoId).toBe('m1');
  });

  it('⭐ 두 획 **사이의 빈 공간**은 잡히지 않는다 (글씨 사이로 도면이 보인다)', () => {
    const { state } = boot([INK]);
    // 0.35 는 상자 안이지만 어느 획에서도 멀다
    expect(hitTest(at(state, { x: 0.35, y: 0.3 }), [], SEL, ms(state))).toBeNull();
  });

  it('⭐ 점선 상자의 테두리도 잡히지 않는다 — 보이지 않는 것을 잡으면 안 된다', () => {
    const { state } = boot([INK]);
    // 상자 위쪽 변 한가운데 (y = 0.2 근처, x 는 두 획 사이)
    expect(hitTest(at(state, { x: 0.35, y: 0.2 }), [], SEL, ms(state))).toBeNull();
  });

  it('허용치는 프로파일을 탄다 — 손가락 프로파일이면 더 멀리서도 잡힌다', () => {
    const { state } = boot([INK]);
    // 획에서 약 18 스크린 px 떨어진 지점
    const s = at(state, { x: 0.2, y: 0.3 });
    const off = { x: s.x + 18, y: s.y };
    expect(hitTest(off, [], SEL, ms(state))).toBeNull();
    const fat = { ...DEFAULT_HIT_PROFILE, memoInk: 30 };
    expect(hitTest(off, [], SEL, ms(state), fat)?.memoId).toBe('m1');
  });

  it('기본 허용치는 12 px 다', () => {
    expect(HIT_MEMO_INK_PX).toBe(12);
    expect(DEFAULT_HIT_PROFILE.memoInk).toBe(12);
  });
});

/**
 * 지우개 드래그 1회를 그대로 재현한다.
 *
 * ⚠️ **매 이벤트마다 `ctx` 를 새로 만들어 문서 최신본을 넣는다** — 실제 앱(`store.runInput`)이
 *    그렇게 돈다. 고정 ctx 로 돌리면 이미 지운 획을 다음 move 가 또 지워 결과가 달라진다.
 *
 * @param idSeed `makeId` 시작 번호. 드래그마다 다른 `eraseId` 가 나오게 한다
 *               (앱에서는 `store` 의 `idSeed` 가 단조 증가한다)
 */
function erase(memos: Memo[], defects: Defect[], path: NPoint[], idSeed = 0) {
  let doc: { defects: readonly Defect[]; memos: readonly Memo[] } = { defects, memos };
  let n = idSeed;
  const makeId = () => `e${(n += 1)}`;
  const mk = (): ReduceContext => ({
    defects: doc.defects,
    memos: doc.memos,
    globalStyle: GS,
    makeId,
    now: () => 1000,
  });

  let st = initialCanvasState();
  st = reduce(st, { k: 'RESIZE', size: { w: 1000, h: 700 } }, mk()).state;
  st = reduce(st, { k: 'SET_DRAWING', drawing: DRAWING }, mk()).state;
  st = reduce(st, { k: 'SET_TOOL', tool: 'ERASER' }, mk()).state;

  const cmds: Command[] = [];
  const run = (ev: Parameters<typeof reduce>[1]) => {
    const r = reduce(st, ev, mk());
    st = r.state;
    for (const c of r.commands) {
      doc = applyToDoc(doc, c);
      cmds.push(c);
    }
    return r;
  };

  run({ k: 'POINTER_DOWN', pointerId: 1, screen: at(st, path[0]!), button: 0, keys: K });
  for (const p of path.slice(1)) {
    run({ k: 'POINTER_MOVE', pointerId: 1, screen: at(st, p), keys: K });
  }
  const up = run({
    k: 'POINTER_UP',
    pointerId: 1,
    screen: at(st, path[path.length - 1]!),
    keys: K,
  });
  return { state: st, commands: cmds, effects: up.effects, doc };
}

// ── (d) 지우개 ─────────────────────────────────────────────────────────────
describe('D14-d · 지우개', () => {
  it('획 하나를 지운다 — 나머지 획은 남는다', () => {
    const m = memo('m1', [P1, P2]);
    const { commands } = erase([m], [], [{ x: 0.2, y: 0.3 }]);
    expect(commands).toHaveLength(1);
    const c = commands[0]!;
    if (c.k !== 'DELETE_MEMO_PATH') throw new Error('DELETE_MEMO_PATH 가 아니다');
    expect(c.items).toHaveLength(1);
    expect(c.items[0]!.path.id).toBe('p1');
    expect(c.items[0]!.index).toBe(0);
    expect(c.memos).toHaveLength(0);

    const doc = applyToDoc({ defects: [], memos: [m] }, c);
    expect(doc.memos).toHaveLength(1);
    expect(doc.memos[0]!.paths!.map((p) => p.id)).toEqual(['p2']);
  });

  it('⭐ 마지막 획을 지우면 메모 레코드도 사라진다 (빈 메모를 남기지 않는다)', () => {
    const m = memo('m1', [P1]);
    const { commands } = erase([m], [], [{ x: 0.2, y: 0.3 }]);
    const c = commands[0]!;
    if (c.k !== 'DELETE_MEMO_PATH') throw new Error('DELETE_MEMO_PATH 가 아니다');
    expect(c.items).toHaveLength(0);
    expect(c.memos.map((x) => x.id)).toEqual(['m1']);

    const doc = applyToDoc({ defects: [], memos: [m] }, c);
    expect(doc.memos).toHaveLength(0);
  });

  it('⭐ 결함 표기는 한 개도 안 지운다 — 점 · 자유그리기 위를 문질러도 그대로', () => {
    const d = defect('d1', 1, { x: 0.2, y: 0.3 }, { x: 0.25, y: 0.3 });
    const withSketch: Defect = {
      ...d,
      sketch: [inkPath('sk1', [{ x: 0.2, y: 0.25 }, { x: 0.2, y: 0.35 }])],
    };
    const { commands, state } = erase([], [withSketch], [
      { x: 0.2, y: 0.25 },
      { x: 0.2, y: 0.3 },
      { x: 0.2, y: 0.35 },
    ]);
    expect(commands).toHaveLength(0);
    expect(state.selection.defectId).toBeNull();
  });

  it('빈 자리를 문질러도 아무 일도 없다', () => {
    const m = memo('m1', [P1]);
    const { commands, effects } = erase([m], [], [{ x: 0.8, y: 0.8 }]);
    expect(commands).toHaveLength(0);
    expect(effects).toHaveLength(0);
  });

  it('⭐ 한 번의 드래그 = Undo 1스텝 (여러 획을 지나가도)', () => {
    const m = memo('m1', [P1, P2]);
    // 두 획을 차례로 지나간다. 가운데(0.35)는 빈 공간이라 아무것도 안 지운다
    const { commands, doc } = erase([m], [], [
      { x: 0.2, y: 0.3 },
      { x: 0.35, y: 0.3 },
      { x: 0.5, y: 0.3 },
    ]);
    expect(commands).toHaveLength(2);

    let h = EMPTY_HISTORY;
    for (const c of commands) h = pushHistory(h, c);
    // 두 커맨드가 같은 eraseId 로 **한 단계**에 합쳐졌다
    expect(h.undo).toHaveLength(1);
    // 획이 0개가 되어 메모도 사라졌다
    expect(doc.memos).toHaveLength(0);

    // Ctrl+Z 한 번이면 두 획이 다 돌아온다
    const back = applyToDoc(doc, invertCommand(h.undo[0]!));
    expect(back.memos).toHaveLength(1);
    expect(back.memos[0]!.paths!.map((p) => p.id).sort()).toEqual(['p1', 'p2']);
  });

  it('손을 뗐다 다시 지우면 두 단계다 — 드래그 경계가 Undo 경계다', () => {
    const m = memo('m1', [P1, P2]);
    const a = erase([m], [], [{ x: 0.2, y: 0.3 }]);
    const b = erase(a.doc.memos as Memo[], [], [{ x: 0.5, y: 0.3 }], 100);
    let h = EMPTY_HISTORY;
    h = pushHistory(h, a.commands[0]!);
    h = pushHistory(h, b.commands[0]!);
    expect(h.undo).toHaveLength(2);
  });

  it('되돌리면 획이 **원래 자리**로 돌아간다 (index 복원)', () => {
    const P3 = inkPath('p3', [{ x: 0.8, y: 0.2 }, { x: 0.8, y: 0.4 }]);
    const m = memo('m1', [P1, P2, P3]);
    const { commands } = erase([m], [], [{ x: 0.5, y: 0.3 }]); // 가운데 획
    const c = commands[0]!;
    const gone = applyToDoc({ defects: [], memos: [m] }, c);
    expect(gone.memos[0]!.paths!.map((p) => p.id)).toEqual(['p1', 'p3']);
    const back = applyToDoc(gone, invertCommand(c));
    expect(back.memos[0]!.paths!.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('지우개로 눌러도 메모가 선택되거나 끌려가지 않는다', () => {
    const m = memo('m1', [P1, P2]);
    const { state } = erase([m], [], [{ x: 0.2, y: 0.3 }]);
    expect(state.selection.memoId ?? null).toBeNull();
    expect(state.drag).toBeNull();
  });

  it('지운 게 있을 때만 알린다', () => {
    const m = memo('m1', [P1, P2]);
    const hit = erase([m], [], [{ x: 0.2, y: 0.3 }]);
    expect(hit.effects.some((e) => e.k === 'TOAST')).toBe(true);
  });

  it('텍스트 메모는 지우개 대상이 아니다', () => {
    const t = memo('m2', null, '누수 확인');
    const { commands } = erase([t], [], [{ x: 0.12, y: 0.12 }]);
    expect(commands).toHaveLength(0);
  });

  it('⭐ 지우개로 누르면 이전 선택이 풀린다 — 지우개 모드의 Delete 키가 결함을 지우면 안 된다', () => {
    const d = defect('d1', 1, { x: 0.7, y: 0.7 }, { x: 0.75, y: 0.7 });
    const { state: st0, ctx } = boot([], [d]);
    const on = at(st0, { x: 0.7, y: 0.7 });
    let st = reduce(st0, { k: 'POINTER_DOWN', pointerId: 1, screen: on, button: 0, keys: K }, ctx).state;
    st = reduce(st, { k: 'POINTER_UP', pointerId: 1, screen: on, keys: K }, ctx).state;
    expect(st.selection.defectId).toBe('d1');

    st = reduce(st, { k: 'SET_TOOL', tool: 'ERASER' }, ctx).state;
    st = reduce(
      st,
      { k: 'POINTER_DOWN', pointerId: 1, screen: at(st, { x: 0.9, y: 0.9 }), button: 0, keys: K },
      ctx,
    ).state;
    expect(st.selection.defectId).toBeNull();
  });
});

// ── (e) 지운 뒤 옮기기 · 되돌리기 순서 (배치4 검수 회귀) ────────────────────
describe('D14-e · 지우개 뒤에도 이동·되돌리기가 정확하다', () => {
  const P3 = inkPath('p3', [
    { x: 0.8, y: 0.2 },
    { x: 0.8, y: 0.4 },
  ]);

  /** SELECT 도구로 메모를 잡아 한 번 끄는 드래그 */
  function dragMemo(memos: Memo[], grabN: NPoint, d: { x: number; y: number }) {
    const { state: st0, ctx } = boot(memos);
    const g = at(st0, grabN);
    const to = { x: g.x + d.x, y: g.y + d.y };
    let st = reduce(
      st0,
      { k: 'POINTER_DOWN', pointerId: 1, screen: g, button: 0, keys: K },
      ctx,
    ).state;
    st = reduce(st, { k: 'POINTER_MOVE', pointerId: 1, screen: to, keys: K }, ctx).state;
    const moving = memoScreensOf(st, ctx);
    const up = reduce(st, { k: 'POINTER_UP', pointerId: 1, screen: to, keys: K }, ctx);
    return { commands: up.commands, viewport: st0.viewport, moving };
  }

  function moveCmdOf(commands: readonly Command[]) {
    const c = commands.find((x) => x.k === 'MOVE_MEMO');
    if (!c || c.k !== 'MOVE_MEMO') throw new Error('MOVE_MEMO 커맨드가 없다');
    return c;
  }

  /**
   * [심각1] 이동 델타는 **잡은 손가락이 움직인 거리**여야 한다.
   * 예전에는 상자(획 bbox − 여백) 기준으로 오프셋을 잡고 커밋은 `memo.pos` 기준 델타로
   * 나가서, 지우개가 앵커와 bbox 를 어긋내면 그만큼 메모가 멀리 튀었다.
   */
  it('⭐ 왼쪽 획을 지운 뒤 남은 획을 끌면 **끈 거리만큼만** 움직인다', () => {
    const m = memo('m1', [P1, P2]);
    const { doc } = erase([m], [], [{ x: 0.2, y: 0.3 }]);
    const left = doc.memos[0]!;
    expect(left.paths!.map((p) => p.id)).toEqual(['p2']);
    // pos 는 지워진 p1 자리에 그대로 남는다 — 이것이 예전 점프 버그의 씨앗이었다
    expect(left.pos.x).toBeCloseTo(0.2, 6);

    const D = { x: 100, y: 40 };
    const r = dragMemo([left], { x: 0.5, y: 0.3 }, D);
    const c = moveCmdOf(r.commands);
    const dx = c.to.x - c.from.x;
    const dy = c.to.y - c.from.y;
    expect(dx).toBeCloseTo(D.x / (r.viewport.zoom * DRAWING.imageWidth), 5);
    expect(dy).toBeCloseTo(D.y / (r.viewport.zoom * DRAWING.imageHeight), 5);

    // 실제 획도 딱 그만큼만 옮겨진다 (0.5 → 0.5 + dx)
    const moved = applyToDoc({ defects: [], memos: [left] }, c).memos[0]!;
    expect(moved.paths![0]!.points[0]!.x).toBeCloseTo(0.5 + dx, 5);
  });

  it('지우개를 안 써도 이동은 정확하다 — 상자 여백(MEMO_BOX_PAD)만큼도 어긋나지 않는다', () => {
    const m = memo('m1', [P1, P2]);
    const D = { x: 60, y: -25 };
    const r = dragMemo([m], { x: 0.2, y: 0.3 }, D);
    const c = moveCmdOf(r.commands);
    expect(c.to.x - c.from.x).toBeCloseTo(D.x / (r.viewport.zoom * DRAWING.imageWidth), 5);
    expect(c.to.y - c.from.y).toBeCloseTo(D.y / (r.viewport.zoom * DRAWING.imageHeight), 5);
  });

  it('드래그 미리보기도 끈 거리만큼만 움직인다 (커밋 결과와 어긋나지 않는다)', () => {
    const m = memo('m1', [P1, P2]);
    const { doc } = erase([m], [], [{ x: 0.2, y: 0.3 }]); // 왼쪽 획 삭제
    const left = doc.memos[0]!;
    const D = { x: 100, y: 40 };
    const r = dragMemo([left], { x: 0.5, y: 0.3 }, D);
    const before = memoScreens(
      [left],
      r.viewport,
      DRAWING.imageWidth,
      DRAWING.imageHeight,
      null,
    )[0]!;
    const after = r.moving[0]!;
    expect(after.paths![0]!.points[0]!.x - before.paths![0]!.points[0]!.x).toBeCloseTo(D.x, 3);
    expect(after.paths![0]!.points[0]!.y - before.paths![0]!.points[0]!.y).toBeCloseTo(D.y, 3);
    expect(after.box.x - before.box.x).toBeCloseTo(D.x, 3);
  });

  /** [보통1] 연속 삭제의 역연산은 index 오름차순이 아니라 **역-시간순**이다 */
  it('⭐ 한 드래그로 1·3번째 획을 지우고 되돌리면 원래 순서 그대로 돌아온다', () => {
    const m = memo('m1', [P1, P2, P3]);
    const { commands, doc } = erase([m], [], [
      { x: 0.2, y: 0.3 }, // p1 (그 시점 index 0)
      { x: 0.8, y: 0.3 }, // p3 (그 시점 index 1)
    ]);
    expect(doc.memos[0]!.paths!.map((p) => p.id)).toEqual(['p2']);

    let h = EMPTY_HISTORY;
    for (const c of commands) h = pushHistory(h, c);
    expect(h.undo).toHaveLength(1);
    const step = h.undo[0]!;
    if (step.k !== 'DELETE_MEMO_PATH') throw new Error('DELETE_MEMO_PATH 가 아니다');
    // 시간순으로 쌓인다 — index 는 **지운 그 시점** 기준이라 오름차순 재삽입이면 틀린다
    expect(step.items.map((i) => [i.path.id, i.index])).toEqual([
      ['p1', 0],
      ['p3', 1],
    ]);

    const back = applyToDoc(doc, invertCommand(step));
    expect(back.memos[0]!.paths!.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('⭐ 마지막 획까지 지워 메모가 사라진 경우도 순서 그대로 되살아난다', () => {
    const m = memo('m1', [P1, P2, P3]);
    const { commands, doc } = erase([m], [], [
      { x: 0.5, y: 0.3 }, // p2 (index 1)
      { x: 0.2, y: 0.3 }, // p1 (index 0)
      { x: 0.8, y: 0.3 }, // p3 — 마지막 획이라 레코드째 삭제
    ]);
    expect(doc.memos).toHaveLength(0);

    let h = EMPTY_HISTORY;
    for (const c of commands) h = pushHistory(h, c);
    expect(h.undo).toHaveLength(1);
    const step = h.undo[0]!;
    if (step.k !== 'DELETE_MEMO_PATH') throw new Error('DELETE_MEMO_PATH 가 아니다');
    expect(step.items.map((i) => [i.path.id, i.index])).toEqual([
      ['p2', 1],
      ['p1', 0],
    ]);
    expect(step.memos.map((x) => x.paths!.map((p) => p.id))).toEqual([['p3']]);

    const back = applyToDoc(doc, invertCommand(step));
    expect(back.memos).toHaveLength(1);
    expect(back.memos[0]!.paths!.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });
});
