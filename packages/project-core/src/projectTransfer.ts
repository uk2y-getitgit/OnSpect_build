/**
 * 기기 간 프로젝트 이동 — 로그인 없이 파일로 (D38, Q74).
 *
 * Track 1(동기화 서버·로그인)을 뒤로 미루고, "현장 촬영 → PC 정리" 를 지금 당장 되게 하려고
 * 만든 별개 경로다. 서버를 전혀 안 쓴다 — 프로젝트 하나를 파일(zip: manifest + blob) 하나로
 * 내보내고, 다른 기기에서 그 파일을 가져와 로컬 IndexedDB 에 **새 프로젝트로** 심는다.
 *
 * **가져오기는 항상 새 id 를 발급한다** (D38) — 같은 파일을 두 번 가져와도 서로 안 부딪힌다.
 * 그래서 여기 있는 건 "id 그래프를 옛 것에서 새 것으로 다시 잇는" 순수 계산뿐이다.
 * 실제 zip 압축·해제·IndexedDB 쓰기는 `apps/web`(어댑터) 몫이다 — 이 파일은 `Blob`·`File`·
 * `IDBDatabase` 를 참조하지 않는다(경계 규칙 9).
 *
 * ⚠️ `defect`/`memo`/`mark`/`label` 은 canvas-core 타입이라 여기서 import 할 수 없다
 * (경계 규칙 8, 역방향 금지). `numbering.ts::NumberingDefect` 와 같은 수법으로 —
 * 필요한 필드만 담은 로컬 최소 타입을 제네릭 제약으로 선언한다. 실제 `Defect`/`Memo` 를
 * 그대로 넘겨도 구조적 타이핑으로 맞고, 나머지 필드(속성·스타일·병합재료 등)는 스프레드로
 * 그대로 보존된다.
 */

export type TransferMark = { id: string; defectId: string };
export type TransferLabel = { defectId: string; anchorMarkId: string | null };
export type TransferDefect = {
  id: string;
  projectId: string;
  drawingId: string;
  floorId: string;
  prevDefectId: string | null;
  marks: TransferMark[];
  label: TransferLabel;
};
export type TransferMemo = { id: string; projectId: string; drawingId: string; floorId: string };

export type TransferProject = { id: string; prevProjectId: string | null };
export type TransferBuilding = { id: string; projectId: string };
export type TransferFloor = { id: string; projectId: string; buildingId: string };
export type TransferDrawing = { id: string; projectId: string; floorId: string };
export type TransferPhoto = { id: string; projectId: string; defectId: string };
export type TransferItemSettings = { id: string; projectId: string | null };

/** 옛 id → 새 id. 만드는 쪽(apps/web)이 `makeId()` 를 돌려 채운다 — 여기선 난수를 안 쓴다 */
export type IdMap = ReadonlyMap<string, string>;

/**
 * 내보내기 번들 — project-core 가 아는 4종(용역·동·층·도면·항목설정) + 제네릭으로 받는
 * 결함·메모·사진(canvas-core 쪽 실 타입이 구조적으로 들어온다).
 */
export type TransferBundle<
  Project extends TransferProject,
  Building extends TransferBuilding,
  Floor extends TransferFloor,
  Drawing extends TransferDrawing,
  Defect extends TransferDefect,
  Memo extends TransferMemo,
  Photo extends TransferPhoto,
  ItemSettings extends TransferItemSettings,
> = {
  project: Project;
  buildings: readonly Building[];
  floors: readonly Floor[];
  drawings: readonly Drawing[];
  defects: readonly Defect[];
  memos: readonly Memo[];
  photos: readonly Photo[];
  /** null = 이 프로젝트에 항목설정 스냅샷이 아직 없다(이론상 없음 — 방어적으로 허용) */
  itemSettings: ItemSettings | null;
};

/**
 * 이 번들 안에서 **새 id 를 받아야 하는** 모든 항목의 옛 id.
 * 순서 없음 · 중복 없음(같은 id 가 여러 번 나와도 한 번만).
 *
 * `Defect.prevDefectId` / `Project.prevProjectId` 는 **여기 안 넣는다** — 그 값은
 * 내보내는 범위 **밖**(예: 전회차 프로젝트)을 가리킬 수 있는 참조라서, "이 번들의 새 id" 취급을
 * 하면 안 된다. `remapTransferBundle` 이 이 값들은 번들 안에 있을 때만 remap 하고,
 * 없으면 원래 값을 그대로 둔다.
 */
export function collectTransferIds<
  Project extends TransferProject,
  Building extends TransferBuilding,
  Floor extends TransferFloor,
  Drawing extends TransferDrawing,
  Defect extends TransferDefect,
  Memo extends TransferMemo,
  Photo extends TransferPhoto,
  ItemSettings extends TransferItemSettings,
>(bundle: TransferBundle<Project, Building, Floor, Drawing, Defect, Memo, Photo, ItemSettings>): string[] {
  const out = new Set<string>();
  out.add(bundle.project.id);
  for (const b of bundle.buildings) out.add(b.id);
  for (const f of bundle.floors) out.add(f.id);
  for (const d of bundle.drawings) out.add(d.id);
  for (const d of bundle.defects) {
    out.add(d.id);
    for (const m of d.marks) out.add(m.id);
  }
  for (const m of bundle.memos) out.add(m.id);
  for (const p of bundle.photos) out.add(p.id);
  if (bundle.itemSettings) out.add(bundle.itemSettings.id);
  return [...out];
}

/** `idMap` 에 반드시 있어야 하는 참조(번들 안의 자기 항목). 없으면 번들 구성 자체가 깨진 것이다 */
function remapRequired(idMap: IdMap, id: string): string {
  const next = idMap.get(id);
  if (next === undefined) {
    throw new Error(`projectTransfer: idMap에 없는 id를 참조했습니다 — ${id} (번들 구성이 깨졌습니다)`);
  }
  return next;
}

/** 번들 밖을 가리킬 수 있는 참조. 있으면 remap, 없으면(밖을 가리키면) 원래 값 그대로 둔다 */
function remapOptional(idMap: IdMap, id: string | null): string | null {
  if (id === null) return null;
  return idMap.get(id) ?? id;
}

/**
 * 번들 전체의 id 그래프를 `idMap` 대로 다시 잇는다. 결함·건물·층 등 각 항목의
 * **다른 필드는 스프레드로 원본 그대로** 보존한다 — 속성·스타일·상태 등은 여기서 한 글자도
 * 안 바뀐다. 오직 id · projectId · drawingId · floorId · buildingId · defectId ·
 * anchorMarkId · prevDefectId · prevProjectId 만 다시 잇는다.
 */
export function remapTransferBundle<
  Project extends TransferProject,
  Building extends TransferBuilding,
  Floor extends TransferFloor,
  Drawing extends TransferDrawing,
  Defect extends TransferDefect,
  Memo extends TransferMemo,
  Photo extends TransferPhoto,
  ItemSettings extends TransferItemSettings,
>(
  bundle: TransferBundle<Project, Building, Floor, Drawing, Defect, Memo, Photo, ItemSettings>,
  idMap: IdMap,
): TransferBundle<Project, Building, Floor, Drawing, Defect, Memo, Photo, ItemSettings> {
  return {
    project: {
      ...bundle.project,
      id: remapRequired(idMap, bundle.project.id),
      prevProjectId: remapOptional(idMap, bundle.project.prevProjectId),
    },
    buildings: bundle.buildings.map((b) => ({
      ...b,
      id: remapRequired(idMap, b.id),
      projectId: remapRequired(idMap, b.projectId),
    })),
    floors: bundle.floors.map((f) => ({
      ...f,
      id: remapRequired(idMap, f.id),
      projectId: remapRequired(idMap, f.projectId),
      buildingId: remapRequired(idMap, f.buildingId),
    })),
    drawings: bundle.drawings.map((d) => ({
      ...d,
      id: remapRequired(idMap, d.id),
      projectId: remapRequired(idMap, d.projectId),
      floorId: remapRequired(idMap, d.floorId),
      // renderBlobKey·sourceBlobKey·thumbBlobKey 는 일부러 안 건드린다 — 이미 uuid라
      // 충돌 없음(S6), 바이트는 원래 키 그대로 옮겨 심는다
    })),
    defects: bundle.defects.map((d) => {
      const newDefectId = remapRequired(idMap, d.id);
      return {
        ...d,
        id: newDefectId,
        projectId: remapRequired(idMap, d.projectId),
        drawingId: remapRequired(idMap, d.drawingId),
        floorId: remapRequired(idMap, d.floorId),
        prevDefectId: remapOptional(idMap, d.prevDefectId),
        marks: d.marks.map((m) => ({ ...m, id: remapRequired(idMap, m.id), defectId: newDefectId })),
        label: {
          ...d.label,
          defectId: newDefectId,
          anchorMarkId: d.label.anchorMarkId === null ? null : remapRequired(idMap, d.label.anchorMarkId),
        },
      };
    }),
    memos: bundle.memos.map((m) => ({
      ...m,
      id: remapRequired(idMap, m.id),
      projectId: remapRequired(idMap, m.projectId),
      drawingId: remapRequired(idMap, m.drawingId),
      floorId: remapRequired(idMap, m.floorId),
    })),
    photos: bundle.photos.map((p) => ({
      ...p,
      id: remapRequired(idMap, p.id),
      projectId: remapRequired(idMap, p.projectId),
      defectId: remapRequired(idMap, p.defectId),
      // sourceBlobKey·renderBlobKey·thumbBlobKey — 도면과 같은 이유로 안 건드린다
    })),
    itemSettings: bundle.itemSettings
      ? {
          ...bundle.itemSettings,
          id: remapRequired(idMap, bundle.itemSettings.id),
          projectId: bundle.itemSettings.projectId === null ? null : remapRequired(idMap, bundle.itemSettings.projectId),
          // members·defectTypes·causes·repairs·link* 의 내부 id 는 절대 안 건드린다 —
          // 별도 IndexedDB 스토어가 아니라 이 문서 안에 중첩된 값이라 전역 유일성이 필요 없고,
          // defect.memberId/defectTypeId/causeId/repairId 도 그대로 이 안의 id 를 계속 가리킨다
        }
      : null,
  };
}

/**
 * 이 번들이 참조하는 모든 blob 키(도면 3종 + 사진 3종). 순서 없음 · 중복 없음.
 * 내보내기가 "어떤 바이트를 파일에 같이 담아야 하는가"를 묻는 딱 한 곳이다.
 */
export function collectTransferBlobKeys<
  Project extends TransferProject,
  Building extends TransferBuilding,
  Floor extends TransferFloor,
  Drawing extends TransferDrawing & { renderBlobKey: string; sourceBlobKey: string; thumbBlobKey: string },
  Defect extends TransferDefect,
  Memo extends TransferMemo,
  Photo extends TransferPhoto & { renderBlobKey: string; sourceBlobKey: string; thumbBlobKey: string },
  ItemSettings extends TransferItemSettings,
>(bundle: TransferBundle<Project, Building, Floor, Drawing, Defect, Memo, Photo, ItemSettings>): string[] {
  const out = new Set<string>();
  for (const d of bundle.drawings) {
    out.add(d.renderBlobKey);
    out.add(d.sourceBlobKey);
    out.add(d.thumbBlobKey);
  }
  for (const p of bundle.photos) {
    out.add(p.renderBlobKey);
    out.add(p.sourceBlobKey);
    out.add(p.thumbBlobKey);
  }
  return [...out];
}
