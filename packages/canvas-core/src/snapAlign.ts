/**
 * 스마트 정렬 가이드 — 스펙 §2-6.
 *
 * 정렬 대상: **다른 라벨(번호 풍선)의 중심 x, 중심 y**.
 *   - 마크에는 정렬하지 않는다. 마크는 결함의 실제 위치라 줄이 맞을 이유가 없다.
 *   - 판정 공간은 **스크린 px**. 줌 배율과 무관하게 손끝 체감이 일정해야 한다.
 *   - 진입 6px / 이탈 10px 히스테리시스. 같은 값이면 경계에서 떨린다.
 *   - 후보 범위는 같은 도면의 **모든** 라벨. 뷰포트 밖도 포함한다
 *     (뷰포트로 제한하면 스크롤 위치에 따라 스냅 결과가 달라져 재현성이 깨진다).
 */
import { ALIGN_ENTER_PX, ALIGN_RELEASE_PX } from './constants.js';
import type { DefectScreen } from './defectGeom.js';
import type { AlignCand, AlignHit, AlignSnapshot } from './types.js';

/**
 * 드래그 시작 시 **1회만** 계산한다.
 * 드래그 중 뷰포트는 변하지 않으므로(요소 드래그 중 줌 차단) 스크린 스냅샷이 유효하다.
 */
export function buildAlignSnapshot(
  screens: readonly DefectScreen[],
  selfDefectId: string,
): AlignSnapshot {
  const xs: AlignCand[] = [];
  const ys: AlignCand[] = [];
  const byId: Record<string, { x: number; y: number }> = {};
  for (const s of screens) {
    if (s.defectId === selfDefectId) continue;
    xs.push({ v: s.label.x, id: s.defectId });
    ys.push({ v: s.label.y, id: s.defectId });
    byId[s.defectId] = { x: s.label.x, y: s.label.y };
  }
  xs.sort(cmpCand);
  ys.sort(cmpCand);
  return { xs, ys, byId };
}

function cmpCand(a: AlignCand, b: AlignCand): number {
  if (a.v !== b.v) return a.v - b.v;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** sorted 배열에서 v 이상인 첫 인덱스 */
function lowerBound(sorted: readonly AlignCand[], v: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((sorted[mid] as AlignCand).v < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * @param held 직전 프레임에 이 축에서 걸려 있던 후보 (히스테리시스)
 *
 * 같은 축에 후보가 여럿이면 |Δ| 최소인 것 하나. 동률이면 defectId 사전순.
 * 결정론적이어야 재현 테스트가 가능하다.
 */
export function findAlignSnap(
  v: number,
  sorted: readonly AlignCand[],
  held: AlignHit | null,
  enterPx = ALIGN_ENTER_PX,
  releasePx = ALIGN_RELEASE_PX,
): AlignHit | null {
  if (held !== null && Math.abs(v - held.v) <= releasePx) {
    return { v: held.v, id: held.id, d: Math.abs(v - held.v) };
  }

  let best: AlignHit | null = null;
  const i = lowerBound(sorted, v);

  // 오른쪽 스캔
  for (let j = i; j < sorted.length; j += 1) {
    const c = sorted[j] as AlignCand;
    const d = Math.abs(v - c.v);
    if (d > enterPx) break;
    best = better(best, { v: c.v, id: c.id, d });
  }
  // 왼쪽 스캔
  for (let j = i - 1; j >= 0; j -= 1) {
    const c = sorted[j] as AlignCand;
    const d = Math.abs(v - c.v);
    if (d > enterPx) break;
    best = better(best, { v: c.v, id: c.id, d });
  }
  return best;
}

function better(a: AlignHit | null, b: AlignHit): AlignHit {
  if (a === null) return b;
  if (b.d < a.d) return b;
  if (b.d === a.d && b.id < a.id) return b;
  return a;
}
