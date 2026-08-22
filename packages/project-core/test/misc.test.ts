import { describe, expect, it } from 'vitest';
import { formatBytes, formatDate, formatRelative } from '../src/relativeTime.js';
import {
  validateProjectForm,
  validateProjectName,
  validateYear,
  wouldCycle,
} from '../src/validate.js';
import { defaultDrawingName } from '../src/types.js';

const NOW = new Date(2026, 7, 22, 12, 0, 0).getTime();

describe('formatRelative — §2-5 표', () => {
  it('경과 구간별 표기', () => {
    expect(formatRelative(NOW, NOW - 10_000)).toBe('방금');
    expect(formatRelative(NOW, NOW - 3 * 60_000)).toBe('3분 전');
    expect(formatRelative(NOW, NOW - 5 * 3_600_000)).toBe('5시간 전');
    expect(formatRelative(NOW, NOW - 3 * 86_400_000)).toBe('3일 전');
    expect(formatRelative(NOW, NOW - 30 * 86_400_000)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('경계에서 뒤 구간으로 넘어간다', () => {
    expect(formatRelative(NOW, NOW - 60_000)).toBe('1분 전');
    expect(formatRelative(NOW, NOW - 3_600_000)).toBe('1시간 전');
    expect(formatRelative(NOW, NOW - 86_400_000)).toBe('1일 전');
  });

  it('formatDate 는 로컬 시간대 기준 YYYY-MM-DD', () => {
    expect(formatDate(new Date(2026, 0, 5).getTime())).toBe('2026-01-05');
  });
});

describe('formatBytes', () => {
  it('사람이 읽는 단위로 줄인다', () => {
    expect(formatBytes(512)).toBe('512B');
    expect(formatBytes(2048)).toBe('2KB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5MB');
    expect(formatBytes(48 * 1024 * 1024)).toBe('48MB');
  });
});

describe('validate', () => {
  it('연도는 2000~2100 정수', () => {
    expect(validateYear(2026).ok).toBe(true);
    expect(validateYear(1999).ok).toBe(false);
    expect(validateYear(2101).ok).toBe(false);
    expect(validateYear('abc').ok).toBe(false);
    expect(validateYear(2026.5).ok).toBe(false);
  });

  it('용역명은 공백만으로는 안 된다', () => {
    expect(validateProjectName('   ').ok).toBe(false);
    expect(validateProjectName('A').ok).toBe(true);
    expect(validateProjectName('가'.repeat(61)).ok).toBe(false);
  });

  it('폼 검증은 위에서부터 첫 오류 하나만 돌려준다', () => {
    const r = validateProjectForm({ year: 1900, name: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe('year');
  });
});

describe('이전 회차 순환 금지', () => {
  const prev: Record<string, string | null> = { a: null, b: 'a', c: 'b' };
  const prevOf = (id: string) => prev[id] ?? null;

  it('자기 자신을 이전 회차로 고를 수 없다', () => {
    expect(wouldCycle('a', 'a', prevOf)).toBe(true);
  });

  it('사슬을 따라가다 자기 자신을 만나면 막는다', () => {
    expect(wouldCycle('a', 'c', prevOf)).toBe(true); // c → b → a
    expect(wouldCycle('d', 'c', prevOf)).toBe(false);
    expect(wouldCycle('a', null, prevOf)).toBe(false);
  });
});

describe('도면 이름 기본값 — §G2 출력 텍스트', () => {
  it('층 이름을 앞에 둔다', () => {
    expect(defaultDrawingName('지하3층')).toBe('지하3층 결함조사 위치도');
  });
});
