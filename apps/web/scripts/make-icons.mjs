/**
 * PWA 아이콘 생성기 (P1) — 의존성 0. `node scripts/make-icons.mjs`
 *
 * 왜 스크립트인가: 바이너리 PNG 를 저장소에 "출처 없이" 던져 놓으면 나중에 색·모양을
 * 고칠 방법이 사라진다. 여기서 다시 생성할 수 있게 남긴다.
 *
 * 도안: 파랑 바탕(--accent-ink) 위 흰 도면 한 장 + 빨간 결함 점(--defect-current).
 * 앱이 하는 일 그 자체다. 글자를 안 쓰므로 폰트 의존이 없다.
 *
 * 마스커블(Android 적응형)은 안전영역이 중앙 80% 라 도안을 62% 로 줄이고 바탕을 꽉 채운다.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const BG = [0x1b, 0x4b, 0xa8]; // --accent-ink
const SHEET = [0xff, 0xff, 0xff];
const LINE = [0xc3, 0xcf, 0xe2];
const DOT = [0xe5, 0x34, 0x2a]; // --defect-current

/** 안티에일리어싱은 4× 슈퍼샘플링으로 얻는다 (셰이더 안 짜도 된다) */
const SS = 4;

// ── 도안 (중심 원점, 한 변 1.0 기준) ────────────────────────────────────────
const SHEET_HW = 0.3;
const SHEET_HH = 0.345;
const SHEET_R = 0.028;
const LINES = [-0.2, -0.09, 0.02];
const LINE_HALF_T = 0.011;
const LINE_X = 0.19;
const DOT_C = [0.125, 0.185];
const DOT_R = 0.1;
const DOT_HALO = 0.128;

function roundRectHit(x, y, hw, hh, r) {
  const dx = Math.abs(x) - (hw - r);
  const dy = Math.abs(y) - (hh - r);
  if (dx <= 0 || dy <= 0) return Math.abs(x) <= hw && Math.abs(y) <= hh;
  return dx * dx + dy * dy <= r * r;
}

/** 한 점의 색. `scale` 은 도안 배율(마스커블은 작게) */
function shade(x, y, scale) {
  const u = x / scale;
  const v = y / scale;
  const dot = Math.hypot(u - DOT_C[0], v - DOT_C[1]);
  if (dot <= DOT_R) return DOT;
  if (roundRectHit(u, v, SHEET_HW, SHEET_HH, SHEET_R)) {
    if (dot <= DOT_HALO) return SHEET; // 점 둘레 흰 테 — 선 위에 겹쳐도 읽힌다
    for (const ly of LINES) {
      if (Math.abs(v - ly) <= LINE_HALF_T && u >= -LINE_X && u <= LINE_X) return LINE;
    }
    return SHEET;
  }
  return BG;
}

function renderRGBA(size, scale) {
  const px = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py += 1) {
    for (let pxi = 0; pxi < size; pxi += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const x = (pxi + (sx + 0.5) / SS) / size - 0.5;
          const y = (py + (sy + 0.5) / SS) / size - 0.5;
          const c = shade(x, y, scale);
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      const n = SS * SS;
      const o = (py * size + pxi) * 4;
      px[o] = Math.round(r / n);
      px[o + 1] = Math.round(g / n);
      px[o + 2] = Math.round(b / n);
      px[o + 3] = 255; // 바탕은 언제나 불투명 — 마스커블 규격 요구
    }
  }
  return px;
}

// ── 최소 PNG 인코더 (색타입 6 · 8bit · 필터 0) ──────────────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const [name, size, scale] of [
  ['icon-192.png', 192, 0.82],
  ['icon-512.png', 512, 0.82],
  ['icon-maskable-512.png', 512, 0.62],
]) {
  const file = join(OUT, name);
  writeFileSync(file, encodePng(size, renderRGBA(size, scale)));
  console.log('wrote', file);
}
