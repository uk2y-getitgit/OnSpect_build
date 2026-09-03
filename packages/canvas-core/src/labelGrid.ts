/**
 * P-2 — 번호 풍선 정렬.
 *
 * ## 2026-09-03 2차 재작성 — 우선순위가 정해졌다
 *
 * 사용자 지시: *"지시점과 번호간 직교가 우선. 그다음 가까운 번호와 같은선상에 정렬"*
 *
 * 1. **1순위 — 지시선이 수평이거나 수직이 된다.** 번호를 지시점(마크)의 정확히
 *    위·아래·왼쪽·오른쪽에 놓는다. 비스듬한 지시선은 도면에서 어느 점을 가리키는지
 *    읽기 어렵고 인쇄물에서 특히 그렇다
 * 2. **2순위 — 자유로운 축을 이웃과 맞춘다.** 세로 지시선이면 x 가 지시점에 묶이므로
 *    y 를 이웃과 맞춰 **가로줄**이 서고, 가로 지시선이면 반대다
 *
 * 2순위가 1순위를 깨지 않는다 — 묶인 축은 건드리지 않고 자유로운 축만 모은다.
 *
 * ### 이전 판들이 왜 실패했나
 * - **1차(절대 격자)** — `balloonRadius × 2.5` = 85px 격자에 스냅했는데 풍선 지름이 68px 이라
 *   칸마다 하나씩 들어가 거의 안 움직였다. 사용자: *"정렬값이 무의미하다"*
 * - **2차(자유 직교 정렬)** — x·y 를 각각 이웃과 모으기만 해서 지시선이 여전히 비스듬했다.
 *   번호끼리는 줄이 섰지만 **번호와 지시점의 관계**가 정리되지 않았다
 *
 * ## 이 모듈이 하지 않는 것
 * - **결함점(마크)은 건드리지 않는다.** 움직이는 것은 풍선뿐이고 지시선이 따라 늘어난다
 * - **도면 밖(여백) 이동은 하지 않는다** (D28 — 1차 범위에서 제외)
 * - 어떤 결함을 넣을지 **고르지 않는다.** 잠긴 결함 제외는 호출자가 한다
 *
 * ## 좌표계 — **이미지 px 로 받는다**
 * 정규화 좌표로 "가로가 가까운가 세로가 가까운가" 를 재면 종횡비 때문에 틀린다
 * (가로로 긴 도면은 같은 정규화 거리라도 실제로는 가로가 더 멀다).
 * 그래서 이 모듈은 **이미지 px** 만 다루고, 정규화 변환은 호출자가 한다.
 */

export type LabelGridItem = { defectId: string; x: number; y: number };

/** 정렬 입력 — 번호 위치와 그 번호가 가리키는 지시점. 둘 다 **이미지 px** */
export type LabelAnchorItem = {
  defectId: string;
  label: { x: number; y: number };
  /** 마크가 하나도 없으면 `null` — 그런 결함은 제자리에 둔다 */
  anchor: { x: number; y: number } | null;
};

/** 지시선 방향. `V` = 세로(번호가 지시점 위/아래), `H` = 가로(왼쪽/오른쪽) */
type Axis = 'V' | 'H';

/**
 * 줄 잡기 — 값들을 정렬해 **폭이 `tol` 을 넘지 않는 덩어리**로 끊고, 각 덩어리를 평균값 하나로 모은다.
 *
 * 덩어리 폭을 `시작값 기준`으로 재는 것이 중요하다. `직전값 기준`(단일 연결)으로 하면
 * 조금씩 어긋난 값들이 사슬처럼 이어져 도면 절반이 한 줄로 빨려 들어간다.
 */
function assignLines(values: readonly number[], tol: number): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v || a.i - b.i);
  const out = new Array<number>(values.length);
  let start = 0;
  while (start < order.length) {
    let end = start;
    while (end + 1 < order.length && order[end + 1]!.v - order[start]!.v <= tol) end += 1;
    let sum = 0;
    for (let k = start; k <= end; k += 1) sum += order[k]!.v;
    const rep = sum / (end - start + 1);
    for (let k = start; k <= end; k += 1) out[order[k]!.i] = rep;
    start = end + 1;
  }
  return out;
}

const key = (x: number, y: number): string => `${x.toFixed(3)},${y.toFixed(3)}`;

/** 0 이면 아래(또는 오른쪽)로 민다 — 번호가 지시점 위에 겹쳐 앉는 것만 피하면 된다 */
const signOf = (v: number): number => (v < 0 ? -1 : 1);

export type LabelAlignOptions = {
  /** 같은 줄로 볼 허용오차 (이미지 px) */
  tol: number;
  /** 지시점에서 번호까지 최소 거리 (이미지 px). 번호가 지시점을 덮으면 둘 다 안 보인다 */
  minOffset: number;
  /** 같은 자리로 겹쳤을 때 밀 간격 (이미지 px) */
  gap: number;
};

/**
 * 번호를 지시점과 **직교**시키고, 남는 축을 이웃과 맞춘다. **입력 순서 그대로** 돌려준다.
 *
 * 허용오차가 0 이하이면 줄을 잡을 수 없으므로 아무것도 안 옮긴다
 * (도면 크기를 아직 모르는 상태에서 눌렸을 때).
 */
export function alignLabelsToAnchors(
  items: readonly LabelAnchorItem[],
  opts: LabelAlignOptions,
): LabelGridItem[] {
  const { tol, minOffset, gap } = opts;
  if (!(tol > 0)) return items.map((i) => ({ defectId: i.defectId, ...i.label }));

  // ── 1순위: 지시선을 수평 또는 수직으로 ──────────────────────────────────
  type Placed = { defectId: string; axis: Axis | null; pinned: number; free: number };
  const placed: Placed[] = items.map((it) => {
    if (!it.anchor) {
      return { defectId: it.defectId, axis: null, pinned: it.label.x, free: it.label.y };
    }
    const dx = it.label.x - it.anchor.x;
    const dy = it.label.y - it.anchor.y;
    // 이미 더 가까운 쪽으로 눕힌다 — 번호가 반대편으로 튀어 지시선이 도면을 가로지르지 않게
    const axis: Axis = Math.abs(dy) >= Math.abs(dx) ? 'V' : 'H';
    const along = axis === 'V' ? dy : dx;
    const offset = signOf(along) * Math.max(Math.abs(along), minOffset);
    return axis === 'V'
      ? { defectId: it.defectId, axis, pinned: it.anchor.x, free: it.anchor.y + offset }
      : { defectId: it.defectId, axis, pinned: it.anchor.y, free: it.anchor.x + offset };
  });

  // ── 2순위: 자유로운 축만 이웃과 모은다 (묶인 축은 안 건드린다 = 직교 유지) ──
  // 방향이 다르면 같은 줄이 될 수 없다. 세로 지시선의 y 와 가로 지시선의 x 를
  // 한 덩어리에 넣으면 서로 무관한 값이 섞인다
  for (const axis of ['V', 'H'] as const) {
    const group = placed.filter((p) => p.axis === axis);
    if (group.length < 2) continue;
    const lines = assignLines(
      group.map((p) => p.free),
      tol,
    );
    group.forEach((p, i) => {
      p.free = lines[i]!;
    });
  }

  // ── 겹침 해소 — 자유로운 축으로만 민다. 여기서도 직교는 안 깨진다 ────────
  const order = [...placed].sort(
    (a, b) =>
      a.pinned - b.pinned ||
      a.free - b.free ||
      (a.defectId < b.defectId ? -1 : a.defectId > b.defectId ? 1 : 0),
  );
  const taken = new Set<string>();
  const out = new Map<string, LabelGridItem>();
  const step = gap > 0 ? gap : tol;
  for (const p of order) {
    const at = (free: number): { x: number; y: number } =>
      p.axis === 'H' ? { x: free, y: p.pinned } : { x: p.pinned, y: free };
    let free = p.free;
    for (let n = 0; n < 512 && taken.has(key(at(free).x, at(free).y)); n += 1) free += step;
    const q = at(free);
    taken.add(key(q.x, q.y));
    out.set(p.defectId, { defectId: p.defectId, x: q.x, y: q.y });
  }
  return items.map(
    (i) => out.get(i.defectId) ?? { defectId: i.defectId, x: i.label.x, y: i.label.y },
  );
}

/**
 * 같은 줄로 볼 허용오차(이미지 px). 번호 풍선 **지름**을 쓴다 —
 * 풍선 하나 폭 안에 들어오는 것들은 사용자가 보기에 "같은 줄에 두려던 것" 이다.
 *
 * `labelScale`(도면별 번호 크기)이 이미 `balloonRadius` 에 반영돼 있어
 * **도면마다 자동으로 맞고 새 저장 필드가 하나도 안 생긴다.**
 */
export const LABEL_ALIGN_TOLERANCE_FACTOR = 2;

/** 지시점 ↔ 번호 최소 거리. 지름 1.5배면 지시선이 눈에 보인다 */
export const LABEL_ALIGN_MIN_OFFSET_FACTOR = 3;

/** 겹쳤을 때 미는 간격. 지름보다 조금 넓어야 테두리가 안 닿는다 */
export const LABEL_ALIGN_GAP_FACTOR = 2.4;

export function labelAlignOptionsFor(balloonRadius: number): LabelAlignOptions {
  return {
    tol: balloonRadius * LABEL_ALIGN_TOLERANCE_FACTOR,
    minOffset: balloonRadius * LABEL_ALIGN_MIN_OFFSET_FACTOR,
    gap: balloonRadius * LABEL_ALIGN_GAP_FACTOR,
  };
}
