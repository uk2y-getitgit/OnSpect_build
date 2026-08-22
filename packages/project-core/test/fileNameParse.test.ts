import { describe, expect, it } from 'vitest';
import {
  matchBuildingByName,
  matchFloorByName,
  parseDrawingFileName,
} from '../src/fileNameParse.js';

describe('parseDrawingFileName — 사용자 샘플 도면 5장', () => {
  it('`강당-지상1층.png` 에서 동과 층을 뽑는다', () => {
    for (let n = 1; n <= 5; n += 1) {
      expect(parseDrawingFileName(`강당-지상${n}층.png`)).toEqual({
        stem: `강당-지상${n}층`,
        buildingName: '강당',
        floorName: `지상${n}층`,
      });
    }
  });

  it('구분자는 `-` `_` 공백 셋 다 받는다', () => {
    expect(parseDrawingFileName('본관_B3.jpg').buildingName).toBe('본관');
    expect(parseDrawingFileName('본관_B3.jpg').floorName).toBe('B3');
    expect(parseDrawingFileName('중축동 옥탑.png')).toMatchObject({
      buildingName: '중축동',
      floorName: '옥탑',
    });
  });

  it('동 이름에 구분자가 들어 있어도 층은 맨 뒤에서 찾는다', () => {
    expect(parseDrawingFileName('제2-공장동-지하1층.png')).toMatchObject({
      buildingName: '제2-공장동',
      floorName: '지하1층',
    });
  });

  it('구분자가 없으면 전체를 층 이름으로 본다 (동이 1개일 때)', () => {
    expect(parseDrawingFileName('지하2층.png')).toMatchObject({
      buildingName: null,
      floorName: '지하2층',
    });
  });

  it('⚠️ 파싱 실패는 빈 칸으로 둔다 — 조용히 틀린 값을 넣지 않는다', () => {
    expect(parseDrawingFileName('scan_0001.png')).toMatchObject({
      buildingName: null,
      floorName: null,
    });
    expect(parseDrawingFileName('IMG-20260101.jpg').floorName).toBeNull();
    expect(parseDrawingFileName('도면.png').floorName).toBeNull();
  });

  it('브라우저가 붙인 중복 표시를 뗀다', () => {
    expect(parseDrawingFileName('강당-지상1층 (1).png')).toMatchObject({
      buildingName: '강당',
      floorName: '지상1층',
    });
  });

  it('확장자가 없어도 동작한다', () => {
    expect(parseDrawingFileName('강당-옥탑').floorName).toBe('옥탑');
  });
});

describe('기존 레코드 매칭', () => {
  const floors = [
    { id: 'a', name: '지하1층' },
    { id: 'b', name: '지상1층' },
  ];

  it('공백·대소문자를 무시한 완전 일치', () => {
    expect(matchFloorByName(floors, ' 지상 1층 ')?.id).toBe('b');
  });

  it('같은 층을 뜻하는 다른 표기도 붙인다 (`1층` ↔ `지상1층` ↔ `1F`)', () => {
    expect(matchFloorByName(floors, '1층')?.id).toBe('b');
    expect(matchFloorByName(floors, '1F')?.id).toBe('b');
    expect(matchFloorByName(floors, 'B1')?.id).toBe('a');
  });

  it('없으면 null 이다', () => {
    expect(matchFloorByName(floors, '옥탑')).toBeNull();
    expect(matchFloorByName(floors, 'A구역')).toBeNull();
  });

  it('동 이름은 완전 일치만 — 고유명사라 느슨하게 맞추면 엉뚱한 동에 붙는다', () => {
    const bs = [{ id: 'x', name: '강당' }];
    expect(matchBuildingByName(bs, ' 강당 ')?.id).toBe('x');
    expect(matchBuildingByName(bs, '강당동')).toBeNull();
  });
});
