/**
 * C-2 — 번호 풍선 배율(`GlobalStyle.balloonRadius`)이 **모든 경계면에서 같은 소스**여야 한다.
 *
 * 앱(`apps/web`)에서 렌더는 `labelScale` 이 반영된 반경(34×s)을 쓰는데 리듀서·정렬·툴바는
 * `DEFAULT_GLOBAL_STYLE`(34) 을 하드코딩하고 있었다. 그 결과 사용자 원문 그대로
 * *"영역이 보이는 것과 다름"* · *"결함 이동 스냅"* 이 났다.
 *
 * 앱 쪽 배선은 `apps/web/src/canvas/labelStyle.ts` 한 곳으로 모았다.
 * 이 파일은 **코어가 그 계약을 지키는지** 를 고정한다:
 *   ① 반경을 키운 `globalStyle` 로 만든 화면에서, 늘어난 풍선 **가장자리가 히트로 잡힌다**
 *   ② 같은 화면으로 만든 정렬 후보 좌표가 `defectScreen.label` 과 **같다**
 *   ③ 자동배치(`placed:false`) 라벨 거리는 반경에 **정비례**한다 — 34 하드코딩이면 안 움직인다
 *
 * ※ 소스 변경은 없다. 회귀 고정용 테스트다.
 */
import { describe, expect, it } from 'vitest';
import { buildAlignSnapshot } from '../src/snapAlign.js';
import { hitTest } from '../src/hitTest.js';
import { buildScreens } from '../src/renderModel.js';
import { defect, GS } from './helpers.js';
import type { Defect, GlobalStyle, Selection } from '../src/types.js';

const DRAWING = { id: 'dw', imageWidth: 2400, imageHeight: 1600 };
const VP = { zoom: 1, tx: 0, ty: 0 };
const NONE: Selection = { defectId: null, part: null, markId: null };

/** 앱의 `globalStyleForLabelScale` 과 **같은 계산**. 두 벌이 아니라 계약의 복사본이다 */
function scaled(s: number): GlobalStyle {
  if (s === 1) return GS;
  return { ...GS, balloonRadius: GS.balloonRadius * s };
}

function screensOf(defects: readonly Defect[], style: GlobalStyle) {
  return buildScreens({
    drawing: DRAWING,
    viewport: VP,
    defects,
    globalStyle: style,
    preview: null,
  });
}

describe('C-2 · 풍선 배율이 히트·정렬·자동배치에 전부 반영된다', () => {
  const d = defect('d1', 1, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.3 });

  it('⭐ 배율 1 이면 스타일 객체가 기본값 그대로다 (회귀 0)', () => {
    expect(scaled(1)).toBe(GS);
  });

  it('⭐ 키운 풍선의 가장자리가 히트로 잡힌다 — 34 고정이면 빗나간다', () => {
    const big = scaled(2); // balloonRadius 34 → 68
    const s = screensOf([d], big)[0]!;
    expect(s.balloonR).toBeCloseTo(68, 6);

    // 기본 반경(34) 바깥이지만 키운 풍선(68) 안쪽인 지점
    const p = { x: s.label.x + 50, y: s.label.y };

    const hitBig = hitTest(p, screensOf([d], big), NONE);
    expect(hitBig).toEqual({ defectId: 'd1', part: 'LABEL', markId: null });

    // 같은 지점을 34 기준 화면으로 판정하면 안 잡힌다 = 예전에 갈라져 있던 그 차이
    const hitDefault = hitTest(p, screensOf([d], GS), NONE);
    expect(hitDefault).toBeNull();
  });

  it('⭐ 정렬 후보 좌표 = 그려진 라벨 좌표 (배율이 달라도)', () => {
    const others = [
      defect('a', 1, { x: 0.2, y: 0.2 }, { x: 0.2, y: 0.1 }),
      // 자동배치 라벨 — 배율에 따라 좌표가 실제로 움직이는 쪽
      defect('b', 2, { x: 0.7, y: 0.6 }, { x: 0, y: 0 }, {
        label: {
          defectId: 'b',
          x: 0,
          y: 0,
          anchorMarkId: 'b-m0',
          placed: false,
        },
      }),
      d,
    ];
    for (const st of [GS, scaled(0.6), scaled(1.8)]) {
      const screens = screensOf(others, st);
      const snap = buildAlignSnapshot(screens, 'd1');
      for (const s of screens) {
        if (s.defectId === 'd1') continue;
        const cand = snap.byId[s.defectId]!;
        expect(cand.x).toBeCloseTo(s.label.x, 6);
        expect(cand.y).toBeCloseTo(s.label.y, 6);
      }
    }
  });

  it('⭐ 자동배치 라벨 거리는 반경에 정비례한다 (34 하드코딩 검출기)', () => {
    const auto = defect('auto', 1, { x: 0.5, y: 0.5 }, { x: 0, y: 0 }, {
      label: { defectId: 'auto', x: 0, y: 0, anchorMarkId: 'auto-m0', placed: false },
    });
    const dist = (st: GlobalStyle) => {
      const s = screensOf([auto], st)[0]!;
      const m = s.marks[0]!.center;
      return Math.hypot(s.label.x - m.x, s.label.y - m.y);
    };
    const base = dist(GS);
    expect(base).toBeGreaterThan(0);
    expect(dist(scaled(2))).toBeCloseTo(base * 2, 4);
    expect(dist(scaled(0.5))).toBeCloseTo(base * 0.5, 4);
  });
});
