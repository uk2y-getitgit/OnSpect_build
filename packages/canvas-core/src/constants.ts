/**
 * 튜닝 상수 — 스펙 §2-10.
 *
 * 이 값들을 코드 곳곳에 매직넘버로 흩뿌리지 않는다. 전부 이 파일에서만 읽는다.
 * "스냅이 너무 세다" 는 요청에 **이 파일에서 숫자 하나만 고쳐서** 대응할 수 있어야 한다.
 */

// ── 줌 / 팬 ────────────────────────────────────────────────────────────────
/** fit 배율 대비 최소 */
export const ZOOM_MIN_FACTOR = 0.5;
/** 최대 배율 */
export const ZOOM_MAX = 8.0;
/** 휠 1노치 배율 */
export const ZOOM_WHEEL_STEP = 1.1;
/** 도면이 뷰포트에 남아야 하는 최소 비율 */
export const PAN_KEEP_VISIBLE = 0.2;
/** 최초 진입 Fit 여백 비율 (스펙 §2-5 "도면 전체 Fit + 여백 2%") */
export const FIT_MARGIN = 0.02;

/**
 * 선택 대상 가시성 보정 시 대상 bbox 를 팽창시키는 여유 (S1 스펙 §2-10-b).
 * 화면 가장자리에 딱 붙어 있으면 "보인다" 고 느껴지지 않는다.
 */
export const REVEAL_PAD_PX = 24;

// ── 클릭 / 히트 ────────────────────────────────────────────────────────────
/** 클릭/드래그 구분 */
export const CLICK_SLOP_PX = 4;
/** 히트 여유 */
export const HIT_PAD_PX = 4;
/** 라벨 최소 히트 반경 */
export const HIT_MIN_LABEL_PX = 12;
/** 마크 최소 히트 반경 */
export const HIT_MIN_MARK_PX = 10;
/** 리더선 히트 허용 거리 */
export const HIT_LEADER_PX = 6;
/** 영역 테두리 · 화살표 몸통 · 자유그리기 선 히트 허용 거리 */
export const HIT_STROKE_PX = 6;
/** 리사이즈 핸들 히트 반경 */
export const HIT_HANDLE_PX = 8;

/**
 * 방향 · 영역 생성 최소 드래그 거리 (스크린 px, §S2a-2).
 * 이보다 짧으면 **생성을 취소한다.** 실수 클릭으로 0크기 도형이 쌓이면 지우기도 어렵다.
 */
export const CREATE_MIN_DRAG_PX = 8;
/** 자유그리기에서 새 점을 채택하는 최소 이동 거리 (스크린 px). 점 폭증 방지 */
export const SKETCH_MIN_STEP_PX = 2.5;
/** 자유그리기 한 획의 최대 점 수. 넘으면 그만 받는다 (저장 크기 상한) */
export const SKETCH_MAX_POINTS = 600;

// ── 스마트 정렬 가이드 (§2-6) ───────────────────────────────────────────────
/** 정렬 스냅 진입 */
export const ALIGN_ENTER_PX = 6;
/** 정렬 스냅 이탈 (히스테리시스). ENTER 보다 반드시 커야 한다 */
export const ALIGN_RELEASE_PX = 10;
/** 가이드선 양끝 연장 */
export const GUIDE_OVERSHOOT_PX = 12;
/** 가이드 색 (빨강·보라 회피 — 디자인시스템 §3) */
export const GUIDE_COLOR = '#00b8d4';
/** 가이드선이 "같은 좌표" 로 인정하는 허용오차 */
export const GUIDE_COLLINEAR_TOL_PX = 0.5;

// ── 리더선 각도 스냅 (§2-7) ─────────────────────────────────────────────────
/** 45도 배수 포함 여부 (A4: 기본 꺼둠) */
export const ANGLE_SNAP_45 = false;
/** 각도 스냅 진입 */
export const ANGLE_ENTER_DEG = 5;
/** 각도 스냅 이탈 (히스테리시스) */
export const ANGLE_RELEASE_DEG = 8;
/** 각도 스냅으로 인한 최대 이동거리. 긴 리더선 과잉 스냅 방지 */
export const ANGLE_MAX_SHIFT_PX = 12;
/** 이보다 짧으면 각도 스냅 비활성 */
export const LEADER_MIN_PX = 24;

// ── 스냅 병합 (§2-8) ────────────────────────────────────────────────────────
export type SnapPriority = 'ANGLE_FIRST' | 'ALIGN_FIRST';
/** 충돌 시 우선순위 (A6) */
export const SNAP_PRIORITY: SnapPriority = 'ANGLE_FIRST';

// ── 라벨 자동 배치 (§2-10 / B14) ────────────────────────────────────────────
/** 자동 배치 거리 = 풍선반지름 × 이 값 */
export const LABEL_AUTO_DIST_FACTOR = 3.0;
/** 자동 배치 방향(우상단). 스크린/이미지 좌표계는 y가 아래로 증가하므로 -45 = 우상단 */
export const LABEL_AUTO_ANGLE_DEG = -45;

/**
 * F2 — 화살표를 점처럼 클릭 한 번으로 만들 때의 기본 머리(TO) 위치.
 * 라벨 자동배치와 겹쳐 보이지 않도록 다른 방향(오른쪽 수평)을 쓴다.
 * 사용자가 머리 핸들을 끌어 나중에 방향을 조정한다.
 */
export const ARROW_DEFAULT_ANGLE_DEG = 0;
/** 이미지 px. 풍선 반지름(34)의 약 2.4배 — 화면에서 방향이 뚜렷이 보이는 길이 */
export const ARROW_DEFAULT_LEN_IMG = 80;

// ── 저장 정밀도 (§2-2-b) ────────────────────────────────────────────────────
/** 정규화 좌표 저장 소수 자리 */
export const NORM_PRECISION = 6;

// ── 좌표 범위 (§2-1-a / B2) ─────────────────────────────────────────────────
/** 마크는 [0,1] 클램프 */
export const MARK_CLAMP_MIN = 0;
export const MARK_CLAMP_MAX = 1;
/** 라벨은 클램프하지 않되 소프트 리밋 */
export const LABEL_SOFT_MIN = -0.5;
export const LABEL_SOFT_MAX = 1.5;

// ── 렌더 기본값 (전역 스타일) ───────────────────────────────────────────────
// 단위는 **이미지 px**. 줌하면 함께 커진다(A3 WYSIWYG). 히트 영역만 스크린 최소값 보장.
export const RENDER_DEFAULTS = {
  /** 점 마크 반지름 */
  markRadius: 9,
  /** 점 마크 외곽선 굵기 */
  markStroke: 2.6,
  /** 번호 풍선 반지름 */
  balloonRadius: 34,
  /** 번호 풍선 테두리 굵기 */
  balloonStroke: 2.6,
  /** 리더선 굵기 */
  leaderWidth: 2.4,
  /** 번호 글자 크기 = balloonRadius × 이 값 */
  fontFactor: 1.05,
  /** 도면 위 텍스트 흰 외곽선(halo) 굵기 = fontSize × 이 값 (디자인시스템 §7) */
  haloFactor: 0.16,
  /** 화살촉 길이 */
  arrowHead: 22,
  /** 자유그리기 기본 굵기 */
  sketchWidth: 3,
} as const;

/** 영역 기본 스타일 (상세기획 §3-5) */
export const AREA_DEFAULT_SHAPE = 'SOLID' as const;
export const AREA_DEFAULT_FILL = 'NONE' as const;
/** 점선 대시 패턴 — 스크린 px */
export const AREA_DASH: readonly number[] = [7, 5];
/** 구름(revision cloud) 한 호의 목표 길이 — 스크린 px */
export const CLOUD_ARC_PX = 14;
/** 구름 호가 바깥으로 부푸는 정도 (호 길이 대비) */
export const CLOUD_BULGE = 0.42;
/** 45° 해치 간격 — 스크린 px */
export const HATCH_GAP_PX = 9;
/** 해치 선 굵기 */
export const HATCH_WIDTH_PX = 1;
/** 해치 불투명도. 도면 선을 덮어 가리면 안 된다 */
export const HATCH_ALPHA = 0.4;

// ── 메모 (§S2a-6) ──────────────────────────────────────────────────────────
/**
 * ⚠️ **메모는 결함이 아니다.** 결함 상태색(빨강 `#e5342a` · 보라 `#7c4dff` · 회색 `#9aa4b0`)을
 * 절대 쓰지 않는다. 가이드 시안(`#00b8d4`)·선택 파랑(`#2d6cdf`)과도 겹치지 않게
 * 포스트잇 계열 노랑을 쓴다.
 */
export const MEMO_BG = '#fff4c2';
export const MEMO_BORDER = '#c9a227';
export const MEMO_TEXT = '#4a3a05';
/** 메모 상자 폭 — 이미지 px */
export const MEMO_W = 200;
/** 메모 글자 크기 — 이미지 px */
export const MEMO_FONT = 15;
/** 줄 간격 = 글자 크기 × 이 값 */
export const MEMO_LINE_FACTOR = 1.45;
/** 상자 안쪽 여백 — 이미지 px */
export const MEMO_PAD = 8;
/** 한 줄에 넣는 글자 수 (한글 기준 근사). 코어는 텍스트를 실측할 수 없다 */
export const MEMO_CHARS_PER_LINE = 13;
/** 표시 최대 줄 수. 넘으면 마지막 줄을 말줄임한다 */
export const MEMO_MAX_LINES = 6;
/** 메모 스크린 최소 폭·높이. 줌아웃해도 집을 수 있어야 한다 */
export const MEMO_MIN_W_PX = 26;
export const MEMO_MIN_H_PX = 20;

// ── 필기 메모 (F2) ─────────────────────────────────────────────────────────
/**
 * **그리기(결함)와 메모를 눈으로 확실히 가른다** — 사용자 명시 요구 "구분은 확실하게".
 *
 * | | 그리기 | 메모 |
 * |---|---|---|
 * | 색 | 결함 **상태색**(빨강·보라·회색) | 아래 `MEMO_INK` — 중립 앰버 |
 * | 선 | 실선, 상태 불투명도 | 실선(글씨는 점선이면 못 읽는다) |
 * | 테두리 | 없음 | 획 둘레에 **점선 상자** |
 *
 * 질감 차이를 "점선 획"이 아니라 "점선 **상자**"로 준 이유: 손글씨를 점선으로 그리면
 * 글자가 읽히지 않는다(§F2 표는 굵기·투명도·점선 중 **택1**을 허용한다).
 */
export const MEMO_INK = '#8a6a12';
/** 필기 획 굵기 — 이미지 px */
export const MEMO_INK_WIDTH = 3;
export const MEMO_INK_ALPHA = 0.95;
/** 획 둘레 점선 상자의 여백 — 이미지 px */
export const MEMO_BOX_PAD = 6;
export const MEMO_BOX_DASH: readonly number[] = [6, 4];
export const MEMO_BOX_ALPHA = 0.45;

/** 상태별 기본 표기색 (§2-9-c · 디자인시스템 §3 예약색) */
export const STATUS_COLOR: Record<'CURRENT' | 'PREV_PENDING' | 'REPAIRED', string> = {
  CURRENT: '#e5342a',
  PREV_PENDING: '#7c4dff',
  REPAIRED: '#9aa4b0',
};

/** 상태별 기본 불투명도 (REPAIRED 는 40%) */
export const STATUS_OPACITY: Record<'CURRENT' | 'PREV_PENDING' | 'REPAIRED', number> = {
  CURRENT: 1,
  PREV_PENDING: 1,
  REPAIRED: 0.4,
};

// ── 선택 / 호버 표현 (스크린 px. UI 신호이므로 줌과 무관하게 일정) ──────────
/** 선택 링 색 — UI 계열. 도면 위 예약색과 겹치지 않는다 */
export const SELECTION_COLOR = '#2d6cdf';
/** 선택 글로우 두께 */
export const SELECTION_RING_PX = 3;
/** 선택 시 마크 주위 사각 박스의 반쪽 크기 여유 */
export const SELECTION_BOX_PAD_PX = 6;
/** 호버 시 마크 반경 증가 */
export const HOVER_MARK_GROW_PX = 2;
/** 호버 시 테두리 굵기 증가 */
export const HOVER_STROKE_GROW_PX = 1;
/** 호버 헤일로(그림자 대용) 색 */
export const HOVER_HALO_COLOR = 'rgba(45,108,223,0.28)';
