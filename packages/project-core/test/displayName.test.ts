import { describe, expect, it } from 'vitest';
import {
  defaultHalf,
  findDuplicate,
  formatDisplayName,
  matchesQuery,
  normalizeName,
  projectDisplayName,
  squash,
} from '../src/displayName.js';
import type { Project } from '../src/types.js';

function project(over: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    orgId: null,
    year: 2026,
    half: 'H1',
    kind: 'REGULAR',
    name: '○○아파트 3차',
    prevProjectId: null,
    clientName: null,
    periodFrom: null,
    periodTo: null,
    defaultStructureType: null,
    lastOpenedAt: 0,
    deletedAt: null,
    schemaVersion: 1,
    createdAt: 0,
    updatedAt: 0,
    deviceId: 'dev',
    createdBy: null,
    ...over,
  };
}

describe('projectDisplayName — §2-5', () => {
  it('젠트릭스 실측 형식을 그대로 낸다', () => {
    expect(projectDisplayName(project())).toBe('2026 상반기 ○○아파트 3차 정기안전점검');
  });

  it('점검구분 3종이 전부 매핑된다', () => {
    expect(projectDisplayName(project({ kind: 'DETAILED' }))).toContain('정밀안전점검');
    expect(projectDisplayName(project({ kind: 'PRECISE' }))).toContain('정밀안전진단');
    expect(projectDisplayName(project({ half: 'H2' }))).toContain('하반기');
  });

  it('용역명 앞뒤 공백과 내부 연속 공백을 접는다', () => {
    expect(normalizeName('  ○○아파트   3차  ')).toBe('○○아파트 3차');
    expect(projectDisplayName(project({ name: '  A  B ' }))).toBe('2026 상반기 A B 정기안전점검');
  });

  it('용역명이 비면 자리를 비워 보여준다 (미리보기를 감추지 않는다)', () => {
    expect(formatDisplayName(2026, 'H1', '   ', 'REGULAR')).toBe('2026 상반기 ____ 정기안전점검');
  });
});

describe('검색 매칭', () => {
  it('공백을 지우고 비교한다', () => {
    expect(squash(' 2026 상반기 ')).toBe('2026상반기');
    expect(matchesQuery('2026상반기○○아파트', project())).toBe(true);
    expect(matchesQuery('아파트 3차', project())).toBe(true);
    expect(matchesQuery('정기', project())).toBe(true);
    expect(matchesQuery('정밀', project())).toBe(false);
  });

  it('빈 검색어는 전부 통과한다', () => {
    expect(matchesQuery('', project())).toBe(true);
  });
});

describe('기본값', () => {
  it('1~6월은 상반기, 7~12월은 하반기', () => {
    expect(defaultHalf(new Date(2026, 0, 1))).toBe('H1');
    expect(defaultHalf(new Date(2026, 5, 30))).toBe('H1');
    expect(defaultHalf(new Date(2026, 6, 1))).toBe('H2');
    expect(defaultHalf(new Date(2026, 11, 31))).toBe('H2');
  });
});

describe('중복 검사 — 막지 않고 경고만 한다', () => {
  it('4필드가 같으면 찾는다', () => {
    const a = project({ id: 'a' });
    expect(findDuplicate([a], { year: 2026, half: 'H1', kind: 'REGULAR', name: ' ○○아파트 3차 ' })).toBe(a);
  });

  it('자기 자신과 삭제된 용역은 제외한다', () => {
    const a = project({ id: 'a' });
    const gone = project({ id: 'b', deletedAt: 1 });
    const draft = { year: 2026, half: 'H1' as const, kind: 'REGULAR' as const, name: '○○아파트 3차' };
    expect(findDuplicate([a], draft, 'a')).toBeNull();
    expect(findDuplicate([gone], draft)).toBeNull();
  });
});
