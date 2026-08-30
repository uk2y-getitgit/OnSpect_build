/**
 * Phase 5 트랙 A — 코어 터치 지원 (플랫폼 무관).
 *
 *   A1 핀치 3종 · A2 두 번째 포인터 = 드래그 취소 · A3 CENTER_ON_NORM · A4 히트 프로파일 주입
 *
 * 이 네 가지는 전부 **순수 추가**다. PC 웹 동작이 한 픽셀도 바뀌면 안 된다 —
 * 그래서 각 절마다 "프로파일/제스처를 쓰지 않으면 예전과 똑같다" 는 것을 함께 못박는다.
 */
import { describe, expect, it } from 'vitest';
import { initialCanvasState, previewOf, reduce, screensOf, type ReduceContext } from '../src/interaction.js';
import { hitTest } from '../src/hitTest.js';
import { buildScreens } from '../src/renderModel.js';
import { toNorm, toScreen } from '../src/geometry.js';
import { DEFAULT_HIT_PROFILE, ZOOM_MAX, type HitProfile } from '../src/constants.js';
import { defect, GS } from './helpers.js';
import type { CanvasState, Defect, InputEvent, Keys, Selection } from '../src/types.js';

const DRAWING = { id: 'dw', imageWidth: 2400, imageHeight: 1600 };
const CANVAS = { w: 1000, h: 700 };
const K: Keys = { space: false, alt: false, shift: false, ctrl: false };
const NONE: Selection = { defectId: null, part: null, markId: null };

/** 손가락 프로파일 흉내 — 44pt 터치 타깃 기준으로 넉넉하게 */
const FAT: HitProfile = {
  pad: 22,
  minMark: 44,
  minLabel: 44,
  leader: 22,
  stroke: 22,
  handle: 30,
  clickSlop: 12,
  // D14 — 필기 획 히트·지우개. 손가락은 12px 로 글씨 획을 못 집는다
  memoInk: 22,
};

function ctxOf(defects: Defect[], over: Partial<ReduceContext> = {}): ReduceContext {
  let n = 0;
  return { defects, globalStyle: GS, makeId: () => `id${(n += 1)}`, ...over };
}

function boot(defects: Defect[], over: Partial<ReduceContext> = {}): {
  state: CanvasState;
  ctx: ReduceContext;
} {
  const ctx = ctxOf(defects, over);
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

// ───────────────────────────────────────────────────────────────────────────
describe('A1 · 핀치 (GESTURE_PINCH_START / GESTURE_PINCH / GESTURE_PINCH_END)', () => {
  it('시작 → 진행(확대 + 동시 팬) → 종료', () => {
    const { state, ctx } = boot([]);
    const z0 = state.viewport.zoom;
    const center = { x: 500, y: 350 };

    const started = reduce(state, { k: 'GESTURE_PINCH_START', center }, ctx).state;
    expect(started.viewport).toEqual(state.viewport); // 시작만으로는 화면이 안 움직인다

    const moved = reduce(
      started,
      { k: 'GESTURE_PINCH', center, factor: 1.5, pan: { x: 20, y: -10 } },
      ctx,
    ).state;
    expect(moved.viewport.zoom).toBeCloseTo(z0 * 1.5, 10);

    // 줌만 했을 때의 위치 + pan 만큼 밀린 위치여야 한다
    const zoomOnly = reduce(
      started,
      { k: 'GESTURE_PINCH', center, factor: 1.5, pan: { x: 0, y: 0 } },
      ctx,
    ).state;
    expect(moved.viewport.tx).toBeCloseTo(zoomOnly.viewport.tx + 20, 10);
    expect(moved.viewport.ty).toBeCloseTo(zoomOnly.viewport.ty - 10, 10);

    const ended = reduce(moved, { k: 'GESTURE_PINCH_END' }, ctx).state;
    expect(ended.viewport).toEqual(moved.viewport); // 종료는 화면을 되돌리지 않는다
    expect(ended.drag).toBeNull();
  });

  it('두 손가락 중점 아래의 도면 지점은 배율이 바뀌어도 고정된다 (zoomAt 재사용)', () => {
    const { state, ctx } = boot([]);
    const center = { x: 620, y: 240 };
    const before = toNorm(center, state.viewport, DRAWING.imageWidth, DRAWING.imageHeight);

    const s = run(state, ctx, [
      { k: 'GESTURE_PINCH_START', center },
      { k: 'GESTURE_PINCH', center, factor: 1.3, pan: { x: 0, y: 0 } },
      { k: 'GESTURE_PINCH', center, factor: 1.3, pan: { x: 0, y: 0 } },
    ]).state;

    const after = toNorm(center, s.viewport, DRAWING.imageWidth, DRAWING.imageHeight);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });

  it('factor 1 이면 순수 팬이다', () => {
    const { state, ctx } = boot([]);
    const s = reduce(
      state,
      { k: 'GESTURE_PINCH', center: { x: 500, y: 350 }, factor: 1, pan: { x: 35, y: 25 } },
      ctx,
    ).state;
    expect(s.viewport.zoom).toBeCloseTo(state.viewport.zoom, 10);
    expect(s.viewport.tx).toBeCloseTo(state.viewport.tx + 35, 10);
    expect(s.viewport.ty).toBeCloseTo(state.viewport.ty + 25, 10);
  });

  it('배율 한계와 팬 한계는 기존 규칙 그대로 걸린다', () => {
    const { state, ctx } = boot([]);
    const zoomed = reduce(
      state,
      { k: 'GESTURE_PINCH', center: { x: 500, y: 350 }, factor: 999, pan: { x: 0, y: 0 } },
      ctx,
    ).state;
    expect(zoomed.viewport.zoom).toBeCloseTo(ZOOM_MAX, 10);

    // 도면을 화면 밖으로 완전히 밀어낼 수 없다 (clampPan)
    const pushed = reduce(
      state,
      { k: 'GESTURE_PINCH', center: { x: 500, y: 350 }, factor: 1, pan: { x: 99999, y: 0 } },
      ctx,
    ).state;
    const drawnW = DRAWING.imageWidth * pushed.viewport.zoom;
    expect(pushed.viewport.tx).toBeLessThanOrEqual(CANVAS.w - 0.2 * drawnW + 1e-6);
  });

  it('망가진 factor(0 · NaN)는 배율 변화 없음으로 취급한다', () => {
    const { state, ctx } = boot([]);
    for (const factor of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const s = reduce(
        state,
        { k: 'GESTURE_PINCH', center: { x: 500, y: 350 }, factor, pan: { x: 0, y: 0 } },
        ctx,
      ).state;
      expect(s.viewport.zoom).toBeCloseTo(state.viewport.zoom, 10);
      expect(Number.isFinite(s.viewport.tx)).toBe(true);
    }
  });

  it('망가진 center · pan(NaN · Infinity)은 그 프레임을 통째로 버린다', () => {
    // 어댑터가 핀치 첫 프레임에 "직전 중점" 없이 pan 을 계산하면 NaN 이 나온다.
    // 한 프레임만 새어 들어와도 뷰포트가 NaN 으로 굳고 viewports 기억까지 오염된다
    const { state, ctx } = boot([]);
    const bad: InputEvent[] = [
      { k: 'GESTURE_PINCH', center: { x: Number.NaN, y: 350 }, factor: 1.2, pan: { x: 0, y: 0 } },
      { k: 'GESTURE_PINCH', center: { x: 500, y: 350 }, factor: 1.2, pan: { x: Number.NaN, y: 0 } },
      {
        k: 'GESTURE_PINCH',
        center: { x: 500, y: 350 },
        factor: 1.2,
        pan: { x: 0, y: Number.POSITIVE_INFINITY },
      },
    ];
    for (const ev of bad) {
      const s = reduce(state, ev, ctx).state;
      expect(s.viewport).toEqual(state.viewport);
      expect(s.viewports[DRAWING.id]).toEqual(state.viewports[DRAWING.id]);
    }

    // 나쁜 프레임 뒤에도 정상 프레임은 그대로 먹힌다 (코어가 잠기지 않는다)
    const after = run(state, ctx, [
      bad[0]!,
      { k: 'GESTURE_PINCH', center: { x: 500, y: 350 }, factor: 1.5, pan: { x: 0, y: 0 } },
    ]).state;
    expect(after.viewport.zoom).toBeCloseTo(state.viewport.zoom * 1.5, 10);
  });

  it('도면이 없으면 아무 일도 없다', () => {
    const ctx = ctxOf([]);
    const s0 = reduce(initialCanvasState(CANVAS), { k: 'RESIZE', size: CANVAS }, ctx).state;
    const s = run(s0, ctx, [
      { k: 'GESTURE_PINCH_START', center: { x: 1, y: 1 } },
      { k: 'GESTURE_PINCH', center: { x: 1, y: 1 }, factor: 2, pan: { x: 10, y: 10 } },
      { k: 'GESTURE_PINCH_END' },
    ]).state;
    expect(s.viewport).toEqual(s0.viewport);
  });

  it('핀치를 쓴 뒤에도 휠·줌버튼은 예전 그대로다 (PC 경로 무변화)', () => {
    const { state, ctx } = boot([]);
    const pinched = run(state, ctx, [
      { k: 'GESTURE_PINCH_START', center: { x: 500, y: 350 } },
      { k: 'GESTURE_PINCH', center: { x: 500, y: 350 }, factor: 1.2, pan: { x: 0, y: 0 } },
      { k: 'GESTURE_PINCH_END' },
    ]).state;

    const wheeled = reduce(
      pinched,
      { k: 'WHEEL', screen: { x: 500, y: 350 }, deltaY: -100, keys: K },
      ctx,
    ).state;
    expect(wheeled.viewport.zoom).toBeCloseTo(pinched.viewport.zoom * 1.1, 10);

    const buttoned = reduce(pinched, { k: 'ZOOM_BUTTON', factor: 2 }, ctx).state;
    expect(buttoned.viewport.zoom).toBeCloseTo(pinched.viewport.zoom * 2, 10);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('A2 · 두 번째 포인터 = 진행 중 드래그 취소 (T3)', () => {
  it('생성 중이던 영역은 두 번째 포인터가 닿으면 사라지고 아무것도 안 남는다', () => {
    const { state, ctx } = boot([]);
    const withTool = reduce(state, { k: 'SET_TOOL', tool: 'AREA_RECT' }, ctx).state;

    const drawing = run(withTool, ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: { x: 300, y: 300 }, button: 0, keys: K },
      { k: 'POINTER_MOVE', pointerId: 1, screen: { x: 420, y: 400 }, keys: K },
    ]);
    expect(drawing.state.drag?.kind).toBe('CREATE_SHAPE');
    expect(drawing.state.drag?.geomPreview).not.toBeNull();

    const second = run(drawing.state, ctx, [
      { k: 'POINTER_DOWN', pointerId: 2, screen: { x: 600, y: 500 }, button: 0, keys: K },
    ]);
    expect(second.state.drag).toBeNull(); // 롤백
    expect(second.commands).toEqual([]); // 문서는 손대지 않았다

    // 첫 손가락을 떼도 도형이 생기지 않는다
    const up = run(second.state, ctx, [
      { k: 'POINTER_UP', pointerId: 1, screen: { x: 420, y: 400 }, keys: K },
    ]);
    expect(up.commands).toEqual([]);
    expect(up.state.drag).toBeNull();
  });

  it('이동 중이던 표기는 원위치로 돌아간다', () => {
    const d = defect('a', 1, { x: 0.3, y: 0.5 }, { x: 0.6, y: 0.4 });
    const { state, ctx } = boot([d]);
    const s = screensOf(state, ctx)[0]!;
    const markAt = s.marks[0]!.center;

    const moving = run(state, ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: markAt, button: 0, keys: K },
      { k: 'POINTER_MOVE', pointerId: 1, screen: { x: markAt.x + 90, y: markAt.y + 60 }, keys: K },
    ]);
    expect(moving.state.drag?.kind).toBe('MOVE_MARK');
    // 미리보기가 원래 자리에서 벗어나 있다
    expect(moving.state.drag?.previewNorm.x).not.toBeCloseTo(0.3, 4);

    const second = run(moving.state, ctx, [
      { k: 'POINTER_DOWN', pointerId: 2, screen: { x: 100, y: 100 }, button: 0, keys: K },
    ]);
    expect(second.state.drag).toBeNull();
    expect(second.commands).toEqual([]);
    // 미리보기 override 가 사라졌다 = 화면이 원래 좌표를 그린다
    expect(previewOf(second.state)).toBeNull();
    const back = screensOf(second.state, ctx)[0]!.marks[0]!.center;
    expect(back.x).toBeCloseTo(markAt.x, 10);
    expect(back.y).toBeCloseTo(markAt.y, 10);

    // 취소해도 선택은 남는다 (Escape 와 같은 규칙)
    expect(second.state.selection.defectId).toBe('a');

    // 첫 손가락을 떼도 이동이 커밋되지 않는다
    const up = run(second.state, ctx, [
      { k: 'POINTER_UP', pointerId: 1, screen: { x: markAt.x + 90, y: markAt.y + 60 }, keys: K },
    ]);
    expect(up.commands).toEqual([]);
  });

  it('점 도구로 누른 채 두 번째 포인터가 닿으면 결함이 만들어지지 않는다', () => {
    const { state, ctx } = boot([]);
    const withTool = reduce(state, { k: 'SET_TOOL', tool: 'POINT' }, ctx).state;
    const r = run(withTool, ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: { x: 400, y: 300 }, button: 0, keys: K },
      { k: 'POINTER_DOWN', pointerId: 2, screen: { x: 600, y: 400 }, button: 0, keys: K },
      { k: 'POINTER_UP', pointerId: 1, screen: { x: 400, y: 300 }, keys: K },
      { k: 'POINTER_UP', pointerId: 2, screen: { x: 600, y: 400 }, keys: K },
    ]);
    expect(r.commands).toEqual([]);
    expect(r.state.drag).toBeNull();
  });

  it('팬 드래그 중 두 번째 포인터가 닿아도 화면이 시작 위치로 튀지 않는다', () => {
    const { state, ctx } = boot([]);
    const panned = run(state, ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: { x: 500, y: 350 }, button: 0, keys: K },
      { k: 'POINTER_MOVE', pointerId: 1, screen: { x: 560, y: 380 }, keys: K },
    ]).state;
    expect(panned.viewport.tx).toBeCloseTo(state.viewport.tx + 60, 10);

    const second = reduce(
      panned,
      { k: 'POINTER_DOWN', pointerId: 2, screen: { x: 300, y: 300 }, button: 0, keys: K },
      ctx,
    ).state;
    expect(second.drag).toBeNull();
    expect(second.viewport).toEqual(panned.viewport); // 민 만큼 그대로 남는다
  });

  it('같은 포인터가 다시 눌리는 것(마우스)은 예전 동작 그대로다', () => {
    // 마우스는 버튼이 몇 개든 pointerId 가 하나다. 이 경로는 건드리지 않았다
    const { state, ctx } = boot([]);
    const mid = run(state, ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: { x: 500, y: 350 }, button: 1, keys: K },
    ]).state;
    expect(mid.drag?.kind).toBe('PAN');
    const again = reduce(
      mid,
      { k: 'POINTER_DOWN', pointerId: 1, screen: { x: 520, y: 360 }, button: 0, keys: K },
      ctx,
    ).state;
    expect(again.drag).not.toBeNull(); // 취소되지 않는다
    expect(again.drag?.pointerId).toBe(1);
  });

  it('POINTER_CANCEL 은 드래그의 주인 포인터일 때만 취소한다', () => {
    const { state, ctx } = boot([]);
    const panning = run(state, ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: { x: 500, y: 350 }, button: 0, keys: K },
      { k: 'POINTER_MOVE', pointerId: 1, screen: { x: 540, y: 360 }, keys: K },
    ]).state;
    expect(panning.drag?.pointerId).toBe(1);

    // 남의 포인터가 취소돼도 내 드래그는 살아 있다
    const other = reduce(panning, { k: 'POINTER_CANCEL', pointerId: 7 }, ctx).state;
    expect(other.drag).not.toBeNull();
    expect(other.drag?.pointerId).toBe(1);

    // 주인이 취소되면 드래그가 사라진다
    const mine = reduce(panning, { k: 'POINTER_CANCEL', pointerId: 1 }, ctx).state;
    expect(mine.drag).toBeNull();
  });

  it('핀치 시작이 드래그를 취소한다 (어댑터가 POINTER_DOWN 없이 바로 넘겨도 안전)', () => {
    const { state, ctx } = boot([]);
    const withTool = reduce(state, { k: 'SET_TOOL', tool: 'AREA_RECT' }, ctx).state;
    const drawing = run(withTool, ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: { x: 300, y: 300 }, button: 0, keys: K },
      { k: 'POINTER_MOVE', pointerId: 1, screen: { x: 420, y: 400 }, keys: K },
    ]).state;
    const pinched = reduce(drawing, { k: 'GESTURE_PINCH_START', center: { x: 360, y: 350 } }, ctx);
    expect(pinched.state.drag).toBeNull();
    expect(pinched.commands).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('A3 · CENTER_ON_NORM', () => {
  it('주어진 정규화 좌표가 캔버스 중앙에 온다. 배율은 그대로', () => {
    const { state, ctx } = boot([]);
    const n = { x: 0.25, y: 0.75 };
    const s = reduce(state, { k: 'CENTER_ON_NORM', n }, ctx).state;

    expect(s.viewport.zoom).toBeCloseTo(state.viewport.zoom, 10);
    const at = toScreen(n, s.viewport, DRAWING.imageWidth, DRAWING.imageHeight);
    expect(at.x).toBeCloseTo(CANVAS.w / 2, 6);
    expect(at.y).toBeCloseTo(CANVAS.h / 2, 6);
  });

  it('확대된 상태에서도 배율을 유지한 채 이동만 한다', () => {
    const { state, ctx } = boot([]);
    const zoomed = reduce(state, { k: 'ZOOM_BUTTON', factor: 3 }, ctx).state;
    const n = { x: 0.6, y: 0.4 };
    const s = reduce(zoomed, { k: 'CENTER_ON_NORM', n }, ctx).state;

    expect(s.viewport.zoom).toBeCloseTo(zoomed.viewport.zoom, 10);
    const at = toScreen(n, s.viewport, DRAWING.imageWidth, DRAWING.imageHeight);
    expect(at.x).toBeCloseTo(CANVAS.w / 2, 6);
    expect(at.y).toBeCloseTo(CANVAS.h / 2, 6);
  });

  it('도면(층)별 뷰포트 기억에 반영된다', () => {
    const { state, ctx } = boot([]);
    const s = reduce(state, { k: 'CENTER_ON_NORM', n: { x: 0.25, y: 0.75 } }, ctx).state;
    expect(s.viewports[DRAWING.id]).toEqual(s.viewport);
  });

  it('도면이 없으면 아무 일도 없다', () => {
    const ctx = ctxOf([]);
    const s0 = reduce(initialCanvasState(CANVAS), { k: 'RESIZE', size: CANVAS }, ctx).state;
    const s = reduce(s0, { k: 'CENTER_ON_NORM', n: { x: 0.5, y: 0.5 } }, ctx).state;
    expect(s.viewport).toEqual(s0.viewport);
  });

  it('망가진 좌표(NaN)는 무시한다 — 뷰포트가 오염되지 않는다', () => {
    const { state, ctx } = boot([]);
    for (const n of [
      { x: Number.NaN, y: 0.5 },
      { x: 0.5, y: Number.POSITIVE_INFINITY },
    ]) {
      const s = reduce(state, { k: 'CENTER_ON_NORM', n }, ctx).state;
      expect(s.viewport).toEqual(state.viewport);
      expect(s.viewports[DRAWING.id]).toEqual(state.viewports[DRAWING.id]);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('A4 · 히트 프로파일 주입 (T5)', () => {
  const VP = { zoom: 0.4, tx: 0, ty: 0 };
  const screensAt = (defects: Defect[]) =>
    buildScreens({ drawing: DRAWING, viewport: VP, defects, globalStyle: GS, preview: null });

  it('프로파일 없이 부르면 기존 결과와 완전히 동일하다', () => {
    const ds = [
      defect('a', 1, { x: 0.3, y: 0.5 }, { x: 0.6, y: 0.4 }),
      defect('b', 2, { x: 0.55, y: 0.55 }, { x: 0.2, y: 0.8 }),
    ];
    const screens = screensAt(ds);
    // 캔버스 전역을 훑어 한 점이라도 달라지면 잡아낸다
    for (let x = 0; x <= 960; x += 12) {
      for (let y = 0; y <= 640; y += 12) {
        const p = { x, y };
        expect(hitTest(p, screens, NONE)).toEqual(hitTest(p, screens, NONE, [], DEFAULT_HIT_PROFILE));
      }
    }
  });

  it('프로파일을 키우면 더 멀리서도 마크가 잡힌다', () => {
    // 라벨은 오른쪽 위, 시험점은 왼쪽 아래 — 라벨·리더선과 겹치지 않게 둔다
    const d = defect('a', 1, { x: 0.3, y: 0.5 }, { x: 0.8, y: 0.2 });
    const screens = screensAt([d]);
    const c = screens[0]!.marks[0]!.center;
    const away = { x: c.x - 22, y: c.y + 22 }; // 약 31px 떨어진 지점

    expect(hitTest(away, screens, NONE)).toBeNull();
    expect(hitTest(away, screens, NONE, [], FAT)?.part).toBe('MARK');
    // 마크 정중앙은 어느 프로파일에서도 잡힌다
    expect(hitTest(c, screens, NONE)?.part).toBe('MARK');
    expect(hitTest(c, screens, NONE, [], FAT)?.part).toBe('MARK');
  });

  it('reduce 도 ctx.hitProfile 을 탄다 — 손가락이면 살짝 빗나가도 선택된다', () => {
    const d = defect('a', 1, { x: 0.3, y: 0.5 }, { x: 0.8, y: 0.2 });

    const fine = boot([d]);
    const s = screensOf(fine.state, fine.ctx)[0]!;
    const away = { x: s.marks[0]!.center.x - 22, y: s.marks[0]!.center.y + 22 };

    const missed = run(fine.state, fine.ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: away, button: 0, keys: K },
      { k: 'POINTER_UP', pointerId: 1, screen: away, keys: K },
    ]).state;
    expect(missed.selection.defectId).toBeNull(); // 마우스 프로파일에선 빈 도면

    const fat = boot([d], { hitProfile: FAT });
    const hitIt = run(fat.state, fat.ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: away, button: 0, keys: K },
      { k: 'POINTER_UP', pointerId: 1, screen: away, keys: K },
    ]).state;
    expect(hitIt.selection.defectId).toBe('a');
  });

  it('clickSlop 도 프로파일을 탄다 — 손가락은 조금 흔들려도 클릭이다', () => {
    const shake: [number, number] = [6, 4]; // 기본 4px 초과 · FAT 12px 이내
    const fine = boot([]);
    const a = run(fine.state, fine.ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: { x: 500, y: 350 }, button: 0, keys: K },
      { k: 'POINTER_MOVE', pointerId: 1, screen: { x: 500 + shake[0], y: 350 + shake[1] }, keys: K },
    ]).state;
    expect(a.drag?.moved).toBe(true);

    const fat = boot([], { hitProfile: FAT });
    const b = run(fat.state, fat.ctx, [
      { k: 'POINTER_DOWN', pointerId: 1, screen: { x: 500, y: 350 }, button: 0, keys: K },
      { k: 'POINTER_MOVE', pointerId: 1, screen: { x: 500 + shake[0], y: 350 + shake[1] }, keys: K },
    ]).state;
    expect(b.drag?.moved).toBe(false);
  });

  it('DEFAULT_HIT_PROFILE 은 얼려 있다 — 실수로 고쳐도 전역이 안 바뀐다', () => {
    expect(Object.isFrozen(DEFAULT_HIT_PROFILE)).toBe(true);
    // 앱이 값을 바꾸려면 복사본을 만들어야 한다
    const touch = { ...DEFAULT_HIT_PROFILE, minMark: 44 };
    expect(touch.minMark).toBe(44);
    expect(DEFAULT_HIT_PROFILE.minMark).toBe(10);
  });

  it('DEFAULT_HIT_PROFILE 은 모듈 상수와 값이 같다', () => {
    expect(DEFAULT_HIT_PROFILE).toEqual({
      pad: 4,
      minMark: 10,
      minLabel: 12,
      leader: 6,
      stroke: 6,
      handle: 8,
      clickSlop: 4,
      // D14 — 필기 획 히트·지우개 (HIT_MEMO_INK_PX)
      memoInk: 12,
    });
  });
});
