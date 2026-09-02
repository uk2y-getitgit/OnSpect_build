/**
 * D22(Q55 안 A) 조준 크로스헤어 — **화면 중앙 탭 합성.**
 *
 * ⭐ 코어(`packages/canvas-core`)는 조준 모드를 전혀 모른다. 스펙이 "코어 변경 0" 이라고
 *    못 박았으므로, 조준은 **어댑터 층의 장치**로만 산다:
 *    십자선이 놓인 자리(= 캔버스 호스트의 정중앙)를 손가락으로 탭한 것과 **완전히 같은**
 *    `POINTER_DOWN` + `POINTER_UP` 쌍을 만들어 기존 리듀서 경로로 흘려보낸다.
 *
 *    그래서 지금 켜진 도구(점·방향·영역·그리기)의 동작이 기존 탭과 한 치도 달라지지 않는다 —
 *    새 분기를 만들지 않았으니 달라질 수가 없다.
 */
import type { InputEvent, SPoint } from '@onspect/canvas-core';

/**
 * 합성 탭이 쓰는 `pointerId`. 실제 `PointerEvent.pointerId` 와 겹치면 안 된다 —
 * 브라우저가 내는 값은 0 이상이므로 음수를 쓴다.
 *
 * 코어는 `state.drag.pointerId !== ev.pointerId` 로 "두 번째 포인터" 를 걸러낸다(T3).
 * 즉 손가락으로 도면을 끄는 중에 `[여기]` 를 누르면 그 드래그가 롤백되고 합성 탭은 버려진다 —
 * 아무것도 만들어지지 않는 쪽이 안전하다(엉뚱한 자리에 찍히지 않는다).
 */
export const AIM_POINTER_ID = -1;

/**
 * 캔버스 호스트 기준 정중앙(로컬 CSS px).
 * 십자선을 호스트 안에 `left:50% top:50%` 로 그리므로 **눈에 보이는 십자선 자리가 곧 이 점**이다.
 */
export function aimCenterOf(el: HTMLElement): SPoint {
  const r = el.getBoundingClientRect();
  return { x: r.width / 2, y: r.height / 2 };
}

/**
 * 십자선 자리를 한 번 탭한 것과 같은 이벤트 쌍.
 *
 * `keys.space` 는 **반드시 false** 다. 조준 모드에서 진짜 손가락 입력은 팬 전용으로 만들려고
 * `space: true` 를 실어 보내는데(`CanvasView`), 이 합성 탭까지 그러면 도구가 죽고 팬만 된다.
 */
export function aimTapEvents(at: SPoint): InputEvent[] {
  const keys = { space: false, alt: false, shift: false, ctrl: false };
  return [
    { k: 'POINTER_DOWN', pointerId: AIM_POINTER_ID, screen: at, button: 0, keys },
    { k: 'POINTER_UP', pointerId: AIM_POINTER_ID, screen: at, keys },
  ];
}
