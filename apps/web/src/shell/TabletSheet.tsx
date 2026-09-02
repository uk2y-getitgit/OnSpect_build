/**
 * 태블릿 **세로** 바텀시트 3단 (T2-1 · D10 · `26_plan-reviewer_spec_Phase5_Mobile.md` §5-2).
 *
 * ⚠️ 이것은 **패널이 아니라 자리(placement)** 다. 안에 들어가는 것은 PC 와 **똑같은**
 *    `<Inspector>` 하나뿐이고, 이 파일은 그것을 어디에 얼마나 크게 두느냐만 정한다.
 *    결함정보 폼을 여기서 다시 만들지 않는다 — 만드는 순간 PC 와 두 벌이 되어 갈라진다.
 *
 * 3단 (§5-2):
 *   PEEK 16%  — 한 줄 요약 + 사진 칩. 도면이 최대로 보인다
 *   HALF 55%  — 부재 · 결함유형 · 규모. 현장 입력의 90% 가 여기서 끝난다
 *   FULL 92%  — 나머지 전부
 *
 * 조작:
 *   · 손잡이를 위아래로 끌면 따라오고, 떼면 **가장 가까운 단**으로 붙는다
 *   · 손잡이를 그냥 누르면 다음 단으로 올라간다(FULL 다음은 PEEK). 드래그를 못 하는
 *     보조기기·키보드 사용자에게 남겨 두는 유일한 통로다
 *   · 시트 밖 도면을 만지면 PEEK 로 내려간다 — 배선은 호출자(`CanvasRoute`)에 있다.
 *     이 컴포넌트는 캔버스를 모른다
 *
 * `SET_SAFE_INSETS` 배선(T2-6)은 이 파일이 아니라 호출자(`CanvasRoute`→`CanvasView`)에 있다 —
 * 이 컴포넌트는 여전히 "자리"만 알고 캔버스를 모른다. `viewportHeight()`(아래)를 그쪽이
 * 그대로 가져다 써서 실제 CSS 높이(`SHEET_SNAP_RATIO[snap] * vh`)와 어긋나지 않게 한다.
 */
import {
  useCallback,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

export type SheetSnap = 'PEEK' | 'HALF' | 'FULL';

/** 화면 높이 대비 비율 (§5-2 표 그대로) */
export const SHEET_SNAP_RATIO: Record<SheetSnap, number> = {
  PEEK: 0.16,
  HALF: 0.55,
  FULL: 0.92,
};

const SNAPS: SheetSnap[] = ['PEEK', 'HALF', 'FULL'];
/** 손잡이 탭 순환 — 위로 한 단씩, 꼭대기에서 바닥으로 */
const NEXT_SNAP: Record<SheetSnap, SheetSnap> = { PEEK: 'HALF', HALF: 'FULL', FULL: 'PEEK' };

const SNAP_LABEL: Record<SheetSnap, string> = {
  PEEK: '요약만',
  HALF: '절반',
  FULL: '전체',
};

/** 드래그로 볼 최소 이동 — 이보다 작으면 "탭" 으로 본다 */
const DRAG_SLOP_PX = 6;

/**
 * `export` — T2-6 이 안전영역(하단 인셋) 픽셀을 계산할 때 **같은 값**을 써야
 * `.sheet` 의 실제 CSS 높이(`SHEET_SNAP_RATIO[snap] * vh`)와 어긋나지 않는다.
 * 주소창이 접히는 브라우저에서는 `visualViewport` 가 실제로 보이는 높이다.
 */
export function viewportHeight(): number {
  return window.visualViewport?.height ?? window.innerHeight;
}

function nearestSnap(heightPx: number): SheetSnap {
  const vh = viewportHeight();
  let best: SheetSnap = 'PEEK';
  let bestDist = Number.POSITIVE_INFINITY;
  for (const s of SNAPS) {
    const d = Math.abs(SHEET_SNAP_RATIO[s] * vh - heightPx);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

/** 키보드가 올라오는 입력칸인가 — 버튼 그리드(ChoiceGrid)는 `<button>` 이라 걸리지 않는다 */
function isTextField(el: EventTarget | null): boolean {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

export type TabletSheetProps = {
  snap: SheetSnap;
  onSnapChange: (next: SheetSnap) => void;
  /** `<Inspector>` 하나가 들어온다 */
  children: ReactNode;
};

/**
 * 결함정보 패널의 **자리만** 고르는 껍데기.
 *
 * · `sheet === false`(PC · 태블릿 가로) → 받은 것을 **그대로** 내보낸다. DOM 이 한 노드도
 *   늘지 않는다(Fragment). 우측 열에 그대로 서는 지금까지의 화면이다 = **PC 변화 0.**
 * · `sheet === true`(태블릿 세로) → 바텀시트에 담는다. 단 **선택된 결함이 있을 때만** 뜬다
 *   (§5-2 "선택 없이 시트가 열려 있지 않는다").
 */
export function InspectorPlacement({
  sheet,
  visible,
  snap,
  onSnapChange,
  children,
}: TabletSheetProps & { sheet: boolean; visible: boolean }) {
  if (!sheet) return <>{children}</>;
  if (!visible) return null;
  return (
    <TabletSheet snap={snap} onSnapChange={onSnapChange}>
      {children}
    </TabletSheet>
  );
}

export function TabletSheet({ snap, onSnapChange, children }: TabletSheetProps) {
  /** 드래그 중에만 픽셀 높이를 쓴다. 놓으면 다시 비율(`null`)로 돌아간다 */
  const [dragH, setDragH] = useState<number | null>(null);
  const dragRef = useRef<{ startY: number; startH: number; moved: boolean } | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  /** 키보드가 뜨기 전 단 — 닫히면 여기로 돌아간다 (§5-2) */
  const restoreRef = useRef<SheetSnap | null>(null);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    const el = sheetRef.current;
    if (!el || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startY: e.clientY,
      startH: el.getBoundingClientRect().height,
      moved: false,
    };
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dy = e.clientY - d.startY;
    if (Math.abs(dy) > DRAG_SLOP_PX) d.moved = true;
    if (!d.moved) return;
    const vh = viewportHeight();
    // 위로 끌면(dy < 0) 높아진다. 3단의 최소·최대를 넘어가지 않는다
    const next = Math.min(
      SHEET_SNAP_RATIO.FULL * vh,
      Math.max(SHEET_SNAP_RATIO.PEEK * vh, d.startH - dy),
    );
    setDragH(next);
  }, []);

  const onPointerEnd = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;
      restoreRef.current = null; // 손으로 옮겼으면 키보드 복귀 대상도 지운다
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      const h = dragH;
      setDragH(null);
      // 움직이지 않았다 = 탭. 드래그를 못 하는 사용자에게 남기는 통로다
      onSnapChange(d.moved && h !== null ? nearestSnap(h) : NEXT_SNAP[snap]);
    },
    [dragH, snap, onSnapChange],
  );

  /**
   * 직접입력 칸에 들어가면 FULL 로 올린다 (§5-2).
   * 가정: **포커스를 키보드가 뜬 신호로 본다.** 외장 키보드를 붙인 태블릿에서는
   * 키보드가 없는데도 시트가 올라간다 — 실기기 라운드에서 조정할 자리다.
   */
  const onFocusCapture = useCallback(
    (e: ReactFocusEvent<HTMLDivElement>) => {
      if (!isTextField(e.target) || snap === 'FULL') return;
      restoreRef.current = snap;
      onSnapChange('FULL');
    },
    [snap, onSnapChange],
  );

  const onBlurCapture = useCallback(
    (e: ReactFocusEvent<HTMLDivElement>) => {
      if (!isTextField(e.target)) return;
      // 다음 입력칸으로 옮겨 가는 중이면 키보드는 그대로 떠 있다 — 시트를 내리지 않는다
      if (isTextField(e.relatedTarget)) return;
      const back = restoreRef.current;
      restoreRef.current = null;
      if (back) onSnapChange(back);
    },
    [onSnapChange],
  );

  // `data-dragging` — 끄는 동안 높이 전환(transition)을 끈다. 안 그러면 손가락보다 늦게 따라온다
  return (
    <div
      ref={sheetRef}
      className="sheet"
      data-snap={snap}
      data-dragging={dragH === null ? undefined : 'true'}
      style={dragH === null ? undefined : { height: `${Math.round(dragH)}px` }}
      onFocusCapture={onFocusCapture}
      onBlurCapture={onBlurCapture}
    >
      <button
        type="button"
        className="sheet__grab"
        aria-label={`결함 정보 시트 — 지금 ${SNAP_LABEL[snap]}. 위아래로 끌거나 누르면 크기가 바뀝니다`}
        title="위아래로 끌어 크기를 바꿉니다"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <span className="sheet__grabline" aria-hidden="true" />
      </button>
      {children}
    </div>
  );
}
