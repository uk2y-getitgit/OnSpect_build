/**
 * 파일 다운로드 · 파일명 규칙 — Phase 4 스펙 §4-2 · §4-3.
 *
 * **새 의존성이 없다.** `URL.createObjectURL(blob)` → `<a download>` → `revokeObjectURL`.
 * 4종을 함께 뽑을 때는 **하나씩 순차 다운로드**한다 —
 * ZIP 은 새 의존성이라 1차 제외다. 브라우저가 "여러 파일 다운로드 허용"을 한 번 묻는 것으로 끝난다.
 */
import { ARTIFACT_LABEL, type ExportArtifactKind } from '@onspect/project-core';

/** 브라우저가 연속 다운로드를 막지 않도록 사이에 두는 간격 */
const SEQUENTIAL_GAP_MS = 220;

/**
 * 파일명 금지문자 → `_` (§4-2).
 * 윈도 예약문자만 바꾼다 — **공백과 하이픈은 그대로 둔다.**
 * 바꾸면 용역 표시명과 `YYYYMMDD-HHmm` 스탬프가 함께 망가진다.
 */
const FORBIDDEN_CHARS = /[\\/:*?"<>|]/g;

export function sanitizeFileName(s: string): string {
  const out = s
    .replace(FORBIDDEN_CHARS, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 120)
    .trim();
  return out === '' ? '무제' : out;
}

/** `YYYYMMDD-HHmm` — 로컬 시각 */
export function stampFor(at: number | Date = Date.now()): string {
  const d = at instanceof Date ? at : new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/**
 * `{용역표시명}_{산출물}_{YYYYMMDD-HHmm}.{ext}` (§4-2).
 * `suffix` 는 조사위치도처럼 층 이름이 붙는 경우에 쓴다 → `{…}_조사위치도_지하1층_{stamp}.png`
 */
export function buildFileName(opts: {
  displayName: string;
  kind: ExportArtifactKind | string;
  ext: string;
  at?: number;
  suffix?: string | null;
}): string {
  const label =
    opts.kind in ARTIFACT_LABEL
      ? ARTIFACT_LABEL[opts.kind as ExportArtifactKind]
      : String(opts.kind);
  const parts = [opts.displayName, label];
  if (opts.suffix) parts.push(opts.suffix);
  parts.push(stampFor(opts.at ?? Date.now()));
  return `${sanitizeFileName(parts.join('_'))}.${opts.ext.replace(/^\./, '')}`;
}

/** Blob 1개를 내려받는다. objectURL 은 반드시 해제한다 — 안 하면 수 MB 씩 샌다 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // 클릭 직후 해제하면 일부 브라우저가 받다 만다. 넉넉히 미룬다
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}

export type DownloadItem = { blob: Blob; fileName: string };

/** 여러 파일을 **순차로** 내려받는다 (ZIP 대신 — §4-3) */
export async function downloadSequential(items: readonly DownloadItem[]): Promise<void> {
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i]!;
    downloadBlob(it.blob, it.fileName);
    if (i < items.length - 1) await sleep(SEQUENTIAL_GAP_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

/** UTF-8 BOM CSV — 엑셀 라이브러리가 전부 막혔을 때의 폴백(§4-8)이 쓴다 */
export function csvBlob(rows: readonly (readonly (string | number | null)[])[]): Blob {
  const body = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  return new Blob([BOM, body], { type: 'text/csv;charset=utf-8' });
}

/** 엑셀이 UTF-8 로 읽게 하는 표식. 없으면 한글이 깨진다 */
const BOM = '﻿';

function csvCell(v: string | number | null): string {
  if (v === null) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
