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
  inkSessionOf,
  previewOf,
  type CanvasState,
  type Defect,
  type GhostShape,
  type GlobalStyle,
  type InputEvent,
  type MemoScreen,
  type LegendConfig,
  type RenderInput,
  type TitleBlockConfig,
} from '@onspect/canvas-core';
import { DEFAULT_GLOBAL_STYLE } from '@onspect/canvas-core';
import { loadDrawing, cachedDrawing, type LoadedDrawing } from './imageLoader';
import { prepare, renderOps } from './renderCanvas2d';
import {
  contextMenu,
  doubleClick,
  isTypingTarget,
  pinchMove,
  pinchSample,
  pointerDown,
  pointerMove,
  pointerUp,
  sameTouchPair,
  wheel,
  type PinchSample,
} from './pointerAdapter';

export type CanvasViewProps = {
  state: CanvasState;
  defects: Defect[];
  /** 메모 레이어. **결함이 아니다** (§S2a-1) */
  memoScreens: MemoScreen[];
  /** 생성 드래그 중인 도형 미리보기. 아직 문서에 없다 */
  ghost: GhostShape | null;
  /** F2 — 사후연결 대기 중인 자유그리기. 점선으로 그려진다 */
  pending: GhostShape[];
  displayNumbers: Record<string, string>;
  /** F5-1 도곽. null = 그리지 않는다 */
  titleBlock: TitleBlockConfig | null;
  /** F5-2 범례. null = 그리지 않는다 */
  legend: LegendConfig | null;
  /** F6 — 번호 풍선 크기 등 전역 렌더 스타일. 생략하면 `DEFAULT_GLOBAL_STYLE` */
  globalStyle?: GlobalStyle;
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
  pending,
  displayNumbers,
  titleBlock,
  legend,
  globalStyle = DEFAULT_GLOBAL_STYLE,
  send,
  drawingUrl,
  onUploadDrawing,
  children,
}: CanvasViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const bgRef = useRef<HTMLCanvasElement | null>(null);
  const fgRef = useRef<HTMLCanvasElement | null>(null);
  const spaceRef = useRef(false);
  /**
   * T-2 — 진행 중인 핀치. `active` 인 동안에는 포인터 이벤트를 코어로 넘기지 않는다.
   * (두 손가락은 "그리기" 가 아니라 항상 "화면 조작" 이다 — interaction.ts Phase 5 T3)
   */
  const pinchRef = useRef<{ active: boolean; last: PinchSample | null }>({
    active: false,
    last: null,
  });
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
      globalStyle,
      selection: state.selection,
      hover: state.hover,
      guides: state.guides,
      preview: previewOf(state),
      // T-1 — 필기 중에는 메모 점선 상자를 숨긴다. 판정은 코어(순수 함수)가 한다
      inkSession: inkSessionOf(state),
      dragDefectId: state.drag?.defectId ?? null,
      memos: memoScreens,
      ghost,
      pending,
      titleBlock,
      legend,
    };
  }, [
    drawing,
    state,
    defects,
    displayNumbers,
    memoScreens,
    ghost,
    pending,
    titleBlock,
    legend,
    globalStyle,
  ]);

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
    titleBlock,
    legend,
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
      // 번호가 길면 풍선이 좌우로 늘어난다 — 히트 테스트도 같은 값을 본다 (검수 심각2)
      displayNumbers: inp.displayNumbers,
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

  // ── T-2 핀치 (두 손가락) ─────────────────────────────────────────────────
  //
  // **왜 PointerEvent 가 아니라 TouchEvent 인가:** 포인터 이벤트는 손가락마다 별개의
  // pointerId 로 따로 들어올 뿐, "두 접점의 중점과 거리" 는 어차피 앱이 직접 모아
  // 계산해야 한다. TouchEvent 는 `e.touches` 로 **한 이벤트 안에 현재 접점 전부**를
  // 주므로 두 손가락을 짝지어 추적하는 코드가 훨씬 짧고 어긋날 여지가 없다.
  //
  // 계산 결과는 코어의 `GESTURE_PINCH_*` 로만 넘긴다 — 줌/팬 수학·클램프는 전부
  // 코어에 이미 있고 테스트도 돼 있다(phase5TrackA A1). 여기서 새로 만들지 않는다.
  //
  // `passive:false` — iPadOS 는 두 손가락을 페이지 확대/스크롤로 가로챈다.
  // `.canvas-host { touch-action: none }` 만으로 안 잡히는 경우가 있어 명시적으로 막는다.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const endPinch = () => {
      if (!pinchRef.current.active) return;
      pinchRef.current = { active: false, last: null };
      send({ k: 'GESTURE_PINCH_END' });
    };

    const onTouchStart = (e: TouchEvent) => {
      // 한 손가락은 기존 그대로 — pointerdown 이 그리기·팬을 이미 시작했다
      if (e.touches.length < 2) return;
      const s = pinchSample(el, e.touches);
      if (!s) return;
      e.preventDefault();
      if (!pinchRef.current.active) {
        pinchRef.current = { active: true, last: s };
        // 코어가 진행 중이던 한 손가락 드래그를 롤백한다 (T3 와 같은 규칙)
        send({ k: 'GESTURE_PINCH_START', center: s.center });
        return;
      }
      // 이미 핀치 중인데 손가락이 더 얹혔다 → 추적 쌍이 바뀔 수 있으니 기준만 다시 잡는다
      pinchRef.current.last = s;
    };

    const onTouchMove = (e: TouchEvent) => {
      const st = pinchRef.current;
      if (!st.active) return;
      e.preventDefault();
      if (e.touches.length < 2) return;
      const s = pinchSample(el, e.touches);
      if (!s) return;
      const prev = st.last;
      // 추적하던 두 손가락이 아니면 상대값이 순간이동한다 — 이 프레임은 기준 갱신만
      if (!prev || !sameTouchPair(prev, s)) {
        st.last = s;
        return;
      }
      st.last = s;
      send(pinchMove(prev, s));
    };

    const onTouchEnd = (e: TouchEvent) => {
      const st = pinchRef.current;
      if (!st.active) return;
      // 셋 이상에서 하나가 떨어졌다 → 핀치는 계속. 새 쌍으로 기준만 다시 잡는다
      if (e.touches.length >= 2) {
        st.last = pinchSample(el, e.touches) ?? st.last;
        return;
      }
      endPinch();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
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
      // ⚠️ 스페이스 해제는 **가드보다 먼저** 한다 (B1-a).
      //    입력창에서 스페이스를 떼는 동안 여기서 빠져나가면 팬 상태가 눌린 채 남아
      //    커서가 손 모양으로 굳는다.
      if (e.key === ' ') spaceRef.current = false;
      // ⭐ onKeyDown 과 **같은 가드**. 이게 없으면 모달 입력창에서 친 글자의 keyup 이
      //    캔버스로 새어 들어와 리렌더를 유발하고, 모달의 포커스가 튄다 (버그 B1).
      if (isTypingTarget(e.target)) return;
      send({ k: 'KEY_UP', key: e.key, keys: keysFrom(e, spaceRef.current) });
    };
    const onBlur = () => {
      spaceRef.current = false;
      // T-2 안전망 — 창을 벗어나 touchend 를 못 받으면 핀치 플래그가 켜진 채 굳어
      // 포인터 입력이 통째로 막힌다. 스페이스 해제와 같은 이유로 여기서도 푼다
      if (pinchRef.current.active) {
        pinchRef.current = { active: false, last: null };
        send({ k: 'GESTURE_PINCH_END' });
      }
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
    // T-2 — 핀치 중에 세 번째 손가락이 닿아도 새 드래그를 시작하지 않는다.
    // 코어의 T3 가드는 "진행 중인 드래그가 있을 때" 만 걸리는데, 핀치 시작이
    // 이미 드래그를 롤백해 뒀으므로 여기서 막지 않으면 그대로 그려진다
    if (pinchRef.current.active) return;
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
    if (pinchRef.current.active) return; // 핀치 중 — 화면 조작만 한다 (hover 계산도 낭비다)
    send(pointerMove(el, e.nativeEvent, spaceRef.current));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = hostRef.current;
    if (!el) return;
    // 캡처 해제는 핀치 여부와 무관하게 **항상** 한다 — 빠뜨리면 포인터가 붙잡힌 채 남는다
    try {
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    } catch {
      /* 무시 */
    }
    // 핀치 중 손가락을 떼는 것은 클릭이 아니다. 그대로 넘기면 `POINTER_UP` 이
    // "이동 없는 클릭" 으로 읽혀 점 결함이 생기거나 선택이 풀린다
    if (pinchRef.current.active) return;
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
