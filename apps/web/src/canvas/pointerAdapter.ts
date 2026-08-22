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

/** 입력 필드에 포커스가 있으면 캔버스 단축키를 가로채지 않는다 */
export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}
