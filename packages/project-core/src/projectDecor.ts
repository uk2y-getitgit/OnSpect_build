/**
 * D16 §5-3(c) — **도곽 · 범례 승격.** 용역 스코프로 올리면서 이미 설정해 둔 값을 잃지 않는다.
 *
 * `Project.titleBlock === null`(= 아직 승격 안 됨) 인 용역을 **처음 열 때 한 번만** 돌린다.
 * `CanvasRoute` 의 `ensureProjectSettings`(지연 스냅샷)와 같은 관용구다 —
 * 저장 레코드를 일괄 마이그레이션하지 않고, 여는 시점에 그 용역 것만 채운다.
 *
 * ⚠️ **도면 레코드는 한 건도 건드리지 않는다.** `Project` 1건만 upsert 한다.
 */
import {
  DEFAULT_PROJECT_LEGEND,
  DEFAULT_PROJECT_TITLE_BLOCK,
  projectLegendOf,
  projectTitleBlockOf,
  type Drawing,
  type Floor,
  type Project,
  type ProjectLegend,
  type ProjectTitleBlock,
} from './types.js';

/**
 * 대표 도면 정렬 — **[층 sortOrder 오름차순(지하 음수 먼저) → 도면 sortOrder → 도면 id 사전순]**.
 *
 * `Drawing.sortOrder` 는 `factory.ts` 가 전부 0 으로 만들므로 실질 기준은 층 순서다.
 * 그건 출력 순서와 같아 사용자에게 설명하기도 쉽다 —
 * *"맨 아래층 도면의 설정을 용역 전체 기본값으로 삼았습니다"*.
 */
function orderedDrawings(drawings: readonly Drawing[], floors: readonly Floor[]): Drawing[] {
  const floorOrder = new Map(floors.map((f) => [f.id, f.sortOrder]));
  return [...drawings].sort((a, b) => {
    const fa = floorOrder.get(a.floorId) ?? Number.MAX_SAFE_INTEGER;
    const fb = floorOrder.get(b.floorId) ?? Number.MAX_SAFE_INTEGER;
    if (fa !== fb) return fa - fb;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * 승격이 필요하면 **갱신된 `Project`** 를, 필요 없으면 `null` 을 돌려준다. **순수 함수다.**
 *
 * ⚠️ 옛 레코드는 이 필드 자체가 없어 `undefined` 다 — `=== null` 로 보면 영영 승격이 안 된다.
 *    `?? null` 로 받아 비교한다.
 */
export function promoteProjectDecor(
  project: Project,
  drawings: readonly Drawing[],
  floors: readonly Floor[],
  now = Date.now(),
): Project | null {
  const hasTb = (project.titleBlock ?? null) !== null;
  const hasLg = (project.legend ?? null) !== null;
  if (hasTb && hasLg) return null;

  const ordered = orderedDrawings(drawings, floors);

  // 도곽 · 범례는 **같은 정렬 규칙**으로 각자 대표를 찾는다.
  // 지금까지 다이얼로그가 둘을 항상 함께 저장했으므로 실제 데이터에서는 같은 도면이 뽑힌다.
  // 따로 찾는 쪽이 한쪽만 설정된 예외 데이터에서 **잃는 값이 없다**.
  const titleBlock: ProjectTitleBlock = hasTb
    ? projectTitleBlockOf(project.titleBlock)
    : fromDrawingTitleBlock(ordered.find((d) => d.titleBlock !== null) ?? null);
  const legend: ProjectLegend = hasLg
    ? projectLegendOf(project.legend)
    : fromDrawingLegend(ordered.find((d) => d.legend !== null) ?? null);

  return { ...project, titleBlock, legend, updatedAt: now };
}

/** 대표 도면의 도곽에서 `drawingName` 만 빼고 그대로 가져온다. 없으면 기본값 */
function fromDrawingTitleBlock(rep: Drawing | null): ProjectTitleBlock {
  const tb = rep?.titleBlock;
  if (!tb) return DEFAULT_PROJECT_TITLE_BLOCK;
  return projectTitleBlockOf({
    enabled: tb.enabled,
    projectTitle: tb.projectTitle,
    scale: tb.scale,
    tbScale: tb.tbScale,
    col0: tb.col0,
    col1: tb.col1,
    labelFontSz: tb.labelFontSz,
    valueFontSz: tb.valueFontSz,
  });
}

/**
 * 대표 도면의 범례에서 가져온다. **D15 상태 3종은 기본 false 그대로** —
 * 옛 `DrawingLegend` 에는 그 개념이 없었으므로 승격이 출력물을 바꾸면 안 된다.
 */
function fromDrawingLegend(rep: Drawing | null): ProjectLegend {
  const lg = rep?.legend;
  if (!lg) return DEFAULT_PROJECT_LEGEND;
  return projectLegendOf({ enabled: lg.enabled, lgScale: lg.lgScale });
}
