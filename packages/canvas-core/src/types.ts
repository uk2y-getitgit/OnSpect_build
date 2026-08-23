/**
 * 캔버스 코어 타입 — 스펙 §2-1 / §2-3.
 *
 * 경계 규칙: 이 패키지는 window · document · Image · requestAnimationFrame ·
 * performance · React 를 참조하지 않는다. 시간·난수·이미지는 전부 인자로 받는다.
 */

// ── 좌표계 (§2-2) ──────────────────────────────────────────────────────────
/** N — 정규화 좌표 0~1. **저장 형식.** DB·동기화·출력에 나가는 유일한 형식 */
export type NPoint = { x: number; y: number };
/** I — 이미지 픽셀. N↔S 중계용 */
export type IPoint = { x: number; y: number };
/** S — 스크린 CSS px. **모든 기하 판정(히트·거리·각도·스냅)의 기준** */
export type SPoint = { x: number; y: number };

/** 등방 스케일, 회전 없음. 등방성은 불변식이다 — 깨지 않는다 */
export type Viewport = { zoom: number; tx: number; ty: number };

export type Size = { w: number; h: number };

// ── 도메인 (§2-1) ──────────────────────────────────────────────────────────
export type MarkType = 'POINT' | 'ARROW' | 'AREA_RECT' | 'AREA_ELLIPSE';

/**
 * 알 수 없는 k 를 만나면 렌더러는 무시하고 건너뛴다(throw 금지) — 스펙 §2-0.
 *
 * ⚠️ **전부 0~1 정규화다** (불변식 #1). 이미지 px 이나 스크린 px 이 들어오면 안 된다.
 * 크기(w·h)도 정규화 비율이다 — 도면 해상도가 바뀌어도 같은 자리에 같은 비율로 남는다.
 *
 * 형식은 S2a 스펙 §S2a-1 에서 확정했다:
 *   ARROW        = 꼬리(from) → 머리(to)
 *   AREA_RECT    = 좌상단 + 크기
 *   AREA_ELLIPSE = **외접 사각형** 기준 (중심·반지름이 아니다 — 사각/타원 편집 코드를 공유한다)
 */
export type MarkGeometry =
  | { k: 'POINT'; x: number; y: number }
  | { k: 'ARROW'; from: NPoint; to: NPoint }
  | { k: 'AREA_RECT'; x: number; y: number; w: number; h: number }
  | { k: 'AREA_ELLIPSE'; x: number; y: number; w: number; h: number };

export type Mark = {
  id: string;
  defectId: string;
  type: MarkType;
  geometry: MarkGeometry;
  /** Defect 내 마크 순서. marks[0] 이 기본 앵커 */
  sortOrder: number;
};

/**
 * 자유그리기 한 획 (§S2a-1).
 * **마크가 아니다.** 결함에 종속된 스케치이므로 번호 라벨·리더선이 붙지 않는다.
 */
export type SketchPath = {
  id: string;
  /** 정규화 좌표 열. 2점 미만이면 무시한다 */
  points: NPoint[];
  /** 선 굵기 — **이미지 px**. 줌하면 함께 커진다 (A3 WYSIWYG) */
  width: number;
};

/**
 * 메모 — **결함이 아니다** (§S2a-1 · 상세기획 §2).
 *
 * 결함 리스트에 나타나지 않고, 결함 상태색(빨강·보라·회색)을 쓰지 않는다.
 * `canvas-core` 는 `project-core` 를 import 하지 않으므로 RecordBase 를 여기 펼쳐 둔다.
 */
export type Memo = {
  id: string;
  projectId: string;
  drawingId: string;
  floorId: string;
  /** 메모 상자의 **좌상단** 앵커. 정규화 좌표 */
  pos: NPoint;
  text: string;
  /** null = 기본 메모 스타일 상속 */
  style: MemoStyle | null;
  createdAt: number;
  updatedAt: number;
  deviceId: string;
  createdBy: string | null;
};

export type MemoStyle = {
  color?: string;
  background?: string;
  border?: string;
  /** 기본 글자 크기 배수 */
  fontScale?: number;
};

export type Label = {
  defectId: string;
  /** 번호 풍선의 **중심**, 정규화 좌표. 0~1 을 벗어날 수 있다 (§2-1-a) */
  x: number;
  y: number;
  /** 리더선이 붙는 마크. null = 마크 집합의 중심(centroid) */
  anchorMarkId: string | null;
  /** false = 자동 배치 상태, true = 사용자가 한 번이라도 옮김 */
  placed: boolean;
};

export type DefectStatus = 'CURRENT' | 'PREV_PENDING' | 'REPAIRED';

/**
 * 개별 스타일 오버라이드. 크기 단위는 **이미지 px**.
 * ⚠️ 위치(라벨 좌표)는 여기 들어오지 않는다 — 위치는 geometry 다 (§2-1-c, 함정 #5).
 */
/** 영역 테두리 모양 (상세기획 §3-5) */
export type AreaShape = 'SOLID' | 'DASH' | 'CLOUD';
/** 영역 채우기 (상세기획 §3-5). HATCH = 45° 해치 */
export type AreaFill = 'NONE' | 'HATCH';

export type StyleOverride = {
  color?: string;
  opacity?: number;
  markRadius?: number;
  markStroke?: number;
  balloonRadius?: number;
  balloonStroke?: number;
  leaderWidth?: number;
  // ── S2a — 방향 · 영역 · 자유그리기 ──
  /** 화살촉 길이 — 이미지 px */
  arrowHead?: number;
  areaShape?: AreaShape;
  areaFill?: AreaFill;
  /** 자유그리기 기본 굵기 — 이미지 px */
  sketchWidth?: number;
};

export type GlobalStyle = {
  markRadius: number;
  markStroke: number;
  balloonRadius: number;
  balloonStroke: number;
  leaderWidth: number;
  fontFactor: number;
  haloFactor: number;
  arrowHead: number;
  areaShape: AreaShape;
  areaFill: AreaFill;
  sketchWidth: number;
  statusColor: Record<DefectStatus, string>;
  statusOpacity: Record<DefectStatus, number>;
};

export type ResolvedStyle = {
  color: string;
  opacity: number;
  markRadius: number;
  markStroke: number;
  balloonRadius: number;
  balloonStroke: number;
  leaderWidth: number;
  fontSize: number;
  haloWidth: number;
  arrowHead: number;
  areaShape: AreaShape;
  areaFill: AreaFill;
  sketchWidth: number;
};

/** 규모 입력 방식 — 폭×길이 / 면적 (S4 스펙 §3-5) */
export type DefectSizeMode = 'WL' | 'AREA';
/** 조사구분. 폼에 노출하지 않는다. Phase 4 출력 필터가 쓴다 */
export type SurveyKind = 'EXTERIOR' | 'DETAIL';
/** 진행 없음 / 진행 중 */
export type DefectProgress = 'NONE' | 'ONGOING';
/** 구조체 / 비구조체 */
export type DefectStructural = 'STRUCTURAL' | 'NON_STRUCTURAL';

/**
 * 결함의 **도메인 속성** — S4 스펙 §3-2.
 *
 * `canvas-core` 는 이 값을 해석하지 않는다 (유일한 예외: `completeness.ts` 의 필수항목 판정).
 * 렌더·히트·커맨드는 이 타입을 전혀 모른다. 저장 형태는 `Defect` 안에 **플랫**이다.
 *
 * **`id` 와 `name` 을 둘 다 저장한다** (F11):
 *   · 보고서에 인쇄할 글자는 `name` — 설정을 고치거나 지워도 이미 쓴 보고서가 안 흔들린다
 *   · 코드번호 조회·역참조는 `id`
 */
export type DefectAttrs = {
  // ── 분류 ────────────────────────────────────────────────────────────────
  /** 폼 미노출. 기본 EXTERIOR */
  surveyKind: SurveyKind;
  /** 위치보조 — 거실 · 복도 · 계단실 */
  locationNote: string | null;
  structureType: 'RC' | 'SRC' | 'SS' | null;

  memberId: string | null;
  /** 출력·표시에 쓰는 **이름 스냅샷** */
  memberName: string | null;
  /** null = 부재 마스터의 구조체 구분을 그대로 쓴다. 값이 있으면 사용자가 손댄 것 */
  structural: DefectStructural | null;

  defectTypeId: string | null;
  defectTypeName: string | null;

  // ── 규모 (§3-5) ─────────────────────────────────────────────────────────
  sizeMode: DefectSizeMode;
  /** WL 전용. 실측 폭(mm) — 구간이 아니라 숫자 그대로다 (D7) */
  widthMm: number | null;
  /** WL 전용 */
  lengthMm: number | null;
  /** AREA 전용 — **직접 입력값.** WL 에서는 저장하지 않고 파생한다 (F14) */
  areaM2: number | null;
  /** AREA 의 가로 (보조 입력, 재편집용) */
  areaWMm: number | null;
  /** AREA 의 세로 (보조 입력, 재편집용) */
  areaHMm: number | null;
  /** null 은 1 로 읽는다. **면적에 곱하지 않는다** (불변식 4) */
  countEa: number | null;

  // ── 판정 ────────────────────────────────────────────────────────────────
  progress: DefectProgress;
  /** 누수여부 O/X */
  leak: boolean;

  causeId: string | null;
  /** 자유 텍스트면 id=null, name 만 채운다 */
  causeName: string | null;
  repairId: string | null;
  repairName: string | null;

  memo: string | null;
};

/**
 * 결함. Phase 3 캔버스가 읽는 최소 형태 + 도메인 속성(`DefectAttrs`).
 * ⚠️ 출력 결함번호·사진번호 필드는 **없다.** 저장하지 않고 출력 시점에 계산한다(불변식 2).
 * 캔버스가 그리는 숫자는 `displayNumber` 로 **주입받는다** (§2-1-b).
 */
export type Defect = {
  id: string;
  /**
   * 소속 용역. 캔버스는 해석하지 않는 **불투명 문자열**이다 (이미 있는 floorId 와 성격이 같다).
   * 저장소가 "이 용역의 결함 전부" 를 인덱스로 뽑으려면 필요하다 — 상세기획 §3-3.
   */
  projectId: string;
  drawingId: string;
  floorId: string;
  /** 층 내 입력순번. z-order 와 히트 동률 판정의 기준 */
  seq: number;
  status: DefectStatus;
  /**
   * 전회차 원본 결함 참조 (F7 · 상세기획 §3-3). `null` = 이번 회차에 새로 만든 결함.
   * 값이 있으면 **바로 이전 홉**만 가리킨다(체인은 필요하면 따라가며 조회한다) —
   * 번호는 저장하지 않는다: 전회차 번호가 필요하면 `prevDefectId` 를 따라가 조회한다.
   */
  prevDefectId: string | null;
  marks: Mark[];
  label: Label;
  /**
   * 자유그리기 (§S2a-1). 결함번호와 연동되지만 번호 라벨·리더선은 붙지 않는다.
   * 옛 레코드에는 이 필드가 없다 — 읽는 쪽에서 `?? []` 로 받는다.
   */
  sketch: SketchPath[];
  /** null = 전역 스타일 상속. 위치 이동은 이 값을 절대 건드리지 않는다 */
  style: StyleOverride | null;
} & DefectAttrs;

export type DrawingRef = { id: string; imageWidth: number; imageHeight: number };

// ── 캔버스 상태 (§2-3) ─────────────────────────────────────────────────────
export type Tool =
  | 'SELECT'
  | 'POINT'
  | 'ARROW'
  | 'AREA_RECT'
  | 'AREA_ELLIPSE'
  | 'SKETCH'
  | 'MEMO';

/** 도구가 만드는 마크 타입. SELECT·SKETCH·MEMO 는 마크를 만들지 않는다 */
export const TOOL_MARK_TYPE: Partial<Record<Tool, MarkType>> = {
  POINT: 'POINT',
  ARROW: 'ARROW',
  AREA_RECT: 'AREA_RECT',
  AREA_ELLIPSE: 'AREA_ELLIPSE',
};

export type Part = 'MARK' | 'LABEL' | 'LEADER' | 'HANDLE' | 'SKETCH' | 'MEMO';

/**
 * 편집 핸들.
 *   NW…W = 영역 8방향 리사이즈
 *   FROM · TO = 화살표 꼬리 · 머리
 */
export type Handle = 'NW' | 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'FROM' | 'TO';

export const AREA_HANDLES: readonly Handle[] = ['NW', 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W'];

/**
 * ⚠️ `memoId` 가 채워지면 `defectId` 는 null 이다. 메모는 결함이 아니다.
 * `pathId` · `handle` 은 해당 part 일 때만 채워진다.
 */
export type Selection = {
  defectId: string | null;
  part: Part | null;
  markId: string | null;
  pathId?: string | null;
  memoId?: string | null;
  handle?: Handle | null;
};

export type HoverTarget = {
  defectId: string | null;
  part: Part;
  markId: string | null;
  pathId?: string | null;
  memoId?: string | null;
  handle?: Handle | null;
};

export type Keys = { space: boolean; alt: boolean; shift: boolean; ctrl: boolean };

export type AlignCand = { v: number; id: string };
export type AlignHit = { v: number; id: string; d: number };
export type AngleHit = { angle: number; point: SPoint; r: number };

export type AlignSnapshot = {
  xs: AlignCand[];
  ys: AlignCand[];
  /** 후보 라벨의 드래그 시작 시점 스크린 좌표 (가이드선 길이 계산용) */
  byId: Record<string, SPoint>;
};

export type Guide =
  | { k: 'ALIGN_X'; x: number; y1: number; y2: number; ids: string[] }
  | { k: 'ALIGN_Y'; y: number; x1: number; x2: number; ids: string[] }
  | { k: 'ANGLE'; anchor: SPoint; end: SPoint; angle: number };

export type DragKind =
  | 'PAN'
  | 'MOVE_MARK'
  | 'MOVE_LABEL'
  /** 방향 · 영역 생성 드래그 (누른 곳 → 뗀 곳) */
  | 'CREATE_SHAPE'
  /** 자유그리기 — 점을 모으다가 뗄 때 한 Path 확정 */
  | 'CREATE_SKETCH'
  /** ARROW · AREA_* 마크 전체 이동 */
  | 'MOVE_SHAPE'
  /** 영역 8방향 리사이즈 · 화살표 끝점 이동 */
  | 'RESIZE_SHAPE'
  /** 자유그리기 한 획 전체 이동 (점 단위 편집은 범위 밖) */
  | 'MOVE_SKETCH'
  | 'MOVE_MEMO';

export type DragState = {
  kind: DragKind;
  pointerId: number;
  startScreen: SPoint;
  startViewport: Viewport;
  /** (요소 중심 − 포인터). 잡은 지점 유지용 */
  grabOffsetScreen: SPoint;
  /** Esc 취소 시 복귀 지점 */
  originNorm: NPoint;
  originPlaced: boolean;
  defectId: string | null;
  markId: string | null;
  /** MOVE_MARK 일 때 라벨이 따라오도록 (A2) */
  labelOriginNorm: NPoint | null;
  /** 드래그 중 미리보기 위치. 커밋(POINTER_UP) 전까지 문서는 건드리지 않는다 */
  previewNorm: NPoint;
  labelPreviewNorm: NPoint | null;
  /** MOVE_LABEL 일 때 앵커의 스크린 좌표. 드래그 중 뷰포트가 고정이므로 유효 */
  anchorScreen: SPoint | null;
  align: AlignSnapshot | null;
  snapState: { x: AlignHit | null; y: AlignHit | null; angle: AngleHit | null };
  /** CLICK_SLOP_PX 초과 여부. 클릭/드래그 구분 */
  moved: boolean;
  /** POINT 도구로 빈 도면을 눌렀는가 (UP 에서 생성 판단) */
  pointToolCandidate: boolean;

  // ── S2a ──────────────────────────────────────────────────────────────────
  /** 생성 드래그 시작점 (정규화). 방향의 꼬리 · 영역의 한 모서리 */
  createStart: NPoint | null;
  /** 생성 중인 마크 타입 */
  createType: MarkType | null;
  /** 편집/생성 중인 기하 미리보기. 커밋 전까지 문서는 건드리지 않는다 */
  geomPreview: MarkGeometry | null;
  /** Esc·Undo 복귀용 원본 기하 */
  geomOrigin: MarkGeometry | null;
  /** RESIZE_SHAPE 일 때 잡은 핸들 */
  handle: Handle | null;
  /** 자유그리기 대상 */
  pathId: string | null;
  pathOrigin: NPoint[] | null;
  pathPreview: NPoint[] | null;
  memoId: string | null;
};

/**
 * F2 — 자유그리기 **사후연결** 대기 상태.
 *
 * 사용자 요구: *"그리기는 자유그리기 후 결함번호 선택 또는 추가"* (Q16 재결정).
 * 선택된 결함 없이 획을 그리면 버리지 않고 여기에 담아 두고, 붙일 곳을 고르게 한다.
 *
 * · 대기 중에 획을 더 그리면 **쌓인다** (여러 획으로 한 결함을 그릴 수 있어야 한다)
 * · 대기 중에 도구를 바꿔도 유지된다 (실수로 잃으면 안 된다 — F4 와 같은 정신)
 * · Escape 또는 [취소] 로 버린다
 *
 * ⚠️ 아직 문서(Defect[])에 없다. 저장·Undo 스택 어디에도 들어가지 않는다.
 */
export type PendingSketch = { paths: SketchPath[] };

export type Cursor =
  | 'default'
  | 'crosshair'
  | 'grab'
  | 'grabbing'
  | 'move'
  | 'pointer'
  | 'not-allowed'
  | 'wait'
  /** 메모 도구 — 클릭하면 글을 쓴다 */
  | 'text'
  // 영역 8방향 리사이즈
  | 'ns-resize'
  | 'ew-resize'
  | 'nwse-resize'
  | 'nesw-resize';

/**
 * 캔버스 요소 위에 **떠 있는 UI** 가 잡아먹는 가장자리 (S1 스펙 §2-10-a).
 * 우측 툴 팔레트 폭, 하단 도움말 줄 높이 등. 웹 어댑터가 실측해 넣는다.
 *
 * 이 값이 없으면 "선택한 대상은 항상 화면 안에 있어야 한다" 를 판정할 수 없다 —
 * 캔버스가 요소 전체 크기를 뷰포트로 착각해 선택한 번호 풍선이 패널 뒤에 숨는다.
 */
export type SafeInsets = { top: number; right: number; bottom: number; left: number };

export type CanvasState = {
  drawing: DrawingRef | null;
  canvas: Size;
  /** 기본 전부 0. `SET_SAFE_INSETS` 로 갱신 */
  safeInsets: SafeInsets;
  viewport: Viewport;
  /** 도면(층)마다 뷰포트를 따로 기억한다 (B10) */
  viewports: Record<string, Viewport>;
  tool: Tool;
  selection: Selection;
  hover: HoverTarget | null;
  drag: DragState | null;
  /** 드래그 중에만 채워지는 파생값. undo·저장 어디에도 들어가지 않는다 */
  guides: Guide[];
  keys: Keys;
  cursor: Cursor;
  /** 도면 로딩 중이면 커서 wait + 입력 무시 */
  busy: boolean;
  /** F2 — 붙일 결함을 아직 못 고른 자유그리기. null = 대기 없음 */
  pendingSketch: PendingSketch | null;
};

// ── 입력 이벤트 (경계 규칙 6) ──────────────────────────────────────────────
export type InputEvent =
  | { k: 'POINTER_DOWN'; pointerId: number; screen: SPoint; button: number; keys: Keys }
  | { k: 'POINTER_MOVE'; pointerId: number; screen: SPoint; keys: Keys }
  | { k: 'POINTER_UP'; pointerId: number; screen: SPoint; keys: Keys }
  | { k: 'POINTER_CANCEL'; pointerId: number }
  | { k: 'POINTER_LEAVE' }
  | { k: 'WHEEL'; screen: SPoint; deltaY: number; keys: Keys }
  | { k: 'DOUBLE_CLICK'; screen: SPoint; keys: Keys }
  | { k: 'CONTEXT_MENU'; screen: SPoint }
  | { k: 'KEY_DOWN'; key: string; keys: Keys }
  | { k: 'KEY_UP'; key: string; keys: Keys }
  | { k: 'RESIZE'; size: Size }
  | { k: 'SET_SAFE_INSETS'; insets: SafeInsets }
  | { k: 'SET_TOOL'; tool: Tool }
  | { k: 'SET_DRAWING'; drawing: DrawingRef | null }
  | { k: 'SET_BUSY'; busy: boolean }
  | { k: 'SELECT_DEFECT'; defectId: string | null; reveal: boolean }
  | { k: 'FIT' }
  | { k: 'ZOOM_BUTTON'; factor: number }
  | { k: 'RESET_LABEL'; defectId: string }
  | { k: 'DELETE_SELECTION' }
  | { k: 'CONFIRM_DELETE_DEFECT'; defectId: string }
  // ── S2a ──────────────────────────────────────────────────────────────────
  | { k: 'SELECT_MEMO'; memoId: string | null; reveal: boolean }
  /** 메모 텍스트 확정. 빈 문자열이면 메모를 지운다 */
  | { k: 'COMMIT_MEMO_TEXT'; memoId: string; text: string }
  /** 선택된 영역의 테두리 모양 · 채우기. 개별 변경은 전역 상속에서 분리된다 */
  | { k: 'SET_AREA_STYLE'; defectId: string; shape?: AreaShape; fill?: AreaFill }
  /** null 이면 상태색(전역 상속)으로 되돌린다 */
  | { k: 'SET_MARK_COLOR'; defectId: string; color: string | null }
  /** 개별 스타일 전체를 버리고 전역 상속으로 복귀 (§S2a-5 [초기화]) */
  | { k: 'RESET_STYLE'; defectId: string }
  // ── F2 자유그리기 사후연결 ────────────────────────────────────────────────
  /** 대기 중인 그리기를 이 결함에 붙인다 */
  | { k: 'ATTACH_PENDING_SKETCH'; defectId: string }
  /** 대기 중인 그리기의 중심에 새 결함을 만들고 붙인다 */
  | { k: 'PENDING_SKETCH_TO_NEW_DEFECT' }
  /** 대기 중인 그리기를 버린다 */
  | { k: 'CANCEL_PENDING_SKETCH' };

/** 코어가 어댑터에게 요청하는 부수효과. 코어는 직접 수행하지 않는다 */
export type Effect =
  | { k: 'FOCUS_PANEL'; defectId: string }
  | { k: 'CONTEXT_MENU'; screen: SPoint; defectId: string }
  | { k: 'CONFIRM_DELETE_DEFECT'; defectId: string; reason: 'LAST_MARK' | 'EXPLICIT' }
  | { k: 'TOAST'; kind: 'info' | 'warn'; text: string; undoable?: boolean }
  | { k: 'REVEAL_DEFECT'; defectId: string }
  | { k: 'UNDO' }
  | { k: 'REDO' }
  /** 메모 텍스트 편집기를 띄워 달라. 코어는 DOM 을 모른다 */
  | { k: 'EDIT_MEMO'; memoId: string };
