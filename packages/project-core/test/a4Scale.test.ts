/**
 * P-1 (2026-09-03) — 도면 배율이 바뀔 때 **결함 좌표가 도면을 따라간다**.
 *
 * 좌표는 A4 지면 기준 0~1 이다. 도면 그림이 A4 안에서 커지거나 작아지면,
 * 좌표를 그대로 두면 표기가 **가리키던 자리에서 떨어져 나간다**(사용자 신고).
 *
 * `layoutTransform`(apps/web) 은 `A4 → 도면-로컬 → A4` 를 이어 붙인 것뿐이다.
 * 여기서는 그 전제인 `a4Transform` 왕복 정확도와 "따라간다"의 의미를 고정한다 —
 * 이게 깨지면 좌표가 배율을 바꿀 때마다 조금씩 밀린다.
 */
import { describe, expect, it } from 'vitest';
import {
  a4Transform,
  calcFitRect,
  fitRectToImgLayout,
  fromA4Norm,
  toA4Norm,
} from '../src/index.js';

const NAT = { w: 1600, h: 1000 };

/** 배율 `scale` 로 A4 안에 앉힌 도면 배치 */
const layoutAt = (scale: number) =>
  fitRectToImgLayout(calcFitRect(NAT.w, NAT.h, undefined, undefined, scale));

describe('a4Transform — A4 지면 ↔ 도면-로컬', () => {
  it('왕복이 정확하다', () => {
    const t = a4Transform(layoutAt(1));
    for (const p of [
      { x: 0.1, y: 0.2 },
      { x: 0.5, y: 0.5 },
      { x: 0.87, y: 0.34 },
    ]) {
      const back = toA4Norm(fromA4Norm(p, t), t);
      expect(back.x).toBeCloseTo(p.x, 12);
      expect(back.y).toBeCloseTo(p.y, 12);
    }
  });

  it('배율을 바꾸면 같은 도면-로컬 점이 A4 위 다른 곳으로 간다', () => {
    const local = { x: 0.25, y: 0.75 };
    const a = toA4Norm(local, a4Transform(layoutAt(1)));
    const b = toA4Norm(local, a4Transform(layoutAt(1.2)));
    expect(a.x).not.toBeCloseTo(b.x, 6);
  });
});

describe('결함이 따라가야 할 양', () => {
  const t100 = a4Transform(layoutAt(1));
  const t120 = a4Transform(layoutAt(1.2));

  it('옛 배치로 풀고 새 배치로 얹으면 도면 위 같은 지점에 남는다', () => {
    const onA4 = { x: 0.4, y: 0.6 };
    const moved = toA4Norm(fromA4Norm(onA4, t100), t120);
    // 도면 그림 위의 그 지점(도면-로컬 좌표)은 변하지 않는다 — 이것이 "따라간다" 의 뜻이다
    expect(fromA4Norm(moved, t120).x).toBeCloseTo(fromA4Norm(onA4, t100).x, 12);
    expect(fromA4Norm(moved, t120).y).toBeCloseTo(fromA4Norm(onA4, t100).y, 12);
  });

  it('안 옮기면 가리키던 자리를 놓친다 — 예전 동작이 틀렸던 이유', () => {
    const onA4 = { x: 0.4, y: 0.6 };
    const stayed = fromA4Norm(onA4, t120); // 좌표를 그대로 둔 채 배율만 바꿨을 때
    const should = fromA4Norm(onA4, t100);
    expect(stayed.x).not.toBeCloseTo(should.x, 6);
  });

  it('배율이 같으면 항등이다 — 안 바꿨는데 좌표가 움직이면 안 된다', () => {
    const t = a4Transform(layoutAt(1.35));
    const p = { x: 0.31, y: 0.62 };
    const moved = toA4Norm(fromA4Norm(p, t), t);
    expect(moved.x).toBeCloseTo(p.x, 12);
    expect(moved.y).toBeCloseTo(p.y, 12);
  });

  it('여러 번 왕복해도 누적 오차가 없다 — 슬라이더를 오가도 안 밀린다', () => {
    const p = { x: 0.42, y: 0.58 };
    let cur = p;
    let prev = t100; // 지금 좌표가 어느 배치 기준인지
    for (const s of [1.2, 0.8, 1.5, 1]) {
      const next = a4Transform(layoutAt(s));
      cur = toA4Norm(fromA4Norm(cur, prev), next);
      prev = next;
    }
    // 마지막이 100% = 시작 배율이므로 A4 좌표가 처음 자리로 돌아와야 한다
    expect(cur.x).toBeCloseTo(p.x, 9);
    expect(cur.y).toBeCloseTo(p.y, 9);
  });
});
