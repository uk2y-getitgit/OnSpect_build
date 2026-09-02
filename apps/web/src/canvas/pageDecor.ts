/**
 * 지면 장식(도곽 · 범례) 배선 — **두 코어를 잇는 자리**.
 *
 * `project-core`(저장 형태 `DrawingTitleBlock`·`DrawingLegend`)와 `canvas-core`(렌더 형태
 * `TitleBlockConfig`·`LegendConfig`)는 서로를 import 하지 않는다(D13). 그 둘을 잇는 것은
 * `apps/web` 의 책임이고, 이 파일이 정확히 그 자리다.
 */
import {
  DEFAULT_TITLE_BLOCK,
  statusRows,
  type Defect,
  type LegendConfig,
  type TitleBlockConfig,
} from '@onspect/canvas-core';
import {
  projectLegendOf,
  projectTitleBlockOf,
  type Drawing,
  type Project,
  type ProjectLegend,
  type ProjectTitleBlock,
} from '@onspect/project-core';

/**
 * 저장된 도곽 설정 → 렌더 설정. **D16 — 도곽은 용역 스코프다.**
 *
 * ⭐ `project.titleBlock ?? DEFAULT_PROJECT_TITLE_BLOCK` 이 **버그 B2 를 없앤다.**
 *    예전에는 `Drawing.titleBlock === null`(새 도면의 기본값)이면 아무것도 안 그렸다 —
 *    그래서 도면마다 설정을 열고 [저장] 을 눌러야 도곽이 나타났다.
 *    이제 `null` 은 "설정 안 함"이 아니라 **"기본값"** 이다(읽기 시점 정규화 · 마이그레이션 0건).
 *
 * 도면에서 읽는 값은 `drawingName` **하나뿐**이다. 나머지 8필드는 조용히 무시한다 —
 * 저장 레코드는 그대로 두고 읽기 규칙만 바꿨다.
 *
 * @param override 다이얼로그 실시간 미리보기용 임시 값. 저장소를 때리지 않는다
 */
export function titleBlockConfigFor(
  drawing: Drawing | null | undefined,
  project: Project | null | undefined,
  override?: ProjectTitleBlock | null,
): TitleBlockConfig | null {
  const p = override ?? projectTitleBlockOf(project?.titleBlock);
  if (!drawing || !p.enabled) return null;
  const name = drawing.titleBlock?.drawingName ?? null;
  return {
    enabled: true,
    projectTitle: (p.projectTitle ?? '').trim() || project?.name || '',
    drawingName: (name ?? '').trim() || drawing.name || '',
    scale: p.scale || DEFAULT_TITLE_BLOCK.scale,
    tbScale: p.tbScale,
    col0: p.col0,
    col1: p.col1,
    labelFontSz: p.labelFontSz,
    valueFontSz: p.valueFontSz,
  };
}

/**
 * 저장된 범례 설정 + 실제 결함 → 렌더 설정. **D16 — 설정은 용역 스코프, 행은 도면별 파생.**
 *
 * `project.legend` 가 `null`(옛 용역)이어도 기본값으로 읽는다 — 도곽과 같은 B2 해소다.
 * 행이 하나도 없으면 그리지 않는다.
 *
 * ⚠️ **U-3 — 결함유형 행은 더 이상 만들지 않는다.** 남은 것은 상태 행뿐이다.
 */
export function legendConfigFor(
  drawing: Drawing | null | undefined,
  defects: readonly Defect[],
  project: Project | null | undefined,
  override?: ProjectLegend | null,
): LegendConfig | null {
  const lg = override ?? projectLegendOf(project?.legend);
  if (!drawing || !lg.enabled) return null;
  const mine = defects.filter((d) => d.drawingId === drawing.id);
  // D15 — 켜져 있어도 **그 도면에 없는 상태는 빠진다**(`statusRows` 안에서 거른다)
  const status = statusRows(lg, mine);
  if (status.length === 0) return null;
  return { enabled: true, lgScale: lg.lgScale, statusRows: status };
}
