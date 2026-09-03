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

  /**
   * D16 — **도곽 공유 설정**. 이 용역의 모든 도면이 같은 값을 쓴다.
   * `null` = 아직 승격 안 됨 → 읽을 때 `DEFAULT_PROJECT_TITLE_BLOCK`.
   *
   * ⚠️ 도면에서 읽는 도곽 값은 `Drawing.titleBlock.drawingName` **하나뿐**이다.
   *    옛 레코드는 이 필드 자체가 없다(`undefined`) — `?? null` 로 받는다.
   *    optional 필드 추가라 `DB_VERSION` 1 그대로, 마이그레이션 0건.
   */
  titleBlock: ProjectTitleBlock | null;
  /** D16 — 범례 공유 설정. `null` = 아직 승격 안 됨. **행 자체는 여전히 도면별 파생**(D8) */
  legend: ProjectLegend | null;
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
  /**
   * D19 · D20 — 출력 결함번호 접두어(`1F` · `B1F` · `RF` · `W`). **옵트인이다.**
   * `null`/`''` 이면 접두어 **없이** 번호만 나간다 — 이름에서 자동 파생하지 않는다.
   * (`floorCodeOf` 의 파생값은 입력칸 placeholder 제안일 뿐이다.)
   * 정규화: 공백 제거 · 대문자 · 최대 6자.
   *
   * ⚠️ **옛 레코드는 이 필드가 없다**(`undefined`). 읽는 쪽은 `?? null` 로 받는다 —
   * optional 필드 추가라 `DB_VERSION` 은 1 그대로고 마이그레이션이 없다.
   */
  code: string | null;
};

/** 층 접두어 최대 길이 (D19) */
export const FLOOR_CODE_MAX = 6;

/** 층 접두어 정규화 — 공백 제거 · 대문자 · 최대 6자. 빈 값은 `null`(자동 파생) */
export function normalizeFloorCode(raw: string | null | undefined): string | null {
  const s = (raw ?? '').replace(/\s+/g, '').toUpperCase().slice(0, FLOOR_CODE_MAX);
  return s === '' ? null : s;
}

// ── 도면 ───────────────────────────────────────────────────────────────────
/**
 * `PDF_PAGE` 는 **예약**이다. S1 에서는 생성되지 않지만 지금 정의해 둔다 —
 * 나중에 `pdfIngest` 모듈 하나를 더해도 마이그레이션이 없다 (스펙 §1).
 */
export type DrawingSource =
  | { kind: 'IMAGE'; fileName: string; mime: string; byteSize: number }
  | { kind: 'PDF_PAGE'; fileName: string; byteSize: number; pageIndex: number; pageCount: number };

/**
 * F5-1 도곽(TitleBlock) 설정 — **저장 형태**.
 *
 * ⚠️ `canvas-core` 의 `TitleBlockConfig` 와 **구조가 같지만 다른 타입**이다.
 * 두 코어는 서로를 import 하지 않는다(D13) — 잇는 것은 `apps/web` 의 책임이다.
 * 여기서 `null` 은 "자동"(용역명·도면명을 그대로 쓴다)이라는 뜻이다.
 */
export type DrawingTitleBlock = {
  /** 화면에 그릴지. **출력 ON/OFF 는 Phase 4 의 별개 옵션이다** */
  enabled: boolean;
  /** null = 용역명 자동 */
  projectTitle: string | null;
  /** null = 도면명 자동 */
  drawingName: string | null;
  /** 축척 문자열. 기본 'NONE' */
  scale: string;
  /** 도곽 전체 비례 배율 */
  tbScale: number;
  col0: number;
  col1: number;
  labelFontSz: number;
  valueFontSz: number;
};

/**
 * F5-2 범례(Legend) 설정 — **저장 형태**.
 *
 * 행(결함유형 목록)은 저장하지 않는다. **그 도면에 실제로 쓰인 결함유형**에서
 * 매번 파생한다(§F5-2 `equipFilter`) — 저장하면 결함을 지웠을 때 유령 행이 남는다.
 * 색도 없다: 결함유형별 고유 색을 만들지 않는다(D8).
 */
export type DrawingLegend = {
  /** 화면에 그릴지. **출력 ON/OFF 는 Phase 4 의 별개 옵션이다** */
  enabled: boolean;
  lgScale: number;
};

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
  /**
   * F5-3 — A4 지면 안에서 도면 그림이 차지하는 배율. `null` = 1(기본).
   *
   * ⚠️ **이 값이 바뀌어도 결함 좌표는 손대지 않는다.** 좌표는 A4 지면 기준 0~1
   * 정규화라(불변식 #1), Numdraw 처럼 넘버링을 함께 옮기면 두 번 변환되어 어긋난다.
   * 합성된 이미지는 저장하지 않는다 — `apps/web` 의 **런타임 캐시**에만 둔다.
   */
  imgScale: number | null;
  /**
   * F6 — 번호 풍선(넘버링) 크기 배율. `null` = 1(기본) — `imgScale` 과 같은 관례.
   *
   * `imgScale` 과 달리 **결함 좌표에는 영향이 없다** — 화면(과 출력)에 그려지는
   * 번호 풍선·글자 크기만 바꾼다. 도면마다 결함 밀도가 달라 번호가 서로 겹치거나
   * 반대로 너무 작게 보일 수 있어 도면 단위로 둔다(도곽·범례와 같은 스코프).
   */
  labelScale: number | null;
  /**
   * F5-1 도곽 설정. `null` = 도곽을 쓰지 않는다(기존 도면 전부).
   * 값이 있으면 캔버스 배경에 A4 지면 전체를 두르는 도곽을 그린다.
   */
  titleBlock: DrawingTitleBlock | null;
  /** F5-2 범례 설정. `null` = 범례를 쓰지 않는다(기존 도면 전부) */
  legend: DrawingLegend | null;
  /**
   * F1 — `[A4로 맞추기]` 를 실행한 시각(epoch ms). `null` = 실행한 적 없다.
   *
   * 값이 있으면 **저장된 렌더 래스터(`renderBlobKey`)는 옛 비율 그대로**이고,
   * 화면에는 원본(`sourceBlobKey`)을 A4 로 다시 합성한 결과를 보여준다
   * (F5-3 과 같은 런타임 캐시. 저장 용량이 늘지 않고, 되돌리기가 블롭 조작 없이 끝난다).
   */
  renormalizedAt: number | null;
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
/**
 * D19 — 외부 · 외곽 · 옥외 · 외벽. **옥탑(9000)보다 뒤** = 층 목록 맨 아래 = 출력 마지막.
 * 실무에서 외부 조사는 보고서 맨 뒤에 붙는다.
 */
export const SORT_EXTERIOR = 9500;

/** 용역 생성 직후 자동으로 만드는 동 이름 (§2-6) */
export const DEFAULT_BUILDING_NAME = '본관';

/** 도면 이름 기본값 (§G2 출력 텍스트) */
export function defaultDrawingName(floorName: string): string {
  return `${floorName} 결함조사 위치도`;
}


// ── F5-1 도곽 기본값 ───────────────────────────────────────────────────────
/** Numdraw 실측 기준값 (`_workspace/12_수정사항_S3중간.md` §F5-1) */
export const DEFAULT_DRAWING_TITLE_BLOCK: DrawingTitleBlock = {
  enabled: true,
  projectTitle: null,
  drawingName: null,
  scale: 'NONE',
  tbScale: 1,
  col0: 0.42,
  col1: 0.46,
  labelFontSz: 10,
  valueFontSz: 14,
};

/** F5-2 범례 기본값 */
export const DEFAULT_DRAWING_LEGEND: DrawingLegend = { enabled: true, lgScale: 1 };

// ── D16 프로젝트 스코프 도곽 · 범례 ────────────────────────────────────────
/**
 * D16 — 용역 전체가 공유하는 도곽 설정. **`drawingName` 만 도면별**이라 그것만 뺀 8필드다.
 *
 * `col0`·`col1`·`labelFontSz`·`valueFontSz` 까지 올린 이유: 전부 *도곽의 생김새*라
 * 도면마다 다르면 보고서가 들쭉날쭉해진다. `enabled` 을 도면별로 두면 사용자가
 * **도면마다 도곽을 다시 켜야 한다** — 그게 "도곽 출력안됨"(버그 B2)의 원인이었다.
 */
export type ProjectTitleBlock = Omit<DrawingTitleBlock, 'drawingName'>;

/**
 * ⚠️ **값을 다시 적지 않는다.** 도면 기본값에서 `drawingName` 만 뺀 파생이다(검수 경미4).
 * 두 벌로 적어 두면 한쪽만 고친 날 승격 결과와 새 도면 기본값이 조용히 갈린다.
 */
export const DEFAULT_PROJECT_TITLE_BLOCK: ProjectTitleBlock = (({
  drawingName: _drawingName,
  ...rest
}) => rest)(DEFAULT_DRAWING_TITLE_BLOCK);

/**
 * D16 + D15 — 용역 전체가 공유하는 범례 설정.
 *
 * ⚠️ **범례 *행*은 여기 없다.** 행은 여전히 그 도면의 결함에서 매번 파생한다(D8) —
 *    저장하면 결함을 지웠을 때 유령 행이 남는다.
 */
export type ProjectLegend = {
  /** 범례 블록 전체 마스터 스위치 */
  enabled: boolean;
  lgScale: number;
  /**
   * D15 상태 범례 행. **기본 전부 false** — 기존 출력물이 한 글자도 안 바뀌게.
   *
   * ⚠️ 2026-09-03 종류가 3종→4종이 되면서 **화면 이름과 필드 이름이 어긋난다.**
   * 필드를 바꾸면 마이그레이션이 필요해서 그대로 뒀다.
   * `statusNew`=결함(CURRENT) · `statusNewFound`=신규(NEW) ·
   * `statusPending`=전차(PREV_PENDING) · `statusRepaired`=보수완료(REPAIRED)
   */
  statusNew: boolean;
  /** 2026-09-03 신설. 옛 레코드에는 없다 — `projectLegendOf` 가 false 로 채운다 */
  statusNewFound: boolean;
  statusPending: boolean;
  statusRepaired: boolean;
};

export const DEFAULT_PROJECT_LEGEND: ProjectLegend = {
  enabled: true,
  lgScale: 1,
  statusNew: false,
  statusNewFound: false,
  statusPending: false,
  statusRepaired: false,
};

/**
 * 저장된 값(옛 레코드는 `undefined`·필드 누락)을 **읽기 시점에 정규화**한다.
 * `isInkMemo` 와 같은 수법 — 저장 레코드를 일괄로 고치지 않는다(마이그레이션 0건).
 *
 * ⭐ **U-3 — 폐기된 `showTypes` 는 여기서 조용히 떨어진다.** 옛 레코드에 그 키가 남아 있어도
 *    읽는 순간 사라지므로 `DB_VERSION` 을 올릴 이유가 없다(필드 삭제 = 읽기 시점 무시).
 */
export function projectLegendOf(lg: Partial<ProjectLegend> | null | undefined): ProjectLegend {
  if (!lg) return DEFAULT_PROJECT_LEGEND;
  return {
    enabled: lg.enabled ?? DEFAULT_PROJECT_LEGEND.enabled,
    lgScale: lg.lgScale ?? DEFAULT_PROJECT_LEGEND.lgScale,
    statusNew: lg.statusNew ?? DEFAULT_PROJECT_LEGEND.statusNew,
    statusNewFound: lg.statusNewFound ?? DEFAULT_PROJECT_LEGEND.statusNewFound,
    statusPending: lg.statusPending ?? DEFAULT_PROJECT_LEGEND.statusPending,
    statusRepaired: lg.statusRepaired ?? DEFAULT_PROJECT_LEGEND.statusRepaired,
  };
}

/** 같은 정규화의 도곽판 — 옛 레코드에 필드가 빠져 있어도 렌더가 `NaN` 을 만나지 않는다 */
export function projectTitleBlockOf(
  tb: Partial<ProjectTitleBlock> | null | undefined,
): ProjectTitleBlock {
  if (!tb) return DEFAULT_PROJECT_TITLE_BLOCK;
  return {
    enabled: tb.enabled ?? DEFAULT_PROJECT_TITLE_BLOCK.enabled,
    projectTitle: tb.projectTitle ?? DEFAULT_PROJECT_TITLE_BLOCK.projectTitle,
    scale: tb.scale ?? DEFAULT_PROJECT_TITLE_BLOCK.scale,
    tbScale: tb.tbScale ?? DEFAULT_PROJECT_TITLE_BLOCK.tbScale,
    col0: tb.col0 ?? DEFAULT_PROJECT_TITLE_BLOCK.col0,
    col1: tb.col1 ?? DEFAULT_PROJECT_TITLE_BLOCK.col1,
    labelFontSz: tb.labelFontSz ?? DEFAULT_PROJECT_TITLE_BLOCK.labelFontSz,
    valueFontSz: tb.valueFontSz ?? DEFAULT_PROJECT_TITLE_BLOCK.valueFontSz,
  };
}
