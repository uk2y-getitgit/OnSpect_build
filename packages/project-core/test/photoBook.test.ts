/**
 * Phase 4-T15 — 사진첩 (§3-6). 2026-09-04 양식 개정(참고 PDF 재현, D38 라운드와 별개).
 *
 * 이 파일이 지키는 것:
 *   · 순서 = `NumberingResult.rows` 그대로 → **사진번호 오름차순이 자동 보장**된다 (K20)
 *     (사진번호 자체는 더 이상 화면에 안 보이지만, 배치 순서 기준으로는 여전히 산다)
 *   · 대표사진이 없는 결함은 건너뛴다. 그 자리가 뒤 배치를 밀지 않는다
 *   · **좌측 번호 칸은 결함번호(층접두어 포함)다** — 사진번호("사진 12")를 대체했다
 *   · 캡션은 **한 줄**: `위치 부재명 결함유형 (가로x세로)` — 크기 없으면 괄호 생략
 *   · **부번은 파생값이다** (§2-8) — `includeNonPrimary` 를 켜도 배치 순서(`row.no`)는 안 흔들린다
 */
import { describe, expect, it } from 'vitest';
import {
  PHOTO_BOOK_PER_PAGE,
  buildPhotoBook,
  groupPhotosByDefect,
  photoBookCaption,
  type NumberingRow,
  type Photo,
  type PhotoBookDefect,
} from '../src/index.js';

function photo(id: string, defectId: string, over: Partial<Photo> = {}): Photo {
  return {
    id,
    projectId: 'p1',
    defectId,
    isPrimary: true,
    sortOrder: 10,
    sourceBlobKey: `src-${id}`,
    renderBlobKey: `render-${id}`,
    thumbBlobKey: `thumb-${id}`,
    remoteUrl: null,
    fileName: `${id}.jpg`,
    mime: 'image/jpeg',
    byteSize: 1000,
    width: 2048,
    height: 1536,
    takenAt: null,
    device: null,
    edits: { crop: null, rotate: 0 },
    annotations: [],
    caption: null,
    createdAt: 0,
    updatedAt: 0,
    deviceId: 'dev',
    createdBy: null,
    ...over,
  };
}

function def(id: string, over: Partial<PhotoBookDefect> = {}): PhotoBookDefect {
  return {
    id,
    memberName: '외벽',
    defectTypeName: '수직균열',
    sizeMode: 'WL',
    widthMm: 0.2,
    lengthMm: 500,
    areaM2: null,
    areaWMm: null,
    areaHMm: null,
    countEa: 3,
    ...over,
  };
}

function row(defectId: string, no: number, photoNo: number | null): NumberingRow {
  return { defectId, floorId: 'f1', no, photoNo };
}

describe('buildPhotoBook — 배치', () => {
  it('rows 순서 그대로 채우고 6장마다 페이지를 넘긴다', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const pages = buildPhotoBook({
      rows: ids.map((id, i) => row(id, i + 1, i + 1)),
      defects: ids.map((id) => def(id)),
      photosByDefect: groupPhotosByDefect(ids.map((id) => photo(`ph-${id}`, id))),
      locations: Object.fromEntries(ids.map((id) => [id, '지하1층'])),
    });
    expect(pages).toHaveLength(2);
    expect(pages[0]!.cells).toHaveLength(PHOTO_BOOK_PER_PAGE);
    expect(pages[1]!.cells).toHaveLength(1);
    expect(pages[0]!.cells.map((c) => c.defectId)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(pages[1]!.cells[0]!.defectId).toBe('g');
  });

  it('대표사진이 없는 결함(photoNo === null)은 건너뛴다', () => {
    const pages = buildPhotoBook({
      rows: [row('a', 1, 1), row('b', 2, null), row('c', 3, 2)],
      defects: [def('a'), def('b'), def('c')],
      photosByDefect: groupPhotosByDefect([photo('p1', 'a'), photo('p2', 'c')]),
      locations: {},
    });
    expect(pages[0]!.cells.map((c) => c.defectId)).toEqual(['a', 'c']);
  });

  it('여러 장이면 대표 1장만 쓴다 (불변식 #8)', () => {
    const photos = groupPhotosByDefect([
      photo('p1', 'a', { isPrimary: false, sortOrder: 10 }),
      photo('p2', 'a', { isPrimary: true, sortOrder: 20 }),
    ]);
    const pages = buildPhotoBook({
      rows: [row('a', 1, 1)],
      defects: [def('a')],
      photosByDefect: photos,
      locations: {},
    });
    expect(pages[0]!.cells).toHaveLength(1);
    expect(pages[0]!.cells[0]!.renderBlobKey).toBe('render-p2');
  });

  it('사진이 하나도 없으면 페이지가 0개다 — 빈 페이지를 만들지 않는다', () => {
    const pages = buildPhotoBook({
      rows: [row('a', 1, null)],
      defects: [def('a')],
      photosByDefect: new Map(),
      locations: {},
    });
    expect(pages).toEqual([]);
  });

  it('회전 값이 셀에 실려 나간다 (렌더는 어댑터가 적용한다)', () => {
    const pages = buildPhotoBook({
      rows: [row('a', 1, 1)],
      defects: [def('a')],
      photosByDefect: groupPhotosByDefect([
        photo('p1', 'a', { edits: { crop: null, rotate: 90 } }),
      ]),
      locations: {},
    });
    expect(pages[0]!.cells[0]!.edits.rotate).toBe(90);
  });

  it('셀 key 는 `defectId:photoId` 다 — 대표 외 사진을 켜도 중복되지 않는다', () => {
    const pages = buildPhotoBook({
      rows: [row('a', 1, 1)],
      defects: [def('a')],
      photosByDefect: groupPhotosByDefect([
        photo('p1', 'a', { isPrimary: true, sortOrder: 10 }),
        photo('p2', 'a', { isPrimary: false, sortOrder: 20 }),
      ]),
      locations: {},
      includeNonPrimary: true,
    });
    const keys = pages[0]!.cells.map((c) => c.key);
    expect(keys).toEqual(['a:p1', 'a:p2']);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('좌측 번호 칸 — 결함번호(층접두어) (2026-09-04)', () => {
  it('접두어가 없으면 정수 그대로 문자열로 낸다', () => {
    const pages = buildPhotoBook({
      rows: [row('a', 3, 1)],
      defects: [def('a')],
      photosByDefect: groupPhotosByDefect([photo('p1', 'a')]),
      locations: {},
    });
    expect(pages[0]!.cells[0]!.defectNo).toBe('3');
  });

  it('floorCodes 에 그 층 접두어가 있으면 `1F-03` 처럼 낸다(D19, 손상결함표와 같은 규칙)', () => {
    const pages = buildPhotoBook({
      rows: [row('a', 3, 1)],
      defects: [def('a')],
      photosByDefect: groupPhotosByDefect([photo('p1', 'a')]),
      locations: {},
      floorCodes: { f1: '1F' },
    });
    expect(pages[0]!.cells[0]!.defectNo).toBe('1F-03');
  });

  it('대표 외 사진을 포함해도 같은 결함의 모든 칸이 같은 결함번호를 반복한다', () => {
    const pages = buildPhotoBook({
      rows: [row('a', 1, 12)],
      defects: [def('a')],
      photosByDefect: groupPhotosByDefect([
        photo('p1', 'a', { isPrimary: true, sortOrder: 10 }),
        photo('p2', 'a', { isPrimary: false, sortOrder: 20 }),
      ]),
      locations: {},
      floorCodes: { f1: '1F' },
      includeNonPrimary: true,
    });
    expect(pages[0]!.cells.map((c) => c.defectNo)).toEqual(['1F-01', '1F-01']);
    expect(pages[0]!.cells.map((c) => c.subNo)).toEqual([null, 1]);
  });
});

describe('대표 외 사진 포함 — 부번 (§2-8)', () => {
  it('기본(옵션 없음)은 지금과 똑같이 대표 1장만 나온다', () => {
    const pages = buildPhotoBook({
      rows: [row('a', 1, 12)],
      defects: [def('a')],
      photosByDefect: groupPhotosByDefect([
        photo('p1', 'a', { isPrimary: true, sortOrder: 10 }),
        photo('p2', 'a', { isPrimary: false, sortOrder: 20 }),
      ]),
      locations: {},
    });
    expect(pages[0]!.cells).toHaveLength(1);
    expect(pages[0]!.cells[0]!.subNo).toBeNull();
  });

  it('대표 먼저 · 나머지는 sortOrder 오름차순 · 부번은 대표를 빼고 1부터', () => {
    const pages = buildPhotoBook({
      rows: [row('a', 1, 12)],
      defects: [def('a')],
      photosByDefect: groupPhotosByDefect([
        // 대표가 목록 **중간**에 있다 — 명시적으로 앞으로 빼야 한다
        photo('p1', 'a', { isPrimary: false, sortOrder: 10 }),
        photo('p2', 'a', { isPrimary: true, sortOrder: 20 }),
        photo('p3', 'a', { isPrimary: false, sortOrder: 30 }),
      ]),
      locations: {},
      includeNonPrimary: true,
    });
    const cells = pages[0]!.cells;
    expect(cells.map((c) => c.renderBlobKey)).toEqual(['render-p2', 'render-p1', 'render-p3']);
    expect(cells.map((c) => c.subNo)).toEqual([null, 1, 2]);
  });

  it('주석이 셀에 실려 나간다 — 합성 렌더러가 이것을 쓴다', () => {
    const pages = buildPhotoBook({
      rows: [row('a', 1, 1)],
      defects: [def('a')],
      photosByDefect: groupPhotosByDefect([
        photo('p1', 'a', {
          annotations: [
            { k: 'ARROW', id: 'x', from: { x: 0.1, y: 0.1 }, to: { x: 0.5, y: 0.5 }, color: '#e5342a', width: 0.008 },
          ],
        }),
      ]),
      locations: {},
    });
    expect(pages[0]!.cells[0]!.annotations).toHaveLength(1);
  });
});

describe('photoBookCaption — 캡션 한 줄 (2026-09-04 양식 개정)', () => {
  it('WL: 위치 부재명 결함유형 (폭x길이m) — 폭은 mm 원값, 길이만 m 환산(K19 관례 유지)', () => {
    // 0.2 폭(균열폭 mm 그대로) · 500mm(=0.5m) 길이
    expect(
      photoBookCaption({ location: '지하1층', defect: def('a'), photoCaption: null }),
    ).toBe('지하1층 외벽 수직균열 (0.2x0.5)');
  });

  it('참고 양식 실측값 재현 — 0.2x2 · 0.3x3 · 0.3x1.2', () => {
    expect(
      photoBookCaption({
        location: '지상1층',
        defect: def('a', { widthMm: 0.2, lengthMm: 2000 }),
        photoCaption: null,
      }),
    ).toBe('지상1층 외벽 수직균열 (0.2x2)');
    expect(
      photoBookCaption({
        location: '지상1층',
        defect: def('a', { widthMm: 0.3, lengthMm: 3000 }),
        photoCaption: null,
      }),
    ).toBe('지상1층 외벽 수직균열 (0.3x3)');
    expect(
      photoBookCaption({
        location: '지상1층',
        defect: def('a', { widthMm: 0.3, lengthMm: 1200 }),
        photoCaption: null,
      }),
    ).toBe('지상1층 외벽 수직균열 (0.3x1.2)');
  });

  it('AREA(RECT, D31 가로×세로): 둘 다 m 로 환산한다 — WL 과 다른 관례(비차단 가정)', () => {
    expect(
      photoBookCaption({
        location: '지상1층',
        defect: def('a', {
          memberName: '슬래브',
          defectTypeName: '누수흔적',
          sizeMode: 'AREA',
          widthMm: null,
          lengthMm: null,
          areaM2: null,
          areaWMm: 1200,
          areaHMm: 800,
        }),
        photoCaption: null,
      }),
    ).toBe('지상1층 슬래브 누수흔적 (1.2x0.8)');
  });

  it('AREA(예전 직접입력, 가로·세로 없음): 크기를 보여줄 수 없으므로 괄호를 뺀다', () => {
    expect(
      photoBookCaption({
        location: '지상1층',
        defect: def('a', {
          defectTypeName: '누수흔적',
          sizeMode: 'AREA',
          widthMm: null,
          lengthMm: null,
          areaM2: 0.5,
          areaWMm: null,
          areaHMm: null,
        }),
        photoCaption: null,
      }),
    ).toBe('지상1층 외벽 누수흔적');
  });

  it('크기가 없는 결함(도장박리 등)은 괄호를 통째로 뺀다 — 참고 양식 재현', () => {
    expect(
      photoBookCaption({
        location: '지상2층',
        defect: def('a', { memberName: '계단', defectTypeName: '슬래브 도장박리', widthMm: null, lengthMm: null }),
        photoCaption: null,
      }),
    ).toBe('지상2층 계단 슬래브 도장박리');
  });

  it('위치·부재명이 비어 있으면 그 자리를 그냥 건너뛴다(빈 칸 안 남긴다)', () => {
    expect(
      photoBookCaption({
        location: '',
        defect: def('a', { memberName: null, defectTypeName: '균열' }),
        photoCaption: null,
      }),
    ).toBe('균열 (0.2x0.5)');
  });

  it('photo.caption(수기 캡션)이 있으면 그것을 그대로 쓴다 — 자동 생성 대신', () => {
    expect(
      photoBookCaption({ location: '지하1층', defect: def('a'), photoCaption: '수기 캡션' }),
    ).toBe('수기 캡션');
  });

  it('buildPhotoBook 전체에서도 같은 규칙으로 캡션이 채워진다', () => {
    const pages = buildPhotoBook({
      rows: [row('a', 1, 92)],
      defects: [def('a')],
      photosByDefect: groupPhotosByDefect([photo('p1', 'a')]),
      locations: { a: '지하1층 계단실' },
    });
    expect(pages[0]!.cells[0]!.caption).toBe('지하1층 계단실 외벽 수직균열 (0.2x0.5)');
  });
});
