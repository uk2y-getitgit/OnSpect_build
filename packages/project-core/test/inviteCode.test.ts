import { describe, expect, it } from 'vitest';
import { generateInviteCode, normalizeInviteCode } from '../src/inviteCode.js';

describe('generateInviteCode — D53', () => {
  it('길이 8, 헷갈리는 문자(0/O·1/I/L) 없이 만든다', () => {
    const code = generateInviteCode();
    expect(code).toHaveLength(8);
    expect(code).not.toMatch(/[01IOL]/);
  });

  it('rand()를 주입하면 결정론적이다(같은 시퀀스면 같은 코드)', () => {
    const seq = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
    const makeRand = () => {
      let i = 0;
      return () => seq[i++ % seq.length] ?? 0;
    };
    expect(generateInviteCode(makeRand())).toBe(generateInviteCode(makeRand()));
  });

  it('rand()=0 이면 항상 알파벳 첫 글자다', () => {
    expect(generateInviteCode(() => 0)).toBe('AAAAAAAA');
  });
});

describe('normalizeInviteCode', () => {
  it('앞뒤 공백을 지우고 대문자로 바꾼다', () => {
    expect(normalizeInviteCode('  ab3d ef2h  ')).toBe('AB3DEF2H');
  });

  it('중간 공백도 지운다(복사-붙여넣기 대비)', () => {
    expect(normalizeInviteCode('AB3D EF2H')).toBe('AB3DEF2H');
  });
});
