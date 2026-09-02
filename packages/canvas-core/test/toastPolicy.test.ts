/**
 * U-2 토스트 정리 (2026-09-02, 사용자 실사용 확인).
 *
 * 캔버스에 결과가 그 자리에 바로 보이는 "성공 확인" 토스트는 뜨지 않는다.
 * **없어진 것은 알림뿐이다 — 커맨드(Undo 스택)는 그대로 나가야 한다.**
 * 이 파일이 지키는 것은 그 두 가지다:
 *   · 해당 조작에서 `TOAST` 이펙트가 0개인가
 *   · 그런데도 커맨드는 예전 그대로 나가는가 (되돌리기가 살아 있는가)
 *
 * 반대로 **삭제 + 되돌리기**·**경고/안내** 토스트는 계속 떠야 한다 —
 * 화면만 봐서는 무슨 일이 일어났는지(또는 왜 안 됐는지) 알 수 없기 때문이다.
 */
import { describe, expect, it } from 'vitest';
import type { Command } from '../src/commands.js';
import { initialCanvasState, NO_KEYS, reduce, type ReduceContext } from '../src/interaction.js';
import type { CanvasState, Defect, InputEvent, Memo, SPoint } from '../src/types.js';
import { defect, GS } from './helpers.js';

const DRAWING = { id: 'dw', imageWidth: 4000, imageHeight: 1000 };
const CANVAS = { w: 900, h: 600 };

let idSeq = 0;
function ctxOf(defects: Defect[] = [], memos: Memo[] = []): ReduceContext {
  return {
    defects,
    memos,
    globalStyle: GS,
    makeId: () => `nid${(idSeq += 1)}`,
    now: () => 1_700_000_000_000,
    deviceId: 'dev',
    floorId: 'f1',
    projectId: 'p1',
  };
}

function baseState(tool: CanvasState['tool']): CanvasState {
  return { ...initialCanvasState(CANVAS), drawing: DRAWING, viewport: { zoom: 1, tx: 0, ty: 0 }, tool };
}

function run(state: CanvasState, ctx: ReduceContext, evs: InputEvent[]) {
  let s = state;
  const commands: Command[] = [];
  const effects = [];
  for (const ev of evs) {
    const r = reduce(s, ev, ctx);
    s = r.state;
    commands.push(...r.commands);
    effects.push(...r.effects);
  }
  return { state: s, commands, effects };
}

/** zoom 1 · pan 0 이므로 스크린 = 정규화 × 이미지 크기 */
const screenOf = (x: number, y: number): SPoint => ({ x: x * DRAWING.imageWidth, y: y * DRAWING.imageHeight });

function dragEvents(from: SPoint, to: SPoint): InputEvent[] {
  return [
    { k: 'POINTER_DOWN', pointerId: 1, screen: from, button: 0, keys: NO_KEYS },
    { k: 'POINTER_MOVE', pointerId: 1, screen: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, keys: NO_KEYS },
    { k: 'POINTER_MOVE', pointerId: 1, screen: to, keys: NO_KEYS },
    { k: 'POINTER_UP', pointerId: 1, screen: to, keys: NO_KEYS },
  ];
}

const toasts = (effects: readonly { k: string }[]) => effects.filter((e) => e.k === 'TOAST');
const kinds = (commands: readonly Command[]) => commands.map((c) => c.k);

function memoOf(over: Partial<Memo> = {}): Memo {
  return {
    id: 'm1',
    projectId: 'p1',
    drawingId: 'dw',
    floorId: 'f1',
    pos: { x: 0.2, y: 0.3 },
    text: '원래 글',
    paths: [],
    style: null,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    deviceId: 'dev',
    createdBy: null,
    ...over,
  };
}

describe('U-2 · 성공 확인 토스트는 뜨지 않는다 (커맨드는 그대로)', () => {
  it('메모 글 저장 — 토스트 없이 SET_MEMO_TEXT 커맨드만', () => {
    const memo = memoOf();
    const r = reduce(baseState('SELECT'), { k: 'COMMIT_MEMO_TEXT', memoId: 'm1', text: '바뀐 글' }, ctxOf([], [memo]));
    expect(kinds(r.commands)).toEqual(['SET_MEMO_TEXT']);
    expect(toasts(r.effects)).toHaveLength(0);
  });

  it('영역 모양 변경 — 토스트 없이 SET_STYLE 커맨드만', () => {
    const d = defect('d1', 1, { x: 0.2, y: 0.3 }, { x: 0.25, y: 0.25 });
    const r = reduce(baseState('SELECT'), { k: 'SET_AREA_STYLE', defectId: 'd1', fill: 'HATCH' }, ctxOf([d]));
    expect(kinds(r.commands)).toEqual(['SET_STYLE']);
    expect(toasts(r.effects)).toHaveLength(0);
  });

  it('스타일 초기화 — 토스트 없이 SET_STYLE 커맨드만', () => {
    const d = defect('d1', 1, { x: 0.2, y: 0.3 }, { x: 0.25, y: 0.25 }, { style: { color: '#ff0000' } });
    const r = reduce(baseState('SELECT'), { k: 'RESET_STYLE', defectId: 'd1' }, ctxOf([d]));
    expect(kinds(r.commands)).toEqual(['SET_STYLE']);
    expect(toasts(r.effects)).toHaveLength(0);
  });

  it('이미 전체 설정을 따르는 결함은 조용히 넘어간다 — 커맨드도 토스트도 없다', () => {
    const d = defect('d1', 1, { x: 0.2, y: 0.3 }, { x: 0.25, y: 0.25 });
    const r = reduce(baseState('SELECT'), { k: 'RESET_STYLE', defectId: 'd1' }, ctxOf([d]));
    expect(r.commands).toHaveLength(0);
    expect(toasts(r.effects)).toHaveLength(0);
  });

  it('번호 위치 초기화 — 토스트 없이 RESET_LABEL 커맨드만', () => {
    const d = defect('d1', 1, { x: 0.2, y: 0.3 }, { x: 0.25, y: 0.25 });
    const r = reduce(baseState('SELECT'), { k: 'RESET_LABEL', defectId: 'd1' }, ctxOf([d]));
    expect(kinds(r.commands)).toEqual(['RESET_LABEL']);
    expect(toasts(r.effects)).toHaveLength(0);
  });

  it('이미 자동 배치면 조용히 넘어간다 — 커맨드도 토스트도 없다', () => {
    const d = defect('d1', 1, { x: 0.2, y: 0.3 }, { x: 0.25, y: 0.25 });
    d.label.placed = false;
    const r = reduce(baseState('SELECT'), { k: 'RESET_LABEL', defectId: 'd1' }, ctxOf([d]));
    expect(r.commands).toHaveLength(0);
    expect(toasts(r.effects)).toHaveLength(0);
  });

  it('점 표기 생성 — 토스트 없이 CREATE_DEFECT 커맨드. REVEAL_DEFECT 는 남는다', () => {
    const at = screenOf(0.2, 0.3);
    const r = run(baseState('POINT'), ctxOf(), [
      { k: 'POINTER_DOWN', pointerId: 1, screen: at, button: 0, keys: NO_KEYS },
      { k: 'POINTER_UP', pointerId: 1, screen: at, keys: NO_KEYS },
    ]);
    expect(kinds(r.commands)).toEqual(['CREATE_DEFECT']);
    expect(toasts(r.effects)).toHaveLength(0);
    expect(r.effects.some((e) => e.k === 'REVEAL_DEFECT')).toBe(true);
  });

  it('영역 표기 생성 — 토스트 없이 CREATE_DEFECT 커맨드. REVEAL_DEFECT 는 남는다', () => {
    const r = run(baseState('AREA_RECT'), ctxOf(), dragEvents(screenOf(0.1, 0.2), screenOf(0.3, 0.5)));
    expect(kinds(r.commands)).toEqual(['CREATE_DEFECT']);
    expect(toasts(r.effects)).toHaveLength(0);
    expect(r.effects.some((e) => e.k === 'REVEAL_DEFECT')).toBe(true);
  });

  it('필기 메모 생성 — 토스트 없이 CREATE_MEMO 커맨드만', () => {
    const r = run(baseState('MEMO'), ctxOf(), dragEvents(screenOf(0.1, 0.2), screenOf(0.2, 0.4)));
    expect(kinds(r.commands)).toEqual(['CREATE_MEMO']);
    expect(toasts(r.effects)).toHaveLength(0);
  });

  it('그리기 완료(새 결함) — 토스트 없이 CREATE_DEFECT 커맨드. 대기 안내 토스트는 남는다', () => {
    const drawn = run(baseState('SKETCH'), ctxOf(), dragEvents(screenOf(0.1, 0.2), screenOf(0.2, 0.4)));
    expect(drawn.state.pendingSketch?.paths).toHaveLength(1);
    // 대기 상태는 화면만 봐선 모른다 — 안내 토스트는 "경고/안내" 분류라 유지한다
    expect(toasts(drawn.effects).length).toBeGreaterThan(0);

    const done = reduce(drawn.state, { k: 'PENDING_SKETCH_TO_NEW_DEFECT' }, ctxOf());
    expect(kinds(done.commands)).toEqual(['CREATE_DEFECT']);
    expect(toasts(done.effects)).toHaveLength(0);
    expect(done.effects.some((e) => e.k === 'REVEAL_DEFECT')).toBe(true);
  });

  it('그리기 취소 — 버튼으로도 Escape 로도 토스트가 뜨지 않는다', () => {
    const drawn = run(baseState('SKETCH'), ctxOf(), dragEvents(screenOf(0.1, 0.2), screenOf(0.2, 0.4)));

    const byAction = reduce(drawn.state, { k: 'CANCEL_PENDING_SKETCH' }, ctxOf());
    expect(byAction.state.pendingSketch).toBeNull();
    expect(toasts(byAction.effects)).toHaveLength(0);

    const byEsc = reduce(drawn.state, { k: 'KEY_DOWN', key: 'Escape', keys: NO_KEYS }, ctxOf());
    expect(byEsc.state.pendingSketch).toBeNull();
    expect(toasts(byEsc.effects)).toHaveLength(0);
  });

  it('번호 풍선 이동 — 토스트 없이 MOVE_LABEL 커맨드만', () => {
    // 마크는 멀리 두어 히트가 번호 풍선에 잡히게 한다
    const d = defect('d1', 1, { x: 0.5, y: 0.8 }, { x: 0.1, y: 0.3 });
    const r = run(baseState('SELECT'), ctxOf([d]), dragEvents(screenOf(0.1, 0.3), screenOf(0.15, 0.4)));
    expect(kinds(r.commands)).toEqual(['MOVE_LABEL']);
    expect(toasts(r.effects)).toHaveLength(0);
  });
});

describe('U-2 · 남겨야 하는 토스트는 그대로 뜬다', () => {
  it('빈 글로 메모를 확정하면 지우고 되돌리기 토스트를 준다', () => {
    const r = reduce(baseState('SELECT'), { k: 'COMMIT_MEMO_TEXT', memoId: 'm1', text: '   ' }, ctxOf([], [memoOf()]));
    expect(kinds(r.commands)).toEqual(['DELETE_MEMO']);
    expect(toasts(r.effects)).toHaveLength(1);
  });

  it('메모 삭제 — 되돌리기 토스트가 뜬다', () => {
    const s: CanvasState = {
      ...baseState('SELECT'),
      selection: { ...initialCanvasState(CANVAS).selection, part: 'MEMO', memoId: 'm1' },
    };
    const r = reduce(s, { k: 'DELETE_SELECTION' }, ctxOf([], [memoOf()]));
    expect(kinds(r.commands)).toEqual(['DELETE_MEMO']);
    expect(toasts(r.effects)).toHaveLength(1);
  });

  it('너무 작은 드래그로 만들려 하면 왜 안 됐는지 경고한다', () => {
    const r = run(baseState('AREA_RECT'), ctxOf(), dragEvents({ x: 200, y: 200 }, { x: 203, y: 202 }));
    expect(r.commands).toHaveLength(0);
    expect(r.effects.some((e) => e.k === 'TOAST' && e.kind === 'warn')).toBe(true);
  });
});
