/**
 * S2a — 마커 도구 3종 + 메모.
 *
 * 확인하는 것:
 *   · 생성 조작(드래그) 과 최소 임계값 취소
 *   · 좌표가 전부 0~1 정규화인가 (불변식 #1)
 *   · 기하 판정이 **스크린 px** 기준인가 (도면 종횡비에 흔들리지 않는가)
 *   · 히트 테스트 우선순위 — 특히 "영역 내부가 위의 작은 표기를 삼키지 않는다"
 *   · 위치·크기가 `geometry` 이고 `style` 로 새지 않는가 (함정 #5)
 *   · 메모가 결함이 아닌가 (상태색 · 결함 목록)
 *   · 전부 Undo 가능한가
 */
import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  applyToDoc,
  invertCommand,
  type Command,
  type Doc,
} from '../src/commands.js';
import { NO_KEYS, reduce, type ReduceContext } from '../src/interaction.js';
import { buildScreens } from '../src/renderModel.js';
import { hitTest } from '../src/hitTest.js';
import { memoScreens, wrapMemoText } from '../src/memoGeom.js';
import { hatchRect, normalizeRect, squareTo } from '../src/shapes.js';
import { initialCanvasState } from '../src/interaction.js';
import { STATUS_COLOR, MEMO_BG, MEMO_BORDER, MEMO_TEXT } from '../src/constants.js';
import type { CanvasState, Defect, InputEvent, Memo, SPoint } from '../src/types.js';
import { defect, GS } from './helpers.js';

// **일부러 종횡비를 크게** 잡는다. N 공간에서 각도·거리를 재면 여기서 티가 난다
const DRAWING = { id: 'dw', imageWidth: 4000, imageHeight: 1000 };
const VP = { zoom: 1, tx: 0, ty: 0 };
const CANVAS = { w: 900, h: 600 };

let idSeq = 0;
function ctxOf(defects: Defect[] = [], memos: Memo[] = []): ReduceContext {
  return {
    defects,
    memos,
    globalStyle: GS,
    makeId: () => `id${(idSeq += 1)}`,
    now: () => 1700000000000,
    deviceId: 'dev',
    floorId: 'f1',
    projectId: 'p1',
  };
}

function baseState(tool: CanvasState['tool']): CanvasState {
  return {
    ...initialCanvasState(CANVAS),
    drawing: DRAWING,
    viewport: VP,
    tool,
  };
}

/** 이벤트 열을 순서대로 흘려보내고 마지막 결과를 돌려준다 */
function run(state: CanvasState, ctx: ReduceContext, evs: InputEvent[]) {
  let s = state;
  const commands: Command[] = [];
  const effects = [];
  for (const ev of evs) {
    const r = reduce(s, ev, ctx);
    s = r.state;
    commands.push(...r.commands);
    effects.push(...r.effects);
  }
  return { state: s, commands, effects };
}

function drag(from: SPoint, to: SPoint, shift = false): InputEvent[] {
  const keys = { ...NO_KEYS, shift };
  return [
    { k: 'POINTER_DOWN', pointerId: 1, screen: from, button: 0, keys },
    { k: 'POINTER_MOVE', pointerId: 1, screen: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, keys },
    { k: 'POINTER_MOVE', pointerId: 1, screen: to, keys },
    { k: 'POINTER_UP', pointerId: 1, screen: to, keys },
  ];
}

// ── 생성 ────────────────────────────────────────────────────────────────────
describe('S2a-2 · 생성 조작', () => {
  it('영역 — 대각 드래그가 어느 방향이어도 w·h 가 음수가 되지 않는다', () => {
    const ctx = ctxOf();
    // 오른쪽 아래 → 왼쪽 위 로 끈다
    const r = run(baseState('AREA_RECT'), ctx, drag({ x: 400, y: 300 }, { x: 200, y: 120 }));
    const c = r.commands.find((x) => x.k === 'CREATE_DEFECT');
    const g = c && c.k === 'CREATE_DEFECT' ? c.defect.marks[0]!.geometry : null;
    if (g?.k !== 'AREA_RECT') throw new Error('expected AREA_RECT');
    expect(g.w).toBeGreaterThan(0);
    expect(g.h).toBeGreaterThan(0);
    expect(g.x).toBeCloseTo(200 / 4000, 5);
    expect(g.y).toBeCloseTo(120 / 1000, 5);
  });

  it('⚠️ 드래그가 8px 미만이면 생성을 취소한다 (실수 클릭 방지)', () => {
    const ctx = ctxOf();
    const r = run(baseState('AREA_ELLIPSE'), ctx, drag({ x: 200, y: 200 }, { x: 204, y: 203 }));
    expect(r.commands).toHaveLength(0);
    expect(r.effects.some((e) => e.k === 'TOAST' && e.kind === 'warn')).toBe(true);
  });

  it('생성 직후 그 대상이 선택 상태가 된다', () => {
    const ctx = ctxOf();
    const r = run(baseState('AREA_RECT'), ctx, drag({ x: 100, y: 100 }, { x: 400, y: 300 }));
    const c = r.commands.find((x) => x.k === 'CREATE_DEFECT');
    expect(r.state.selection.defectId).toBe(c && c.k === 'CREATE_DEFECT' ? c.defect.id : null);
    expect(r.state.selection.part).toBe('MARK');
  });

  it('⚠️ Shift 정사각은 **스크린** 기준이다 — 종횡비 4:1 도면에서도 화면이 정사각', () => {
    const ctx = ctxOf();
    const r = run(baseState('AREA_RECT'), ctx, drag({ x: 100, y: 100 }, { x: 300, y: 180 }, true));
    const c = r.commands.find((x) => x.k === 'CREATE_DEFECT');
    const g = c && c.k === 'CREATE_DEFECT' ? c.defect.marks[0]!.geometry : null;
    if (g?.k !== 'AREA_RECT') throw new Error('expected AREA_RECT');
    // 스크린 px 로 환산하면 가로·세로가 같아야 한다
    expect(g.w * 4000).toBeCloseTo(g.h * 1000, 3);
  });

  it('모든 좌표가 0~1 안에 있다 (불변식 #1)', () => {
    const ctx = ctxOf();
    // 도면 밖(스크린 5000px = 정규화 1.25)까지 끌어도 클램프된다
    const r = run(baseState('AREA_RECT'), ctx, drag({ x: 100, y: 100 }, { x: 5000, y: 4000 }));
    const c = r.commands.find((x) => x.k === 'CREATE_DEFECT');
    const g = c && c.k === 'CREATE_DEFECT' ? c.defect.marks[0]!.geometry : null;
    if (g?.k !== 'AREA_RECT') throw new Error('expected AREA_RECT');
    expect(g.x).toBeGreaterThanOrEqual(0);
    expect(g.y).toBeGreaterThanOrEqual(0);
    expect(g.x + g.w).toBeLessThanOrEqual(1);
    expect(g.y + g.h).toBeLessThanOrEqual(1);
  });

  it('도면 밖에서 시작하면 만들지 않는다', () => {
    const ctx = ctxOf();
    const r = run(baseState('AREA_RECT'), ctx, drag({ x: -50, y: -50 }, { x: 200, y: 200 }));
    expect(r.commands).toHaveLength(0);
  });
});

// ── F2 · 화살표는 점과 동일하게 클릭 한 번으로 만든다 ───────────────────────
describe('F2 · 화살표 — 점과 동일한 클릭 생성 (드래그가 아니다)', () => {
  it('클릭 한 번으로 결함이 만들어진다 — 드래그가 필요 없다', () => {
    const ctx = ctxOf();
    const r = run(baseState('ARROW'), ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: { x: 100, y: 100 }, button: 0, keys: NO_KEYS },
      { k: 'POINTER_UP', pointerId: 1, screen: { x: 100, y: 100 }, keys: NO_KEYS },
    ]);
    const c = r.commands.find((x) => x.k === 'CREATE_DEFECT');
    expect(c?.k).toBe('CREATE_DEFECT');
    const g = c && c.k === 'CREATE_DEFECT' ? c.defect.marks[0]!.geometry : null;
    expect(g?.k).toBe('ARROW');
    if (g?.k !== 'ARROW') throw new Error('unreachable');
    // 클릭한 지점이 꼬리(from) 이다
    expect(g.from.x).toBeCloseTo(100 / 4000, 5);
    expect(g.from.y).toBeCloseTo(100 / 1000, 5);
    // 머리(to)는 꼬리와 다른 기본 방향·길이를 갖는다 — 사용자가 나중에 조정한다
    expect(g.to.x).not.toBeCloseTo(g.from.x, 5);
  });

  it('생성 직후 선택 상태가 된다 (점 도구와 동일)', () => {
    const ctx = ctxOf();
    const r = run(baseState('ARROW'), ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: { x: 300, y: 200 }, button: 0, keys: NO_KEYS },
      { k: 'POINTER_UP', pointerId: 1, screen: { x: 300, y: 200 }, keys: NO_KEYS },
    ]);
    const c = r.commands.find((x) => x.k === 'CREATE_DEFECT');
    expect(r.state.selection.defectId).toBe(c && c.k === 'CREATE_DEFECT' ? c.defect.id : null);
    expect(r.state.selection.part).toBe('MARK');
  });

  it('도면 밖을 클릭하면 만들지 않는다 (점 도구와 동일한 안내)', () => {
    const ctx = ctxOf();
    const r = run(baseState('ARROW'), ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: { x: -50, y: -50 }, button: 0, keys: NO_KEYS },
      { k: 'POINTER_UP', pointerId: 1, screen: { x: -50, y: -50 }, keys: NO_KEYS },
    ]);
    expect(r.commands).toHaveLength(0);
    expect(r.effects.some((e) => e.k === 'TOAST' && e.kind === 'warn')).toBe(true);
  });

  it('그 자리에서 드래그하면(클릭이 아니라 이동) 팬으로 처리되고 아무것도 만들지 않는다', () => {
    const ctx = ctxOf();
    const r = run(baseState('ARROW'), ctx, drag({ x: 100, y: 100 }, { x: 300, y: 250 }));
    expect(r.commands).toHaveLength(0);
  });

  it('머리(TO) 핸들은 클릭 생성 이후에도 기존 히트 테스트로 그대로 잡힌다 (§2-4 HANDLE)', () => {
    const d = withGeometry(
      defect('a1', 1, { x: 0.1, y: 0.1 }, { x: 0.05, y: 0.05 }),
      { k: 'ARROW', from: { x: 0.1, y: 0.1 }, to: { x: 0.3, y: 0.2 } },
      'ARROW',
    );
    const screens = buildScreens({ drawing: DRAWING, viewport: VP, defects: [d], globalStyle: GS, preview: null });
    const to = screens[0]!.marks[0]!.to;
    if (!to) throw new Error('expected arrow head');
    const hit = hitTest(to, screens, { defectId: 'a1', part: 'MARK', markId: 'a1-m0' });
    expect(hit?.part).toBe('HANDLE');
    expect(hit?.handle).toBe('TO');
  });
});

// ── F4 · 번호 풍선은 도구와 무관하게 항상 잡힌다 ────────────────────────────
describe('F4 · 번호 풍선은 도구가 켜져 있어도 항상 먼저 잡힌다', () => {
  const TOOLS_WITH_CREATE: CanvasState['tool'][] = ['ARROW', 'AREA_RECT', 'AREA_ELLIPSE', 'SKETCH'];

  for (const tool of TOOLS_WITH_CREATE) {
    it(`${tool} 도구가 켜져 있어도 라벨을 클릭하면 라벨 드래그가 시작된다 (생성되지 않는다)`, () => {
      const d = defect('d1', 1, { x: 0.2, y: 0.2 }, { x: 0.5, y: 0.5 });
      const ctx = ctxOf([d]);
      const screens = buildScreens({
        drawing: DRAWING,
        viewport: VP,
        defects: [d],
        globalStyle: GS,
        preview: null,
      });
      const labelScreen = screens[0]!.label;
      const r = run(baseState(tool), ctx, [
        { k: 'POINTER_DOWN', pointerId: 1, screen: labelScreen, button: 0, keys: NO_KEYS },
      ]);
      expect(r.state.drag?.kind).toBe('MOVE_LABEL');
      expect(r.state.selection.defectId).toBe('d1');
      expect(r.state.selection.part).toBe('LABEL');
      // 새 결함이 만들어지지 않았다 — 라벨을 잡은 것이지 그 위에 새로 그린 게 아니다
      expect(r.commands.some((c) => c.k === 'CREATE_DEFECT')).toBe(false);
    });
  }

  it('라벨이 아닌 위치(빈 도면)를 누르면 도구대로 그대로 생성한다 — 예외는 라벨뿐이다', () => {
    const d = defect('d1', 1, { x: 0.05, y: 0.05 }, { x: 0.05, y: 0.05 });
    const ctx = ctxOf([d]);
    // d1 의 마크·라벨과 겹치지 않는 먼 지점에서 드래그 (AREA_RECT — 드래그로 생성하는 도구)
    const r = run(baseState('AREA_RECT'), ctx, drag({ x: 2000, y: 500 }, { x: 2300, y: 650 }));
    const c = r.commands.find((x) => x.k === 'CREATE_DEFECT');
    expect(c?.k).toBe('CREATE_DEFECT');
  });

  it('전회차(잠긴) 결함의 라벨은 다른 도구가 켜져 있어도 선택만 되고 끌리지 않는다', () => {
    const d = defect('d1', 1, { x: 0.2, y: 0.2 }, { x: 0.5, y: 0.5 }, { status: 'PREV_PENDING' });
    const ctx = ctxOf([d]);
    const screens = buildScreens({
      drawing: DRAWING,
      viewport: VP,
      defects: [d],
      globalStyle: GS,
      preview: null,
    });
    const labelScreen = screens[0]!.label;
    const r = run(baseState('AREA_RECT'), ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: labelScreen, button: 0, keys: NO_KEYS },
    ]);
    expect(r.state.drag).toBeNull();
    expect(r.state.selection.defectId).toBe('d1');
    expect(r.state.selection.part).toBe('LABEL');
  });
});

// ── 자유그리기 ──────────────────────────────────────────────────────────────
describe('S2a-1 · 자유그리기는 마크가 아니라 결함 종속 스케치다', () => {
  it('선택된 결함에 Path 가 붙는다. 번호 라벨·리더선은 생기지 않는다', () => {
    const d = defect('d1', 1, { x: 0.5, y: 0.5 }, { x: 0.6, y: 0.4 });
    const ctx = ctxOf([d]);
    const s: CanvasState = {
      ...baseState('SKETCH'),
      selection: { defectId: 'd1', part: 'MARK', markId: 'd1-m0' },
    };
    const r = run(s, ctx, drag({ x: 100, y: 100 }, { x: 400, y: 300 }));
    const c = r.commands.find((x) => x.k === 'ADD_SKETCH');
    expect(c?.k).toBe('ADD_SKETCH');
    if (c?.k !== 'ADD_SKETCH') throw new Error('unreachable');
    expect(c.path.points.length).toBeGreaterThanOrEqual(2);
    // 마크는 그대로 1개 — 스케치는 마크가 아니다
    const after = applyCommand([d], c);
    expect(after[0]!.marks).toHaveLength(1);
    expect(after[0]!.sketch).toHaveLength(1);
    // 좌표는 전부 정규화
    for (const p of c.path.points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    }
  });

  /**
   * F2 (Q16 재결정) — 예전에는 "선택된 결함이 없으면 만들지 않고 안내"였다.
   * 지금은 **버리지 않고 사후연결 대기**로 넘어간다. 아래 F2 블록이 그 동작을 고정한다.
   */
  it('선택된 결함이 없으면 커맨드를 내지 않고 대기 상태로 넘어간다', () => {
    const ctx = ctxOf([]);
    const r = run(baseState('SKETCH'), ctx, drag({ x: 100, y: 100 }, { x: 400, y: 300 }));
    expect(r.commands).toHaveLength(0);
    expect(r.state.pendingSketch?.paths).toHaveLength(1);
  });
});

// ── F2 자유그리기 사후연결 ─────────────────────────────────────────────────
describe('F2 · 그리기는 그린 뒤 결함을 고른다 (사후연결)', () => {
  const stroke = () => drag({ x: 100, y: 100 }, { x: 400, y: 300 });

  it('대기 중에 더 그리면 획이 쌓인다 (버리지 않는다)', () => {
    const ctx = ctxOf([]);
    const a = run(baseState('SKETCH'), ctx, stroke());
    const b = run(a.state, ctx, drag({ x: 150, y: 150 }, { x: 300, y: 350 }));
    expect(b.state.pendingSketch?.paths).toHaveLength(2);
    expect(b.commands).toHaveLength(0);
  });

  it('[새 결함으로] 는 CREATE_DEFECT 하나로 끝난다 (Undo 한 번에 통째로 되돌아간다)', () => {
    const ctx = ctxOf([]);
    const a = run(baseState('SKETCH'), ctx, stroke());
    const r = run(a.state, ctx, [{ k: 'PENDING_SKETCH_TO_NEW_DEFECT' }]);
    expect(r.commands).toHaveLength(1);
    const c = r.commands[0]!;
    expect(c.k).toBe('CREATE_DEFECT');
    if (c.k !== 'CREATE_DEFECT') return;
    // marks 는 1개 이상이 필수다 (상세기획 §3-3) — 획의 중심에 POINT 를 놓는다
    expect(c.defect.marks).toHaveLength(1);
    expect(c.defect.marks[0]!.type).toBe('POINT');
    expect(c.defect.sketch).toHaveLength(1);
    expect(r.state.pendingSketch).toBeNull();
  });

  it('새 결함의 POINT 는 획의 중심이고 [0,1] 안이다', () => {
    const ctx = ctxOf([]);
    const a = run(baseState('SKETCH'), ctx, stroke());
    const r = run(a.state, ctx, [{ k: 'PENDING_SKETCH_TO_NEW_DEFECT' }]);
    const c = r.commands[0]!;
    if (c.k !== 'CREATE_DEFECT') throw new Error('CREATE_DEFECT');
    const g = c.defect.marks[0]!.geometry;
    if (g.k !== 'POINT') throw new Error('POINT');
    expect(g.x).toBeGreaterThanOrEqual(0);
    expect(g.x).toBeLessThanOrEqual(1);
    expect(g.y).toBeGreaterThanOrEqual(0);
    expect(g.y).toBeLessThanOrEqual(1);
  });

  it('대기 중 결함 표기를 클릭하면 그 결함에 붙는다 (도구를 바꾸지 않아도 된다)', () => {
    const d = defect('d1', 1, { x: 0.5, y: 0.5 }, { x: 0.6, y: 0.4 });
    const ctx = ctxOf([d]);
    const a = run(baseState('SKETCH'), ctx, stroke());
    expect(a.state.pendingSketch?.paths).toHaveLength(1);
    // 마크(0.5, 0.5) = 스크린 (2000, 500) — 4000×1000 도면, zoom 1
    const r = run(a.state, ctx, [
      { k: 'POINTER_DOWN', pointerId: 9, screen: { x: 2000, y: 500 }, button: 0, keys: NO_KEYS },
    ]);
    expect(r.commands.filter((c) => c.k === 'ADD_SKETCH')).toHaveLength(1);
    expect(r.state.pendingSketch).toBeNull();
  });

  it('두 획을 그린 뒤 붙이면 ADD_SKETCH 가 획 수만큼 나온다', () => {
    const d = defect('d1', 1, { x: 0.5, y: 0.5 }, { x: 0.6, y: 0.4 });
    const ctx = ctxOf([d]);
    const a = run(baseState('SKETCH'), ctx, stroke());
    const b = run(a.state, ctx, drag({ x: 150, y: 150 }, { x: 300, y: 350 }));
    const r = run(b.state, ctx, [{ k: 'ATTACH_PENDING_SKETCH', defectId: 'd1' }]);
    expect(r.commands.filter((c) => c.k === 'ADD_SKETCH')).toHaveLength(2);
  });

  it('전회차 결함에는 붙지 않고 경고만 낸다', () => {
    const d = { ...defect('d1', 1, { x: 0.5, y: 0.5 }, { x: 0.6, y: 0.4 }), status: 'PREV_PENDING' as const };
    const ctx = ctxOf([d]);
    const a = run(baseState('SKETCH'), ctx, stroke());
    const r = run(a.state, ctx, [{ k: 'ATTACH_PENDING_SKETCH', defectId: 'd1' }]);
    expect(r.commands).toHaveLength(0);
    expect(r.effects.some((e) => e.k === 'TOAST' && e.kind === 'warn')).toBe(true);
    expect(r.state.pendingSketch?.paths).toHaveLength(1); // 버리지 않는다
  });

  it('Escape 로 대기를 버린다', () => {
    const ctx = ctxOf([]);
    const a = run(baseState('SKETCH'), ctx, stroke());
    const r = run(a.state, ctx, [{ k: 'KEY_DOWN', key: 'Escape', keys: NO_KEYS }]);
    expect(r.state.pendingSketch).toBeNull();
    expect(r.commands).toHaveLength(0);
  });

  it('도구를 바꿔도 대기는 유지된다 (실수로 잃으면 안 된다)', () => {
    const ctx = ctxOf([]);
    const a = run(baseState('SKETCH'), ctx, stroke());
    const r = run(a.state, ctx, [{ k: 'SET_TOOL', tool: 'SELECT' }]);
    expect(r.state.pendingSketch?.paths).toHaveLength(1);
  });

  it('선택된 결함이 있으면 예전처럼 곧바로 붙는다 (대기하지 않는다)', () => {
    const d = defect('d1', 1, { x: 0.5, y: 0.5 }, { x: 0.6, y: 0.4 });
    const ctx = ctxOf([d]);
    const st = { ...baseState('SKETCH'), selection: { defectId: 'd1', part: 'MARK' as const, markId: 'm-d1' } };
    const r = run(st, ctx, stroke());
    expect(r.commands.filter((c) => c.k === 'ADD_SKETCH')).toHaveLength(1);
    expect(r.state.pendingSketch).toBeNull();
  });
});

// ── 메모 ────────────────────────────────────────────────────────────────────
describe('S2a-1 · 메모는 결함이 아니다', () => {
  it('클릭하면 메모가 만들어지고 곧바로 편집기를 요청한다', () => {
    const ctx = ctxOf();
    const r = run(baseState('MEMO'), ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: { x: 200, y: 200 }, button: 0, keys: NO_KEYS },
      { k: 'POINTER_UP', pointerId: 1, screen: { x: 200, y: 200 }, keys: NO_KEYS },
    ]);
    const c = r.commands.find((x) => x.k === 'CREATE_MEMO');
    expect(c?.k).toBe('CREATE_MEMO');
    expect(r.effects.some((e) => e.k === 'EDIT_MEMO')).toBe(true);
    // 결함 커맨드는 하나도 나오지 않는다
    expect(r.commands.some((x) => x.k === 'CREATE_DEFECT')).toBe(false);
  });

  it('메모 커맨드는 결함 컬렉션을 건드리지 않는다', () => {
    const d = defect('d1', 1, { x: 0.5, y: 0.5 }, { x: 0.6, y: 0.4 });
    const memo = makeMemo('m1', { x: 0.2, y: 0.2 }, '누수 확인 필요');
    const doc: Doc = { defects: [d], memos: [] };
    const after = applyToDoc(doc, { k: 'CREATE_MEMO', memo });
    expect(after.defects).toHaveLength(1);
    expect(after.defects[0]).toBe(d); // 참조까지 그대로
    expect(after.memos).toHaveLength(1);
  });

  it('⚠️ 메모 색은 결함 상태색(빨강·보라·회색)이 아니다 (§S2a-6)', () => {
    const reserved = [STATUS_COLOR.CURRENT, STATUS_COLOR.PREV_PENDING, STATUS_COLOR.REPAIRED];
    for (const c of [MEMO_BG, MEMO_BORDER, MEMO_TEXT]) {
      expect(reserved).not.toContain(c.toLowerCase());
    }
    // 가이드 시안과도 겹치지 않는다
    expect([MEMO_BG, MEMO_BORDER, MEMO_TEXT]).not.toContain('#00b8d4');
  });

  it('빈 메모를 확정하면 지운다', () => {
    const memo = makeMemo('m1', { x: 0.2, y: 0.2 }, '');
    const ctx = ctxOf([], [memo]);
    const r = reduce(baseState('SELECT'), { k: 'COMMIT_MEMO_TEXT', memoId: 'm1', text: '  ' }, ctx);
    expect(r.commands[0]?.k).toBe('DELETE_MEMO');
  });

  it('한국어 줄바꿈은 어절 단위다 — 단어 한가운데를 자르지 않는다', () => {
    const lines = wrapMemoText('천장 슬래브 누수 흔적 확인', 8);
    for (const l of lines) expect(l.startsWith(' ')).toBe(false);
    // 어절이 통째로 살아 있다
    expect(lines.join(' ')).toContain('슬래브');
  });
});

// ── 히트 테스트 우선순위 ────────────────────────────────────────────────────
describe('S2a-3 · 히트 테스트 우선순위', () => {
  it('⚠️ 채워진 큰 영역이 그 위의 작은 점 마크를 삼키지 않는다', () => {
    // 화면 전체를 덮는 채움 영역
    const area = withGeometry(
      defect('big', 1, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.9 }),
      { k: 'AREA_RECT', x: 0.0, y: 0.0, w: 0.9, h: 0.9 },
      'AREA_RECT',
    );
    const areaFilled: Defect = { ...area, style: { areaFill: 'HATCH' } };
    // 그 위에 얹힌 작은 점 (seq 가 더 크다 = 위에 그려진다)
    const dot = defect('dot', 2, { x: 0.05, y: 0.2 }, { x: 0.2, y: 0.6 });

    const screens = buildScreens({
      drawing: DRAWING,
      viewport: VP,
      defects: [areaFilled, dot],
      globalStyle: GS,
      preview: null,
    });
    const at = { x: 0.05 * 4000, y: 0.2 * 1000 };
    const hit = hitTest(at, screens, { defectId: null, part: null, markId: null });
    expect(hit?.defectId).toBe('dot');
    expect(hit?.part).toBe('MARK');
  });

  it('투명한(채움 없는) 영역의 빈 속은 잡히지 않는다 → 팬이 된다', () => {
    const area = withGeometry(
      defect('big', 1, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.9 }),
      { k: 'AREA_RECT', x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
      'AREA_RECT',
    );
    const screens = buildScreens({
      drawing: DRAWING,
      viewport: VP,
      defects: [area],
      globalStyle: GS,
      preview: null,
    });
    // 테두리·리더선 어디에도 닿지 않는 속
    const at = { x: 0.15 * 4000, y: 0.5 * 1000 };
    expect(hitTest(at, screens, { defectId: null, part: null, markId: null })).toBeNull();
  });

  it('영역 테두리는 잡힌다', () => {
    const area = withGeometry(
      defect('big', 1, { x: 0.5, y: 0.5 }, { x: 0.02, y: 0.9 }),
      { k: 'AREA_RECT', x: 0.1, y: 0.1, w: 0.5, h: 0.5 },
      'AREA_RECT',
    );
    const screens = buildScreens({
      drawing: DRAWING,
      viewport: VP,
      defects: [area],
      globalStyle: GS,
      preview: null,
    });
    const at = { x: 0.1 * 4000, y: 0.35 * 1000 }; // 왼쪽 세로 테두리 위
    const hit = hitTest(at, screens, { defectId: null, part: null, markId: null });
    expect(hit?.part).toBe('MARK');
    expect(hit?.defectId).toBe('big');
  });

  it('메모는 결함 표기보다 아래다 — 겹치면 결함이 이긴다', () => {
    const d = defect('d1', 1, { x: 0.05, y: 0.2 }, { x: 0.3, y: 0.7 });
    const screens = buildScreens({
      drawing: DRAWING,
      viewport: VP,
      defects: [d],
      globalStyle: GS,
      preview: null,
    });
    const memo = makeMemo('m1', { x: 0.0, y: 0.0 }, '아주 큰 메모');
    const ms = memoScreens([memo], VP, 4000, 1000, null);
    const at = { x: 0.05 * 4000, y: 0.2 * 1000 };
    const hit = hitTest(at, screens, { defectId: null, part: null, markId: null }, ms);
    expect(hit?.part).toBe('MARK');
  });

  it('선택된 영역에만 리사이즈 핸들이 나온다', () => {
    const area = withGeometry(
      defect('a1', 1, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.9 }),
      { k: 'AREA_RECT', x: 0.1, y: 0.1, w: 0.4, h: 0.4 },
      'AREA_RECT',
    );
    const screens = buildScreens({
      drawing: DRAWING,
      viewport: VP,
      defects: [area],
      globalStyle: GS,
      preview: null,
    });
    const corner = { x: 0.1 * 4000, y: 0.1 * 1000 }; // NW 핸들
    expect(hitTest(corner, screens, { defectId: null, part: null, markId: null })?.part).not.toBe(
      'HANDLE',
    );
    const sel = { defectId: 'a1', part: 'MARK' as const, markId: null };
    const hit = hitTest(corner, screens, sel);
    expect(hit?.part).toBe('HANDLE');
    expect(hit?.handle).toBe('NW');
  });
});

// ── 스타일 vs 기하 ──────────────────────────────────────────────────────────
describe('S2a-5 · 위치·크기는 geometry 이고 style 이 아니다 (함정 #5)', () => {
  it('영역을 옮기고 크기를 바꿔도 style 은 null 로 남는다', () => {
    const area = withGeometry(
      defect('a1', 1, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.9 }),
      { k: 'AREA_RECT', x: 0.1, y: 0.1, w: 0.4, h: 0.4 },
      'AREA_RECT',
    );
    expect(area.style).toBeNull();
    const cmd: Command = {
      k: 'SET_MARK_GEOMETRY',
      defectId: 'a1',
      markId: 'a1-m0',
      from: { k: 'AREA_RECT', x: 0.1, y: 0.1, w: 0.4, h: 0.4 },
      to: { k: 'AREA_RECT', x: 0.2, y: 0.2, w: 0.5, h: 0.3 },
      labelFrom: null,
      labelTo: null,
    };
    const after = applyCommand([area], cmd);
    expect(after[0]!.style).toBeNull(); // ← 전역 상속에서 이탈하지 않았다
    expect(after[0]!.marks[0]!.geometry).toEqual({ k: 'AREA_RECT', x: 0.2, y: 0.2, w: 0.5, h: 0.3 });
  });

  it('색을 바꾸면 style 이 생기고, 되돌리면 다시 null 이 된다 ([초기화])', () => {
    const d = defect('d1', 1, { x: 0.5, y: 0.5 }, { x: 0.6, y: 0.4 });
    const ctx = ctxOf([d]);
    const r = reduce(baseState('SELECT'), { k: 'SET_MARK_COLOR', defectId: 'd1', color: '#e07b00' }, ctx);
    const c = r.commands[0]!;
    const colored = applyCommand([d], c);
    expect(colored[0]!.style?.color).toBe('#e07b00');
    // 마지막 키를 지우면 null 로 돌아간다 — 전역 상속 복귀
    const ctx2 = ctxOf(colored);
    const r2 = reduce(baseState('SELECT'), { k: 'SET_MARK_COLOR', defectId: 'd1', color: null }, ctx2);
    const back = applyCommand(colored, r2.commands[0]!);
    expect(back[0]!.style).toBeNull();
  });
});

// ── Undo ────────────────────────────────────────────────────────────────────
describe('S2a-4 · 새 조작은 전부 Undo 대상이다', () => {
  const d = defect('d1', 1, { x: 0.5, y: 0.5 }, { x: 0.6, y: 0.4 });
  const memo = makeMemo('m1', { x: 0.2, y: 0.2 }, '원래 글');

  const cases: { name: string; cmd: Command; doc: Doc }[] = [
    {
      name: '영역 기하 변경',
      cmd: {
        k: 'SET_MARK_GEOMETRY',
        defectId: 'd1',
        markId: 'd1-m0',
        from: { k: 'POINT', x: 0.5, y: 0.5 },
        to: { k: 'POINT', x: 0.7, y: 0.3 },
        labelFrom: null,
        labelTo: null,
      },
      doc: { defects: [d], memos: [] },
    },
    {
      name: '자유그리기 추가',
      cmd: {
        k: 'ADD_SKETCH',
        defectId: 'd1',
        path: { id: 's1', points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }], width: 3 },
        index: 0,
      },
      doc: { defects: [d], memos: [] },
    },
    {
      name: '자유그리기 이동',
      cmd: {
        k: 'MOVE_SKETCH',
        defectId: 'd1',
        pathId: 's1',
        from: [{ x: 0.1, y: 0.1 }],
        to: [{ x: 0.3, y: 0.3 }],
      },
      doc: {
        defects: [{ ...d, sketch: [{ id: 's1', points: [{ x: 0.1, y: 0.1 }], width: 3 }] }],
        memos: [],
      },
    },
    {
      name: '메모 생성',
      cmd: { k: 'CREATE_MEMO', memo },
      doc: { defects: [], memos: [] },
    },
    {
      name: '메모 이동',
      cmd: { k: 'MOVE_MEMO', memoId: 'm1', from: { x: 0.2, y: 0.2 }, to: { x: 0.5, y: 0.5 } },
      doc: { defects: [], memos: [memo] },
    },
    {
      name: '메모 수정',
      cmd: { k: 'SET_MEMO_TEXT', memoId: 'm1', from: '원래 글', to: '바뀐 글' },
      doc: { defects: [], memos: [memo] },
    },
    {
      name: '스타일 변경',
      cmd: { k: 'SET_STYLE', defectId: 'd1', from: null, to: { color: '#1a7f37' } },
      doc: { defects: [d], memos: [] },
    },
  ];

  for (const c of cases) {
    it(`${c.name} — 되돌리면 원래대로 돌아온다`, () => {
      const applied = applyToDoc(c.doc, c.cmd);
      const back = applyToDoc(applied, invertCommand(c.cmd));
      expect(back.defects).toEqual(c.doc.defects);
      expect(back.memos).toEqual(c.doc.memos);
    });
  }
});

// ── 순수 기하 ───────────────────────────────────────────────────────────────
describe('shapes — 순수 기하', () => {
  it('normalizeRect 는 어느 방향이든 양수 w·h 를 만든다', () => {
    expect(normalizeRect(10, 10, 4, 2)).toEqual({ x: 4, y: 2, w: 6, h: 8 });
  });

  it('squareTo 는 더 긴 축에 맞추고 방향을 보존한다', () => {
    expect(squareTo({ x: 0, y: 0 }, { x: -10, y: 3 })).toEqual({ x: -10, y: 10 });
  });

  it('45° 해치는 사각형 안에서만 그어진다', () => {
    const r = { x: 0, y: 0, w: 100, h: 60 };
    const lines = hatchRect(r, 9);
    expect(lines.length).toBeGreaterThan(3);
    for (const l of lines) {
      for (const p of [l.a, l.b]) {
        expect(p.x).toBeGreaterThanOrEqual(r.x - 0.001);
        expect(p.x).toBeLessThanOrEqual(r.x + r.w + 0.001);
        expect(p.y).toBeGreaterThanOrEqual(r.y - 0.001);
        expect(p.y).toBeLessThanOrEqual(r.y + r.h + 0.001);
      }
    }
  });

  it('해치는 상한이 있어 거대한 영역에서도 선이 폭증하지 않는다', () => {
    expect(hatchRect({ x: 0, y: 0, w: 200000, h: 200000 }, 1).length).toBeLessThanOrEqual(400);
  });
});

// ── helpers ─────────────────────────────────────────────────────────────────
function makeMemo(id: string, pos: { x: number; y: number }, text: string): Memo {
  return {
    id,
    projectId: 'p1',
    drawingId: 'dw',
    floorId: 'f1',
    pos,
    text,
    style: null,
    createdAt: 1,
    updatedAt: 1,
    deviceId: 'dev',
    createdBy: null,
  };
}

function withGeometry(
  d: Defect,
  geometry: Defect['marks'][number]['geometry'],
  type: Defect['marks'][number]['type'],
): Defect {
  return { ...d, marks: [{ ...d.marks[0]!, type, geometry }] };
}
