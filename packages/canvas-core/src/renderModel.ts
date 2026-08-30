/**
 * 렌더 모델 — 스펙 §2-9. **코어는 그리지 않는다. DisplayList 를 만든다.**
 *
 * 좌표는 이미 스크린 CSS px 로 변환된 상태로 나온다. 어댑터는 그대로 그리기만 한다.
 *
 * 이 구조를 쓰는 진짜 이유(출력 재현성): Phase 4 조사위치도 출력은 캔버스와
 * 픽셀 단위로 같은 그림이어야 한다. 같은 build 함수에 `viewport = 출력 해상도 기준` +
 * `displayNumber = 출력 결함번호` 를 넣으면 출력 렌더가 공짜로 나온다.
 * 렌더 로직을 두 벌 쓰면 반드시 어긋난다.
 *
 * ⚠️ 캔버스가 그리는 숫자는 `displayNumbers` 로 **주입받는다.** 코어는 그 문자열이
 * seq 인지 출력번호인지 모른다 (§2-1-b).
 */
import {
  AREA_DASH,
  CLOUD_ARC_PX,
  CLOUD_BULGE,
  GUIDE_COLOR,
  HATCH_ALPHA,
  HATCH_GAP_PX,
  HATCH_WIDTH_PX,
  HOVER_HALO_COLOR,
  HOVER_MARK_GROW_PX,
  HOVER_STROKE_GROW_PX,
  MEMO_BOX_DASH,
  MEMO_INK,
  MEMO_INK_ALPHA,
  SELECTION_BOX_PAD_PX,
  SELECTION_COLOR,
  SELECTION_RING_PX,
} from './constants.js';
import {
  byZAscending,
  defectScreen,
  type DefectScreen,
  type MarkScreen,
  type PreviewOverride,
} from './defectGeom.js';
import { rectsIntersect } from './geometry.js';
import { leaderSegment } from './hitTest.js';
import type { MemoScreen } from './memoGeom.js';
import {
  arrowHeadPolygon,
  arrowShaftEnd,
  cloudPolyline,
  ellipsePolyline,
  handlePoints,
  hatchEllipse,
  hatchRect,
  rectOutline,
  stadiumPolyline,
  type SRect,
} from './shapes.js';
import { resolveStyle } from './style.js';
import { titleBlockOps, type TitleBlockConfig } from './titleBlock.js';
import { legendOps, type LegendConfig } from './legend.js';
import type {
  Defect,
  DrawingRef,
  GlobalStyle,
  Guide,
  HoverTarget,
  ResolvedStyle,
  Selection,
  Size,
  SPoint,
  Viewport,
} from './types.js';

export type DrawOp =
  | { k: 'image'; src: 'drawing'; at: SPoint; w: number; h: number }
  | {
      k: 'line';
      a: SPoint;
      b: SPoint;
      color: string;
      width: number;
      dash?: number[];
      alpha?: number;
      cap?: 'butt' | 'round';
    }
  | {
      k: 'circle';
      c: SPoint;
      r: number;
      fill?: string;
      stroke?: string;
      width?: number;
      alpha?: number;
      dash?: number[];
    }
  | {
      k: 'text';
      at: SPoint;
      text: string;
      size: number;
      color: string;
      align: 'center';
      weight?: number;
      halo?: string;
      haloWidth?: number;
      alpha?: number;
    }
  | {
      k: 'rect';
      at: SPoint;
      w: number;
      h: number;
      fill?: string;
      stroke?: string;
      width?: number;
      alpha?: number;
      dash?: number[];
    }
  | {
      k: 'ellipse';
      c: SPoint;
      rx: number;
      ry: number;
      fill?: string;
      stroke?: string;
      width?: number;
      alpha?: number;
      dash?: number[];
    }
  | {
      k: 'polyline';
      pts: SPoint[];
      color: string;
      width: number;
      close?: boolean;
      fill?: string;
      alpha?: number;
      dash?: number[];
      cap?: 'butt' | 'round';
      join?: 'round' | 'miter';
      /** 선을 그리지 않고 채우기만 (화살촉 등) */
      noStroke?: boolean;
    }
  /** 메모 텍스트 — 왼쪽 정렬이 필요해 `text` 와 정렬 옵션이 다르다 */
  | {
      k: 'textLeft';
      at: SPoint;
      text: string;
      size: number;
      color: string;
      weight?: number;
      alpha?: number;
    };

export type RenderInput = {
  drawing: DrawingRef;
  viewport: Viewport;
  canvas: Size;
  defects: readonly Defect[];
  /** 결함 id → 표시할 문자열. 캔버스는 seq 인지 출력번호인지 모른다 */
  displayNumbers: Record<string, string>;
  globalStyle: GlobalStyle;
  selection: Selection;
  hover: HoverTarget | null;
  guides: readonly Guide[];
  preview: PreviewOverride;
  /** 드래그 중인 결함 — 뷰 컬링에서 제외한다 */
  dragDefectId: string | null;
  /** 메모 레이어. 결함과 **별개**이며 결함 리스트에 나타나지 않는다 (§S2a-1) */
  memos?: readonly MemoScreen[];
  /** 생성 드래그 중인 도형 미리보기 (아직 문서에 없다) */
  ghost?: GhostShape | null;
  /**
   * F2 — 붙일 결함을 아직 못 고른 자유그리기(사후연결 대기).
   * 문서에 없으므로 ghost 와 같은 층에 그린다. **점선 + 대기 표시**로 그려
   * 이미 붙은 그리기(실선)와 눈으로 구분된다.
   */
  pending?: readonly GhostShape[] | null;
  /** F5-1 도곽. `null` = 그리지 않는다. **배경 레이어에서만 쓴다** */
  titleBlock?: TitleBlockConfig | null;
  /** F5-2 범례. `null` = 그리지 않는다. **배경 레이어에서만 쓴다** */
  legend?: LegendConfig | null;
};

/** 아직 커밋되지 않은 생성 미리보기. 문서에 없으므로 DefectScreen 이 아니다 */
export type GhostShape =
  | { k: 'ARROW'; points: SPoint[]; color: string; width: number; head: number }
  | {
      k: 'AREA_RECT' | 'AREA_ELLIPSE';
      rect: SRect;
      color: string;
      width: number;
      shape: ResolvedStyle['areaShape'];
    }
  | { k: 'SKETCH'; points: SPoint[]; color: string; width: number };

/**
 * 배경 레이어 — 뷰포트가 바뀔 때만 다시 그린다 (§2-9-d).
 * 도면 이미지 → 도곽(F5-1) → 범례(F5-2) 순서로 얹는다. 셋 다 도면 좌표계라
 * 줌·팬을 그대로 따라간다(A3 WYSIWYG).
 */
export function buildBackground(input: RenderInput): DrawOp[] {
  const { drawing, viewport: vp } = input;
  const size = { w: drawing.imageWidth, h: drawing.imageHeight };
  const ops: DrawOp[] = [
    {
      k: 'image',
      src: 'drawing',
      at: { x: vp.tx, y: vp.ty },
      w: size.w * vp.zoom,
      h: size.h * vp.zoom,
    },
  ];
  if (input.titleBlock) ops.push(...titleBlockOps(input.titleBlock, size, vp));
  if (input.legend) ops.push(...legendOps(input.legend, size, vp));
  return ops;
}

/** 결함들의 스크린 기하를 z-order 오름차순으로 계산. 히트 테스트와 **같은 배열**을 쓴다 */
export function buildScreens(input: {
  drawing: DrawingRef;
  viewport: Viewport;
  defects: readonly Defect[];
  globalStyle: GlobalStyle;
  preview: PreviewOverride;
  /**
   * 결함 id → 그릴 번호 문자열. **풍선 폭 계산에만 쓴다**(검수 심각2).
   * 안 넘기면 풍선은 예전처럼 고정 반지름 원이다 — 화면/히트가 서로 어긋나지는 않지만
   * 긴 번호(`1F-01`)가 원 밖으로 넘친다. **번호를 그리는 호출부는 반드시 넘겨라.**
   */
  displayNumbers?: Record<string, string>;
}): DefectScreen[] {
  const { drawing, viewport, defects, globalStyle, preview, displayNumbers } = input;
  return [...defects]
    .sort(byZAscending)
    .map((d) =>
      defectScreen(
        d,
        resolveStyle(d, globalStyle),
        viewport,
        drawing.imageWidth,
        drawing.imageHeight,
        preview,
        displayNumbers?.[d.id] ?? '',
      ),
    );
}

/** 오버레이 레이어 — 표기 전부 + 가이드. 매 프레임 다시 그린다 */
export function buildOverlay(input: RenderInput, screens: readonly DefectScreen[]): DrawOp[] {
  const { canvas, selection, hover, guides, dragDefectId, displayNumbers } = input;

  /** 메모 레이어 — 결함보다 **아래**. 히트 우선순위와 같은 순서다 */
  const memoOps: DrawOp[] = [];
  const fills: DrawOp[] = [];
  const shapes: DrawOp[] = [];
  const sketches: DrawOp[] = [];
  const leaders: DrawOp[] = [];
  const marks: DrawOp[] = [];
  const balloons: DrawOp[] = [];
  const texts: DrawOp[] = [];
  const highlights: DrawOp[] = [];

  const angleSnapActive = guides.some((g) => g.k === 'ANGLE');

  for (const m of input.memos ?? []) {
    if (!rectsIntersect(m.box.x, m.box.y, m.box.w, m.box.h, 0, 0, canvas.w, canvas.h)) continue;
    const selected = selection.memoId === m.memoId;
    const hovered = hover?.part === 'MEMO' && hover.memoId === m.memoId;
    memoOps.push(...memoOps_(m, selected, hovered));
  }

  for (const s of screens) {
    const exempt = s.defectId === dragDefectId || s.defectId === selection.defectId;
    if (!exempt && !intersectsCanvas(s, canvas)) continue; // 뷰 컬링 (§2-9-d)

    const st = s.style;
    const isSel = selection.defectId === s.defectId;
    const hov = hover && hover.defectId === s.defectId ? hover : null;
    const alpha = st.opacity;
    const zoom = zoomOf(s);

    // 1. 자유그리기 — 결함 표기 아래 (§S2a-1: 번호 라벨·리더선이 붙지 않는다)
    for (const path of s.sketch) {
      if (path.points.length < 2) continue;
      const sketchHovered = hov?.part === 'SKETCH' && hov.pathId === path.id;
      const sketchSel = isSel && selection.pathId === path.id;
      sketches.push({
        k: 'polyline',
        pts: path.points,
        color: sketchSel ? SELECTION_COLOR : st.color,
        width: path.width + (sketchHovered ? HOVER_STROKE_GROW_PX : 0),
        alpha,
        cap: 'round',
        join: 'round',
      });
    }

    // 2. 영역 · 화살표
    for (const m of s.marks) {
      if (m.type === 'AREA_RECT' || m.type === 'AREA_ELLIPSE') {
        const hovered = hov?.part === 'MARK' && hov.markId === m.id;
        areaOps(m, st, alpha, zoom, hovered, fills, shapes);
      } else if (m.type === 'ARROW' && m.points && m.points.length >= 2) {
        const hovered = hov?.part === 'MARK' && hov.markId === m.id;
        // 그린 그대로 그린다 — 번호까지 남은 구간은 아래 "3. 리더선"이 잇는다(일반 결함과 동일)
        arrowOps(m.points, st, alpha, zoom, hovered, shapes);
      }
    }

    // 3. 리더선
    const seg = leaderSegment(s);
    if (seg) {
      const dragging = s.defectId === dragDefectId;
      const leaderHovered = hov?.part === 'LEADER';
      leaders.push({
        k: 'line',
        a: seg.a,
        b: seg.b,
        color: dragging && angleSnapActive ? GUIDE_COLOR : st.color,
        width: Math.max(1, st.leaderWidth * zoomOf(s)) + (leaderHovered ? HOVER_STROKE_GROW_PX : 0),
        alpha,
        cap: 'round',
      });
    }

    // 4. 점 마크
    for (const m of s.marks) {
      if (m.type !== 'POINT') continue;
      const hovered = hov?.part === 'MARK' && hov.markId === m.id;
      const r = Math.max(2, s.markR) + (hovered ? HOVER_MARK_GROW_PX : 0);
      if (hovered) {
        marks.push({ k: 'circle', c: m.center, r: r + 4, fill: HOVER_HALO_COLOR });
      }
      marks.push({
        k: 'circle',
        c: m.center,
        r,
        fill: st.color,
        stroke: '#ffffff',
        width: Math.max(1, st.markStroke * zoomOf(s) * 0.5),
        alpha,
      });
      if (isSel && (selection.markId === null || selection.markId === m.id)) {
        const half = r + SELECTION_BOX_PAD_PX;
        highlights.push({
          k: 'rect',
          at: { x: m.center.x - half, y: m.center.y - half },
          w: half * 2,
          h: half * 2,
          stroke: SELECTION_COLOR,
          width: 1.5,
          dash: [4, 3],
        });
      }
    }

    // 4-b. 선택된 도형의 편집 핸들 (§S2a-4)
    if (isSel) {
      for (const m of s.marks) {
        if (selection.markId !== null && selection.markId !== m.id) continue;
        if (m.rect) {
          highlights.push({
            k: 'rect',
            at: { x: m.rect.x, y: m.rect.y },
            w: m.rect.w,
            h: m.rect.h,
            stroke: SELECTION_COLOR,
            width: 1,
            dash: [4, 3],
          });
          for (const h of handlePoints(m.rect)) highlights.push(handleOp(h.at));
        }
        // ARROW 는 핸들이 없다(2026-08-24 개정) — 정점 낱개 편집 대신 통째로 이동만 지원한다
      }
    }

    // 5·6. 번호 풍선 + 번호 텍스트
    //
    // ⭐ 풍선은 **스타디움(알약)** 이다 — 글자가 길면 좌우로 늘어난다(검수 심각2).
    //    `labelHalfExtra === 0`(1~2자리 숫자)이면 원 op 을 **그대로** 쓴다: 예전과 픽셀이 같다.
    //    폭은 `DefectScreen` 이 이미 계산해 두었다 — 히트 테스트가 보는 값과 **같은 값**이다.
    const balloonHovered = hov?.part === 'LABEL';
    const br = Math.max(4, s.balloonR);
    const ex = Math.max(0, s.labelHalfExtra ?? 0);
    /** 늘어난 만큼을 반영한 풍선 외곽선 op. `ex === 0` 이면 예전 원 op 그대로 */
    const balloonOp = (
      r: number,
      o: { fill?: string; stroke?: string; width?: number; alpha?: number },
    ): DrawOp =>
      ex === 0
        ? { k: 'circle', c: s.label, r, ...o }
        : {
            k: 'polyline',
            pts: stadiumPolyline(s.label, r, ex),
            close: true,
            fill: o.fill,
            color: o.stroke ?? o.fill ?? '#000000',
            width: o.width ?? 1,
            noStroke: o.stroke === undefined,
            alpha: o.alpha,
            join: 'round',
          };

    if (isSel) {
      // 선택 글로우 — 풍선 주위
      highlights.push(
        balloonOp(br + SELECTION_RING_PX + 2, {
          stroke: SELECTION_COLOR,
          width: SELECTION_RING_PX,
          alpha: 0.35,
        }),
      );
      highlights.push(balloonOp(br + 2, { stroke: SELECTION_COLOR, width: 1.5 }));
    }
    if (balloonHovered && !isSel) {
      balloons.push(balloonOp(br + 3, { fill: HOVER_HALO_COLOR }));
    }
    balloons.push(
      balloonOp(br, {
        fill: '#ffffff',
        stroke: st.color,
        width:
          Math.max(1, st.balloonStroke * zoomOf(s)) + (balloonHovered ? HOVER_STROKE_GROW_PX : 0),
        alpha,
      }),
    );

    const label = displayNumbers[s.defectId];
    if (label !== undefined && label !== '') {
      const size = Math.max(7, st.fontSize * zoomOf(s));
      texts.push({
        k: 'text',
        at: s.label,
        text: label,
        size,
        color: st.color,
        align: 'center',
        weight: 700,
        halo: '#ffffff',
        haloWidth: Math.max(1, size * 0.16),
        alpha,
      });
    }
  }

  // 8. 생성 중인 도형 미리보기 — 아직 문서에 없다
  const ghostOps: DrawOp[] = input.ghost ? ghostToOps(input.ghost) : [];
  // 8-b. 사후연결 대기 중인 그리기 (F2) — 점선으로 "아직 안 붙었다"를 알린다
  for (const g of input.pending ?? []) ghostOps.push(...ghostToOps(g, PENDING_DASH));

  // 9. 스냅 가이드선 — 항상 최상단
  const guideOps: DrawOp[] = [];
  for (const g of guides) guideOps.push(...guideToOps(g));

  return [
    ...memoOps,
    ...fills,
    ...shapes,
    ...sketches,
    ...leaders,
    ...marks,
    ...balloons,
    ...texts,
    ...highlights,
    ...ghostOps,
    ...guideOps,
  ];
}

// ── 도형 DrawOp 생성 ───────────────────────────────────────────────────────

/** 선택·리사이즈 핸들 — UI 신호이므로 줌과 무관하게 일정한 크기 */
function handleOp(at: SPoint): DrawOp {
  const H = 4;
  return {
    k: 'rect',
    at: { x: at.x - H, y: at.y - H },
    w: H * 2,
    h: H * 2,
    fill: '#ffffff',
    stroke: SELECTION_COLOR,
    width: 1.5,
  };
}

function areaOps(
  m: MarkScreen,
  st: ResolvedStyle,
  alpha: number,
  zoom: number,
  hovered: boolean,
  fills: DrawOp[],
  shapes: DrawOp[],
): void {
  const rect = m.rect;
  if (!rect || rect.w <= 0 || rect.h <= 0) return;
  const ellipse = m.type === 'AREA_ELLIPSE';
  const width = Math.max(1, st.markStroke * zoom) + (hovered ? HOVER_STROKE_GROW_PX : 0);

  // 채움 — 45° 해치. 도면 선을 덮지 않도록 얇고 흐리게
  if (st.areaFill === 'HATCH') {
    const lines = ellipse ? hatchEllipse(rect, HATCH_GAP_PX) : hatchRect(rect, HATCH_GAP_PX);
    for (const l of lines) {
      fills.push({
        k: 'line',
        a: l.a,
        b: l.b,
        color: st.color,
        width: HATCH_WIDTH_PX,
        alpha: alpha * HATCH_ALPHA,
      });
    }
  }

  // 테두리
  if (st.areaShape === 'CLOUD') {
    const outline = ellipse ? ellipsePolyline(rect, 40) : rectOutline(rect);
    shapes.push({
      k: 'polyline',
      pts: cloudPolyline(outline, CLOUD_ARC_PX, CLOUD_BULGE),
      color: st.color,
      width,
      close: true,
      alpha,
      cap: 'round',
      join: 'round',
    });
    return;
  }

  const dash = st.areaShape === 'DASH' ? [...AREA_DASH] : undefined;
  if (ellipse) {
    shapes.push({
      k: 'ellipse',
      c: { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 },
      rx: rect.w / 2,
      ry: rect.h / 2,
      stroke: st.color,
      width,
      alpha,
      dash,
    });
  } else {
    shapes.push({
      k: 'rect',
      at: { x: rect.x, y: rect.y },
      w: rect.w,
      h: rect.h,
      stroke: st.color,
      width,
      alpha,
      dash,
    });
  }
}

/**
 * 방향(화살표) 커넥터 — `points[0]` 이 화살촉(2026-08-24 재개정, 예전엔 마지막 점이었다).
 * 화살촉은 `points[1]` 반대쪽(= 처음 고정한 방향)을 가리킨다. 나머지 구간(꺾인 부분 포함)은
 * 곧은 선분 그대로 잇는다 — **이 선 전체가 지시선이다**, 별도로 그리는 리더선이 없다.
 */
function arrowOps(
  points: readonly SPoint[],
  st: ResolvedStyle,
  alpha: number,
  zoom: number,
  hovered: boolean,
  out: DrawOp[],
): void {
  if (points.length < 2) return;
  const head = Math.max(6, st.arrowHead * zoom);
  const width = Math.max(1, st.markStroke * zoom) + (hovered ? HOVER_STROKE_GROW_PX : 0);

  const tip = points[0]!;
  const next = points[1]!;
  // arrowShaftEnd/arrowHeadPolygon 은 "to 에서 from 반대 방향으로 화살촉을 그린다"는 계약이다.
  // 화살촉이 tip 에 있고 next 반대쪽을 가리켜야 하므로 from=next, to=tip 으로 뒤집어 넘긴다
  out.push({
    k: 'line',
    a: next,
    b: arrowShaftEnd(next, tip, head),
    color: st.color,
    width,
    alpha,
    cap: 'round',
  });
  const tri = arrowHeadPolygon(next, tip, head);
  if (tri) {
    out.push({
      k: 'polyline',
      pts: tri,
      color: st.color,
      width: 1,
      close: true,
      fill: st.color,
      alpha,
      noStroke: true,
    });
  }

  for (let i = 1; i < points.length - 1; i += 1) {
    out.push({
      k: 'line',
      a: points[i]!,
      b: points[i + 1]!,
      color: st.color,
      width,
      alpha,
      cap: 'round',
    });
  }
}

function memoOps_(m: MemoScreen, selected: boolean, hovered: boolean): DrawOp[] {
  const ops: DrawOp[] = [];
  const b = m.box;

  // ── F2 필기 메모 ────────────────────────────────────────────────────────
  // 그리기(결함)와 **눈으로 확실히 갈린다**: 중립 앰버 잉크 + 점선 상자.
  // 결함 상태색(빨강·보라·회색)은 여기 절대 오지 않는다.
  if (m.paths) {
    // ⭐ D14 — 점선 상자는 **선택 또는 hover 일 때만** 그린다.
    //    상시 표시하면 도면 위에 빈 사각형이 잔뜩 남아 무엇이 결함인지 안 보인다.
    //    글씨(획) 자체가 메모 본체이므로 상자가 없어도 내용은 그대로 보인다.
    //
    //    출력(`locationMap.ts`)은 selection·hover 를 전부 비우므로 조사위치도에서는
    //    자동으로 사라진다 — 출력 쪽에 별도 분기가 없다.
    if (selected || hovered) {
      ops.push({
        k: 'rect',
        at: { x: b.x, y: b.y },
        w: b.w,
        h: b.h,
        stroke: selected ? SELECTION_COLOR : MEMO_INK,
        width: selected ? 2 : 1.6,
        alpha: 0.9,
        dash: [...MEMO_BOX_DASH],
      });
    }
    for (const p of m.paths) {
      ops.push({
        k: 'polyline',
        pts: p.points,
        color: MEMO_INK,
        width: p.width,
        alpha: MEMO_INK_ALPHA,
        cap: 'round',
        join: 'round',
      });
    }
    return ops;
  }

  ops.push({
    k: 'rect',
    at: { x: b.x, y: b.y },
    w: b.w,
    h: b.h,
    fill: m.style.background,
    stroke: selected ? SELECTION_COLOR : m.style.border,
    width: selected ? 2 : hovered ? 1.8 : 1,
  });
  if (selected) {
    ops.push({
      k: 'rect',
      at: { x: b.x - 3, y: b.y - 3 },
      w: b.w + 6,
      h: b.h + 6,
      stroke: SELECTION_COLOR,
      width: 1,
      dash: [4, 3],
    });
  }
  // 글자가 상자보다 크면 그리지 않는다. 줌아웃 시 상자 밖으로 글자가 새는 것 방지
  if (m.fontSize >= 7 && b.h > m.pad * 2) {
    let y = b.y + m.pad + m.lineHeight * 0.72;
    for (const line of m.lines) {
      if (y > b.y + b.h - m.pad * 0.2) break;
      if (line !== '') {
        ops.push({
          k: 'textLeft',
          at: { x: b.x + m.pad, y },
          text: line,
          size: m.fontSize,
          color: m.style.color,
        });
      }
      y += m.lineHeight;
    }
  }
  return ops;
}

/** F2 대기 그리기의 점선 패턴 — 스크린 px */
export const PENDING_DASH: readonly number[] = [7, 5];

function ghostToOps(g: GhostShape, dashOverride?: readonly number[]): DrawOp[] {
  if (g.k === 'ARROW') {
    if (g.points.length < 2) return [];
    const out: DrawOp[] = [];
    arrowOps(
      g.points,
      {
        color: g.color,
        opacity: 1,
        markRadius: 0,
        markStroke: g.width,
        balloonRadius: 1,
        balloonStroke: 1,
        leaderWidth: 1,
        fontSize: 1,
        haloWidth: 0,
        arrowHead: g.head,
        areaShape: 'SOLID',
        areaFill: 'NONE',
        sketchWidth: g.width,
      },
      0.85,
      1,
      false,
      out,
    );
    return out;
  }
  if (g.k === 'SKETCH') {
    if (g.points.length < 2) return [];
    return [
      {
        k: 'polyline',
        pts: g.points,
        color: g.color,
        width: g.width,
        alpha: 0.9,
        cap: 'round',
        join: 'round',
        ...(dashOverride ? { dash: [...dashOverride] } : {}),
      },
    ];
  }
  const dash = dashOverride ? [...dashOverride] : g.shape === 'DASH' ? [...AREA_DASH] : undefined;
  if (g.k === 'AREA_ELLIPSE') {
    return [
      {
        k: 'ellipse',
        c: { x: g.rect.x + g.rect.w / 2, y: g.rect.y + g.rect.h / 2 },
        rx: g.rect.w / 2,
        ry: g.rect.h / 2,
        stroke: g.color,
        width: g.width,
        alpha: 0.85,
        dash,
      },
    ];
  }
  return [
    {
      k: 'rect',
      at: { x: g.rect.x, y: g.rect.y },
      w: g.rect.w,
      h: g.rect.h,
      stroke: g.color,
      width: g.width,
      alpha: 0.85,
      dash,
    },
  ];
}

function zoomOf(s: DefectScreen): number {
  // balloonR = style.balloonRadius * zoom 이므로 역산한다.
  // (DefectScreen 에 zoom 을 따로 싣지 않기 위한 최소 트릭)
  return s.style.balloonRadius > 0 ? s.balloonR / s.style.balloonRadius : 1;
}

function intersectsCanvas(s: DefectScreen, canvas: Size): boolean {
  // 스타디움으로 늘어난 폭까지 센다 — 안 그러면 화면 가장자리에서 긴 번호가 통째로 사라진다
  const halfW = s.balloonR + Math.max(0, s.labelHalfExtra ?? 0);
  let minX = s.label.x - halfW;
  let maxX = s.label.x + halfW;
  let minY = s.label.y - s.balloonR;
  let maxY = s.label.y + s.balloonR;
  const grow = (x: number, y: number, r = 0) => {
    minX = Math.min(minX, x - r);
    maxX = Math.max(maxX, x + r);
    minY = Math.min(minY, y - r);
    maxY = Math.max(maxY, y + r);
  };
  for (const m of s.marks) {
    grow(m.center.x, m.center.y, s.markR);
    // 도형은 중심만 보면 안 된다 — 화면 밖 중심을 가진 큰 영역이 통째로 사라진다
    if (m.rect) {
      grow(m.rect.x, m.rect.y);
      grow(m.rect.x + m.rect.w, m.rect.y + m.rect.h);
    }
    if (m.points) for (const p of m.points) grow(p.x, p.y);
  }
  for (const path of s.sketch) {
    for (const p of path.points) grow(p.x, p.y, path.width);
  }
  const pad = 8;
  return rectsIntersect(
    minX - pad,
    minY - pad,
    maxX - minX + pad * 2,
    maxY - minY + pad * 2,
    0,
    0,
    canvas.w,
    canvas.h,
  );
}

export function guideToOps(g: Guide): DrawOp[] {
  if (g.k === 'ALIGN_X') {
    return [
      {
        k: 'line',
        a: { x: g.x, y: g.y1 },
        b: { x: g.x, y: g.y2 },
        color: GUIDE_COLOR,
        width: 1,
        dash: [4, 3],
      },
    ];
  }
  if (g.k === 'ALIGN_Y') {
    return [
      {
        k: 'line',
        a: { x: g.x1, y: g.y },
        b: { x: g.x2, y: g.y },
        color: GUIDE_COLOR,
        width: 1,
        dash: [4, 3],
      },
    ];
  }
  // ANGLE — 연장선 + 앵커의 직각 표식 (§2-7-d)
  const ops: DrawOp[] = [
    { k: 'line', a: g.anchor, b: g.end, color: GUIDE_COLOR, width: 1, dash: [4, 3] },
  ];
  const T = 8;
  const vertical = g.angle === 90 || g.angle === 270;
  const sign = g.angle === 90 || g.angle === 0 ? 1 : -1;
  if (vertical) {
    ops.push({
      k: 'line',
      a: { x: g.anchor.x, y: g.anchor.y + sign * T },
      b: { x: g.anchor.x + T, y: g.anchor.y + sign * T },
      color: GUIDE_COLOR,
      width: 1,
    });
    ops.push({
      k: 'line',
      a: { x: g.anchor.x + T, y: g.anchor.y + sign * T },
      b: { x: g.anchor.x + T, y: g.anchor.y },
      color: GUIDE_COLOR,
      width: 1,
    });
  } else {
    ops.push({
      k: 'line',
      a: { x: g.anchor.x + sign * T, y: g.anchor.y },
      b: { x: g.anchor.x + sign * T, y: g.anchor.y - T },
      color: GUIDE_COLOR,
      width: 1,
    });
    ops.push({
      k: 'line',
      a: { x: g.anchor.x + sign * T, y: g.anchor.y - T },
      b: { x: g.anchor.x, y: g.anchor.y - T },
      color: GUIDE_COLOR,
      width: 1,
    });
  }
  return ops;
}
