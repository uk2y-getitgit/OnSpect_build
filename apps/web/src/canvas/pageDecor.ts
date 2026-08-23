/**
 * 지면 장식(도곽 · 범례) 배선 — **두 코어를 잇는 자리**.
 *
 * `project-core`(저장 형태 `DrawingTitleBlock`·`DrawingLegend`)와 `canvas-core`(렌더 형태
 * `TitleBlockConfig`·`LegendConfig`)는 서로를 import 하지 않는다(D13). 그 둘을 잇는 것은
 * `apps/web` 의 책임이고, 이 파일이 정확히 그 자리다.
 */
import {
  DEFAULT_TITLE_BLOCK,
  legendSymbol,
  type Defect,
  type LegendConfig,
  type LegendRow,
  type TitleBlockConfig,
} from '@onspect/canvas-core';
import type { Drawing, Project } from '@onspect/project-core';

/**
 * 저장된 도곽 설정 → 렌더 설정.
 * `null`(설정 없음)이거나 꺼져 있으면 `null` 을 돌려준다 — 캔버스는 아무것도 그리지 않는다.
 * 비어 있는 항목은 용역명·도면명으로 자동 채운다.
 */
export function titleBlockConfigFor(
  drawing: Drawing | null | undefined,
  project: Project | null | undefined,
): TitleBlockConfig | null {
  const tb = drawing?.titleBlock;
  if (!drawing || !tb || !tb.enabled) return null;
  return {
    enabled: true,
    projectTitle: (tb.projectTitle ?? '').trim() || project?.name || '',
    drawingName: (tb.drawingName ?? '').trim() || drawing.name || '',
    scale: tb.scale || DEFAULT_TITLE_BLOCK.scale,
    tbScale: tb.tbScale,
    col0: tb.col0,
    col1: tb.col1,
    labelFontSz: tb.labelFontSz,
    valueFontSz: tb.valueFontSz,
  };
}

/**
 * F5-2 범례 행 — **이 도면에 실제로 쓰인 결함유형만** 넣는다(§F5-2 `equipFilter`).
 *
 * D8: 결함유형별 고유 색을 만들지 않는다. 기호열에는 **이름 약어**를 넣는다
 * (번호는 도면 위 어디에도 없어 대조할 곳이 없다 — 약어가 스스로 설명한다).
 * 정렬은 **처음 등장한 순서**(seq 오름차순)라 도면을 훑는 순서와 같아진다.
 */
export function legendRowsFor(defects: readonly Defect[]): LegendRow[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const d of [...defects].sort((a, b) => a.seq - b.seq)) {
    const name = (d.defectTypeName ?? '').trim();
    if (name === '') continue; // 미완성 결함(D3)은 범례에 넣지 않는다
    const key = d.defectTypeId ?? `name:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  const taken = new Set<string>();
  return names.map((desc, i) => {
    const sym = legendSymbol(desc, taken, i);
    taken.add(sym);
    return { sym, desc };
  });
}

/** 저장된 범례 설정 + 실제 결함 → 렌더 설정. 행이 하나도 없으면 그리지 않는다 */
export function legendConfigFor(
  drawing: Drawing | null | undefined,
  defects: readonly Defect[],
): LegendConfig | null {
  const lg = drawing?.legend;
  if (!drawing || !lg || !lg.enabled) return null;
  const rows = legendRowsFor(defects.filter((d) => d.drawingId === drawing.id));
  if (rows.length === 0) return null;
  return { enabled: true, lgScale: lg.lgScale, rows };
}
