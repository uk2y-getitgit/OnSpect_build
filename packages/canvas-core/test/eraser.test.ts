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

// ── (d) 지우개 ─────────────────────────────────────────────────────────────
describe('D14-d · 지우개', () => {
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
});
