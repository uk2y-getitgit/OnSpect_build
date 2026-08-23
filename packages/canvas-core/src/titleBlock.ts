/**
 * F5-1 — 도곽(TitleBlock). Numdraw 실측 명세 이식
 * (`_workspace/12_수정사항_S3중간.md` §F5-1. 원본 코드 대신 이 문서가 기준이다).
 *
 * A4 캔버스(= 도면 이미지) **전체**에 그린다. 좌표·크기는 전부 **이미지 px** 이고,
 * 뷰포트를 곱해 스크린 px 로 내보낸다 — 도면과 함께 커지고 작아진다(A3 WYSIWYG).
 *
 * ⚠️ 경계 규칙: 이 파일은 window · document · Image · React 를 참조하지 않는다.
 * 텍스트 폭을 실측할 수 없으므로 `memoGeom.ts` 와 같은 정신으로 **근사**한다 —
 * 렌더와 측정이 같은 근사를 쓰므로 어긋나지 않는다.
 *
 * 출력 시 ON/OFF 는 **Phase 4** 다. 여기서는 설정(`enabled`)과 렌더까지만 만든다.
 */
import type { DrawOp } from './renderModel.js';
import type { Size, Viewport } from './types.js';

// ── 기준값 (tbScale = 1) ───────────────────────────────────────────────────
/** 외곽 여백 */
export const TB_MARGIN = 20;
/** 선 굵기 */
export const TB_BORDER_W = 1.5;
/** 표제란 높이 */
export const TB_BLOCK_H = 68;
/** 라벨 글씨 */
export const TB_LABEL_FONT = 10;
/** 내용 글씨 */
export const TB_VALUE_FONT = 14;
/** 셀 안쪽 여백 */
export const TB_CELL_PAD = 8;

/** PROJECT TITLE 열 비율 */
export const TB_COL0 = 0.42;
/** DRAWING NAME 열 비율 (나머지가 SCALE 열) */
export const TB_COL1 = 0.46;
/** 두 열의 합 상한. 넘으면 SCALE 열이 사라진다 */
export const TB_COL_SUM_MAX = 0.9;
/** 보정 후 DRAWING NAME 열의 최소 비율 */
export const TB_COL_MIN = 0.05;

/** 값은 최대 2줄까지 줄바꿈하고, 넘치면 말줄임한다 */
export const TB_MAX_VALUE_LINES = 2;
/** 줄 간격 = 글자 크기 × 이 값 */
export const TB_LINE_FACTOR = 1.2;

/** 괘선·글씨 색. 결함 예약색(빨강·보라·회색)과 겹치지 않는 인쇄 잉크 계열 */
export const TB_LINE_COLOR = '#111111';
export const TB_LABEL_COLOR = '#666666';
export const TB_VALUE_COLOR = '#111111';
export const TB_FILL = '#ffffff';

/** SCALE 값의 세로 위치 — 셀 높이의 62% (Numdraw 실측) */
export const TB_SCALE_VALUE_Y = 0.62;

export const TB_SCALE_NONE = 'NONE';

export type TitleBlockConfig = {
  /** 화면에 그릴지. **출력 ON/OFF 는 Phase 4 의 별개 옵션이다** */
  enabled: boolean;
  projectTitle: string;
  drawingName: string;
  /** 축척 문자열. 기본 'NONE' */
  scale: string;
  /** 도곽 전체 비례 배율 */
  tbScale: number;
  col0: number;
  col1: number;
  labelFontSz: number;
  valueFontSz: number;
};

export const DEFAULT_TITLE_BLOCK: TitleBlockConfig = {
  enabled: true,
  projectTitle: '',
  drawingName: '',
  scale: TB_SCALE_NONE,
  tbScale: 1,
  col0: TB_COL0,
  col1: TB_COL1,
  labelFontSz: TB_LABEL_FONT,
  valueFontSz: TB_VALUE_FONT,
};

/**
 * 열 비율 보정 — `col0 + col1 > 0.90` 이면 `col1` 을 줄여 SCALE 열을 살린다.
 * `col0` 자체도 0.05 ~ 0.85 로 가둔다(둘 다 0 이면 표가 무너진다).
 */
export function normalizeCols(col0: number, col1: number): { c0: number; c1: number; c2: number } {
  const a = clamp(num(col0, TB_COL0), TB_COL_MIN, TB_COL_SUM_MAX - TB_COL_MIN);
  let b = clamp(num(col1, TB_COL1), TB_COL_MIN, 1);
  if (a + b > TB_COL_SUM_MAX) b = Math.max(TB_COL_MIN, TB_COL_SUM_MAX - a);
  return { c0: a, c1: b, c2: Math.max(TB_COL_MIN, 1 - a - b) };
}

/** 결측·NaN 을 기본값으로 되돌린다 */
export function resolveTitleBlock(
  cfg: Partial<TitleBlockConfig> | null | undefined,
): TitleBlockConfig {
  return {
    enabled: cfg?.enabled ?? DEFAULT_TITLE_BLOCK.enabled,
    projectTitle: cfg?.projectTitle ?? '',
    drawingName: cfg?.drawingName ?? '',
    scale: cfg?.scale ?? TB_SCALE_NONE,
    tbScale: clamp(num(cfg?.tbScale, 1), 0.4, 3),
    col0: num(cfg?.col0, TB_COL0),
    col1: num(cfg?.col1, TB_COL1),
    labelFontSz: clamp(num(cfg?.labelFontSz, TB_LABEL_FONT), 4, 40),
    valueFontSz: clamp(num(cfg?.valueFontSz, TB_VALUE_FONT), 4, 60),
  };
}

// ── 텍스트 근사 (문서를 실측할 수 없다) ────────────────────────────────────
/**
 * 글자 폭을 em 단위로 근사한다. 한글·한자·가나는 1em, 나머지는 0.55em 으로 본다.
 * `memoGeom.wrapMemoText` 와 같은 정신 — 렌더와 측정이 **같은 근사**를 쓴다.
 */
export function estimateEm(text: string): number {
  let w = 0;
  for (const ch of text) w += isWide(ch) ? 1 : 0.55;
  return w;
}

function isWide(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (
    (c >= 0x1100 && c <= 0x115f) ||
    (c >= 0x2e80 && c <= 0xa4cf) ||
    (c >= 0xac00 && c <= 0xd7a3) ||
    (c >= 0xf900 && c <= 0xfaff) ||
    (c >= 0xfe30 && c <= 0xfe6f) ||
    (c >= 0xff00 && c <= 0xff60) ||
    (c >= 0xffe0 && c <= 0xffe6)
  );
}

/**
 * 값 문자열을 셀 폭(`maxEm`, em 단위) 안에서 최대 `maxLines` 줄로 나눈다.
 * 어절 단위를 먼저 시도하고, 한 어절이 줄보다 길 때만 강제로 자른다
 * (`word-break: break-all` 을 항상 쓰지 않는다 — ui-quality).
 * 마지막 줄이 넘치면 `…` 로 자른다.
 */
export function wrapValue(text: string, maxEm: number, maxLines = TB_MAX_VALUE_LINES): string[] {
  const src = (text ?? '').trim();
  if (src === '') return [];
  if (maxEm <= 0.5) return [];

  const lines: string[] = [];
  let line = '';
  const flush = () => {
    if (line !== '') lines.push(line);
    line = '';
  };

  for (const word of src.split(/\s+/)) {
    if (word === '') continue;
    const cand = line === '' ? word : `${line} ${word}`;
    if (estimateEm(cand) <= maxEm) {
      line = cand;
      continue;
    }
    flush();
    let rest = word;
    while (estimateEm(rest) > maxEm) {
      // 한 어절이 줄보다 길다 — 들어가는 데까지 자른다
      let cut = '';
      for (const ch of rest) {
        if (estimateEm(cut + ch) > maxEm) break;
        cut += ch;
      }
      if (cut === '') break;
      lines.push(cut);
      rest = rest.slice(cut.length);
      if (lines.length >= maxLines) break;
    }
    line = rest;
    if (lines.length >= maxLines) break;
  }
  flush();

  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = ellipsize(kept[maxLines - 1] ?? '', maxEm);
  return kept;
}

/** 끝에 `…` 를 붙이되 폭을 넘지 않게 잘라낸다 */
export function ellipsize(text: string, maxEm: number): string {
  const dot = estimateEm('…');
  if (estimateEm(text) + dot <= maxEm) return `${text}…`;
  let out = '';
  for (const ch of text) {
    if (estimateEm(out + ch) + dot > maxEm) break;
    out += ch;
  }
  return `${out}…`;
}

// ── 렌더 ───────────────────────────────────────────────────────────────────
type Cell = { label: string; value: string; x: number; w: number; center: boolean };

/**
 * 도곽 DrawOp. **배경 레이어**에서 부른다 — 뷰포트가 바뀔 때만 다시 그린다.
 *
 * @param size 도면 이미지(= A4 캔버스) 크기, 이미지 px
 */
export function titleBlockOps(
  cfg: TitleBlockConfig,
  size: Size,
  vp: Viewport,
): DrawOp[] {
  if (!cfg.enabled) return [];
  const W = size.w;
  const H = size.h;
  if (W <= 0 || H <= 0) return [];

  const z = vp.zoom;
  const s = cfg.tbScale;
  const sx = (v: number) => vp.tx + v * z;
  const sy = (v: number) => vp.ty + v * z;

  const M = TB_MARGIN * s;
  const borderW = Math.max(0.5, TB_BORDER_W * s * z);
  const BH = Math.min(TB_BLOCK_H * s, Math.max(10, H - 2 * M));

  const ox = M;
  const oy = M;
  const ow = Math.max(1, W - 2 * M);
  const oh = Math.max(1, H - 2 * M);

  const ops: DrawOp[] = [];

  // 1. 외곽 테두리
  ops.push({
    k: 'rect',
    at: { x: sx(ox), y: sy(oy) },
    w: ow * z,
    h: oh * z,
    stroke: TB_LINE_COLOR,
    width: borderW,
  });

  // 2. 표제란 — 외곽 하단에 붙인다. 흰색 채움 + 상단 구분선
  const by = oy + oh - BH;
  ops.push({
    k: 'rect',
    at: { x: sx(ox), y: sy(by) },
    w: ow * z,
    h: BH * z,
    fill: TB_FILL,
    stroke: TB_LINE_COLOR,
    width: borderW,
  });

  // 3. 열 3개 + 세로 구분선 2개
  const { c0, c1 } = normalizeCols(cfg.col0, cfg.col1);
  const w0 = ow * c0;
  const w1 = ow * c1;
  const w2 = Math.max(1, ow - w0 - w1);
  for (const dx of [ox + w0, ox + w0 + w1]) {
    ops.push({
      k: 'line',
      a: { x: sx(dx), y: sy(by) },
      b: { x: sx(dx), y: sy(by + BH) },
      color: TB_LINE_COLOR,
      width: borderW,
    });
  }

  const cells: Cell[] = [
    { label: 'PROJECT TITLE', value: cfg.projectTitle, x: ox, w: w0, center: false },
    { label: 'DRAWING NAME', value: cfg.drawingName, x: ox + w0, w: w1, center: false },
    { label: 'SCALE', value: cfg.scale || TB_SCALE_NONE, x: ox + w0 + w1, w: w2, center: true },
  ];

  // 4. 셀 렌더
  const pad = TB_CELL_PAD * s;
  const labelF = cfg.labelFontSz * s;
  const valueF = cfg.valueFontSz * s;

  for (const cell of cells) {
    const innerW = Math.max(1, cell.w - pad * 2);

    if (cell.center) {
      // SCALE — 라벨·값 모두 가운데 정렬. 값은 셀 높이의 62% 위치
      ops.push({
        k: 'text',
        at: { x: sx(cell.x + cell.w / 2), y: sy(by + pad + labelF * 0.6) },
        text: cell.label,
        size: labelF * z,
        color: TB_LABEL_COLOR,
        align: 'center',
        weight: 600,
      });
      const v = wrapValue(cell.value, innerW / valueF, 1);
      if (v.length > 0) {
        ops.push({
          k: 'text',
          at: { x: sx(cell.x + cell.w / 2), y: sy(by + BH * TB_SCALE_VALUE_Y) },
          text: v[0]!,
          size: valueF * z,
          color: TB_VALUE_COLOR,
          align: 'center',
          weight: 700,
        });
      }
      continue;
    }

    // 일반 셀 — 라벨은 좌상단, 값은 가운데 정렬 (최대 2줄)
    ops.push({
      k: 'textLeft',
      at: { x: sx(cell.x + pad), y: sy(by + pad + labelF * 0.85) },
      text: cell.label,
      size: labelF * z,
      color: TB_LABEL_COLOR,
      weight: 600,
    });

    const lines = wrapValue(cell.value, innerW / valueF);
    if (lines.length === 0) continue;
    const lineH = valueF * TB_LINE_FACTOR;
    const top = by + pad + labelF * TB_LINE_FACTOR;
    const areaH = Math.max(lineH, BH - (top - by) - pad * 0.5);
    let y = top + (areaH - lineH * lines.length) / 2 + lineH * 0.5;
    for (const line of lines) {
      ops.push({
        k: 'text',
        at: { x: sx(cell.x + cell.w / 2), y: sy(y) },
        text: line,
        size: valueF * z,
        color: TB_VALUE_COLOR,
        align: 'center',
        weight: 700,
      });
      y += lineH;
    }
  }

  return ops;
}

// ── 작은 도구 ──────────────────────────────────────────────────────────────
function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : fallback;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
