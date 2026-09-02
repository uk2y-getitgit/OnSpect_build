/**
 * **마지막 뷰포트 기억·복원** — Phase 5 스펙 §6-2 T2-5.
 *
 * 도면을 보던 자리(줌 배율 · 팬 위치)를 용역마다 하나 저장했다가, 그 용역을 다시 열 때
 * 되돌린다. 저장은 `meta` KV `lastView:{projectId}` — 새 스토어도, DB 버전 상승도 없다
 * (`data/idb/lastView.ts`).
 *
 * 규칙 셋:
 *   1. **복원은 용역을 여는 동안 딱 한 번.** 저장된 도면과 지금 연 도면이 다르면
 *      전체 맞춤 그대로 둔다 — 남의 도면에 남의 좌표를 씌우면 엉뚱한 자리가 나온다
 *   2. **저장은 디바운스한다.** 도면을 미는 매 프레임 IndexedDB 를 두드리면 낭비다
 *      (결함 저장의 250ms 디바운스와 같은 원칙, §2-9-e)
 *   3. **나갈 때는 확실히 쓴다.** 라우트 이탈 · 탭 숨김 · 새로고침에서 즉시 플러시한다
 *
 * ⚠️ 실패해도 **조용히 넘어간다.** 뷰포트 기억은 편의 기능이라 `guard()` 의 지속 배너
 *    ("변경 사항을 저장하지 못했습니다")를 띄우면 결함 데이터가 멀쩡한데도 사용자는
 *    자기 입력이 날아간 줄 안다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  restoreViewEvents,
  viewCenterOf,
  type CanvasState,
  type InputEvent,
} from '@onspect/canvas-core';
import { useRepo } from './appData.js';
import type { LastView } from './idb/lastView.js';

/**
 * 결함 저장(250ms)보다 길게 잡는다. 뷰포트는 팬 한 번에 수십 번 바뀌는데
 * 데이터가 아니라 **편의 값**이라 늦게 써도 잃을 것이 없다 — 나갈 때 어차피 플러시한다.
 */
const SAVE_DEBOUNCE_MS = 600;

type LoadedView = { projectId: string; view: LastView | null };

export function useLastView(
  projectId: string,
  canvas: CanvasState,
  send: (ev: InputEvent) => void,
): void {
  const repo = useRepo();
  const [loaded, setLoaded] = useState<LoadedView | null>(null);

  /** 이 용역에서 복원 판정이 끝났는가. 끝나기 전에는 **저장하지 않는다** (아래 이유) */
  const restoredRef = useRef<string | null>(null);
  /** 아직 안 쓴 최신 값. 디바운스 타이머와 이탈 플러시가 함께 본다 */
  const pendingRef = useRef<LastView | null>(null);
  const repoRef = useRef(repo);
  repoRef.current = repo;
  const sendRef = useRef(send);
  sendRef.current = send;

  /** 참조가 고정이라 이탈 플러시 효과가 다시 붙지 않는다 (CanvasRoute 의 `flush` 와 같은 방식) */
  const flushLastView = useCallback(() => {
    const v = pendingRef.current;
    const r = repoRef.current;
    if (!v || !r) return;
    pendingRef.current = null;
    void r.putLastView(v).catch(() => {});
  }, []);

  // ── 읽기 — 용역당 1회 ───────────────────────────────────────────────────
  useEffect(() => {
    if (!repo) return;
    let alive = true;
    repo
      .getLastView(projectId)
      .then((view) => {
        if (alive) setLoaded({ projectId, view });
      })
      .catch(() => {
        // 못 읽으면 복원만 포기한다. 저장은 계속 시도한다
        if (alive) setLoaded({ projectId, view: null });
      });
    return () => {
      alive = false;
    };
  }, [repo, projectId]);

  const drawingId = canvas.drawing?.id ?? null;
  const imageWidth = canvas.drawing?.imageWidth ?? 0;
  const imageHeight = canvas.drawing?.imageHeight ?? 0;
  const cw = canvas.canvas.w;
  const ch = canvas.canvas.h;
  const { zoom, tx, ty } = canvas.viewport;

  // ── 복원 — 도면이 걸리고 캔버스 크기가 잡힌 **첫 순간 한 번** ───────────
  //
  // ⚠️ 이 효과는 저장 효과보다 **먼저** 정의돼야 한다. 같은 커밋에서 복원 판정이
  //    끝나야 저장 효과가 "복원 전 뷰포트"(전체 맞춤)를 저장 대기열에 올리지 않는다.
  useEffect(() => {
    if (!loaded || loaded.projectId !== projectId) return;
    if (restoredRef.current === projectId) return;
    // 캔버스 크기가 0 이면 아직 전체 맞춤조차 계산되지 않았다 (`fitState` 가 빠져나간다)
    if (drawingId === null || cw <= 0 || ch <= 0) return;
    // 판정은 여기서 끝난다. 되돌릴 것이 없어도 **다시 시도하지 않는다** —
    // 층을 옮길 때마다 화면이 튀면 그게 더 나쁘다
    restoredRef.current = projectId;
    const v = loaded.view;
    if (!v || v.drawingId !== drawingId) return;
    // 배율·팬 한계는 코어가 하던 그대로 걸린다 (`restoreViewEvents` 주석)
    for (const ev of restoreViewEvents(v, zoom)) sendRef.current(ev);
  }, [loaded, projectId, drawingId, cw, ch, zoom]);

  // ── 저장 — 디바운스 ─────────────────────────────────────────────────────
  useEffect(() => {
    if (restoredRef.current !== projectId) return;
    if (drawingId === null || cw <= 0 || ch <= 0) return;
    const center = viewCenterOf({ zoom, tx, ty }, imageWidth, imageHeight, { w: cw, h: ch });
    if (!center) return; // NaN 뷰포트는 저장하지 않는다
    pendingRef.current = { ...center, projectId, drawingId, updatedAt: Date.now() };
    const h = window.setTimeout(flushLastView, SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(h);
  }, [projectId, drawingId, imageWidth, imageHeight, cw, ch, zoom, tx, ty, flushLastView]);

  // ── 이탈 플러시 — 라우트 이탈 · 탭 숨김 · 새로고침 ──────────────────────
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flushLastView();
    };
    window.addEventListener('beforeunload', flushLastView);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('beforeunload', flushLastView);
      document.removeEventListener('visibilitychange', onHidden);
      // 위 디바운스 효과의 정리가 먼저 돌아 타이머를 지운다. 마지막 값은 여기서 쓴다
      flushLastView();
    };
  }, [flushLastView]);
}
