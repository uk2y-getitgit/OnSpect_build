/**
 * S2b — 결함정보 입력 폼을 캔버스에 연결.
 *
 * 여기서 고정하는 것은 **커맨드 계층**이다 (폼 자체는 S4 에서 이미 검증했다):
 *   · `SET_DEFECT_ATTRS` 가 속성만 갈아 끼우고 위치·스타일을 건드리지 않는가
 *   · Undo/Redo 왕복이 원래 값으로 되돌아오는가
 *   · 같은 필드 연타가 Undo 한 단계로 묶이는가 (다른 필드는 안 묶이는가)
 *   · `ctx.defectSeed` 가 새 결함에 실리는가
 */
import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  applyToDoc,
  ATTR_MERGE_WINDOW_MS,
  describeCommand,
  defectTargetOf,
  invertCommand,
  pushHistory,
  redo,
  undo,
  EMPTY_HISTORY,
  type Command,
  type Doc,
} from '../src/commands.js';
import { attrsOf, changedAttrKeys, DEFECT_ATTR_KEYS } from '../src/defectAttrs.js';
import { initialCanvasState, reduce, type ReduceContext } from '../src/interaction.js';
import { toScreen } from '../src/geometry.js';
import type { Defect, DefectAttrs, Keys } from '../src/types.js';
import { defect, GS } from './helpers.js';

/** `noUncheckedIndexedAccess` 아래에서 배열 첫 원소를 꺼낸다 */
function head<T>(xs: readonly T[]): T {
  const x = xs[0];
  if (x === undefined) throw new Error('비어 있다');
  return x;
}

const D = defect('d1', 1, { x: 0.5, y: 0.5 }, { x: 0.55, y: 0.45 });

function setAttrs(
  d: Defect,
  patch: Partial<DefectAttrs>,
  at: number,
): Extract<Command, { k: 'SET_DEFECT_ATTRS' }> {
  const from = attrsOf(d);
  const to = { ...from, ...patch };
  return {
    k: 'SET_DEFECT_ATTRS',
    defectId: d.id,
    from,
    to,
    mergeKey: changedAttrKeys(from, to).join('|'),
    at,
  };
}

describe('attrsOf / changedAttrKeys', () => {
  it('속성만 떼어 낸다 — marks·label·style 은 들어오지 않는다', () => {
    const a = attrsOf(D) as Record<string, unknown>;
    expect(Object.keys(a).sort()).toEqual([...DEFECT_ATTR_KEYS].sort());
    expect(a.marks).toBeUndefined();
    expect(a.label).toBeUndefined();
    expect(a.style).toBeUndefined();
    expect(a.seq).toBeUndefined();
  });

  it('같은 값이면 바뀐 키가 없다', () => {
    expect(changedAttrKeys(attrsOf(D), attrsOf(D))).toEqual([]);
  });

  it('바뀐 키만 낸다', () => {
    const from = attrsOf(D);
    expect(changedAttrKeys(from, { ...from, widthMm: 0.3 })).toEqual(['widthMm']);
    expect(changedAttrKeys(from, { ...from, memberId: 'm1', memberName: '기둥' })).toEqual([
      'memberId',
      'memberName',
    ]);
  });
});

describe('SET_DEFECT_ATTRS', () => {
  it('속성을 갈아 끼우고 위치·라벨·스타일은 그대로 둔다', () => {
    const c = setAttrs(D, { memberId: 'm1', memberName: '기둥' }, 1000);
    const next = head(applyCommand([D], c));
    expect(next.memberName).toBe('기둥');
    expect(next.memberId).toBe('m1');
    // 함정 #5 — 위치·크기는 geometry, 스타일은 style. 속성 편집이 넘보지 않는다
    expect(next.marks).toEqual(D.marks);
    expect(next.label).toEqual(D.label);
    expect(next.style).toBe(D.style);
    expect(next.seq).toBe(D.seq);
  });

  it('Undo 하면 원래 값으로 정확히 되돌아온다', () => {
    const c = setAttrs(D, { widthMm: 0.4, lengthMm: 1200 }, 1000);
    const applied = head(applyCommand([D], c));
    const back = head(applyCommand([applied], invertCommand(c)));
    expect(back.widthMm).toBe(D.widthMm);
    expect(back.lengthMm).toBe(D.lengthMm);
  });

  it('저장 대기열 분류가 이 결함을 가리킨다', () => {
    expect(defectTargetOf(setAttrs(D, { leak: true }, 1))).toBe('d1');
    expect(describeCommand(setAttrs(D, { leak: true }, 1))).toBe('결함정보 수정');
  });

  it('Undo/Redo 왕복 — 마커 이동과 같은 스택을 탄다', () => {
    const doc0: Doc = { defects: [D], memos: [] };
    const move: Command = {
      k: 'MOVE_MARK',
      defectId: 'd1',
      markId: 'd1-m0',
      from: { x: 0.5, y: 0.5 },
      to: { x: 0.6, y: 0.5 },
      labelFrom: null,
      labelTo: null,
    };
    const attrs = setAttrs(D, { defectTypeName: '망상균열' }, 1000);

    let h = pushHistory(EMPTY_HISTORY, move);
    let doc = applyToDoc(doc0, move);
    h = pushHistory(h, attrs);
    doc = applyToDoc(doc, attrs);
    expect(h.undo).toHaveLength(2);

    // 속성 → 이동 순으로 되돌아간다
    let r = undo(doc, h);
    expect(head(r.doc.defects).defectTypeName).toBe('균열');
    r = undo(r.doc, r.history);
    expect((head(head(r.doc.defects).marks).geometry as { x: number }).x).toBeCloseTo(0.5);

    // 다시 실행
    let rr = redo(r.doc, r.history);
    rr = redo(rr.doc, rr.history);
    expect(head(rr.doc.defects).defectTypeName).toBe('망상균열');
  });
});

describe('Undo 병합 (§7 — 폭 프리셋 6번이 6단계가 되면 안 된다)', () => {
  it('같은 필드를 창 안에서 연속으로 고치면 한 단계로 묶인다', () => {
    let h = EMPTY_HISTORY;
    let doc: Doc = { defects: [D], memos: [] };
    for (let i = 0; i < 6; i++) {
      const c = setAttrs(head(doc.defects), { widthMm: 0.1 * (i + 1) }, 1000 + i * 100);
      h = pushHistory(h, c);
      doc = applyToDoc(doc, c);
    }
    expect(h.undo).toHaveLength(1);
    // 한 번 되돌리면 **맨 처음 값**으로 돌아간다
    const r = undo(doc, h);
    expect(head(r.doc.defects).widthMm).toBe(D.widthMm);
  });

  it('창을 넘기면 묶이지 않는다', () => {
    const c1 = setAttrs(D, { widthMm: 0.3 }, 1000);
    const d1 = head(applyCommand([D], c1));
    const c2 = setAttrs(d1, { widthMm: 0.4 }, 1000 + ATTR_MERGE_WINDOW_MS + 1);
    const h = pushHistory(pushHistory(EMPTY_HISTORY, c1), c2);
    expect(h.undo).toHaveLength(2);
  });

  it('다른 필드는 묶이지 않는다 — 부재를 바꾼 뒤 폭을 고친 것이 한 단계가 되면 안 된다', () => {
    const c1 = setAttrs(D, { memberId: 'm1', memberName: '기둥' }, 1000);
    const d1 = head(applyCommand([D], c1));
    const c2 = setAttrs(d1, { widthMm: 0.4 }, 1050);
    const h = pushHistory(pushHistory(EMPTY_HISTORY, c1), c2);
    expect(h.undo).toHaveLength(2);
  });

  it('다른 결함이면 묶이지 않는다', () => {
    const E = defect('d2', 2, { x: 0.2, y: 0.2 }, { x: 0.25, y: 0.15 });
    const c1 = setAttrs(D, { widthMm: 0.3 }, 1000);
    const c2 = setAttrs(E, { widthMm: 0.3 }, 1050);
    const h = pushHistory(pushHistory(EMPTY_HISTORY, c1), c2);
    expect(h.undo).toHaveLength(2);
  });

  it('속성 커맨드가 아닌 커맨드는 병합 대상이 아니다', () => {
    const c1 = setAttrs(D, { widthMm: 0.3 }, 1000);
    const move: Command = {
      k: 'MOVE_LABEL',
      defectId: 'd1',
      from: { x: 0.55, y: 0.45 },
      to: { x: 0.6, y: 0.4 },
      fromPlaced: true,
      toPlaced: true,
    };
    const h = pushHistory(pushHistory(EMPTY_HISTORY, c1), move);
    expect(h.undo).toHaveLength(2);
  });
});

describe('ctx.defectSeed — 새 결함의 속성 초기값', () => {
  const DRAWING = { id: 'dw', imageWidth: 2400, imageHeight: 1600 };
  const K: Keys = { space: false, alt: false, shift: false, ctrl: false };

  function createDefect(seed?: ReduceContext['defectSeed']): Defect {
    let n = 0;
    const ctx: ReduceContext = {
      defects: [],
      globalStyle: GS,
      makeId: () => `id${(n += 1)}`,
      defectSeed: seed,
    };
    let st = initialCanvasState();
    st = reduce(st, { k: 'RESIZE', size: { w: 1000, h: 700 } }, ctx).state;
    st = reduce(st, { k: 'SET_DRAWING', drawing: DRAWING }, ctx).state;
    st = reduce(st, { k: 'SET_TOOL', tool: 'POINT' }, ctx).state;
    const at = toScreen({ x: 0.5, y: 0.5 }, st.viewport, 2400, 1600);
    const down = reduce(st, { k: 'POINTER_DOWN', pointerId: 1, screen: at, button: 0, keys: K }, ctx);
    const up = reduce(down.state, { k: 'POINTER_UP', pointerId: 1, screen: at, keys: K }, ctx);
    const c = [...down.commands, ...up.commands].find((x) => x.k === 'CREATE_DEFECT');
    if (!c || c.k !== 'CREATE_DEFECT') throw new Error('CREATE_DEFECT 가 나오지 않았다');
    return c.defect;
  }

  it('없으면 EMPTY_DEFECT_ATTRS 그대로다 (기존 동작이 안 바뀐다)', () => {
    expect(createDefect().structureType).toBeNull();
  });

  it('주면 새 결함에 실린다 — 용역 기본 구조유형', () => {
    const d = createDefect({ structureType: 'RC' });
    expect(d.structureType).toBe('RC');
    // 씨앗은 **초기값일 뿐**이다. 부재·결함유형은 여전히 비어 있어야 한다 (D3)
    expect(d.memberName).toBeNull();
    expect(d.defectTypeName).toBeNull();
    expect(d.sizeMode).toBe('WL');
  });
});
