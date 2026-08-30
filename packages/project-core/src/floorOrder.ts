/**
 * 층 정렬 — S1 스펙 §2-7. **불변식 5의 구현체다.**
 *
 *   `sortOrder` 는 정수이고, 오름차순 = 아래층 → 위층이며,
 *   지하로 파싱된 층은 자동 부여 직후 반드시 **음수**다.
 *
 * `STEP = 10` 인 이유: 층 사이에 새 층을 끼울 자리를 남긴다.
 * 중간층·중이층처럼 실무 표기가 갈리는 이름은 **파싱하지 않는다** —
 * 잘못 해석하면 출력 순서가 조용히 틀린다. 목록 끝에 넣고 드래그가 최종 권한이다.
 *
 * ⚠️ 순수 함수. DB·전역 상태·시간을 참조하지 않는다.
 */
import {
  BUILDING_STEP,
  FLOOR_STEP,
  normalizeFloorCode,
  SORT_EXTERIOR,
  SORT_PIT,
  SORT_ROOF,
  SORT_ROOFTOP,
} from './types.js';

export type FloorParse =
  | { kind: 'BELOW'; n: number; sortOrder: number }
  | { kind: 'ABOVE'; n: number; sortOrder: number }
  | { kind: 'ROOFTOP'; sortOrder: number }
  | { kind: 'ROOF'; sortOrder: number }
  | { kind: 'PIT'; sortOrder: number }
  /** D19 — 외부 · 외곽 · 옥외 · 외벽. 출력 접두어는 `W` */
  | { kind: 'EXTERIOR'; sortOrder: number }
  | { kind: 'UNKNOWN' };

/** 파싱 결과가 지하(음수 구역)인가 — 재번호에서 부호 규약 복원에 쓴다 */
export function isBelowGrade(p: FloorParse): boolean {
  return p.kind === 'BELOW' || p.kind === 'PIT';
}

/** 공백 제거 + 대문자화. 대소문자·공백을 무시한다 (§2-7-a) */
function norm(name: string): string {
  return name.replace(/\s+/g, '').toUpperCase();
}

/**
 * EXTERIOR 로 인정하는 층 이름 — **완전일치 목록이다**(공백 제거·대문자 후 비교).
 * 부분일치로 넓히지 마라: `지상3층 외벽` 이 EXTERIOR 로 읽히면 그 층 도면이 목록 맨 위로 간다.
 */
const EXTERIOR_NAMES = new Set(['외부', '외곽', '옥외', '외벽', '외부전경', 'EXT', 'EXTERIOR']);

/**
 * 이름 → sortOrder 해석 (§2-7-a).
 *
 * | 입력                         | 해석    | sortOrder |
 * | `지하3층` `B3` `b3` `B3F`     | 지하 n  | `-n×10`   |
 * | `지상1층` `1층` `1F` `F1`      | 지상 n  | `n×10`    |
 * | `옥탑` `PH` `R` `RF`          | 옥탑    | `9000`    |
 * | `옥상` `지붕층`                | 옥상    | `8000`    |
 * | `PIT` `피트` `기계실피트`       | 최하단  | `-9000`   |
 * | 그 외                         | 실패    | —         |
 */
export function parseFloorName(name: string): FloorParse {
  const s = norm(name);
  if (s === '') return { kind: 'UNKNOWN' };

  // PIT 이 가장 먼저다 — `기계실피트` 처럼 접두어가 붙어도 최하단이다
  if (s.includes('PIT') || s.includes('피트')) return { kind: 'PIT', sortOrder: SORT_PIT };

  // D19 외부 — **완전일치만** 인정한다 (2026-08-30 검수 보통3).
  //
  // 예전에는 `includes` 였다. 그래서 `지상3층 외벽` · `지하1층 외부계단` 처럼 **층 번호가 들어간**
  // 이름까지 EXTERIOR(9500)로 삼켰다 — 3층 도면이 목록 맨 위로 올라가고 `순서 확인` 배지가 떴다.
  // 사용자가 실제로 입력하는 외부 층 이름은 `외부` · `외벽` 같은 짧은 단어다(스펙 §5-5-b).
  // 그 외의 조합은 UNKNOWN 으로 두고 드래그에 맡긴다 — 잘못 해석하는 것보다 낫다.
  // ⚠️ `W` 는 넣지 않는다 — `W` 는 *출력 코드*이지 층 *이름*이 아니다
  if (EXTERIOR_NAMES.has(s)) return { kind: 'EXTERIOR', sortOrder: SORT_EXTERIOR };

  // 옥탑 — `RF` 를 `F` 계열보다 먼저 걸러야 한다
  if (s.includes('옥탑') || s === 'PH' || s === 'PENTHOUSE' || s === 'R' || s === 'RF') {
    return { kind: 'ROOFTOP', sortOrder: SORT_ROOFTOP };
  }
  if (s.includes('옥상') || s.includes('지붕')) return { kind: 'ROOF', sortOrder: SORT_ROOF };

  // 지하 n
  const below = /^지하(\d+)층?$/.exec(s) ?? /^B(\d+)F?$/.exec(s);
  if (below) {
    const n = Number(below[1]);
    if (n > 0) return { kind: 'BELOW', n, sortOrder: -n * FLOOR_STEP };
  }

  // 지상 n
  const above =
    /^지상(\d+)층?$/.exec(s) ??
    /^(\d+)층$/.exec(s) ??
    /^(\d+)F$/.exec(s) ??
    /^F(\d+)$/.exec(s);
  if (above) {
    const n = Number(above[1]);
    if (n > 0) return { kind: 'ABOVE', n, sortOrder: n * FLOOR_STEP };
  }

  return { kind: 'UNKNOWN' };
}

/**
 * D19 — 층 이름에서 파생한 접두어 **제안값**. ⚠️ **출력에 쓰지 마라**(D20).
 *
 * `ProjectSetup` 의 접두어 입력칸 **placeholder 전용**이다. 사용자가 그 제안을 보고
 * 직접 입력해야 비로소 출력에 반영된다 — 그것이 D20 의 "옵트인"이다.
 * `floor.code` 를 직접 넣었으면 그것을 그대로(공백 제거 · 대문자) 쓰고,
 * 없으면 이름에서 파생한다. 파싱 실패면 `null` = 제안 없음.
 *
 * ⚠️ `ROOF → 'RF'` · `ROOFTOP → 'PH'` 인 이유: 파서는 문자열 `'RF'` 를 **옥탑**으로 읽지만
 * (`parseFloorName` 의 `s === 'RF'`), 국제 관례는 RF = Roof Floor · PH = Penthouse 이고
 * 사용자 예시도 옥상을 `RF-01` 로 적었다. 두 요구를 동시에 만족시키는 매핑이다.
 */
export function floorCodeOf(floor: { name: string; code?: string | null }): string | null {
  const manual = (floor.code ?? '').trim();
  if (manual !== '') return manual.toUpperCase();
  const p = parseFloorName(floor.name);
  switch (p.kind) {
    case 'ABOVE':
      return `${p.n}F`;
    case 'BELOW':
      return `B${p.n}F`;
    case 'ROOF':
      return 'RF';
    case 'ROOFTOP':
      return 'PH';
    case 'PIT':
      return 'PIT';
    case 'EXTERIOR':
      return 'W';
    default:
      return null;
  }
}

/**
 * 층 id → 접두어 맵. **출력 당시 스냅샷**(`ExportParams.floorCodes`)을 만드는 유일한 경로다 —
 * 화면·엑셀·인쇄 뷰·조사위치도가 각자 파생하면 층 이름을 고친 뒤 서로 어긋난다.
 *
 * ⭐ **D20 — 수동 입력만 읽는다. 이름에서 파생하지 않는다.**
 * 접두어를 한 곳도 넣지 않은 용역은 값이 전부 `null` 이고, 산출물은 접두어 도입 전과
 * **한 글자도 다르지 않다**(NO 열 `1`·`2`·`3`). 옛 `ExportRun` 재다운로드도 같은 이유로 재현된다.
 * 자동 파생(`floorCodeOf`)은 입력칸 placeholder 에서만 쓴다.
 */
export function floorCodesOf(
  floors: readonly { id: string; name: string; code?: string | null }[],
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const f of floors) out[f.id] = normalizeFloorCode(f.code);
  return out;
}

/** 이 용역에 사용자가 접두어를 하나라도 넣었는가 — 번호모드 자동 제안의 조건 (D20) */
export function hasAnyFloorCode(
  floors: readonly { code?: string | null }[],
): boolean {
  return floors.some((f) => normalizeFloorCode(f.code) !== null);
}

/** 파싱된 sortOrder. 실패면 null (호출부가 `UNKNOWN` 분기를 매번 쓰지 않게) */
export function parsedSortOrder(name: string): number | null {
  const p = parseFloorName(name);
  return p.kind === 'UNKNOWN' ? null : p.sortOrder;
}

export type Ordered = { id: string; name: string; sortOrder: number };

/**
 * 새 층의 sortOrder 자동 부여 (§2-7-a).
 * 파싱 실패면 **목록 맨 끝** — 사용자가 드래그로 제자리에 놓는다.
 * 이미 쓰이는 값이면 +1 씩 밀어 유일하게 만든다(부호는 보존된다).
 */
export function assignSortOrder(name: string, siblings: readonly Ordered[]): number {
  const p = parseFloorName(name);
  const taken = new Set(siblings.map((f) => f.sortOrder));

  let base: number;
  if (p.kind === 'UNKNOWN') {
    const max = siblings.length === 0 ? 0 : Math.max(...siblings.map((f) => f.sortOrder));
    base = max + FLOOR_STEP;
  } else {
    base = p.sortOrder;
  }
  while (taken.has(base)) base += 1;
  return base;
}

/** 새 동의 sortOrder — 항상 목록 끝 (동은 이름으로 정렬하지 않는다) */
export function assignBuildingSortOrder(siblings: readonly Ordered[]): number {
  const max = siblings.length === 0 ? -BUILDING_STEP : Math.max(...siblings.map((b) => b.sortOrder));
  return max + BUILDING_STEP;
}

/** 표시 순서 = sortOrder 오름차순. 동률이면 id 사전순(결정론적) */
export function sortByOrder<T extends Ordered>(items: readonly T[]): T[] {
  return [...items].sort((a, b) =>
    a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
}

/**
 * 표시 순서를 보존하면서 부호 규약을 복원한다 (§2-7-b).
 *
 * 앞에서부터 **연속으로** 지하로 파싱되는 구간만 음수로 되돌린다.
 * 중간에 지상이 끼면 거기서 멈춘다 — 사용자가 일부러 그렇게 놓았을 수 있다.
 */
export function renumber<T extends Ordered>(arr: readonly T[]): T[] {
  let belowCount = 0;
  for (const f of arr) {
    if (!isBelowGrade(parseFloorName(f.name))) break;
    belowCount += 1;
  }
  return arr.map((f, i) => {
    const sortOrder =
      i < belowCount ? -(belowCount - i) * FLOOR_STEP : (i - belowCount + 1) * FLOOR_STEP;
    return sortOrder === f.sortOrder ? f : { ...f, sortOrder };
  });
}

/**
 * 드래그 재배치 (§2-7-b). **표시 순서가 진실이다.**
 * 이웃 사이에 정수 자리가 있으면 그 중간값을, 없으면 그 동 전체를 재번호한다.
 *
 * 사용자가 부호 규약과 모순되게 놓아도 경고하지 않는다 —
 * 실무에는 우리가 모르는 층 표기가 있다. **드래그가 최종 권한이다.**
 */
export function reorder<T extends Ordered>(
  items: readonly T[],
  movedId: string,
  newIndex: number,
): T[] {
  const arr = sortByOrder(items);
  const from = arr.findIndex((x) => x.id === movedId);
  if (from < 0 || arr.length < 2) return arr;

  const to = Math.max(0, Math.min(arr.length - 1, newIndex));
  if (from === to) return arr;

  const moved = arr[from]!;
  const next = arr.filter((x) => x.id !== movedId);
  next.splice(to, 0, moved);

  const before = next[to - 1];
  const after = next[to + 1];

  // 양옆이 모두 없는 경우는 length<2 에서 이미 걸러졌다
  const prevOrder = before ? before.sortOrder : after!.sortOrder - 2 * FLOOR_STEP;
  const nextOrder = after ? after.sortOrder : prevOrder + 2 * FLOOR_STEP;

  if (nextOrder - prevOrder >= 2) {
    const mid = Math.floor((prevOrder + nextOrder) / 2);
    return next.map((x) => (x.id === movedId ? { ...x, sortOrder: mid } : x));
  }
  return renumber(next);
}

/**
 * 이름을 바꿨는데 현재 위치가 파싱 결과와 어긋나는 층 (§2-7-b).
 * **자동으로 고치지 않는다.** 정렬해 둔 순서를 이름 수정이 흐트러뜨리면 안 된다.
 * 행에 `순서 확인` 라벨만 조용히 띄운다.
 */
export function floorsNeedingOrderCheck<T extends Ordered>(items: readonly T[]): Set<string> {
  const arr = sortByOrder(items);
  const out = new Set<string>();
  for (let i = 0; i < arr.length; i += 1) {
    const cur = arr[i]!;
    const p = parseFloorName(cur.name);
    if (p.kind === 'UNKNOWN') continue;
    const prev = arr[i - 1];
    const nxt = arr[i + 1];
    // 파싱된 층끼리만 비교한다. 파싱 실패 이웃은 사용자가 놓은 자리이므로 판단 근거가 아니다
    if (prev) {
      const pp = parseFloorName(prev.name);
      if (pp.kind !== 'UNKNOWN' && pp.sortOrder > p.sortOrder) out.add(cur.id);
    }
    if (nxt) {
      const np = parseFloorName(nxt.name);
      if (np.kind !== 'UNKNOWN' && np.sortOrder < p.sortOrder) out.add(cur.id);
    }
  }
  return out;
}

/** 재번호·재배치 후 실제로 값이 바뀐 레코드만 (레코드 단위 upsert 용, §2-9-e) */
export function changedOrders<T extends Ordered>(before: readonly T[], after: readonly T[]): T[] {
  const prev = new Map(before.map((x) => [x.id, x.sortOrder]));
  return after.filter((x) => prev.get(x.id) !== x.sortOrder);
}
