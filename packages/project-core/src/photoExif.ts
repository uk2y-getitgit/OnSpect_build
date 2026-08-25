/**
 * JPEG EXIF 최소 파서 — PhotoPolish 스펙 §2-6.
 *
 * ⭐ **라이브러리를 넣지 않는다** (새 npm 의존성 0개).
 *    필요한 태그가 **3개뿐**이라 짧게 끝나고, 틀렸을 때 비용이 0 에 수렴한다 —
 *    못 읽으면 호출자가 `file.lastModified` 로 떨어질 뿐 지금과 같은 동작이다.
 *
 * 경계:
 *   · **순수 함수다.** `Blob`·`File`·`URL`·DOM 을 참조하지 않는다 (경계 규칙 9).
 *     입력은 `Uint8Array` 뿐 — 어댑터가 `file.slice(0, 256KB).arrayBuffer()` 로 잘라 넣는다.
 *   · 모든 오프셋·길이를 **경계 검사**한다. 하나라도 어긋나면 그 값만 null 로 두고 계속 간다.
 *     깨진 파일이 결함 입력을 막으면 안 된다.
 */

export type JpegExif = {
  /** 촬영시각(ms). EXIF 에는 타임존이 없어 **로컬 시간으로 해석**한다 */
  takenAt: number | null;
  make: string | null;
  model: string | null;
};

export const EMPTY_JPEG_EXIF: JpegExif = { takenAt: null, make: null, model: null };

/** 태그 번호 (§2-6) */
const TAG_MAKE = 0x010f;
const TAG_MODEL = 0x0110;
const TAG_DATETIME = 0x0132;
const TAG_EXIF_IFD = 0x8769;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_DATETIME_DIGITIZED = 0x9004;

/** 카메라 시계 초기화 대응 — 이 밖의 값은 버린다 */
const MIN_YEAR = 1990;
const FUTURE_SLACK_MS = 24 * 60 * 60 * 1000;

/** 기기 문자열 상한 */
export const DEVICE_MAX_LENGTH = 80;

/**
 * JPEG 바이트(앞부분만으로 충분)에서 촬영시각·제조사·모델만 읽는다.
 * **실패하면 전부 null.** 예외를 던지지 않는다.
 */
export function parseJpegExif(bytes: Uint8Array): JpegExif {
  try {
    return parseInner(bytes);
  } catch {
    return { ...EMPTY_JPEG_EXIF };
  }
}

function parseInner(b: Uint8Array): JpegExif {
  // 1. SOI
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return { ...EMPTY_JPEG_EXIF };

  // 마커를 걸으며 APP1(FFE1) 중 `Exif\0\0` 로 시작하는 것을 찾는다.
  // ⚠️ XMP 도 APP1 이므로 페이로드 접두를 반드시 확인하고, 아니면 다음 마커로 간다.
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) break; // 마커 정렬이 깨졌다 — 더 믿고 걸을 수 없다
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i += 1; // 채움 바이트
      continue;
    }
    // SOS(FFDA) 이후는 압축 데이터다. EOI(FFD9) 도 끝
    if (marker === 0xda || marker === 0xd9) break;
    // 길이가 없는 단독 마커
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const segLen = readU16(b, i + 2, false);
    if (segLen === null || segLen < 2) break;
    const payloadAt = i + 4;
    const payloadLen = segLen - 2;
    // 256KB 로 잘린 앞부분이면 여기서 끝난다 — 지금까지 못 찾았으면 없는 것으로 본다
    if (payloadAt + payloadLen > b.length) break;

    if (marker === 0xe1 && payloadLen > 6 && isExifHeader(b, payloadAt)) {
      return parseTiff(b, payloadAt + 6, payloadLen - 6);
    }
    i = payloadAt + payloadLen;
  }
  return { ...EMPTY_JPEG_EXIF };
}

/** `"Exif\0\0"` */
function isExifHeader(b: Uint8Array, at: number): boolean {
  return (
    b[at] === 0x45 &&
    b[at + 1] === 0x78 &&
    b[at + 2] === 0x69 &&
    b[at + 3] === 0x66 &&
    b[at + 4] === 0x00 &&
    b[at + 5] === 0x00
  );
}

/** TIFF 헤더부터 — `tiffAt` 이 모든 IFD 오프셋의 기준점(0)이다 */
function parseTiff(b: Uint8Array, tiffAt: number, tiffLen: number): JpegExif {
  const end = Math.min(b.length, tiffAt + tiffLen);
  if (tiffAt + 8 > end) return { ...EMPTY_JPEG_EXIF };

  const b0 = b[tiffAt]!;
  const b1 = b[tiffAt + 1]!;
  let little: boolean;
  if (b0 === 0x49 && b1 === 0x49) little = true; //  "II" — 리틀엔디언
  else if (b0 === 0x4d && b1 === 0x4d) little = false; // "MM" — 빅엔디언
  else return { ...EMPTY_JPEG_EXIF };

  if (readU16(b, tiffAt + 2, little) !== 0x002a) return { ...EMPTY_JPEG_EXIF };

  const ifd0Off = readU32(b, tiffAt + 4, little);
  if (ifd0Off === null) return { ...EMPTY_JPEG_EXIF };

  const ifd0 = readIfd(b, tiffAt, ifd0Off, end, little);
  const make = asciiOf(b, ifd0.get(TAG_MAKE));
  const model = asciiOf(b, ifd0.get(TAG_MODEL));

  // 3. DateTimeOriginal → DateTimeDigitized → IFD0 DateTime
  let stamp: string | null = null;
  const exifPtr = uintOf(b, ifd0.get(TAG_EXIF_IFD), little);
  if (exifPtr !== null) {
    const exif = readIfd(b, tiffAt, exifPtr, end, little);
    stamp =
      asciiOf(b, exif.get(TAG_DATETIME_ORIGINAL)) ?? asciiOf(b, exif.get(TAG_DATETIME_DIGITIZED));
  }
  if (stamp === null) stamp = asciiOf(b, ifd0.get(TAG_DATETIME));

  return { takenAt: parseExifDate(stamp), make, model };
}

type Entry = {
  type: number;
  /** 이 엔트리의 실제 값이 시작하는 절대 위치. 경계 검사를 이미 통과했다 */
  valueAt: number;
  /** 읽어도 되는 바이트 수 (경계로 이미 잘려 있다) */
  byteLength: number;
};

/**
 * IFD 한 장을 태그 → 엔트리 표로 읽는다.
 *
 * 엔트리 개수를 **남은 바이트로도 한 번 더 제한한다** — 깨진 파일의 65535 를 그대로 믿지 않는다.
 */
function readIfd(
  b: Uint8Array,
  tiffAt: number,
  ifdOff: number,
  end: number,
  little: boolean,
): Map<number, Entry> {
  const out = new Map<number, Entry>();
  const base = tiffAt + ifdOff;
  if (ifdOff < 0 || base < tiffAt || base + 2 > end) return out;

  const declared = readU16(b, base, little);
  if (declared === null) return out;
  const room = Math.floor((end - base - 2) / 12);
  const count = Math.min(declared, Math.max(0, room));

  for (let n = 0; n < count; n += 1) {
    const at = base + 2 + n * 12;
    const tag = readU16(b, at, little);
    const type = readU16(b, at + 2, little);
    const cnt = readU32(b, at + 4, little);
    if (tag === null || type === null || cnt === null) break;

    const unit = TYPE_SIZE[type] ?? 0;
    if (unit === 0) continue; // 모르는 타입 — 그 엔트리만 버린다
    const bytes = unit * cnt;
    if (!Number.isSafeInteger(bytes) || bytes < 0) continue;

    if (bytes <= 4) {
      // 4바이트 이하는 엔트리 안에 직접 들어 있다
      out.set(tag, { type, valueAt: at + 8, byteLength: bytes });
      continue;
    }
    const off = readU32(b, at + 8, little);
    if (off === null) continue;
    const valueAt = tiffAt + off;
    if (valueAt < tiffAt || valueAt + bytes > end) continue; // 경계 밖 — 그 값만 버린다
    out.set(tag, { type, valueAt, byteLength: bytes });
  }
  return out;
}

/** EXIF 타입별 바이트 크기. 0 = 모르는 타입 */
const TYPE_SIZE: Readonly<Record<number, number>> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL
  6: 1, // SBYTE
  7: 1, // UNDEFINED
  8: 2, // SSHORT
  9: 4, // SLONG
  10: 8, // SRATIONAL
  11: 4, // FLOAT
  12: 8, // DOUBLE
};

/** ASCII 값. NUL 에서 끊고 트림한다. 빈 값은 null */
function asciiOf(b: Uint8Array, e: Entry | undefined): string | null {
  if (!e) return null;
  if (e.type !== 2 && e.type !== 7) return null;
  const max = Math.min(e.byteLength, b.length - e.valueAt);
  let s = '';
  for (let k = 0; k < max; k += 1) {
    const v = b[e.valueAt + k]!;
    if (v === 0) break;
    // 기기명은 항상 ASCII 다. 제어문자·깨진 바이트는 조용히 버린다
    if (v < 0x20 || v > 0x7e) continue;
    s += String.fromCharCode(v);
  }
  const t = s.trim();
  return t === '' ? null : t;
}

/** SHORT · LONG 단일 값 (ExifIFD 포인터에 쓴다) */
function uintOf(b: Uint8Array, e: Entry | undefined, little: boolean): number | null {
  if (!e) return null;
  if (e.type === 3) return readU16(b, e.valueAt, little);
  if (e.type === 4 || e.type === 9) return readU32(b, e.valueAt, little);
  return null;
}

/**
 * `"YYYY:MM:DD HH:MM:SS"` → ms.
 *
 * **로컬 시간으로 해석한다** — EXIF 에는 타임존이 없고, 조사자와 카메라는 같은 지역에 있다.
 * `OffsetTime` 태그는 읽지 않는다.
 *
 * 위생 검사: 연도가 1990 미만이거나 `지금 + 1일` 을 넘으면 버린다(카메라 시계 초기화 대응).
 */
export function parseExifDate(s: string | null, now: number = Date.now()): number | null {
  if (!s) return null;
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const se = Number(m[6]);
  if (y < MIN_YEAR || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 60) {
    return null;
  }
  const dt = new Date(y, mo - 1, d, h, mi, Math.min(se, 59));
  const t = dt.getTime();
  if (!Number.isFinite(t)) return null;
  // `2026:02:30` 같은 존재하지 않는 날짜는 Date 가 다음 달로 굴린다 — 그건 EXIF 가 깨진 것이다
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  if (t > now + FUTURE_SLACK_MS) return null;
  return t;
}

/**
 * `"Make Model"` 정규화.
 *
 * · 모델이 제조사로 시작하면 **중복 접두를 지운다** (`"SAMSUNG SAMSUNG SM-S918N"` 방지)
 * · 공백을 하나로 줄이고 80자 상한
 * · 둘 다 비면 null
 */
export function formatDevice(make: string | null, model: string | null): string | null {
  const mk = squash(make);
  const md = squash(model);
  if (mk === '' && md === '') return null;
  if (mk === '') return cut(md);
  if (md === '') return cut(mk);
  const lowMk = mk.toLowerCase();
  const lowMd = md.toLowerCase();
  if (lowMd === lowMk || lowMd.startsWith(`${lowMk} `)) return cut(md);
  return cut(`${mk} ${md}`);
}

function squash(s: string | null): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

function cut(s: string): string {
  return s.length <= DEVICE_MAX_LENGTH ? s : s.slice(0, DEVICE_MAX_LENGTH).trimEnd();
}

// ── 바이트 읽기 (전부 경계 검사) ───────────────────────────────────────────
function readU16(b: Uint8Array, at: number, little: boolean): number | null {
  if (at < 0 || at + 2 > b.length) return null;
  const a = b[at]!;
  const c = b[at + 1]!;
  return little ? a | (c << 8) : (a << 8) | c;
}

function readU32(b: Uint8Array, at: number, little: boolean): number | null {
  if (at < 0 || at + 4 > b.length) return null;
  const a = b[at]!;
  const c = b[at + 1]!;
  const d = b[at + 2]!;
  const e = b[at + 3]!;
  const v = little ? a | (c << 8) | (d << 16) | (e << 24) : (a << 24) | (c << 16) | (d << 8) | e;
  return v >>> 0;
}
