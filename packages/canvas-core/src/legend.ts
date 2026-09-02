/**
 * F5-2 — 범례(Legend). Numdraw 실측 명세 이식
 * (`_workspace/12_수정사항_S3중간.md` §F5-2).
 *
 * ⚠️ **U-3 (2026-09-02) — 결함유형 범례를 없앴다.**
 * 예전에는 "문자 기호 | 결함유형 이름" 행을 도면에 실제로 쓰인 유형만큼 쌓았다(D8).
 * 사용자 결정으로 그 블록 전체를 뺐다 — 결함유형은 손상결함표·결함리스트가 이미 설명하고,
 * 도면 위 마커에는 유형색이 없어서 범례로 대조할 것이 애초에 없었다.
 * → 범례는 이제 **상태 범례(D15) 한 블록**이다: 색 채운 원 | 상태 문구, 2열 표.
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

/** 반투명 흰 배경 — 도면 위에 얹혀도 글씨가 읽힌다 */
export const LG_BG = 'rgba(255,255,255,0.95)';
/** 괘선 */
export const LG_RULE = 'rgba(0,0,0,0.65)';
/**
 * 글씨색 — **회색 계열 한 색**. 결함 예약색(빨강 `#e5342a` · 보라 `#7c4dff` ·
 * 회색 `#9aa4b0`)과도, 선택 파랑·가이드 시안과도 겹치지 않는 인쇄 잉크다.
 */
export const LG_INK = '#333333';

/**
 * D15 상태 범례 한 행. 이 색은 도면 위 마커의 **상태색**(예약색)이고,
 * 범례는 그 색이 무슨 뜻인지 설명한다.
 */
export type LegendStatusRow = { color: string; desc: string };

export type LegendConfig = {
  /** 화면에 그릴지. **출력 ON/OFF 는 Phase 4 의 별개 옵션이다** */
  enabled: boolean;
  lgScale: number;
  /** D15 상태 행 (색 채운 원 + 고정 문구). **빈 배열이면 아무것도 안 그린다** */
  statusRows: readonly LegendStatusRow[];
};

export const DEFAULT_LEGEND: LegendConfig = {
  enabled: true,
  lgScale: 1,
  statusRows: [],
};

// ── D15 상태 범례 ──────────────────────────────────────────────────────────
export type LegendStatusKind = 'CURRENT' | 'PREV_PENDING' | 'REPAIRED';

/**
 * 상태 행 고정 문구 (U-3 · 2026-09-02).
 *
 * ⚠️ **결함 상태 셀렉터·사이드바 라벨과 일부러 다르다.** 범례는 도면 위에 인쇄되는
 * 좁은 표라 괄호 보충어("(현회차)")가 자리만 먹는다. 화면 안에서 상태를 *고르는* 자리는
 * 회차를 밝혀야 하지만, 도면 위에서 색을 *읽는* 자리는 짧을수록 읽힌다.
 */
export const STATUS_LEGEND_LABEL: Record<LegendStatusKind, string> = {
  CURRENT: '신규',
  PREV_PENDING: '결함',
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
 *    도면에 없는 색을 설명하면 **거짓말이 된다.**
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
  /** D15 상태 행 수 */
  statusCount: number;
};

export function legendLayout(cfg: LegendConfig, size: Size): LegendLayout | null {
  const statusList = cfg.statusRows ?? [];
  if (!cfg.enabled) return null;
  // ⭐ 행이 없으면 그리지 않는다 — 빈 상자가 도면 위에 남으면 안 된다
  if (statusList.length === 0) return null;
  const s = Number.isFinite(cfg.lgScale) && cfg.lgScale > 0 ? cfg.lgScale : 1;

  const fontSize = Math.max(LG_FONT_MIN, Math.round(LG_FONT * s));
  const padX = Math.round(LG_PAD_X * s);
  const rowH = Math.round(LG_ROW_H * s);
  const margin = Math.round(LG_MARGIN * s);

  // 기호열은 지름 `LG_DOT_EM × fontSize` 인 원 하나다 — 글자 폭 근사 대신 실제 지름을 쓴다
  let maxDesc = 0;
  for (const r of statusList) maxDesc = Math.max(maxDesc, estimateEm(r.desc) * fontSize);

  const symW = Math.max(LG_SYM_MIN * s, LG_DOT_EM * fontSize) + padX * 2;
  const descW = maxDesc + padX * 2;
  const w = symW + descW;
  const h = statusList.length * rowH;

  return {
    x: size.w - margin - w,
    y: margin,
    w,
    h,
    symW,
    rowH,
    padX,
    fontSize,
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
  const pushRule = (top: number) => {
    ops.push({
      k: 'line',
      a: { x: sx(L.x), y: sy(top) },
      b: { x: sx(L.x + L.w), y: sy(top) },
      color: LG_RULE,
      width: rule,
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

  // ── D15 상태 범례 — 범례에 남은 유일한 블록이다 (U-3) ──
  (cfg.statusRows ?? []).forEach((row, i) => {
    const top = L.y + i * L.rowH;
    if (i > 0) pushRule(top);
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
