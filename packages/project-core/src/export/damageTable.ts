/**
 * 손상결함표 · 결함 리스트의 **공유 행 생성기** — Phase 4 스펙 §3-4 · §3-5.
 *
 * ⭐ **열 정의를 한 배열(`DAMAGE_COLUMNS`)에 모은다.** 실물 서식이 오면 여기만 고친다.
 *    결함 리스트는 같은 행을 만들고 `DEFECT_LIST_COLUMNS` 로 **열만 줄인다** —
 *    두 산출물이 각자 셀을 계산하면 같은 결함이 두 표에서 다르게 보인다.
 *
 * 경계:
 *   · **순수 함수다.** DOM·저장소·시간·난수를 참조하지 않는다.
 *   · `canvas-core` 를 import 하지 않는다(D13 · K14). 필요한 필드만 담은 로컬 타입
 *     `DamageDefect` 을 선언하므로 실제 `Defect` 를 그대로 넘겨도 구조적 타이핑으로 맞는다.
 *   · **번호(`no`·`photoNo`)를 여기서 세지 않는다.** `numbering.ts` 가 준 `NumberingRow` 를 받는다
 *     (불변식 #2 · K20).
 *   · **면적은 `items/size.ts::outputSize()` 를 그대로 부른다.** 새로 계산하지 않는다
 *     (F4 · F17 · 불변식 #4).
 */
import { outputSize, type SizeInput } from '../items/size.js';
import type { CauseMaster, Structural } from '../items/types.js';
import { STRUCTURAL_LABEL } from '../items/types.js';
import { formatDefectNo, type NumberingRow } from './numbering.js';

// ── 열 정의 ────────────────────────────────────────────────────────────────
export type DamageColumnKey =
  | 'no'
  | 'location'
  | 'member'
  | 'structural'
  | 'defectType'
  | 'widthMm'
  | 'lengthMm'
  | 'areaM2'
  | 'countEa'
  | 'progress'
  | 'leak'
  | 'cause'
  | 'photoNo';

export type DamageColumn = {
  key: DamageColumnKey;
  header: string;
  /** `손상규모` 병합 헤더에 묶이는 열. null = 단독 열(4~5행 세로 병합) */
  group: string | null;
  /** 엑셀 열 너비(문자 단위) · 인쇄 폭 비율의 재료 */
  width: number;
  align: 'left' | 'center' | 'right';
  /** 숫자 열의 표시 소수 자리. null = 문자열 */
  decimals: number | null;
};

/** 손상규모 병합 헤더 이름 — 4행 가로 병합의 근거 */
export const DAMAGE_SIZE_GROUP = '손상규모';

export const DAMAGE_COLUMNS: readonly DamageColumn[] = [
  { key: 'no', header: 'NO', group: null, width: 6, align: 'center', decimals: 0 },
  { key: 'location', header: '위치', group: null, width: 14, align: 'left', decimals: null },
  { key: 'member', header: '부재명', group: null, width: 12, align: 'left', decimals: null },
  { key: 'structural', header: '구조체 유형', group: null, width: 10, align: 'center', decimals: null },
  { key: 'defectType', header: '결함의 유형 및 형상', group: null, width: 18, align: 'left', decimals: null },
  { key: 'widthMm', header: '폭(mm)', group: DAMAGE_SIZE_GROUP, width: 8, align: 'right', decimals: 1 },
  { key: 'lengthMm', header: '길이(mm)', group: DAMAGE_SIZE_GROUP, width: 9, align: 'right', decimals: 0 },
  { key: 'areaM2', header: '면적(㎡)', group: DAMAGE_SIZE_GROUP, width: 9, align: 'right', decimals: 4 },
  { key: 'countEa', header: '개소(EA)', group: DAMAGE_SIZE_GROUP, width: 8, align: 'center', decimals: 0 },
  { key: 'progress', header: '진행상황', group: null, width: 8, align: 'center', decimals: null },
  { key: 'leak', header: '누수여부', group: null, width: 8, align: 'center', decimals: null },
  { key: 'cause', header: '발생원인 추정', group: null, width: 10, align: 'center', decimals: null },
  { key: 'photoNo', header: '사진번호', group: null, width: 8, align: 'center', decimals: 0 },
];

const COLUMN_BY_KEY: ReadonlyMap<DamageColumnKey, DamageColumn> = new Map(
  DAMAGE_COLUMNS.map((c) => [c.key, c]),
);

export function damageColumn(key: DamageColumnKey): DamageColumn {
  const c = COLUMN_BY_KEY.get(key);
  if (!c) throw new Error(`알 수 없는 열: ${key}`);
  return c;
}

export function damageColumnsOf(keys: readonly DamageColumnKey[]): DamageColumn[] {
  return keys.map(damageColumn);
}

/** 대표사진이 없는 결함의 사진번호 표기 (§4-2 실측) */
export const NO_PHOTO_TEXT = '—';

// ── 입력 타입 (전부 로컬 최소 형태) ────────────────────────────────────────
/**
 * 표가 보는 결함의 최소 형태. 실제 `Defect` 는 이 필드를 전부 갖고 있으므로 그대로 넘기면 된다
 * (`items/size.ts::SizeInput` 과 같은 수법).
 */
export type DamageDefect = SizeInput & {
  id: string;
  floorId: string;
  /** 위치보조 — 거실 · 복도 · 계단실 (F7) */
  locationNote: string | null;
  memberId: string | null;
  memberName: string | null;
  /** null = 부재 마스터의 구분을 그대로 쓴다 (F16 해석 순서) */
  structural: Structural | null;
  defectTypeName: string | null;
  progress: 'NONE' | 'ONGOING';
  leak: boolean;
  causeId: string | null;
  causeName: string | null;
};

export type DamageFloor = { id: string; name: string; buildingId: string };
export type DamageBuilding = { id: string; name: string };
export type DamageMember = { id: string; structural: Structural };

export type DamageTableInput = {
  /** `assignNumbers()` 또는 `ExportRun.mapping` 에서 만든 출력 순서 그대로 */
  rows: readonly NumberingRow[];
  defects: readonly DamageDefect[];
  floors: readonly DamageFloor[];
  buildings: readonly DamageBuilding[];
  /** 부재 마스터 — `structural` 이 비었을 때의 폴백 (F16) */
  members: readonly DamageMember[];
  /** 발생원인 마스터 — `code` 를 그대로 인쇄한다 (F6). 재부여하지 않는다 */
  causes: readonly CauseMaster[];
  /** 머리말 1행 */
  projectName: string;
  /** 머리말 2행 — 보고서마다 장 번호가 다르다 (K18) */
  headerLine2: string;
  /** 기본 = 손상결함표 13열. 결함 리스트는 `DEFECT_LIST_COLUMNS` 를 넣는다 */
  columns?: readonly DamageColumnKey[];
  /**
   * D19 — 층 접두어 스냅샷 (`ExportParams.floorCodes`). 없거나 그 층 값이 `null` 이면
   * NO 열은 지금까지처럼 **정수 그대로** 나간다.
   */
  floorCodes?: Record<string, string | null>;
};

// ── 행 ─────────────────────────────────────────────────────────────────────
export type DamageCellValue = string | number | null;

export type DamageRow = {
  defectId: string;
  floorId: string;
  /** 타입이 살아 있는 값 — 엑셀은 이것을 쓴다(숫자는 숫자로 들어간다) */
  cells: Record<DamageColumnKey, DamageCellValue>;
  /** 표시 문자열 — 인쇄 뷰·CSV 가 쓴다. 소수 자리와 `—` 가 적용돼 있다 */
  text: Record<DamageColumnKey, string>;
};

/** 층이 바뀔 때마다 들어가는 `■ {층이름}` 섹션 (§3-4 표 구조) */
export type DamageSection = {
  floorId: string;
  floorName: string;
  /** 섹션 머리 행에 인쇄할 문자열 */
  title: string;
  rows: DamageRow[];
};

export type DamageCauseLegendItem = { code: number; name: string };

export type DamageTableModel = {
  /** 머리말 1행 */
  title: string;
  /** 머리말 2행 */
  headerLine2: string;
  /** 머리말 3행 — 엑셀 인쇄 반복 행에 들어가 페이지마다 반복된다 */
  continued: string;
  columns: DamageColumn[];
  sections: DamageSection[];
  /** 이 출력에 **실제로 등장한** 원인만, code 오름차순 (K21) */
  causeLegend: DamageCauseLegendItem[];
  rowCount: number;
};

/** 머리말 3행 고정 문구 */
export const DAMAGE_CONTINUED = '<계 속>';

/**
 * 결함 1건 → 표 한 행. **순수 함수다.**
 *
 * `ctx` 는 표 전체가 공유하는 조회표다 — 행마다 배열을 훑지 않게 미리 만들어 넘긴다.
 */
export function damageRow(
  d: DamageDefect,
  row: NumberingRow,
  ctx: {
    /** 결함 id → `위치` 열 문자열 */
    location: string;
    /** 부재 마스터 조회 */
    memberStructural: (memberId: string | null) => Structural | null;
    /** 발생원인 코드 조회 (F6) */
    causeCode: (causeId: string | null) => number | null;
    /**
     * D19 — 이 결함이 속한 층의 출력 접두어. `null`/생략이면 NO 열은 **정수 그대로**다.
     * ⚠️ 접두어가 있으면 셀 값이 **문자열**(`'1F-01'`)이 된다 — 엑셀도 그대로 문자열로 쓴다.
     *    저장되는 번호(`ExportRun.mapping`)는 여전히 정수다(불변식 #2).
     */
    floorCode?: string | null;
  },
): DamageRow {
  const size = outputSize(d);

  const structural = d.structural ?? ctx.memberStructural(d.memberId);
  const code = ctx.causeCode(d.causeId);
  const floorCode = ctx.floorCode ?? null;

  const cells: Record<DamageColumnKey, DamageCellValue> = {
    no: floorCode === null || floorCode === '' ? row.no : formatDefectNo(row.no, floorCode),
    location: ctx.location,
    member: d.memberName ?? '',
    structural: structural === null ? '' : STRUCTURAL_LABEL[structural],
    defectType: d.defectTypeName ?? '',
    widthMm: size.widthMm,
    lengthMm: size.lengthMm,
    areaM2: size.areaM2,
    countEa: size.countEa,
    progress: d.progress === 'ONGOING' ? 'O' : 'X',
    leak: d.leak ? 'O' : 'X',
    cause: code !== null ? code : (d.causeName ?? ''),
    photoNo: row.photoNo,
  };

  const text = {} as Record<DamageColumnKey, string>;
  for (const col of DAMAGE_COLUMNS) text[col.key] = formatDamageCell(col, cells[col.key]);

  return { defectId: d.id, floorId: row.floorId, cells, text };
}

/**
 * 셀 표시 문자열.
 *
 * 숫자는 **소수 자리까지 맞춘 뒤 꼬리 0 을 지운다** (M1) — 실측이 `0.2` · `0.0004` · `0.5` ·
 * `2000` 을 전부 그렇게 적는다. `toFixed` 만 쓰면 `0.5` 가 `0.5000` 이 되고,
 * 반대로 절사만 하면 부동소수 꼬리(`0.30000000000000004`)가 그대로 나온다.
 */
export function formatDamageCell(col: DamageColumn, v: DamageCellValue): string {
  if (v === null) return col.key === 'photoNo' ? NO_PHOTO_TEXT : '';
  if (typeof v === 'number') return numText(v, col.decimals ?? 0);
  return v;
}

/** 소수 `decimals` 자리로 맞춘 뒤 꼬리 0 과 남은 소수점을 지운다 */
export function numText(v: number, decimals: number): string {
  if (!Number.isFinite(v)) return '';
  const s = v.toFixed(Math.max(0, Math.min(10, decimals)));
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

// ── 위치 열 ────────────────────────────────────────────────────────────────
/**
 * `위치` 열 — 용역에 동이 **2개 이상**이면 `{동이름} {층이름}`, 1개면 `{층이름}` (K17).
 * `locationNote` 가 있으면 뒤에 공백 + 붙인다 (F7 필드 재사용).
 */
export function buildLocations(input: {
  defects: readonly DamageDefect[];
  floors: readonly DamageFloor[];
  buildings: readonly DamageBuilding[];
}): Record<string, string> {
  const floorById = new Map(input.floors.map((f) => [f.id, f]));
  const buildingById = new Map(input.buildings.map((b) => [b.id, b]));
  const multiBuilding = input.buildings.length >= 2;

  const out: Record<string, string> = {};
  for (const d of input.defects) {
    const floor = floorById.get(d.floorId);
    const parts: string[] = [];
    if (multiBuilding && floor) {
      const b = buildingById.get(floor.buildingId);
      if (b && b.name.trim() !== '') parts.push(b.name.trim());
    }
    if (floor && floor.name.trim() !== '') parts.push(floor.name.trim());
    const note = (d.locationNote ?? '').trim();
    if (note !== '') parts.push(note);
    out[d.id] = parts.join(' ');
  }
  return out;
}

// ── 표 ─────────────────────────────────────────────────────────────────────
/**
 * 출력 순서 그대로 표를 만든다. **층이 바뀌면 섹션이 갈린다.**
 *
 * `rows` 에 있는데 `defects` 에 없는 결함은 **건너뛴다** — 재다운로드 중 결함이 지워진 경우다
 * (§3-3 재현성 규칙 3행). 그 반대(새로 생긴 결함)는 `rows` 에 없으므로 자동으로 빠진다.
 */
export function buildDamageTable(input: DamageTableInput): DamageTableModel {
  const keys = input.columns ?? DAMAGE_COLUMNS.map((c) => c.key);
  const columns = damageColumnsOf(keys);

  const defectById = new Map(input.defects.map((d) => [d.id, d]));
  const floorById = new Map(input.floors.map((f) => [f.id, f]));
  const memberById = new Map(input.members.map((m) => [m.id, m]));
  const causeById = new Map(input.causes.map((c) => [c.id, c]));
  const locations = buildLocations(input);

  const memberStructural = (memberId: string | null): Structural | null =>
    memberId === null ? null : (memberById.get(memberId)?.structural ?? null);
  const causeCode = (causeId: string | null): number | null =>
    causeId === null ? null : (causeById.get(causeId)?.code ?? null);

  const sections: DamageSection[] = [];
  let current: DamageSection | null = null;
  const usedCauses = new Map<number, string>();
  let rowCount = 0;

  for (const r of input.rows) {
    const d = defectById.get(r.defectId);
    if (!d) continue; // 재다운로드 중 지워진 결함 — 건너뛴다

    if (!current || current.floorId !== r.floorId) {
      const floorName = floorById.get(r.floorId)?.name ?? '';
      current = { floorId: r.floorId, floorName, title: `■ ${floorName}`, rows: [] };
      sections.push(current);
    }

    current.rows.push(
      damageRow(d, r, {
        location: locations[d.id] ?? '',
        memberStructural,
        causeCode,
        floorCode: input.floorCodes?.[r.floorId] ?? null,
      }),
    );
    rowCount += 1;

    const code = causeCode(d.causeId);
    if (code !== null && !usedCauses.has(code)) {
      usedCauses.set(code, causeById.get(d.causeId as string)?.name ?? '');
    }
  }

  const causeLegend: DamageCauseLegendItem[] = [...usedCauses.entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.code - b.code);

  return {
    title: input.projectName,
    headerLine2: input.headerLine2,
    continued: DAMAGE_CONTINUED,
    columns,
    sections,
    causeLegend,
    rowCount,
  };
}

/** 발생원인 범례 한 줄 — `1. 건조수축` */
export function formatCauseLegend(items: readonly DamageCauseLegendItem[]): string {
  return items.map((c) => `${c.code}. ${c.name}`).join('  ');
}
