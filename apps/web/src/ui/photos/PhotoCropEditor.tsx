/**
 * 사진 자르기 편집기 — PhotoPolish 스펙 §2-3.
 *
 * ⭐ **새 창을 띄우지 않는다.** `PhotoPreviewDialog` 본문이 편집 모드로 바뀌는 형태다
 *    (사진 미리보기 자체가 이미 모달이다).
 * ⭐ **`canvas-core` 를 import 하지 않는다** (절대규칙 6). 포인터 처리는 로컬 구현이다.
 * ⭐ **저장 좌표는 렌더 프레임 0~1 정규화**다 (절대규칙 1 · 불변식 #1과 같은 이유).
 *    화면 조작은 표시 프레임(회전 적용)에서 하고, `[적용]` 직전에 `toSourceRect` 로 되돌린다.
 *
 * 조작
 * | 제스처 | 동작 |
 * |---|---|
 * | 사각형 **안쪽** 드래그 | 이동 (0~1 클램프, 크기 유지) |
 * | **8핸들** 드래그 | 모서리 4 + 변 4 리사이즈 |
 * | 사각형 **바깥** 드래그 | 새 사각형 |
 * | `Esc` / `Enter` | 취소 / 적용 |
 * | 방향키(+`Shift`) | 1% / 5% 이동 |
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CROP_MIN_SIZE,
  isFullRect,
  roundRect,
  toDisplayRect,
  toSourceRect,
  type Photo,
  type PhotoEdits,
  type Pt,
  type Rect,
} from '@onspect/project-core';
import { EditStage, normPoint, useRotatedFrame, type StageSize } from './photoStage';

/** 핸들 히트 반경(px). 시각 12px 보다 넉넉히 잡아 태블릿에서도 잡힌다 (§2-3) */
const HANDLE_HIT_PX = 10;

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
type HandleId = (typeof HANDLES)[number];

const FULL_RECT: Rect = { x: 0, y: 0, w: 1, h: 1 };

type Drag =
  | { mode: 'MOVE'; start: Pt; from: Rect }
  | { mode: 'RESIZE'; handle: HandleId; from: Rect }
  | { mode: 'NEW'; anchor: Pt };

export type PhotoCropEditorProps = {
  photo: Photo;
  /** 렌더본 objectURL — 자르기 전 · 주석 없는 원본이다 */
  url: string | null;
  /** 전회차 잠금 */
  disabled: boolean;
  /** 렌더 프레임 정규화 사각형. 해제는 `null` */
  onApply: (crop: PhotoEdits['crop']) => void;
  onCancel: () => void;
};

export function PhotoCropEditor({ photo, url, disabled, onApply, onCancel }: PhotoCropEditorProps) {
  const rotate = photo.edits.rotate;
  const frame = useRotatedFrame(url, rotate);

  // 표시 프레임 사각형. 자른 적이 없으면 전체다 — 다시 열면 직전 사각형이 그대로 뜬다
  const [rect, setRect] = useState<Rect>(() =>
    photo.edits.crop ? toDisplayRect(photo.edits.crop, rotate) : FULL_RECT,
  );
  const [drag, setDrag] = useState<Drag | null>(null);

  // 사진이 바뀌면 사각형을 다시 잡는다 (다이얼로그가 편집 중 사진 전환을 막지만 이중 방어).
  // ⚠️ 의존성은 **`photo.id` 하나뿐**이다 — `edits` 객체 참조를 넣으면 부모가 다시 그릴 때마다
  //    드래그 중인 사각형이 초기값으로 튕긴다.
  useEffect(() => {
    setRect(photo.edits.crop ? toDisplayRect(photo.edits.crop, rotate) : FULL_RECT);
    setDrag(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo.id]);

  // ── 적용·취소 ───────────────────────────────────────────────────────────
  const rectRef = useRef(rect);
  rectRef.current = rect;

  const apply = useCallback(() => {
    if (disabled) return;
    const r = rectRef.current;
    // 사실상 전체면 자르기를 저장하지 않는다 — 미세 오차가 남아 "✎" 배지가 뜨는 것을 막는다
    if (isFullRect(r)) {
      onApply(null);
      return;
    }
    onApply(roundRect(toSourceRect(r, rotate)));
  }, [disabled, onApply, rotate]);

  const clear = useCallback(() => {
    if (disabled) return;
    onApply(null);
  }, [disabled, onApply]);

  // ── 키보드 ──────────────────────────────────────────────────────────────
  // ⚠️ capture 로 window 에 건다. `PhotoPreviewDialog` 가 캔버스 단축키를 이미 막고 있고,
  //    이 핸들러는 그다음에 돈다(`stopPropagation` 은 같은 대상의 다른 리스너를 막지 않는다).
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
      const step = e.shiftKey ? 0.05 : 0.01;
      const d =
        e.key === 'ArrowLeft'
          ? { x: -step, y: 0 }
          : e.key === 'ArrowRight'
            ? { x: step, y: 0 }
            : e.key === 'ArrowUp'
              ? { x: 0, y: -step }
              : e.key === 'ArrowDown'
                ? { x: 0, y: step }
                : null;
      if (!d) return;
      e.stopPropagation();
      e.preventDefault();
      setRect((r) => ({
        ...r,
        x: clamp(r.x + d.x, 0, 1 - r.w),
        y: clamp(r.y + d.y, 0, 1 - r.h),
      }));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [apply, onCancel]);

  // ── 포인터 ──────────────────────────────────────────────────────────────
  const onPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    boxEl: HTMLDivElement | null,
    box: StageSize,
  ) => {
    if (disabled || !frame.ready) return;
    e.preventDefault();
    const p = normPoint(boxEl, e.clientX, e.clientY);
    const handle = hitHandle(rect, p, box);
    e.currentTarget.setPointerCapture(e.pointerId);
    // ⚠️ 사각형이 **전체**면 "바깥" 이 존재하지 않는다 — 그대로 두면 처음 열었을 때
    //    (자른 적이 없어 전체인 상태) 새 사각형을 그릴 방법이 사라진다.
    //    전체일 때는 옮길 것도 없으므로 안쪽 드래그를 **새로 그리기**로 돌린다.
    const movable = inside(rect, p) && !isFullRect(rect);
    if (handle) setDrag({ mode: 'RESIZE', handle, from: rect });
    else if (movable) setDrag({ mode: 'MOVE', start: p, from: rect });
    else {
      setDrag({ mode: 'NEW', anchor: p });
      // ⚠️ `rectFromDrag` 로 만든다 — 오른쪽·아래 끝을 눌렀을 때 `x+w > 1` 인 사각형이
      //    남지 않게 클램프까지 한 번에 처리한다(끌지 않고 클릭만 해도 유효해야 한다)
      setRect(rectFromDrag(p, p));
    }
  };

  const onPointerMove = (
    e: React.PointerEvent<HTMLDivElement>,
    boxEl: HTMLDivElement | null,
  ) => {
    if (!drag) return;
    const p = normPoint(boxEl, e.clientX, e.clientY);
    if (drag.mode === 'MOVE') {
      const f = drag.from;
      setRect({
        x: clamp(f.x + (p.x - drag.start.x), 0, 1 - f.w),
        y: clamp(f.y + (p.y - drag.start.y), 0, 1 - f.h),
        w: f.w,
        h: f.h,
      });
      return;
    }
    if (drag.mode === 'RESIZE') {
      setRect(resizeRect(drag.from, drag.handle, p));
      return;
    }
    setRect(rectFromDrag(drag.anchor, p));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDrag(null);
  };

  // ── 표시 ────────────────────────────────────────────────────────────────
  // 잘릴 실제 픽셀 수 — **렌더 프레임 기준**(계측 도구다운 표시, §2-3)
  const src = toSourceRect(rect, rotate);
  const px = `${Math.max(1, Math.round(src.w * photo.width))}×${Math.max(1, Math.round(src.h * photo.height))}`;
  const pct = `${Math.round(rect.w * 100)}% × ${Math.round(rect.h * 100)}%`;

  return (
    <div className="photoEdit">
      <EditStage frame={frame} alt={photo.fileName}>
        {(box, boxEl) => (
          <>
            <div
              className="photoEdit__overlay"
              onPointerDown={(e) => onPointerDown(e, boxEl, box)}
              onPointerMove={(e) => onPointerMove(e, boxEl)}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              role="presentation"
            >
              <div
                className="cropRect"
                style={{
                  left: `${rect.x * 100}%`,
                  top: `${rect.y * 100}%`,
                  width: `${rect.w * 100}%`,
                  height: `${rect.h * 100}%`,
                }}
              >
                <span className="cropRect__g cropRect__g--v1" />
                <span className="cropRect__g cropRect__g--v2" />
                <span className="cropRect__g cropRect__g--h1" />
                <span className="cropRect__g cropRect__g--h2" />
                {HANDLES.map((h) => (
                  <span key={h} className={`cropRect__h cropRect__h--${h}`} />
                ))}
              </div>
            </div>
            <span className="photoEdit__readout num">{px}</span>
          </>
        )}
      </EditStage>

      <footer className="photoEdit__bar">
        <span className="photoEdit__hint">
          드래그 = 새로 지정 · 안쪽 드래그 = 이동 · 모서리·변 = 크기 · <b>Enter</b> 적용 ·{' '}
          <b>Esc</b> 취소
        </span>
        <span className="photoEdit__size num">{pct}</span>
        <span className="photoView__spacer" />
        <button
          type="button"
          className="btn btn--small"
          onClick={clear}
          disabled={disabled || photo.edits.crop === null}
          title="저장된 자르기를 지웁니다"
        >
          자르기 해제
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

// ── 순수 보조 ──────────────────────────────────────────────────────────────
function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

function inside(r: Rect, p: Pt): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/** 히트 영역은 **px 기준**이다 — 정규화로 재면 세로로 긴 사진에서 축마다 달라진다 */
function hitHandle(r: Rect, p: Pt, box: { w: number; h: number }): HandleId | null {
  if (box.w <= 0 || box.h <= 0) return null;
  const px = p.x * box.w;
  const py = p.y * box.h;
  let best: HandleId | null = null;
  let bestD = HANDLE_HIT_PX;
  for (const h of HANDLES) {
    const c = handleCenter(r, h);
    const d = Math.hypot(px - c.x * box.w, py - c.y * box.h);
    if (d <= bestD) {
      bestD = d;
      best = h;
    }
  }
  return best;
}

function handleCenter(r: Rect, h: HandleId): Pt {
  const cx = h.includes('w') ? r.x : h.includes('e') ? r.x + r.w : r.x + r.w / 2;
  const cy = h.includes('n') ? r.y : h.includes('s') ? r.y + r.h : r.y + r.h / 2;
  return { x: cx, y: cy };
}

/** 최소 크기 `CROP_MIN_SIZE` 를 지키며 변을 민다. 그보다 작게 끌면 멈춘다 */
export function resizeRect(from: Rect, h: HandleId, p: Pt): Rect {
  let l = from.x;
  let t = from.y;
  let rgt = from.x + from.w;
  let bot = from.y + from.h;
  if (h.includes('w')) l = clamp(p.x, 0, rgt - CROP_MIN_SIZE);
  if (h.includes('e')) rgt = clamp(p.x, l + CROP_MIN_SIZE, 1);
  if (h.includes('n')) t = clamp(p.y, 0, bot - CROP_MIN_SIZE);
  if (h.includes('s')) bot = clamp(p.y, t + CROP_MIN_SIZE, 1);
  return { x: l, y: t, w: rgt - l, h: bot - t };
}

/** 바깥 드래그로 그리는 새 사각형. 반대 방향으로 끌어도 정상화된다 */
export function rectFromDrag(a: Pt, b: Pt): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.max(CROP_MIN_SIZE, Math.abs(b.x - a.x));
  const h = Math.max(CROP_MIN_SIZE, Math.abs(b.y - a.y));
  return {
    x: clamp(x, 0, 1 - w),
    y: clamp(y, 0, 1 - h),
    w,
    h,
  };
}
