/**
 * 히트 테스트 — 스펙 §2-4 + S2a §S2a-3.
 *
 * 위에서부터 순서대로 검사하고 처음 맞는 것에서 멈춘다.
 *
 *   1. 번호 라벨
 *   2. 영역 리사이즈 핸들 (선택된 결함의 것만)
 *   3. 점 마크
 *   4. 화살표 (머리·꼬리 핸들 → 몸통)
 *   5. 영역 테두리
 *   6. 자유그리기 선
 *  6-b. 리더선 (S2a 목록에 없다 — 기존 순위의 정신대로 얇은 선들 사이에 둔다)
 *   7. 메모
 *   8. 영역 내부 (채움일 때만)
 *   9. 빈 도면
 *
 * 라벨이 마크보다 위인 이유: 마크는 결함의 **실제 위치**이고 라벨은 보기 좋으라고
 * 옮기는 것이다. 겹친 상태에서 실수로 마크를 끌면 보고서 데이터가 틀린다.
 * 실수의 비용이 싼 쪽을 앞에 둔다.
 *
 * 영역 **내부**가 맨 아래인 이유(§S2a-3): 큰 영역이 그 위에 놓인 작은 표기를
 * 전부 삼키면 도면이 잠긴다. 큰 것보다 작은 것이, 뒤보다 앞이 이긴다.
 */
import {
  HIT_HANDLE_PX,
  HIT_LEADER_PX,
  HIT_MIN_LABEL_PX,
  HIT_MIN_MARK_PX,
  HIT_PAD_PX,
  HIT_STROKE_PX,
} from './constants.js';
import { dist, distPointSegment, sub, unit } from './geometry.js';
import type { DefectScreen } from './defectGeom.js';
import type { MemoScreen } from './memoGeom.js';
import {
  distToEllipseBorder,
  distToPolyline,
  distToRectBorder,
  handlePoints,
  pointInEllipse,
  pointInRect,
} from './shapes.js';
import type { Handle, Part, Selection, SPoint } from './types.js';

export type HitTarget = {
  /** 메모 히트일 때만 null */
  defectId: string | null;
  part: Part;
  markId: string | null;
  handle?: Handle | null;
  pathId?: string | null;
  memoId?: string | null;
};

export type HitInput = {
  screens: readonly DefectScreen[];
  memos?: readonly MemoScreen[];
  selection: Selection;
};

/**
 * @param screens z-order **오름차순**(seq 오름차순). 내부에서 역순 탐색한다
 */
export function hitTest(
  p: SPoint,
  screens: readonly DefectScreen[],
  selection: Selection,
  memos: readonly MemoScreen[] = [],
): HitTarget | null {
  // 1. 라벨
  const labelHits: HitTarget[] = [];
  for (const s of screens) {
    const r = Math.max(s.balloonR + HIT_PAD_PX, HIT_MIN_LABEL_PX);
    if (dist(p, s.label) <= r) {
      labelHits.push({ defectId: s.defectId, part: 'LABEL', markId: null });
    }
  }
  const label = pick(labelHits, selection);
  if (label) return label;

  // 2. 영역 리사이즈 핸들 — **선택된 결함의 것만.** 안 그러면 화면이 핸들로 뒤덮인다
  if (selection.defectId) {
    for (const s of screens) {
      if (s.defectId !== selection.defectId) continue;
      for (const m of s.marks) {
        if (!m.rect) continue;
        if (selection.markId !== null && selection.markId !== m.id) continue;
        for (const h of handlePoints(m.rect)) {
          if (dist(p, h.at) <= HIT_HANDLE_PX) {
            return { defectId: s.defectId, part: 'HANDLE', markId: m.id, handle: h.handle };
          }
        }
      }
    }
  }

  // 3. 점 마크
  const markHits: HitTarget[] = [];
  for (const s of screens) {
    const r = Math.max(s.markR + HIT_PAD_PX, HIT_MIN_MARK_PX);
    for (const m of s.marks) {
      if (m.type !== 'POINT') continue;
      if (dist(p, m.center) <= r) {
        markHits.push({ defectId: s.defectId, part: 'MARK', markId: m.id });
      }
    }
  }
  const mark = pick(markHits, selection);
  if (mark) return mark;

  // 4. 화살표 — 끝점 핸들이 몸통보다 먼저다 (선택된 것만 핸들 노출)
  if (selection.defectId) {
    for (const s of screens) {
      if (s.defectId !== selection.defectId) continue;
      for (const m of s.marks) {
        if (m.type !== 'ARROW' || !m.from || !m.to) continue;
        if (dist(p, m.to) <= HIT_HANDLE_PX) {
          return { defectId: s.defectId, part: 'HANDLE', markId: m.id, handle: 'TO' };
        }
        if (dist(p, m.from) <= HIT_HANDLE_PX) {
          return { defectId: s.defectId, part: 'HANDLE', markId: m.id, handle: 'FROM' };
        }
      }
    }
  }
  const arrowHits: HitTarget[] = [];
  for (const s of screens) {
    for (const m of s.marks) {
      if (m.type !== 'ARROW' || !m.from || !m.to) continue;
      if (distPointSegment(p, m.from, m.to) <= HIT_STROKE_PX) {
        arrowHits.push({ defectId: s.defectId, part: 'MARK', markId: m.id });
      }
    }
  }
  const arrow = pick(arrowHits, selection);
  if (arrow) return arrow;

  // 5. 영역 테두리
  const borderHits: HitTarget[] = [];
  for (const s of screens) {
    for (const m of s.marks) {
      if (!m.rect) continue;
      const d =
        m.type === 'AREA_ELLIPSE' ? distToEllipseBorder(p, m.rect) : distToRectBorder(p, m.rect);
      if (d <= HIT_STROKE_PX) {
        borderHits.push({ defectId: s.defectId, part: 'MARK', markId: m.id });
      }
    }
  }
  const border = pick(borderHits, selection);
  if (border) return border;

  // 6. 자유그리기 선
  const sketchHits: HitTarget[] = [];
  for (const s of screens) {
    for (const path of s.sketch) {
      const tol = Math.max(HIT_STROKE_PX, path.width / 2 + HIT_PAD_PX);
      if (distToPolyline(p, path.points) <= tol) {
        sketchHits.push({ defectId: s.defectId, part: 'SKETCH', markId: null, pathId: path.id });
      }
    }
  }
  const sketch = pick(sketchHits, selection);
  if (sketch) return sketch;

  // 6-b. 리더선 — 선택만 한다 (드래그 대상 아님).
  //      S2a 목록에 없어서 기존 순위(라벨 > 마크 > 리더선)의 정신을 지켜 얇은 선들 사이에 둔다.
  //      메모보다는 위다 — 메모가 결함의 리더선을 가로채면 안 된다.
  const leaderHits: HitTarget[] = [];
  for (const s of screens) {
    const seg = leaderSegment(s);
    if (!seg) continue;
    if (distPointSegment(p, seg.a, seg.b) <= HIT_LEADER_PX) {
      leaderHits.push({ defectId: s.defectId, part: 'LEADER', markId: null });
    }
  }
  const leader = pick(leaderHits, selection);
  if (leader) return leader;

  // 7. 메모 — 결함 표기보다 아래. 메모가 결함 조작을 가로채면 안 된다
  for (let i = memos.length - 1; i >= 0; i -= 1) {
    const m = memos[i]!;
    // F2 필기 메모는 **획 근처 또는 점선 테두리**만 잡는다.
    // 상자 속을 통째로 잡으면 큰 낙서 하나가 그 안의 도면 조작을 전부 삼킨다
    // (§S2a-3 "큰 것보다 작은 것이 이긴다" 와 같은 정신).
    if (m.paths) {
      const near = m.paths.some(
        (path) =>
          distToPolyline(p, path.points) <= Math.max(HIT_STROKE_PX, path.width / 2 + HIT_PAD_PX),
      );
      if (near || distToRectBorder(p, m.box) <= HIT_STROKE_PX) {
        return { defectId: null, part: 'MEMO', markId: null, memoId: m.memoId };
      }
      continue;
    }
    if (pointInRect(p, m.box)) {
      return { defectId: null, part: 'MEMO', markId: null, memoId: m.memoId };
    }
  }

  // 8. 영역 **내부** — 채움일 때만. 투명한 영역의 빈 속을 클릭하면 팬이어야 한다
  const insideHits: HitTarget[] = [];
  for (const s of screens) {
    if (s.style.areaFill === 'NONE') continue;
    for (const m of s.marks) {
      if (!m.rect) continue;
      const inside =
        m.type === 'AREA_ELLIPSE' ? pointInEllipse(p, m.rect) : pointInRect(p, m.rect);
      if (inside) insideHits.push({ defectId: s.defectId, part: 'MARK', markId: m.id });
    }
  }
  const inside = pick(insideHits, selection);
  if (inside) return inside;

  // 9. 빈 도면
  return null;
}

/**
 * 같은 순위 안에서 여러 개가 맞으면
 *   ① 현재 선택된 결함의 것 (순위 0)
 *   ② 없으면 z-순서 역순 = 배열의 마지막 것 (가장 위에 그려진 것)
 */
function pick(hits: readonly HitTarget[], selection: Selection): HitTarget | null {
  if (hits.length === 0) return null;
  if (selection.defectId) {
    const own = hits.find((h) => h.defectId === selection.defectId);
    if (own) return own;
  }
  return hits[hits.length - 1] ?? null;
}

/**
 * 리더선의 실제 그리기 형상 (§2-7-c).
 * 끝점은 풍선 **테두리에서 멈춘다.** r ≤ balloonRadius 이면 그리지 않는다(null).
 */
export function leaderSegment(s: DefectScreen): { a: SPoint; b: SPoint } | null {
  if (!s.anchor) return null;
  const v = sub(s.label, s.anchor);
  const r = Math.hypot(v.x, v.y);
  if (r <= s.balloonR) return null;
  const u = unit(v);
  return {
    a: s.anchor,
    b: { x: s.label.x - u.x * s.balloonR, y: s.label.y - u.y * s.balloonR },
  };
}
