/**
 * 표기 종류 4종 재정의 (2026-09-03 사용자 확정).
 *
 * 여기서 지키는 것은 세 가지다:
 *  ① **색이 서로 다르고 예약색과 안 겹친다** — 도면에서 구분이 안 되면 종류를 나눈 의미가 없다
 *  ② **잠기는 것은 `전차` 하나뿐** — 결함·신규·보수완료는 전부 편집 가능
 *  ③ 저장된 옛 값(`CURRENT`·`PREV_PENDING`·`REPAIRED`)의 **뜻이 안 뒤집혔다**
 */
import { describe, expect, it } from 'vitest';
import {
  canAddPhotos,
  canSetStatus,
  GUIDE_COLOR,
  isLocked,
  SELECTION_COLOR,
  STATUS_COLOR,
  STATUS_LEGEND_LABEL,
  STATUS_OPACITY,
  statusRows,
  type DefectStatus,
} from '../src/index.js';
import { defect } from './helpers.js';

const AT = { x: 0.3, y: 0.3 };
const LB = { x: 0.35, y: 0.25 };
const d = (status: DefectStatus, prevDefectId: string | null = null) =>
  defect('x', 1, AT, LB, { status, prevDefectId });

describe('색 — 네 종류가 서로 구분된다', () => {
  it('결함=빨강 · 신규=보라 · 전차=남색 · 보수완료=파랑', () => {
    expect(STATUS_COLOR.CURRENT).toBe('#e5342a');
    expect(STATUS_COLOR.NEW).toBe('#7c4dff');
    expect(STATUS_COLOR.PREV_PENDING).toBe('#16266e');
    expect(STATUS_COLOR.REPAIRED).toBe('#1e88e5');
  });

  it('네 색이 전부 다르다', () => {
    expect(new Set(Object.values(STATUS_COLOR)).size).toBe(4);
  });

  it('UI 예약색(선택 파랑 · 가이드 시안)과 겹치지 않는다', () => {
    const used = Object.values(STATUS_COLOR);
    expect(used).not.toContain(SELECTION_COLOR);
    expect(used).not.toContain(GUIDE_COLOR);
  });

  it('전부 불투명하다 — "회색+흐리게 하지 말 것"', () => {
    for (const v of Object.values(STATUS_OPACITY)) expect(v).toBe(1);
  });
});

describe('라벨 — 화면 · 범례가 같은 말을 쓴다', () => {
  it('결함 · 신규 · 전차 · 보수완료', () => {
    expect(STATUS_LEGEND_LABEL.CURRENT).toBe('결함');
    expect(STATUS_LEGEND_LABEL.NEW).toBe('신규');
    expect(STATUS_LEGEND_LABEL.PREV_PENDING).toBe('전차');
    expect(STATUS_LEGEND_LABEL.REPAIRED).toBe('보수완료');
  });
});

describe('잠금 — 전차 하나뿐', () => {
  it('전차만 잠긴다', () => {
    expect(isLocked(d('PREV_PENDING', 'old'))).toBe(true);
  });

  it('결함 · 신규 · 보수완료는 편집 가능하다', () => {
    expect(isLocked(d('CURRENT'))).toBe(false);
    expect(isLocked(d('NEW'))).toBe(false);
    expect(isLocked(d('REPAIRED'))).toBe(false);
  });

  it('네 종류 전부 사진을 붙일 수 있다', () => {
    for (const st of ['CURRENT', 'NEW', 'PREV_PENDING', 'REPAIRED'] as const) {
      expect(canAddPhotos(d(st, st === 'PREV_PENDING' ? 'old' : null))).toBe(true);
    }
  });
});

describe('종류 전환 — 출력 누락만 막는다 (D33 유지)', () => {
  it('전회차 자료가 없는 결함은 전차로 못 간다', () => {
    expect(canSetStatus(d('CURRENT'), 'PREV_PENDING')).toBe(false);
    expect(canSetStatus(d('NEW'), 'PREV_PENDING')).toBe(false);
  });

  it('나머지 전환은 전부 열려 있다', () => {
    expect(canSetStatus(d('CURRENT'), 'NEW')).toBe(true);
    expect(canSetStatus(d('CURRENT'), 'REPAIRED')).toBe(true);
    expect(canSetStatus(d('NEW'), 'CURRENT')).toBe(true);
    expect(canSetStatus(d('REPAIRED'), 'NEW')).toBe(true);
    expect(canSetStatus(d('PREV_PENDING', 'old'), 'CURRENT')).toBe(true);
    expect(canSetStatus(d('PREV_PENDING', 'old'), 'REPAIRED')).toBe(true);
  });

  it('잠긴 전차에서도 종류는 바꿀 수 있다 — 되돌릴 길을 남긴다', () => {
    const prev = d('PREV_PENDING', 'old');
    expect(isLocked(prev)).toBe(true);
    expect(canSetStatus(prev, 'CURRENT')).toBe(true);
  });
});

describe('범례 — 4행', () => {
  const toggles = {
    statusNew: true,
    statusNewFound: true,
    statusPending: true,
    statusRepaired: true,
  };

  it('도면에 실제로 있는 종류만 행이 뜬다 (D8 — 없는 색을 설명하면 거짓말)', () => {
    const rows = statusRows(toggles, [{ status: 'NEW' }, { status: 'REPAIRED' }]);
    expect(rows.map((r) => r.desc)).toEqual(['신규', '보수완료']);
  });

  it('순서는 결함 → 신규 → 전차 → 보수완료로 고정', () => {
    const rows = statusRows(toggles, [
      { status: 'REPAIRED' },
      { status: 'PREV_PENDING' },
      { status: 'NEW' },
      { status: 'CURRENT' },
    ]);
    expect(rows.map((r) => r.desc)).toEqual(['결함', '신규', '전차', '보수완료']);
  });

  it('옛 프로젝트(플래그 없음)에서는 신규 행이 안 뜬다 — 기존 출력물이 안 바뀐다', () => {
    const old = { statusNew: true, statusPending: true, statusRepaired: true };
    const rows = statusRows(old, [{ status: 'CURRENT' }, { status: 'NEW' }]);
    expect(rows.map((r) => r.desc)).toEqual(['결함']);
  });
});
