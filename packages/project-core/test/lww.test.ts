import { describe, expect, it } from 'vitest';
import { localWins, sameRevision } from '../src/lww.js';

const A = 'device-a';
const B = 'device-b';

describe('localWins — 레코드 단위 LWW (스펙 §3-7)', () => {
  it('updatedAt 이 큰 쪽이 이긴다', () => {
    expect(localWins({ updatedAt: 200, deviceId: A }, { updatedAt: 100, deviceId: B })).toBe(true);
    expect(localWins({ updatedAt: 100, deviceId: A }, { updatedAt: 200, deviceId: B })).toBe(false);
  });

  it('동률이면 deviceId 사전순으로 큰 쪽이 이긴다 (결정론)', () => {
    expect(localWins({ updatedAt: 100, deviceId: B }, { updatedAt: 100, deviceId: A })).toBe(true);
    expect(localWins({ updatedAt: 100, deviceId: A }, { updatedAt: 100, deviceId: B })).toBe(false);
  });

  it('완전히 같으면 로컬이 이기지 않는다 — 불필요한 push 를 막는다', () => {
    expect(localWins({ updatedAt: 100, deviceId: A }, { updatedAt: 100, deviceId: A })).toBe(false);
  });

  it('한 번도 동기화된 적 없는 옛 결함(updatedAt null)은 서버에 이미 있으면 진다 (D23)', () => {
    expect(localWins({ updatedAt: null, deviceId: A }, { updatedAt: 1, deviceId: B })).toBe(false);
    // deviceId 가 사전순으로 커도 마찬가지다 — null 은 비교 자체를 하지 않는다
    expect(localWins({ updatedAt: null, deviceId: 'zzz' }, { updatedAt: 1, deviceId: A })).toBe(false);
  });

  it('⭐ 두 기기가 서로 반대 답을 내지 않는다 (핑퐁 방지)', () => {
    // 같은 두 판을 어느 쪽에서 보든 이기는 쪽이 하나로 정해져야 한다
    const cases: [number, string, number, string][] = [
      [100, A, 100, B],
      [100, B, 100, A],
      [100, A, 200, B],
      [300, B, 200, A],
      [7, 'x', 7, 'x'],
    ];
    for (const [lu, ld, su, sd] of cases) {
      const forward = localWins({ updatedAt: lu, deviceId: ld }, { updatedAt: su, deviceId: sd });
      const backward = localWins({ updatedAt: su, deviceId: sd }, { updatedAt: lu, deviceId: ld });
      // 양쪽 모두 "내가 이겼다" 이거나 양쪽 모두 "내가 졌다" 인 상태가 없어야 한다.
      // 단 완전히 같은 판은 둘 다 false 가 맞다(올릴 것이 없다).
      const identical = lu === su && ld === sd;
      expect(forward && backward).toBe(false);
      if (!identical) expect(forward || backward).toBe(true);
    }
  });

  it('null 두 개는 어느 쪽도 이기지 않는다 — 서버에 없으면 애초에 비교하지 않는다', () => {
    expect(localWins({ updatedAt: null, deviceId: A }, { updatedAt: 0, deviceId: A })).toBe(false);
  });
});

describe('sameRevision', () => {
  it('updatedAt·deviceId 가 모두 같을 때만 참', () => {
    expect(sameRevision({ updatedAt: 5, deviceId: A }, { updatedAt: 5, deviceId: A })).toBe(true);
    expect(sameRevision({ updatedAt: 5, deviceId: A }, { updatedAt: 5, deviceId: B })).toBe(false);
    expect(sameRevision({ updatedAt: 6, deviceId: A }, { updatedAt: 5, deviceId: A })).toBe(false);
    expect(sameRevision({ updatedAt: null, deviceId: A }, { updatedAt: 5, deviceId: A })).toBe(false);
  });
});
