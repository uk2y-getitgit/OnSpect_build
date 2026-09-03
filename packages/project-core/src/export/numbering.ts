/**
 * 출력 번호부여 — Phase 4 스펙 §3-1 (상세기획 §4-3).
 *
 * ⭐ **4개 산출물(손상결함표·결함리스트·사진첩·조사위치도)이 이 함수 하나만 부른다.**
 *    각자 세면 사진첩의 `사진 92` 와 손상결함표의 `92` 가 다른 결함을 가리키게 되고,
 *    그건 **조용히 틀린다**(불변식 #2 · 함정 #1).
 *
 * 경계:
 *   · **순수 함수다.** 시간·난수·DOM·저장소를 참조하지 않는다.
 *   · `canvas-core` 를 import 하지 않는다(D13 · K14). 필요한 필드만 담은 로컬 타입
 *     `NumberingDefect` 을 선언하므로 실제 `Defect` 를 그대로 넘겨도 구조적 타이핑으로 맞는다
 *     (`items/size.ts::SizeInput` 이 이미 쓴 수법).
 *   · **출력 결함번호·사진번호를 저장하지 않는다.** 여기서 매번 계산한다.
 *     저장되는 것은 `ExportRun.mapping`(그 출력 한 번의 스냅샷)뿐이다(§3-3).
 */

/** 층별 1번부터 다시 | 전체 이어서 */
export type NumberMode = 'PER_FLOOR' | 'CONTINUOUS';

export type NumberingSurveyKind = 'EXTERIOR' | 'DETAIL';

export type NumberingStatus = 'CURRENT' | 'NEW' | 'PREV_PENDING' | 'REPAIRED';

/**
 * 번호부여가 보는 결함의 최소 형태.
 * 실제 `Defect` 는 이 필드를 전부 갖고 있으므로 그대로 넘기면 된다.
 */
export type NumberingDefect = {
  id: string;
  floorId: string;
  drawingId: string;
  /** 입력 순번. **출력번호가 아니다**(불변식 #2) */
  seq: number;
  status: NumberingStatus;
  surveyKind: NumberingSurveyKind;
};

export type NumberingParams = {
  /**
   * **클릭한 순서 그대로.** 이 배열이 곧 출력 순서다 (§4-4 젠트릭스 방식).
   * 여기 없는 층의 결함은 전부 제외된다.
   */
  floorIds: string[];
  mode: NumberMode;
  /** null = 전체 */
  surveyKinds: readonly NumberingSurveyKind[] | null;
  /** `REPAIRED` 포함 여부. 기본 false */
  includeRepaired: boolean;
  /** `PREV_PENDING` 포함 여부. 기본 true */
  includePrevPending: boolean;
  /** 미완성(부재·결함유형 미입력) 결함 포함 여부. **기본 true** (D3 — 자동 제외 금지) */
  includeIncomplete: boolean;
};

export type NumberingRow = {
  defectId: string;
  floorId: string;
  /** 출력 결함번호 ② */
  no: number;
  /** 출력 사진번호 ③. 대표사진이 없으면 null → 표에는 `—` */
  photoNo: number | null;
};

export type FloorRange = {
  floorId: string;
  count: number;
  /** 이 층에 배정된 NO 구간. `count === 0` 이면 null */
  from: number | null;
  to: number | null;
};

export type ExcludeReason =
  | 'FLOOR_NOT_SELECTED'
  | 'STATUS'
  | 'SURVEY_KIND'
  | 'INCOMPLETE';

export type NumberingResult = {
  /** 출력 순서 그대로 */
  rows: NumberingRow[];
  byDefect: Record<string, { no: number; photoNo: number | null }>;
  /** 층 칩에 `①–③` 을 실시간 표시하는 재료 (§4-4) */
  floorRanges: FloorRange[];
  /** 필터로 빠진 결함 — 화면 경고용 */
  excluded: { defectId: string; reason: ExcludeReason }[];
  /** 포함됐지만 손봐야 하는 것 — 출력 경고 (D3: 막지 않는다. 알리기만 한다) */
  warnings: {
    /** 부재·결함유형이 빈 결함 id */
    incomplete: string[];
    /** 대표사진 없는 결함 id — 사진첩에서 빠진다 */
    noPhoto: string[];
  };
};

export type NumberingContext = {
  /** 대표사진이 있는 결함 id 집합. 어댑터가 `photos` 에서 만든다 */
  hasPhoto: ReadonlySet<string>;
  /** 미완성 결함 id 집합. `canvas-core::isIncomplete` 결과를 어댑터가 넘긴다 */
  incomplete: ReadonlySet<string>;
};

const EMPTY_SET: ReadonlySet<string> = new Set<string>();

/** 안전한 기본값 — 화면이 파라미터를 다 채우기 전에도 부를 수 있다 */
export function defaultNumberingParams(floorIds: readonly string[] = []): NumberingParams {
  return {
    floorIds: [...floorIds],
    mode: 'CONTINUOUS',
    surveyKinds: null,
    includeRepaired: false,
    includePrevPending: true,
    includeIncomplete: true,
  };
}

/**
 * 상세기획 §4-3 알고리즘 그대로. **완전 결정론** —
 * 같은 입력이면 항상 같은 결과가 나온다(재다운로드 재현성의 전제).
 */
export function assignNumbers(
  defects: readonly NumberingDefect[],
  params: NumberingParams,
  ctx?: Partial<NumberingContext>,
): NumberingResult {
  const hasPhoto = ctx?.hasPhoto ?? EMPTY_SET;
  const incompleteSet = ctx?.incomplete ?? EMPTY_SET;

  // 1. 선택된 층만, **클릭 순서 그대로**. 중복 클릭은 첫 번째 자리를 쓴다
  const floorIds: string[] = [];
  const floorRank = new Map<string, number>();
  for (const fid of params.floorIds) {
    if (floorRank.has(fid)) continue;
    floorRank.set(fid, floorIds.length);
    floorIds.push(fid);
  }

  const buckets = new Map<string, NumberingDefect[]>();
  for (const fid of floorIds) buckets.set(fid, []);

  const excluded: { defectId: string; reason: ExcludeReason }[] = [];

  for (const d of defects) {
    const bucket = buckets.get(d.floorId);
    if (!bucket) {
      excluded.push({ defectId: d.id, reason: 'FLOOR_NOT_SELECTED' });
      continue;
    }
    if (!statusAllowed(d.status, params)) {
      excluded.push({ defectId: d.id, reason: 'STATUS' });
      continue;
    }
    if (!surveyAllowed(d.surveyKind, params.surveyKinds)) {
      excluded.push({ defectId: d.id, reason: 'SURVEY_KIND' });
      continue;
    }
    if (!params.includeIncomplete && incompleteSet.has(d.id)) {
      excluded.push({ defectId: d.id, reason: 'INCOMPLETE' });
      continue;
    }
    bucket.push(d);
  }

  // 2~6. 층 순서대로 번호를 매긴다
  const rows: NumberingRow[] = [];
  const byDefect: Record<string, { no: number; photoNo: number | null }> = {};
  const floorRanges: FloorRange[] = [];
  const incomplete: string[] = [];
  const noPhoto: string[] = [];

  let no = 0;
  let photoNo = 0;

  for (const fid of floorIds) {
    const bucket = (buckets.get(fid) ?? []).slice().sort(compareForOutput);

    if (params.mode === 'PER_FLOOR') {
      // 5. 층이 바뀔 때마다 **결함번호만** 1부터.
      //    ⭐ D19 로 **K6 가 폐기됐다** — 사진번호는 층이 바뀌어도 리셋하지 않는다.
      //    사진첩은 용역 전체를 한 권으로 묶으므로 `사진 1` 이 층마다 있으면 대조가 불가능하다
      //    (사용자 예시: `1F-01 = 1번사진` · `2F-01 = 13번사진`).
      no = 0;
    }

    let from: number | null = null;
    let to: number | null = null;

    for (const d of bucket) {
      no += 1;
      // 6. 사진번호는 **별도 카운터**. 대표사진이 있는 결함에서만 증가한다.
      //    없으면 null 이고 그 뒤 번호가 밀리지 않는다(§4-2 실측: 93·94·96 / 92·93·—)
      let pn: number | null = null;
      if (hasPhoto.has(d.id)) {
        photoNo += 1;
        pn = photoNo;
      } else {
        noPhoto.push(d.id);
      }
      if (incompleteSet.has(d.id)) incomplete.push(d.id);

      rows.push({ defectId: d.id, floorId: fid, no, photoNo: pn });
      byDefect[d.id] = { no, photoNo: pn };
      if (from === null) from = no;
      to = no;
    }

    // 빈 층이 선택돼 있어도 터지지 않는다 — `from/to = null`
    floorRanges.push({ floorId: fid, count: bucket.length, from, to });
  }

  return { rows, byDefect, floorRanges, excluded, warnings: { incomplete, noPhoto } };
}

/** 3. 상태 필터 — `CURRENT`(결함) 와 `NEW`(신규) 는 **항상 포함된다**. 둘 다 이번 회차다 */
function statusAllowed(status: NumberingStatus, p: NumberingParams): boolean {
  if (status === 'REPAIRED') return p.includeRepaired;
  if (status === 'PREV_PENDING') return p.includePrevPending;
  return true;
}

/** 4. 조사구분 필터 — `null` 이면 통과 (K8: 기본 전체) */
function surveyAllowed(
  kind: NumberingSurveyKind,
  kinds: readonly NumberingSurveyKind[] | null,
): boolean {
  if (kinds === null) return true;
  return kinds.includes(kind);
}

/**
 * 2. 층 안 정렬 — `seq` 오름차순 → 동률이면 `drawingId` → 동률이면 `id` 사전순.
 * **동률에서 입력 배열 순서에 기대지 않는다** — 그러면 저장소가 순서를 바꾸는 날 번호가 바뀐다.
 */
function compareForOutput(a: NumberingDefect, b: NumberingDefect): number {
  if (a.seq !== b.seq) return a.seq - b.seq;
  if (a.drawingId !== b.drawingId) return a.drawingId < b.drawingId ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

/**
 * D19 — 출력 결함번호 **표기**. 접두어가 있으면 `1F-01`, 없으면 `1`.
 *
 * ⭐ **저장 번호는 그대로 정수다**(불변식 #2 · `ExportRun.mapping`). 이 함수는 표기만 만든다 —
 *    접두어는 `(floorId → floorCode)` 파생 문자열이고 어디에도 저장되지 않는다.
 *
 * 자릿수는 2자리 0채움이고 100 이상은 자연히 3자리로 늘어난다(`1F-100`).
 */
export function formatDefectNo(no: number, floorCode: string | null | undefined): string {
  if (floorCode === null || floorCode === undefined || floorCode === '') return String(no);
  return `${floorCode}-${String(no).padStart(2, '0')}`;
}

/** 층 칩 표기용 — `①–12` / `—`(0건) */
export function formatFloorRange(r: FloorRange): string {
  if (r.count === 0 || r.from === null || r.to === null) return '—';
  if (r.from === r.to) return String(r.from);
  return `${r.from}–${r.to}`;
}
