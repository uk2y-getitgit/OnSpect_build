import { describe, expect, it } from 'vitest';
import {
  assignSortOrder,
  changedOrders,
  floorCodeOf,
  floorCodesOf,
  floorsNeedingOrderCheck,
  parseFloorName,
  parsedSortOrder,
  renumber,
  reorder,
  sortByOrder,
  type Ordered,
} from '../src/floorOrder.js';
import { FLOOR_CODE_MAX, normalizeFloorCode, SORT_EXTERIOR, SORT_ROOFTOP } from '../src/types.js';

function f(id: string, name: string, sortOrder: number): Ordered {
  return { id, name, sortOrder };
}

/** 자동 부여로 목록을 만든다 — 실제 사용 경로와 같다 */
function build(names: string[]): Ordered[] {
  const out: Ordered[] = [];
  names.forEach((n, i) => out.push(f(`f${i}`, n, assignSortOrder(n, out))));
  return out;
}

describe('parseFloorName — §2-7-a 표', () => {
  it('지하 n 은 음수다 (불변식 5)', () => {
    for (const s of ['지하3층', '지하 3층', 'B3', 'b3', 'B3F']) {
      expect(parseFloorName(s), s).toEqual({ kind: 'BELOW', n: 3, sortOrder: -30 });
    }
  });

  it('지상 n', () => {
    for (const s of ['지상1층', '1층', '1F', 'F1']) {
      expect(parseFloorName(s), s).toEqual({ kind: 'ABOVE', n: 1, sortOrder: 10 });
    }
  });

  it('두 자리 층도 정수 격자로 해석한다 — 문자열 정렬이었다면 지하10층 < 지하2층 이 된다', () => {
    expect(parsedSortOrder('지하10층')).toBe(-100);
    expect(parsedSortOrder('지하2층')).toBe(-20);
    expect(parsedSortOrder('B10')).toBe(-100);
    expect(parsedSortOrder('10층')).toBe(100);
  });

  it('옥탑 · 옥상 · PIT', () => {
    for (const s of ['옥탑', '옥탑층', 'PH', 'R', 'RF']) {
      expect(parsedSortOrder(s), s).toBe(9000);
    }
    for (const s of ['옥상', '지붕층']) expect(parsedSortOrder(s), s).toBe(8000);
    for (const s of ['PIT', '피트', '기계실피트']) expect(parsedSortOrder(s), s).toBe(-9000);
  });

  it('애매한 이름은 파싱하지 않는다 — 잘못 해석하면 출력 순서가 조용히 틀린다', () => {
    for (const s of ['중2층', 'A구역', '주차램프', '', '층']) {
      expect(parseFloorName(s).kind, s).toBe('UNKNOWN');
    }
  });
});

describe('assignSortOrder', () => {
  it('파싱 실패는 목록 맨 끝으로 간다', () => {
    const list = build(['지하2층', '지상1층']);
    expect(assignSortOrder('중2층', list)).toBe(20); // max(10) + 10
  });

  it('빈 목록에 파싱 실패 이름을 넣으면 10 이다', () => {
    expect(assignSortOrder('A구역', [])).toBe(10);
  });

  it('같은 값이 이미 있으면 +1 씩 밀되 부호는 보존된다', () => {
    const list = build(['지하1층']);
    const s = assignSortOrder('지하1층', list);
    expect(s).toBe(-9);
    expect(s).toBeLessThan(0);
  });

  it('순서 없이 넣어도 지하 → 지상 → 옥탑 으로 정렬된다 (T7 완료 조건)', () => {
    const list = build(['옥탑', '1층', '지하2층']);
    expect(sortByOrder(list).map((x) => x.name)).toEqual(['지하2층', '1층', '옥탑']);
  });
});

describe('reorder — §2-7-b', () => {
  it('이웃 사이에 자리가 있으면 중간 정수를 쓴다', () => {
    const list = build(['지하2층', '지하1층', '1층', '2층']); // -20 -10 10 20
    const after = reorder(list, 'f3', 0); // 2층을 맨 앞으로
    expect(after.map((x) => x.name)).toEqual(['2층', '지하2층', '지하1층', '1층']);
    // 앞이 비었으므로 prev = -20 - 2*STEP = -40, next = -20 → 중간 정수 -30
    expect(after[0]!.sortOrder).toBe(-30);
  });

  it('재배치 후에도 표시 순서가 보존된다', () => {
    const list = build(['지하2층', '지하1층', '1층', '2층', '3층']);
    const after = reorder(list, 'f0', 4);
    expect(after.map((x) => x.name)).toEqual(['지하1층', '1층', '2층', '3층', '지하2층']);
    expect(sortByOrder(after).map((x) => x.name)).toEqual(after.map((x) => x.name));
  });

  it('자리가 없으면 재번호하고, 앞쪽 지하 구간은 여전히 음수다', () => {
    // 인접 정수라 사이에 넣을 자리가 없다 → 그 동 전체 재번호
    const list = [f('a', '지하2층', -2), f('b', '지하1층', -1), f('c', '1층', 0), f('d', '2층', 1)];
    const after = reorder(list, 'd', 2); // 2층을 1층 앞으로
    expect(after.map((x) => x.name)).toEqual(['지하2층', '지하1층', '2층', '1층']);
    expect(after.map((x) => x.sortOrder)).toEqual([-20, -10, 10, 20]);
    // 재번호 뒤에도 앞쪽 지하 구간은 음수다 (불변식 5)
    expect(after[0]!.sortOrder).toBeLessThan(0);
    expect(after[1]!.sortOrder).toBeLessThan(0);
    expect(after[2]!.sortOrder).toBeGreaterThan(0);
  });

  it('층 12개에서 맨 위를 맨 아래로 끌었다 되돌려도 순서와 부호가 유지된다 (qa 경계조건)', () => {
    const names = ['지하3층', '지하2층', '지하1층', '1층', '2층', '3층', '4층', '5층', '6층', '7층', '8층', '옥탑'];
    let cur = build(names);
    for (let i = 0; i < 6; i += 1) {
      cur = reorder(cur, cur[cur.length - 1]!.id, 0); // 맨 아래로
      cur = reorder(cur, cur[0]!.id, cur.length - 1); // 다시 맨 위로
    }
    expect(cur.map((x) => x.name)).toEqual(names);
    // 표시 순서와 sortOrder 정렬이 항상 일치한다
    expect(sortByOrder(cur).map((x) => x.id)).toEqual(cur.map((x) => x.id));
    // 앞쪽 지하 3개는 음수를 유지한다
    const fixed = renumber(cur);
    expect(fixed.slice(0, 3).every((x) => x.sortOrder < 0)).toBe(true);
    expect(fixed.slice(3).every((x) => x.sortOrder > 0)).toBe(true);
  });

  it('사용자가 부호 규약과 모순되게 놓으면 사용자 순서가 이긴다', () => {
    const list = build(['지하3층', '지상2층']);
    const after = reorder(list, 'f0', 1); // 지하3층을 지상2층 아래(뒤)로
    expect(after.map((x) => x.name)).toEqual(['지상2층', '지하3층']);
  });

  it('원소가 1개면 아무 일도 하지 않는다', () => {
    const list = build(['1층']);
    expect(reorder(list, 'f0', 0)).toEqual(list);
  });
});

describe('renumber', () => {
  it('앞쪽 연속 지하 구간만 음수로 되돌린다', () => {
    const arr = [f('a', '지하2층', 5), f('b', '지하1층', 6), f('c', '1층', 7), f('d', '지하5층', 8)];
    const out = renumber(arr);
    expect(out.map((x) => x.sortOrder)).toEqual([-20, -10, 10, 20]);
  });

  it('PIT 도 지하 구간으로 센다', () => {
    const arr = [f('a', 'PIT', 1), f('b', '지하1층', 2), f('c', '1층', 3)];
    expect(renumber(arr).map((x) => x.sortOrder)).toEqual([-20, -10, 10]);
  });
});

describe('floorsNeedingOrderCheck', () => {
  it('이름만 바꿔 위치와 어긋나면 표시한다 (자동으로 고치지 않는다)', () => {
    const arr = [f('a', '지하1층', 10), f('b', '지하3층', 20)];
    expect([...floorsNeedingOrderCheck(arr)].sort()).toEqual(['a', 'b']);
  });

  it('정상 순서면 비어 있다', () => {
    expect(floorsNeedingOrderCheck(build(['지하2층', '지하1층', '1층'])).size).toBe(0);
  });
});

describe('changedOrders', () => {
  it('실제로 값이 바뀐 레코드만 돌려준다', () => {
    const before = build(['지하1층', '1층']);
    const after = before.map((x) => (x.id === 'f1' ? { ...x, sortOrder: 99 } : x));
    expect(changedOrders(before, after).map((x) => x.id)).toEqual(['f1']);
  });
});

/**
 * D19 §5-5(b)(c) — 외부 층 파싱 + 출력 접두어 파생.
 *
 * ⚠️ 접두어는 **파생값**이다. 저장하지 않는다(불변식 #2).
 */
describe('EXTERIOR — D19 외부 층', () => {
  it('외부 · 외곽 · 옥외 · 외벽 · EXT · EXTERIOR 를 옥탑보다 뒤로 읽는다', () => {
    for (const s of ['외부', '외곽', '옥외', '외벽', 'EXT', 'EXTERIOR', '건물 외부', '외벽부']) {
      expect(parseFloorName(s), s).toEqual({ kind: 'EXTERIOR', sortOrder: SORT_EXTERIOR });
    }
    expect(SORT_EXTERIOR).toBeGreaterThan(SORT_ROOFTOP);
  });

  it('`옥외` 를 옥상(ROOF)으로 오인하지 않는다', () => {
    expect(parseFloorName('옥외').kind).toBe('EXTERIOR');
    expect(parseFloorName('옥상').kind).toBe('ROOF');
    expect(parseFloorName('옥탑').kind).toBe('ROOFTOP');
  });

  it('`W` 자체는 층 이름 패턴이 아니다 — 출력 코드일 뿐이다', () => {
    expect(parseFloorName('W').kind).toBe('UNKNOWN');
  });

  it('PIT 이 여전히 먼저다 (외부 검사가 PIT 을 가로채지 않는다)', () => {
    expect(parseFloorName('기계실피트').kind).toBe('PIT');
  });
});

describe('floorCodeOf — D19 접두어 파생', () => {
  it('이름에서 판다', () => {
    expect(floorCodeOf({ name: '지상1층' })).toBe('1F');
    expect(floorCodeOf({ name: '3층' })).toBe('3F');
    expect(floorCodeOf({ name: '지하1층' })).toBe('B1F');
    expect(floorCodeOf({ name: '외부' })).toBe('W');
    expect(floorCodeOf({ name: '기계실피트' })).toBe('PIT');
  });

  it('옥상=RF · 옥탑=PH (국제 관례 + 사용자 예시 `RF-01`)', () => {
    expect(floorCodeOf({ name: '옥상' })).toBe('RF');
    expect(floorCodeOf({ name: '지붕층' })).toBe('RF');
    expect(floorCodeOf({ name: '옥탑' })).toBe('PH');
    // ⚠️ 파서는 문자열 `RF` 를 옥탑으로 읽는다 → 코드는 PH 다. 헷갈리면 직접 입력하면 된다
    expect(floorCodeOf({ name: 'RF' })).toBe('PH');
  });

  it('파싱 실패면 접두어가 없다 (번호만 나간다)', () => {
    expect(floorCodeOf({ name: '중간층' })).toBeNull();
    expect(floorCodeOf({ name: '' })).toBeNull();
  });

  it('직접 입력한 code 가 이름 파생을 이긴다', () => {
    expect(floorCodeOf({ name: '지상1층', code: 'w' })).toBe('W');
    expect(floorCodeOf({ name: '중간층', code: 'M1' })).toBe('M1');
  });

  it('빈 code 는 없는 것과 같다', () => {
    expect(floorCodeOf({ name: '지상2층', code: '' })).toBe('2F');
    expect(floorCodeOf({ name: '지상2층', code: '   ' })).toBe('2F');
    expect(floorCodeOf({ name: '지상2층', code: null })).toBe('2F');
  });
});

describe('normalizeFloorCode — 공백 제거 · 대문자 · 최대 6자', () => {
  it('빈 값은 null (자동 파생)', () => {
    expect(normalizeFloorCode('')).toBeNull();
    expect(normalizeFloorCode('   ')).toBeNull();
    expect(normalizeFloorCode(null)).toBeNull();
    expect(normalizeFloorCode(undefined)).toBeNull();
  });

  it('공백을 지우고 대문자로 올린다', () => {
    expect(normalizeFloorCode(' b1 f ')).toBe('B1F');
  });

  it('6자를 넘으면 자른다', () => {
    expect(normalizeFloorCode('ABCDEFGH')).toBe('ABCDEF');
    expect(FLOOR_CODE_MAX).toBe(6);
  });
});

describe('floorCodesOf — 출력 스냅샷 맵', () => {
  it('층 id → 접두어. 파생 실패는 null 로 남긴다', () => {
    expect(
      floorCodesOf([
        { id: 'a', name: '지하1층' },
        { id: 'b', name: '지상1층', code: null },
        { id: 'c', name: '중간층' },
        { id: 'd', name: '외부' },
      ]),
    ).toEqual({ a: 'B1F', b: '1F', c: null, d: 'W' });
  });
});
