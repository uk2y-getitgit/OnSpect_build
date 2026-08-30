/**
 * 히트 테스트 — 스펙 §2-4 + S2a §S2a-3.
 *
 * 위에서부터 순서대로 검사하고 처음 맞는 것에서 멈춘다.
 *
 *   1. 번호 라벨
 *   2. 영역 리사이즈 핸들 (선택된 결함의 것만)
 *   3. 점 마크
 *   4. 화살표 (몸통 — 정점 사이 선분들 중 최단거리. 2026-08-24 개정: 핸들 없음, 통째로 이동만)
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
import { DEFAULT_HIT_PROFILE, type HitProfile } from './constants.js';
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
  pointInStadium,
  stadiumBoundaryDist,
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
 * @param profile 히트 허용치(T5). 생략하면 `DEFAULT_HIT_PROFILE`(마우스) — 기존 동작 그대로
 */
export function hitTest(
  p: SPoint,
  screens: readonly DefectScreen[],
  selection: Selection,
  memos: readonly MemoScreen[] = [],
  profile: HitProfile = DEFAULT_HIT_PROFILE,
): HitTarget | null {
  // 아래 본문은 예전과 한 글자도 다르지 않다 — 모듈 상수를 프로파일 값으로 **바꿔 끼우기만** 한다.
  // 이름을 그대로 둔 것은 의도적이다: 히트 판정 로직의 diff 를 0 으로 만들어야
  // "PC 동작 변화 0" 을 코드로 확인할 수 있다
  const HIT_PAD_PX = profile.pad;
  const HIT_MIN_LABEL_PX = profile.minLabel;
  const HIT_MIN_MARK_PX = profile.minMark;
  const HIT_LEADER_PX = profile.leader;
  const HIT_STROKE_PX = profile.stroke;
  const HIT_HANDLE_PX = profile.handle;
  const HIT_MEMO_INK_PX = profile.memoInk;

  // 1. 라벨
  //    ⭐ 풍선은 원이 아니라 **스타디움**이다(검수 심각2). 늘어난 폭(`labelHalfExtra`)만큼
  //       중심선 선분으로 판정한다 — 렌더가 쓰는 것과 **같은 값**이라 그림과 클릭이 어긋나지 않는다.
  //       `labelHalfExtra === 0` 이면 선분이 한 점으로 줄어 예전 원 판정과 완전히 같다.
  const labelHits: HitTarget[] = [];
  for (const s of screens) {
    const r = Math.max(s.balloonR + HIT_PAD_PX, HIT_MIN_LABEL_PX);
    if (pointInStadium(p, s.label, r, s.labelHalfExtra ?? 0)) {
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

  // 4. 화살표 몸통 — 핸들 없음(2026-08-24 개정). 정점을 낱개로 못 옮기고 통째로만 옮긴다(MOVE_SHAPE)
  const arrowHits: HitTarget[] = [];
  for (const s of screens) {
    for (const m of s.marks) {
      if (m.type !== 'ARROW' || !m.points || m.points.length < 2) continue;
      if (distToPolyline(p, m.points) <= HIT_STROKE_PX) {
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
    // ⭐ D14 — 필기 메모는 **획 근처만** 잡는다. 점선 테두리 판정을 뺐다.
    //    점선 상자가 선택·hover 일 때만 보이게 됐으므로(D14-a), 보이지도 않는 테두리를
    //    잡으면 "아무것도 없는 자리인데 메모가 잡힌다" 가 된다 — 그림과 클릭이 어긋난다.
    //    획 사이의 빈 공간이 안 잡히는 것이 이 변경의 목적이다(글씨 사이로 도면이 보인다).
    if (m.paths) {
      if (nearestMemoPath(p, m, HIT_MEMO_INK_PX) !== null) {
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
 * 필기 메모에서 커서에 **가장 가까운 획**의 인덱스 (D14).
 * 허용치 안에 아무 획도 없으면 `null`.
 *
 * 히트 판정(7번)과 지우개가 **같은 함수를 쓴다.** 두 벌로 만들면
 * "잡히는데 안 지워진다 / 안 잡히는데 지워진다" 가 생긴다.
 *
 * ⚠️ 돌려주는 인덱스는 **`MemoScreen.paths` 기준**이다. `memoScreen()` 이 점 1개짜리 획을
 * 걸러내므로 `Memo.paths` 의 인덱스와 다를 수 있다 — 호출자는 `path.id` 로 원본을 찾아라.
 *
 * @param tol 스크린 px. 획 두께의 절반과 이 값 중 **큰 쪽**이 실제 허용치다
 */
export function nearestMemoPath(p: SPoint, m: MemoScreen, tol: number): number | null {
  if (!m.paths) return null;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < m.paths.length; i += 1) {
    const path = m.paths[i]!;
    const d = distToPolyline(p, path.points);
    // 두꺼운 획은 **그려진 두께만큼** 잡힌다 — 그림과 판정이 어긋나지 않게
    if (d <= Math.max(tol, path.width / 2) && d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best === -1 ? null : best;
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
 *
 * 방향(화살표) 결함도 여기를 그대로 탄다 — `anchor` 가 화살표의 **마지막 점**(번호 쪽 끝)
 * 이라, 번호가 그 끝에서 가깝게 자동배치돼 있으면(생성 직후) r ≤ balloonR 로 안 그려지고
 * 화살표 몸통만 보인다. 번호를 나중에 멀리 옮기면 이 직선이 마지막 점에서부터 새로 이어진다
 * (2026-08-24 재개정 — 그려진 경로는 그대로 두고, 번호 이동은 일반 리더선으로 처리한다).
 */
export function leaderSegment(s: DefectScreen): { a: SPoint; b: SPoint } | null {
  if (!s.anchor) return null;
  const v = sub(s.label, s.anchor);
  const r = Math.hypot(v.x, v.y);
  const u = unit(v);
  // 풍선이 스타디움으로 늘어났으면 그 테두리에서 끊는다. `labelHalfExtra === 0` 이면 = balloonR
  const edge = stadiumBoundaryDist({ x: -u.x, y: -u.y }, s.balloonR, s.labelHalfExtra ?? 0);
  if (r <= edge) return null;
  return {
    a: s.anchor,
    b: { x: s.label.x - u.x * edge, y: s.label.y - u.y * edge },
  };
}
