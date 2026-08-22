/**
 * 최근 접속 상대시간 — S1 스펙 §2-5.
 *
 * 순수 함수다. `Date.now()` 를 **인자로 받는다** — 코어는 시간을 모른다.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * | 경과      | 표기         |
 * | < 60초    | `방금`       |
 * | < 60분    | `n분 전`     |
 * | < 24시간  | `n시간 전`   |
 * | < 7일     | `n일 전`     |
 * | 그 외     | `YYYY-MM-DD` |
 */
export function formatRelative(now: number, ts: number): string {
  const d = now - ts;
  if (d < MINUTE) return '방금';
  if (d < HOUR) return `${Math.floor(d / MINUTE)}분 전`;
  if (d < DAY) return `${Math.floor(d / HOUR)}시간 전`;
  if (d < WEEK) return `${Math.floor(d / DAY)}일 전`;
  return formatDate(ts);
}

/** `YYYY-MM-DD` — 로컬 시간대 기준 */
export function formatDate(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** `<time title>` / 툴팁에 넣는 절대시각 */
export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${formatDate(ts)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** `<time datetime>` 속성값 (ISO 8601) */
export function isoOf(ts: number): string {
  return new Date(ts).toISOString();
}

/** 용량 표기 — `약 48MB` 의 숫자 부분 (§2-9-d) */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  const mb = bytes / (1024 * 1024);
  return mb < 10 ? `${mb.toFixed(1)}MB` : `${Math.round(mb)}MB`;
}
