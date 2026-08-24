/**
 * 저장소 인터페이스 — S1 스펙 §2-12.
 *
 * **선언만 있다. 구현은 어댑터가 제공한다.**
 * 웹은 IndexedDB(`apps/web/src/data/idb/repo.ts`), RN 은 SQLite 로 갈아끼운다.
 * Phase 5 서버 동기화가 붙을 지점도 이 이음매 한 곳이다 (§2-9-e).
 *
 * 경계 규칙 9: 여기에 `IDBDatabase`·`File`·`Blob`·`URL` 이 등장하지 않는다.
 * Blob 은 `blobKey: string` 이라는 불투명 문자열로만 오간다.
 * Blob 자체를 받는 메서드(도면 등록)는 **어댑터 인터페이스**의 몫이다.
 */
import type { ItemSettings } from './items/types.js';
import type { Building, Drawing, Floor, Project } from './types.js';

/** P1 목록 행이 필요로 하는 집계. 건수는 인덱스 count 이고 **출력번호와 무관하다**(불변식 2) */
export type ProjectSummary = {
  project: Project;
  buildingCount: number;
  floorCount: number;
  drawingCount: number;
  defectCount: number;
  /** 도면 Blob 합계. `도면 9장 · 약 48MB` 표시용 (§2-9-d) */
  byteSize: number;
};

/** 구조 복사 결과 — 토스트 문구에 숫자를 그대로 넣는다 (§2-13 · F7) */
export type CopyStructureResult = {
  buildings: number;
  floors: number;
  drawings: number;
  /** `includeDefects` 를 안 켰으면 0 */
  defects: number;
};

/**
 * `TDefect` 로 결함 타입을 주입받는다.
 * `project-core` 는 `canvas-core` 를 import 하지 않는다(경계 규칙 8) —
 * 두 코어를 잇는 것은 `apps/web` 의 책임이다.
 */
export interface ProjectRepo<TDefect = unknown, TMemo = unknown, TPhoto = unknown> {
  // ── 용역 ────────────────────────────────────────────────────────────────
  /** 삭제되지 않은 용역만. `lastOpenedAt DESC` */
  listProjects(): Promise<Project[]>;
  listProjectSummaries(): Promise<ProjectSummary[]>;
  getProject(id: string): Promise<Project | null>;
  putProject(p: Project): Promise<void>;
  /** `lastOpenedAt` 갱신 (P1 → P3 진입, §2-3) */
  touchProject(id: string, now: number): Promise<void>;
  /** 소프트 삭제 (§2-11) */
  softDeleteProject(id: string, now: number): Promise<void>;
  /** 되돌리기 토스트 */
  restoreProject(id: string): Promise<void>;

  // ── 동 ──────────────────────────────────────────────────────────────────
  listBuildings(projectId: string): Promise<Building[]>;
  putBuildings(items: readonly Building[]): Promise<void>;
  /** 하드 삭제. 하위 층·도면·결함·Blob 참조까지 한 트랜잭션에서 정리한다 */
  deleteBuilding(buildingId: string): Promise<void>;

  // ── 층 ──────────────────────────────────────────────────────────────────
  listFloors(projectId: string): Promise<Floor[]>;
  putFloors(items: readonly Floor[]): Promise<void>;
  deleteFloor(floorId: string): Promise<void>;

  // ── 도면 ────────────────────────────────────────────────────────────────
  listDrawings(projectId: string): Promise<Drawing[]>;
  putDrawing(d: Drawing): Promise<void>;
  /** Blob refCount 를 낮추고 0 이 되면 실제로 지운다 (§2-9-d) */
  deleteDrawing(drawingId: string): Promise<void>;

  // ── 결함 ────────────────────────────────────────────────────────────────
  listDefects(projectId: string): Promise<TDefect[]>;
  /** **레코드 단위 upsert.** 결함 500건을 매번 통째로 직렬화하지 않는다 (§2-9-e) */
  upsertDefects(items: readonly TDefect[]): Promise<void>;
  deleteDefects(ids: readonly string[]): Promise<void>;

  // ── 메모 (S2a) ──────────────────────────────────────────────────────────
  /**
   * 메모는 **결함이 아니다.** 결함 리스트·결함 집계에 섞이지 않는다 (상세기획 §2).
   * 그래서 저장소에서도 별도 스토어를 쓴다.
   */
  listMemos(projectId: string): Promise<TMemo[]>;
  upsertMemos(items: readonly TMemo[]): Promise<void>;
  deleteMemos(ids: readonly string[]): Promise<void>;

  // ── 사진 (S5 §2-3) ──────────────────────────────────────────────────────
  /**
   * Blob 은 여기 등장하지 않는다(경계 규칙 9). 등록은 어댑터 전용
   * `registerPhotos(uploads)` 가 맡는다 — `registerDrawings` 와 같은 모양이다.
   *
   * ⚠️ **`deleteDefects` 는 사진을 지우지 않는다** (K13 개정).
   *    결함 삭제는 Ctrl+Z 로 되돌릴 수 있는 조작이라, 그 자리에서 사진 Blob 을 지우면
   *    되돌렸을 때 결함만 돌아오고 사진은 영원히 못 돌아온다.
   *    고아 사진은 **어댑터가 용역을 열 때 한 번** 쓸어 담는다(`purgeOrphanPhotos`) —
   *    새로고침하면 되돌리기 스택도 함께 죽으므로 그때는 되살릴 사람이 없다.
   *
   *    반대로 `deleteFloor` · `deleteBuilding` 은 **되돌리기가 없는 조작**(확인 대화상자)이라
   *    사진까지 **즉시 연쇄삭제**한다. `copyStructure` 는 사진을 복사하지 않는다
   *    (전회차 승계는 Phase 2-D 소관).
   */
  listPhotos(projectId: string): Promise<TPhoto[]>;
  listPhotosOfDefect(defectId: string): Promise<TPhoto[]>;
  /** 레코드 단위 upsert. 대표 지정·순서변경·회전이 전부 이 경로다 */
  upsertPhotos(items: readonly TPhoto[]): Promise<void>;
  /** Blob refCount 를 낮추고 0 이 되면 실제로 지운다 */
  deletePhotos(ids: readonly string[]): Promise<void>;

  // ── 항목 설정 (S3 §2-1 · §2-4) ──────────────────────────────────────────
  /**
   * 문서 1건 = 설정 한 벌. **항상 기본키(`'ORG'` | projectId)로 읽는다** —
   * `by_project` 인덱스는 쓰지 않는다 (ORG 는 projectId 가 null 이라 인덱스에 안 들어간다).
   */
  getItemSettings(id: string): Promise<ItemSettings | null>;
  /** 통째로 쓴다. `put` 1회라 원자적이고 부분 상태가 없다 (§2-1-a) */
  putItemSettings(s: ItemSettings): Promise<void>;
  /** 없으면 씨앗으로 1회 생성한다 (§2-7) */
  ensureOrgSettings(): Promise<ItemSettings>;
  /**
   * **지연 스냅샷** (불변식 #7 · §2-4).
   * 없으면 그 시점의 ORG 를 복사해 만들고 저장한다. 설정·폼·출력이 전부 이 함수만 부른다 —
   * 호출자가 "없으면 만든다"를 각자 구현하면 반드시 어긋난다.
   */
  ensureProjectSettings(projectId: string): Promise<ItemSettings>;

  // ── 구조 복사 (§2-13 · F7) ───────────────────────────────────────────────
  /**
   * 동·층·도면을 복사한다. Blob 은 같은 키를 참조(refCount++).
   *
   * `opts.includeDefects` 가 true 면 결함도 함께 복사한다(F7 — S1 의 결정을 뒤집는다).
   * 복사된 결함은 전부 `status = 'PREV_PENDING'`, `prevDefectId` 로 원본을 잇는다.
   * 좌표는 손대지 않는다 — 도면 레코드를 그대로 복사하므로(같은 imageWidth/imageHeight/
   * imgLayout) 정규화 좌표가 그대로 유효하다.
   */
  copyStructure(
    fromProjectId: string,
    toProjectId: string,
    opts?: { includeDefects?: boolean },
  ): Promise<CopyStructureResult>;
}
