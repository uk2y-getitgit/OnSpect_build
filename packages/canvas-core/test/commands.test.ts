import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  canRedo,
  canUndo,
  EMPTY_HISTORY,
  invertCommand,
  pushHistory,
  redo,
  undo,
  type Command,
} from '../src/commands.js';
import { countIncomplete, isIncomplete, missingFields } from '../src/completeness.js';
import { resolveStyle } from '../src/style.js';
import { defect, GS, mark } from './helpers.js';

describe('T7 · 커맨드 / Undo', () => {
  const base = [defect('a', 1, { x: 0.2, y: 0.2 }, { x: 0.3, y: 0.3 })];

  it('MOVE_LABEL 을 적용하고 되돌리면 원래 좌표로 돌아온다', () => {
    const cmd: Command = {
      k: 'MOVE_LABEL',
      defectId: 'a',
      from: { x: 0.3, y: 0.3 },
      to: { x: 0.6, y: 0.1 },
      fromPlaced: true,
      toPlaced: true,
    };
    const moved = applyCommand(base, cmd);
    expect(moved[0]!.label).toMatchObject({ x: 0.6, y: 0.1, placed: true });
    const back = applyCommand(moved, invertCommand(cmd));
    expect(back[0]!.label).toMatchObject({ x: 0.3, y: 0.3 });
  });

  it('⚠️ 라벨 이동은 defect.style 을 절대 건드리지 않는다 (함정 #5)', () => {
    const cmd: Command = {
      k: 'MOVE_LABEL',
      defectId: 'a',
      from: { x: 0.3, y: 0.3 },
      to: { x: 0.6, y: 0.1 },
      fromPlaced: true,
      toPlaced: true,
    };
    const moved = applyCommand(base, cmd);
    expect(moved[0]!.style).toBeNull(); // 전역 스타일 상속 유지
    expect(resolveStyle(moved[0]!, GS).color).toBe(GS.statusColor.CURRENT);
  });

  it('MOVE_MARK 는 라벨을 같은 델타만큼 데려간다 (A2)', () => {
    const cmd: Command = {
      k: 'MOVE_MARK',
      defectId: 'a',
      markId: 'a-m0',
      from: { x: 0.2, y: 0.2 },
      to: { x: 0.25, y: 0.2 },
      labelFrom: { x: 0.3, y: 0.3 },
      labelTo: { x: 0.35, y: 0.3 },
    };
    const moved = applyCommand(base, cmd);
    expect(moved[0]!.marks[0]!.geometry).toEqual({ k: 'POINT', x: 0.25, y: 0.2 });
    expect(moved[0]!.label.x).toBe(0.35);
    const back = applyCommand(moved, invertCommand(cmd));
    expect(back[0]!.marks[0]!.geometry).toEqual({ k: 'POINT', x: 0.2, y: 0.2 });
    expect(back[0]!.label.x).toBe(0.3);
  });

  it('CREATE_DEFECT ↔ DELETE_DEFECT 왕복', () => {
    const created = defect('b', 2, { x: 0.7, y: 0.7 }, { x: 0.8, y: 0.6 });
    const cmd: Command = { k: 'CREATE_DEFECT', defect: created };
    const after = applyCommand(base, cmd);
    expect(after).toHaveLength(2);
    expect(applyCommand(after, invertCommand(cmd))).toHaveLength(1);
  });

  it('마크 2개 중 앵커를 지우면 남은 마크로 앵커가 재지정된다 (§2-8-e)', () => {
    const two = [
      {
        ...base[0]!,
        marks: [mark('m0', 'a', 0.2, 0.2, 0), mark('m1', 'a', 0.4, 0.4, 1)],
      },
    ];
    const cmd: Command = {
      k: 'DELETE_MARK',
      defectId: 'a',
      mark: two[0]!.marks[0]!,
      index: 0,
      fromAnchorId: 'm0',
      toAnchorId: 'm1',
    };
    const after = applyCommand(two, cmd);
    expect(after[0]!.marks).toHaveLength(1);
    expect(after[0]!.label.anchorMarkId).toBe('m1');
    const back = applyCommand(after, invertCommand(cmd));
    expect(back[0]!.marks.map((m) => m.id)).toEqual(['m0', 'm1']);
    expect(back[0]!.label.anchorMarkId).toBe('m0');
  });

  it('스택 — undo 후 redo 가 같은 결과를 낸다', () => {
    const cmd: Command = {
      k: 'MOVE_LABEL',
      defectId: 'a',
      from: { x: 0.3, y: 0.3 },
      to: { x: 0.9, y: 0.9 },
      fromPlaced: true,
      toPlaced: true,
    };
    let defects = applyCommand(base, cmd);
    let h = pushHistory(EMPTY_HISTORY, cmd);
    expect(canUndo(h)).toBe(true);

    const u = undo({ defects, memos: [] }, h);
    defects = u.doc.defects as typeof defects;
    h = u.history;
    expect(defects[0]!.label.x).toBe(0.3);
    expect(canRedo(h)).toBe(true);

    const r = redo({ defects, memos: [] }, h);
    expect(r.doc.defects[0]!.label.x).toBe(0.9);
  });

  it('새 편집이 들어오면 redo 스택이 비워진다', () => {
    const c1: Command = {
      k: 'MOVE_LABEL', defectId: 'a', from: { x: 0.3, y: 0.3 }, to: { x: 0.5, y: 0.5 },
      fromPlaced: true, toPlaced: true,
    };
    let h = pushHistory(EMPTY_HISTORY, c1);
    const u = undo({ defects: base, memos: [] }, h);
    h = u.history;
    expect(canRedo(h)).toBe(true);
    h = pushHistory(h, c1);
    expect(canRedo(h)).toBe(false);
  });
});

describe('D3 · 미완성 결함 판정', () => {
  it('부재·결함유형이 비면 미완성', () => {
    const d = defect('a', 1, { x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }, {
      memberName: null,
      defectTypeName: null,
    });
    expect(isIncomplete(d)).toBe(true);
    expect(missingFields(d)).toEqual(['memberName', 'defectTypeName']);
  });

  it('공백만 있는 값도 미입력으로 본다', () => {
    const d = defect('a', 1, { x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }, { memberName: '   ' });
    expect(isIncomplete(d)).toBe(true);
  });

  it('둘 다 채워지면 완성', () => {
    expect(isIncomplete(defect('a', 1, { x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }))).toBe(false);
  });

  it('개수 집계', () => {
    const list = [
      defect('a', 1, { x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }),
      defect('b', 2, { x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }, { defectTypeName: null }),
    ];
    expect(countIncomplete(list)).toBe(1);
  });
});
