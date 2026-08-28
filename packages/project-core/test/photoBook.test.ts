/**
 * Phase 4-T15 — 사진첩 (§3-6).
 *
 * 이 파일이 지키는 것:
 *   · 순서 = `NumberingResult.rows` 그대로 → **사진번호 오름차순이 자동 보장**된다 (K20)
 *   · 대표사진이 없는 결함은 건너뛴다. 그 자리가 뒤 번호를 밀지 않는다
 *   · 캡션의 **길이는 m** (K19 — 기획서 예시 `수직균열 0.2×0.5×3ea`)
 *   · **부번은 파생값이다** (§2-8) — `photoNo`(정수)는 대표 외 사진을 켜도 안 흔들린다
 *   · `hidePhotoNumber` 는 1행을 **빈 줄로 두지 않고 제거**한다 (F-4)
 */
import { describe, expect, it } from 'vitest';
import {
  PHOTO_BOOK_PER_PAGE,
  buildPhotoBook,
  groupPhotosByDefect,
  photoCaptionLines,
  photoSizeCaption,
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
    expect(pages[0]!.cells.map((c) => c.photoNo)).toEqual([1, 2, 3, 4, 5, 6]);
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
    expect(pages[0]!.cells.map((c) => c.photoNo)).toEqual([1, 2]);
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
    expect(pages[0]!.cells[0]!.lines[0]).toBe('사진 12');
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
    expect(cells.map((c) => c.lines[0])).toEqual(['사진 12', '사진 12-1', '사진 12-2']);
  });

  it('⭐ 부번이 붙어도 정수 사진번호는 하나도 안 밀린다 (assignNumbers 무변경)', () => {
    const photos = groupPhotosByDefect([
      photo('a1', 'a', { isPrimary: true, sortOrder: 10 }),
      photo('a2', 'a', { isPrimary: false, sortOrder: 20 }),
      photo('b1', 'b', { isPrimary: true, sortOrder: 10 }),
    ]);
    const rows = [row('a', 1, 1), row('b', 2, 2)];
    const off = buildPhotoBook({ rows, defects: [def('a'), def('b')], photosByDefect: photos, locations: {} });
    const on = buildPhotoBook({
      rows,
      defects: [def('a'), def('b')],
      photosByDefect: photos,
      locations: {},
      includeNonPrimary: true,
    });
    expect(off.flatMap((p) => p.cells).map((c) => c.photoNo)).toEqual([1, 2]);
    expect(on.flatMap((p) => p.cells).map((c) => c.photoNo)).toEqual([1, 1, 2]);
    expect(on.flatMap((p) => p.cells).map((c) => c.subNo)).toEqual([null, 1, null]);
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

describe('사진번호 숨기기 (F-4)', () => {
  const base = {
    photoNo: 12,
    location: '지하1층',
    defect: def('a'),
    photoCaption: null,
  };

  it('1행을 빈 줄로 남기지 않고 **2행을 1행으로 올린다**', () => {
    expect(photoCaptionLines({ ...base, hidePhotoNumber: true })).toEqual([
      '지하1층  외벽',
      '수직균열 0.2×0.5×3ea',
    ]);
  });

  it('기본값은 지금과 같다 — 1행이 그대로 있다', () => {
    expect(photoCaptionLines(base)[0]).toBe('사진 12');
    expect(photoCaptionLines({ ...base, hidePhotoNumber: false })[0]).toBe('사진 12');
  });

  it('부번이 있어도 숨김이 먹는다', () => {
    expect(photoCaptionLines({ ...base, subNo: 2, hidePhotoNumber: true })).toHaveLength(2);
    expect(photoCaptionLines({ ...base, subNo: 2 })[0]).toBe('사진 12-2');
  });

  it('사진첩 전체에 옵션이 전달된다', () => {
    const pages = buildPhotoBook({
      rows: [row('a', 1, 12)],
      defects: [def('a')],
      photosByDefect: groupPhotosByDefect([photo('p1', 'a')]),
      locations: { a: '지하1층' },
      hidePhotoNumber: true,
    });
    expect(pages[0]!.cells[0]!.lines[0]).toBe('지하1층  외벽');
    // 번호 자체는 살아 있다 — 표시만 뺐다 (불변식 #2)
    expect(pages[0]!.cells[0]!.photoNo).toBe(12);
  });
});

describe('캡션 (§3-6 · K19)', () => {
  it('기획서 예시 그대로 — 길이는 m 로 환산한다', () => {
    // 0.2mm 폭 · 500mm(=0.5m) 길이 · 3개소
    expect(photoSizeCaption(def('a'))).toBe('수직균열 0.2×0.5×3ea');
  });

  it('AREA 모드는 면적㎡×개소ea', () => {
    expect(
      photoSizeCaption(
        def('a', {
          defectTypeName: '누수흔적',
          sizeMode: 'AREA',
          areaM2: 0.5,
          widthMm: null,
          lengthMm: null,
          countEa: 2,
        }),
      ),
    ).toBe('누수흔적 0.5㎡×2ea');
  });

  it('3행 구성 — 사진번호 / 위치·부재 / 규모', () => {
    const pages = buildPhotoBook({
      rows: [row('a', 1, 92)],
      defects: [def('a')],
      photosByDefect: groupPhotosByDefect([photo('p1', 'a')]),
      locations: { a: '지하1층 계단실' },
    });
    expect(pages[0]!.cells[0]!.lines).toEqual([
      '사진 92',
      '지하1층 계단실  외벽',
      '수직균열 0.2×0.5×3ea',
    ]);
  });

  it('photo.caption 이 있으면 3행 대신 그것을 쓴다', () => {
    const pages = buildPhotoBook({
      rows: [row('a', 1, 1)],
      defects: [def('a')],
      photosByDefect: groupPhotosByDefect([photo('p1', 'a', { caption: '수기 캡션' })]),
      locations: { a: '지하1층' },
    });
    expect(pages[0]!.cells[0]!.lines[2]).toBe('수기 캡션');
  });
});
