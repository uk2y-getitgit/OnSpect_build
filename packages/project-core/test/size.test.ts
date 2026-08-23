/**
 * S4-T2 — 규모 계산 (§3-5-c · 함정 #6). 실측 4행을 그대로 고정한다.
 */
import { describe, expect, it } from 'vitest';
import { areaFromMm, effectiveAreaM2, outputSize, trunc4 } from '../src/index.js';

describe('trunc4 · areaFromMm — §3-6 실측 검증표', () => {
  const rows: Array<{ w: number; l: number; expected: number }> = [
    { w: 0.2, l: 2000, expected: 0.0004 },
    { w: 0.1, l: 2500, expected: 0.0002 }, // 절사 — 반올림이면 0.0003 이 되어 틀린다
    { w: 0.2, l: 4000, expected: 0.0008 },
    { w: 200, l: 300, expected: 0.06 },
  ];

  for (const { w, l, expected } of rows) {
    it(`${w} × ${l} → ${expected}`, () => {
      expect(areaFromMm(w, l)).toBe(expected);
    });
  }

  it('trunc4 는 반올림이 아니라 절사다', () => {
    expect(trunc4(0.12349)).toBe(0.1234);
    expect(trunc4(0.12345)).toBe(0.1234); // 반올림이면 0.1235
  });

  it('극단값(4000×1000처럼 큰 mm)에서도 부동소수 오차가 나지 않는다', () => {
    expect(areaFromMm(4000, 1000)).toBe(4);
  });
});

describe('effectiveAreaM2', () => {
  it('WL 모드는 폭·길이에서 파생한다', () => {
    expect(effectiveAreaM2({ sizeMode: 'WL', widthMm: 0.2, lengthMm: 2000, areaM2: null, countEa: null })).toBe(
      0.0004,
    );
  });
  it('WL 모드에서 폭·길이 중 하나라도 없으면 null (파생 불가)', () => {
    expect(effectiveAreaM2({ sizeMode: 'WL', widthMm: null, lengthMm: 2000, areaM2: null, countEa: null })).toBeNull();
  });
  it('AREA 모드는 저장된 직접 입력값을 그대로 쓴다 — 폭·길이가 있어도 무시', () => {
    expect(
      effectiveAreaM2({ sizeMode: 'AREA', widthMm: 999, lengthMm: 999, areaM2: 0.5, countEa: null }),
    ).toBe(0.5);
  });
});

describe('outputSize — 손상결함표 4열. 개소는 곱하지 않는다', () => {
  it('WL: 폭·길이·파생 면적·개소를 그대로 낸다', () => {
    expect(outputSize({ sizeMode: 'WL', widthMm: 0.2, lengthMm: 2000, areaM2: null, countEa: 2 })).toEqual({
      widthMm: 0.2,
      lengthMm: 2000,
      areaM2: 0.0004,
      countEa: 2,
    });
  });

  it('개소를 10으로 올려도 면적은 안 바뀐다 (실측: 개소2인데 0.0004)', () => {
    const a = outputSize({ sizeMode: 'WL', widthMm: 0.2, lengthMm: 2000, areaM2: null, countEa: 1 });
    const b = outputSize({ sizeMode: 'WL', widthMm: 0.2, lengthMm: 2000, areaM2: null, countEa: 10 });
    expect(a.areaM2).toBe(b.areaM2);
  });

  it('countEa 가 null 이면 1 로 읽는다', () => {
    expect(outputSize({ sizeMode: 'WL', widthMm: 100, lengthMm: 100, areaM2: null, countEa: null }).countEa).toBe(1);
  });

  it('AREA: 폭·길이는 0, 면적은 직접값 (실측 누수흔적 행 0/0/0.5)', () => {
    expect(outputSize({ sizeMode: 'AREA', widthMm: null, lengthMm: null, areaM2: 0.5, countEa: 1 })).toEqual({
      widthMm: 0,
      lengthMm: 0,
      areaM2: 0.5,
      countEa: 1,
    });
  });

  it('AREA: 가로×세로로 계산해 넣은 경우도(areaWMm/areaHMm 은 이 함수가 모른다) 폭·길이 열은 0 (Q19)', () => {
    // areaM2 만 이 함수에 전달된다 — 가로·세로 보조값은 저장은 되지만 출력 4열에 영향을 주지 않는다
    expect(outputSize({ sizeMode: 'AREA', widthMm: null, lengthMm: null, areaM2: 0.5, countEa: 1 }).widthMm).toBe(0);
  });
});
