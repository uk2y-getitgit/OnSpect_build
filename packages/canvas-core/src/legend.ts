/**
 * F5-2 — 범례(Legend). Numdraw 실측 명세 이식
 * (`_workspace/12_수정사항_S3중간.md` §F5-2).
 *
 * ⚠️ **D8 (Q28 답변) 로 Numdraw 원본과 갈라지는 지점이 하나 있다.**
 * Numdraw 는 기호가 없으면 "그 색 가로선 샘플"을 그렸다. 우리는 그 경로를 **쓰지 않는다** —
 * 결함유형별 고유 색을 만들지 않기 때문이다(D8). 도면 위 마커 색은 **결함 상태색**
 * (현회차 빨강 · 전회차 보라 · 보수완료 회색)이고, 범례에 유형색을 또 두면
 * "이 색이 유형인가 상태인가"를 매번 판단해야 한다.
 * → 범례는 **회색 계열 한 색 + 문자 기호** 2열 표다.
 *
 * A4 캔버스(= 도면 이미지) **우측 상단**에 그린다. 좌표·크기는 전부 이미지 px 이고
 * 뷰포트를 곱해 스크린 px 로 내보낸다 — 도면과 함께 커지고 작아진다(A3 WYSIWYG).
 *
 * 경계 규칙: window · document · Image · React 를 참조하지 않는다.
 * 텍스트 폭은 `titleBlock.estimateEm` 으로 근사한다(렌더와 측정이 같은 근사를 쓴다).
 */
import type { DrawOp } from './renderModel.js';
import { estimateEm } from './titleBlock.js';
import type { Size, Viewport } from './types.js';

// ── 기준값 (lgScale = 1) ───────────────────────────────────────────────────
export const LG_FONT = 12;
export const LG_PAD_X = 10;
export const LG_ROW_H = 24;
export const LG_MARGIN = 30;
/** 기호열 최소 폭 (여백 제외) */
export const LG_SYM_MIN = 28;
/** 글자가 이보다 작아지면 읽을 수 없다 */
export const LG_FONT_MIN = 9;

/** 반투명 흰 배경 — 도면 위에 얹혀도 글씨가 읽힌다 */
export const LG_BG = 'rgba(255,255,255,0.95)';
/** 괘선 */
export const LG_RULE = 'rgba(0,0,0,0.65)';
/**
 * 글씨색 — **회색 계열 한 색**(D8). 결함 예약색(빨강 `#e5342a` · 보라 `#7c4dff` ·
 * 회색 `#9aa4b0`)과도, 선택 파랑·가이드 시안과도 겹치지 않는 인쇄 잉크다.
 */
export const LG_INK = '#333333';

/** 범례 한 행. **색이 없다** — 색으로 유형을 구분하지 않기 때문이다(D8) */
export type LegendRow = { sym: string; desc: string };

export type LegendConfig = {
  /** 화면에 그릴지. **출력 ON/OFF 는 Phase 4 의 별개 옵션이다** */
  enabled: boolean;
  lgScale: number;
  rows: readonly LegendRow[];
};

export const DEFAULT_LEGEND: LegendConfig = { enabled: true, lgScale: 1, rows: [] };

/**
 * 결함유형 이름 → 문자 기호(D8 "약어나 번호").
 *
 * 첫 글자 → 앞 두 글자 → 이름 전체 → 순번, 순서로 **겹치지 않는 첫 값**을 고른다.
 * 번호보다 약어를 먼저 쓰는 이유: 번호는 도면 위 어디에도 없어서 대조할 곳이 없다.
 */
export function legendSymbol(name: string, taken: ReadonlySet<string>, index: number): string {
  const n = name.trim();
  const chars = [...n];
  const cands = [chars[0] ?? '', chars.slice(0, 2).join(''), n, String(index + 1)];
  for (const c of cands) {
    if (c !== '' && !taken.has(c)) return c;
  }
  return String(index + 1);
}

/** 실제 배치. 렌더와 (나중에 붙을) 히트 판정이 같은 값을 쓰도록 따로 뽑아 둔다 */
export type LegendLayout = {
  /** 이미지 px */
  x: number;
  y: number;
  w: number;
  h: number;
  symW: number;
  rowH: number;
  padX: number;
  fontSize: number;
};

export function legendLayout(cfg: LegendConfig, size: Size): LegendLayout | null {
  if (!cfg.enabled || cfg.rows.length === 0) return null;
  const s = Number.isFinite(cfg.lgScale) && cfg.lgScale > 0 ? cfg.lgScale : 1;

  const fontSize = Math.max(LG_FONT_MIN, Math.round(LG_FONT * s));
  const padX = Math.round(LG_PAD_X * s);
  const rowH = Math.round(LG_ROW_H * s);
  const margin = Math.round(LG_MARGIN * s);

  let maxSym = 0;
  let maxDesc = 0;
  for (const r of cfg.rows) {
    maxSym = Math.max(maxSym, estimateEm(r.sym) * fontSize);
    maxDesc = Math.max(maxDesc, estimateEm(r.desc) * fontSize);
  }
  const symW = Math.max(LG_SYM_MIN * s, maxSym) + padX * 2;
  const descW = maxDesc + padX * 2;
  const w = symW + descW;
  const h = cfg.rows.length * rowH;

  return {
    x: size.w - margin - w,
    y: margin,
    w,
    h,
    symW,
    rowH,
    padX,
    fontSize,
  };
}

/**
 * 범례 DrawOp. **배경 레이어**에서 부른다 — 뷰포트가 바뀔 때만 다시 그린다.
 *
 * @param size 도면 이미지(= A4 캔버스) 크기, 이미지 px
 */
export function legendOps(cfg: LegendConfig, size: Size, vp: Viewport): DrawOp[] {
  const L = legendLayout(cfg, size);
  if (!L) return [];

  const z = vp.zoom;
  const sx = (v: number) => vp.tx + v * z;
  const sy = (v: number) => vp.ty + v * z;
  const rule = Math.max(0.5, z);

  const ops: DrawOp[] = [
    // 배경 + 외곽
    {
      k: 'rect',
      at: { x: sx(L.x), y: sy(L.y) },
      w: L.w * z,
      h: L.h * z,
      fill: LG_BG,
      stroke: LG_RULE,
      width: rule,
    },
    // 열 구분선 1개
    {
      k: 'line',
      a: { x: sx(L.x + L.symW), y: sy(L.y) },
      b: { x: sx(L.x + L.symW), y: sy(L.y + L.h) },
      color: LG_RULE,
      width: rule,
    },
  ];

  cfg.rows.forEach((row, i) => {
    const top = L.y + i * L.rowH;
    // 행 구분선 (첫 행 위에는 외곽선이 이미 있다)
    if (i > 0) {
      ops.push({
        k: 'line',
        a: { x: sx(L.x), y: sy(top) },
        b: { x: sx(L.x + L.w), y: sy(top) },
        color: LG_RULE,
        width: rule,
      });
    }
    // 기호 — 가운데 정렬
    ops.push({
      k: 'text',
      at: { x: sx(L.x + L.symW / 2), y: sy(top + L.rowH / 2) },
      text: row.sym,
      size: L.fontSize * z,
      color: LG_INK,
      align: 'center',
      weight: 700,
    });
    // 설명 — 좌측 정렬, 기호열 오른쪽에서 padX 만큼 띄운다
    ops.push({
      k: 'textLeft',
      at: {
        x: sx(L.x + L.symW + L.padX),
        y: sy(top + L.rowH / 2 + L.fontSize * 0.35),
      },
      text: row.desc,
      size: L.fontSize * z,
      color: LG_INK,
      weight: 500,
    });
  });

  return ops;
}
