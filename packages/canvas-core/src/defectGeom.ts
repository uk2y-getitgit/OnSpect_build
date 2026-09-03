/**
 * 결함 1건의 기하 해석 — 앵커 · 라벨 자동배치 · 스크린 변환.
 *
 * 히트 테스트 · 렌더 모델 · 스냅이 **전부 이 한 곳**을 통해 위치를 얻는다.
 * 세 곳에 복제하면 "클릭은 잡히는데 그림은 딴 데 있는" 버그가 난다.
 */
import {
  BALLOON_TEXT_PAD_EM,
  LABEL_AUTO_ANGLE_DEG,
  LABEL_AUTO_DIST_FACTOR,
} from './constants.js';
import { angleDeg, radians, toScreen } from './geometry.js';
import { nearestAngle, SET_8 } from './snapAngle.js';
import { areaBoundaryPoint, type SRect } from './shapes.js';
import { estimateEm } from './titleBlock.js';
import type {
  Defect,
  DefectStatus,
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
 * 옛 레코드 호환 — ARROW 의 저장 형식이 두 번 바뀌었다:
 *   ① 최초 형식 `{from,to}` (2점 고정)
 *   ② 세션 중간 형식 `{x,y,angleDeg}` (화살촉+방향만, 커넥터는 매번 계산 — 커밋된 적 없다)
 *   ③ 지금 형식 `{points:[...]}` (드래그로 실제 그린 꺾은선, 2~4점)
 * **읽는 시점에 ③ 으로 바꾼다.** DB 버전은 그대로 1이다(다른 옛 레코드 호환과 같은 방식 —
 * `normalizeMemo`·`normalizeDrawing` 참조). 이미 ③ 형식인 마크는 손대지 않는다.
 *
 * 이미 정규화된 마크뿐이면 **같은 배열을 그대로 돌려준다**(참조 비교로 재렌더를 줄인다).
 */
export function normalizeArrowMarks(marks: readonly Mark[]): Mark[] {
  let changed = false;
  const out = marks.map((m) => {
    if (m.type !== 'ARROW') return m;
    const g = m.geometry as Record<string, unknown>;
    if (Array.isArray(g.points)) return m as Mark; // 이미 지금 형식
    changed = true;

    let tip: NPoint;
    let dir: NPoint | null; // tip 에서 뻗어나가는 방향을 알려주는 두 번째 점(있으면)
    if (g.from) {
      tip = g.from as NPoint;
      dir = (g.to as NPoint | undefined) ?? null;
    } else if (typeof g.x === 'number' && typeof g.y === 'number') {
      tip = { x: g.x, y: g.y } as NPoint;
      dir = null; // ②는 각도만 있고 두 번째 점이 없다 — 아래에서 각도로 만든다
    } else {
      tip = { x: 0, y: 0 };
      dir = null;
    }
    // ⚠️ 정규화 좌표에서 그대로 각도를 재면 종횡비 때문에 틀린다(함정 #2) — 도면 크기가
    // 없는 이 자리에서는 완벽히 보정할 수 없어, ②의 angleDeg 가 있으면 그걸 그대로 쓰고
    // (이미 화면 기준으로 스냅됐던 값이다), ①(from/to)만 근사로 재계산한다
    const legacyAngle = typeof g.angleDeg === 'number' ? g.angleDeg : null;
    const raw = legacyAngle ?? (dir ? angleDeg(tip, dir) : 0);
    const a = legacyAngle !== null ? legacyAngle : nearestAngle(raw, SET_8);
    const len = 0.05; // 두 번째 점이 없을 때 쓰는 임의 길이(정규화). 방향만 보존하면 된다
    const rad = radians(a);
    const to: NPoint = { x: tip.x + Math.cos(rad) * len, y: tip.y + Math.sin(rad) * len };
    return { ...m, geometry: { k: 'ARROW', points: [tip, dir ?? to] } as MarkGeometry };
  });
  return changed ? out : (marks as Mark[]);
}

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
    case 'ARROW': {
      // 리더선이 붙는 점 = **번호 쪽 끝**(마지막 점). 화살촉(points[0])의 반대편이다 —
      // 방향 표기는 "여기서 뻗어나온다"는 뜻이라 번호는 뻗어나온 끝에 붙어야 읽힌다
      const last = g.points[g.points.length - 1];
      return last ? { x: last.x, y: last.y } : null;
    }
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
): { rect: SRect | null; points: SPoint[] | null } {
  switch (g.k) {
    case 'ARROW':
      return { rect: null, points: g.points.map((pt) => toScreen(pt, vp, iw, ih)) };
    case 'AREA_RECT':
    case 'AREA_ELLIPSE': {
      const a = toScreen({ x: g.x, y: g.y }, vp, iw, ih);
      return {
        rect: { x: a.x, y: a.y, w: g.w * iw * vp.zoom, h: g.h * ih * vp.zoom },
        points: null,
      };
    }
    default:
      return { rect: null, points: null };
  }
}

/**
 * 화살표(방향 표기)의 **마지막 구간 각도**(도) — 도면 종횡비를 보정해서 스크린 기준으로 잰다.
 * `zoom=1, tx=ty=0` 가상 뷰포트로 두 점을 스크린 변환한 뒤 각도를 재는 방식이다 —
 * 실제 뷰포트(줌·팬)는 각도에 영향을 주지 않으므로(등방 확대·평행이동) 이걸로 충분하다.
 * 점이 1개뿐이면(비정상) null.
 */
export function arrowLastLegAngleDeg(points: readonly NPoint[], iw: number, ih: number): number | null {
  if (points.length < 2) return null;
  const vp: Viewport = { zoom: 1, tx: 0, ty: 0 };
  const a = toScreen(points[points.length - 2]!, vp, iw, ih);
  const b = toScreen(points[points.length - 1]!, vp, iw, ih);
  return angleDeg(a, b);
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
 * 번호 풍선이 원에서 **좌우로 더 늘어나야 하는 양**(한쪽, 같은 단위로 들어온 값 그대로).
 *
 * 풍선은 원래 고정 반지름 원이었고, 글자가 몇 자든 중앙에 그냥 찍었다. `1F-01` 같은
 * 층 접두어 번호는 원 밖으로 넘쳤다(검수 심각2). 이제 글자 폭에 맞춰 스타디움으로 늘린다.
 *
 * ⭐ **렌더 · 히트 · 자동배치가 전부 이 함수 하나를 쓴다.** 한 곳만 늘리면
 *    "그림은 넓은데 클릭은 안 잡히는" 경계면 버그가 난다.
 * ⭐ 1~2자리 숫자는 `0` 을 돌려준다 — 예전과 픽셀이 같다(회귀 없음).
 *
 * @param balloonR 풍선 반지름
 * @param fontSize 글자 크기 (`balloonR` 과 **같은 단위**여야 한다 — 둘 다 스크린 px 이거나 둘 다 이미지 px)
 */
export function balloonHalfExtra(label: string, balloonR: number, fontSize: number): number {
  if (label === '') return 0;
  const textW = estimateEm(label) * fontSize;
  const w = Math.max(balloonR * 2, textW + fontSize * BALLOON_TEXT_PAD_EM);
  return Math.max(0, w / 2 - balloonR);
}

/**
 * 자동 배치 위치 (B14) — 마크에서 `angleDeg` 방향(기본 우상단 45도), 거리 = 풍선 반지름 × 3.
 * 거리는 **이미지 px** 로 잰다. 정규화 공간에서 재면 종횡비 때문에 그 각도로 안 보인다.
 *
 * ARROW 는 방향이 이미 고정돼 있으므로(`Mark.geometry.angleDeg`) 그 방향을 넘겨 쓴다 —
 * 화살촉이 가리키는 방향과 다른 쪽에 번호가 뜨면 "그려진 선이 곧 지시선"이 깨진다.
 * 호출자가 안 넘기면 기본값(우상단 45도)을 쓴다(POINT · AREA_*).
 *
 * `halfExtraImg` — 풍선이 스타디움으로 늘어난 만큼(한쪽, 이미지 px) 가로로 더 밀어낸다.
 * 안 밀면 넓어진 풍선의 왼쪽 끝이 마크 위로 내려앉는다. 0(기본)이면 예전 좌표 그대로다.
 */
export function autoLabelNorm(
  anchor: NPoint,
  balloonRadiusImg: number,
  iw: number,
  ih: number,
  angleDegOverride?: number,
  halfExtraImg = 0,
): NPoint {
  const d = balloonRadiusImg * LABEL_AUTO_DIST_FACTOR;
  const a = radians(angleDegOverride ?? LABEL_AUTO_ANGLE_DEG);
  const cos = Math.cos(a);
  const dx = d * cos + halfExtraImg * Math.sign(cos || 1);
  return { x: anchor.x + dx / iw, y: anchor.y + (d * Math.sin(a)) / ih };
}

/**
 * 실제로 그려지는 라벨 중심. placed=false 면 자동 배치 위치를 쓴다.
 *
 * 방향(화살표) 결함은 마크가 정확히 1개일 때 **마지막 구간 방향으로 그대로 이어서**
 * 배치한다 — 그래야 번호로 이어지는 리더선이 화살표 몸통과 한 줄로 보인다(꺾여 보이지 않는다).
 * 마크가 여러 개(centroid 앵커)면 이 최적화를 포기하고 기본 각도(우상단 45도)를 쓴다.
 */
export function effectiveLabelNorm(
  defect: Defect,
  style: ResolvedStyle,
  iw: number,
  ih: number,
  /** 그릴 번호 문자열. 넘기면 넓어진 풍선만큼 더 밀어낸다(검수 심각2) */
  labelText = '',
): NPoint {
  if (defect.label.placed) return { x: defect.label.x, y: defect.label.y };
  const a = anchorNorm(defect);
  if (!a) return { x: defect.label.x, y: defect.label.y };
  let angleOverride: number | undefined;
  if (defect.marks.length === 1 && defect.marks[0]!.geometry.k === 'ARROW') {
    angleOverride = arrowLastLegAngleDeg(defect.marks[0]!.geometry.points, iw, ih) ?? undefined;
  }
  // 이미지 px 단위로 잰다 — `autoLabelNorm` 의 거리와 같은 단위여야 한다
  const extra = balloonHalfExtra(labelText, style.balloonRadius, style.fontSize);
  return autoLabelNorm(a, style.balloonRadius, iw, ih, angleOverride, extra);
}

export type MarkScreen = {
  id: string;
  type: MarkType;
  /** 리더선이 붙는 점 = `centerOfMark` 의 스크린 좌표 */
  center: SPoint;
  /** AREA_* — 외접 사각형(스크린). 그 외에는 null */
  rect: SRect | null;
  /** ARROW — 정점 전부(스크린, 꼬리→머리 순). 그 외에는 null */
  points: SPoint[] | null;
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
  /**
   * 번호 풍선이 원에서 좌우로 늘어난 양(한쪽, 스크린 px). 검수 심각2.
   *
   * `0` 이면 예전 그대로 반지름 `balloonR` 인 **원**이다. 0보다 크면 중심에서 좌우로
   * 이만큼 벌어진 **스타디움**이다. 렌더 · 히트 · 자동배치가 전부 이 값을 본다.
   * `buildScreens` 에 `displayNumbers` 를 안 넘기면 `0`(= 예전 동작).
   */
  labelHalfExtra: number;
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
  /** 이 결함에 그릴 번호 문자열. 풍선 폭 계산에만 쓴다. 생략하면 예전과 동일(원) */
  labelText = '',
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
      points: s.points,
      geometry: g,
    });
  }

  // 앵커는 미리보기가 반영된 좌표로 다시 계산해야 리더선이 마크를 따라간다
  const anchorN = anchorNorm({ ...defect, marks: patchedMarks });

  const labelN =
    p && p.label
      ? p.label
      : effectiveLabelNorm({ ...defect, marks: patchedMarks }, style, iw, ih, labelText);

  const sketch: SketchScreen[] = [];
  for (const path of sketchOf(defect)) {
    const pts = p && p.pathId === path.id && p.pathPoints ? p.pathPoints : path.points;
    sketch.push({
      id: path.id,
      points: pts.map((n) => toScreen(n, vp, iw, ih)),
      width: Math.max(1, (path.width || style.sketchWidth) * vp.zoom),
    });
  }

  const label = toScreen(labelN, vp, iw, ih);
  let anchor = anchorN ? toScreen(anchorN, vp, iw, ih) : null;

  // 영역(사각/타원) 결함 — 지시선은 도형 **중앙**이 아니라 라벨 쪽 테두리에 붙는다
  // (2026-08-24, 사용자 지적 — "지금은 영역 중앙점에 지시선 연결됨, 어색함").
  // 마크가 정확히 1개일 때만 적용한다 — 여러 마크가 얽힌 경우(centroid 앵커)는
  // 어느 도형 테두리를 기준으로 삼을지 모호해 손대지 않는다(§2-7-b 의 기본 규칙 유지).
  if (anchor && marks.length === 1) {
    const only = marks[0]!;
    if ((only.type === 'AREA_RECT' || only.type === 'AREA_ELLIPSE') && only.rect) {
      anchor = areaBoundaryPoint(only.rect, only.type, label);
    }
    // ARROW 는 여기서 손댈 것이 없다 — `only.points` 는 이미 실제로 그린 꺾은선이고,
    // 번호까지는 일반 리더선(leaderSegment)이 마지막 점에서부터 잇는다
  }

  // 렌더가 실제로 쓰는 값과 **같은 식**으로 잰다 (renderModel: br=max(4,balloonR), size=max(7,fontSize*zoom))
  const balloonR = style.balloonRadius * vp.zoom;
  const labelHalfExtra = balloonHalfExtra(
    labelText,
    Math.max(4, balloonR),
    Math.max(7, style.fontSize * vp.zoom),
  );

  return {
    defectId: defect.id,
    seq: defect.seq,
    label,
    anchor,
    marks,
    sketch,
    balloonR,
    labelHalfExtra,
    markR: style.markRadius * vp.zoom,
    style,
  };
}

/** 전회차 표기는 1차 범위에서 선택만 가능 (A8) */
export function isLocked(defect: Defect): boolean {
  return defect.status !== 'CURRENT';
}

/**
 * C-5 (D33) — 표기 종류(status)를 이 값으로 바꿀 수 있는가.
 *
 * 세 종류(신규 · 결함 · 보수완료)를 전부 열되 **막는 것은 하나뿐**이다:
 * `prevDefectId` 가 없는 결함을 전회차(`PREV_PENDING`)로 만드는 것.
 * 있지도 않은 전회차로 보내면 `includePrevPending=false` 로 뽑은 출력에서
 * 그 결함이 통째로 사라진다 (U43).
 *
 * ⚠️ **`isLocked` 를 보지 않는다.** 이 판정은 잠금의 *근거*(status)를 바꾸는 자리라
 * 잠금으로 막으면 한 번 바꾼 결함을 영영 되돌릴 수 없다(D33 "종류 변경만은 항상 활성").
 */
export function canSetStatus(
  defect: Pick<Defect, 'status' | 'prevDefectId'>,
  to: DefectStatus,
): boolean {
  if (defect.status === to) return false;
  return !(to === 'PREV_PENDING' && defect.prevDefectId === null);
}

/**
 * G-8 — 잠긴 결함이라도 **사진 추가 하나만은** 뚫어 준다.
 *
 * `isLocked`(A8)는 그대로 둔다. 값 편집·이동·삭제·스타일은 여전히 잠긴 채다.
 * 예외를 두는 이유는 상세기획 §Phase 2-D 의 *"촬영하는 순간 status = CURRENT, 보라 → 빨강"*
 * 때문이다 — 전이의 유일한 방아쇠가 사진인데 그 사진을 붙일 수 없으면 전이가 영원히 일어나지 않는다.
 * 사진이 실제로 붙는 순간 호출자가 `PREV_PENDING → CURRENT` 로 전이시킨다.
 *
 * `REPAIRED`(보수완료)는 **계속 막는다** — 지난 회차에 고쳤다고 표시한 결함을 사진으로
 * 되살리는 것은 이번 범위가 아니다.
 *
 * ⚠️ 이 함수는 "이번 회차에 새로 찍은 사진을 추가하는 것"만 허용한다.
 *    전회차 사진을 이번 용역으로 **복사해 오는 것**(사진 승계 · K13)과는 무관하다.
 */
export function canAddPhotos(defect: Defect): boolean {
  return defect.status === 'CURRENT' || defect.status === 'PREV_PENDING';
}

/** z-order: seq 오름차순, 동률이면 defectId 사전순 (§2-4 / §2-9-b) */
export function byZAscending(a: Defect, b: Defect): number {
  if (a.seq !== b.seq) return a.seq - b.seq;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
