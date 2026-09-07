/**
 * D45 A-1 — 도면 배율 일괄 적용을 **이 동의 도면만**으로 좁힌다.
 *
 * 배율을 바꾸면 그 도면의 결함·메모 좌표까지 함께 옮겨진다(D37). 대상 선정이 한 장이라도
 * 틀리면 **다른 동의 표기가 조용히 밀리고**, 되돌려도 부동소수 오차가 남는다.
 * 그래서 "누가 대상인가" 만 순수 함수로 떼어 여기서 고정한다.
 */
import { describe, expect, it } from 'vitest';
import { drawingsInBuilding, floorBuildingMap } from '../src/index.js';
import type { Drawing } from '../src/index.js';

/** 이 테스트가 보는 것은 `id` · `floorId` 뿐이다. 나머지는 타입을 채우기 위한 더미 */
function dw(id: string, floorId: string): Drawing {
  return {
    id,
    projectId: 'p1',
    floorId,
    name: id,
    source: { kind: 'IMAGE', fileName: `${id}.png`, mime: 'image/png', byteSize: 1 },
    imageWidth: 1754,
    imageHeight: 1240,
    renderBlobKey: `r-${id}`,
    sourceBlobKey: `s-${id}`,
    thumbBlobKey: `t-${id}`,
    sortOrder: 0,
    imgLayout: null,
    imgScale: null,
    labelScale: null,
    titleBlock: null,
    legend: null,
    renormalizedAt: null,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    deviceId: 'dev-1',
    createdBy: 'dev-1',
  } as Drawing;
}

const floors = [
  { id: 'fA1', buildingId: 'A' },
  { id: 'fA2', buildingId: 'A' },
  { id: 'fB1', buildingId: 'B' },
  { id: 'fB2', buildingId: 'B' },
];

const drawings = [dw('a1', 'fA1'), dw('b1', 'fB1'), dw('a2', 'fA2'), dw('b2', 'fB2')];

describe('drawingsInBuilding', () => {
  it('같은 동의 도면만 고른다 — 다른 동은 절대 대상이 아니다', () => {
    const map = floorBuildingMap(floors);
    expect(drawingsInBuilding(drawings, map, 'A').map((d) => d.id)).toEqual(['a1', 'a2']);
    expect(drawingsInBuilding(drawings, map, 'B').map((d) => d.id)).toEqual(['b1', 'b2']);
  });

  it('입력 순서를 보존한다 — 호출부가 스냅샷 순서대로 순회하며 건수를 센다', () => {
    const map = floorBuildingMap(floors);
    const shuffled = [dw('a2', 'fA2'), dw('a1', 'fA1')];
    expect(drawingsInBuilding(shuffled, map, 'A').map((d) => d.id)).toEqual(['a2', 'a1']);
  });

  it('동이 하나뿐이면 결과가 전체와 같다 — 동 1개 용역은 동작이 안 바뀐다(P1)', () => {
    const one = [
      { id: 'f1', buildingId: 'A' },
      { id: 'f2', buildingId: 'A' },
    ];
    const ds = [dw('x', 'f1'), dw('y', 'f2')];
    expect(drawingsInBuilding(ds, floorBuildingMap(one), 'A')).toHaveLength(ds.length);
  });

  it('층을 모르는 도면(층이 지워진 뒤 남은 것)은 제외한다', () => {
    const map = floorBuildingMap(floors);
    const orphan = [...drawings, dw('ghost', 'fZZ')];
    expect(drawingsInBuilding(orphan, map, 'A').map((d) => d.id)).toEqual(['a1', 'a2']);
    expect(drawingsInBuilding(orphan, map, 'B').map((d) => d.id)).toEqual(['b1', 'b2']);
  });

  it('없는 동 id 는 빈 배열 — 조용히 전체로 넓히지 않는다', () => {
    expect(drawingsInBuilding(drawings, floorBuildingMap(floors), 'C')).toEqual([]);
  });

  it('빈 동 id 는 빈 배열 — 동을 모르는 상태에서 일괄 적용이 새지 않는다', () => {
    expect(drawingsInBuilding(drawings, floorBuildingMap(floors), '')).toEqual([]);
  });

  it('입력을 변형하지 않는다 (순수 함수)', () => {
    const map = floorBuildingMap(floors);
    const before = drawings.map((d) => d.id);
    drawingsInBuilding(drawings, map, 'A');
    expect(drawings.map((d) => d.id)).toEqual(before);
  });
});
