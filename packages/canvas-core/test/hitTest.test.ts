import { describe, expect, it } from 'vitest';
import { buildScreens } from '../src/renderModel.js';
import { hitTest, leaderSegment } from '../src/hitTest.js';
import { defect, GS } from './helpers.js';
import type { Selection } from '../src/types.js';

const DRAWING = { id: 'dw', imageWidth: 2400, imageHeight: 1600 };
const VP = { zoom: 0.4, tx: 0, ty: 0 };
const NONE: Selection = { defectId: null, part: null, markId: null };

function screensOf(defects: Parameters<typeof buildScreens>[0]['defects']) {
  return buildScreens({ drawing: DRAWING, viewport: VP, defects, globalStyle: GS, preview: null });
}

describe('T5 · 히트 테스트 우선순위 (§2-4)', () => {
  it('겹친 상태에서 라벨이 마크보다 먼저 잡힌다', () => {
    // 라벨을 마크와 같은 위치에 둔다
    const d = defect('d1', 1, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 });
    const screens = screensOf([d]);
    const at = { x: 0.5 * 2400 * 0.4, y: 0.5 * 1600 * 0.4 };
    expect(hitTest(at, screens, NONE)?.part).toBe('LABEL');
  });

  it('마크만 있는 지점은 마크가 잡힌다', () => {
    const d = defect('d1', 1, { x: 0.5, y: 0.5 }, { x: 0.7, y: 0.3 });
    const screens = screensOf([d]);
    const at = { x: 0.5 * 2400 * 0.4, y: 0.5 * 1600 * 0.4 };
    const hit = hitTest(at, screens, NONE);
    expect(hit?.part).toBe('MARK');
    expect(hit?.markId).toBe('d1-m0');
  });

  it('리더선 위를 누르면 LEADER 로 잡힌다', () => {
    const d = defect('d1', 1, { x: 0.3, y: 0.5 }, { x: 0.7, y: 0.5 });
    const screens = screensOf([d]);
    const s = screens[0]!;
    const seg = leaderSegment(s)!;
    const mid = { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 };
    expect(hitTest(mid, screens, NONE)?.part).toBe('LEADER');
  });

  it('빈 도면은 null', () => {
    const d = defect('d1', 1, { x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 });
    expect(hitTest({ x: 900, y: 600 }, screensOf([d]), NONE)).toBeNull();
  });

  it('같은 순위에서 겹치면 seq 가 큰(위에 그려진) 결함이 잡힌다', () => {
    const a = defect('a', 1, { x: 0.2, y: 0.2 }, { x: 0.5, y: 0.5 });
    const b = defect('b', 2, { x: 0.8, y: 0.8 }, { x: 0.5, y: 0.5 });
    const screens = screensOf([a, b]);
    const at = { x: 0.5 * 2400 * 0.4, y: 0.5 * 1600 * 0.4 };
    expect(hitTest(at, screens, NONE)?.defectId).toBe('b');
  });

  it('순위 0 — 동률이면 현재 선택된 결함을 무조건 집는다', () => {
    const a = defect('a', 1, { x: 0.2, y: 0.2 }, { x: 0.5, y: 0.5 });
    const b = defect('b', 2, { x: 0.8, y: 0.8 }, { x: 0.5, y: 0.5 });
    const screens = screensOf([a, b]);
    const at = { x: 0.5 * 2400 * 0.4, y: 0.5 * 1600 * 0.4 };
    const sel: Selection = { defectId: 'a', part: 'LABEL', markId: null };
    expect(hitTest(at, screens, sel)?.defectId).toBe('a');
  });

  it('줌아웃으로 풍선이 아주 작아져도 최소 12px 반경으로 집힌다', () => {
    const tiny = { zoom: 0.02, tx: 0, ty: 0 };
    const d = defect('d1', 1, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.9 });
    const screens = buildScreens({
      drawing: DRAWING,
      viewport: tiny,
      defects: [d],
      globalStyle: GS,
      preview: null,
    });
    const s = screens[0]!;
    expect(s.balloonR).toBeLessThan(2);
    const near = { x: s.label.x + 10, y: s.label.y };
    expect(hitTest(near, screens, NONE)?.part).toBe('LABEL');
  });

  it('라벨이 마크를 덮으면 리더선을 그리지 않는다 (§2-7-c)', () => {
    const d = defect('d1', 1, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 });
    expect(leaderSegment(screensOf([d])[0]!)).toBeNull();
  });

  it('전회차 표기도 히트 테스트에 참여한다 (A8)', () => {
    const d = defect('d1', 1, { x: 0.5, y: 0.5 }, { x: 0.7, y: 0.3 }, { status: 'PREV_PENDING' });
    const screens = screensOf([d]);
    const at = { x: 0.5 * 2400 * 0.4, y: 0.5 * 1600 * 0.4 };
    expect(hitTest(at, screens, NONE)?.defectId).toBe('d1');
  });
});
