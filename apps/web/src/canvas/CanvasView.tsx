/**
 * 캔버스 셸 — <canvas> 2장(배경/오버레이), DPR, ResizeObserver, 입력 배선.
 *
 * 2레이어 (§2-9-d):
 *   배경   = 도면 이미지 — 뷰포트가 바뀔 때만 다시 그린다
 *   오버레이 = 표기 전부 + 가이드 — 매 프레임
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  buildBackground,
  buildOverlay,
  buildScreens,
  previewOf,
  type CanvasState,
  type Defect,
  type GhostShape,
  type InputEvent,
  type MemoScreen,
  type RenderInput,
} from '@onspect/canvas-core';
import { DEFAULT_GLOBAL_STYLE } from '@onspect/canvas-core';
import { loadDrawing, cachedDrawing, type LoadedDrawing } from './imageLoader';
import { prepare, renderOps } from './renderCanvas2d';
import {
  contextMenu,
  doubleClick,
  isTypingTarget,
  pointerDown,
  pointerMove,
  pointerUp,
  wheel,
} from './pointerAdapter';

export type CanvasViewProps = {
  state: CanvasState;
  defects: Defect[];
  /** 메모 레이어. **결함이 아니다** (§S2a-1) */
  memoScreens: MemoScreen[];
  /** 생성 드래그 중인 도형 미리보기. 아직 문서에 없다 */
  ghost: GhostShape | null;
  displayNumbers: Record<string, string>;
  send: (ev: InputEvent) => void;
  drawingUrl: string | null;
  /** 도면 없는 층의 빈 상태에서 P4 로 보낸다 (§2-10-c) */
  onUploadDrawing: () => void;
  /** 메모 편집기 등 캔버스 위에 얹히는 것 */
  children?: React.ReactNode;
};

/** 떠 있는 UI 와 캔버스 사이의 최소 여백 */
const FLOAT_GAP_PX = 8;

type LoadState = { phase: 'idle' | 'loading' | 'ready' | 'error'; message?: string };

export function CanvasView({
  state,
  defects,
  memoScreens,
  ghost,
  displayNumbers,
  send,
  drawingUrl,
  onUploadDrawing,
  children,
}: CanvasViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const bgRef = useRef<HTMLCanvasElement | null>(null);
  const fgRef = useRef<HTMLCanvasElement | null>(null);
  const spaceRef = useRef(false);
  const [image, setImage] = useState<LoadedDrawing | null>(null);
  const [load, setLoad] = useState<LoadState>({ phase: 'idle' });
  const [reloadTick, setReloadTick] = useState(0);

  const drawing = state.drawing;

  // ── 도면 이미지 로드 ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!drawing || !drawingUrl) {
      setImage(null);
      setLoad({ phase: 'idle' });
      return;
    }
    // F5-3 — 같은 도면이라도 배율이 다르면 다른 합성 이미지다.
    // URL 을 캐시 키에 섞어 배율이 바뀌면 옛 래스터를 다시 쓰지 않게 한다
    const cacheKey = `${drawing.id}|${drawingUrl}`;
    const hit = cachedDrawing(cacheKey);
    if (hit) {
      setImage(hit);
      setLoad({ phase: 'ready' });
      return;
    }
    let alive = true;
    setImage(null);
    setLoad({ phase: 'loading' });
    loadDrawing(cacheKey, drawingUrl, drawing.imageWidth, drawing.imageHeight)
      .then((d) => {
        if (!alive) return;
        setImage(d);
        setLoad({ phase: 'ready' });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setImage(null);
        setLoad({ phase: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      alive = false;
    };
  }, [drawing?.id, drawingUrl, reloadTick]);

  // ── 크기 추적 + 안전 영역 실측 ───────────────────────────────────────────
  //
  // §2-10-a: 캔버스가 "쓸 수 있는 영역" 이 아니라 "요소 전체 크기" 를 기준으로 뷰포트를
  // 잡는 것이 알려진 버그 1의 근본 원인이었다. 떠 있는 UI(툴 팔레트 · 도움말 줄)를
  // **실측해서** 코어에 넣는다. 레이아웃 컬럼은 ResizeObserver 가 이미 처리한다 —
  // **둘 다 같은 안전 영역 계산에 흡수된다.**
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const measureInsets = () => {
      const hr = el.getBoundingClientRect();
      if (hr.width <= 0 || hr.height <= 0) return;
      const stage = el.parentElement;
      const insets = { top: 0, right: 0, bottom: 0, left: 0 };
      const floats = stage?.querySelectorAll<HTMLElement>('[data-floating]') ?? [];
      for (const f of floats) {
        const r = f.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        const ox = Math.min(hr.right, r.right) - Math.max(hr.left, r.left);
        const oy = Math.min(hr.bottom, r.bottom) - Math.max(hr.top, r.top);
        if (ox <= 0 || oy <= 0) continue; // 캔버스와 겹치지 않는다
        // 네 변 중 **가장 적게 잡아먹는 쪽**으로 물린다
        const cands: [keyof typeof insets, number][] = [
          ['left', r.right - hr.left + FLOAT_GAP_PX],
          ['right', hr.right - r.left + FLOAT_GAP_PX],
          ['top', r.bottom - hr.top + FLOAT_GAP_PX],
          ['bottom', hr.bottom - r.top + FLOAT_GAP_PX],
        ];
        cands.sort((a, b) => a[1] - b[1]);
        const [side, value] = cands[0]!;
        insets[side] = Math.max(insets[side], Math.round(value));
      }
      send({ k: 'SET_SAFE_INSETS', insets });
    };

    const ro = new ResizeObserver((entries) => {
      const box = entries.find((e) => e.target === el)?.contentRect;
      if (box) send({ k: 'RESIZE', size: { w: Math.round(box.width), h: Math.round(box.height) } });
      measureInsets();
    });
    ro.observe(el);
    const stage = el.parentElement;
    if (stage) ro.observe(stage);

    // 떠 있는 UI 가 늦게 붙거나(도구 팔레트 활성화) 사라질 때를 따라간다
    const mo = new MutationObserver(() => measureInsets());
    if (stage) mo.observe(stage, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });

    const raf = requestAnimationFrame(measureInsets);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
    };
  }, [send]);

  // ── 렌더 ─────────────────────────────────────────────────────────────────
  const renderInput = useCallback((): RenderInput | null => {
    if (!drawing) return null;
    return {
      drawing,
      viewport: state.viewport,
      canvas: state.canvas,
      defects,
      displayNumbers,
      globalStyle: DEFAULT_GLOBAL_STYLE,
      selection: state.selection,
      hover: state.hover,
      guides: state.guides,
      preview: previewOf(state),
      dragDefectId: state.drag?.defectId ?? null,
      memos: memoScreens,
      ghost,
    };
  }, [drawing, state, defects, displayNumbers, memoScreens, ghost]);

  // 배경 — 뷰포트/크기/이미지가 바뀔 때만
  useLayoutEffect(() => {
    const canvas = bgRef.current;
    const inp = renderInput();
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = prepare(canvas, state.canvas.w, state.canvas.h, dpr);
    if (!ctx || !inp) return;
    renderOps(ctx, buildBackground(inp), image);
  }, [
    state.viewport.zoom,
    state.viewport.tx,
    state.viewport.ty,
    state.canvas.w,
    state.canvas.h,
    image,
    drawing?.id,
  ]);

  // 오버레이 — 매 변경
  useLayoutEffect(() => {
    const canvas = fgRef.current;
    const inp = renderInput();
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = prepare(canvas, state.canvas.w, state.canvas.h, dpr);
    if (!ctx || !inp) return;
    const screens = buildScreens({
      drawing: inp.drawing,
      viewport: inp.viewport,
      defects: inp.defects,
      globalStyle: inp.globalStyle,
      preview: inp.preview,
    });
    renderOps(ctx, buildOverlay(inp, screens), image);
  }, [renderInput, image, state.canvas.w, state.canvas.h]);

  // ── 휠 (passive:false 로 브라우저 페이지 확대를 막는다) ──────────────────
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); // Ctrl+휠 브라우저 확대 차단
      send(wheel(el, e, spaceRef.current));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [send]);

  // ── 키보드 ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === ' ') {
        if (!spaceRef.current) {
          spaceRef.current = true;
          send({ k: 'KEY_DOWN', key: ' ', keys: keysFrom(e, true) });
        }
        e.preventDefault(); // 페이지 스크롤 방지
        return;
      }
      const handled = [
        'Escape', 'Delete', 'Backspace', '0', '+', '=', '-', '_',
      ].includes(e.key) || ((e.ctrlKey || e.metaKey) && 'zZyY'.includes(e.key));
      if (handled) e.preventDefault();
      send({ k: 'KEY_DOWN', key: e.key, keys: keysFrom(e, spaceRef.current) });
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') spaceRef.current = false;
      send({ k: 'KEY_UP', key: e.key, keys: keysFrom(e, spaceRef.current) });
    };
    const onBlur = () => {
      spaceRef.current = false;
      send({ k: 'KEY_UP', key: ' ', keys: { space: false, alt: false, shift: false, ctrl: false } });
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [send]);

  // ── 포인터 ───────────────────────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = hostRef.current;
    if (!el) return;
    if (e.button === 0 || e.button === 1) {
      // 합성 이벤트(자동화·테스트)로 들어오면 캡처가 실패할 수 있다. 조작 자체는 계속돼야 한다
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* 무시 */
      }
      if (e.button === 1) e.preventDefault(); // 중클릭 자동 스크롤 차단
    }
    el.focus({ preventScroll: true });
    send(pointerDown(el, e.nativeEvent, spaceRef.current));
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = hostRef.current;
    if (!el) return;
    send(pointerMove(el, e.nativeEvent, spaceRef.current));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = hostRef.current;
    if (!el) return;
    try {
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    } catch {
      /* 무시 */
    }
    send(pointerUp(el, e.nativeEvent, spaceRef.current));
  };

  const busy = load.phase === 'loading';

  return (
    <div
      ref={hostRef}
      className="canvas-host"
      tabIndex={0}
      role="application"
      aria-label="도면 캔버스"
      data-cursor={busy ? 'wait' : state.cursor}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={(e) => send({ k: 'POINTER_CANCEL', pointerId: e.pointerId })}
      onPointerLeave={() => send({ k: 'POINTER_LEAVE' })}
      onDoubleClick={(e) => {
        const el = hostRef.current;
        if (el) send(doubleClick(el, e.nativeEvent, spaceRef.current));
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        const el = hostRef.current;
        if (el) send(contextMenu(el, e.nativeEvent));
      }}
    >
      <canvas ref={bgRef} className="canvas-layer canvas-bg" aria-hidden="true" />
      <canvas ref={fgRef} className="canvas-layer canvas-fg" aria-hidden="true" />

      {/* `도면이 없습니다` 는 **여기 한 곳에만** 있다 (§2-10-c · 알려진 버그 3) */}
      {!drawing && (
        <div className="canvas-empty">
          <div className="canvas-empty__title">이 층에 등록된 도면이 없습니다</div>
          <p className="canvas-empty__body">
            도면을 올리면 이 자리에 평면도가 표시되고, 그 위에 결함을 찍을 수 있습니다.
          </p>
          <button type="button" className="btn btn--primary" onClick={onUploadDrawing}>
            이 층에 도면 올리기
          </button>
        </div>
      )}

      {load.phase === 'loading' && (
        <div className="canvas-skeleton" role="status" aria-live="polite">
          <div className="canvas-skeleton__sheet" />
          <span className="canvas-skeleton__text">도면을 불러오는 중…</span>
        </div>
      )}

      {load.phase === 'error' && (
        <div className="canvas-empty canvas-empty--error" role="alert">
          <div className="canvas-empty__title">도면을 불러오지 못했습니다</div>
          <p className="canvas-empty__body">{load.message}</p>
          <button type="button" className="btn btn--primary" onClick={() => setReloadTick((v) => v + 1)}>
            다시 시도
          </button>
        </div>
      )}

      {drawing && load.phase === 'ready' && defects.length === 0 && memoScreens.length === 0 && (
        <div className="canvas-hint" role="status">
          아직 입력된 결함이 없습니다 · 우측 <b>점</b> 도구를 켜고 도면을 클릭하세요
        </div>
      )}

      {children}
    </div>
  );
}

function keysFrom(e: KeyboardEvent, space: boolean) {
  return { space, alt: e.altKey, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
}
