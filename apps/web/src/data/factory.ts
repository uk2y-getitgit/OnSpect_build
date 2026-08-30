/**
 * 레코드 생성기 — `RecordBase` 공통 필드를 **한 곳에서** 채운다 (§2-9-c).
 *
 * 화면이 `deviceId`·`createdAt`·`updatedAt` 을 직접 다루면 어딘가에서 반드시 빠뜨린다.
 * 빠뜨린 레코드는 Phase 5 병합이 판정할 수 없는 구멍이 된다.
 */
import {
  assignBuildingSortOrder,
  assignSortOrder,
  defaultDrawingName,
  type Building,
  type Drawing,
  type DrawingSource,
  type Floor,
  type ImgLayout,
  type InspectionHalf,
  type InspectionKind,
  type Project,
} from '@onspect/project-core';
import { newId } from './idb/db.js';

function base(deviceId: string, now: number) {
  return { createdAt: now, updatedAt: now, deviceId, createdBy: null as string | null };
}

export type ProjectDraft = {
  year: number;
  half: InspectionHalf;
  kind: InspectionKind;
  name: string;
  prevProjectId: string | null;
};

export function makeProject(deviceId: string, draft: ProjectDraft, now = Date.now()): Project {
  return {
    id: newId(),
    orgId: null, // 조직은 Phase 5
    year: draft.year,
    half: draft.half,
    kind: draft.kind,
    name: draft.name,
    prevProjectId: draft.prevProjectId,
    // §3-1 예약 필드 — S1 폼에는 없다 (ASSUMPTIONS S1·D3)
    clientName: null,
    periodFrom: null,
    periodTo: null,
    defaultStructureType: null,
    lastOpenedAt: now,
    deletedAt: null,
    schemaVersion: 1,
    // D16 — 도곽·범례는 용역 스코프다. `null` 은 "아직 승격 안 됨"이고
    // 읽는 쪽이 기본값으로 받는다(`projectTitleBlockOf`). 처음 여는 순간 승격된다
    titleBlock: null,
    legend: null,
    ...base(deviceId, now),
  };
}

export function makeBuilding(
  deviceId: string,
  projectId: string,
  name: string,
  siblings: readonly Building[],
  now = Date.now(),
): Building {
  return {
    id: newId(),
    projectId,
    name,
    sortOrder: assignBuildingSortOrder(siblings),
    ...base(deviceId, now),
  };
}

export function makeFloor(
  deviceId: string,
  projectId: string,
  buildingId: string,
  name: string,
  siblings: readonly Floor[],
  now = Date.now(),
): Floor {
  return {
    id: newId(),
    projectId,
    buildingId,
    name,
    // 지하는 음수로 부여된다 (불변식 5 · §2-7-a)
    sortOrder: assignSortOrder(name, siblings),
    // D19 · D20 — 접두어는 비워 둔다(옵트인). 비어 있으면 출력에 접두어가 붙지 않는다
    code: null,
    ...base(deviceId, now),
  };
}

export function makeDrawing(
  deviceId: string,
  args: {
    projectId: string;
    floorId: string;
    floorName: string;
    name?: string;
    source: DrawingSource;
    imageWidth: number;
    imageHeight: number;
    renderBlobKey: string;
    sourceBlobKey: string;
    thumbBlobKey: string;
    /** F1 — A4 정규화된 새 도면만 값을 준다. 없으면(예전 방식) null */
    imgLayout?: ImgLayout | null;
    /** F5-3 도면 크기 조절. 없으면 null(=1) */
    imgScale?: number | null;
  },
  now = Date.now(),
): Drawing {
  return {
    id: newId(),
    projectId: args.projectId,
    floorId: args.floorId,
    name: args.name?.trim() || defaultDrawingName(args.floorName),
    source: args.source,
    imageWidth: args.imageWidth,
    imageHeight: args.imageHeight,
    renderBlobKey: args.renderBlobKey,
    sourceBlobKey: args.sourceBlobKey,
    thumbBlobKey: args.thumbBlobKey,
    sortOrder: 0, // S1 은 층당 1장 (Q15 A안)
    imgLayout: args.imgLayout ?? null,
    imgScale: args.imgScale ?? null,
    titleBlock: null, // F5-1 — 도곽은 사용자가 켜기 전까지 없다
    legend: null, // F5-2 — 범례도 마찬가지
    renormalizedAt: null, // F1 — [A4로 맞추기] 를 쓴 적 없다
    labelScale: null, // F6 — 번호 크기는 기본(1)에서 시작한다

    ...base(deviceId, now),
  };
}
