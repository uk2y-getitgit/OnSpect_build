/**
 * 사진 주석 편집기 — PhotoPolish 스펙 §2-4.
 *
 * ⭐ **`canvas-core` 를 import 하지 않는다** (절대규칙 6). 포인터 처리는 로컬 구현이다.
 * ⭐ **되돌리기는 이 편집 세션 로컬 스택이다 — 캔버스 Undo 와 무관하다** (절대규칙 7).
 *    주석은 `[적용]` 을 눌러야 비로소 레코드에 반영된다. `[취소]` 는 통째 폐기이므로
 *    세션 밖으로 나가면 되돌릴 대상이 애초에 없다. 캔버스 Undo 스택에 섞으면
 *    "Ctrl+Z 를 눌렀는데 도면 결함이 사라진다" 는 최악의 혼선이 생긴다.
 * ⭐ **화살촉은 `<marker>` 가 아니라 `arrowHeadPoints()`(project-core 순수 함수)** 로 그린다 —
 *    화면 SVG 와 출력 Canvas(`photoCompose.drawAnnotations`)가 **같은 함수**를 쓰게 하려는 것이
 *    그 함수의 존재 이유다.
 * ⭐ 저장 좌표는 **렌더 프레임 0~1 정규화**(절대규칙 1). 조작은 표시 프레임에서 하고
 *    `[적용]` 직전에 `toSourcePoint` 로 되돌린다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ANNOTATION_COLORS,
  ANNOTATION_WIDTHS,
  ARROW_HEAD_RATIO,
  ROUND4,
  arrowHeadPoints,
  roundPoint,
  strokePx,
  toDisplayPoint,
  toDisplayRect,
  toSourcePoint,
  type AnnotationColorKey,
  type AnnotationWidthKey,
  type Photo,
  type PhotoAnnotation,
  type PhotoRotate,
  type Pt,
} from '@onspect/project-core';
import {
  EditStage,
  distToSegment,
  normPoint,
  useRotatedFrame,
  type StageSize,
} from './photoStage';

/** 되돌리기 스택 상한 (§2-4) */
export const ANNOTATE_UNDO_MAX = 50;
/** 자유획: 직전 점에서 이만큼 움직였을 때만 점을 넣는다 */
export const STROKE_MIN_STEP = 0.004;
/** 한 획 최대 점 수 — 레코드가 무한히 커지지 않게 한다 */
export const STROKE_MAX_POINTS = 400;
/** 이보다 짧은 화살표는 오클릭으로 보고 버린다 */
export const ARROW_MIN_LEN = 0.01;
/** 지우개 히트 반경 — **화면 기준 px** */
export const ERASER_HIT_PX = 12;

type Tool = 'STROKE' | 'ARROW' | 'ERASER';

const TOOLS: { id: Tool; label: string; title: string }[] = [
  { id: 'STROKE', label: '자유획', title: '드래그해서 선을 그립니다' },
  { id: 'ARROW', label: '화살표', title: '누른 곳에서 뗀 곳으로 화살표를 그립니다' },
  { id: 'ERASER', label: '지우개', title: '클릭한 곳의 주석 하나를 통째로 지웁니다' },
];

const WIDTH_KEYS: { id: AnnotationWidthKey; label: string }[] = [
  { id: 'THIN', label: '얇게' },
  { id: 'NORMAL', label: '보통' },
  { id: 'THICK', label: '굵게' },
];

const COLOR_KEYS: { id: AnnotationColorKey; label: string }[] = [
  { id: 'RED', label: '빨강' },
  { id: 'YELLOW', label: '노랑' },
];

export type PhotoAnnotateEditorProps = {
  photo: Photo;
  /** 렌더본 objectURL — 자르기 전 · 주석 없는 원본이다 */
  url: string | null;
  disabled: boolean;
  /** 렌더 프레임 정규화 주석 배열로 **통째 교체**한다 */
  onApply: (annotations: PhotoAnnotation[]) => void;
  onCancel: () => void;
};

export function PhotoAnnotateEditor({
  photo,
  url,
  disabled,
  onApply,
  onCancel,
}: PhotoAnnotateEditorProps) {
  const rotate = photo.edits.rotate;
  const frame = useRotatedFrame(url, rotate);

  // 기존 주석은 **표시 프레임으로 변환해** 들고 있는다 (§2-4)
  const [anns, setAnns] = useState<PhotoAnnotation[]>(() => toDisplayAll(photo.annotations, rotate));
  const [undo, setUndo] = useState<PhotoAnnotation[][]>([]);
  const [tool, setTool] = useState<Tool>('ARROW');
  const [colorKey, setColorKey] = useState<AnnotationColorKey>('RED');
  const [widthKey, setWidthKey] = useState<AnnotationWidthKey>('NORMAL');
  const [draft, setDraft] = useState<PhotoAnnotation | null>(null);

  // ⚠️ 의존성은 **`photo.id` 하나뿐**이다 — 배열 참조를 넣으면 부모가 다시 그릴 때마다
  //    그리던 주석이 초기값으로 튕긴다
  useEffect(() => {
    setAnns(toDisplayAll(photo.annotations, rotate));
    setUndo([]);
    setDraft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo.id]);

  const color = ANNOTATION_COLORS[colorKey];
  const width = ANNOTATION_WIDTHS[widthKey];

  /** 바꾸기 전 상태를 스택에 쌓는다 (최대 50) */
  const push = useCallback((prev: readonly PhotoAnnotation[]) => {
    setUndo((s) => [...s, [...prev]].slice(-ANNOTATE_UNDO_MAX));
  }, []);

  const annsRef = useRef(anns);
  annsRef.current = anns;

  const doUndo = useCallback(() => {
    setUndo((s) => {
      if (s.length === 0) return s;
      const last = s[s.length - 1]!;
      setAnns(last);
      setDraft(null);
      return s.slice(0, -1);
    });
  }, []);

  const clearAll = useCallback(() => {
    if (annsRef.current.length === 0) return;
    push(annsRef.current);
    setAnns([]);
    setDraft(null);
  }, [push]);

  const apply = useCallback(() => {
    if (disabled) return;
    // ⚠️ 버튼은 `disabled={!frame.ready}` 로 막혀 있지만 **`Enter` 단축키는 그 가드를 안 거친다.**
    //    준비 전에는 좌표가 초기값이라 같은 내용을 다시 쓰는 무의미한 IDB 쓰기가 나간다.
    if (!frame.ready) return;
    onApply(toSourceAll(annsRef.current, rotate));
  }, [disabled, frame.ready, onApply, rotate]);

  // ── 키보드 ──────────────────────────────────────────────────────────────
  // `PhotoPreviewDialog` 가 캔버스 단축키를 이미 막고 있고, 이 핸들러는 그다음에 돈다.
  // **Ctrl+Z 는 여기서 로컬 undo 로 연결된다** — 캔버스 히스토리로 새지 않는다 (§2-4).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === 'Enter') {
        e.stopPropagation();
        e.preventDefault();
        apply();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.stopPropagation();
        e.preventDefault();
        doUndo();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [apply, doUndo, onCancel]);

  // ── 포인터 ──────────────────────────────────────────────────────────────
  const idSeed = useRef(0);
  const newId = () => `a-${Date.now().toString(36)}-${(idSeed.current += 1)}`;

  const onPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    boxEl: HTMLDivElement | null,
    box: StageSize,
  ) => {
    if (disabled || !frame.ready) return;
    e.preventDefault();
    const p = normPoint(boxEl, e.clientX, e.clientY);

    if (tool === 'ERASER') {
      const hit = nearestAnnotation(anns, p, box, ERASER_HIT_PX);
      if (hit === null) return;
      push(anns);
      setAnns(anns.filter((a) => a.id !== hit));
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    setDraft(
      tool === 'STROKE'
        ? { k: 'STROKE', id: newId(), points: [p], color, width }
        : { k: 'ARROW', id: newId(), from: p, to: p, color, width },
    );
  };

  const onPointerMove = (
    e: React.PointerEvent<HTMLDivElement>,
    boxEl: HTMLDivElement | null,
  ) => {
    if (!draft) return;
    const p = normPoint(boxEl, e.clientX, e.clientY);
    setDraft((d) => {
      if (!d) return d;
      if (d.k === 'ARROW') return { ...d, to: p };
      const last = d.points[d.points.length - 1]!;
      // 직전 점에서 충분히 움직였을 때만 점을 넣는다 — 안 그러면 한 획이 수천 점이 된다
      if (d.points.length >= STROKE_MAX_POINTS) return d;
      if (Math.hypot(p.x - last.x, p.y - last.y) < STROKE_MIN_STEP) return d;
      return { ...d, points: [...d.points, p] };
    });
  };

  const releaseCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  /**
   * ⚠️ `pointercancel` 은 **확정이 아니다** — 브라우저가 제스처를 가져간 것이므로
   * 그리던 획을 버린다. 확정은 `pointerup` 하나뿐이다 (§2-4 "up = 확정").
   */
  const cancelDraw = (e: React.PointerEvent<HTMLDivElement>) => {
    releaseCapture(e);
    setDraft(null);
  };

  const endDraw = (e: React.PointerEvent<HTMLDivElement>) => {
    releaseCapture(e);
    const d = draft;
    setDraft(null);
    if (!d) return;
    if (d.k === 'STROKE') {
      if (d.points.length < 2) return; // 점 하나짜리 획은 버린다
    } else if (Math.hypot(d.to.x - d.from.x, d.to.y - d.from.y) < ARROW_MIN_LEN) {
      return; // 오클릭
    }
    push(anns);
    setAnns([...anns, d]);
  };

  // ── 표시 ────────────────────────────────────────────────────────────────
  const shown = useMemo(() => (draft ? [...anns, draft] : anns), [anns, draft]);

  /**
   * ⚠️ **자르기 경계 표시.** 편집은 자르기 전 전체 프레임 위에서 하지만(§2-1), 출력 합성은
   * `주석 → 자르기 → 회전` 이라 **자르기 밖에 그린 획은 인쇄에서 사라진다**(§2-2).
   * 경계가 안 보이면 사용자에게는 "주석이 안 먹었다" 로 보인다 — 그리는 동안 보여준다.
   * 자르기 편집기와 **같은 `.cropRect`**(바깥을 어둡게 하는 box-shadow) 를 재사용하고,
   * 여기서는 조작 대상이 아니므로 `pointer-events:none` 으로 깐다.
   */
  const cropView = useMemo(
    () => (photo.edits.crop ? toDisplayRect(photo.edits.crop, rotate) : null),
    [photo.edits.crop, rotate],
  );

  return (
    <div className="photoEdit">
      <EditStage frame={frame} alt={photo.fileName}>
        {(box, boxEl) => (
          <div
            className={`photoEdit__overlay photoEdit__overlay--${tool === 'ERASER' ? 'erase' : 'draw'}`}
            onPointerDown={(e) => onPointerDown(e, boxEl, box)}
            onPointerMove={(e) => onPointerMove(e, boxEl)}
            onPointerUp={endDraw}
            onPointerCancel={cancelDraw}
            role="presentation"
          >
            {/* ⚠️ `preserveAspectRatio="none"` 을 쓰지 않는다 — 종횡비가 다르면 축마다
                획 굵기가 달라진다. viewBox 를 표시 픽셀에 정확히 맞춘다 (§2-4) */}
            <svg
              className="photoEdit__svg"
              viewBox={`0 0 ${box.w} ${box.h}`}
              width={box.w}
              height={box.h}
              aria-hidden="true"
            >
              {shown.map((a) => (
                <AnnotationShape key={a.id} a={a} w={box.w} h={box.h} />
              ))}
            </svg>
            {/* 잘려 나갈 영역을 어둡게 — 획 위에 겹치되 포인터는 통과시킨다 */}
            {cropView && (
              <div
                className="cropRect"
                style={{
                  left: `${cropView.x * 100}%`,
                  top: `${cropView.y * 100}%`,
                  width: `${cropView.w * 100}%`,
                  height: `${cropView.h * 100}%`,
                  pointerEvents: 'none',
                }}
                aria-hidden="true"
              />
            )}
          </div>
        )}
      </EditStage>

      <div className="photoEdit__tools">
        <div className="photoEdit__group" role="group" aria-label="도구">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`btn btn--small${tool === t.id ? ' is-on' : ''}`}
              aria-pressed={tool === t.id}
              title={t.title}
              onClick={() => setTool(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="photoEdit__group" role="group" aria-label="색">
          {COLOR_KEYS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`annColor${colorKey === c.id ? ' is-on' : ''}`}
              style={{ background: ANNOTATION_COLORS[c.id] }}
              aria-pressed={colorKey === c.id}
              aria-label={c.label}
              title={c.label}
              onClick={() => setColorKey(c.id)}
            />
          ))}
        </div>
        <div className="photoEdit__group" role="group" aria-label="굵기">
          {WIDTH_KEYS.map((w) => (
            <button
              key={w.id}
              type="button"
              className={`btn btn--small${widthKey === w.id ? ' is-on' : ''}`}
              aria-pressed={widthKey === w.id}
              onClick={() => setWidthKey(w.id)}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <footer className="photoEdit__bar">
        <span className="photoEdit__hint">
          주석 {anns.length}개 · <b>Ctrl+Z</b> 되돌리기(이 창 안에서만) · <b>Esc</b> 취소
          {cropView && ' · 어두운 영역은 자르기로 잘려 나갑니다'}
        </span>
        <span className="photoView__spacer" />
        <button
          type="button"
          className="btn btn--small"
          onClick={doUndo}
          disabled={disabled || undo.length === 0}
        >
          실행취소
        </button>
        <button
          type="button"
          className="btn btn--small"
          onClick={clearAll}
          disabled={disabled || anns.length === 0}
        >
          모두 지우기
        </button>
        <button type="button" className="btn btn--small" onClick={onCancel}>
          취소
        </button>
        <button
          type="button"
          className="btn btn--small btn--primary"
          onClick={apply}
          disabled={disabled || !frame.ready}
        >
          적용
        </button>
      </footer>
    </div>
  );
}

// ── 그리기 ─────────────────────────────────────────────────────────────────
function AnnotationShape({ a, w, h }: { a: PhotoAnnotation; w: number; h: number }) {
  const lw = strokePx(a.width, w, h);
  if (a.k === 'STROKE') {
    if (a.points.length < 2) return null;
    return (
      <polyline
        points={a.points.map((p) => `${p.x * w},${p.y * h}`).join(' ')}
        fill="none"
        stroke={a.color}
        strokeWidth={lw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }
  const from = { x: a.from.x * w, y: a.from.y * h };
  const to = { x: a.to.x * w, y: a.to.y * h };
  const [h1, h2] = arrowHeadPoints(from, to, lw * ARROW_HEAD_RATIO);
  return (
    <g fill="none" stroke={a.color} strokeWidth={lw} strokeLinecap="round" strokeLinejoin="round">
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
      <polyline points={`${h1.x},${h1.y} ${to.x},${to.y} ${h2.x},${h2.y}`} />
    </g>
  );
}

// ── 순수 보조 ──────────────────────────────────────────────────────────────
/** 렌더 프레임 → 표시 프레임 (편집기를 열 때) */
export function toDisplayAll(
  list: readonly PhotoAnnotation[] | undefined,
  rotate: PhotoRotate,
): PhotoAnnotation[] {
  return (list ?? []).map((a) =>
    a.k === 'STROKE'
      ? { ...a, points: a.points.map((p) => toDisplayPoint(p, rotate)) }
      : { ...a, from: toDisplayPoint(a.from, rotate), to: toDisplayPoint(a.to, rotate) },
  );
}

/** 표시 프레임 → 렌더 프레임 + `ROUND4` (저장 직전) */
export function toSourceAll(
  list: readonly PhotoAnnotation[],
  rotate: PhotoRotate,
): PhotoAnnotation[] {
  return list.map((a) =>
    a.k === 'STROKE'
      ? {
          ...a,
          points: a.points.map((p) => roundPoint(toSourcePoint(p, rotate))),
          width: ROUND4(a.width),
        }
      : {
          ...a,
          from: roundPoint(toSourcePoint(a.from, rotate)),
          to: roundPoint(toSourcePoint(a.to, rotate)),
          width: ROUND4(a.width),
        },
  );
}

/**
 * 클릭 지점에서 **화면 기준 `hitPx`** 안의 가장 가까운 주석 id.
 * 획의 일부가 아니라 **1개를 통째로** 지우는 지우개다(벡터 배열이라 부분 삭제는 자료구조가 다르다).
 */
export function nearestAnnotation(
  list: readonly PhotoAnnotation[],
  p: Pt,
  box: { w: number; h: number },
  hitPx: number,
): string | null {
  if (box.w <= 0 || box.h <= 0) return null;
  const q = { x: p.x * box.w, y: p.y * box.h };
  const px = (t: Pt): Pt => ({ x: t.x * box.w, y: t.y * box.h });

  let best: string | null = null;
  let bestD = hitPx;
  for (const a of list) {
    let d = Infinity;
    if (a.k === 'ARROW') {
      d = distToSegment(q, px(a.from), px(a.to));
    } else if (a.points.length === 1) {
      const only = px(a.points[0]!);
      d = Math.hypot(q.x - only.x, q.y - only.y);
    } else {
      for (let i = 1; i < a.points.length; i += 1) {
        d = Math.min(d, distToSegment(q, px(a.points[i - 1]!), px(a.points[i]!)));
      }
    }
    if (d <= bestD) {
      bestD = d;
      best = a.id;
    }
  }
  return best;
}
