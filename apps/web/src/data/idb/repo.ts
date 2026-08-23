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
import { normalizeDefectAttrs } from '@onspect/canvas-core';
import type {
  Building,
  CopyStructureResult,
  Drawing,
  Floor,
  ItemSettings,
  Project,
  ProjectRepo,
  ProjectSummary,
} from '@onspect/project-core';
import {
  createOrgSettings,
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
};

export class IdbProjectRepo implements ProjectRepo<Defect, Memo> {
  constructor(
    private readonly db: IDBDatabase,
    private readonly deviceId: string,
  ) {}

  private stamp<T extends { updatedAt: number; deviceId: string }>(rec: T, now = Date.now()): T {
    return { ...rec, updatedAt: now, deviceId: this.deviceId };
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
      [STORE.buildings, STORE.floors, STORE.drawings, STORE.defects, STORE.memos],
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
    const memos = await getAllByIndex<Memo>(tx.objectStore(STORE.memos), 'by_project', projectId);
    // S1 에 저장된 레코드에는 `sketch` 가 없다. 읽는 즉시 채워 화면 코드가 분기하지 않게 한다
    const defects = rawDefects.map(normalizeDefect);
    return { project, buildings, floors, drawings, defects, memos };
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
      [STORE.buildings, STORE.floors, STORE.drawings, STORE.defects, STORE.blobs, STORE.memos],
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
      [STORE.floors, STORE.drawings, STORE.defects, STORE.blobs, STORE.memos],
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
        if (x.drawingId !== d.id) xs.put({ ...x, drawingId: d.id });
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

  /** **레코드 단위 upsert.** 결함 500건을 매번 통째로 직렬화하지 않는다 (§2-9-e) */
  async upsertDefects(items: readonly Defect[]): Promise<void> {
    if (items.length === 0) return;
    const tx = this.db.transaction(STORE.defects, 'readwrite');
    const store = tx.objectStore(STORE.defects);
    for (const d of items) store.put(d);
    await txDone(tx);
  }

  async deleteDefects(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const tx = this.db.transaction(STORE.defects, 'readwrite');
    const store = tx.objectStore(STORE.defects);
    for (const id of ids) store.delete(id);
    await txDone(tx);
  }

  // ── 메모 (S2a) ──────────────────────────────────────────────────────────
  // 결함과 **다른 스토어**다. 결함 건수·결함 리스트 어디에도 섞이지 않는다.
  async listMemos(projectId: string): Promise<Memo[]> {
    const tx = this.db.transaction(STORE.memos, 'readonly');
    return getAllByIndex<Memo>(tx.objectStore(STORE.memos), 'by_project', projectId);
  }

  async upsertMemos(items: readonly Memo[]): Promise<void> {
    if (items.length === 0) return;
    const tx = this.db.transaction(STORE.memos, 'readwrite');
    const store = tx.objectStore(STORE.memos);
    for (const m of items) store.put(this.stamp(m));
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
 * 옛 레코드 정규화 — S1·S2a 가 저장한 결함에는 `sketch` 와 `DefectAttrs` 신규 필드가 없다.
 * **읽는 시점에 채운다. DB 버전을 올리지 않는다** (S4 스펙 §3-3 · ASSUMPTIONS E11).
 */
export function normalizeDefect(d: Defect): Defect {
  return normalizeDefectAttrs(d);
}

/**
 * 옛 도면 레코드 정규화 — F1 이전 레코드에는 `imgLayout` 이 없다.
 * **읽는 시점에 채운다. DB 버전을 올리지 않는다** (같은 방식: normalizeDefect 참조).
 */
export function normalizeDrawing(d: Drawing): Drawing {
  if (d.imgLayout !== undefined) return d;
  return { ...d, imgLayout: null };
}
