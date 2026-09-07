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
 * ⭐ `params` 는 **선택이 아니다** — `doc.includeNonPrimaryPhotos`(§2-8)를 넘기지 않으면
 *    옵션을 켜도 사진첩이 안 바뀐다. 넘겨받은 것은 `ExportRun.params` 이므로
 *    **재출력 때도 같은 옵션이 그대로 재현된다.**
 *
 * ⚠️ 이 옵션은 `assignNumbers()`·`ExportRun.mapping` 을 건드리지 않는다 (불변식 #2) — 부번은
 *    배치 단계의 파생값이다.
 *
 * `doc.hidePhotoNumber`(F-4)는 더 이상 쓰지 않는다 — 2026-09-04 양식 개정으로 캡션의
 * 사진번호 자체가 없어졌다(결함번호로 대체). 저장 스키마(`ExportParams.hidePhotoNumber`)는
 * 옛 이력 재현을 위해 그대로 두되, 여기서는 읽지 않는다.
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
    // 사진첩 캡션의 `위치` 는 손상결함표 `위치` 열과 같은 함수를 쓰되, **동 이름은 뺀다**
    // (2026-09-04 사용자 요청 — 동 이름은 이제 머리말(`photoBookHeaderText`)에만 있다).
    // `buildings: []` 를 넘기면 `buildLocations` 의 "동이 2개 이상이면 동 이름을 붙인다"
    // 분기가 항상 꺼진다 — 별도 함수를 만들지 않고 기존 함수를 그대로 재사용한다
    locations: buildLocations({
      defects: src.bundle.defects,
      floors: src.bundle.floors,
      buildings: [],
    }),
    // D19 — 좌측 번호 칸도 손상결함표·조사위치도와 같은 접두어를 쓴다(2026-09-04)
    floorCodes: floorCodesFor(src, params),
    // D45 B-5 — 동이 바뀌는 지점에서 페이지를 끊고, 페이지마다 머리말에 동 이름을 쓴다
    buildingNames: photoBookBuildingNames(src),
    includeNonPrimary: params.doc.includeNonPrimaryPhotos === true,
  });
}

/**
 * D45 B-5 — 사진첩에 넘길 **층 id → 동 이름** 맵.
 *
 * ⚠️ 예전에는 여기 대신 `photoBookHeaderText(src, plan)` 가 문서 전체에 머리말 한 줄을 만들면서
 *    *"동이 둘 이상이면 어느 동을 대표로 붙일지 애매하므로 용역명만 낸다"* 는 **비차단 가정**을
 *    두고 동 이름을 버렸다. **D45/D48 이 그 가정을 명시적으로 뒤집었다** — 이제 동이 여럿이면
 *    페이지를 동 경계에서 끊고 페이지마다 그 동의 이름을 낸다. 옛 가정으로 되돌리지 말 것.
 *
 * - **동을 걸러내지 않는다**(`buildings.length >= 2` 게이트 없음). 동이 1개면 모든 층이 같은
 *   이름이라 페이지가 더 끊기지 않고 머리말도 예전과 같은 `{용역명} - {동이름}` 이다(P1).
 * - 이름이 빈 동은 넣지 않는다 — 코어가 `null` 로 보고 용역명만 낸다(P4).
 */
function photoBookBuildingNames(src: ExportSource): Record<string, string> {
  const nameOf = new Map(src.bundle.buildings.map((b) => [b.id, b.name.trim()]));
  const out: Record<string, string> = {};
  for (const f of src.bundle.floors) {
    const n = nameOf.get(f.buildingId) ?? '';
    if (n !== '') out[f.id] = n;
  }
  return out;
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

/**
 * D45 B-3 — 조사위치도에 넘길 층 목록. **동 이름은 여기서 한 번만 판정한다.**
 *
 * 호출부가 둘이다(`produce.ts` 다운로드 · `PrintRoute.tsx` 인쇄 뷰). 각자 판정하면
 * 다운로드 파일명에는 동이 붙는데 인쇄 뷰 `alt` 에는 안 붙는 상태가 생긴다.
 *
 * - **동이 1개면 전부 `null`** — 파일명·경고 문구가 지금과 한 글자도 안 달라진다(P1).
 * - 이름이 빈 동은 없는 것처럼 취급한다(P4).
 */
export function locationMapFloors(
  bundle: ProjectBundle,
): { id: string; name: string; buildingName: string | null }[] {
  const multi = bundle.buildings.length >= 2;
  const nameOf = new Map(bundle.buildings.map((b) => [b.id, b.name.trim()]));
  return bundle.floors.map((f) => {
    const bn = multi ? (nameOf.get(f.buildingId) ?? '') : '';
    return { id: f.id, name: f.name, buildingName: bn === '' ? null : bn };
  });
}

/**
 * D45 B-6 — 이력 한 줄에 붙일 동 표기 (`A동` · `A동·B동`). 동이 1개면 `null` 이라
 * 이력 줄이 지금과 한 글자도 안 달라진다(P1).
 *
 * ⚠️ **`ExportRun` 스키마를 바꾸지 않는다**(P2). 이력에 저장된 층 목록에서 파생한다 —
 *    동 이름을 나중에 고치면 이 요약도 따라 바뀌지만, 그건 **화면 요약**이지 재현되는
 *    산출물 내용이 아니다(층 이름과 정확히 같은 성질 · D19 와 일관).
 *
 * 나열 순서는 동 순위(`sortByOrder`)를 따른다 — 층칩·출력 순서와 같은 기준이다.
 */
export function runBuildingLabel(
  bundle: ProjectBundle,
  floorIds: readonly string[],
): string | null {
  if (bundle.buildings.length < 2) return null;
  const buildingOf = new Map(bundle.floors.map((f) => [f.id, f.buildingId]));
  const used = new Set<string>();
  for (const id of floorIds) {
    const b = buildingOf.get(id);
    if (b !== undefined) used.add(b);
  }
  const names = sortByOrder(bundle.buildings)
    .filter((b) => used.has(b.id))
    .map((b) => b.name.trim())
    .filter((n) => n !== '');
  return names.length === 0 ? null : names.join('·');
}

/**
 * D45 B-7 · D49 — **층 접두어가 두 동에서 겹치는 것**을 찾는다.
 *
 * `층별 1번부터`(`PER_FLOOR`)에서 A동 1층과 B동 1층이 둘 다 접두어 `1F` 를 쓰면
 * **`1F-01` 이 결함 두 개를 가리킨다.** 결함번호는 손상결함표↔사진첩↔조사위치도를 잇는
 * 유일한 열쇠라 대조가 불가능해진다.
 *
 * ⭐ **앱이 접두어를 고치지 않는다**(D49-A). 접두어는 D20 에서 사용자가 직접 입력하는 값으로
 *    못박혔고, 앱이 몰래 바꾸면 **이미 낸 보고서와 번호가 달라진다.** 알리기만 한다.
 * ⭐ **출력을 막지도 않는다**(D3 — 자동 제외·차단은 채택하지 않는다).
 *
 * - `floorCodes` 는 `floorCodesFor()` 결과를 그대로 넣는다. 번호모드가 `PER_FLOOR` 가 아니면
 *   그 함수가 `{}` 를 주므로 **경고 자체가 생기지 않는다** — 조건 판정이 한 곳에만 있다.
 * - **같은 동 안의 중복은 세지 않는다.** 동을 건너뛴 겹침만 이번 변경이 표준 사용법으로
 *   만든 문제이고, 동이 1개인 용역은 화면이 예전과 한 글자도 안 달라진다(P1).
 */
export type FloorCodeClash = {
  /** 겹친 접두어 — `1F` */
  code: string;
  /** 그 접두어를 쓰는 층들 — `A동 1층`. 동 순위 → 층 `sortOrder` 순(층칩과 같은 기준) */
  floorLabels: string[];
};

export function floorCodeClashes(
  bundle: ProjectBundle,
  floorIds: readonly string[],
  floorCodes: Readonly<Record<string, string | null>>,
): FloorCodeClash[] {
  const picked = new Set(floorIds);
  const groups = new Map<string, { buildingIds: Set<string>; labels: string[] }>();
  // `exportFloors` 순서를 그대로 쓴다 — 목록의 나열 순서가 층칩·출력 순서와 어긋나지 않는다
  for (const f of exportFloors(bundle)) {
    if (!picked.has(f.id)) continue;
    const code = (floorCodes[f.id] ?? '').trim();
    if (code === '') continue;
    const g = groups.get(code) ?? { buildingIds: new Set<string>(), labels: [] };
    g.buildingIds.add(f.buildingId);
    const bn = f.buildingName.trim();
    g.labels.push(bn === '' ? f.name : `${bn} ${f.name}`);
    groups.set(code, g);
  }
  const out: FloorCodeClash[] = [];
  for (const [code, g] of groups) {
    if (g.buildingIds.size < 2) continue; // 동을 건너뛴 겹침만 경고한다
    out.push({ code, floorLabels: g.labels });
  }
  return out;
}

/** 결함 id → 화면에 보여줄 짧은 설명 — `[목록 보기]` 가 쓴다 */
export function describeDefect(d: Defect, floorName: string): string {
  const parts = [floorName, d.memberName ?? '', d.defectTypeName ?? ''].filter(
    (s) => s.trim() !== '',
  );
  return `#${d.seq} ${parts.join(' · ')}`.trim();
}
