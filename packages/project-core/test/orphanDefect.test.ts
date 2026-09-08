/**
 * D50 (Q88=B) — 삭제-추가 경합으로 생기는 고아 결함(층은 없는데 그 층을 가리키는 결함)을
 * 탐지만 한다. 지우지 않는다 — 판단은 사용자에게 넘긴다.
 */
import { describe, expect, it } from 'vitest';
import { findOrphanDefects } from '../src/index.js';

const floors = [{ id: 'f1' }, { id: 'f2' }];

describe('findOrphanDefects', () => {
  it('모든 결함이 존재하는 층을 가리키면 빈 배열', () => {
    const defects = [
      { id: 'd1', floorId: 'f1' },
      { id: 'd2', floorId: 'f2' },
    ];
    expect(findOrphanDefects(floors, defects)).toEqual([]);
  });

  it('없는 층을 가리키는 결함만 골라낸다', () => {
    const defects = [
      { id: 'd1', floorId: 'f1' },
      { id: 'd2', floorId: 'fGHOST' },
    ];
    expect(findOrphanDefects(floors, defects)).toEqual([{ defectId: 'd2', floorId: 'fGHOST' }]);
  });

  it('입력 순서를 보존한다', () => {
    const defects = [
      { id: 'd1', floorId: 'fA' },
      { id: 'd2', floorId: 'f1' },
      { id: 'd3', floorId: 'fB' },
    ];
    expect(findOrphanDefects(floors, defects).map((o) => o.defectId)).toEqual(['d1', 'd3']);
  });

  it('결함이 없으면 빈 배열', () => {
    expect(findOrphanDefects(floors, [])).toEqual([]);
  });

  it('층이 없으면(용역 로딩 전 등) 모든 결함이 고아로 잡힌다', () => {
    const defects = [{ id: 'd1', floorId: 'f1' }];
    expect(findOrphanDefects([], defects)).toEqual([{ defectId: 'd1', floorId: 'f1' }]);
  });

  it('입력을 변형하지 않는다 (순수 함수)', () => {
    const defects = [
      { id: 'd1', floorId: 'f1' },
      { id: 'd2', floorId: 'fGHOST' },
    ];
    const beforeFloors = floors.map((f) => f.id);
    const beforeDefects = defects.map((d) => d.id);
    findOrphanDefects(floors, defects);
    expect(floors.map((f) => f.id)).toEqual(beforeFloors);
    expect(defects.map((d) => d.id)).toEqual(beforeDefects);
  });
});
