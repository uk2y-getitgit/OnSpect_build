/**
 * `ProjectRepo` 의 IndexedDB 구현 — S1 스펙 §2-9 · §2-12 (**D5**).
 *
 * 여기가 **Phase 5 동기화가 붙을 유일한 이음매**다 (§2-9-e).
 * 지금은 서버 클라이언트·동기화 큐·충돌 병합·`syncState` 필드를 **하나도 만들지 않는다** (D5 ③).
 * 큐를 지금 만들면 서버 계약 없이 형식만 굳는다.
 *
 * `RecordBase` 의 `deviceId`·`updatedAt` 은 **여기서 채운다.** 화면은 신경 쓰지 않는다.
 */
import type { Defect, Memo } from '@onspect/canvas-core';
import {
  newDefectBase,
  normalizeArrowMarks,
  normalizeDefectAttrs,
  normalizeDefectBase,
  stampDefect,
} from '@onspect/canvas-core';
import type {
  Building,
  CopyStructureResult,
  Drawing,
  ExportArtifact,
  ExportRun,
  Floor,
  ItemSettings,
  Photo,
  Project,
  ProjectRepo,
  ProjectSummary,
} from '@onspect/project-core';
import {
  createOrgSettings,
  groupPhotosByDefect,
  normalizePhotos,
  ORG_SETTINGS_ID,
  snapshotForProject,
} from '@onspect/project-core';
import {
  countByIndex,
  getAllByIndex,
  newId,
  reqAsPromise,
  STORE,
  txDone,
} from './db.js';
import {
  getBlobIn,
  objectUrlFor,
  putBlobIn,
  releaseBlobIn,
  retainBlobIn,
  revokeUrl,
  type BlobRecord,
} from './blobs.js';
import {
  appendArtifact,
  deleteExportRun,
  getExportRun,
  listExportRuns,
  pruneExportRuns,
  putExportRun,
} from './exportRuns.js';
import {
  purgePhotoIdsIn,
  purgePhotoRecordsIn,
  purgePhotosOfDefectsIn,
  putPhotoUploadIn,
  type PhotoUpload,
} from './photos.js';

/** 도면 1장 등록에 필요한 것 전부. Blob 3종이 **함께** 커밋된다 (§2-9-d) */
export type DrawingUpload = {
  drawing: Drawing;
  renderBlob: Blob;
  /** 이미지 입력이고 래스터화가 무손실 통과면 `renderBlob` 과 같은 객체여도 된다 */
  sourceBlob: Blob;
  thumbBlob: Blob;
};

/** P3·P5 가 한 번에 읽는 묶음 */
export type ProjectBundle = {
  project: Project;
  buildings: Building[];
  floors: Floor[];
  drawings: Drawing[];
  defects: Defect[];
  /** 메모 레이어. **결함이 아니다** — 결함 집계에 섞지 않는다 (상세기획 §2) */
  memos: Memo[];
  /**
   * S5 — 이 용역의 사진 전부. **읽기 정규화(불변식 #8)를 통과한 상태**다.
   * 결함을 고를 때마다 저장소를 다시 두드리지 않는다 — 로컬 우선(불변식 #3).
   * Blob 은 여기 없다. 썸네일은 `objectUrl(thumbBlobKey)` 로 따로 가져온다.
   */
  photos: Photo[];
};

export class IdbProjectRepo implements ProjectRepo<Defect, Memo, Photo> {
  constructor(
    private readonly db: IDBDatabase,
    private readonly deviceId: string,
  ) {}

  private stamp<T extends { updatedAt: number; deviceId: string }>(rec: T, now = Date.now()): T {
    return { ...rec, updatedAt: now, deviceId: this.deviceId };
  }

  /**
   * 결함판 `stamp()`. 결함은 `RecordBase` 가 아니라 `DefectBase`(`updatedAt: number | null`)
   * 를 갖기 때문에 위 제네릭에 안 들어간다 — 규칙의 정본은 `canvas-core/defectBase.ts` 다(D23).
   */
  private stampDefect(d: Defect, now = Date.now()): Defect {
    return stampDefect(d, now, this.deviceId);
  }

  // ── 용역 ────────────────────────────────────────────────────────────────
  async listProjects(): Promise<Project[]> {
    const tx = this.db.transaction(STORE.projects, 'readonly');
    const all = await reqAsPromise<Project[]>(tx.objectStore(STORE.projects).getAll());
    return all
      .filter((p) => p.deletedAt === null)
      .sort((a, b) =>
        b.lastOpenedAt !== a.lastOpenedAt
          ? b.lastOpenedAt - a.lastOpenedAt
          : b.createdAt - a.createdAt,
      );
  }

  /** 삭제된 것까지 — 되돌리기 토스트가 필요로 한다 */
  async listAllProjectsIncludingDeleted(): Promise<Project[]> {
    const tx = this.db.transaction(STORE.projects, 'readonly');
    return reqAsPromise<Project[]>(tx.objectStore(STORE.projects).getAll());
  }

  async listProjectSummaries(): Promise<ProjectSummary[]> {
    const projects = await this.listProjects();
    const tx = this.db.transaction(
      [STORE.buildings, STORE.floors, STORE.drawings, STORE.defects, STORE.blobs],
      'readonly',
    );
    const bs = tx.objectStore(STORE.buildings);
    const fs = tx.objectStore(STORE.floors);
    const ds = tx.objectStore(STORE.drawings);
    const xs = tx.objectStore(STORE.defects);
    const blobs = tx.objectStore(STORE.blobs);

    const out: ProjectSummary[] = [];
    for (const p of projects) {
      const drawings = await getAllByIndex<Drawing>(ds, 'by_project', p.id);
      const keys = new Set<string>();
      for (const d of drawings) {
        keys.add(d.renderBlobKey);
        keys.add(d.sourceBlobKey);
        keys.add(d.thumbBlobKey);
      }
      let byteSize = 0;
      for (const k of keys) {
        const rec = await reqAsPromise<BlobRecord | undefined>(blobs.get(k));
        if (rec) byteSize += rec.byteSize;
      }
      out.push({
        project: p,
        buildingCount: await countByIndex(bs, 'by_project', p.id),
        floorCount: await countByIndex(fs, 'by_project', p.id),
        drawingCount: drawings.length,
        // 건수는 인덱스 count 다. **출력번호와 무관하다** (불변식 2)
        defectCount: await countByIndex(xs, 'by_project', p.id),
        byteSize,
      });
    }
    return out;
  }

  async getProject(id: string): Promise<Project | null> {
    const tx = this.db.transaction(STORE.projects, 'readonly');
    return (await reqAsPromise<Project | undefined>(tx.objectStore(STORE.projects).get(id))) ?? null;
  }

  async putProject(p: Project): Promise<void> {
    const tx = this.db.transaction(STORE.projects, 'readwrite');
    tx.objectStore(STORE.projects).put(this.stamp(p));
    await txDone(tx);
  }

  async touchProject(id: string, now: number): Promise<void> {
    const tx = this.db.transaction(STORE.projects, 'readwrite');
    const store = tx.objectStore(STORE.projects);
    const p = await reqAsPromise<Project | undefined>(store.get(id));
    if (p) store.put({ ...p, lastOpenedAt: now });
    await txDone(tx);
  }

  /** 소프트 삭제 — 하위는 건드리지 않는다(복원 대상, §2-4-b) */
  async softDeleteProject(id: string, now: number): Promise<void> {
    const tx = this.db.transaction(STORE.projects, 'readwrite');
    const store = tx.objectStore(STORE.projects);
    const p = await reqAsPromise<Project | undefined>(store.get(id));
    if (p) store.put(this.stamp({ ...p, deletedAt: now }, now));
    await txDone(tx);
  }

  async restoreProject(id: string): Promise<void> {
    const tx = this.db.transaction(STORE.projects, 'readwrite');
    const store = tx.objectStore(STORE.projects);
    const p = await reqAsPromise<Project | undefined>(store.get(id));
    if (p) store.put(this.stamp({ ...p, deletedAt: null }));
    await txDone(tx);
  }

  // ── 묶음 로드 ───────────────────────────────────────────────────────────
  async loadBundle(projectId: string): Promise<ProjectBundle | null> {
    const project = await this.getProject(projectId);
    if (!project || project.deletedAt !== null) return null;
    const tx = this.db.transaction(
      [STORE.buildings, STORE.floors, STORE.drawings, STORE.defects, STORE.memos, STORE.photos],
      'readonly',
    );
    const buildings = await getAllByIndex<Building>(
      tx.objectStore(STORE.buildings),
      'by_project',
      projectId,
    );
    const floors = await getAllByIndex<Floor>(tx.objectStore(STORE.floors), 'by_project', projectId);
    const drawings = await getAllByIndex<Drawing>(
      tx.objectStore(STORE.drawings),
      'by_project',
      projectId,
    );
    const rawDefects = await getAllByIndex<Defect>(
      tx.objectStore(STORE.defects),
      'by_project',
      projectId,
    );
    const memos = (
      await getAllByIndex<Memo>(tx.objectStore(STORE.memos), 'by_project', projectId)
    ).map(normalizeMemo);
    const rawPhotos = await getAllByIndex<Photo>(
      tx.objectStore(STORE.photos),
      'by_project',
      projectId,
    );
    // S1 에 저장된 레코드에는 `sketch` 가 없다. 읽는 즉시 채워 화면 코드가 분기하지 않게 한다
    const defects = rawDefects.map((d) => normalizeDefect(d, this.deviceId));
    // 사진은 **결함별로 묶어** 정규화한다 — 대표 정확히 1장(불변식 #8 · K16)
    const photos: Photo[] = [];
    for (const group of groupPhotosByDefect(rawPhotos).values()) photos.push(...group);
    return { project, buildings, floors, drawings, defects, memos, photos };
  }

  // ── 동 ──────────────────────────────────────────────────────────────────
  async listBuildings(projectId: string): Promise<Building[]> {
    const tx = this.db.transaction(STORE.buildings, 'readonly');
    return getAllByIndex<Building>(tx.objectStore(STORE.buildings), 'by_project', projectId);
  }

  async putBuildings(items: readonly Building[]): Promise<void> {
    if (items.length === 0) return;
    const tx = this.db.transaction(STORE.buildings, 'readwrite');
    const store = tx.objectStore(STORE.buildings);
    for (const b of items) store.put(this.stamp(b));
    await txDone(tx);
  }

  async deleteBuilding(buildingId: string): Promise<void> {
    const tx = this.db.transaction(
      // 사진까지 같은 트랜잭션에 연다 — 결함이 사라지면 사진도 함께 간다 (K13)
      [
        STORE.buildings,
        STORE.floors,
        STORE.drawings,
        STORE.defects,
        STORE.blobs,
        STORE.memos,
        STORE.photos,
      ],
      'readwrite',
    );
    const floors = await getAllByIndex<Floor>(
      tx.objectStore(STORE.floors),
      'by_building',
      buildingId,
    );
    for (const f of floors) await this.purgeFloorIn(tx, f.id);
    tx.objectStore(STORE.buildings).delete(buildingId);
    await txDone(tx);
  }

  // ── 층 ──────────────────────────────────────────────────────────────────
  async listFloors(projectId: string): Promise<Floor[]> {
    const tx = this.db.transaction(STORE.floors, 'readonly');
    return getAllByIndex<Floor>(tx.objectStore(STORE.floors), 'by_project', projectId);
  }

  async putFloors(items: readonly Floor[]): Promise<void> {
    if (items.length === 0) return;
    const tx = this.db.transaction(STORE.floors, 'readwrite');
    const store = tx.objectStore(STORE.floors);
    for (const f of items) store.put(this.stamp(f));
    await txDone(tx);
  }

  async deleteFloor(floorId: string): Promise<void> {
    const tx = this.db.transaction(
      [STORE.floors, STORE.drawings, STORE.defects, STORE.blobs, STORE.memos, STORE.photos],
      'readwrite',
    );
    await this.purgeFloorIn(tx, floorId);
    await txDone(tx);
  }

  /** 층 1개와 그 하위(도면·결함·Blob 참조)를 같은 트랜잭션에서 지운다 */
  private async purgeFloorIn(tx: IDBTransaction, floorId: string): Promise<void> {
    const ds = tx.objectStore(STORE.drawings);
    const xs = tx.objectStore(STORE.defects);
    const blobs = tx.objectStore(STORE.blobs);

    const memoStore = tx.objectStoreNames.contains(STORE.memos)
      ? tx.objectStore(STORE.memos)
      : null;

    const drawings = await getAllByIndex<Drawing>(ds, 'by_floor', floorId);
    for (const d of drawings) {
      for (const k of uniqueKeys(d)) {
        await releaseBlobIn(blobs, k);
        revokeUrl(k);
      }
      // 도면이 사라지면 그 위의 메모도 갈 곳이 없다
      if (memoStore) {
        const ms = await getAllByIndex<Memo>(memoStore, 'by_drawing', d.id);
        for (const m of ms) memoStore.delete(m.id);
      }
      ds.delete(d.id);
    }
    const defects = await getAllByIndex<Defect>(xs, 'by_floor', floorId);
    for (const x of defects) xs.delete(x.id);
    // 결함이 사라지면 그 결함의 사진도 갈 곳이 없다 (K13). Blob refCount 까지 정리한다
    await purgePhotosOfDefectsIn(tx, defects.map((x) => x.id));

    if (tx.objectStoreNames.contains(STORE.floors)) tx.objectStore(STORE.floors).delete(floorId);
  }

  // ── 도면 ────────────────────────────────────────────────────────────────
  async listDrawings(projectId: string): Promise<Drawing[]> {
    const tx = this.db.transaction(STORE.drawings, 'readonly');
    const rows = await getAllByIndex<Drawing>(tx.objectStore(STORE.drawings), 'by_project', projectId);
    return rows.map(normalizeDrawing);
  }

  async putDrawing(d: Drawing): Promise<void> {
    const tx = this.db.transaction(STORE.drawings, 'readwrite');
    tx.objectStore(STORE.drawings).put(this.stamp(d));
    await txDone(tx);
  }

  /**
   * 도면 등록 · 교체 — **§2-9-d 의 원자성 규칙.**
   * `drawings` + `blobs` + `defects` 를 하나의 `readwrite` 트랜잭션에 함께 연다.
   * 레코드만 남고 Blob 이 없는 상태가 **단 한 순간도 존재하면 안 된다.**
   *
   * ⚠️ 교체는 **결함을 지우지 않는다** (§2-8-d · 함정 #2).
   * `Defect.drawingId` 만 새 도면으로 갱신하고 정규화 좌표는 손대지 않는다 —
   * 해상도가 달라도 상대 위치가 유지된다. **이것이 정규화의 존재 이유다.**
   */
  async registerDrawings(uploads: readonly DrawingUpload[]): Promise<void> {
    if (uploads.length === 0) return;
    const tx = this.db.transaction(
      [STORE.drawings, STORE.blobs, STORE.defects],
      'readwrite',
    );
    const ds = tx.objectStore(STORE.drawings);
    const blobs = tx.objectStore(STORE.blobs);
    const xs = tx.objectStore(STORE.defects);
    const now = Date.now();

    for (const up of uploads) {
      const d = this.stamp(up.drawing, now);

      // 1. 같은 층의 기존 도면을 걷어낸다 (S1 은 층당 1장 — Q15 A안)
      const existing = await getAllByIndex<Drawing>(ds, 'by_floor', d.floorId);
      for (const old of existing) {
        if (old.id === d.id) continue;
        for (const k of uniqueKeys(old)) {
          await releaseBlobIn(blobs, k);
          revokeUrl(k);
        }
        ds.delete(old.id);
      }

      // 2. 그 층의 결함을 새 도면으로 재연결한다. **좌표는 손대지 않는다**
      const defects = await getAllByIndex<Defect>(xs, 'by_floor', d.floorId);
      for (const x of defects) {
        // 결함 레코드를 실제로 고치는 쓰기다 → 스탬프를 갱신한다 (Phase 5 · D23)
        if (x.drawingId !== d.id) xs.put(this.stampDefect({ ...x, drawingId: d.id }, now));
      }

      // 3. Blob 3종 + 도면 레코드를 같은 트랜잭션에서 커밋한다
      const byKey = new Map<string, Blob>();
      byKey.set(d.renderBlobKey, up.renderBlob);
      if (!byKey.has(d.sourceBlobKey)) byKey.set(d.sourceBlobKey, up.sourceBlob);
      if (!byKey.has(d.thumbBlobKey)) byKey.set(d.thumbBlobKey, up.thumbBlob);
      for (const [k, b] of byKey) await putBlobIn(blobs, k, b);

      ds.put(d);
    }

    await txDone(tx);
  }

  /**
   * 도면 삭제 — Blob refCount 를 낮추고 0 이 되면 실제로 지운다.
   * **결함은 유지된다** (§2-11). 같은 층에 새 도면을 올리면 다시 붙는다.
   */
  async deleteDrawing(drawingId: string): Promise<void> {
    const tx = this.db.transaction([STORE.drawings, STORE.blobs], 'readwrite');
    const ds = tx.objectStore(STORE.drawings);
    const blobs = tx.objectStore(STORE.blobs);
    const d = await reqAsPromise<Drawing | undefined>(ds.get(drawingId));
    if (d) {
      for (const k of uniqueKeys(d)) {
        await releaseBlobIn(blobs, k);
        revokeUrl(k);
      }
      ds.delete(drawingId);
    }
    await txDone(tx);
  }

  // ── 결함 ────────────────────────────────────────────────────────────────
  async listDefects(projectId: string): Promise<Defect[]> {
    const tx = this.db.transaction(STORE.defects, 'readonly');
    return getAllByIndex<Defect>(tx.objectStore(STORE.defects), 'by_project', projectId);
  }

  /**
   * **레코드 단위 upsert.** 결함 500건을 매번 통째로 직렬화하지 않는다 (§2-9-e)
   *
   * ⭐ Phase 5(D23) — 결함 쓰기의 **주 경로**다. 여기서 `stamp()` 로 `updatedAt`·`deviceId` 를
   * 찍는다. 화면·캔버스 코어는 스탬프를 신경 쓰지 않는다(`Photo`·`ItemSettings` 와 같은 규칙).
   * 호출자는 **바뀐 결함만** 넘긴다(`CanvasRoute` 의 `upsert` 목록) — 안 바뀐 결함까지 넘기면
   * 옛 결함의 `updatedAt: null`("미동기화") 표식이 조용히 지워진다.
   */
  async upsertDefects(items: readonly Defect[]): Promise<void> {
    if (items.length === 0) return;
    const tx = this.db.transaction(STORE.defects, 'readwrite');
    const store = tx.objectStore(STORE.defects);
    const now = Date.now();
    for (const d of items) store.put(this.stampDefect(d, now));
    await txDone(tx);
  }

  /**
   * ⚠️ **여기서 사진을 지우지 않는다.** 결함 삭제는 Ctrl+Z 로 되돌릴 수 있고(`store.ts::UNDO`),
   *    화면도 `되돌리기로 되살릴 수 있습니다` 라고 약속한다. 사진 Blob 을 여기서 지우면
   *    되돌렸을 때 **결함만 돌아오고 사진은 영원히 못 돌아온다** — 사용자는 화면에 남은
   *    메모리 목록을 보고 복구됐다고 믿고, 잃은 것은 며칠 뒤 보고서를 뽑을 때 안다.
   *
   *    고아 사진은 `purgeOrphanPhotos()` 가 **용역을 열 때** 쓸어 담는다.
   *    새로고침하면 되돌리기 스택도 함께 죽으므로 그 시점엔 되살릴 사람이 없다 —
   *    지적사항 §6("고아 Blob 이 조용히 쌓이지 않게")의 목적은 그대로 달성된다.
   *
   *    `deleteFloor` · `deleteBuilding` 은 되돌리기가 없는 조작(확인 대화상자)이라
   *    **즉시 연쇄삭제를 유지한다.**
   */
  async deleteDefects(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const tx = this.db.transaction(STORE.defects, 'readwrite');
    const store = tx.objectStore(STORE.defects);
    for (const id of ids) store.delete(id);
    await txDone(tx);
  }

  // ── 사진 (S5 §2-3) ──────────────────────────────────────────────────────
  /**
   * **읽기 정규화로 불변식 #8 을 강제한다** (K16).
   * 결함별로 묶어 `normalizePhotos` 를 통과시키므로, 저장된 레코드에 대표가 0장이거나
   * 2장이어도 화면·출력이 보는 목록에는 **정확히 1장**이다.
   */
  async listPhotos(projectId: string): Promise<Photo[]> {
    const tx = this.db.transaction(STORE.photos, 'readonly');
    const rows = await getAllByIndex<Photo>(tx.objectStore(STORE.photos), 'by_project', projectId);
    const out: Photo[] = [];
    for (const group of groupPhotosByDefect(rows).values()) out.push(...group);
    return out;
  }

  async listPhotosOfDefect(defectId: string): Promise<Photo[]> {
    const tx = this.db.transaction(STORE.photos, 'readonly');
    const rows = await getAllByIndex<Photo>(tx.objectStore(STORE.photos), 'by_defect', defectId);
    return normalizePhotos(rows);
  }

  /** 레코드 단위 upsert — 대표 지정·순서변경·회전이 전부 이 경로다 */
  async upsertPhotos(items: readonly Photo[]): Promise<void> {
    if (items.length === 0) return;
    const tx = this.db.transaction(STORE.photos, 'readwrite');
    const store = tx.objectStore(STORE.photos);
    for (const p of items) store.put(this.stamp(p));
    await txDone(tx);
  }

  async deletePhotos(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const tx = this.db.transaction([STORE.photos, STORE.blobs], 'readwrite');
    await purgePhotoIdsIn(tx, ids);
    await txDone(tx);
  }

  /**
   * 주인 없는 사진을 쓸어 담는다 — 결함이 지워졌는데 Ctrl+Z 로 안 돌아온 것들.
   *
   * **용역을 열 때 한 번** 부른다. 그 시점엔 되돌리기 스택이 이미 비어 있으므로
   * 여기서 지우는 것은 아무도 되살릴 수 없는 사진이다.
   * 이것이 `deleteDefects` 의 즉시 연쇄삭제를 대신한다 (검수 지적 1 · K13).
   */
  async purgeOrphanPhotos(projectId: string): Promise<number> {
    const tx = this.db.transaction([STORE.photos, STORE.defects, STORE.blobs], 'readwrite');
    const rows = await getAllByIndex<Photo>(tx.objectStore(STORE.photos), 'by_project', projectId);
    if (rows.length === 0) {
      await txDone(tx);
      return 0;
    }
    const xs = tx.objectStore(STORE.defects);
    const orphans: Photo[] = [];
    // 같은 결함의 사진이 여러 장이므로 결함 조회 결과를 캐시한다
    const alive = new Map<string, boolean>();
    for (const p of rows) {
      let ok = alive.get(p.defectId);
      if (ok === undefined) {
        ok = (await reqAsPromise<Defect | undefined>(xs.get(p.defectId))) !== undefined;
        alive.set(p.defectId, ok);
      }
      if (!ok) orphans.push(p);
    }
    await purgePhotoRecordsIn(tx, orphans);
    await txDone(tx);
    return orphans.length;
  }

  /**
   * 사진 등록 — 어댑터 전용(경계 규칙 9). `registerDrawings` 를 그대로 본떴다.
   * **Blob 3종과 레코드가 한 트랜잭션에서 커밋된다** (K4).
   */
  async registerPhotos(uploads: readonly PhotoUpload[]): Promise<void> {
    if (uploads.length === 0) return;
    const tx = this.db.transaction([STORE.photos, STORE.blobs], 'readwrite');
    const now = Date.now();
    for (const up of uploads) {
      await putPhotoUploadIn(tx, { ...up, photo: this.stamp(up.photo, now) });
    }
    await txDone(tx);
  }

  // ── 메모 (S2a) ──────────────────────────────────────────────────────────
  // 결함과 **다른 스토어**다. 결함 건수·결함 리스트 어디에도 섞이지 않는다.
  async listMemos(projectId: string): Promise<Memo[]> {
    const tx = this.db.transaction(STORE.memos, 'readonly');
    const rows = await getAllByIndex<Memo>(tx.objectStore(STORE.memos), 'by_project', projectId);
    return rows.map(normalizeMemo);
  }

  async upsertMemos(items: readonly Memo[]): Promise<void> {
    if (items.length === 0) return;
    const tx = this.db.transaction(STORE.memos, 'readwrite');
    const store = tx.objectStore(STORE.memos);
    for (const m of items) store.put(this.stamp(m));
    await txDone(tx);
  }

  /**
   * F1 — `[A4로 맞추기]` / 그 되돌리기. 도면 레코드 · 결함 · 메모를
   * **한 트랜잭션**에서 쓴다.
   *
   * 셋을 따로 쓰면 중간에 실패했을 때 "도면은 A4 인데 좌표는 옛 기준"이라는
   * 어중간한 상태가 남는다 — 그러면 모든 표기가 여백으로 밀려 보이고 되돌릴 근거도 없다.
   *
   * ⚠️ **Blob 을 건드리지 않는다.** 저장된 렌더 래스터는 옛 비율 그대로 두고,
   * 화면에는 원본을 A4 로 다시 합성한 결과(런타임 캐시)를 보여준다.
   * 덕분에 되돌리기가 레코드 되돌려쓰기만으로 끝난다.
   */
  async writeRenormalize(
    drawing: Drawing,
    defects: readonly Defect[],
    memos: readonly Memo[],
  ): Promise<void> {
    const tx = this.db.transaction(
      [STORE.drawings, STORE.defects, STORE.memos],
      'readwrite',
    );
    tx.objectStore(STORE.drawings).put(this.stamp(drawing));
    const ds = tx.objectStore(STORE.defects);
    // 결함도 스탬프를 찍는다 (Phase 5 · D23) — 재정규화는 좌표를 실제로 고치는 쓰기다
    // ⚠️ now 를 미리 고정한다 — 기본값(Date.now())에 맡기면 같은 배치의 결함들이
    //    루프를 도는 동안 서로 다른 시각을 받는다(경미, 검수 54)
    const renormNow = Date.now();
    for (const d of defects) ds.put(this.stampDefect(d, renormNow));
    const ms = tx.objectStore(STORE.memos);
    for (const m of memos) ms.put(this.stamp(m));
    await txDone(tx);
  }

  async deleteMemos(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const tx = this.db.transaction(STORE.memos, 'readwrite');
    const store = tx.objectStore(STORE.memos);
    for (const id of ids) store.delete(id);
    await txDone(tx);
  }

  // ── 구조 복사 (§2-13) ───────────────────────────────────────────────────
  /**
   * 동 · 층 · 도면만 복사한다. **결함은 복사하지 않는다** —
   * 결함 승계·전회차 상태 3종은 Phase 2-D 의 본체이고, 여기서 반쪽으로 만들면 갈아엎는다.
   *
   * Blob 은 **복사하지 않고 같은 키를 참조**한다(refCount++).
   * 그래서 원본 용역을 지워도 복사본의 도면이 살아 있다.
   *
   * ⚠️ **사진은 복사하지 않는다** (K13). 전회차 사진 승계는 Phase 2-D 소관이고,
   *    여기서 반쪽으로 만들면 갈아엎는다. 복사된 결함은 사진 0장으로 시작한다.
   */
  async copyStructure(
    fromProjectId: string,
    toProjectId: string,
    opts?: { includeDefects?: boolean },
  ): Promise<CopyStructureResult> {
    const includeDefects = opts?.includeDefects ?? false;
    const stores = includeDefects
      ? [STORE.buildings, STORE.floors, STORE.drawings, STORE.blobs, STORE.defects]
      : [STORE.buildings, STORE.floors, STORE.drawings, STORE.blobs];
    const tx = this.db.transaction(stores, 'readwrite');
    const bs = tx.objectStore(STORE.buildings);
    const fs = tx.objectStore(STORE.floors);
    const ds = tx.objectStore(STORE.drawings);
    const blobs = tx.objectStore(STORE.blobs);
    const now = Date.now();

    const srcBuildings = await getAllByIndex<Building>(bs, 'by_project', fromProjectId);
    const srcFloors = await getAllByIndex<Floor>(fs, 'by_project', fromProjectId);
    const srcDrawings = await getAllByIndex<Drawing>(ds, 'by_project', fromProjectId);

    const buildingMap = new Map<string, string>();
    for (const b of srcBuildings) {
      const id = newId();
      buildingMap.set(b.id, id);
      bs.put({ ...b, id, projectId: toProjectId, createdAt: now, updatedAt: now, deviceId: this.deviceId });
    }

    const floorMap = new Map<string, string>();
    for (const f of srcFloors) {
      const bid = buildingMap.get(f.buildingId);
      if (!bid) continue;
      const id = newId();
      floorMap.set(f.id, id);
      fs.put({ ...f, id, projectId: toProjectId, buildingId: bid, createdAt: now, updatedAt: now, deviceId: this.deviceId });
    }

    let drawingCount = 0;
    const drawingMap = new Map<string, string>();
    for (const d of srcDrawings) {
      const fid = floorMap.get(d.floorId);
      if (!fid) continue;
      for (const k of uniqueKeys(d)) await retainBlobIn(blobs, k);
      const newDrawingId = newId();
      drawingMap.set(d.id, newDrawingId);
      ds.put({ ...d, id: newDrawingId, projectId: toProjectId, floorId: fid, createdAt: now, updatedAt: now, deviceId: this.deviceId });
      drawingCount += 1;
    }

    // ── F7 — 결함 승계. 좌표는 손대지 않는다(도면 레코드를 그대로 복사했으므로
    //    imageWidth/imageHeight/imgLayout 이 같아 정규화 좌표가 그대로 유효하다).
    //    전부 PREV_PENDING 으로 들어간다 — 지난 회차에 보수완료였던 결함도
    //    이번 회차에는 다시 확인 대상이다(§Phase 2-D 상태표).
    let defectCount = 0;
    if (includeDefects) {
      const xs = tx.objectStore(STORE.defects);
      const srcDefects = await getAllByIndex<Defect>(xs, 'by_project', fromProjectId);
      for (const src of srcDefects) {
        const fid = floorMap.get(src.floorId);
        const did = drawingMap.get(src.drawingId);
        if (!fid || !did) continue;
        const next: Defect = {
          ...src,
          id: newId(),
          projectId: toProjectId,
          floorId: fid,
          drawingId: did,
          status: 'PREV_PENDING',
          prevDefectId: src.id,
          // **새 레코드**다 — 원본의 스탬프를 물려받으면 안 된다 (Phase 5 · D23).
          // 지금 이 기기에서 만들어졌고, 만든 사람은 로그인 이전이라 알 수 없다(createdBy: null).
          ...newDefectBase(now, this.deviceId),
        };
        xs.put(next);
        defectCount += 1;
      }
    }

    await txDone(tx);
    return { buildings: buildingMap.size, floors: floorMap.size, drawings: drawingCount, defects: defectCount };
  }

  // ── 항목 설정 (S3 §2-1 · §2-4) ──────────────────────────────────────────
  /**
   * **항상 기본키로 읽는다.** `by_project` 인덱스는 쓰지 않는다 —
   * ORG 문서는 `projectId` 가 null 이라 인덱스에 들어가지도 않는다 (§2-1).
   */
  async getItemSettings(id: string): Promise<ItemSettings | null> {
    const tx = this.db.transaction(STORE.itemSettings, 'readonly');
    const rec = await reqAsPromise<ItemSettings | undefined>(
      tx.objectStore(STORE.itemSettings).get(id),
    );
    return rec ?? null;
  }

  /** 설정은 **항상 통째로 쓴다.** `put` 1회라 원자적이고 부분 상태가 없다 (§2-1-a) */
  async putItemSettings(s: ItemSettings): Promise<void> {
    const tx = this.db.transaction(STORE.itemSettings, 'readwrite');
    tx.objectStore(STORE.itemSettings).put(this.stamp(s));
    await txDone(tx);
  }

  /** 첫 실행에 씨앗으로 1회 만든다 (§2-7). 이미 있으면 그대로 돌려준다 */
  async ensureOrgSettings(now = Date.now()): Promise<ItemSettings> {
    const tx = this.db.transaction(STORE.itemSettings, 'readwrite');
    const store = tx.objectStore(STORE.itemSettings);
    const existing = await reqAsPromise<ItemSettings | undefined>(store.get(ORG_SETTINGS_ID));
    if (existing) {
      await txDone(tx);
      return existing;
    }
    const seeded = createOrgSettings(this.deviceId, now);
    store.put(seeded);
    await txDone(tx);
    return seeded;
  }

  /**
   * **지연 스냅샷** (불변식 #7 · §2-4 · F8).
   *
   * 없으면 그 시점의 ORG 를 복사해 만들고 저장한다. 사용자에게 아무것도 묻지 않는다.
   * 일괄 마이그레이션을 돌리지 않으므로 **DB 버전이 1 그대로**다.
   * 설정 화면·결함 입력 폼·출력이 전부 이 함수만 부른다 —
   * 호출자가 "없으면 만든다"를 각자 구현하면 반드시 어긋난다.
   */
  async ensureProjectSettings(projectId: string, now = Date.now()): Promise<ItemSettings> {
    const found = await this.getItemSettings(projectId);
    if (found) return found;
    const org = await this.ensureOrgSettings(now);
    const snap = snapshotForProject(org, { projectId, deviceId: this.deviceId, now });
    await this.putItemSettings(snap);
    return snap;
  }

  // ── 출력 이력 `ExportRun` (Phase 4 §3-3 · K2) ───────────────────────────
  /**
   * ⚠️ **화면은 `openDb()` 를 직접 부르지 않는다.** 연결이 두 개가 되면
   * `deleteDatabase` 와 버전 업그레이드가 막힌다(검수 경미 6). `exportRuns.ts` 의
   * 모듈 함수는 첫 인자로 `db` 를 받으므로, 여기서 **위임 메서드로만** 노출한다.
   * UI 는 `storage.repo.xxx()` 만 부른다.
   *
   * 저장 위치는 `meta` KV 재사용이고 **DB_VERSION 은 1 그대로**다 — 새 스토어를 만들지 않는다.
   */
  putExportRun(run: ExportRun): Promise<void> {
    return putExportRun(this.db, run);
  }

  getExportRun(id: string): Promise<ExportRun | null> {
    return getExportRun(this.db, id);
  }

  /** `createdAt DESC` */
  listExportRuns(projectId: string): Promise<ExportRun[]> {
    return listExportRuns(this.db, projectId);
  }

  /** 다운로드한 산출물을 이력에 덧붙인다. **번호는 다시 계산하지 않는다** */
  appendExportArtifact(runId: string, artifact: ExportArtifact): Promise<void> {
    return appendArtifact(this.db, runId, artifact);
  }

  /** 오래된 것부터 삭제. 무한히 쌓이지 않게 한다 */
  pruneExportRuns(projectId: string, keep?: number): Promise<number> {
    return pruneExportRuns(this.db, projectId, keep);
  }

  deleteExportRun(id: string): Promise<void> {
    return deleteExportRun(this.db, id);
  }

  // ── Blob 읽기 (캔버스·썸네일) ───────────────────────────────────────────
  async readBlob(key: string): Promise<Blob | null> {
    const tx = this.db.transaction(STORE.blobs, 'readonly');
    return getBlobIn(tx.objectStore(STORE.blobs), key);
  }

  /**
   * Blob → objectURL. **용역 단위로 캐시되고 용역을 벗어날 때 한꺼번에 해제된다** (§2-8-c).
   * 해제하지 않으면 층을 오갈 때마다 수 MB 씩 누수된다.
   */
  objectUrl(blobKey: string, projectId: string): Promise<string | null> {
    return objectUrlFor(this.db, blobKey, projectId);
  }
}

/** `sourceBlobKey === renderBlobKey` 일 수 있으므로 중복을 제거한다 */
function uniqueKeys(d: Drawing): string[] {
  return [...new Set([d.renderBlobKey, d.sourceBlobKey, d.thumbBlobKey])];
}

/**
 * S1 에 저장된 결함에는 `sketch` 필드가 없다 (S2a 에서 추가됐다).
 * **읽는 즉시** 채워 넣어 화면·코어 코드가 `?? []` 분기를 흩뿌리지 않게 한다.
 * 마이그레이션 대신 읽기 정규화를 쓰는 이유: 스키마 버전을 올리지 않아도 되고,
 * 저장은 어차피 다음 수정 때 새 형식으로 나간다.
 */
/**
 * 옛 레코드 정규화 — S1·S2a 가 저장한 결함에는 `sketch` 와 `DefectAttrs` 신규 필드가 없고,
 * Phase 5 이전에 저장한 결함에는 `DefectBase`(`updatedAt`·`deviceId`·`createdBy`) 가 없다.
 * **읽는 시점에 채운다. DB 버전을 올리지 않는다** (S4 스펙 §3-3 · ASSUMPTIONS E11 · D23).
 *
 * ⛔ `updatedAt` 은 여기서 **`Date.now()` 로 채우지 않는다.** `normalizeDefectBase` 주석 참조.
 */
export function normalizeDefect(d: Defect, deviceId: string): Defect {
  const withAttrs = normalizeDefectAttrs(d);
  const withBase = normalizeDefectBase(withAttrs, deviceId);
  const marks = normalizeArrowMarks(withBase.marks);
  return marks === withBase.marks ? withBase : { ...withBase, marks };
}

/**
 * 옛 도면 레코드 정규화 — F1 이전 레코드에는 `imgLayout` 이 없다.
 * **읽는 시점에 채운다. DB 버전을 올리지 않는다** (같은 방식: normalizeDefect 참조).
 */
/**
 * 옛 메모 레코드 정규화 — F2 이전 레코드에는 `paths`(필기 획)가 없다.
 *
 * **읽는 시점에 `null` 로 채운다. DB 버전을 올리지 않고 마이그레이션도 만들지 않는다.**
 * `paths === null` 이 곧 "옛 텍스트 메모"의 표식이고, 렌더·히트·더블클릭이
 * 그 표식 하나로 갈린다(`isInkMemo`). 옛 메모는 계속 노란 상자로 보이고 글도 고칠 수 있다 —
 * 새로 만드는 메모만 손글씨다.
 */
export function normalizeMemo(m: Memo): Memo {
  if (m.paths !== undefined) return m;
  return { ...m, paths: null };
}

export function normalizeDrawing(d: Drawing): Drawing {
  if (
    d.imgLayout !== undefined &&
    d.imgScale !== undefined &&
    d.titleBlock !== undefined &&
    d.legend !== undefined &&
    d.renormalizedAt !== undefined &&
    d.labelScale !== undefined
  ) {
    return d;
  }
  return {
    ...d,
    imgLayout: d.imgLayout ?? null,
    imgScale: d.imgScale ?? null,
    titleBlock: d.titleBlock ?? null,
    legend: d.legend ?? null,
    renormalizedAt: d.renormalizedAt ?? null,
    // 번호 풍선 크기(F6, 2026-08-24). null = 1(기본) — imgScale 과 같은 관례
    labelScale: d.labelScale ?? null,
  };
}
