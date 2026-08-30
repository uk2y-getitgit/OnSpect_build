/**
 * 출력 모델 배선 — 묶음(`ProjectBundle`) + 설정 → 4종 산출물의 **공통 입력**.
 *
 * ⭐ **번호는 여기서 한 번만 정해진다.** 화면(P6)·엑셀·인쇄 뷰·조사위치도가 전부
 *    이 파일이 만든 `ExportPlan.rows` 를 쓴다. 각자 `assignNumbers` 를 부르면
 *    파라미터가 미세하게 어긋나는 순간 **조용히 다른 보고서**가 나온다(K20).
 *
 * 두 진입점이 있고 **재계산 여부가 다르다** (§3-3 재현성 규칙):
 *   · `planExport()`   — `[생성]`. `assignNumbers()` 로 **새로 계산**한다
 *   · `planFromRun()`  — `[같은 번호로 다시 받기]`. `ExportRun.mapping` 을 **그대로 쓴다**
 */
import { isIncomplete, type Defect } from '@onspect/canvas-core';
import {
  assignNumbers,
  buildDamageTable,
  buildDefectList,
  buildLocations,
  buildPhotoBook,
  defectIdsWithPrimaryPhoto,
  floorCodesOf,
  formatDefectNo,
  groupPhotosByDefect,
  sortByOrder,
  type DamageTableInput,
  type DamageTableModel,
  type ExportParams,
  type ExportRun,
  type FloorRange,
  type ItemSettings,
  type NumberingRow,
  type PhotoBookPage,
} from '@onspect/project-core';
import type { ProjectBundle } from '../data/idb/repo';

export type ExportSource = {
  bundle: ProjectBundle;
  /** 이 용역의 항목 스냅샷 — 부재 `structural` · 원인 `code` 조회에 쓴다 (불변식 #7) */
  settings: ItemSettings;
};

export type ExportPlan = {
  /** 출력 순서 그대로 */
  rows: NumberingRow[];
  floorRanges: FloorRange[];
  /** 포함됐지만 손봐야 하는 것. **막지 않는다. 알리기만 한다** (D3) */
  warnings: { incomplete: string[]; noPhoto: string[] };
  /** 대표사진이 있어 사진첩에 실릴 건수 */
  photoCount: number;
};

/** `[생성]` — 매번 새로 계산한다 (불변식 #2: 번호는 저장하지 않는다) */
export function planExport(src: ExportSource, params: ExportParams): ExportPlan {
  const hasPhoto = defectIdsWithPrimaryPhoto(src.bundle.photos);
  const incomplete = new Set(src.bundle.defects.filter(isIncomplete).map((d) => d.id));
  const r = assignNumbers(src.bundle.defects, params, { hasPhoto, incomplete });
  return {
    rows: r.rows,
    floorRanges: r.floorRanges,
    warnings: r.warnings,
    photoCount: r.rows.filter((x) => x.photoNo !== null).length,
  };
}

/**
 * `[같은 번호로 다시 받기]` — **다시 계산하지 않는다.**
 *
 * `mapping` 에 있으나 지금은 사라진 결함은 건너뛰고(그 번호는 비워 둔다),
 * `mapping` 에 없는 새 결함은 애초에 `order` 에 없으므로 자동으로 빠진다(§3-3 표 3행).
 */
export function planFromRun(src: ExportSource, run: ExportRun): ExportPlan {
  const floorOf = new Map(src.bundle.defects.map((d) => [d.id, d.floorId]));
  const rows: NumberingRow[] = [];
  for (const id of run.order) {
    const m = run.mapping[id];
    if (!m) continue;
    const floorId = floorOf.get(id);
    if (floorId === undefined) continue; // 그 사이 지워진 결함
    rows.push({ defectId: id, floorId, no: m.no, photoNo: m.photoNo });
  }
  return {
    rows,
    floorRanges: run.floorRanges,
    warnings: { incomplete: [], noPhoto: [] },
    photoCount: rows.filter((x) => x.photoNo !== null).length,
  };
}

// ── 산출물 모델 ────────────────────────────────────────────────────────────
function tableInput(
  src: ExportSource,
  plan: ExportPlan,
  params: ExportParams,
): Omit<DamageTableInput, 'columns'> {
  return {
    rows: plan.rows,
    defects: src.bundle.defects,
    floors: src.bundle.floors,
    buildings: src.bundle.buildings,
    members: src.settings.members,
    causes: src.settings.causes,
    projectName: src.bundle.project.name,
    headerLine2: params.doc.headerLine2,
    floorCodes: floorCodesFor(src, params),
  };
}

/**
 * D19 · D20 — 이 출력에 쓸 층 접두어. **스냅샷이 있으면 그것이 진실이다**(재현성).
 * 없으면(옛 `ExportRun`) 지금 층의 **수동 입력** 접두어를 읽는다 — 옛 이력도 깨지지 않고 열린다.
 * 접두어를 아무 층에도 넣지 않았으면 값이 전부 `null` 이라 예전 파일이 그대로 재현된다.
 *
 * ⭐ 화면·엑셀·인쇄 뷰·조사위치도가 전부 이 함수 하나를 부른다. 각자 파생하면
 *    층 이름을 고친 날 산출물끼리 접두어가 어긋난다(K20 과 같은 정신).
 *
 * ⭐ **번호모드가 `PER_FLOOR` 가 아니면 접두어를 쓰지 않는다** (검수 보통1).
 *    전체연속에서 접두어를 붙이면 `1F-01 … 1F-12 · 2F-13 · 2F-14` 가 되어 접두어가 거짓말을 한다
 *    (`2F-13` 은 2층의 13번이 아니다). 접두어는 "층 안에서 1부터"를 전제로 한 표기다.
 */
export function floorCodesFor(
  src: ExportSource,
  params: ExportParams,
): Record<string, string | null> {
  if (params.mode !== 'PER_FLOOR') return {};
  return params.floorCodes ?? floorCodesOf(src.bundle.floors);
}

/**
 * 결함 id → 출력 결함번호 **표기 문자열** (`1F-01` 또는 `1`).
 * 조사위치도의 번호 풍선이 이것을 그린다.
 */
export function displayNumbersOf(
  plan: ExportPlan,
  floorCodes: Record<string, string | null>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of plan.rows) out[r.defectId] = formatDefectNo(r.no, floorCodes[r.floorId] ?? null);
  return out;
}

export function damageTableModel(
  src: ExportSource,
  plan: ExportPlan,
  params: ExportParams,
): DamageTableModel {
  return buildDamageTable(tableInput(src, plan, params));
}

export function defectListModel(
  src: ExportSource,
  plan: ExportPlan,
  params: ExportParams,
): DamageTableModel {
  return buildDefectList(tableInput(src, plan, params));
}

/**
 * ⭐ `params` 는 **선택이 아니다** — `doc.includeNonPrimaryPhotos`(§2-8)·`doc.hidePhotoNumber`(F-4)를
 *    넘기지 않으면 옵션을 켜도 사진첩이 안 바뀐다. 넘겨받은 것은 `ExportRun.params` 이므로
 *    **재출력 때도 같은 옵션이 그대로 재현된다.**
 *
 * ⚠️ 두 옵션 모두 `assignNumbers()`·`ExportRun.mapping` 을 건드리지 않는다 (불변식 #2).
 *    부번은 배치 단계의 파생값이고, 숨김은 표시만 뺀 것이다.
 */
export function photoBookModel(
  src: ExportSource,
  plan: ExportPlan,
  params: ExportParams,
): PhotoBookPage[] {
  return buildPhotoBook({
    rows: plan.rows,
    defects: src.bundle.defects,
    photosByDefect: groupPhotosByDefect(src.bundle.photos),
    // 사진첩 캡션 2행의 `위치` 는 손상결함표 `위치` 열과 **같은 규칙**이다 (K17)
    locations: buildLocations({
      defects: src.bundle.defects,
      floors: src.bundle.floors,
      buildings: src.bundle.buildings,
    }),
    includeNonPrimary: params.doc.includeNonPrimaryPhotos === true,
    hidePhotoNumber: params.doc.hidePhotoNumber === true,
  });
}

// ── 층 ─────────────────────────────────────────────────────────────────────
export type ExportFloor = {
  id: string;
  name: string;
  buildingId: string;
  buildingName: string;
  sortOrder: number;
  /** 이 층에 도면이 있는가 — 없으면 조사위치도가 나오지 않는다 */
  hasDrawing: boolean;
  defectCount: number;
};

/**
 * 층 칩 목록. **표시 순서는 `sortOrder` 오름차순**(불변식 #5)이고,
 * 출력 순서는 사용자가 누른 순서다 — 둘은 별개다(§4-4).
 */
export function exportFloors(bundle: ProjectBundle): ExportFloor[] {
  const buildingName = new Map(bundle.buildings.map((b) => [b.id, b.name]));
  const withDrawing = new Set(bundle.drawings.map((d) => d.floorId));
  const counts = new Map<string, number>();
  for (const d of bundle.defects) counts.set(d.floorId, (counts.get(d.floorId) ?? 0) + 1);

  // 동 순서 → 층 순서. 동이 하나면 층 순서만 남는다
  const buildingRank = new Map(
    sortByOrder(bundle.buildings).map((b, i) => [b.id, i] as const),
  );
  return [...bundle.floors]
    .sort((a, b) => {
      const ra = buildingRank.get(a.buildingId) ?? 0;
      const rb = buildingRank.get(b.buildingId) ?? 0;
      if (ra !== rb) return ra - rb;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .map((f) => ({
      id: f.id,
      name: f.name,
      buildingId: f.buildingId,
      buildingName: buildingName.get(f.buildingId) ?? '',
      sortOrder: f.sortOrder,
      hasDrawing: withDrawing.has(f.id),
      defectCount: counts.get(f.id) ?? 0,
    }));
}

/** 층 id → 이름 (경고 목록·파일명 접미사에 쓴다) */
export function floorNameMap(bundle: ProjectBundle): Map<string, string> {
  return new Map(bundle.floors.map((f) => [f.id, f.name]));
}

/** 결함 id → 화면에 보여줄 짧은 설명 — `[목록 보기]` 가 쓴다 */
export function describeDefect(d: Defect, floorName: string): string {
  const parts = [floorName, d.memberName ?? '', d.defectTypeName ?? ''].filter(
    (s) => s.trim() !== '',
  );
  return `#${d.seq} ${parts.join(' · ')}`.trim();
}
