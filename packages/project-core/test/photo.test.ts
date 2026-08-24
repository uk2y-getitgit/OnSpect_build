/**
 * S5-T4 — 사진 불변식 (§2-2 · **불변식 #8**).
 *
 * 여기가 깨지면 사진번호와 사진첩이 조용히 틀린다.
 * 특히 **대표사진을 지웠을 때 다음 장이 승계되는가** 는 S5 완료 판정 항목이다.
 */
import { describe, expect, it } from 'vitest';
import {
  defectIdsWithPrimaryPhoto,
  displaySize,
  EMPTY_PHOTO_EDITS,
  groupPhotosByDefect,
  nextPhotoSortOrder,
  normalizePhotos,
  primaryOf,
  removePhoto,
  reorderPhotos,
  rotatePhoto,
  setPrimary,
  type Photo,
} from '../src/index.js';

function ph(id: string, over: Partial<Photo> = {}): Photo {
  return {
    id,
    projectId: 'p1',
    defectId: 'd1',
    isPrimary: false,
    sortOrder: 0,
    sourceBlobKey: `b-src-${id}`,
    renderBlobKey: `b-rnd-${id}`,
    thumbBlobKey: `b-thm-${id}`,
    remoteUrl: null,
    fileName: `${id}.jpg`,
    mime: 'image/jpeg',
    byteSize: 1000,
    width: 2048,
    height: 1536,
    takenAt: null,
    device: null,
    edits: { ...EMPTY_PHOTO_EDITS },
    annotations: [],
    caption: null,
    createdAt: 1,
    updatedAt: 1,
    deviceId: 'dev',
    createdBy: null,
    ...over,
  };
}

describe('normalizePhotos — 불변식 #8', () => {
  it('대표가 0장이면 첫 장이 대표가 된다', () => {
    const r = normalizePhotos([ph('a', { sortOrder: 0 }), ph('b', { sortOrder: 10 })]);
    expect(r.map((p) => p.isPrimary)).toEqual([true, false]);
  });

  it('대표가 2장 이상이면 sortOrder 가 가장 작은 것만 남는다', () => {
    const r = normalizePhotos([
      ph('a', { sortOrder: 20, isPrimary: true }),
      ph('b', { sortOrder: 10, isPrimary: true }),
    ]);
    expect(r.map((p) => p.id)).toEqual(['b', 'a']);
    expect(r.map((p) => p.isPrimary)).toEqual([true, false]);
  });

  it('sortOrder 오름차순으로 정렬한다', () => {
    const r = normalizePhotos([
      ph('c', { sortOrder: 20 }),
      ph('a', { sortOrder: 0, isPrimary: true }),
      ph('b', { sortOrder: 10 }),
    ]);
    expect(r.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('빈 목록도 터지지 않는다', () => {
    expect(normalizePhotos([])).toEqual([]);
    expect(primaryOf([])).toBeNull();
  });

  it('바꿀 것이 없으면 같은 배열 참조를 돌려준다 (불필요한 재렌더 방지)', () => {
    const list = normalizePhotos([ph('a', { sortOrder: 0 }), ph('b', { sortOrder: 10 })]);
    expect(normalizePhotos(list)).toBe(list);
  });

  it('옛 레코드의 edits · annotations 누락을 읽는 시점에 채운다 (DB 버전 안 올림)', () => {
    const old = ph('a');
    // @ts-expect-error — S5 이전 형식을 흉내낸다
    delete old.edits;
    // @ts-expect-error
    delete old.annotations;
    const r = normalizePhotos([old]);
    expect(r[0]!.edits).toEqual({ crop: null, rotate: 0 });
    expect(r[0]!.annotations).toEqual([]);
  });
});

describe('setPrimary', () => {
  it('지정한 1장만 대표가 된다', () => {
    const list = [ph('a', { sortOrder: 0, isPrimary: true }), ph('b', { sortOrder: 10 }), ph('c', { sortOrder: 20 })];
    const r = setPrimary(list, 'c');
    expect(r.map((p) => p.isPrimary)).toEqual([false, false, true]);
    expect(primaryOf(r)?.id).toBe('c');
  });

  it('목록에 없는 id 면 대표가 사라지지 않는다', () => {
    const list = [ph('a', { sortOrder: 0, isPrimary: true }), ph('b', { sortOrder: 10 })];
    const r = setPrimary(list, 'zzz');
    expect(primaryOf(r)?.id).toBe('a');
  });
});

describe('removePhoto — 대표 자동 승계', () => {
  it('대표를 지우면 다음 장이 대표가 된다 ⭐', () => {
    const list = [
      ph('a', { sortOrder: 0, isPrimary: true }),
      ph('b', { sortOrder: 10 }),
      ph('c', { sortOrder: 20 }),
    ];
    const r = removePhoto(list, 'a');
    expect(r.map((p) => p.id)).toEqual(['b', 'c']);
    expect(primaryOf(r)?.id).toBe('b');
  });

  it('대표가 아닌 장을 지우면 대표가 유지된다', () => {
    const list = [ph('a', { sortOrder: 0, isPrimary: true }), ph('b', { sortOrder: 10 })];
    expect(primaryOf(removePhoto(list, 'b'))?.id).toBe('a');
  });

  it('마지막 1장을 지우면 빈 목록이고 대표는 null 이다', () => {
    expect(removePhoto([ph('a', { isPrimary: true })], 'a')).toEqual([]);
  });
});

describe('reorderPhotos', () => {
  it('목록 전체에 10 격자를 재부여한다 (G6)', () => {
    const list = [
      ph('a', { sortOrder: 0, isPrimary: true }),
      ph('b', { sortOrder: 10 }),
      ph('c', { sortOrder: 20 }),
    ];
    const r = reorderPhotos(list, ['c', 'a', 'b']);
    expect(r.map((p) => p.id)).toEqual(['c', 'a', 'b']);
    expect(r.map((p) => p.sortOrder)).toEqual([0, 10, 20]);
  });

  it('순서를 바꿔도 대표 지정은 따라간다 (맨 앞이 자동으로 대표가 되지 않는다)', () => {
    const list = [ph('a', { sortOrder: 0, isPrimary: true }), ph('b', { sortOrder: 10 })];
    const r = reorderPhotos(list, ['b', 'a']);
    expect(primaryOf(r)?.id).toBe('a');
  });

  it('ids 에 빠진 사진은 조용히 사라지지 않고 뒤에 붙는다', () => {
    const list = [ph('a', { sortOrder: 0 }), ph('b', { sortOrder: 10 }), ph('c', { sortOrder: 20 })];
    const r = reorderPhotos(list, ['c']);
    expect(r.map((p) => p.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('rotatePhoto · displaySize', () => {
  it('90° 씩 누적하고 360 에서 0 으로 돈다', () => {
    let p = ph('a');
    p = rotatePhoto(p, 90);
    expect(p.edits.rotate).toBe(90);
    p = rotatePhoto(p, 90);
    expect(p.edits.rotate).toBe(180);
    p = rotatePhoto(p, 180);
    expect(p.edits.rotate).toBe(0);
  });

  it('왼쪽 회전(-90)은 270 이 된다', () => {
    expect(rotatePhoto(ph('a'), -90).edits.rotate).toBe(270);
  });

  it('회전이 없으면 같은 객체를 돌려준다', () => {
    const p = ph('a');
    expect(rotatePhoto(p, 0)).toBe(p);
  });

  it('90 · 270 이면 가로세로가 뒤바뀐 표시 크기를 준다', () => {
    expect(displaySize(ph('a'))).toEqual({ width: 2048, height: 1536 });
    expect(displaySize(rotatePhoto(ph('a'), 90))).toEqual({ width: 1536, height: 2048 });
  });
});

describe('결함별 묶음 — 번호부여에 넘기는 재료', () => {
  const list = [
    ph('a1', { defectId: 'd1', sortOrder: 0, isPrimary: true }),
    ph('a2', { defectId: 'd1', sortOrder: 10 }),
    ph('b1', { defectId: 'd2', sortOrder: 0 }),
  ];

  it('groupPhotosByDefect 는 값마다 정규화된 목록을 준다', () => {
    const m = groupPhotosByDefect(list);
    expect(m.get('d1')!.map((p) => p.id)).toEqual(['a1', 'a2']);
    // d2 는 대표 지정이 없었지만 읽기 정규화로 첫 장이 대표가 된다
    expect(m.get('d2')![0]!.isPrimary).toBe(true);
  });

  it('defectIdsWithPrimaryPhoto — 사진이 1장이라도 있으면 대표가 생긴다', () => {
    expect([...defectIdsWithPrimaryPhoto(list)].sort()).toEqual(['d1', 'd2']);
    expect([...defectIdsWithPrimaryPhoto([])]).toEqual([]);
  });
});

describe('nextPhotoSortOrder', () => {
  it('빈 목록은 0, 그 뒤는 10 격자로 붙는다', () => {
    expect(nextPhotoSortOrder([])).toBe(0);
    expect(nextPhotoSortOrder([ph('a', { sortOrder: 0 }), ph('b', { sortOrder: 10 })])).toBe(20);
  });
});
