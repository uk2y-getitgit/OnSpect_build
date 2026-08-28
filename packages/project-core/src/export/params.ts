/**
 * 출력 파라미터 · `ExportRun` — Phase 4 스펙 §3-2 · §3-3.
 *
 * ⭐ **`ExportRun` 은 재다운로드 재현성의 근거다** (§4-3 4단계 · K20).
 *    한 번의 `[생성]` 으로 4종을 뽑으면 **같은 `ExportRun` 을 공유**한다 →
 *    손상결함표·사진첩·조사위치도의 번호가 어긋날 수 없다.
 *    이력에서 `[같은 번호로 다시 받기]` 는 `mapping` 을 그대로 쓰고 **다시 계산하지 않는다.**
 *
 * 저장 위치: **새 오브젝트 스토어를 만들지 않는다.** `meta` KV 스토어를
 * `exportRun:{id}` 키로 재사용하고 **DB_VERSION 은 1 그대로**다 (K2 · §3-3).
 */
import type { FloorRange, NumberingParams } from './numbering.js';

/** 도면에 무엇을 그릴지 — 조사위치도가 쓴다 */
export type ExportRenderOptions = {
  /** 자유그리기 레이어 (기획서 §2 "출력 시 ON/OFF"). K12 — 출력용 결함 사본에 `sketch: []` 로 구현 */
  sketch: boolean;
  /** 메모 레이어. **메모는 내부 메모다** — 기본 꺼짐 */
  memo: boolean;
  /** 도곽 (F5-1) */
  titleBlock: boolean;
  /** 범례 (F5-2) */
  legend: boolean;
  /** 조사위치도 출력 배율 (1 = 도면 원본 픽셀) */
  mapScale: number;
};

export type ExportDocOptions = {
  /**
   * 손상결함표 머리말 2행. **보고서마다 장 번호가 다르므로 문자열 입력이다** (K18).
   * 하드코딩하면 다른 발주처에서 조용히 틀린다.
   */
  headerLine2: string;
  /**
   * 대표 외 사진 포함 (§2-C · PhotoPolish §2-8 로 **활성화됨**).
   *
   * ⭐ `assignNumbers()` 를 건드리지 않는다. 대표는 `사진 12` 그대로이고 나머지는
   *    `12-1` · `12-2` 라는 **사진첩 배치 단계의 파생 부번**이다 →
   *    `ExportRun.mapping`(결함 1건 : 번호 1개) 구조가 그대로라 재현성이 무손상이다.
   *    손상결함표·결함 리스트의 `사진번호` 열도 그대로 `12` 다(대표만 가리킨다).
   */
  includeNonPrimaryPhotos: boolean;
  /**
   * 사진첩 캡션 **1행(`사진 12`)을 숨긴다** (F-4 · 파일2-⑥). 기본 false.
   *
   * ⚠️ **표시만 숨긴다.** `assignNumbers()`·`ExportRun.mapping` 은 그대로다(불변식 #2).
   *    손상결함표·결함 리스트의 `사진번호` 열은 **건드리지 않는다** — 그 열은 본표의 열이다.
   */
  hidePhotoNumber: boolean;
};

export type ExportParams = NumberingParams & {
  render: ExportRenderOptions;
  doc: ExportDocOptions;
  /**
   * D19 — **출력 당시의 층 접두어 스냅샷** (`floorId → '1F' | null`).
   *
   * ⭐ 접두어는 층 이름·`Floor.code` 에서 파생되므로, 나중에 층 이름을 고치면 재출력 결과가
   *    달라진다. 그건 *"같은 옵션으로 다시 뽑으면 같은 번호"* 를 깬다 → 스냅샷을 남긴다.
   *    없으면(옛 run) 호출부가 **현재 층에서 파생**한다.
   *
   * `ExportParams` 는 `meta` KV 에 JSON 으로 들어가므로 **필드 추가에 마이그레이션이 없다.**
   * `ExportRun.mapping` 은 여전히 `{no: number, photoNo}` 정수다(불변식 #2).
   */
  floorCodes?: Record<string, string | null>;
};

export const DEFAULT_RENDER_OPTIONS: ExportRenderOptions = {
  sketch: true,
  memo: false,
  titleBlock: true,
  legend: true,
  mapScale: 2,
};

export const DEFAULT_DOC_OPTIONS: ExportDocOptions = {
  headerLine2: '제2장 현장조사',
  includeNonPrimaryPhotos: false,
  // 기본 false 이므로 **기존 출력물은 한 글자도 안 바뀐다**
  hidePhotoNumber: false,
};

/** 출력 화면이 처음 열릴 때의 값. 층 순서는 호출자가 정한다(누른 순서 = 출력 순서) */
export function DEFAULT_EXPORT_PARAMS(floorIds: readonly string[] = []): ExportParams {
  return {
    floorIds: [...floorIds],
    mode: 'CONTINUOUS',
    surveyKinds: null,
    includeRepaired: false,
    includePrevPending: true,
    // D3 — 미완성 결함을 자동 제외하지 않는다. 포함하고 경고만 띄운다
    includeIncomplete: true,
    render: { ...DEFAULT_RENDER_OPTIONS },
    doc: { ...DEFAULT_DOC_OPTIONS },
  };
}

// ── 산출물 ────────────────────────────────────────────────────────────────
export type ExportArtifactKind =
  | 'DAMAGE_TABLE'
  | 'DEFECT_LIST'
  | 'PHOTO_BOOK'
  | 'LOCATION_MAP';

export const ARTIFACT_LABEL: Record<ExportArtifactKind, string> = {
  DAMAGE_TABLE: '손상결함표',
  DEFECT_LIST: '결함 리스트',
  PHOTO_BOOK: '사진첩',
  LOCATION_MAP: '조사위치도',
};

export type ExportArtifact = {
  kind: ExportArtifactKind;
  fileName: string;
  /** 실제로 내려받은 시각 */
  at: number;
};

export type ExportRun = {
  id: string;
  projectId: string;
  createdAt: number;
  deviceId: string;
  params: ExportParams;
  /** ⭐ 번호 매핑 스냅샷 — 재다운로드 재현성의 근거 (§4-3 4단계) */
  mapping: Record<string, { no: number; photoNo: number | null }>;
  /** 출력 순서 (defectId) */
  order: string[];
  floorRanges: FloorRange[];
  /** 스냅샷 시점의 대상 결함 수. 이후 데이터 변경 감지에 쓴다 */
  defectCount: number;
  artifacts: ExportArtifact[];
};

/** `meta` 스토어 키 접두사 — 스토어를 새로 만들지 않는다 (K2) */
export const EXPORT_RUN_KEY_PREFIX = 'exportRun:';

export function exportRunKey(id: string): string {
  return `${EXPORT_RUN_KEY_PREFIX}${id}`;
}

/** 이력 목록 상한. 무한히 쌓이지 않게 오래된 것부터 지운다 */
export const EXPORT_RUN_KEEP = 20;

/**
 * 재다운로드 시 데이터가 그 사이 바뀌었는지 (§3-3 표 3행).
 * **번호는 그대로 나가고, 화면에 알린다.** 조용히 다시 계산하면 다른 보고서가 된다.
 */
export type ExportRunDrift = {
  /** `mapping` 에 없는 새 결함 — 이번 재다운로드에서 제외된다 */
  added: string[];
  /** `mapping` 에 있으나 지금은 없는 결함 — 건너뛴다 */
  removed: string[];
};

export function diffExportRun(run: ExportRun, currentDefectIds: readonly string[]): ExportRunDrift {
  const now = new Set(currentDefectIds);
  const added: string[] = [];
  for (const id of now) if (run.mapping[id] === undefined) added.push(id);
  const removed = run.order.filter((id) => !now.has(id));
  return { added: added.sort(), removed };
}
