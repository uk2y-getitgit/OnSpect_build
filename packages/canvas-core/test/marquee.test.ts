/**
 * C-4 (D32) — 영역선택 + 일괄 삭제.
 *
 * 사용자 확정: *"기존 선택 도구 활성화 상태에서 드래그하면 영역선택으로 진행"*.
 * 더블클릭을 쓰지 않으므로 **빈 곳 더블클릭 = 화면 맞춤(fit)** 은 그대로 살아 있어야 하고,
 * **팬도 잃으면 안 된다**(중클릭 · Space+좌클릭). 그 둘을 여기서 고정한다.
 */
import { describe, expect, it } from 'vitest';
import {
  initialCanvasState,
  marqueeRectOf,
  multiTranslateOf,
  reduce,
  type ReduceContext,
} from '../src/interaction.js';
import { applyCommand, invertCommand } from '../src/commands.js';
import { clampDefectsTranslate, translateDefects } from '../src/defectGeom.js';
import { toScreen } from '../src/geometry.js';
import { defect, GS } from './helpers.js';
import type { CanvasState, Defect, InputEvent, Keys } from '../src/types.js';

const DRAWING = { id: 'dw', imageWidth: 2400, imageHeight: 1600 };
const CANVAS = { w: 1000, h: 700 };
const K: Keys = { space: false, alt: false, shift: false, ctrl: false };

function boot(defects: Defect[]): { state: CanvasState; ctx: ReduceContext } {
  let n = 0;
  const ctx: ReduceContext = { defects, globalStyle: GS, makeId: () => `id${(n += 1)}` };
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

/** 도면 왼쪽 위 구석에 몰아 둔 결함 둘 — 한 사각형으로 전부 두를 수 있다 */
const A = defect('a', 1, { x: 0.1, y: 0.1 }, { x: 0.12, y: 0.08 });
const B = defect('b', 2, { x: 0.14, y: 0.12 }, { x: 0.16, y: 0.1 });
/** 반대쪽 구석 — 사각형 밖 */
const FAR = defect('z', 3, { x: 0.9, y: 0.9 }, { x: 0.92, y: 0.88 });

const at = (s: CanvasState, n: { x: number; y: number }) =>
  toScreen(n, s.viewport, DRAWING.imageWidth, DRAWING.imageHeight);

const dragMarquee = (s: CanvasState, ctx: ReduceContext) =>
  run(s, ctx, [
    { k: 'POINTER_DOWN', pointerId: 1, screen: at(s, { x: 0.02, y: 0.02 }), button: 0, keys: K },
    { k: 'POINTER_MOVE', pointerId: 1, screen: at(s, { x: 0.3, y: 0.3 }), keys: K },
    { k: 'POINTER_UP', pointerId: 1, screen: at(s, { x: 0.3, y: 0.3 }), keys: K },
  ]);

describe('C-4 영역선택 제스처', () => {
  it('선택 도구로 빈 곳부터 끌면 사각형 안의 결함이 전부 잡힌다', () => {
    const { state, ctx } = boot([A, B, FAR]);
    const r = dragMarquee(state, ctx);
    expect([...r.state.multi].sort()).toEqual(['a', 'b']);
    expect(r.state.drag).toBeNull();
  });

  it('사각형 밖의 결함은 안 잡힌다', () => {
    const { state, ctx } = boot([A, B, FAR]);
    expect(dragMarquee(state, ctx).state.multi).not.toContain('z');
  });

  it('문서를 한 글자도 안 건드린다 — 선택일 뿐이다', () => {
    const { state, ctx } = boot([A, B]);
    expect(dragMarquee(state, ctx).commands).toEqual([]);
  });

  it('끌지 않고 그냥 누르면 선택 해제일 뿐이다 (예전 동작)', () => {
    const { state, ctx } = boot([A]);
    const p0 = at(state, { x: 0.5, y: 0.5 });
    const r = run(state, ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: p0, button: 0, keys: K },
      { k: 'POINTER_UP', pointerId: 1, screen: p0, keys: K },
    ]);
    expect(r.state.multi).toEqual([]);
    expect(r.state.selection.defectId).toBeNull();
  });

  it('끄는 동안 사각형이 파생되고, 놓으면 사라진다', () => {
    const { state, ctx } = boot([A]);
    const mid = run(state, ctx, [
      {
        k: 'POINTER_DOWN',
        pointerId: 1,
        screen: at(state, { x: 0.02, y: 0.02 }),
        button: 0,
        keys: K,
      },
      { k: 'POINTER_MOVE', pointerId: 1, screen: at(state, { x: 0.3, y: 0.3 }), keys: K },
    ]).state;
    const rect = marqueeRectOf(mid);
    expect(rect).not.toBeNull();
    expect(rect!.w).toBeGreaterThan(0);
    expect(rect!.h).toBeGreaterThan(0);

    const done = reduce(
      mid,
      { k: 'POINTER_UP', pointerId: 1, screen: at(state, { x: 0.3, y: 0.3 }), keys: K },
      ctx,
    ).state;
    expect(marqueeRectOf(done)).toBeNull();
  });

  it('팬을 잃지 않는다 — 중클릭은 그대로 팬이다', () => {
    const { state, ctx } = boot([]);
    const r = run(state, ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: { x: 500, y: 350 }, button: 1, keys: K },
      { k: 'POINTER_MOVE', pointerId: 1, screen: { x: 560, y: 380 }, keys: K },
    ]);
    expect(r.state.drag?.kind).toBe('PAN');
    expect(r.state.viewport.tx).toBeCloseTo(state.viewport.tx + 60, 10);
  });

  it('팬을 잃지 않는다 — Space+좌클릭도 그대로 팬이다', () => {
    const { state, ctx } = boot([]);
    const r = run(state, ctx, [
      {
        k: 'POINTER_DOWN',
        pointerId: 1,
        screen: { x: 500, y: 350 },
        button: 0,
        keys: { ...K, space: true },
      },
    ]);
    expect(r.state.drag?.kind).toBe('PAN');
  });

  it('선택 도구가 아니면 예전처럼 팬이다', () => {
    const { state, ctx } = boot([]);
    const withTool = reduce(state, { k: 'SET_TOOL', tool: 'POINT' }, ctx).state;
    const r = run(withTool, ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: { x: 500, y: 350 }, button: 0, keys: K },
    ]);
    expect(r.state.drag?.kind).toBe('PAN');
  });
});

describe('C-4 일괄 삭제', () => {
  it('Delete 는 곧바로 지우지 않고 확인을 요청한다', () => {
    const { state, ctx } = boot([A, B]);
    const picked = dragMarquee(state, ctx).state;
    const r = reduce(picked, { k: 'DELETE_SELECTION' }, ctx);
    expect(r.commands).toEqual([]);
    const eff = r.effects.find((e) => e.k === 'CONFIRM_DELETE_DEFECTS') as
      | { defectIds: readonly string[] }
      | undefined;
    expect(eff).toBeTruthy();
    expect([...eff!.defectIds].sort()).toEqual(['a', 'b']);
  });

  it('확인하면 커맨드 하나로 전부 지운다 — Ctrl+Z 한 번에 되살아난다', () => {
    const { state, ctx } = boot([A, B]);
    const r = reduce(state, { k: 'CONFIRM_DELETE_DEFECTS', defectIds: ['a', 'b'] }, ctx);
    expect(r.commands).toHaveLength(1);
    expect(r.commands[0]!.k).toBe('DELETE_DEFECTS');
    expect(r.state.multi).toEqual([]);
  });

  it('잠긴 결함은 선택은 되지만 삭제 대상에서 빠지고, 그 수를 알려 준다', () => {
    const locked = defect('b', 2, { x: 0.14, y: 0.12 }, { x: 0.16, y: 0.1 }, {
      status: 'PREV_PENDING',
      prevDefectId: 'old-b',
    });
    const { state, ctx } = boot([A, locked]);
    const picked = dragMarquee(state, ctx).state;
    // 선택 단계에서는 조용히 빼지 않는다 — "왜 안 잡히지" 를 막는다
    expect([...picked.multi].sort()).toEqual(['a', 'b']);

    const eff = reduce(picked, { k: 'DELETE_SELECTION' }, ctx).effects.find(
      (e) => e.k === 'CONFIRM_DELETE_DEFECTS',
    ) as { defectIds: readonly string[]; lockedCount: number };
    expect(eff.defectIds).toEqual(['a']);
    expect(eff.lockedCount).toBe(1);
  });

  it('전부 잠겨 있으면 확인창 없이 경고만 낸다', () => {
    const l1 = defect('a', 1, { x: 0.1, y: 0.1 }, { x: 0.12, y: 0.08 }, { status: 'REPAIRED' });
    const { state, ctx } = boot([l1]);
    const picked = dragMarquee(state, ctx).state;
    const r = reduce(picked, { k: 'DELETE_SELECTION' }, ctx);
    expect(r.effects.some((e) => e.k === 'CONFIRM_DELETE_DEFECTS')).toBe(false);
    expect(r.effects.some((e) => e.k === 'TOAST' && e.kind === 'warn')).toBe(true);
    expect(r.state.multi).toEqual([]);
  });

  it('확인 단계에서도 잠긴 결함은 한 번 더 걸러진다 (마지막 관문)', () => {
    const locked = defect('b', 2, { x: 0.14, y: 0.12 }, { x: 0.16, y: 0.1 }, {
      status: 'REPAIRED',
    });
    const { state, ctx } = boot([A, locked]);
    const r = reduce(state, { k: 'CONFIRM_DELETE_DEFECTS', defectIds: ['a', 'b'] }, ctx);
    const cmd = r.commands[0] as { k: 'DELETE_DEFECTS'; defects: readonly Defect[] };
    expect(cmd.defects.map((d) => d.id)).toEqual(['a']);
  });
});

describe('C-4b 일괄 이동', () => {
  /** 잡을 지점 = 결함 a 의 마크 중심 */
  const grabAt = (s: CanvasState) => at(s, { x: 0.1, y: 0.1 });

  it('여러 개를 잡아 놓고 하나를 끌면 전부 같이 간다 — 커맨드는 하나', () => {
    const { state, ctx } = boot([A, B]);
    const picked = dragMarquee(state, ctx).state;
    expect(picked.multi).toHaveLength(2);

    const from = grabAt(picked);
    const to = { x: from.x + 100, y: from.y + 50 };
    const r = run(picked, ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: from, button: 0, keys: K },
      { k: 'POINTER_MOVE', pointerId: 1, screen: to, keys: K },
      { k: 'POINTER_UP', pointerId: 1, screen: to, keys: K },
    ]);
    const cmds = r.commands.filter((c) => c.k === 'TRANSLATE_DEFECTS');
    expect(cmds).toHaveLength(1);
    const c = cmds[0] as { defectIds: readonly string[]; dx: number; dy: number };
    expect([...c.defectIds].sort()).toEqual(['a', 'b']);
    expect(c.dx).toBeGreaterThan(0);
    expect(c.dy).toBeGreaterThan(0);
  });

  it('선택을 유지한다 — 잡은 것이 이미 선택된 결함이면 multi 가 안 풀린다', () => {
    const { state, ctx } = boot([A, B]);
    const picked = dragMarquee(state, ctx).state;
    const down = reduce(
      picked,
      { k: 'POINTER_DOWN', pointerId: 1, screen: grabAt(picked), button: 0, keys: K },
      ctx,
    ).state;
    expect([...down.multi].sort()).toEqual(['a', 'b']);
    expect(down.drag?.kind).toBe('MOVE_MULTI');
  });

  it('선택 밖의 빈 곳을 누르면 선택이 풀린다', () => {
    const { state, ctx } = boot([A, B]);
    const picked = dragMarquee(state, ctx).state;
    const down = reduce(
      picked,
      { k: 'POINTER_DOWN', pointerId: 1, screen: at(picked, { x: 0.6, y: 0.6 }), button: 0, keys: K },
      ctx,
    ).state;
    expect(down.multi).toEqual([]);
  });

  it('끄는 동안 문서를 안 건드린다 — 미리보기만 움직인다', () => {
    const { state, ctx } = boot([A, B]);
    const picked = dragMarquee(state, ctx).state;
    const from = grabAt(picked);
    const r = run(picked, ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: from, button: 0, keys: K },
      { k: 'POINTER_MOVE', pointerId: 1, screen: { x: from.x + 100, y: from.y + 50 }, keys: K },
    ]);
    expect(r.commands).toEqual([]);
    const t = multiTranslateOf(r.state);
    expect(t).not.toBeNull();
    expect(t!.dx).toBeGreaterThan(0);
  });

  it('미리보기 델타와 커밋 델타가 같다 — 손을 뗄 때 그림이 안 튄다', () => {
    const { state, ctx } = boot([A, B]);
    const picked = dragMarquee(state, ctx).state;
    const from = grabAt(picked);
    const to = { x: from.x + 130, y: from.y + 70 };
    const mid = run(picked, ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: from, button: 0, keys: K },
      { k: 'POINTER_MOVE', pointerId: 1, screen: to, keys: K },
    ]).state;
    const preview = multiTranslateOf(mid)!;
    const up = reduce(mid, { k: 'POINTER_UP', pointerId: 1, screen: to, keys: K }, ctx);
    const c = up.commands[0] as { dx: number; dy: number };
    expect(c.dx).toBeCloseTo(preview.dx, 12);
    expect(c.dy).toBeCloseTo(preview.dy, 12);
  });

  it('잠긴 결함은 따라오지 않는다', () => {
    const locked = defect('b', 2, { x: 0.14, y: 0.12 }, { x: 0.16, y: 0.1 }, {
      status: 'PREV_PENDING',
      prevDefectId: 'old-b',
    });
    const { state, ctx } = boot([A, locked]);
    const picked = dragMarquee(state, ctx).state;
    const from = grabAt(picked);
    const to = { x: from.x + 100, y: from.y + 50 };
    const r = run(picked, ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: from, button: 0, keys: K },
      { k: 'POINTER_MOVE', pointerId: 1, screen: to, keys: K },
      { k: 'POINTER_UP', pointerId: 1, screen: to, keys: K },
    ]);
    const c = r.commands.find((x) => x.k === 'TRANSLATE_DEFECTS') as { defectIds: readonly string[] };
    expect(c.defectIds).toEqual(['a']);
  });

  it('끌지 않고 그냥 눌렀다 떼면 아무 커맨드도 안 나간다', () => {
    const { state, ctx } = boot([A, B]);
    const picked = dragMarquee(state, ctx).state;
    const from = grabAt(picked);
    const r = run(picked, ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: from, button: 0, keys: K },
      { k: 'POINTER_UP', pointerId: 1, screen: from, keys: K },
    ]);
    expect(r.commands).toEqual([]);
  });
});

describe('C-4b 일괄 이동 — 순수 함수', () => {
  it('같은 델타로 옮기므로 상대 위치가 유지된다', () => {
    const out = translateDefects([A, B], new Set(['a', 'b']), 0.1, 0.05);
    const a0 = A.marks[0]!.geometry as { x: number; y: number };
    const b0 = B.marks[0]!.geometry as { x: number; y: number };
    const a1 = out[0]!.marks[0]!.geometry as { x: number; y: number };
    const b1 = out[1]!.marks[0]!.geometry as { x: number; y: number };
    expect(a1.x - a0.x).toBeCloseTo(b1.x - b0.x, 12);
    expect(a1.y - a0.y).toBeCloseTo(b1.y - b0.y, 12);
  });

  it('목록에 없는 결함은 그대로 둔다', () => {
    const out = translateDefects([A, FAR], new Set(['a']), 0.1, 0.1);
    expect(out[1]).toBe(FAR);
  });

  it('사용자가 옮긴 라벨은 따라가고, 자동 배치 라벨은 손대지 않는다', () => {
    const auto = defect('c', 3, { x: 0.2, y: 0.2 }, { x: 0.22, y: 0.18 }, {
      label: { defectId: 'c', x: 0.22, y: 0.18, anchorMarkId: 'c-m0', placed: false },
    });
    const [movedPlaced] = translateDefects([A], new Set(['a']), 0.1, 0.1);
    expect(movedPlaced!.label.x).toBeCloseTo(A.label.x + 0.1, 12);

    const [movedAuto] = translateDefects([auto], new Set(['c']), 0.1, 0.1);
    expect(movedAuto!.label.x).toBeCloseTo(auto.label.x, 12);
  });

  it('델타를 좁혀 모든 마크가 도면 안에 남는다 — 결함마다 따로 자르지 않는다', () => {
    const near = defect('n', 4, { x: 0.98, y: 0.5 }, { x: 0.96, y: 0.48 });
    const { dx } = clampDefectsTranslate([A, near], 0.5, 0);
    expect(dx).toBeCloseTo(0.02, 12);
    const out = translateDefects([A, near], new Set(['a', 'n']), dx, 0);
    for (const d of out) {
      for (const m of d.marks) {
        const g = m.geometry as { x: number };
        expect(g.x).toBeLessThanOrEqual(1 + 1e-9);
        expect(g.x).toBeGreaterThanOrEqual(-1e-9);
      }
    }
  });

  it('되돌리기는 부호만 뒤집으면 된다', () => {
    const cmd = { k: 'TRANSLATE_DEFECTS', defectIds: ['a', 'b'], dx: 0.1, dy: 0.05 } as const;
    const moved = applyCommand([A, B], cmd);
    const back = applyCommand(moved, invertCommand(cmd));
    const orig = A.marks[0]!.geometry as { x: number; y: number };
    const now = back.find((d) => d.id === 'a')!.marks[0]!.geometry as { x: number; y: number };
    expect(now.x).toBeCloseTo(orig.x, 12);
    expect(now.y).toBeCloseTo(orig.y, 12);
  });
});
