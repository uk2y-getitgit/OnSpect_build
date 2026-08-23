/**
 * 용역(Project) · 동 · 층 · 도면 도메인 타입 — S1 스펙 §2-4.
 *
 * 경계 규칙 (S1 스펙 §2-12):
 *   8.  `project-core` 는 `canvas-core` 를 import 하지 않고 역방향도 금지한다.
 *   9.  `IDBDatabase` · `File` · `Blob` · `URL` 을 참조하지 않는다.
 *       Blob 은 `blobKey: string` 이라는 **불투명 문자열**로만 다룬다.
 *   10. 이미지 디코드·래스터화는 웹 어댑터 전용이다.
 *
 * 이 패키지는 순수 TS 다. window · React · DOM 을 참조하지 않는다 (RN 재사용).
 */
import type { ImgLayout } from './a4.js';

// ── 열거 ───────────────────────────────────────────────────────────────────
/** 점검시기 — 상반기 | 하반기 */
export type InspectionHalf = 'H1' | 'H2';

/**
 * 점검구분 3종 (ASSUMPTIONS S1·D2 / Q14).
 * 상세기획 §3-1 의 `기타` 는 넣지 않는다 — 표시명 규칙이 갈라진다.
 */
export type InspectionKind = 'REGULAR' | 'DETAILED' | 'PRECISE';

/** 구조유형 기본값 — 모델에만 예약 (S1 폼에는 없다. ASSUMPTIONS S1·D3) */
export type StructureType = 'RC' | 'SRC' | 'SS';

// ── 공통 필드 (§2-9-c) ─────────────────────────────────────────────────────
/**
 * 모든 레코드가 갖는 필드. **Phase 5 병합·감사의 재료다.**
 *
 * 나중에 붙이면 기존 레코드가 전부 `null` 이라 병합이 그 구간을 판정할 수 없다.
 * S1 은 이 필드들을 **채우기만 하고 읽지 않는다** (D5 ③ — 병합 로직은 Phase 5).
 */
export type RecordBase = {
  /** epoch ms */
  createdAt: number;
  /** 모든 쓰기에서 갱신. Phase 5 LWW 병합의 기준 */
  updatedAt: number;
  /** 기기 식별자. 첫 실행 시 생성해 meta 에 보관 */
  deviceId: string;
  /** 사용자 개념은 Phase 5. S1 은 null */
  createdBy: string | null;
};

// ── 용역 ───────────────────────────────────────────────────────────────────
export type Project = RecordBase & {
  id: string;
  /** 조직은 Phase 5. 지금은 null */
  orgId: string | null;
  /** 점검연도. 정수 4자리 */
  year: number;
  half: InspectionHalf;
  kind: InspectionKind;
  /** 용역명 = 상세기획 §3-1 '현장명' 자리. 예: ○○아파트 3차 */
  name: string;
  /** 이전 회차 (D2). 순환 금지 */
  prevProjectId: string | null;

  // 상세기획 §3-1 예약 필드 — S1 폼에는 없다. 전부 null 로 생성된다
  clientName: string | null;
  /** YYYY-MM-DD */
  periodFrom: string | null;
  periodTo: string | null;
  defaultStructureType: StructureType | null;

  /** 목록 기본 정렬 · '최근 접속' 표시 */
  lastOpenedAt: number;
  /** 소프트 삭제 (§2-11) */
  deletedAt: number | null;
  /** 현재 1 */
  schemaVersion: number;
};

// ── 동 ─────────────────────────────────────────────────────────────────────
export type Building = RecordBase & {
  id: string;
  projectId: string;
  /** 중축동 / 본관. 1~40자. 같은 용역 안에서 중복 허용 */
  name: string;
  /** 0,10,20 … 드래그 순서 */
  sortOrder: number;
};

// ── 층 ─────────────────────────────────────────────────────────────────────
export type Floor = RecordBase & {
  id: string;
  projectId: string;
  buildingId: string;
  /** 지하3층 · 지상1층 · 옥탑 */
  name: string;
  /** **정수. 지하는 음수** (불변식 5 / §2-7). UI 에 노출하지 않는다 */
  sortOrder: number;
};

// ── 도면 ───────────────────────────────────────────────────────────────────
/**
 * `PDF_PAGE` 는 **예약**이다. S1 에서는 생성되지 않지만 지금 정의해 둔다 —
 * 나중에 `pdfIngest` 모듈 하나를 더해도 마이그레이션이 없다 (스펙 §1).
 */
export type DrawingSource =
  | { kind: 'IMAGE'; fileName: string; mime: string; byteSize: number }
  | { kind: 'PDF_PAGE'; fileName: string; byteSize: number; pageIndex: number; pageCount: number };

export type Drawing = RecordBase & {
  id: string;
  projectId: string;
  floorId: string;
  /** 출력물 텍스트. 기본 `${floor.name} 결함조사 위치도` */
  name: string;
  source: DrawingSource;
  /** 렌더이미지 픽셀. **정규화 좌표의 분모** */
  imageWidth: number;
  imageHeight: number;
  /** blobs 스토어 키 — 캔버스가 그리는 래스터. nullable 이 아니다 (D5) */
  renderBlobKey: string;
  /** 원본 파일 Blob. 필수 (D5 ④). 래스터와 같은 키일 수 있다 */
  sourceBlobKey: string;
  /** 장변 320px 썸네일 */
  thumbBlobKey: string;
  /** 층 내 도면 순서. S1 은 항상 0 (§2-8 1:1 제한) */
  sortOrder: number;
  /**
   * F1 — A4 가로 캔버스 안에서 실제 도면 그림이 차지하는 사각형 (F5-4 도면 영역).
   * **A4 정규화된 새 도면만** 값을 갖는다. `null` = 예전 방식(원본 비율 그대로) 도면 —
   * 기존 도면은 다시 정규화하지 않는다(F1). 값이 있으면 `imageWidth`/`imageHeight` 는
   * 항상 `A4_LANDSCAPE`(1754×1240)다.
   */
  imgLayout: ImgLayout | null;
};

// ── 표시 라벨 ──────────────────────────────────────────────────────────────
export const HALF_LABEL: Record<InspectionHalf, string> = {
  H1: '상반기',
  H2: '하반기',
};

export const KIND_LABEL: Record<InspectionKind, string> = {
  REGULAR: '정기안전점검',
  DETAILED: '정밀안전점검',
  PRECISE: '정밀안전진단',
};

export const HALF_OPTIONS: readonly InspectionHalf[] = ['H1', 'H2'];
export const KIND_OPTIONS: readonly InspectionKind[] = ['REGULAR', 'DETAILED', 'PRECISE'];

// ── 상수 ───────────────────────────────────────────────────────────────────
/** 층 sortOrder 격자. 층 사이에 새 층을 끼울 자리를 남긴다 (§2-7-a) */
export const FLOOR_STEP = 10;
/** 동 sortOrder 격자 */
export const BUILDING_STEP = 10;
/** 옥탑 */
export const SORT_ROOFTOP = 9000;
/** 옥상 · 지붕층 */
export const SORT_ROOF = 8000;
/** PIT · 피트 — 최하단 */
export const SORT_PIT = -9000;

/** 용역 생성 직후 자동으로 만드는 동 이름 (§2-6) */
export const DEFAULT_BUILDING_NAME = '본관';

/** 도면 이름 기본값 (§G2 출력 텍스트) */
export function defaultDrawingName(floorName: string): string {
  return `${floorName} 결함조사 위치도`;
}
