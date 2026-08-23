/**
 * 샘플 용역 시딩 — S1 스펙 §3 · T11 (ASSUMPTIONS S1·D14).
 *
 * ⚠️ **Phase 3 픽스처 8건이 여기로 이사했다. 좌표·수치·상태를 한 글자도 바꾸지 않았다.**
 * 이 8건은 스냅·히트·상태색을 검증하는 **유일한 회귀 자산**이다. 지우면 안 된다.
 *   · 극단 종횡비 도면 (4000×800) — 함정 #2(정규화 공간의 각도) 실측용
 *   · 미완성 결함 1건 — D3 `미완성 N건` 배지
 *   · 전회차(보라) 1건 · 보수완료(회색 40%) 1건 — 상태색
 *   · 결함 0건인 층, 도면 없는 층 — 빈 상태
 *
 * 샘플도 **실제 저장 경로를 그대로 탄다** (fetch → ingest → IndexedDB).
 * 특별 취급하면 샘플에서만 되는 버그가 숨는다.
 */
import type { Defect, Mark } from '@onspect/canvas-core';
import { EMPTY_DEFECT_ATTRS, inferSizeMode } from '@onspect/canvas-core';
import type { Drawing, Floor, Project } from '@onspect/project-core';
import { makeBuilding, makeDrawing, makeFloor, makeProject } from './factory.js';
import { newBlobKey } from './idb/blobs.js';
import { newId } from './idb/db.js';
import type { DrawingUpload, IdbProjectRepo } from './idb/repo.js';
import { ingestFiles, type ReadyCandidate } from './imageIngest.js';

/** 픽스처 도면 — `public/fixtures/` 에 그대로 둔다 */
const FIXTURE_FILES = [
  { slot: 'B3', file: 'sample-floorplan-B3.svg' },
  { slot: 'WIDE', file: 'test-wide-4000x800.svg' },
] as const;

type Slot = (typeof FIXTURE_FILES)[number]['slot'];

/** 층 구성 — 도면 슬롯이 null 이면 도면 없는 층 */
const SAMPLE_FLOORS: { name: string; slot: Slot | null }[] = [
  { name: '지하3층', slot: 'B3' },
  { name: '지하2층', slot: 'WIDE' },
  { name: '지하1층', slot: 'B3' }, // 도면은 있고 결함은 0건 — 빈 상태 확인용
  { name: '지상1층', slot: null }, // 도면 없는 층 — 빈 상태 확인용
];

function point(defectId: string, x: number, y: number, n = 0): Mark {
  return {
    id: `${defectId}-m${n}`,
    defectId,
    type: 'POINT',
    geometry: { k: 'POINT', x, y },
    sortOrder: n,
  };
}

type Seed = {
  id: string;
  floorName: string;
  seq: number;
  status: Defect['status'];
  mark: [number, number];
  /** null = 자동 배치(placed:false) */
  label: [number, number] | null;
  memberName: string | null;
  defectTypeName: string | null;
  widthMm: number | null;
  lengthMm: number | null;
  areaM2: number | null;
  countEa: number | null;
  memo: string | null;
};

/**
 * 면적은 (폭mm/1000)×(길이mm/1000) 소수 4자리 **절사** (불변식 4).
 * 개소는 곱하지 않는다. Phase 3 은 계산기가 아니라 표시만 하므로 값을 미리 넣어 둔다.
 */
const SEEDS: Seed[] = [
  {
    id: 'dfx-001', floorName: '지하3층', seq: 1, status: 'CURRENT',
    mark: [0.28, 0.30], label: [0.36, 0.22],
    memberName: '슬래브', defectTypeName: '균열',
    widthMm: 0.2, lengthMm: 2500, areaM2: 0.0005, countEa: 1,
    memo: '통심선 3-C 부근 대각 균열',
  },
  {
    id: 'dfx-002', floorName: '지하3층', seq: 2, status: 'CURRENT',
    mark: [0.52, 0.30], label: [0.52, 0.20],
    memberName: '기둥', defectTypeName: '박리/박락',
    widthMm: 120, lengthMm: 260, areaM2: 0.0312, countEa: 1,
    memo: null,
  },
  {
    id: 'dfx-003', floorName: '지하3층', seq: 3, status: 'CURRENT',
    mark: [0.52, 0.62], label: [0.64, 0.62],
    memberName: '벽(비구조체)', defectTypeName: '백태',
    widthMm: 0, lengthMm: 0, areaM2: 0.42, countEa: 2,
    memo: '누수 흔적 동반',
  },
  {
    id: 'dfx-004', floorName: '지하3층', seq: 4, status: 'REPAIRED',
    mark: [0.755, 0.45], label: null,
    memberName: '계단참 슬래브', defectTypeName: '마감박리/박리',
    widthMm: 300, lengthMm: 450, areaM2: 0.135, countEa: 1,
    memo: '2024년 2차 진단 시 지적 · 보수 완료',
  },
  {
    id: 'dfx-005', floorName: '지하3층', seq: 5, status: 'PREV_PENDING',
    mark: [0.36, 0.72], label: [0.36, 0.82],
    memberName: '보', defectTypeName: '철근노출',
    widthMm: 60, lengthMm: 800, areaM2: 0.048, countEa: 1,
    memo: '전회차 미보수',
  },

  // 지하2층 — 극단 종횡비(4000×800) 도면. 각도 스냅이 화면상 직교인지 확인하는 자리
  {
    id: 'dfx-101', floorName: '지하2층', seq: 1, status: 'CURRENT',
    mark: [0.25, 0.5], label: [0.25, 0.25],
    memberName: '슬래브', defectTypeName: '균열',
    widthMm: 0.3, lengthMm: 1800, areaM2: 0.00054, countEa: 1, memo: null,
  },
  {
    id: 'dfx-102', floorName: '지하2층', seq: 2, status: 'CURRENT',
    mark: [0.5, 0.5], label: [0.56, 0.75],
    memberName: '기둥', defectTypeName: '균열',
    widthMm: 0.4, lengthMm: 900, areaM2: 0.00036, countEa: 1, memo: null,
  },
  {
    id: 'dfx-103', floorName: '지하2층', seq: 3, status: 'CURRENT',
    mark: [0.75, 0.5], label: null,
    // 미완성 결함 — 좌측 리스트의 `미완성 N건` 배지 확인용 (D3)
    memberName: null, defectTypeName: null,
    widthMm: null, lengthMm: null, areaM2: null, countEa: null, memo: null,
  },
];

export type SampleResult = {
  project: Project;
  drawingCount: number;
  defectCount: number;
};

/**
 * 빈 목록에서 `[샘플 용역 만들기]` 로 호출한다.
 * 픽스처 SVG 를 `fetch` → `ingest` → IndexedDB 로 적재하므로 실제 업로드와 같은 경로다.
 */
export async function seedSampleProject(
  repo: IdbProjectRepo,
  deviceId: string,
  now = Date.now(),
): Promise<SampleResult> {
  // 1. 픽스처 도면을 실제 파일처럼 읽어 인입 파이프라인에 태운다
  const files: File[] = [];
  for (const f of FIXTURE_FILES) {
    const res = await fetch(`${import.meta.env.BASE_URL}fixtures/${f.file}`);
    if (!res.ok) throw new Error(`샘플 도면을 읽지 못했습니다: ${f.file}`);
    const blob = await res.blob();
    files.push(new File([blob], f.file, { type: 'image/svg+xml' }));
  }
  const { candidates } = await ingestFiles(files);
  const bySlot = new Map<Slot, ReadyCandidate>();
  candidates.forEach((c, i) => {
    if (c.status === 'READY') bySlot.set(FIXTURE_FILES[i]!.slot, c);
  });
  if (bySlot.size !== FIXTURE_FILES.length) throw new Error('샘플 도면을 처리하지 못했습니다');

  // 2. 용역 · 동 · 층
  const project = makeProject(
    deviceId,
    { year: 2026, half: 'H1', kind: 'PRECISE', name: '○○아파트 3차', prevProjectId: null },
    now,
  );
  await repo.putProject(project);

  const building = makeBuilding(deviceId, project.id, '본관', [], now);
  await repo.putBuildings([building]);

  const floors: Floor[] = [];
  for (const f of SAMPLE_FLOORS) {
    floors.push(makeFloor(deviceId, project.id, building.id, f.name, floors, now));
  }
  await repo.putFloors(floors);

  // 3. 도면 — Blob 3종과 함께 한 트랜잭션으로 커밋된다 (§2-9-d)
  const uploads: DrawingUpload[] = [];
  const drawingByFloorName = new Map<string, Drawing>();
  SAMPLE_FLOORS.forEach((sf, i) => {
    if (!sf.slot) return;
    const cand = bySlot.get(sf.slot)!;
    const floor = floors[i]!;
    const renderKey = newBlobKey();
    const drawing = makeDrawing(
      deviceId,
      {
        projectId: project.id,
        floorId: floor.id,
        floorName: floor.name,
        source: { kind: 'IMAGE', fileName: cand.fileName, mime: cand.mime, byteSize: cand.byteSize },
        imageWidth: cand.imageWidth,
        imageHeight: cand.imageHeight,
        renderBlobKey: renderKey,
        sourceBlobKey: newBlobKey(),
        thumbBlobKey: newBlobKey(),
        imgLayout: cand.imgLayout,
      },
      now,
    );
    drawingByFloorName.set(floor.name, drawing);
    uploads.push({
      drawing,
      renderBlob: cand.renderBlob,
      sourceBlob: cand.sourceBlob,
      thumbBlob: cand.thumbBlob,
    });
  });
  await repo.registerDrawings(uploads);

  // 4. 결함 8건 — 좌표는 정규화 그대로다 (불변식 1)
  const floorByName = new Map(floors.map((f) => [f.name, f]));
  const defects: Defect[] = SEEDS.map((s) => {
    const floor = floorByName.get(s.floorName)!;
    const drawing = drawingByFloorName.get(s.floorName)!;
    const uniqueId = `${s.id}-${newId().slice(0, 8)}`;
    const m = point(uniqueId, s.mark[0], s.mark[1]);
    return {
      id: uniqueId,
      projectId: project.id,
      drawingId: drawing.id,
      floorId: floor.id,
      seq: s.seq,
      status: s.status,
      prevDefectId: null,
      marks: [m],
      label: {
        defectId: uniqueId,
        x: s.label ? s.label[0] : s.mark[0],
        y: s.label ? s.label[1] : s.mark[1],
        anchorMarkId: m.id,
        placed: s.label !== null,
      },
      sketch: [],
      style: null,
      // 속성 초기값은 EMPTY_DEFECT_ATTRS 한 곳에만 있다 (S4 스펙 §2-6)
      ...EMPTY_DEFECT_ATTRS,
      sizeMode: inferSizeMode(s),
      memberName: s.memberName,
      defectTypeName: s.defectTypeName,
      widthMm: s.widthMm,
      lengthMm: s.lengthMm,
      areaM2: s.areaM2,
      countEa: s.countEa,
      memo: s.memo,
    };
  });
  await repo.upsertDefects(defects);

  return { project, drawingCount: uploads.length, defectCount: defects.length };
}

/** 샘플에 쓰이는 동·층 이름 — 안내 문구에서 그대로 인용한다 */
export const SAMPLE_SUMMARY = `동 1개 · 층 ${SAMPLE_FLOORS.length}개 · 도면 ${
  SAMPLE_FLOORS.filter((f) => f.slot).length
}장 · 결함 ${SEEDS.length}건`;

export const SAMPLE_BUILDING_COUNT = 1;
export const SAMPLE_FLOOR_COUNT = SAMPLE_FLOORS.length;
export const SAMPLE_DRAWING_COUNT = SAMPLE_FLOORS.filter((f) => f.slot).length;
export const SAMPLE_DEFECT_COUNT = SEEDS.length;
