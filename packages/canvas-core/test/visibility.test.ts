/**
 * §2-10 선택 대상 가시성 — 알려진 버그 1 (1120px 에서 번호 풍선이 우측 패널 뒤로 숨음).
 */
import { describe, expect, it } from 'vitest';
import { initialCanvasState, reduce, type ReduceContext } from '../src/interaction.js';
import { ensureVisible, safeRectOf } from '../src/visibility.js';
import type { CanvasState, Defect } from '../src/types.js';
import { defect, GS } from './helpers.js';

const IW = 2400;
const IH = 1600;

function base(insets = { top: 0, right: 0, bottom: 0, left: 0 }): CanvasState {
  return {
    ...initialCanvasState({ w: 800, h: 600 }),
    drawing: { id: 'dw', imageWidth: IW, imageHeight: IH },
    safeInsets: insets,
    // 1배율, 원점 정렬 — 스크린 px = 이미지 px 라 계산이 눈에 보인다
    viewport: { zoom: 1, tx: 0, ty: 0 },
  };
}

function ctxOf(defects: Defect[]): ReduceContext {
  return { defects, globalStyle: GS, makeId: () => 'x' };
}

describe('safeRectOf', () => {
  it('떠 있는 UI 가 잡아먹는 가장자리를 뺀다', () => {
    expect(safeRectOf(base({ top: 10, right: 80, bottom: 30, left: 0 }))).toEqual({
      x: 0,
      y: 10,
      w: 720,
      h: 560,
    });
  });
});

describe('ensureVisible', () => {
  it('이미 안전 영역 안이면 null — 아무것도 하지 않는다', () => {
    const d = defect('d1', 1, { x: 0.1, y: 0.1 }, { x: 0.12, y: 0.08 }); // 240,160 / 288,128
    const s = { ...base(), selection: { defectId: 'd1', part: 'LABEL' as const, markId: null } };
    expect(ensureVisible(s, [d], GS, 'd1')).toBeNull();
  });

  it('우측 안전 여백 뒤에 숨은 풍선을 **최소한만** 왼쪽으로 민다', () => {
    // 라벨을 화면 오른쪽 끝 근처에 둔다 (스크린 x ≈ 760)
    const d = defect('d1', 1, { x: 0.3, y: 0.2 }, { x: 760 / IW, y: 0.2 });
    const s = { ...base({ top: 0, right: 120, bottom: 0, left: 0 }), selection: { defectId: 'd1', part: 'LABEL' as const, markId: null } };
    const vp = ensureVisible(s, [d], GS, 'd1')!;
    expect(vp).not.toBeNull();
    expect(vp.zoom).toBe(1); // 줌은 건드리지 않는다
    expect(vp.tx).toBeLessThan(0); // 왼쪽으로 밀렸다
    // 민 뒤에는 안전 영역 안이다
    expect(ensureVisible({ ...s, viewport: vp }, [d], GS, 'd1')).toBeNull();
  });

  it('좌측으로 삐져나가면 오른쪽으로 민다', () => {
    const d = defect('d1', 1, { x: 0.3, y: 0.3 }, { x: 10 / IW, y: 0.3 });
    const s = { ...base({ top: 0, right: 0, bottom: 0, left: 200 }), selection: { defectId: 'd1', part: 'LABEL' as const, markId: null } };
    const vp = ensureVisible(s, [d], GS, 'd1')!;
    expect(vp.tx).toBeGreaterThan(0);
  });

  it('대상이 안전 영역보다 크면 줌을 낮추고 중앙에 놓는다', () => {
    const d = defect('d1', 1, { x: 0.05, y: 0.05 }, { x: 0.95, y: 0.95 });
    const s = { ...base({ top: 0, right: 600, bottom: 0, left: 0 }), selection: { defectId: 'd1', part: 'LABEL' as const, markId: null } };
    const vp = ensureVisible(s, [d], GS, 'd1')!;
    expect(vp.zoom).toBeLessThan(1);
  });

  it('⚠️ 드래그 중에는 발동하지 않는다 — 화면이 손을 따라다니면 조작이 불가능해진다', () => {
    const d = defect('d1', 1, { x: 0.3, y: 0.2 }, { x: 780 / IW, y: 0.2 });
    const s: CanvasState = {
      ...base({ top: 0, right: 120, bottom: 0, left: 0 }),
      selection: { defectId: 'd1', part: 'LABEL', markId: null },
      drag: {
        kind: 'MOVE_LABEL', pointerId: 1, startScreen: { x: 0, y: 0 },
        startViewport: { zoom: 1, tx: 0, ty: 0 }, grabOffsetScreen: { x: 0, y: 0 },
        originNorm: { x: 0, y: 0 }, originPlaced: true, defectId: 'd1', markId: null,
        labelOriginNorm: null, previewNorm: { x: 0, y: 0 }, labelPreviewNorm: null,
        anchorScreen: null, align: null, snapState: { x: null, y: null, angle: null },
        moved: true, pointToolCandidate: false,
        createStart: null, createType: null, geomPreview: null, geomOrigin: null,
        handle: null, pathId: null, pathOrigin: null, pathPreview: null, memoId: null,
        arrowAngles: null, eraseId: null, erasedCount: 0,
      },
    };
    expect(ensureVisible(s, [d], GS, 'd1')).toBeNull();
  });

  it('도면이 없으면 null', () => {
    const s = { ...base(), drawing: null };
    expect(ensureVisible(s, [], GS, 'd1')).toBeNull();
  });
});

describe('리듀서 연결', () => {
  it('SET_SAFE_INSETS 가 선택 대상을 안전 영역 안으로 끌어들인다', () => {
    const d = defect('d1', 1, { x: 0.3, y: 0.2 }, { x: 770 / IW, y: 0.2 });
    const s = { ...base(), selection: { defectId: 'd1', part: 'LABEL' as const, markId: null } };
    const r = reduce(s, { k: 'SET_SAFE_INSETS', insets: { top: 0, right: 160, bottom: 0, left: 0 } }, ctxOf([d]));
    expect(r.state.safeInsets.right).toBe(160);
    expect(r.state.viewport.tx).toBeLessThan(0);
    expect(ensureVisible(r.state, [d], GS, 'd1')).toBeNull();
  });

  it('같은 insets 를 다시 넣으면 아무것도 바뀌지 않는다', () => {
    const s = base({ top: 1, right: 2, bottom: 3, left: 4 });
    const r = reduce(s, { k: 'SET_SAFE_INSETS', insets: { top: 1, right: 2, bottom: 3, left: 4 } }, ctxOf([]));
    expect(r.state.viewport).toBe(s.viewport);
  });

  it('창을 좁히면(RESIZE) 선택 대상이 화면 안에 남는다', () => {
    const d = defect('d1', 1, { x: 0.3, y: 0.2 }, { x: 700 / IW, y: 0.2 });
    const s = { ...base({ top: 0, right: 100, bottom: 0, left: 0 }), selection: { defectId: 'd1', part: 'LABEL' as const, markId: null } };
    // 뷰포트를 기억시켜 RESIZE 가 Fit 으로 되돌리지 않게 한다
    const seeded = { ...s, viewports: { dw: s.viewport } };
    const r = reduce(seeded, { k: 'RESIZE', size: { w: 520, h: 600 } }, ctxOf([d]));
    expect(ensureVisible(r.state, [d], GS, 'd1')).toBeNull();
  });

  it('SELECT_DEFECT(reveal) 후에도 대상이 안전 영역 안이다', () => {
    const d = defect('d1', 1, { x: 0.9, y: 0.9 }, { x: 0.95, y: 0.95 });
    const s = base({ top: 8, right: 120, bottom: 40, left: 0 });
    const r = reduce(s, { k: 'SELECT_DEFECT', defectId: 'd1', reveal: true }, ctxOf([d]));
    expect(r.state.selection.defectId).toBe('d1');
    expect(ensureVisible(r.state, [d], GS, 'd1')).toBeNull();
  });
});
