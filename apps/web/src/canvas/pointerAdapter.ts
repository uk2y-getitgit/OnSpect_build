/**
 * PointerEvent / WheelEvent / KeyboardEvent → 코어의 InputEvent.
 *
 * 코어는 브라우저 이벤트 타입을 모른다(경계 규칙 6). 좌표는 캔버스 기준 CSS px 로 바꿔 넘긴다.
 */
import type { InputEvent, Keys, SPoint } from '@onspect/canvas-core';

export function keysOf(e: {
  altKey: boolean;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}, space: boolean): Keys {
  return {
    space,
    alt: e.altKey,
    shift: e.shiftKey,
    // macOS 대응: Cmd 를 Ctrl 과 동일하게 본다
    ctrl: e.ctrlKey || e.metaKey,
  };
}

export function localPoint(el: HTMLElement, clientX: number, clientY: number): SPoint {
  const r = el.getBoundingClientRect();
  return { x: clientX - r.left, y: clientY - r.top };
}

export function pointerDown(el: HTMLElement, e: PointerEvent, space: boolean): InputEvent {
  return {
    k: 'POINTER_DOWN',
    pointerId: e.pointerId,
    screen: localPoint(el, e.clientX, e.clientY),
    button: e.button,
    keys: keysOf(e, space),
  };
}

export function pointerMove(el: HTMLElement, e: PointerEvent, space: boolean): InputEvent {
  return {
    k: 'POINTER_MOVE',
    pointerId: e.pointerId,
    screen: localPoint(el, e.clientX, e.clientY),
    keys: keysOf(e, space),
  };
}

export function pointerUp(el: HTMLElement, e: PointerEvent, space: boolean): InputEvent {
  return {
    k: 'POINTER_UP',
    pointerId: e.pointerId,
    screen: localPoint(el, e.clientX, e.clientY),
    keys: keysOf(e, space),
  };
}

export function wheel(el: HTMLElement, e: WheelEvent, space: boolean): InputEvent {
  return {
    k: 'WHEEL',
    screen: localPoint(el, e.clientX, e.clientY),
    // deltaMode 0=px, 1=line, 2=page. 부호만 쓰므로 정규화는 최소한으로
    deltaY: e.deltaY,
    keys: keysOf(e, space),
  };
}

export function doubleClick(el: HTMLElement, e: MouseEvent, space: boolean): InputEvent {
  return { k: 'DOUBLE_CLICK', screen: localPoint(el, e.clientX, e.clientY), keys: keysOf(e, space) };
}

export function contextMenu(el: HTMLElement, e: MouseEvent): InputEvent {
  return { k: 'CONTEXT_MENU', screen: localPoint(el, e.clientX, e.clientY) };
}

// ── T-2 · 핀치 (두 손가락) ────────────────────────────────────────────────
/**
 * 두 접점의 중점·거리 스냅샷. **코어 타입이 아니다** — 어댑터 안에서만 산다.
 *
 * 코어의 `GESTURE_PINCH` 는 **직전 프레임 대비 상대값**(factor·pan)을 받으므로,
 * 어댑터가 직전 스냅샷을 들고 있다가 매 프레임 차이를 내야 한다.
 *
 * `ids` 는 지금 추적 중인 두 손가락의 `Touch.identifier` 다. 세 번째 손가락이
 * 얹히거나 한쪽이 떨어져 **추적 대상이 바뀌면 거리·중점이 순간이동**하는데,
 * 그대로 factor 로 넘기면 화면이 튄다. id 가 달라지면 기준을 다시 잡는다.
 */
export type PinchSample = { center: SPoint; dist: number; ids: [number, number] };

/**
 * ⭐ B-1 — `TouchEvent.touches` 는 **화면 전체**의 접점 목록이다. 그 이벤트를 받은
 * 요소의 접점만 주는 게 아니다.
 *
 * `.canvas-host` 는 `position:absolute; inset:0` 이라 도구 팔레트·Inspector·Sidebar 가
 * **시각적으로는 도면 위에 겹쳐** 보이지만 DOM 상으로는 host 밖 형제다. 그래서 팔레트에
 * 엄지를 얹은 채 도면에 그리면 접점이 2개로 집계돼 핀치로 오인식되고, 그리던 획이
 * `GESTURE_PINCH_START` 의 `cancelDrag` 로 롤백된다 — "그려지지 않고 화면만 움직인다".
 *
 * `targetTouches` 는 실제 target 이 자식 `.canvas-layer` 캔버스라 여기서는 못 쓴다.
 * 포함 관계(`el.contains`)로 직접 거른다. 접점의 `target` 은 **touchstart 시점 요소로
 * 고정**되므로, 캔버스에서 시작한 손가락은 밖으로 끌고 나가도 계속 걸러지지 않는다.
 */
export function touchesIn(el: HTMLElement, list: TouchList): Touch[] {
  const out: Touch[] = [];
  for (let i = 0; i < list.length; i += 1) {
    const t = list[i];
    if (!t) continue;
    if (t.target instanceof Node && el.contains(t.target)) out.push(t);
  }
  return out;
}

/**
 * 앞 두 접점으로 스냅샷을 만든다. 손가락이 2개 미만이거나 좌표가
 * 성하지 않으면 null — 코어에 NaN 을 흘리지 않기 위한 1차 방어다
 * (코어도 `finitePoint` 로 한 번 더 막는다).
 *
 * 인자는 **반드시 `touchesIn()` 으로 거른 배열**이어야 한다. 날 `TouchList` 를 넘기면
 * 캔버스 밖 손가락이 `touches[0]` 자리를 차지해 중점·거리가 엉뚱해진다(B-1).
 */
export function pinchSample(el: HTMLElement, touches: readonly Touch[]): PinchSample | null {
  const a = touches[0];
  const b = touches[1];
  if (!a || !b) return null;
  const r = el.getBoundingClientRect();
  const ax = a.clientX - r.left;
  const ay = a.clientY - r.top;
  const bx = b.clientX - r.left;
  const by = b.clientY - r.top;
  const dist = Math.hypot(bx - ax, by - ay);
  if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(bx) || !Number.isFinite(by)) {
    return null;
  }
  return {
    center: { x: (ax + bx) / 2, y: (ay + by) / 2 },
    dist,
    ids: [a.identifier, b.identifier],
  };
}

/** 같은 두 손가락을 계속 보고 있는가 (순서가 뒤집혀도 같은 쌍이면 같다) */
export function sameTouchPair(a: PinchSample, b: PinchSample): boolean {
  return (
    (a.ids[0] === b.ids[0] && a.ids[1] === b.ids[1]) ||
    (a.ids[0] === b.ids[1] && a.ids[1] === b.ids[0])
  );
}

/**
 * 직전 스냅샷 → 지금 스냅샷의 상대 변화를 코어 이벤트로 바꾼다.
 * 거리가 0 에 가까우면(두 손가락이 겹침) 배율은 1 로 두고 팬만 넘긴다 — 0 나눗셈 방지.
 */
export function pinchMove(prev: PinchSample, next: PinchSample): InputEvent {
  const factor = prev.dist > 1e-3 ? next.dist / prev.dist : 1;
  return {
    k: 'GESTURE_PINCH',
    center: next.center,
    factor,
    pan: { x: next.center.x - prev.center.x, y: next.center.y - prev.center.y },
  };
}

/** 입력 필드에 포커스가 있으면 캔버스 단축키를 가로채지 않는다 */
export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}
