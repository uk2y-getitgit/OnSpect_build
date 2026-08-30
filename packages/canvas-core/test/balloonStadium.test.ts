/**
 * 번호 풍선 스타디움(알약) — 검수 배치3 심각2.
 *
 * 풍선은 **고정 반지름 원**이었다. 층 접두어가 붙은 `1F-01` 같은 번호는 원 밖으로 넘쳐
 * 옆 풍선·리더선·도면 선과 겹쳤다. 이제 글자 폭에 맞춰 좌우로 늘어난다.
 *
 * 이 파일이 지키는 것 둘:
 *   ① **회귀 없음** — 1~2자리 숫자는 `labelHalfExtra === 0` 이라 예전 원과 픽셀이 같다.
 *   ② **경계면 일치** — 렌더 · 히트 · 자동배치가 전부 같은 폭을 본다.
 *      (렌더만 늘리면 "그림은 넓은데 클릭이 안 잡히는" 버그가 난다)
 */
import { describe, expect, it } from 'vitest';
import { balloonHalfExtra } from '../src/defectGeom.js';
import { hitTest, leaderSegment } from '../src/hitTest.js';
import { buildOverlay, buildScreens, type DrawOp } from '../src/renderModel.js';
import { pointInStadium, stadiumBoundaryDist, stadiumPolyline } from '../src/shapes.js';
import { defect, GS } from './helpers.js';
import type { Defect, Selection } from '../src/types.js';

const DRAWING = { id: 'dw', imageWidth: 2400, imageHeight: 1600 };
const VP = { zoom: 1, tx: 0, ty: 0 };
const NONE: Selection = { defectId: null, part: null, markId: null };

function screensOf(defects: readonly Defect[], displayNumbers?: Record<string, string>) {
  return buildScreens({
    drawing: DRAWING,
    viewport: VP,
    defects,
    globalStyle: GS,
    preview: null,
    displayNumbers,
  });
}

function overlayOf(defects: readonly Defect[], displayNumbers: Record<string, string>): DrawOp[] {
  const screens = screensOf(defects, displayNumbers);
  return buildOverlay(
    {
      drawing: DRAWING,
      viewport: VP,
      canvas: { w: 2400, h: 1600 },
      defects,
      displayNumbers,
      globalStyle: GS,
      selection: NONE,
      hover: null,
      guides: [],
      preview: null,
      dragDefectId: null,
    },
    screens,
  );
}

describe('balloonHalfExtra — 폭 계산 (단일 소스)', () => {
  const R = GS.balloonRadius; // 34
  const F = R * GS.fontFactor; // ≈ 35.7

  it('⭐ 회귀 — 1~2자리 숫자는 늘어나지 않는다 (0)', () => {
    expect(balloonHalfExtra('', R, F)).toBe(0);
    expect(balloonHalfExtra('1', R, F)).toBe(0);
    expect(balloonHalfExtra('12', R, F)).toBe(0);
    expect(balloonHalfExtra('99', R, F)).toBe(0);
  });

  it('층 접두어가 붙으면 늘어난다 — 글자가 원 밖으로 나가지 않는다', () => {
    const e = balloonHalfExtra('1F-01', R, F);
    expect(e).toBeGreaterThan(0);
    // 풍선 안쪽 폭이 글자 폭보다 넓어야 한다 (그게 이 수정의 목적이다)
    const textW = 5 * 0.55 * F; // `1F-01` = 반각 5글자
    expect(2 * (R + e)).toBeGreaterThan(textW);
  });

  it('글자가 길수록 단조 증가한다', () => {
    const a = balloonHalfExtra('1F-1', R, F);
    const b = balloonHalfExtra('1F-01', R, F);
    const c = balloonHalfExtra('B1F-01', R, F);
    expect(b).toBeGreaterThanOrEqual(a);
    expect(c).toBeGreaterThan(b);
  });

  it('한글은 반각의 두 배 폭으로 본다 (estimateEm 재사용)', () => {
    expect(balloonHalfExtra('외벽', R, F)).toBeGreaterThan(balloonHalfExtra('AB', R, F));
  });
});

describe('stadium 기하', () => {
  it('halfExtra = 0 이면 경계 거리가 정확히 반지름이다 (원과 동일)', () => {
    for (const u of [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 0.6, y: 0.8 },
    ]) {
      expect(stadiumBoundaryDist(u, 34, 0)).toBeCloseTo(34, 10);
    }
  });

  it('가로 방향은 반지름 + 늘어난 양, 세로 방향은 반지름 그대로', () => {
    expect(stadiumBoundaryDist({ x: 1, y: 0 }, 34, 12)).toBeCloseTo(46, 10);
    expect(stadiumBoundaryDist({ x: 0, y: -1 }, 34, 12)).toBeCloseTo(34, 10);
  });

  it('경계 거리만큼 간 점은 실제로 테두리 위에 있다', () => {
    const c = { x: 100, y: 100 };
    for (const u of [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 0.6, y: -0.8 },
      { x: -0.28, y: 0.96 },
    ]) {
      const t = stadiumBoundaryDist(u, 34, 12);
      expect(pointInStadium({ x: c.x + u.x * (t - 0.5), y: c.y + u.y * (t - 0.5) }, c, 34, 12)).toBe(
        true,
      );
      expect(pointInStadium({ x: c.x + u.x * (t + 0.5), y: c.y + u.y * (t + 0.5) }, c, 34, 12)).toBe(
        false,
      );
    }
  });

  it('외곽선 점들은 전부 테두리 위(±0.5px)다', () => {
    const c = { x: 0, y: 0 };
    for (const p of stadiumPolyline(c, 34, 12)) {
      expect(pointInStadium(p, c, 34.5, 12)).toBe(true);
      expect(pointInStadium(p, c, 33.5, 12)).toBe(false);
    }
  });
});

describe('경계면 — 렌더 · 히트 · 자동배치가 같은 폭을 본다', () => {
  const d = defect('d1', 1, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 });

  it('⭐ 회귀 — 짧은 번호는 풍선이 여전히 원 op 이다 (픽셀 동일)', () => {
    const ops = overlayOf([d], { d1: '7' });
    expect(screensOf([d], { d1: '7' })[0]!.labelHalfExtra).toBe(0);
    // 풍선(흰 채움 + 상태색 테두리)이 circle 로 남아 있어야 한다
    expect(
      ops.some((o) => o.k === 'circle' && o.fill === '#ffffff' && o.stroke !== undefined),
    ).toBe(true);
    expect(ops.some((o) => o.k === 'polyline' && o.fill === '#ffffff')).toBe(false);
  });

  it('긴 번호는 풍선이 스타디움(폴리라인)으로 바뀐다', () => {
    const ops = overlayOf([d], { d1: '1F-01' });
    expect(ops.some((o) => o.k === 'polyline' && o.fill === '#ffffff' && o.close === true)).toBe(
      true,
    );
    expect(ops.some((o) => o.k === 'circle' && o.fill === '#ffffff')).toBe(false);
  });

  it('⭐ 늘어난 풍선의 오른쪽 끝을 눌러도 LABEL 로 잡힌다', () => {
    const withNo = screensOf([d], { d1: 'B1F-01' });
    const s = withNo[0]!;
    expect(s.labelHalfExtra).toBeGreaterThan(0);
    const edge = { x: s.label.x + s.balloonR + s.labelHalfExtra - 1, y: s.label.y };
    expect(hitTest(edge, withNo, NONE)?.part).toBe('LABEL');

    // 같은 지점이 예전(원) 판정에서는 안 잡혔다 — 이것이 고친 문제다
    const noNumbers = screensOf([d]);
    expect(noNumbers[0]!.labelHalfExtra).toBe(0);
    expect(hitTest(edge, noNumbers, NONE)).toBeNull();
  });

  it('세로 방향 히트 범위는 넓어지지 않는다 (알약이지 타원이 아니다)', () => {
    const screens = screensOf([d], { d1: 'B1F-01' });
    const s = screens[0]!;
    const below = { x: s.label.x, y: s.label.y + s.balloonR + s.labelHalfExtra - 1 };
    expect(hitTest(below, screens, NONE)?.part).not.toBe('LABEL');
  });

  it('리더선은 늘어난 테두리에서 끊긴다 — 알약 속으로 파고들지 않는다', () => {
    const far = defect('d2', 1, { x: 0.2, y: 0.5 }, { x: 0.7, y: 0.5 });
    const s = screensOf([far], { d2: 'B1F-01' })[0]!;
    const seg = leaderSegment(s)!;
    expect(pointInStadium(seg.b, s.label, s.balloonR - 0.5, s.labelHalfExtra)).toBe(false);
    expect(pointInStadium(seg.b, s.label, s.balloonR + 0.5, s.labelHalfExtra)).toBe(true);
  });

  it('자동배치 — 긴 번호는 마크에서 가로로 더 밀려난다 (풍선이 마크를 덮지 않게)', () => {
    const auto = defect('d3', 1, { x: 0.3, y: 0.5 }, { x: 0, y: 0 }, {
      label: { defectId: 'd3', x: 0, y: 0, anchorMarkId: 'd3-m0', placed: false },
    });
    const plain = screensOf([auto], { d3: '7' })[0]!;
    const long = screensOf([auto], { d3: 'B1F-01' })[0]!;
    expect(long.label.x).toBeGreaterThan(plain.label.x);
    expect(long.label.y).toBeCloseTo(plain.label.y, 6); // 세로는 그대로
  });

  it('displayNumbers 를 안 넘기면 예전 동작 그대로 (원)', () => {
    const s = screensOf([d])[0]!;
    expect(s.labelHalfExtra).toBe(0);
  });
});
