/**
 * T2-5 — **마지막 뷰포트 영속**의 순수 부분 (`viewCenterOf` · `restoreViewEvents`).
 *
 * 저장은 `meta` KV(`lastView:{projectId}`) 가 하지만, 무엇을 저장하고 어떻게 되돌리는지는
 * 여기서 못박는다:
 *   1. 저장 형태는 **화면 중앙의 정규화 좌표 + 배율** 이다 — 캔버스 크기에 묶이지 않는다
 *   2. 같은 캔버스에서는 저장 → 복원이 **원래 뷰포트와 완전히 같다**
 *   3. 캔버스가 바뀌어도(태블릿 회전) 보던 지점과 배율이 유지된다
 *   4. 배율 한계·팬 한계는 **코어가 하던 그대로** 걸린다 (새 경로를 만들지 않았다)
 *   5. 성하지 않은 값(NaN · 0 크기)은 저장도 복원도 하지 않는다
 */
import { describe, expect, it } from 'vitest';
import { initialCanvasState, reduce, type ReduceContext } from '../src/interaction.js';
import { fitZoomOf, restoreViewEvents, viewCenterOf } from '../src/viewport.js';
import { ZOOM_MAX } from '../src/constants.js';
import type { CanvasState, InputEvent, Size } from '../src/types.js';
import { GS } from './helpers.js';

const DRAWING = { id: 'dw', imageWidth: 2400, imageHeight: 1600 };

const CTX: ReduceContext = {
  defects: [],
  memos: [],
  globalStyle: GS,
  makeId: () => 'x',
  now: () => 1000,
};

/** 도면이 걸린 채 전체 맞춤 상태인 캔버스 */
function boot(canvas: Size): CanvasState {
  let st = initialCanvasState();
  st = reduce(st, { k: 'RESIZE', size: canvas }, CTX).state;
  return reduce(st, { k: 'SET_DRAWING', drawing: DRAWING }, CTX).state;
}

function run(st: CanvasState, evs: readonly InputEvent[]): CanvasState {
  return evs.reduce((s, ev) => reduce(s, ev, CTX).state, st);
}

function centerOf(st: CanvasState) {
  return viewCenterOf(st.viewport, DRAWING.imageWidth, DRAWING.imageHeight, st.canvas);
}

describe('viewCenterOf — 저장 형태', () => {
  it('전체 맞춤이면 화면 중앙이 도면 중앙(0.5, 0.5)이고 배율은 맞춤 배율이다', () => {
    const st = boot({ w: 1000, h: 700 });
    const v = centerOf(st)!;
    expect(v).not.toBeNull();
    expect(v.cx).toBeCloseTo(0.5, 10);
    expect(v.cy).toBeCloseTo(0.5, 10);
    expect(v.zoom).toBeCloseTo(fitZoomOf(2400, 1600, { w: 1000, h: 700 }), 10);
  });

  it('캔버스·도면 크기가 0 이거나 값이 성하지 않으면 null — 그런 값은 저장하지 않는다', () => {
    const st = boot({ w: 1000, h: 700 });
    expect(viewCenterOf(st.viewport, 2400, 1600, { w: 0, h: 0 })).toBeNull();
    expect(viewCenterOf(st.viewport, 0, 1600, { w: 1000, h: 700 })).toBeNull();
    expect(viewCenterOf({ zoom: Number.NaN, tx: 0, ty: 0 }, 2400, 1600, { w: 1000, h: 700 })).toBeNull();
    expect(viewCenterOf({ zoom: 1, tx: Number.NaN, ty: 0 }, 2400, 1600, { w: 1000, h: 700 })).toBeNull();
    expect(viewCenterOf({ zoom: 0, tx: 0, ty: 0 }, 2400, 1600, { w: 1000, h: 700 })).toBeNull();
  });

  it('도면 밖으로 밀어낸 중앙도 자르지 않는다 — 자르면 복원 위치가 조용히 달라진다', () => {
    // 전체 맞춤보다 더 축소하면 도면이 화면보다 작아져 화면 중앙이 도면 밖(0~1 밖)에 설 수 있다
    const st = run(boot({ w: 1000, h: 700 }), [
      { k: 'ZOOM_BUTTON', factor: 0.5 },
      { k: 'CENTER_ON_NORM', n: { x: -0.3, y: -0.3 } },
    ]);
    const v = centerOf(st)!;
    expect(v.cx).toBeLessThan(0);
    // 저장한 값이 지금 화면 상태와 정확히 일치한다(자르지 않았다)
    const back = run(boot({ w: 1000, h: 700 }), restoreViewEvents(v, boot({ w: 1000, h: 700 }).viewport.zoom));
    expect(back.viewport.tx).toBeCloseTo(st.viewport.tx, 6);
    expect(back.viewport.ty).toBeCloseTo(st.viewport.ty, 6);
  });
});

describe('restoreViewEvents — 복원', () => {
  it('같은 캔버스면 저장 → 복원이 원래 뷰포트와 같다', () => {
    const canvas = { w: 1000, h: 700 };
    const moved = run(boot(canvas), [
      { k: 'ZOOM_BUTTON', factor: 2 },
      { k: 'CENTER_ON_NORM', n: { x: 0.3, y: 0.7 } },
    ]);
    const saved = centerOf(moved)!;

    const fresh = boot(canvas); // 새 세션 — 전체 맞춤 상태로 시작한다
    const restored = run(fresh, restoreViewEvents(saved, fresh.viewport.zoom));

    expect(restored.viewport.zoom).toBeCloseTo(moved.viewport.zoom, 10);
    expect(restored.viewport.tx).toBeCloseTo(moved.viewport.tx, 6);
    expect(restored.viewport.ty).toBeCloseTo(moved.viewport.ty, 6);
  });

  it('캔버스가 바뀌어도(가로 → 세로) 보던 지점과 배율이 유지된다', () => {
    const moved = run(boot({ w: 1000, h: 700 }), [
      { k: 'ZOOM_BUTTON', factor: 2 },
      { k: 'CENTER_ON_NORM', n: { x: 0.35, y: 0.4 } },
    ]);
    const saved = centerOf(moved)!;

    const fresh = boot({ w: 700, h: 1000 }); // 태블릿을 돌렸다
    const restored = run(fresh, restoreViewEvents(saved, fresh.viewport.zoom));
    const now = viewCenterOf(restored.viewport, 2400, 1600, { w: 700, h: 1000 })!;

    expect(now.zoom).toBeCloseTo(saved.zoom, 10);
    expect(now.cx).toBeCloseTo(saved.cx, 6);
    expect(now.cy).toBeCloseTo(saved.cy, 6);
  });

  it('저장 배율이 지금 배율과 같으면 줌 이벤트를 내지 않는다 (중앙 정렬만)', () => {
    const fresh = boot({ w: 1000, h: 700 });
    const evs = restoreViewEvents({ zoom: fresh.viewport.zoom, cx: 0.2, cy: 0.8 }, fresh.viewport.zoom);
    expect(evs.map((e) => e.k)).toEqual(['CENTER_ON_NORM']);
    const restored = run(fresh, evs);
    expect(restored.viewport.zoom).toBeCloseTo(fresh.viewport.zoom, 10);
    const now = centerOf(restored)!;
    expect(now.cx).toBeCloseTo(0.2, 6);
    expect(now.cy).toBeCloseTo(0.8, 6);
  });

  it('배율 한계를 넘는 저장값은 코어가 자른다 — 새 경로를 만들지 않았다', () => {
    const fresh = boot({ w: 1000, h: 700 });
    const restored = run(fresh, restoreViewEvents({ zoom: ZOOM_MAX * 10, cx: 0.5, cy: 0.5 }, fresh.viewport.zoom));
    expect(restored.viewport.zoom).toBeCloseTo(ZOOM_MAX, 10);
    const now = centerOf(restored)!;
    expect(now.cx).toBeCloseTo(0.5, 6);
    expect(now.cy).toBeCloseTo(0.5, 6);
  });

  it('성하지 않은 저장값·배율이면 아무 이벤트도 내지 않는다', () => {
    expect(restoreViewEvents({ zoom: Number.NaN, cx: 0.5, cy: 0.5 }, 1)).toEqual([]);
    expect(restoreViewEvents({ zoom: 0, cx: 0.5, cy: 0.5 }, 1)).toEqual([]);
    expect(restoreViewEvents({ zoom: 1, cx: Number.NaN, cy: 0.5 }, 1)).toEqual([]);
    expect(restoreViewEvents({ zoom: 1, cx: 0.5, cy: 0.5 }, 0)).toEqual([]);
    expect(restoreViewEvents({ zoom: 1, cx: 0.5, cy: 0.5 }, Number.NaN)).toEqual([]);
  });

  it('복원은 뷰포트만 건드린다 — 도면 · 선택 · 도구는 그대로다', () => {
    const fresh = boot({ w: 1000, h: 700 });
    const restored = run(fresh, restoreViewEvents({ zoom: fresh.viewport.zoom * 2, cx: 0.4, cy: 0.6 }, fresh.viewport.zoom));
    expect(restored.drawing).toEqual(DRAWING);
    expect(restored.selection.defectId).toBeNull();
    expect(restored.tool).toBe(fresh.tool);
  });
});
