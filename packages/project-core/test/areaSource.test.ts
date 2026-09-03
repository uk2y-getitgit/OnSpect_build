/**
 * C-3 (D31) — 면적 직접입력 폐지 후 옛 데이터 보호.
 *
 * 면적 칸이 읽기전용이 되면서, 가로·세로 없이 `areaM2` 만 있는 예전 결함을
 * **지우지도 감추지도 않는 것**이 이 라운드의 회귀 위험이다. 손상결함표에 그대로
 * 인쇄되는 값이라 한 번 날아가면 이미 제출한 보고서와 수치가 어긋난다.
 */
import { describe, expect, it } from 'vitest';
import { areaSource, displayAreaM2, resolveAreaM2OnRectEdit } from '../src/index.js';

describe('areaSource — 면적 값의 출처 판정', () => {
  it('가로·세로가 둘 다 있으면 RECT', () => {
    expect(areaSource({ areaM2: 0.06, areaWMm: 200, areaHMm: 300 })).toBe('RECT');
  });

  it('가로·세로 없이 면적만 있으면 LEGACY_DIRECT — 예전 직접입력분', () => {
    expect(areaSource({ areaM2: 12.34, areaWMm: null, areaHMm: null })).toBe('LEGACY_DIRECT');
  });

  it('한쪽만 있으면 아직 RECT 가 아니다', () => {
    expect(areaSource({ areaM2: 12.34, areaWMm: 200, areaHMm: null })).toBe('LEGACY_DIRECT');
    expect(areaSource({ areaM2: null, areaWMm: null, areaHMm: 300 })).toBe('EMPTY');
  });

  it('0 은 변으로 치지 않는다 — 면적이 0 이 되어 버린다', () => {
    expect(areaSource({ areaM2: 5, areaWMm: 0, areaHMm: 300 })).toBe('LEGACY_DIRECT');
  });

  it('아무 값도 없으면 EMPTY', () => {
    expect(areaSource({ areaM2: null, areaWMm: null, areaHMm: null })).toBe('EMPTY');
  });
});

describe('displayAreaM2 — 화면에 보여줄 면적', () => {
  it('RECT 면 가로×세로에서 계산한다 (절사 규칙 그대로)', () => {
    expect(displayAreaM2({ areaM2: null, areaWMm: 200, areaHMm: 300 })).toBe(0.06);
    expect(displayAreaM2({ areaM2: null, areaWMm: 0.1, areaHMm: 2500 })).toBe(0.0002);
  });

  it('저장된 areaM2 가 가로×세로와 어긋나면 계산이 이긴다', () => {
    expect(displayAreaM2({ areaM2: 999, areaWMm: 200, areaHMm: 300 })).toBe(0.06);
  });

  it('LEGACY_DIRECT 면 저장된 값을 그대로 보여준다 — 이게 안 되면 옛 값이 화면에서 사라진다', () => {
    expect(displayAreaM2({ areaM2: 12.34, areaWMm: null, areaHMm: null })).toBe(12.34);
  });

  it('EMPTY 면 null', () => {
    expect(displayAreaM2({ areaM2: null, areaWMm: null, areaHMm: null })).toBeNull();
  });
});

describe('resolveAreaM2OnRectEdit — 가로·세로를 고쳤을 때 저장할 면적', () => {
  it('둘 다 채워지면 그때 덮어쓴다 (D31)', () => {
    expect(resolveAreaM2OnRectEdit(12.34, 200, 300)).toBe(0.06);
  });

  it('한쪽만 채운 중간 상태에서는 옛 값을 지우지 않는다', () => {
    expect(resolveAreaM2OnRectEdit(12.34, 200, null)).toBe(12.34);
    expect(resolveAreaM2OnRectEdit(12.34, null, 300)).toBe(12.34);
  });

  it('둘 다 비워도 옛 값을 지우지 않는다 — 조작 중에 사라지면 안 된다', () => {
    expect(resolveAreaM2OnRectEdit(12.34, null, null)).toBe(12.34);
  });

  it('0 은 유효한 변이 아니다 — 면적을 0 으로 만들지 않는다', () => {
    expect(resolveAreaM2OnRectEdit(12.34, 0, 300)).toBe(12.34);
  });

  it('옛 값이 없던 새 결함은 둘 다 채워야 값이 생긴다', () => {
    expect(resolveAreaM2OnRectEdit(null, 200, null)).toBeNull();
    expect(resolveAreaM2OnRectEdit(null, 200, 300)).toBe(0.06);
  });
});
