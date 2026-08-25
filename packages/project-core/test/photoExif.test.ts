/**
 * PhotoPolish R-1 — JPEG EXIF 최소 파서 (§2-6).
 *
 * 라이브러리 대신 자체 파서를 쓰기로 한 근거 중 하나가 **"단위테스트가 가능하다"** 였다.
 * 그래서 바이트를 여기서 직접 조립해 검증한다 — 실제 사진 파일을 저장소에 두지 않는다.
 *
 * 지키는 것:
 *   · 깨진 파일이 **예외를 던지지 않는다** (결함 입력이 막히면 안 된다)
 *   · XMP(도 APP1 이다)를 EXIF 로 오인하지 않는다
 *   · 앞 256KB 로 잘린 파일에서도 안전하게 멈춘다
 *   · 리틀·빅 엔디언 둘 다
 */
import { describe, expect, it } from 'vitest';
import { formatDevice, parseExifDate, parseJpegExif } from '../src/index.js';

// ── 바이트 조립 ────────────────────────────────────────────────────────────
type TagIn = { tag: number; type: number; count: number; bytes: number[] };

function ascii(tag: number, s: string): TagIn {
  const bytes = [...s].map((c) => c.charCodeAt(0));
  bytes.push(0); // NUL 포함이 EXIF 규약이다
  return { tag, type: 2, count: bytes.length, bytes };
}

function u32(v: number, little: boolean): number[] {
  const b = [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  return little ? b : b.reverse();
}

function u16(v: number, little: boolean): number[] {
  const b = [v & 0xff, (v >>> 8) & 0xff];
  return little ? b : b.reverse();
}

/** IFD 한 장 — 엔트리 블록 + 값 영역을 따로 돌려준다 */
function buildIfd(
  tags: readonly TagIn[],
  valueBase: number,
  little: boolean,
): { block: number[]; values: number[] } {
  const block: number[] = [...u16(tags.length, little)];
  const values: number[] = [];
  for (const t of tags) {
    block.push(...u16(t.tag, little), ...u16(t.type, little), ...u32(t.count, little));
    if (t.bytes.length <= 4) {
      const pad = [...t.bytes];
      while (pad.length < 4) pad.push(0);
      block.push(...pad);
    } else {
      block.push(...u32(valueBase + values.length, little));
      values.push(...t.bytes);
      if (values.length % 2 === 1) values.push(0); // 워드 정렬
    }
  }
  block.push(...u32(0, little)); // 다음 IFD 없음
  return { block, values };
}

function buildExifJpeg(opts: {
  make?: string;
  model?: string;
  dateOriginal?: string;
  dateTime?: string;
  little?: boolean;
  /** APP1 앞에 XMP(도 APP1 이다) 세그먼트를 하나 끼운다 */
  withXmp?: boolean;
}): Uint8Array {
  const little = opts.little ?? true;

  const ifd0Tags: TagIn[] = [];
  if (opts.make !== undefined) ifd0Tags.push(ascii(0x010f, opts.make));
  if (opts.model !== undefined) ifd0Tags.push(ascii(0x0110, opts.model));
  if (opts.dateTime !== undefined) ifd0Tags.push(ascii(0x0132, opts.dateTime));

  const exifTags: TagIn[] = [];
  if (opts.dateOriginal !== undefined) exifTags.push(ascii(0x9003, opts.dateOriginal));

  const hasExifIfd = exifTags.length > 0;
  const n0 = ifd0Tags.length + (hasExifIfd ? 1 : 0);
  const ifd0Start = 8;
  const ifd0Size = 2 + 12 * n0 + 4;
  const exifStart = ifd0Start + ifd0Size;
  const exifSize = hasExifIfd ? 2 + 12 * exifTags.length + 4 : 0;
  const ifd0ValueBase = exifStart + exifSize;

  if (hasExifIfd) {
    ifd0Tags.push({ tag: 0x8769, type: 4, count: 1, bytes: u32(exifStart, little) });
  }
  const ifd0 = buildIfd(ifd0Tags, ifd0ValueBase, little);
  const exifValueBase = ifd0ValueBase + ifd0.values.length;
  const exif = hasExifIfd
    ? buildIfd(exifTags, exifValueBase, little)
    : { block: [], values: [] };

  const tiff: number[] = [
    ...(little ? [0x49, 0x49] : [0x4d, 0x4d]),
    ...u16(0x002a, little),
    ...u32(ifd0Start, little),
    ...ifd0.block,
    ...exif.block,
    ...ifd0.values,
    ...exif.values,
  ];

  const out: number[] = [0xff, 0xd8];

  if (opts.withXmp) {
    const xmp = [...'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>'].map((c) => c.charCodeAt(0));
    const len = xmp.length + 2;
    out.push(0xff, 0xe1, (len >> 8) & 0xff, len & 0xff, ...xmp);
  }

  const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  const segLen = payload.length + 2;
  out.push(0xff, 0xe1, (segLen >> 8) & 0xff, segLen & 0xff, ...payload);
  // SOS + 더미 압축 데이터
  out.push(0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0x33);
  return new Uint8Array(out);
}

// ── 테스트 ─────────────────────────────────────────────────────────────────
describe('parseJpegExif — 정상 경로', () => {
  it('제조사 · 모델 · 촬영시각을 읽는다 (리틀엔디언)', () => {
    const b = buildExifJpeg({
      make: 'samsung',
      model: 'SM-S918N',
      dateOriginal: '2026:08:24 14:32:07',
    });
    const r = parseJpegExif(b);
    expect(r.make).toBe('samsung');
    expect(r.model).toBe('SM-S918N');
    const d = new Date(r.takenAt as number);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(24);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(32);
  });

  it('빅엔디언(MM)도 같은 결과다', () => {
    const le = parseJpegExif(
      buildExifJpeg({ make: 'Canon', model: 'EOS 5D', dateOriginal: '2020:01:02 03:04:05' }),
    );
    const be = parseJpegExif(
      buildExifJpeg({
        make: 'Canon',
        model: 'EOS 5D',
        dateOriginal: '2020:01:02 03:04:05',
        little: false,
      }),
    );
    expect(be).toEqual(le);
  });

  it('DateTimeOriginal 이 없으면 IFD0 의 DateTime 으로 떨어진다', () => {
    const r = parseJpegExif(buildExifJpeg({ dateTime: '2021:05:06 07:08:09' }));
    expect(r.takenAt).not.toBeNull();
    expect(new Date(r.takenAt as number).getFullYear()).toBe(2021);
  });

  it('DateTimeOriginal 이 IFD0 DateTime 보다 우선한다', () => {
    const r = parseJpegExif(
      buildExifJpeg({ dateTime: '2021:05:06 07:08:09', dateOriginal: '2022:11:12 13:14:15' }),
    );
    expect(new Date(r.takenAt as number).getFullYear()).toBe(2022);
  });

  it('⚠️ XMP 도 APP1 이다 — 건너뛰고 진짜 EXIF 를 찾는다', () => {
    const r = parseJpegExif(buildExifJpeg({ make: 'Apple', model: 'iPhone 15', withXmp: true }));
    expect(r.make).toBe('Apple');
    expect(r.model).toBe('iPhone 15');
  });

  it('기기 태그가 없으면 시각만 나온다 (메신저를 거친 사진)', () => {
    const r = parseJpegExif(buildExifJpeg({ dateOriginal: '2024:03:04 05:06:07' }));
    expect(r.make).toBeNull();
    expect(r.model).toBeNull();
    expect(r.takenAt).not.toBeNull();
  });

  it('4바이트 이하 짧은 문자열(인라인 값)도 읽는다', () => {
    const r = parseJpegExif(buildExifJpeg({ make: 'LG', model: 'V50' }));
    expect(r.make).toBe('LG');
    expect(r.model).toBe('V50');
  });
});

describe('parseJpegExif — 깨진 입력 (예외를 던지지 않는다)', () => {
  const cases: [string, Uint8Array][] = [
    ['빈 배열', new Uint8Array(0)],
    ['SOI 아님(PNG 머리)', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])],
    ['SOI 만', new Uint8Array([0xff, 0xd8, 0xff, 0xd9])],
    ['세그먼트 길이가 0', new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x00, 0x00])],
    ['EXIF 머리만 있고 TIFF 가 없음', new Uint8Array([
      0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    ])],
  ];

  for (const [name, bytes] of cases) {
    it(`${name} → 전부 null`, () => {
      expect(parseJpegExif(bytes)).toEqual({ takenAt: null, make: null, model: null });
    });
  }

  it('앞 256KB 로 잘린 파일 — 세그먼트가 끊겨도 멈추기만 한다', () => {
    const full = buildExifJpeg({ make: 'samsung', model: 'SM-S918N' });
    for (let cut = 1; cut < full.length; cut += 1) {
      expect(() => parseJpegExif(full.slice(0, cut))).not.toThrow();
    }
  });

  it('바이트를 하나씩 망가뜨려도 예외가 없다', () => {
    const full = buildExifJpeg({
      make: 'samsung',
      model: 'SM-S918N',
      dateOriginal: '2026:08:24 14:32:07',
    });
    for (let i = 0; i < full.length; i += 1) {
      const b = full.slice();
      b[i] = 0xff;
      expect(() => parseJpegExif(b)).not.toThrow();
      const c = full.slice();
      c[i] = 0x00;
      expect(() => parseJpegExif(c)).not.toThrow();
    }
  });
});

describe('parseExifDate — 위생 검사 (§2-6 6번)', () => {
  const NOW = new Date(2026, 7, 25, 12, 0, 0).getTime();

  it('로컬 시간으로 해석한다 (타임존 태그를 읽지 않는다)', () => {
    const t = parseExifDate('2026:08:24 14:32:07', NOW) as number;
    const d = new Date(t);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(32);
  });

  it('1990 미만은 버린다 — 카메라 시계 초기화', () => {
    expect(parseExifDate('1980:01:01 00:00:00', NOW)).toBeNull();
  });

  it('지금 + 1일 을 넘으면 버린다', () => {
    expect(parseExifDate('2030:01:01 00:00:00', NOW)).toBeNull();
    // 하루 안쪽은 통과한다 (시계가 조금 빠른 카메라)
    expect(parseExifDate('2026:08:25 20:00:00', NOW)).not.toBeNull();
  });

  it('존재하지 않는 날짜를 다음 달로 굴리지 않는다', () => {
    expect(parseExifDate('2026:02:30 10:00:00', NOW)).toBeNull();
    expect(parseExifDate('2026:13:01 10:00:00', NOW)).toBeNull();
  });

  it('형식이 다르면 null · null 입력도 null', () => {
    expect(parseExifDate('2026-08-24 14:32:07', NOW)).toBeNull();
    expect(parseExifDate('    ', NOW)).toBeNull();
    expect(parseExifDate(null, NOW)).toBeNull();
  });
});

describe('formatDevice', () => {
  it('제조사 + 모델을 잇는다', () => {
    expect(formatDevice('Canon', 'EOS 5D Mark IV')).toBe('Canon EOS 5D Mark IV');
  });

  it('⚠️ 모델이 제조사로 시작하면 중복 접두를 지운다', () => {
    expect(formatDevice('NIKON CORPORATION', 'NIKON CORPORATION D850')).toBe(
      'NIKON CORPORATION D850',
    );
    expect(formatDevice('Apple', 'Apple')).toBe('Apple');
  });

  it('한쪽만 있으면 그것만', () => {
    expect(formatDevice('samsung', null)).toBe('samsung');
    expect(formatDevice(null, 'SM-S918N')).toBe('SM-S918N');
    expect(formatDevice('  ', '')).toBeNull();
    expect(formatDevice(null, null)).toBeNull();
  });

  it('공백을 하나로 줄이고 80자에서 자른다', () => {
    expect(formatDevice(' A   B ', ' C  D ')).toBe('A B C D');
    const long = formatDevice('X'.repeat(60), 'Y'.repeat(60)) as string;
    expect(long.length).toBeLessThanOrEqual(80);
  });
});
