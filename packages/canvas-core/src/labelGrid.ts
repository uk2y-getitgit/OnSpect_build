/**
 * P-2 (D28 · Q71) — 번호 풍선 **격자 스냅 정렬**.
 *
 * 보고서에 그대로 인쇄되는 그림이라, 흩어진 번호를 균일 격자에 맞춰 줄을 세운다.
 *
 * ## 이 모듈이 하지 않는 것
 * - **결함점(마크)은 건드리지 않는다.** 움직이는 것은 풍선 위치뿐이고 지시선이 따라 늘어난다
 * - **도면 밖(여백) 이동은 하지 않는다** (D28 — 1차 범위에서 제외)
 * - 어떤 결함을 넣을지 **고르지 않는다.** 잠긴 결함 제외는 호출자가 한다
 *
 * ## 좌표계
 * 입력·출력 모두 **0~1 정규화**다(불변식 #1). 그런데 정규화 공간에서 균등 격자를 만들면
 * 종횡비 때문에 찌그러진다 — 도면이 가로로 길면 격자도 가로로 늘어난 직사각형이 된다.
 * 그래서 `stepX`·`stepY` 를 **따로** 받는다. 호출자가 이미지 px 간격 하나를
 * `/iw`·`/ih` 로 나눠 넘기면 화면에서는 정사각 격자가 된다.
 *
 * ## 겹침
 * 두 풍선이 같은 격자점으로 반올림되면 하나는 빈 이웃 칸으로 밀린다. 밀리는 순서는
 * **결정적**이다(격자 좌표 → `defectId`) — 같은 입력이면 언제나 같은 그림이 나온다.
 * 안 그러면 정렬을 두 번 눌렀을 때 결과가 달라져 보고서 재현이 깨진다.
 */

export type LabelGridItem = { defectId: string; x: number; y: number };

const key = (col: number, row: number): string => `${col},${row}`;

/**
 * `(col,row)` 부터 바깥으로 돌며 **비어 있는 첫 격자점**을 찾는다.
 * 후보 순서는 `거리² → dx → dy` 로 고정한다 — 같은 거리의 칸이 여럿이면 항상 같은 것을 고른다.
 */
function freeNode(
  taken: ReadonlySet<string>,
  col: number,
  row: number,
): { col: number; row: number } {
  if (!taken.has(key(col, row))) return { col, row };
  for (let r = 1; r <= 64; r++) {
    const ring: Array<{ dx: number; dy: number }> = [];
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        // 링의 테두리만 — 안쪽은 이전 반복에서 이미 봤다
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        ring.push({ dx, dy });
      }
    }
    ring.sort((a, b) => a.dx * a.dx + a.dy * a.dy - (b.dx * b.dx + b.dy * b.dy) || a.dx - b.dx || a.dy - b.dy);
    for (const o of ring) {
      const c = col + o.dx;
      const w = row + o.dy;
      if (!taken.has(key(c, w))) return { col: c, row: w };
    }
  }
  // 64링(=격자점 16000여 개)까지 다 찼으면 포기하고 제자리에 둔다. 실무에서 닿지 않는다
  return { col, row };
}

/**
 * 각 풍선을 가장 가까운 격자점으로 옮긴다. **입력 순서 그대로** 돌려준다.
 *
 * `stepX`·`stepY` 가 0 이하이면 격자를 만들 수 없으므로 아무것도 안 옮긴다
 * (도면 크기를 아직 모르는 상태에서 눌렸을 때).
 */
export function alignLabelsToGrid(
  items: readonly LabelGridItem[],
  stepX: number,
  stepY: number,
): LabelGridItem[] {
  if (!(stepX > 0) || !(stepY > 0)) return items.map((i) => ({ ...i }));

  const seeded = items.map((item) => ({
    item,
    col: Math.round(item.x / stepX),
    row: Math.round(item.y / stepY),
  }));
  // 결정적 처리 순서. 위→아래, 왼→오른쪽, 같은 칸이면 id 순
  seeded.sort(
    (a, b) =>
      a.row - b.row ||
      a.col - b.col ||
      (a.item.defectId < b.item.defectId ? -1 : a.item.defectId > b.item.defectId ? 1 : 0),
  );

  const taken = new Set<string>();
  const placed = new Map<string, LabelGridItem>();
  for (const s of seeded) {
    const n = freeNode(taken, s.col, s.row);
    taken.add(key(n.col, n.row));
    placed.set(s.item.defectId, {
      defectId: s.item.defectId,
      x: n.col * stepX,
      y: n.row * stepY,
    });
  }
  return items.map((i) => placed.get(i.defectId) ?? { ...i });
}

/**
 * 격자 간격(이미지 px). 번호 풍선 크기에 비례시킨다(Q71 ① A안) —
 * 도면별 번호 크기(`labelScale`)가 이미 `balloonRadius` 에 반영돼 있어서
 * **도면마다 자동으로 맞고 새 저장 필드가 하나도 안 생긴다.**
 */
export const LABEL_GRID_FACTOR = 2.5;

export function labelGridStepImgPx(balloonRadius: number): number {
  return balloonRadius * LABEL_GRID_FACTOR;
}
