/**
 * T1-2 — `Defect` 의 병합 재료(`updatedAt`·`deviceId`·`createdBy`).
 * 스펙 `50_plan-reviewer_spec_Phase5_TeamSync.md` §2 · `DECISIONS.md` D23.
 *
 * 확인하는 것:
 *   · 결함을 만드는 **3곳 전부**(점 · 영역/화살표 · 자유그리기)가 스탬프를 찍는가
 *   · 결함을 고쳐 저장하면 `updatedAt` 이 갱신되는가 (`stampDefect`)
 *   · ⛔ **옛 레코드 읽기 정규화가 `updatedAt` 을 `Date.now()`·`0` 으로 채우지 않는가**
 *     — 스펙 §2-3 이 "가장 위험하다" 고 못 박은 실수다
 */
import { describe, expect, it } from 'vitest';
import { newDefectBase, normalizeDefectBase, stampDefect } from '../src/defectBase.js';
import { NO_KEYS, initialCanvasState, reduce, type ReduceContext } from '../src/interaction.js';
import type { CanvasState, Defect, InputEvent, SPoint } from '../src/types.js';
import { defect, GS } from './helpers.js';

const NOW = 1_700_000_000_000;
const DRAWING = { id: 'dw', imageWidth: 4000, imageHeight: 1000 };
const CANVAS = { w: 900, h: 600 };

let idSeq = 0;
function ctxOf(over: Partial<ReduceContext> = {}): ReduceContext {
  return {
    defects: [],
    memos: [],
    globalStyle: GS,
    makeId: () => `id${(idSeq += 1)}`,
    now: () => NOW,
    deviceId: 'dev-A',
    floorId: 'f1',
    projectId: 'p1',
    ...over,
  };
}

function baseState(tool: CanvasState['tool']): CanvasState {
  return { ...initialCanvasState(CANVAS), drawing: DRAWING, viewport: { zoom: 1, tx: 0, ty: 0 }, tool };
}

function run(state: CanvasState, ctx: ReduceContext, evs: InputEvent[]) {
  let s = state;
  const created: Defect[] = [];
  for (const ev of evs) {
    const r = reduce(s, ev, ctx);
    s = r.state;
    for (const c of r.commands) if (c.k === 'CREATE_DEFECT') created.push(c.defect);
  }
  return { state: s, created };
}

function drag(from: SPoint, to: SPoint): InputEvent[] {
  return [
    { k: 'POINTER_DOWN', pointerId: 1, screen: from, button: 0, keys: NO_KEYS },
    { k: 'POINTER_MOVE', pointerId: 1, screen: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, keys: NO_KEYS },
    { k: 'POINTER_MOVE', pointerId: 1, screen: to, keys: NO_KEYS },
    { k: 'POINTER_UP', pointerId: 1, screen: to, keys: NO_KEYS },
  ];
}

/** Phase 5 이전에 저장된 옛 결함 — 세 필드가 아예 없다 */
function legacy(over: Record<string, unknown> = {}): Defect {
  const d = defect('d-old', 1, { x: 0.3, y: 0.4 }, { x: 0.35, y: 0.45 }) as unknown as Record<
    string,
    unknown
  >;
  delete d.updatedAt;
  delete d.deviceId;
  delete d.createdBy;
  return { ...d, ...over } as unknown as Defect;
}

// ── 생성 3곳 ───────────────────────────────────────────────────────────────
describe('결함 생성 시 스탬프 (스펙 §2-2)', () => {
  it('점 — 클릭으로 만든 결함에 세 필드가 채워진다', () => {
    const { created } = run(baseState('POINT'), ctxOf(), [
      { k: 'POINTER_DOWN', pointerId: 1, screen: { x: 200, y: 150 }, button: 0, keys: NO_KEYS },
      { k: 'POINTER_UP', pointerId: 1, screen: { x: 200, y: 150 }, keys: NO_KEYS },
    ]);
    expect(created).toHaveLength(1);
    expect(created[0]!.updatedAt).toBe(NOW);
    expect(created[0]!.deviceId).toBe('dev-A');
    expect(created[0]!.createdBy).toBeNull();
  });

  it('영역 — 드래그로 만든 결함에 세 필드가 채워진다', () => {
    const { created } = run(baseState('AREA_RECT'), ctxOf(), drag({ x: 100, y: 100 }, { x: 400, y: 300 }));
    expect(created).toHaveLength(1);
    expect(created[0]!.updatedAt).toBe(NOW);
    expect(created[0]!.deviceId).toBe('dev-A');
    expect(created[0]!.createdBy).toBeNull();
  });

  it('화살표 — 드래그로 만든 결함에 세 필드가 채워진다', () => {
    const { created } = run(baseState('ARROW'), ctxOf(), drag({ x: 100, y: 100 }, { x: 400, y: 300 }));
    expect(created).toHaveLength(1);
    expect(created[0]!.updatedAt).toBe(NOW);
    expect(created[0]!.deviceId).toBe('dev-A');
    expect(created[0]!.createdBy).toBeNull();
  });

  it('자유그리기 — [그리기 완료]로 만든 결함에 세 필드가 채워진다', () => {
    const ctx = ctxOf();
    const drawn = run(baseState('SKETCH'), ctx, drag({ x: 100, y: 100 }, { x: 400, y: 300 }));
    const { created } = run(drawn.state, ctx, [{ k: 'PENDING_SKETCH_TO_NEW_DEFECT' }]);
    expect(created).toHaveLength(1);
    expect(created[0]!.sketch.length).toBeGreaterThan(0);
    expect(created[0]!.updatedAt).toBe(NOW);
    expect(created[0]!.deviceId).toBe('dev-A');
    expect(created[0]!.createdBy).toBeNull();
  });

  it('⛔ 시계를 안 넘기면 `0` 이 아니라 `null` 이다 — 0 은 병합에서 항상 지는 독값이다', () => {
    const { created } = run(baseState('AREA_RECT'), ctxOf({ now: undefined }), drag({ x: 100, y: 100 }, { x: 400, y: 300 }));
    expect(created[0]!.updatedAt).toBeNull();
  });

  it('`defaultAttrs` 는 스탬프를 덮어쓰지 못한다 (스프레드 순서)', () => {
    const ctx = ctxOf({ defaultAttrs: { structureType: 'SRC' } });
    const { created } = run(baseState('AREA_RECT'), ctx, drag({ x: 100, y: 100 }, { x: 400, y: 300 }));
    expect(created[0]!.structureType).toBe('SRC');
    expect(created[0]!.updatedAt).toBe(NOW);
  });
});

// ── 수정 스탬프 ────────────────────────────────────────────────────────────
describe('stampDefect — 결함을 고쳐 저장할 때마다 updatedAt 이 갱신된다', () => {
  it('updatedAt 과 deviceId 를 쓰는 시각·기기로 갈아 끼운다', () => {
    const before = defect('d1', 1, { x: 0.2, y: 0.2 }, { x: 0.25, y: 0.25 }, {
      ...newDefectBase(1000, 'dev-A'),
    });
    const after = stampDefect({ ...before, memo: '고침' }, 2000, 'dev-B');
    expect(after.updatedAt).toBe(2000);
    expect(after.deviceId).toBe('dev-B');
    expect(after.memo).toBe('고침');
  });

  it('옛 결함(updatedAt: null)도 실제로 고쳐 저장하면 시각이 붙는다', () => {
    const old = normalizeDefectBase(legacy(), 'dev-A');
    expect(old.updatedAt).toBeNull();
    expect(stampDefect(old, 2000, 'dev-A').updatedAt).toBe(2000);
  });

  it('원본을 변형하지 않는다 (순수 함수)', () => {
    const before = defect('d1', 1, { x: 0.2, y: 0.2 }, { x: 0.25, y: 0.25 }, {
      ...newDefectBase(1000, 'dev-A'),
    });
    stampDefect(before, 2000, 'dev-B');
    expect(before.updatedAt).toBe(1000);
    expect(before.deviceId).toBe('dev-A');
  });
});

// ── 읽기 정규화 ────────────────────────────────────────────────────────────
describe('normalizeDefectBase — 옛 레코드 읽기 정규화 (D23 · DB_VERSION 1 유지)', () => {
  it('⛔ updatedAt 을 Date.now() 로 채우지 않는다 — null 을 유지한다', () => {
    const t0 = Date.now();
    const n = normalizeDefectBase(legacy(), 'dev-A');
    expect(n.updatedAt).toBeNull();
    // "혹시 현재 시각이 들어갔나" 를 값으로도 못 박는다
    expect(typeof n.updatedAt).not.toBe('number');
    expect(t0).toBeGreaterThan(0); // t0 는 비교용 — 정규화가 시계를 읽지 않았음을 문서화한다
  });

  it('⛔ updatedAt 을 0 으로도 채우지 않는다 — 0 이면 옛 결함이 항상 진다', () => {
    expect(normalizeDefectBase(legacy(), 'dev-A').updatedAt).not.toBe(0);
  });

  it('deviceId 는 현재 기기로 채운다 (과거 사실이 아니라 현재 관측값)', () => {
    expect(normalizeDefectBase(legacy(), 'dev-A').deviceId).toBe('dev-A');
  });

  it('빈 문자열 deviceId 도 현재 기기로 메운다', () => {
    expect(normalizeDefectBase(legacy({ deviceId: '' }), 'dev-A').deviceId).toBe('dev-A');
  });

  it('createdBy 는 null("작성자 미상") 이다', () => {
    expect(normalizeDefectBase(legacy(), 'dev-A').createdBy).toBeNull();
  });

  it('이미 값이 있는 결함은 건드리지 않는다 — 남의 기기 스탬프를 뺏지 않는다', () => {
    const mine = defect('d1', 1, { x: 0.2, y: 0.2 }, { x: 0.25, y: 0.25 }, {
      ...newDefectBase(1234, 'dev-B', 'user-9'),
    });
    const n = normalizeDefectBase(mine, 'dev-A');
    expect(n).toBe(mine); // 같은 객체 — 참조 비교로 재렌더를 줄인다
    expect(n.updatedAt).toBe(1234);
    expect(n.deviceId).toBe('dev-B');
    expect(n.createdBy).toBe('user-9');
  });

  it('updatedAt 이 이미 null 로 정규화된 레코드를 다시 읽어도 null 그대로다 (멱등)', () => {
    const once = normalizeDefectBase(legacy(), 'dev-A');
    const twice = normalizeDefectBase(once, 'dev-A');
    expect(twice.updatedAt).toBeNull();
    expect(twice).toBe(once);
  });

  it('세 필드 말고는 아무것도 바꾸지 않는다', () => {
    const src = legacy();
    const n = normalizeDefectBase(src, 'dev-A');
    expect(n.id).toBe(src.id);
    expect(n.seq).toBe(src.seq);
    expect(n.marks).toBe(src.marks);
    expect(n.label).toBe(src.label);
    expect(n.memberName).toBe(src.memberName);
  });
});

// ── newDefectBase ──────────────────────────────────────────────────────────
describe('newDefectBase', () => {
  it('createdBy 기본값은 null 이다 (로그인 도입 전)', () => {
    expect(newDefectBase(NOW, 'dev-A')).toEqual({
      updatedAt: NOW,
      deviceId: 'dev-A',
      createdBy: null,
    });
  });

  it('now 가 null 이면 updatedAt 도 null 이다 — 시각을 지어내지 않는다', () => {
    expect(newDefectBase(null, 'dev-A').updatedAt).toBeNull();
  });
});
