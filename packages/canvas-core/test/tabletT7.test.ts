/**
 * T-7 (G-8) — 전회차 결함에 이번 회차 사진을 붙이면 금회차로 전환된다.
 *
 * 상세기획 §Phase 2-D: *"촬영하는 순간 status = CURRENT, 보라 → 빨강"*.
 * 여기서 못박는 것 다섯:
 *   1. `canAddPhotos` 는 전회차(PREV_PENDING)에 **사진 추가만** 열어 준다 — `isLocked` 는 그대로다
 *   2. 보수완료(REPAIRED)는 계속 막힌다
 *   3. `SET_DEFECT_STATUS` 는 status **한 필드만** 바꾼다 (seq·prevDefectId·style 불변)
 *   4. 되돌리기(Ctrl+Z) 한 번이면 전회차로 정확히 복귀한다
 *   5. 저장 대기열이 이 커맨드를 결함 쓰기로 인식한다 (`defectTargetOf`)
 *
 * ⚠️ 사진 승계(K13 — 전회차 사진을 이번 용역으로 복사)는 이 범위가 아니다. 테스트도 없다.
 */
import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  defectTargetOf,
  describeCommand,
  EMPTY_HISTORY,
  invertCommand,
  memoTargetsOf,
  pushHistory,
  redo,
  undo,
  type Command,
} from '../src/commands.js';
import { canAddPhotos, isLocked } from '../src/defectGeom.js';
import { resolveStyle } from '../src/style.js';
import { STATUS_COLOR } from '../src/constants.js';
import { defect, GS } from './helpers.js';

const AT = { x: 0.3, y: 0.3 };
const LB = { x: 0.5, y: 0.5 };

const prevPending = defect('d1', 1, AT, LB, {
  status: 'PREV_PENDING',
  prevDefectId: 'old-d1',
});

const toCurrent: Command = {
  k: 'SET_DEFECT_STATUS',
  defectId: 'd1',
  from: 'PREV_PENDING',
  to: 'CURRENT',
};

describe('T-7 · 잠금 예외 — 사진 추가만 열어 준다', () => {
  it('전회차 결함은 여전히 잠겨 있지만 사진은 붙일 수 있다', () => {
    expect(isLocked(prevPending)).toBe(true); // A8 유지 — 값 편집·이동·삭제는 그대로 잠김
    expect(canAddPhotos(prevPending)).toBe(true);
  });

  it('금회차 결함은 당연히 둘 다 열려 있다', () => {
    const cur = defect('d2', 2, AT, LB);
    expect(isLocked(cur)).toBe(false);
    expect(canAddPhotos(cur)).toBe(true);
  });

  it('보수완료 결함은 사진도 막는다 — 사진으로 되살리는 것은 이번 범위가 아니다', () => {
    const repaired = defect('d3', 3, AT, LB, { status: 'REPAIRED' });
    expect(isLocked(repaired)).toBe(true);
    expect(canAddPhotos(repaired)).toBe(false);
  });
});

describe('T-7 · SET_DEFECT_STATUS 커맨드', () => {
  it('status 한 필드만 바꾼다 — seq·prevDefectId·style·marks 는 그대로', () => {
    const [after] = applyCommand([prevPending], toCurrent);
    expect(after!.status).toBe('CURRENT');
    expect(after!.seq).toBe(prevPending.seq);
    // 되돌릴 곳을 잃으면 안 된다 — 전회차 원본 연결은 전환 뒤에도 살아 있어야 한다
    expect(after!.prevDefectId).toBe('old-d1');
    expect(after!.style).toBe(prevPending.style);
    expect(after!.marks).toEqual(prevPending.marks);
  });

  it('전환되면 잠금이 풀리고 표기 색이 보라 → 빨강으로 따라온다 (별도 배선 없음)', () => {
    expect(resolveStyle(prevPending, GS).color).toBe(STATUS_COLOR.PREV_PENDING);
    const [after] = applyCommand([prevPending], toCurrent);
    expect(isLocked(after!)).toBe(false);
    expect(resolveStyle(after!, GS).color).toBe(STATUS_COLOR.CURRENT);
  });

  it('역커맨드는 정확히 반대 방향이다', () => {
    const inv = invertCommand(toCurrent);
    expect(inv).toEqual({
      k: 'SET_DEFECT_STATUS',
      defectId: 'd1',
      from: 'CURRENT',
      to: 'PREV_PENDING',
    });
  });

  it('Undo 한 번이면 전회차로 정확히 돌아오고, Redo 하면 다시 금회차다', () => {
    const doc = { defects: [prevPending], memos: [] };
    const applied = { defects: applyCommand(doc.defects, toCurrent), memos: [] };
    const h = pushHistory(EMPTY_HISTORY, toCurrent);

    const back = undo(applied, h);
    expect(back.doc.defects[0]!.status).toBe('PREV_PENDING');
    expect(back.doc.defects[0]!.prevDefectId).toBe('old-d1');

    const again = redo(back.doc, back.history);
    expect(again.doc.defects[0]!.status).toBe('CURRENT');
  });

  it('되돌리기 방향(CURRENT → PREV_PENDING)도 같은 커맨드로 돈다', () => {
    const cur = defect('d4', 4, AT, LB, { prevDefectId: 'old-d4' });
    const revert: Command = {
      k: 'SET_DEFECT_STATUS',
      defectId: 'd4',
      from: 'CURRENT',
      to: 'PREV_PENDING',
    };
    const [after] = applyCommand([cur], revert);
    expect(after!.status).toBe('PREV_PENDING');
    expect(isLocked(after!)).toBe(true); // 되돌리면 값 편집이 다시 잠긴다
  });

  it('저장 대기열이 결함 쓰기로 인식한다 — 안 그러면 새로고침에 전환이 날아간다', () => {
    expect(defectTargetOf(toCurrent)).toBe('d1');
    expect(memoTargetsOf(toCurrent)).toEqual([]);
  });

  it('Undo 안내 문구가 방향을 구분한다', () => {
    expect(describeCommand(toCurrent)).toBe('금회차로 전환');
    expect(describeCommand(invertCommand(toCurrent))).toBe('전회차로 되돌리기');
  });
});
