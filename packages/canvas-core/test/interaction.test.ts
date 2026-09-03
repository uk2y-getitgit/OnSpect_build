import { describe, expect, it } from 'vitest';
import {
  initialCanvasState,
  reduce,
  screensOf,
  type ReduceContext,
} from '../src/interaction.js';
import { buildOverlay, buildScreens } from '../src/renderModel.js';
import { toScreen } from '../src/geometry.js';
import { defect, GS } from './helpers.js';
import type { CanvasState, Defect, InputEvent, Keys } from '../src/types.js';

const DRAWING = { id: 'dw', imageWidth: 2400, imageHeight: 1600 };
const CANVAS = { w: 1000, h: 700 };
const K: Keys = { space: false, alt: false, shift: false, ctrl: false };

function ctxOf(defects: Defect[]): ReduceContext {
  let n = 0;
  return { defects, globalStyle: GS, makeId: () => `id${(n += 1)}` };
}

function boot(defects: Defect[]): { state: CanvasState; ctx: ReduceContext } {
  const ctx = ctxOf(defects);
  let s = initialCanvasState();
  s = reduce(s, { k: 'RESIZE', size: CANVAS }, ctx).state;
  s = reduce(s, { k: 'SET_DRAWING', drawing: DRAWING }, ctx).state;
  return { state: s, ctx };
}

function run(state: CanvasState, ctx: ReduceContext, events: InputEvent[]) {
  let s = state;
  const commands = [];
  const effects = [];
  for (const ev of events) {
    const r = reduce(s, ev, ctx);
    s = r.state;
    commands.push(...r.commands);
    effects.push(...r.effects);
  }
  return { state: s, commands, effects };
}

describe('T2/T3 · 셸과 뷰포트', () => {
  it('도면을 걸면 Fit 상태로 들어온다', () => {
    const { state } = boot([]);
    expect(state.viewport.zoom).toBeGreaterThan(0);
    expect(state.viewport.tx).toBeGreaterThanOrEqual(0);
  });

  it('도면(층)마다 뷰포트를 따로 기억한다 (B10)', () => {
    const { state, ctx } = boot([]);
    const zoomed = reduce(
      state,
      { k: 'WHEEL', screen: { x: 500, y: 350 }, deltaY: -100, keys: K },
      ctx,
    ).state;
    const other = { id: 'dw2', imageWidth: 4000, imageHeight: 800 };
    const s2 = reduce(zoomed, { k: 'SET_DRAWING', drawing: other }, ctx).state;
    expect(s2.viewport.zoom).not.toBeCloseTo(zoomed.viewport.zoom, 6);
    const back = reduce(s2, { k: 'SET_DRAWING', drawing: DRAWING }, ctx).state;
    expect(back.viewport.zoom).toBeCloseTo(zoomed.viewport.zoom, 10);
    expect(back.viewport.tx).toBeCloseTo(zoomed.viewport.tx, 10);
  });

  it('요소 드래그 중에는 휠 줌이 막힌다 (정렬 스냅샷 유효성)', () => {
    const d = defect('a', 1, { x: 0.3, y: 0.5 }, { x: 0.6, y: 0.4 });
    const { state, ctx } = boot([d]);
    const s = screensOf(state, ctx)[0]!;
    const down = run(state, ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: s.label, button: 0, keys: K },
    ]).state;
    expect(down.drag?.kind).toBe('MOVE_LABEL');
    const after = reduce(down, { k: 'WHEEL', screen: s.label, deltaY: -100, keys: K }, ctx).state;
    expect(after.viewport.zoom).toBe(down.viewport.zoom);
  });
});

describe('T6 · 드래그 이동', () => {
  const d = () => defect('a', 1, { x: 0.3, y: 0.5 }, { x: 0.6, y: 0.4 });

  it('라벨을 끌면 MOVE_LABEL 커맨드가 나오고 정규화 좌표로 저장된다', () => {
    const { state, ctx } = boot([d()]);
    const s = screensOf(state, ctx)[0]!;
    const { commands } = run(state, ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: s.label, button: 0, keys: K },
      { k: 'POINTER_MOVE', pointerId: 1, screen: { x: s.label.x + 80, y: s.label.y + 40 }, keys: K },
      { k: 'POINTER_UP', pointerId: 1, screen: { x: s.label.x + 80, y: s.label.y + 40 }, keys: K },
    ]);
    expect(commands).toHaveLength(1);
    const c = commands[0]!;
    expect(c.k).toBe('MOVE_LABEL');
    if (c.k === 'MOVE_LABEL') {
      expect(c.toPlaced).toBe(true);
      expect(c.to.x).toBeGreaterThan(c.from.x);
      expect(String(c.to.x).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(6);
    }
  });

  it('4px 미만 이동은 클릭으로 처리되어 커맨드가 없다', () => {
    const { state, ctx } = boot([d()]);
    const s = screensOf(state, ctx)[0]!;
    const { commands, state: after } = run(state, ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: s.label, button: 0, keys: K },
      { k: 'POINTER_MOVE', pointerId: 1, screen: { x: s.label.x + 2, y: s.label.y }, keys: K },
      { k: 'POINTER_UP', pointerId: 1, screen: { x: s.label.x + 2, y: s.label.y }, keys: K },
    ]);
    expect(commands).toHaveLength(0);
    expect(after.selection.defectId).toBe('a'); // 선택은 됐다
  });

  it('Esc 로 드래그를 취소하면 커맨드가 나오지 않는다', () => {
    const { state, ctx } = boot([d()]);
    const s = screensOf(state, ctx)[0]!;
    const { commands, state: after } = run(state, ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: s.label, button: 0, keys: K },
      { k: 'POINTER_MOVE', pointerId: 1, screen: { x: s.label.x + 90, y: s.label.y }, keys: K },
      { k: 'KEY_DOWN', key: 'Escape', keys: K },
      { k: 'POINTER_UP', pointerId: 1, screen: { x: s.label.x + 90, y: s.label.y }, keys: K },
    ]);
    expect(commands).toHaveLength(0);
    expect(after.drag).toBeNull();
  });

  it('마크 드래그에는 스냅이 걸리지 않고 라벨이 따라온다', () => {
    const { state, ctx } = boot([d()]);
    const s = screensOf(state, ctx)[0]!;
    const from = s.marks[0]!.center;
    const { commands, state: after } = run(state, ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: from, button: 0, keys: K },
      { k: 'POINTER_MOVE', pointerId: 1, screen: { x: from.x + 50, y: from.y + 20 }, keys: K },
      { k: 'POINTER_UP', pointerId: 1, screen: { x: from.x + 50, y: from.y + 20 }, keys: K },
    ]);
    expect(after.guides).toHaveLength(0);
    const c = commands[0]!;
    expect(c.k).toBe('MOVE_MARK');
    if (c.k === 'MOVE_MARK') {
      expect(c.labelTo).not.toBeNull();
      expect(c.labelTo!.x - c.labelFrom!.x).toBeCloseTo(c.to.x - c.from.x, 5);
    }
  });

  it('전회차 표기는 드래그가 시작되지 않는다 (A8)', () => {
    const prev = defect('p', 1, { x: 0.3, y: 0.5 }, { x: 0.6, y: 0.4 }, { status: 'PREV_PENDING' });
    const { state, ctx } = boot([prev]);
    const s = screensOf(state, ctx)[0]!;
    const after = run(state, ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: s.label, button: 0, keys: K },
    ]).state;
    expect(after.drag).toBeNull();
    expect(after.selection.defectId).toBe('p');
  });

  it('마크는 [0,1] 로 클램프된다', () => {
    const { state, ctx } = boot([d()]);
    const s = screensOf(state, ctx)[0]!;
    const from = s.marks[0]!.center;
    const { commands } = run(state, ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: from, button: 0, keys: K },
      { k: 'POINTER_MOVE', pointerId: 1, screen: { x: -5000, y: -5000 }, keys: K },
      { k: 'POINTER_UP', pointerId: 1, screen: { x: -5000, y: -5000 }, keys: K },
    ]);
    const c = commands[0]!;
    if (c.k === 'MOVE_MARK') {
      expect(c.to.x).toBe(0);
      expect(c.to.y).toBe(0);
    }
  });
});

describe('T11 · 점 마커 생성 (D3)', () => {
  it('POINT 도구로 도면을 클릭하면 즉시 결함 1건이 생긴다', () => {
    const existing = defect('a', 3, { x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 });
    const { state, ctx } = boot([existing]);
    const s = reduce(state, { k: 'SET_TOOL', tool: 'POINT' }, ctx).state;
    const at = toScreen({ x: 0.5, y: 0.5 }, s.viewport, 2400, 1600);
    const { commands, state: after } = run(s, ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: at, button: 0, keys: K },
      { k: 'POINTER_UP', pointerId: 1, screen: at, keys: K },
    ]);
    expect(commands).toHaveLength(1);
    const c = commands[0]!;
    expect(c.k).toBe('CREATE_DEFECT');
    if (c.k === 'CREATE_DEFECT') {
      expect(c.defect.seq).toBe(4); // 층 내 입력순번 = max + 1
      expect(c.defect.marks).toHaveLength(1);
      expect(c.defect.marks[0]!.geometry).toEqual({ k: 'POINT', x: 0.5, y: 0.5 });
      expect(c.defect.label.placed).toBe(false); // 자동 배치 상태
      expect(c.defect.label.anchorMarkId).toBe(c.defect.marks[0]!.id);
      expect(c.defect.memberName).toBeNull(); // 미완성 허용 (D3)
      expect(c.defect.style).toBeNull();
      expect(after.selection.defectId).toBe(c.defect.id); // 생성 즉시 선택
    }
  });

  it('도면 바깥 클릭은 결함을 만들지 않는다', () => {
    const { state, ctx } = boot([]);
    const s = reduce(state, { k: 'SET_TOOL', tool: 'POINT' }, ctx).state;
    const outside = { x: 2, y: 2 }; // Fit 여백 영역
    const { commands, effects } = run(s, ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: outside, button: 0, keys: K },
      { k: 'POINTER_UP', pointerId: 1, screen: outside, keys: K },
    ]);
    expect(commands).toHaveLength(0);
    expect(effects.some((e) => e.k === 'TOAST')).toBe(true);
  });

  it('SELECT 도구에서는 빈 도면 클릭이 선택 해제다', () => {
    const existing = defect('a', 1, { x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 });
    const { state, ctx } = boot([existing]);
    const at = toScreen({ x: 0.8, y: 0.8 }, state.viewport, 2400, 1600);
    const { commands } = run({ ...state, selection: { defectId: 'a', part: 'LABEL', markId: null } }, ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: at, button: 0, keys: K },
      { k: 'POINTER_UP', pointerId: 1, screen: at, keys: K },
    ]);
    expect(commands).toHaveLength(0);
  });
});

describe('삭제 (§2-8-e)', () => {
  it('마지막 마크 삭제는 확인 요청 효과를 낸다', () => {
    const d = defect('a', 1, { x: 0.3, y: 0.5 }, { x: 0.6, y: 0.4 });
    const { state, ctx } = boot([d]);
    const s: CanvasState = { ...state, selection: { defectId: 'a', part: 'MARK', markId: 'a-m0' } };
    const r = reduce(s, { k: 'DELETE_SELECTION' }, ctx);
    expect(r.commands).toHaveLength(0);
    expect(r.effects[0]).toMatchObject({ k: 'CONFIRM_DELETE_DEFECT', reason: 'LAST_MARK' });
  });

  it('확인하면 DELETE_DEFECT 커맨드가 나온다', () => {
    const d = defect('a', 1, { x: 0.3, y: 0.5 }, { x: 0.6, y: 0.4 });
    const { state, ctx } = boot([d]);
    const r = reduce(state, { k: 'CONFIRM_DELETE_DEFECT', defectId: 'a' }, ctx);
    expect(r.commands[0]!.k).toBe('DELETE_DEFECT');
  });

  it('라벨(번호 풍선)을 선택한 채 삭제하면 결함 전체 삭제를 확인한다 (버그 수정 2026-08-24)', () => {
    // SELECT_DEFECT 는 항상 part:'LABEL' 로 선택한다 — 결함을 고르는 가장 흔한 방법이다.
    // 예전에는 여기서 "번호 풍선은 지울 수 없습니다" 토스트만 내고 아무 일도 안 했다.
    const d = defect('a', 1, { x: 0.3, y: 0.5 }, { x: 0.6, y: 0.4 });
    const { state, ctx } = boot([d]);
    const s: CanvasState = { ...state, selection: { defectId: 'a', part: 'LABEL', markId: null } };
    const r = reduce(s, { k: 'DELETE_SELECTION' }, ctx);
    expect(r.commands).toHaveLength(0);
    expect(r.effects[0]).toMatchObject({ k: 'CONFIRM_DELETE_DEFECT', defectId: 'a', reason: 'EXPLICIT' });
  });
});

describe('커서 (ui-quality §3)', () => {
  it('도구·호버·드래그에 따라 커서가 바뀐다', () => {
    const d = defect('a', 1, { x: 0.3, y: 0.5 }, { x: 0.6, y: 0.4 });
    const { state, ctx } = boot([d]);
    expect(state.cursor).toBe('grab'); // 빈 캔버스, 팬 가능

    const pointTool = reduce(state, { k: 'SET_TOOL', tool: 'POINT' }, ctx).state;
    expect(pointTool.cursor).toBe('crosshair');

    const s = screensOf(state, ctx)[0]!;
    const hovered = reduce(state, { k: 'POINTER_MOVE', pointerId: 1, screen: s.label, keys: K }, ctx).state;
    expect(hovered.cursor).toBe('move');

    const dragging = reduce(
      hovered,
      { k: 'POINTER_DOWN', pointerId: 1, screen: s.label, button: 0, keys: K },
      ctx,
    ).state;
    expect(dragging.cursor).toBe('move');

    const spacePan = reduce(state, { k: 'KEY_DOWN', key: ' ', keys: { ...K, space: true } }, ctx).state;
    expect(spacePan.cursor).toBe('grab');
  });

  it('전차 표기 위에서는 move 가 아니라 pointer 다 (2026-09-03 — 잠기는 것은 전차뿐)', () => {
    const p = defect('p', 1, { x: 0.3, y: 0.5 }, { x: 0.6, y: 0.4 }, {
      status: 'PREV_PENDING',
      prevDefectId: 'old-p',
    });
    const { state, ctx } = boot([p]);
    const s = screensOf(state, ctx)[0]!;
    const hovered = reduce(state, { k: 'POINTER_MOVE', pointerId: 1, screen: s.label, keys: K }, ctx).state;
    expect(hovered.cursor).toBe('pointer');
  });
});

describe('T4 · 렌더 모델', () => {
  const input = (defects: Defect[], displayNumbers: Record<string, string>) => ({
    drawing: DRAWING,
    viewport: { zoom: 0.4, tx: 0, ty: 0 },
    canvas: CANVAS,
    defects,
    displayNumbers,
    globalStyle: GS,
    selection: { defectId: null, part: null, markId: null },
    hover: null,
    guides: [],
    preview: null,
    dragDefectId: null,
  });

  it('표시 문자열은 주입받는다 — 코어는 seq 인지 출력번호인지 모른다 (§2-1-b)', () => {
    const d = defect('a', 7, { x: 0.3, y: 0.5 }, { x: 0.5, y: 0.3 });
    const inp = input([d], { a: '표-12' });
    const screens = buildScreens(inp);
    const ops = buildOverlay(inp, screens);
    const texts = ops.filter((o) => o.k === 'text');
    expect(texts).toHaveLength(1);
    expect(texts[0]).toMatchObject({ text: '표-12' });
  });

  it('보수완료는 파랑이고 흐리지 않다 (2026-09-03 — "회색+흐리게 하지 말 것")', () => {
    const d = defect('a', 1, { x: 0.3, y: 0.5 }, { x: 0.5, y: 0.3 }, { status: 'REPAIRED' });
    const inp = input([d], { a: '1' });
    const ops = buildOverlay(inp, buildScreens(inp));
    const circle = ops.find((o) => o.k === 'circle' && o.fill === GS.statusColor.REPAIRED);
    expect(circle).toBeDefined();
    if (circle && circle.k === 'circle') expect(circle.alpha).toBeCloseTo(1);
  });

  it('네 종류가 서로 다른 색이다 — 도면에서 구분되지 않으면 종류를 나눈 의미가 없다', () => {
    const colors = Object.values(GS.statusColor);
    expect(new Set(colors).size).toBe(4);
  });

  it('화면 밖 결함은 컬링된다', () => {
    const far = defect('far', 1, { x: 40, y: 40 }, { x: 40, y: 40 });
    const inp = input([far], { far: '1' });
    expect(buildOverlay(inp, buildScreens(inp))).toHaveLength(0);
  });

  it('화살표가 섞여 있어도 렌더가 throw 하지 않는다 (§2-0)', () => {
    const d = defect('a', 1, { x: 0.3, y: 0.5 }, { x: 0.5, y: 0.3 });
    const withArrow: Defect = {
      ...d,
      marks: [
        ...d.marks,
        {
          id: 'arrow',
          defectId: 'a',
          type: 'ARROW',
          geometry: { k: 'ARROW', points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }] },
          sortOrder: 1,
        },
      ],
    };
    const inp = input([withArrow], { a: '1' });
    expect(() => buildOverlay(inp, buildScreens(inp))).not.toThrow();
  });
});
