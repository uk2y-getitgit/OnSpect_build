/**
 * 항목 정렬 — S1 층 정렬(`floorOrder.ts`)과 **같은 STEP=10 격자**를 쓴다 (§2-2).
 *
 * 다른 점 하나: 지하 개념이 없으므로 **음수 규약이 없다.** 항상 10, 20, 30 … 이다.
 * 그래서 층의 `renumber()`(이름 파싱으로 부호를 복원한다)를 그대로 쓰지 않고
 * 격자 재부여만 하는 순수 함수를 따로 둔다.
 *
 * 저장 단위가 문서 하나라서 재부여 비용이 0 이다 — 드래그 한 번에 목록 전체를 다시 매긴다.
 * 덕분에 sortOrder 격자가 무너질 일이 없다.
 */
import { ITEM_STEP } from './types.js';

export type Sortable = { sortOrder: number };

/**
 * sortOrder 오름차순. 동률이면 `keyOf` 로 안정 정렬한다 —
 * 링크에는 `id` 가 없으므로 비교 키를 주입받는다.
 */
export function sortItems<T extends Sortable>(items: readonly T[], keyOf: (x: T) => string): T[] {
  return [...items].sort((a, b) =>
    a.sortOrder !== b.sortOrder
      ? a.sortOrder - b.sortOrder
      : keyOf(a) < keyOf(b)
        ? -1
        : keyOf(a) > keyOf(b)
          ? 1
          : 0,
  );
}

/** 표시 순서를 그대로 두고 10, 20, 30 … 을 다시 매긴다 */
export function renumberItems<T extends Sortable>(arr: readonly T[]): T[] {
  return arr.map((x, i) => {
    const sortOrder = (i + 1) * ITEM_STEP;
    return sortOrder === x.sortOrder ? x : { ...x, sortOrder };
  });
}

/** 목록 끝에 붙일 sortOrder */
export function nextSortOrder(items: readonly Sortable[]): number {
  let max = 0;
  for (const x of items) if (x.sortOrder > max) max = x.sortOrder;
  return max + ITEM_STEP;
}

/**
 * 드래그 재배치. **표시 순서가 진실이다.**
 * `movedKey` 를 `toIndex` 자리로 옮기고 목록 전체에 격자를 다시 부여한다.
 */
export function reorderItems<T extends Sortable>(
  items: readonly T[],
  keyOf: (x: T) => string,
  movedKey: string,
  toIndex: number,
): T[] {
  const arr = sortItems(items, keyOf);
  const from = arr.findIndex((x) => keyOf(x) === movedKey);
  if (from < 0 || arr.length < 2) return arr;

  const to = Math.max(0, Math.min(arr.length - 1, toIndex));
  if (from === to) return arr;

  const moved = arr[from]!;
  const next = arr.filter((x) => keyOf(x) !== movedKey);
  next.splice(to, 0, moved);
  return renumberItems(next);
}
