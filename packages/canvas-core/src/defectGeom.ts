/**
 * 결함 1건의 기하 해석 — 앵커 · 라벨 자동배치 · 스크린 변환.
 *
 * 히트 테스트 · 렌더 모델 · 스냅이 **전부 이 한 곳**을 통해 위치를 얻는다.
 * 세 곳에 복제하면 "클릭은 잡히는데 그림은 딴 데 있는" 버그가 난다.
 */
import {
  LABEL_AUTO_ANGLE_DEG,
  LABEL_AUTO_DIST_FACTOR,
} from './constants.js';
import { radians, toScreen } from './geometry.js';
import type { SRect } from './shapes.js';
import type {
  Defect,
  Mark,
  MarkGeometry,
  MarkType,
  NPoint,
  ResolvedStyle,
  SketchPath,
  SPoint,
  Viewport,
} from './types.js';

/**
 * 마크의 중심 = **리더선이 붙는 점** (§2-7-b).
 *
 * 화살표만 중심이 아니라 **화살촉 끝**이다. 방향 표기는 "여기를 가리킨다" 는 뜻이므로
 * 번호를 몸통 한가운데가 아니라 가리키는 지점에 붙여야 읽힌다.
 */
export function centerOfMark(m: Mark): NPoint | null {
  return centerOfGeometry(m.geometry);
}

export function centerOfGeometry(g: MarkGeometry): NPoint | null {
  switch (g.k) {
    case 'POINT':
      return { x: g.x, y: g.y };
    case 'AREA_RECT':
    case 'AREA_ELLIPSE':
      return { x: g.x + g.w / 2, y: g.y + g.h / 2 };
    case 'ARROW':
      return { x: g.to.x, y: g.to.y }; // 화살촉 끝
    default:
      // 알 수 없는 type 은 무시하고 건너뛴다 (throw 금지 — 스펙 §2-0)
      return null;
  }
}

/** 정규화 기하 → 스크린 기하 */
export function geometryToScreen(
  g: MarkGeometry,
  vp: Viewport,
  iw: number,
  ih: number,
): { rect: SRect | null; from: SPoint | null; to: SPoint | null } {
  switch (g.k) {
    case 'ARROW':
      return {
        rect: null,
        from: toScreen(g.from, vp, iw, ih),
        to: toScreen(g.to, vp, iw, ih),
      };
    case 'AREA_RECT':
    case 'AREA_ELLIPSE': {
      const a = toScreen({ x: g.x, y: g.y }, vp, iw, ih);
      return {
        rect: { x: a.x, y: a.y, w: g.w * iw * vp.zoom, h: g.h * ih * vp.zoom },
        from: null,
        to: null,
      };
    }
    default:
      return { rect: null, from: null, to: null };
  }
}

/** 리더선이 붙는 지점 (§2-7-b) */
export function anchorNorm(defect: Defect): NPoint | null {
  const centers = defect.marks
    .map(centerOfMark)
    .filter((p): p is NPoint => p !== null);
  if (centers.length === 0) return null;

  if (defect.label.anchorMarkId !== null) {
    const m = defect.marks.find((x) => x.id === defect.label.anchorMarkId);
    if (m) {
      const c = centerOfMark(m);
      if (c) return c;
    }
    // 앵커가 가리키는 마크가 사라졌으면 marks[0] 으로 강등 (§2-8-e)
  }
  if (defect.label.anchorMarkId === null && centers.length > 1) {
    // centroid
    let sx = 0;
    let sy = 0;
    for (const c of centers) {
      sx += c.x;
      sy += c.y;
    }
    return { x: sx / centers.length, y: sy / centers.length };
  }
  return centers[0] ?? null;
}

/**
 * 자동 배치 위치 (B14) — 마크에서 우상단 45도, 거리 = 풍선 반지름 × 3.
 * 거리는 **이미지 px** 로 잰다. 정규화 공간에서 재면 종횡비 때문에 45도가 아니게 된다.
 */
export function autoLabelNorm(
  anchor: NPoint,
  balloonRadiusImg: number,
  iw: number,
  ih: number,
): NPoint {
  const d = balloonRadiusImg * LABEL_AUTO_DIST_FACTOR;
  const a = radians(LABEL_AUTO_ANGLE_DEG);
  return { x: anchor.x + (d * Math.cos(a)) / iw, y: anchor.y + (d * Math.sin(a)) / ih };
}

/** 실제로 그려지는 라벨 중심. placed=false 면 자동 배치 위치를 쓴다 */
export function effectiveLabelNorm(
  defect: Defect,
  style: ResolvedStyle,
  iw: number,
  ih: number,
): NPoint {
  if (defect.label.placed) return { x: defect.label.x, y: defect.label.y };
  const a = anchorNorm(defect);
  if (!a) return { x: defect.label.x, y: defect.label.y };
  return autoLabelNorm(a, style.balloonRadius, iw, ih);
}

export type MarkScreen = {
  id: string;
  type: MarkType;
  /** 리더선이 붙는 점 = `centerOfMark` 의 스크린 좌표 */
  center: SPoint;
  /** AREA_* — 외접 사각형(스크린). 그 외에는 null */
  rect: SRect | null;
  /** ARROW — 꼬리·머리(스크린). 그 외에는 null */
  from: SPoint | null;
  to: SPoint | null;
  /** 미리보기까지 반영된 정규화 기하. 편집 커맨드가 이 값을 근거로 만들어진다 */
  geometry: MarkGeometry;
};

export type SketchScreen = { id: string; points: SPoint[]; width: number };

/** 결함 1건의 스크린 기하. 모든 판정이 여기서 나온 값을 쓴다 */
export type DefectScreen = {
  defectId: string;
  seq: number;
  label: SPoint;
  anchor: SPoint | null;
  marks: MarkScreen[];
  sketch: SketchScreen[];
  balloonR: number;
  markR: number;
  style: ResolvedStyle;
};

/** 드래그 중 미리보기 위치 덮어쓰기. 커밋 전까지 문서(Defect[])는 건드리지 않는다 */
export type PreviewOverride = {
  defectId: string;
  label: NPoint | null;
  markId: string | null;
  /** POINT 이동 (기존 경로) */
  mark: NPoint | null;
  /** ARROW · AREA_* 생성/이동/리사이즈 */
  markGeom?: MarkGeometry | null;
  /** 자유그리기 이동 */
  pathId?: string | null;
  pathPoints?: NPoint[] | null;
} | null;

/** 옛 레코드에는 `sketch` 필드가 없다. 읽는 쪽은 항상 이 함수를 쓴다 */
export function sketchOf(defect: Defect): SketchPath[] {
  return defect.sketch ?? [];
}

function previewGeometry(m: Mark, p: NonNullable<PreviewOverride>): MarkGeometry {
  if (p.markId !== m.id) return m.geometry;
  if (p.markGeom) return p.markGeom;
  if (p.mark && m.geometry.k === 'POINT') return { k: 'POINT', x: p.mark.x, y: p.mark.y };
  return m.geometry;
}

export function defectScreen(
  defect: Defect,
  style: ResolvedStyle,
  vp: Viewport,
  iw: number,
  ih: number,
  preview: PreviewOverride,
): DefectScreen {
  const p = preview && preview.defectId === defect.id ? preview : null;

  const marks: MarkScreen[] = [];
  const patchedMarks: Mark[] = [];
  for (const m of defect.marks) {
    const g = p ? previewGeometry(m, p) : m.geometry;
    patchedMarks.push(g === m.geometry ? m : { ...m, geometry: g });
    const c = centerOfGeometry(g);
    if (!c) continue; // 알 수 없는 기하는 건너뛴다 (throw 금지)
    const s = geometryToScreen(g, vp, iw, ih);
    marks.push({
      id: m.id,
      type: m.type,
      center: toScreen(c, vp, iw, ih),
      rect: s.rect,
      from: s.from,
      to: s.to,
      geometry: g,
    });
  }

  // 앵커는 미리보기가 반영된 좌표로 다시 계산해야 리더선이 마크를 따라간다
  const anchorN = anchorNorm({ ...defect, marks: patchedMarks });

  const labelN = p && p.label ? p.label : effectiveLabelNorm({ ...defect, marks: patchedMarks }, style, iw, ih);

  const sketch: SketchScreen[] = [];
  for (const path of sketchOf(defect)) {
    const pts = p && p.pathId === path.id && p.pathPoints ? p.pathPoints : path.points;
    sketch.push({
      id: path.id,
      points: pts.map((n) => toScreen(n, vp, iw, ih)),
      width: Math.max(1, (path.width || style.sketchWidth) * vp.zoom),
    });
  }

  return {
    defectId: defect.id,
    seq: defect.seq,
    label: toScreen(labelN, vp, iw, ih),
    anchor: anchorN ? toScreen(anchorN, vp, iw, ih) : null,
    marks,
    sketch,
    balloonR: style.balloonRadius * vp.zoom,
    markR: style.markRadius * vp.zoom,
    style,
  };
}

/** 전회차 표기는 1차 범위에서 선택만 가능 (A8) */
export function isLocked(defect: Defect): boolean {
  return defect.status !== 'CURRENT';
}

/** z-order: seq 오름차순, 동률이면 defectId 사전순 (§2-4 / §2-9-b) */
export function byZAscending(a: Defect, b: Defect): number {
  if (a.seq !== b.seq) return a.seq - b.seq;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
