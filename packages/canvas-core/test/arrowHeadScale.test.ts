/**
 * C-1 — 화살표 머리 크기를 **도면 축척에 고정**한다 (2026-09-03, 배치 B1).
 *
 * 증상: "첫 지시선 길이에 따라 화살표 크기가 생성된다."
 * 원인: `arrowHeadPolygon`/`arrowShaftEnd` 안의 `Math.min(head, len*0.5)` 가 넘겨받은
 *       `from→to` **한 구간**만 본다. 화살표는 `points[0]`=촉 · `points[1]`=다음 꺾임점이라
 *       그 한 구간이 곧 **머리쪽 첫 구간**이었다.
 * 수정: 호출부(`renderModel.arrowOps`)가 상한을 **꺾은선 전체 길이 × ARROW_HEAD_MAX_RATIO** 로
 *       걸고, 첫 구간 클램프가 그 값을 다시 깎지 못하게 방향만 같은 기준점(ref)을 쓴다.
 *       `shapes.ts` 의 클램프는 다른 호출부를 위한 안전장치로 **남아 있다**(U48 · Q67 B안).
 *
 * 여기서 재는 것은 전부 **스크린 px** 다(§2-2-a). 정규화 공간에서 길이를 재면 종횡비 때문에 틀린다.
 */
import { describe, expect, it } from 'vitest';
import { ARROW_HEAD_MAX_RATIO, RENDER_DEFAULTS } from '../src/constants.js';
import { buildOverlay, buildScreens, type DrawOp } from '../src/renderModel.js';
import { arrowHeadPolygon, polylineLength, resolveArrowHead } from '../src/shapes.js';
import type { Defect, Mark, MarkGeometry, NPoint, Selection, SPoint } from '../src/types.js';
import { defect, GS } from './helpers.js';

// 정사각 도면이라 정규화 1.0 = 가로·세로 모두 1000 스크린 px (zoom=1). 종횡비 왜곡이 없다
const DRAWING = { id: 'dw', imageWidth: 1000, imageHeight: 1000 };
const NONE: Selection = { defectId: null, part: null, markId: null };

function arrowDefect(points: readonly NPoint[]): Defect {
  const d = defect('d1', 1, points[0]!, points[points.length - 1]!);
  const m: Mark = {
    id: 'd1-m0',
    defectId: 'd1',
    type: 'ARROW',
    geometry: { k: 'ARROW', points: [...points] } as MarkGeometry,
    sortOrder: 0,
  };
  return { ...d, marks: [m], label: { ...d.label, anchorMarkId: m.id } };
}

/** 오버레이에서 화살촉 삼각형(닫힌 3점 폴리라인, 채움만)을 찾아 **촉 길이**를 되돌린다 */
function headLenOf(points: readonly NPoint[], zoom: number): number {
  const input = {
    drawing: DRAWING,
    viewport: { zoom, tx: 0, ty: 0 },
    canvas: { w: 4000, h: 4000 },
    defects: [arrowDefect(points)],
    displayNumbers: { d1: '1' },
    globalStyle: GS,
    selection: NONE,
    hover: null,
    guides: [],
    preview: null,
    dragDefectId: null,
  };
  const ops: DrawOp[] = buildOverlay(input, buildScreens(input));
  const tri = ops.find(
    (o): o is Extract<DrawOp, { k: 'polyline' }> =>
      o.k === 'polyline' && o.close === true && o.noStroke === true && o.pts.length === 3,
  );
  if (!tri) throw new Error('화살촉 삼각형이 없다');
  // pts[0] = 촉 끝, pts[1]·pts[2] = 밑변 양끝. 촉 길이 = 끝 → 밑변 중점
  const tip = tri.pts[0]!;
  const mid: SPoint = {
    x: (tri.pts[1]!.x + tri.pts[2]!.x) / 2,
    y: (tri.pts[1]!.y + tri.pts[2]!.y) / 2,
  };
  return Math.hypot(tip.x - mid.x, tip.y - mid.y);
}

describe('polylineLength — 전 구간 합 (스크린 px)', () => {
  it('꺾인 구간을 모두 더한다', () => {
    expect(polylineLength([{ x: 0, y: 0 }])).toBe(0);
    expect(
      polylineLength([
        { x: 0, y: 0 },
        { x: 30, y: 40 }, // 50
        { x: 30, y: 60 }, // 20
      ]),
    ).toBeCloseTo(70, 6);
  });
});

describe('resolveArrowHead — 상한 기준이 첫 구간이 아니라 전체 길이다', () => {
  it('전체 길이가 넉넉하면 촉 길이는 넘겨준 값 그대로다 (첫 구간이 짧아도)', () => {
    // 첫 구간 10px, 전체 210px. 예전 클램프였다면 10*0.5 = 5px 로 줄었다
    const pts: SPoint[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 210, y: 0 },
    ];
    const r = resolveArrowHead(pts, 22);
    expect(r).not.toBeNull();
    expect(r!.head).toBeCloseTo(22, 6);
  });

  it('ref 는 방향이 같고 거리만 촉의 2배 이상이다 — 첫 구간 클램프가 물지 않는다', () => {
    const pts: SPoint[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 210, y: 0 },
    ];
    const r = resolveArrowHead(pts, 22)!;
    expect(r.ref.y).toBeCloseTo(0, 6); // 방향 동일 (+x)
    expect(r.ref.x).toBeGreaterThanOrEqual(r.head * 2);
    // 실제로 삼각형을 만들어 보면 촉 길이가 22 그대로여야 한다
    const tri = arrowHeadPolygon(r.ref, pts[0]!, r.head)!;
    const mid = { x: (tri[1]!.x + tri[2]!.x) / 2, y: (tri[1]!.y + tri[2]!.y) / 2 };
    expect(Math.hypot(tri[0]!.x - mid.x, tri[0]!.y - mid.y)).toBeCloseTo(22, 6);
  });

  it('아주 짧은 화살표에서만 전체 길이의 절반으로 줄어든다 (Q67 B안 — 안전장치 유지)', () => {
    const pts: SPoint[] = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ];
    expect(resolveArrowHead(pts, 22)!.head).toBeCloseTo(20 * ARROW_HEAD_MAX_RATIO, 6);
  });

  it('점이 모자라거나 첫 구간이 0 길이면 null', () => {
    expect(resolveArrowHead([{ x: 0, y: 0 }], 22)).toBeNull();
    expect(
      resolveArrowHead(
        [
          { x: 5, y: 5 },
          { x: 5, y: 5 },
        ],
        22,
      ),
    ).toBeNull();
  });
});

describe('⭐ 회귀 — 렌더된 화살촉 크기가 첫 지시선 길이에 끌려다니지 않는다', () => {
  const H = RENDER_DEFAULTS.arrowHead; // 22 이미지 px

  it('첫 구간이 길든 짧든 촉 길이가 같다 (전체 길이는 넉넉)', () => {
    // 첫 구간 0.30 (=300px) — 넉넉
    const long = headLenOf(
      [
        { x: 0.1, y: 0.5 },
        { x: 0.4, y: 0.5 },
        { x: 0.4, y: 0.8 },
      ],
      1,
    );
    // 첫 구간 0.02 (=20px) — 촉(22px)보다도 짧다. 예전에는 10px 로 줄었다
    const short = headLenOf(
      [
        { x: 0.1, y: 0.5 },
        { x: 0.12, y: 0.5 },
        { x: 0.12, y: 0.8 },
      ],
      1,
    );
    expect(long).toBeCloseTo(H, 6);
    expect(short).toBeCloseTo(H, 6);
    expect(short).toBeCloseTo(long, 6);
  });

  it('줌을 올리면 촉도 같은 배율로 커진다 — 축척 고정의 의미다', () => {
    const pts = [
      { x: 0.1, y: 0.5 },
      { x: 0.12, y: 0.5 },
      { x: 0.12, y: 0.8 },
    ];
    expect(headLenOf(pts, 2)).toBeCloseTo(H * 2, 6);
    expect(headLenOf(pts, 0.5)).toBeCloseTo(Math.max(6, H * 0.5), 6);
  });

  it('꺾이지 않은 긴 직선 화살표도 값이 같다 — 기존 동작이 안 바뀐다', () => {
    expect(
      headLenOf(
        [
          { x: 0.2, y: 0.2 },
          { x: 0.8, y: 0.8 },
        ],
        1,
      ),
    ).toBeCloseTo(H, 6);
  });
});
