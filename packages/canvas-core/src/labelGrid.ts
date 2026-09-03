/**
 * P-2 (D28 · Q71) — 번호 풍선 **직교 정렬**.
 *
 * 보고서에 그대로 인쇄되는 그림이라, 흩어진 번호를 세로줄·가로줄에 맞춰 세운다.
 *
 * ## 2026-09-03 재작성 — 절대 격자를 버렸다
 *
 * 이전 판은 `balloonRadius × 2.5`(= 85px, 풍선 지름 68px) 간격의 **절대 격자**에 스냅했다.
 * 칸이 풍선 하나 크기라 거의 모든 풍선이 자기 칸에 그대로 머물렀고, 사용자 눈에는
 * *"정렬값이 무의미하다"* 로 보였다(실사용 신고).
 *
 * 지금은 **서로 가까운 것끼리 같은 줄로 모은다.** x 를 공유하면 세로줄이 서고,
 * y 를 공유하면 가로줄이 선다 — 이것이 "직교로 정렬" 의 실제 의미다.
 * 절대 좌표가 아니라 **지금 있는 위치들의 평균**으로 줄을 잡으므로 움직임도 최소다.
 *
 * ## 이 모듈이 하지 않는 것
 * - **결함점(마크)은 건드리지 않는다.** 움직이는 것은 풍선 위치뿐이고 지시선이 따라 늘어난다
 * - **도면 밖(여백) 이동은 하지 않는다** (D28 — 1차 범위에서 제외)
 * - 어떤 결함을 넣을지 **고르지 않는다.** 잠긴 결함 제외는 호출자가 한다
 *
 * ## 좌표계
 * 입력·출력 모두 **0~1 정규화**다(불변식 #1). 그런데 정규화 공간에서 같은 허용오차를 쓰면
 * 종횡비 때문에 가로·세로 기준이 달라진다 — 도면이 가로로 길면 세로줄이 과하게 뭉친다.
 * 그래서 `tolX`·`tolY` 를 **따로** 받는다. 호출자가 이미지 px 허용오차 하나를
 * `/iw`·`/ih` 로 나눠 넘기면 화면에서는 가로·세로가 같은 기준이 된다.
 */

export type LabelGridItem = { defectId: string; x: number; y: number };

/**
 * 줄 잡기 — 값들을 정렬해 **폭이 `tol` 을 넘지 않는 덩어리**로 끊고, 각 덩어리를 평균값 하나로 모은다.
 *
 * 덩어리 폭을 `시작값 기준`으로 재는 것이 중요하다. `직전값 기준`(단일 연결)으로 하면
 * 조금씩 어긋난 값들이 사슬처럼 이어져 도면 절반이 한 줄로 빨려 들어간다.
 */
function assignLines(values: readonly number[], tol: number): number[] {
  const order = values
    .map((v, i) => ({ v, i }))
    .sort((a, b) => a.v - b.v || a.i - b.i);
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

const key = (x: number, y: number): string => `${x.toFixed(6)},${y.toFixed(6)}`;

/**
 * 번호 풍선을 세로줄·가로줄에 맞춰 정렬한다. **입력 순서 그대로** 돌려준다.
 *
 * @param tolX  같은 세로줄로 볼 x 허용오차 (정규화)
 * @param tolY  같은 가로줄로 볼 y 허용오차 (정규화)
 * @param gapY  같은 자리로 겹친 풍선을 아래로 밀 간격 (정규화). 풍선 지름 이상이어야 안 겹친다
 *
 * 허용오차가 0 이하이면 줄을 잡을 수 없으므로 아무것도 안 옮긴다
 * (도면 크기를 아직 모르는 상태에서 눌렸을 때).
 */
export function alignLabelsOrthogonal(
  items: readonly LabelGridItem[],
  tolX: number,
  tolY: number,
  gapY: number,
): LabelGridItem[] {
  if (!(tolX > 0) || !(tolY > 0)) return items.map((i) => ({ ...i }));

  const xs = assignLines(
    items.map((i) => i.x),
    tolX,
  );
  const ys = assignLines(
    items.map((i) => i.y),
    tolY,
  );

  // 겹침 해소는 **결정적**이어야 한다 — 같은 입력이면 언제나 같은 그림이 나와야
  // 정렬을 두 번 눌러도 보고서가 재현된다
  const order = items
    .map((it, i) => ({ id: it.defectId, x: xs[i]!, y: ys[i]! }))
    .sort((a, b) => a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const taken = new Set<string>();
  const placed = new Map<string, LabelGridItem>();
  const step = gapY > 0 ? gapY : tolY;
  for (const o of order) {
    let y = o.y;
    // 같은 줄·같은 칸에 이미 있으면 아래로 한 칸씩. 세로줄은 유지되므로 직교가 안 깨진다
    for (let n = 0; n < 512 && taken.has(key(o.x, y)); n += 1) y += step;
    taken.add(key(o.x, y));
    placed.set(o.id, { defectId: o.id, x: o.x, y });
  }
  return items.map((i) => placed.get(i.defectId) ?? { ...i });
}

/**
 * 같은 줄로 볼 허용오차(이미지 px). 번호 풍선 **지름**을 쓴다 —
 * 풍선 하나 폭 안에 들어오는 것들은 사용자가 보기에 "같은 줄에 두려던 것" 이다.
 *
 * `labelScale`(도면별 번호 크기)이 이미 `balloonRadius` 에 반영돼 있어
 * **도면마다 자동으로 맞고 새 저장 필드가 하나도 안 생긴다.**
 */
export const LABEL_ALIGN_TOLERANCE_FACTOR = 2;

/** 겹쳤을 때 아래로 미는 간격(이미지 px). 지름보다 조금 넓어야 테두리가 안 닿는다 */
export const LABEL_ALIGN_GAP_FACTOR = 2.4;

export function labelAlignToleranceImgPx(balloonRadius: number): number {
  return balloonRadius * LABEL_ALIGN_TOLERANCE_FACTOR;
}

export function labelAlignGapImgPx(balloonRadius: number): number {
  return balloonRadius * LABEL_ALIGN_GAP_FACTOR;
}
