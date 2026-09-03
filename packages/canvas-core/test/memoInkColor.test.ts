/**
 * 필기메모 색상 선택 (2026-09-03 사용자 요청 — "대표 빨강·파랑·초록·검정").
 *
 * 못박는 것 셋:
 *   1. `SET_MEMO_INK_COLOR` 는 다음 획부터 적용되는 세션 상태다(문서·undo 에 안 들어간다)
 *   2. 기본 앰버(`MEMO_INK`) 그대로면 예전처럼 `memo.style === null` 로 남는다(마이그레이션 없음)
 *   3. 프리셋을 고르면 그 색이 `memo.style.color` 에 저장되고, 그리는 중 미리보기(ghost)에도 반영된다
 *
 * 부수 확인: 옛 텍스트 메모(paths 없음)는 여전히 `MEMO_TEXT` 기본값을 쓴다 —
 * 필기 메모 전용 기본값(`MEMO_INK`)과 갈라 쓰는 `resolveMemoStyle(s, defaultColor)` 회귀 방지.
 */
import { describe, expect, it } from 'vitest';
import { ghostOf, initialCanvasState, reduce, type ReduceContext } from '../src/interaction.js';
import { memoScreen } from '../src/memoGeom.js';
import { toScreen } from '../src/geometry.js';
import { MEMO_INK, MEMO_INK_PRESETS, MEMO_TEXT } from '../src/constants.js';
import type { CanvasState, Keys, Memo, NPoint } from '../src/types.js';
import { GS } from './helpers.js';

const DRAWING = { id: 'dw', imageWidth: 2400, imageHeight: 1600 };
const K: Keys = { space: false, alt: false, shift: false, ctrl: false };
const RED = MEMO_INK_PRESETS[0]!.value;

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

function stroke(
  state: CanvasState,
  ctx: ReduceContext,
  from: NPoint,
  to: NPoint,
): { memo: Memo | null; state: CanvasState } {
  let s = reduce(state, { k: 'POINTER_DOWN', pointerId: 1, screen: at(state, from), button: 0, keys: K }, ctx).state;
  s = reduce(s, { k: 'POINTER_MOVE', pointerId: 1, screen: at(s, to), keys: K }, ctx).state;
  const up = reduce(s, { k: 'POINTER_UP', pointerId: 1, screen: at(s, to), keys: K }, ctx);
  const cmd = up.commands.find((c) => c.k === 'CREATE_MEMO');
  return { memo: cmd && cmd.k === 'CREATE_MEMO' ? cmd.memo : null, state: up.state };
}

describe('필기메모 색상 선택', () => {
  it('기본값은 MEMO_INK(중립 앰버)다', () => {
    const { state } = boot();
    expect(state.memoInkColor).toBe(MEMO_INK);
  });

  it('SET_MEMO_INK_COLOR 는 세션 상태만 바꾼다 — 문서·undo 무관', () => {
    const { state, ctx } = boot();
    const r = reduce(state, { k: 'SET_MEMO_INK_COLOR', color: RED }, ctx);
    expect(r.state.memoInkColor).toBe(RED);
    expect(r.commands).toEqual([]);
  });

  it('기본 앰버 그대로 그리면 style:null 로 남는다(마이그레이션 없음)', () => {
    const { state, ctx } = boot();
    const { memo } = stroke(state, ctx, { x: 0.2, y: 0.2 }, { x: 0.3, y: 0.25 });
    expect(memo).not.toBeNull();
    expect(memo!.style).toBeNull();
  });

  it('프리셋을 고르고 그리면 memo.style.color 에 저장된다', () => {
    const { state, ctx } = boot();
    const picked = reduce(state, { k: 'SET_MEMO_INK_COLOR', color: RED }, ctx).state;
    const { memo } = stroke(picked, ctx, { x: 0.2, y: 0.2 }, { x: 0.3, y: 0.25 });
    expect(memo).not.toBeNull();
    expect(memo!.style).toEqual({ color: RED });
  });

  it('그리는 중 미리보기(ghost)도 고른 색을 쓴다', () => {
    const { state, ctx } = boot();
    const picked = reduce(state, { k: 'SET_MEMO_INK_COLOR', color: RED }, ctx).state;
    const down = reduce(
      picked,
      { k: 'POINTER_DOWN', pointerId: 1, screen: at(picked, { x: 0.2, y: 0.2 }), button: 0, keys: K },
      ctx,
    ).state;
    const moved = reduce(
      down,
      { k: 'POINTER_MOVE', pointerId: 1, screen: at(down, { x: 0.3, y: 0.25 }), keys: K },
      ctx,
    ).state;
    const ghost = ghostOf(moved, ctx);
    expect(ghost).not.toBeNull();
    expect(ghost!.k).toBe('SKETCH');
    if (ghost!.k === 'SKETCH') expect(ghost!.color).toBe(RED);
  });

  it('픽 색을 바꿔도 이미 그린 메모는 안 바뀐다 — 다음 획부터만 적용', () => {
    const { state, ctx } = boot();
    const { memo: amber } = stroke(state, ctx, { x: 0.1, y: 0.1 }, { x: 0.15, y: 0.12 });
    const picked = reduce(state, { k: 'SET_MEMO_INK_COLOR', color: RED }, ctx).state;
    const { memo: red } = stroke(picked, ctx, { x: 0.5, y: 0.5 }, { x: 0.55, y: 0.52 });
    expect(amber!.style).toBeNull();
    expect(red!.style).toEqual({ color: RED });
  });

  it('필기 메모는 MEMO_INK, 옛 텍스트 메모는 MEMO_TEXT — 기본값이 종류별로 갈린다', () => {
    const vp = { zoom: 1, tx: 0, ty: 0 };
    const ink: Memo = {
      id: 'm1',
      projectId: 'p',
      drawingId: 'dw',
      floorId: 'f',
      pos: { x: 0.1, y: 0.1 },
      text: '',
      paths: [{ id: 'p1', points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }], width: 3 }],
      style: null,
      createdAt: 1,
      updatedAt: 1,
      deviceId: 'd',
      createdBy: null,
    };
    const text: Memo = { ...ink, id: 'm2', paths: [], text: '메모' };
    expect(memoScreen(ink, vp, 2400, 1600).style.color).toBe(MEMO_INK);
    expect(memoScreen(text, vp, 2400, 1600).style.color).toBe(MEMO_TEXT);
  });
});
