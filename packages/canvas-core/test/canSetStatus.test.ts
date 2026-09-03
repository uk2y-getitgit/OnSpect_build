/**
 * C-5 (D33) — 표기 종류 전환 허용 판정.
 *
 * 여기서 지키는 것은 두 가지다:
 *  ① `prevDefectId` 없는 결함을 전회차로 못 보낸다 — 보내면 `includePrevPending=false`
 *     출력에서 그 결함이 통째로 사라진다(U43)
 *  ② **잠금으로는 막지 않는다** — 막으면 한 번 「결함」·「보수완료」로 바꾼 결함을
 *     영영 되돌릴 수 없다
 */
import { describe, expect, it } from 'vitest';
import { canSetStatus } from '../src/index.js';

const d = (status: 'CURRENT' | 'PREV_PENDING' | 'REPAIRED', prevDefectId: string | null) => ({
  status,
  prevDefectId,
});

describe('canSetStatus — 세 종류를 열되 출력 누락만 막는다', () => {
  it('같은 종류로는 바꿀 수 없다 (커맨드를 쌓지 않는다)', () => {
    expect(canSetStatus(d('CURRENT', null), 'CURRENT')).toBe(false);
    expect(canSetStatus(d('REPAIRED', 'p1'), 'REPAIRED')).toBe(false);
  });

  it('전회차에서 넘어온 결함은 3종 사이를 자유롭게 오간다', () => {
    expect(canSetStatus(d('PREV_PENDING', 'p1'), 'CURRENT')).toBe(true);
    expect(canSetStatus(d('PREV_PENDING', 'p1'), 'REPAIRED')).toBe(true);
    expect(canSetStatus(d('CURRENT', 'p1'), 'PREV_PENDING')).toBe(true);
    expect(canSetStatus(d('CURRENT', 'p1'), 'REPAIRED')).toBe(true);
    expect(canSetStatus(d('REPAIRED', 'p1'), 'CURRENT')).toBe(true);
    expect(canSetStatus(d('REPAIRED', 'p1'), 'PREV_PENDING')).toBe(true);
  });

  it('prevDefectId 가 없으면 전회차로 못 간다 — 출력에서 사라지는 것을 막는다', () => {
    expect(canSetStatus(d('CURRENT', null), 'PREV_PENDING')).toBe(false);
    expect(canSetStatus(d('REPAIRED', null), 'PREV_PENDING')).toBe(false);
  });

  it('prevDefectId 가 없어도 신규 ↔ 보수완료 는 열려 있다', () => {
    expect(canSetStatus(d('CURRENT', null), 'REPAIRED')).toBe(true);
    expect(canSetStatus(d('REPAIRED', null), 'CURRENT')).toBe(true);
  });

  it('잠긴 결함(전회차·보수완료)에서도 종류를 바꿀 수 있다 — 되돌릴 길을 남긴다', () => {
    // isLocked 는 status !== 'CURRENT'. 그 둘 다에서 전환이 허용돼야 한다
    expect(canSetStatus(d('PREV_PENDING', 'p1'), 'CURRENT')).toBe(true);
    expect(canSetStatus(d('REPAIRED', null), 'CURRENT')).toBe(true);
  });
});
