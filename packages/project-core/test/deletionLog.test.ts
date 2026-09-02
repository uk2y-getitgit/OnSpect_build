import { describe, expect, it } from 'vitest';
import {
  appendDeletion,
  deletionLogKey,
  DELETION_LOG_KEY_PREFIX,
  isDeletionEntry,
  isDeletionLog,
  removeDeletions,
  type DeletionEntry,
} from '../src/deletionLog.js';

function entry(kind: DeletionEntry['kind'], id: string, at = 1): DeletionEntry {
  return { kind, id, at, deviceId: 'dev-1' };
}

describe('deletionLogKey — Q58/D25 B안, meta KV 재사용', () => {
  it('접두어 deleted: + projectId', () => {
    expect(deletionLogKey('p1')).toBe('deleted:p1');
    expect(deletionLogKey('p1')).toBe(`${DELETION_LOG_KEY_PREFIX}p1`);
  });
});

describe('isDeletionEntry / isDeletionLog — 저장된 값을 믿지 않는다', () => {
  it('정상 항목을 통과시킨다', () => {
    expect(isDeletionEntry(entry('DEFECT', 'x1'))).toBe(true);
    expect(isDeletionLog([entry('DEFECT', 'x1'), entry('PHOTO', 'ph1')])).toBe(true);
  });

  it('kind 가 6종 밖이면 거부한다', () => {
    expect(isDeletionEntry({ kind: 'PROJECT', id: 'x1', at: 1, deviceId: 'd' })).toBe(false);
  });

  it('필드가 빠지거나 타입이 어긋나면 거부한다', () => {
    expect(isDeletionEntry({ kind: 'DEFECT', id: '', at: 1, deviceId: 'd' })).toBe(false);
    expect(isDeletionEntry({ kind: 'DEFECT', id: 'x1', at: 'now', deviceId: 'd' })).toBe(false);
    expect(isDeletionEntry({ kind: 'DEFECT', id: 'x1', at: 1 })).toBe(false);
    expect(isDeletionEntry(null)).toBe(false);
    expect(isDeletionEntry('deleted:p1')).toBe(false);
  });

  it('배열 중 하나라도 깨지면 로그 전체를 버린다', () => {
    expect(isDeletionLog([entry('DEFECT', 'x1'), { kind: 'DEFECT' }])).toBe(false);
    expect(isDeletionLog('not-an-array')).toBe(false);
  });
});

describe('appendDeletion — 삭제 6종 각각에서 기록이 남는다', () => {
  it('빈 로그에 1건을 남긴다', () => {
    const e = entry('DEFECT', 'x1');
    expect(appendDeletion([], e)).toEqual([e]);
  });

  it('6종 전부 같은 방식으로 쌓인다', () => {
    const kinds: DeletionEntry['kind'][] = [
      'BUILDING',
      'FLOOR',
      'DRAWING',
      'DEFECT',
      'PHOTO',
      'MEMO',
    ];
    let log: DeletionEntry[] = [];
    for (const k of kinds) log = appendDeletion(log, entry(k, `${k}-1`));
    expect(log.map((e) => e.kind)).toEqual(kinds);
  });

  it('같은 (kind,id) 재기록은 이전 항목을 대체한다 — 중복 축적 방지', () => {
    const first = entry('DEFECT', 'x1', 1);
    const second = entry('DEFECT', 'x1', 2);
    const log = appendDeletion([first], second);
    expect(log).toEqual([second]);
  });

  it('부수효과 없음 — 원본 배열을 바꾸지 않는다', () => {
    const before: DeletionEntry[] = [entry('DEFECT', 'x1')];
    const snapshot = [...before];
    appendDeletion(before, entry('MEMO', 'm1'));
    expect(before).toEqual(snapshot);
  });
});

describe('removeDeletions — Ctrl+Z 로 되돌리면 그 항목만 로그에서 뺀다 (D25)', () => {
  it('되돌린 id 하나만 빠지고 나머지는 남는다', () => {
    const log = [entry('DEFECT', 'x1'), entry('DEFECT', 'x2'), entry('MEMO', 'm1')];
    const next = removeDeletions(log, ['x1']);
    expect(next.map((e) => e.id)).toEqual(['x2', 'm1']);
  });

  it('id 는 전역 유일이므로 kind 를 가리지 않고 지운다', () => {
    const log = [entry('PHOTO', 'shared-id'), entry('DEFECT', 'other')];
    const next = removeDeletions(log, ['shared-id']);
    expect(next.map((e) => e.id)).toEqual(['other']);
  });

  it('여러 id 를 한 번에 뺄 수 있다', () => {
    const log = [entry('DEFECT', 'x1'), entry('DEFECT', 'x2'), entry('DEFECT', 'x3')];
    const next = removeDeletions(log, ['x1', 'x3']);
    expect(next.map((e) => e.id)).toEqual(['x2']);
  });

  it('로그에 없는 id 를 넘기면 변화가 없다 — 호출부가 존재를 미리 확인할 필요가 없다', () => {
    const log = [entry('DEFECT', 'x1')];
    const next = removeDeletions(log, ['not-here']);
    expect(next).toEqual(log);
  });

  it('뺄 것이 없으면 같은 배열 참조를 돌려준다 — 호출부가 불필요한 meta 쓰기를 건너뛴다', () => {
    const log = [entry('DEFECT', 'x1')];
    expect(removeDeletions(log, [])).toBe(log);
    expect(removeDeletions(log, ['not-here'])).toBe(log);
    expect(removeDeletions([], ['x1'])).toEqual([]);
  });

  it('부수효과 없음 — 원본 배열을 바꾸지 않는다', () => {
    const before = [entry('DEFECT', 'x1'), entry('DEFECT', 'x2')];
    const snapshot = [...before];
    removeDeletions(before, ['x1']);
    expect(before).toEqual(snapshot);
  });
});

describe('삭제 후 되돌리기 왕복 — 실제 흐름 재현', () => {
  it('지우면 기록되고, Ctrl+Z 로 되돌리면 기록이 사라진다', () => {
    let log: DeletionEntry[] = [];
    log = appendDeletion(log, entry('DEFECT', 'x1', 100));
    expect(log.some((e) => e.id === 'x1')).toBe(true);

    log = removeDeletions(log, ['x1']);
    expect(log.some((e) => e.id === 'x1')).toBe(false);
  });

  it('되돌리지 않고 유지되면 기록이 그대로 남는다', () => {
    let log: DeletionEntry[] = [];
    log = appendDeletion(log, entry('DEFECT', 'x1', 100));
    log = removeDeletions(log, ['x2']); // 관계없는 되돌리기
    expect(log.some((e) => e.id === 'x1')).toBe(true);
  });
});
