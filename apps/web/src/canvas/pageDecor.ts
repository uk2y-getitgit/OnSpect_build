/**
 * 지면 장식(도곽) 배선 — **두 코어를 잇는 자리**.
 *
 * `project-core`(저장 형태 `DrawingTitleBlock`)와 `canvas-core`(렌더 형태
 * `TitleBlockConfig`)는 서로를 import 하지 않는다(D13). 그 둘을 잇는 것은
 * `apps/web` 의 책임이고, 이 파일이 정확히 그 자리다.
 */
import { DEFAULT_TITLE_BLOCK, type TitleBlockConfig } from '@onspect/canvas-core';
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
