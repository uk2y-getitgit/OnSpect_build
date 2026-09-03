/**
 * T-3 (D30 · D34) — 태블릿 부재 노출 플래그.
 *
 * 여기서 지키는 것은 **`undefined` 를 켜짐으로 읽는 것** 하나다.
 * `=== true` 로 쓰면 이미 저장된 용역 스냅샷(필드 없음)의 부재 칸이 통째로 비어
 * 현장에서 결함을 아예 입력하지 못한다.
 */
import { describe, expect, it } from 'vitest';
import { isTabletVisible, SEED_MEMBERS, setMemberTabletVisible } from '../src/index.js';
import type { ItemSettings, MemberMaster } from '../src/index.js';

const NOW = 1_700_000_000_000;

describe('isTabletVisible — undefined 는 켜짐', () => {
  it('플래그가 아예 없으면 켜짐 — 옛 용역 스냅샷이 여기 걸린다', () => {
    expect(isTabletVisible({})).toBe(true);
  });

  it('false 를 명시했을 때만 꺼진다', () => {
    expect(isTabletVisible({ tabletVisible: false })).toBe(false);
    expect(isTabletVisible({ tabletVisible: true })).toBe(true);
  });
});

describe('SEED_MEMBERS — 새 용역의 초기 노출 (D34 실무 7종)', () => {
  const visible = SEED_MEMBERS.filter((m) => isTabletVisible(m)).map((m) => m.name);

  it('실무 7종만 켜진 채로 시작한다', () => {
    expect(visible).toEqual([
      '벽(구조체)',
      '벽(비구조체)',
      '기둥',
      '보',
      '바닥 슬래브',
      '천장 슬래브',
      '천장 마감재',
    ]);
  });

  it('부재 17종 자체는 그대로다 — 목록에서 지운 게 아니라 태블릿에서만 감춘다', () => {
    expect(SEED_MEMBERS).toHaveLength(17);
  });

  it('벽과 슬래브는 각각 2종씩 켠다 — 한 종류만 두면 현장에서 막힌다', () => {
    expect(visible.filter((n) => n.startsWith('벽'))).toHaveLength(2);
    expect(visible.filter((n) => n.endsWith('슬래브'))).toHaveLength(2);
  });
});

describe('setMemberTabletVisible — PC 항목설정에서 켜고 끈다', () => {
  const member = (id: string, tabletVisible?: boolean): MemberMaster => ({
    id,
    name: id,
    structural: 'STRUCTURAL',
    createdAt: NOW,
    updatedAt: NOW,
    ...(tabletVisible === undefined ? {} : { tabletVisible }),
  });
  const base = { members: [member('m1'), member('m2', false)], updatedAt: NOW } as ItemSettings;

  it('끄면 false 가 박힌다', () => {
    const next = setMemberTabletVisible(base, 'm1', false, NOW + 1);
    expect(isTabletVisible(next.members.find((m) => m.id === 'm1')!)).toBe(false);
  });

  it('켤 때는 필드를 지우지 않고 true 를 명시한다 — "사용자가 켬" 과 "옛 스냅샷" 을 구별해야 한다', () => {
    const next = setMemberTabletVisible(base, 'm2', true, NOW + 1);
    const m2 = next.members.find((m) => m.id === 'm2')!;
    expect(m2.tabletVisible).toBe(true);
    expect(isTabletVisible(m2)).toBe(true);
  });

  it('다른 부재는 건드리지 않는다', () => {
    const next = setMemberTabletVisible(base, 'm1', false, NOW + 1);
    expect(next.members.find((m) => m.id === 'm2')!.tabletVisible).toBe(false);
  });
});
