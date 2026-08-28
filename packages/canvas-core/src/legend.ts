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
import { STATUS_COLOR } from './constants.js';
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
/** D15 상태 원(`●`) 지름 = 글꼴 크기의 몇 배인가 */
export const LG_DOT_EM = 0.72;
/** 결함유형 블록과 상태 블록을 가르는 가로 구분선의 굵기 배수 */
export const LG_GROUP_RULE_MUL = 2;

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

/**
 * D15 상태 범례 한 행. **여기만 색을 쓴다** — 이 색은 결함유형색이 아니라
 * 도면 위 마커의 **상태색**(예약색)이고, 범례는 그 색이 무슨 뜻인지 설명한다.
 */
export type LegendStatusRow = { color: string; desc: string };

export type LegendConfig = {
  /** 화면에 그릴지. **출력 ON/OFF 는 Phase 4 의 별개 옵션이다** */
  enabled: boolean;
  lgScale: number;
  /** D8 결함유형 행 (문자 기호 + 설명) */
  rows: readonly LegendRow[];
  /** D15 상태 행 (색 채운 원 + 고정 문구). **빈 배열이면 블록을 안 그린다** */
  statusRows: readonly LegendStatusRow[];
};

export const DEFAULT_LEGEND: LegendConfig = {
  enabled: true,
  lgScale: 1,
  rows: [],
  statusRows: [],
};

// ── D15 상태 범례 ──────────────────────────────────────────────────────────
export type LegendStatusKind = 'CURRENT' | 'PREV_PENDING' | 'REPAIRED';

/** 상태 행 고정 문구 — 결함 상태 셀렉터의 라벨과 같은 말을 쓴다 */
export const STATUS_LEGEND_LABEL: Record<LegendStatusKind, string> = {
  CURRENT: '신규(현회차)',
  PREV_PENDING: '미보수(전회차)',
  REPAIRED: '보수완료',
};

/** 어느 상태 행을 켤지. `project-core` 의 `ProjectLegend` 가 구조적으로 이 형태다 (D13) */
export type StatusLegendToggles = {
  statusNew: boolean;
  statusPending: boolean;
  statusRepaired: boolean;
};

/** 상태만 보는 결함의 최소 형태 — 실제 `Defect` 를 그대로 넘기면 된다 */
export type StatusLegendDefect = { status: LegendStatusKind };

/**
 * D15 §5-2 — 그릴 상태 행. **순수 함수다.**
 *
 * ⭐ **켜져 있어도 그 도면에 없는 상태는 그리지 않는다.**
 *    범례는 *"이 도면의 이 색이 무슨 뜻인가"* 를 설명하는 표다.
 *    도면에 없는 색을 설명하면 **거짓말이 된다** —
 *    결함유형 범례가 `rows.length === 0` 이면 안 그리는 것과 같은 정신.
 *
 * 순서는 항상 신규 → 미보수 → 보수완료다(입력 순서에 기대지 않는다).
 */
export function statusRows(
  cfg: StatusLegendToggles,
  defects: readonly StatusLegendDefect[],
): LegendStatusRow[] {
  const on: Record<LegendStatusKind, boolean> = {
    CURRENT: cfg.statusNew,
    PREV_PENDING: cfg.statusPending,
    REPAIRED: cfg.statusRepaired,
  };
  const out: LegendStatusRow[] = [];
  for (const kind of ['CURRENT', 'PREV_PENDING', 'REPAIRED'] as const) {
    if (!on[kind]) continue;
    if (!defects.some((d) => d.status === kind)) continue;
    out.push({ color: STATUS_COLOR[kind], desc: STATUS_LEGEND_LABEL[kind] });
  }
  return out;
}

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
  /** D8 결함유형 행 수 — 상태 블록이 시작하는 자리이자 가로 구분선의 위치다 */
  typeCount: number;
  /** D15 상태 행 수 */
  statusCount: number;
};

export function legendLayout(cfg: LegendConfig, size: Size): LegendLayout | null {
  const statusList = cfg.statusRows ?? [];
  if (!cfg.enabled) return null;
  // ⭐ 둘 다 비면 그리지 않는다 — 빈 상자가 도면 위에 남으면 안 된다
  if (cfg.rows.length === 0 && statusList.length === 0) return null;
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
  // 상태 행의 기호는 지름 `LG_DOT_EM × fontSize` 인 원이다 — 글자 폭 근사 대신 실제 지름을 쓴다
  if (statusList.length > 0) maxSym = Math.max(maxSym, LG_DOT_EM * fontSize);
  for (const r of statusList) maxDesc = Math.max(maxDesc, estimateEm(r.desc) * fontSize);

  const symW = Math.max(LG_SYM_MIN * s, maxSym) + padX * 2;
  const descW = maxDesc + padX * 2;
  const w = symW + descW;
  const h = (cfg.rows.length + statusList.length) * rowH;

  return {
    x: size.w - margin - w,
    y: margin,
    w,
    h,
    symW,
    rowH,
    padX,
    fontSize,
    typeCount: cfg.rows.length,
    statusCount: statusList.length,
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

  /** 행 구분선 (첫 행 위에는 외곽선이 이미 있다) */
  const pushRule = (top: number, thick: boolean) => {
    ops.push({
      k: 'line',
      a: { x: sx(L.x), y: sy(top) },
      b: { x: sx(L.x + L.w), y: sy(top) },
      color: LG_RULE,
      width: thick ? rule * LG_GROUP_RULE_MUL : rule,
    });
  };
  /** 설명열 — 좌측 정렬, 기호열 오른쪽에서 padX 만큼 띄운다 */
  const pushDesc = (top: number, text: string) => {
    ops.push({
      k: 'textLeft',
      at: {
        x: sx(L.x + L.symW + L.padX),
        y: sy(top + L.rowH / 2 + L.fontSize * 0.35),
      },
      text,
      size: L.fontSize * z,
      color: LG_INK,
      weight: 500,
    });
  };

  cfg.rows.forEach((row, i) => {
    const top = L.y + i * L.rowH;
    if (i > 0) pushRule(top, false);
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
    pushDesc(top, row.desc);
  });

  // ── D15 상태 범례 — 결함유형 블록 **아래**에 가로 구분선 하나로 갈라서 붙인다 ──
  (cfg.statusRows ?? []).forEach((row, i) => {
    const top = L.y + (L.typeCount + i) * L.rowH;
    // i === 0 이고 위에 결함유형 행이 있으면 **두 블록을 가르는 굵은 선**이다
    if (L.typeCount + i > 0) pushRule(top, i === 0 && L.typeCount > 0);
    // 기호 = 그 상태색으로 채운 원. **여기 색이 곧 도면 위 마커 색이다**
    ops.push({
      k: 'circle',
      c: { x: sx(L.x + L.symW / 2), y: sy(top + L.rowH / 2) },
      r: (L.fontSize * LG_DOT_EM * z) / 2,
      fill: row.color,
    });
    pushDesc(top, row.desc);
  });

  return ops;
}
