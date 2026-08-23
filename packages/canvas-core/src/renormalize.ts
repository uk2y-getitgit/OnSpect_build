/**
 * F1 — 정규화 좌표 **일괄 아핀 변환**. `[A4로 맞추기]` 가 쓴다.
 *
 * ⚠️ **실사용자 데이터의 좌표를 바꾸는 조작이다.** 결함 1건이 갖는 좌표는
 * 마크 기하 · 번호 라벨 · 자유그리기 획 **셋**이고, 메모는 앵커 · 필기 획 **둘**이다.
 * 하나라도 빠지면 그 부분만 여백 쪽으로 밀려 보인다 — 그래서 한 파일에 모아 두고
 * 왕복 변환 테스트로 고정한다.
 *
 * 경계 규칙: 이 파일은 `project-core` 를 import 하지 않는다(D13).
 * A4 배치에서 계수를 뽑는 일은 `project-core/a4.ts::a4Transform` 이 하고,
 * 그 결과(숫자 4개)를 `apps/web` 이 여기로 넘긴다.
 */
import { roundNorm } from './geometry.js';
import type { Defect, MarkGeometry, Memo, NPoint } from './types.js';

/** `new = off + old × scale` 의 계수. 축마다 따로다(A4 는 종횡비가 바뀐다) */
export type NormTransform = { ox: number; oy: number; sx: number; sy: number };

export const IDENTITY_TRANSFORM: NormTransform = { ox: 0, oy: 0, sx: 1, sy: 1 };

/** 정확한 역변환. 되돌리기가 수학적으로 보장된다 */
export function invertTransform(t: NormTransform): NormTransform {
  return { ox: -t.ox / t.sx, oy: -t.oy / t.sy, sx: 1 / t.sx, sy: 1 / t.sy };
}

/** 위치 — 오프셋 + 배율 */
export function mapPoint(p: NPoint, t: NormTransform): NPoint {
  return roundNorm({ x: t.ox + p.x * t.sx, y: t.oy + p.y * t.sy });
}

/**
 * 크기 — **배율만.** 위치 식을 그대로 쓰면 크기에 여백이 더해져 도형이 커진다.
 * (영역 마크의 w·h 가 여기 해당한다)
 */
export function mapSize(s: NPoint, t: NormTransform): NPoint {
  return roundNorm({ x: s.x * t.sx, y: s.y * t.sy });
}

export function mapGeometry(g: MarkGeometry, t: NormTransform): MarkGeometry {
  switch (g.k) {
    case 'POINT': {
      const p = mapPoint({ x: g.x, y: g.y }, t);
      return { k: 'POINT', x: p.x, y: p.y };
    }
    case 'ARROW':
      return { k: 'ARROW', from: mapPoint(g.from, t), to: mapPoint(g.to, t) };
    case 'AREA_RECT':
    case 'AREA_ELLIPSE': {
      const at = mapPoint({ x: g.x, y: g.y }, t);
      const size = mapSize({ x: g.w, y: g.h }, t);
      return { k: g.k, x: at.x, y: at.y, w: size.x, h: size.y };
    }
    default:
      return g;
  }
}

/** 결함 1건의 **모든** 좌표 — 마크 · 라벨 · 자유그리기 */
export function transformDefect(d: Defect, t: NormTransform): Defect {
  const label = mapPoint({ x: d.label.x, y: d.label.y }, t);
  return {
    ...d,
    marks: d.marks.map((m) => ({ ...m, geometry: mapGeometry(m.geometry, t) })),
    label: { ...d.label, x: label.x, y: label.y },
    sketch: (d.sketch ?? []).map((p) => ({
      ...p,
      points: p.points.map((pt) => mapPoint(pt, t)),
    })),
  };
}

/** 메모 — 앵커와 필기 획을 **함께** 옮긴다 (어긋나면 상자와 글씨가 따로 논다) */
export function transformMemo(m: Memo, t: NormTransform): Memo {
  return {
    ...m,
    pos: mapPoint(m.pos, t),
    paths: m.paths?.map((p) => ({ ...p, points: p.points.map((pt) => mapPoint(pt, t)) })) ?? null,
  };
}
