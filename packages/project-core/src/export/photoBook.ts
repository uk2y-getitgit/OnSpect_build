/**
 * 사진첩 (2열 × 3행 = 6장/페이지, A4 세로) — Phase 4 스펙 §3-6.
 *
 * ⭐ **번호를 세지 않는다.** `numbering.ts` 가 준 `NumberingRow` 순서를 그대로 따르므로
 *    사진번호 오름차순이 자동으로 보장된다(K20). 대표사진이 없는 결함은 `photoNo` 가 null 이고,
 *    그 결함은 **건너뛴다**.
 *
 * 경계: 순수 함수. `Blob`·`URL`·DOM 을 참조하지 않는다 —
 * 사진은 `renderBlobKey`(불투명 문자열)로만 오간다. objectURL 변환은 어댑터의 몫이다.
 */
import { outputSize, type SizeInput } from '../items/size.js';
import {
  normalizePhotos,
  primaryOf,
  type Photo,
  type PhotoAnnotation,
  type PhotoEdits,
} from '../photo.js';
import { numText } from './damageTable.js';
import { formatDefectNo, type NumberingRow } from './numbering.js';

/** A4 세로 2열 × 3행 */
export const PHOTO_BOOK_PER_PAGE = 6;
export const PHOTO_BOOK_COLUMNS = 2;

/** 사진첩이 보는 결함의 최소 형태. 실제 `Defect` 를 그대로 넘기면 된다 */
export type PhotoBookDefect = SizeInput & {
  id: string;
  memberName: string | null;
  defectTypeName: string | null;
};

export type PhotoBookCell = {
  /**
   * React key · 합성본 URL 맵 키. `${defectId}:${photoId}`.
   *
   * ⚠️ **`defectId` 를 키로 쓰면 안 된다** — `includeNonPrimary` 를 켜는 순간
   *    한 결함에 셀이 여러 개가 되어 키가 중복된다 (§2-8).
   */
  key: string;
  defectId: string;
  /**
   * 결함 번호(층 접두어 포함, `1F-01`) — 좌측 번호 칸에 쓴다.
   *
   * 2026-09-04 사용자 요청 — **사진번호("사진 12")를 없애고 결함번호로 대체했다.**
   * 참고 양식(사진첩 양식.pdf)이 사진번호 없이 결함번호만 쓴다.
   */
  defectNo: string;
  /** 대표 = null · 그 외 1,2,3… (`includeNonPrimary` 일 때만 생긴다). 같은 결함의 여러 칸을 구분하는 값 — 캡션엔 안 찍는다 */
  subNo: number | null;
  /** 렌더 Blob 키 — 어댑터가 objectURL 로 바꾼다 */
  renderBlobKey: string;
  /** 자르기 · 회전. 렌더는 어댑터(합성 렌더러)가 한다 */
  edits: PhotoEdits;
  /** 주석 벡터 — 합성 렌더러가 쓴다 (렌더 프레임 0~1 정규화) */
  annotations: PhotoAnnotation[];
  /** 캡션 한 줄 — `위치 부재명 결함유형 (가로x세로)` (2026-09-04, 참고 양식 재현) */
  caption: string;
};

export type PhotoBookPage = {
  index: number;
  /**
   * D45 B-5 — 이 페이지에 실린 사진들의 동 이름. 없거나 빈 이름이면 `null`.
   *
   * ⭐ **한 페이지는 항상 한 동이다.** 배치가 동 경계에서 페이지를 끊으므로(아래 `buildPhotoBook`)
   *    이 값이 그 페이지 전체를 정확히 대표한다 — 머리말(`photoBookPageHeader`)이 이것을 쓴다.
   *    저장되는 값이 아니라 **런타임 파생값**이다(P2 · `ExportRun` 스키마 무변경).
   */
  buildingName: string | null;
  /** `cells.length ≤ 6`. 마지막 페이지가 6 으로 안 나눠떨어져도 **칸 크기는 유지한다** */
  cells: PhotoBookCell[];
};

export type PhotoBookInput = {
  /** 출력 순서 그대로 (`assignNumbers().rows` 또는 `ExportRun` 재구성) */
  rows: readonly NumberingRow[];
  defects: readonly PhotoBookDefect[];
  /** 결함 id → 그 결함의 사진 목록. `groupPhotosByDefect()` 결과를 그대로 넣는다 */
  photosByDefect: ReadonlyMap<string, readonly Photo[]>;
  /** 결함 id → `위치` 문자열. `damageTable.ts::buildLocations()` 결과 */
  locations: Readonly<Record<string, string>>;
  /**
   * D19 — 층 id → 출력 접두어. 없거나 그 층 값이 `null`이면 번호 칸은 정수 그대로(`3`) 나간다.
   * 손상결함표(`DamageTableInput.floorCodes`)와 같은 규칙 — 2026-09-04 사진첩 양식 개정으로 신설
   */
  floorCodes?: Readonly<Record<string, string | null>>;
  /**
   * D45 B-5 — 층 id → **동 이름**. 넘기면 동이 바뀌는 지점에서 페이지를 끊고,
   * 각 페이지의 `buildingName` 이 채워져 머리말이 `{용역명} - {동이름}` 이 된다.
   *
   * ⭐ **안 넘기면 지금까지와 완전히 같다** — 모든 페이지의 `buildingName` 이 `null` 이고
   *    분할도 6칸 규칙 하나뿐이다(P1).
   * ⭐ 빈 문자열·공백뿐인 이름은 **없는 것으로 친다**(P4 · `buildLocations` 와 같은 처리).
   */
  buildingNames?: Readonly<Record<string, string>>;
  /** 기본 6 */
  perPage?: number;
  /**
   * 대표 외 사진도 싣는다 (§2-8). 기본 false = 지금까지와 같은 동작.
   * 대표 먼저, 그다음 `sortOrder` 오름차순. 부번은 대표를 빼고 1부터 센다.
   */
  includeNonPrimary?: boolean;
};

/**
 * 페이지 배치. **대표사진 기준**(§2-C · `primaryOf`).
 * 대표사진이 없는 결함은 `photoNo` 가 null 이므로 자동으로 빠진다.
 *
 * `includeNonPrimary` 를 켜면 한 결함이 여러 칸을 차지한다 —
 * **결함번호·사진번호(정수)는 그대로**이고 부번만 늘어난다 (§2-8).
 *
 * D45 B-5 — `buildingNames` 를 넘기면 **동이 바뀌는 지점에서 페이지를 끊는다.**
 * 선택이 아니라 강제다: 한 페이지에 두 동의 사진이 섞이면 그 페이지 머리말이 거짓말이 된다.
 * 끊긴 페이지가 6칸을 못 채우면 **지금 규칙 그대로** 빈 칸을 테두리만 그린다(인쇄 뷰의 몫).
 */
export function buildPhotoBook(input: PhotoBookInput): PhotoBookPage[] {
  const perPage = Math.max(1, input.perPage ?? PHOTO_BOOK_PER_PAGE);
  const defectById = new Map(input.defects.map((d) => [d.id, d]));
  const includeNonPrimary = input.includeNonPrimary === true;
  const buildingOf = (floorId: string): string | null => {
    const n = (input.buildingNames?.[floorId] ?? '').trim();
    return n === '' ? null : n;
  };

  const cells: PhotoBookCell[] = [];
  /** `cells` 와 같은 길이·같은 순서. 페이지를 끊을 지점을 정하는 데만 쓴다 */
  const cellBuildings: (string | null)[] = [];
  for (const r of input.rows) {
    if (r.photoNo === null) continue; // 대표사진 없음 — 사진첩에서 빠진다
    const d = defectById.get(r.defectId);
    if (!d) continue; // 재다운로드 중 지워진 결함

    // ⚠️ 각자 `find(isPrimary)` 하지 않는다 — `primaryOf()`(읽기 정규화)가 유일한 조회 경로다.
    //    `normalizePhotos` 를 먼저 부르는 것은 **부번 순서(sortOrder 오름차순)** 를 얻기 위함이고,
    //    이미 정규화된 목록이면 같은 배열 참조가 그대로 돌아온다.
    const list = normalizePhotos(input.photosByDefect.get(r.defectId) ?? []);
    const primary = primaryOf(list);
    if (!primary) continue; // 사진이 사라졌다 — 번호는 밀지 않고 칸만 비운다

    const defectNo = formatDefectNo(r.no, input.floorCodes?.[r.floorId] ?? null);

    // 대표 먼저, 그다음 나머지. 부번은 **대표를 빼고 1부터** (§2-8)
    const picked: { photo: Photo; subNo: number | null }[] = [{ photo: primary, subNo: null }];
    if (includeNonPrimary) {
      let sub = 0;
      for (const p of list) {
        if (p.id === primary.id) continue;
        sub += 1;
        picked.push({ photo: p, subNo: sub });
      }
    }

    const building = buildingOf(r.floorId);
    for (const { photo, subNo } of picked) {
      cellBuildings.push(building);
      cells.push({
        key: `${r.defectId}:${photo.id}`,
        defectId: r.defectId,
        defectNo,
        subNo,
        renderBlobKey: photo.renderBlobKey,
        edits: photo.edits,
        annotations: photo.annotations ?? [],
        caption: photoBookCaption({
          location: input.locations[r.defectId] ?? '',
          defect: d,
          photoCaption: photo.caption,
        }),
      });
    }
  }

  // 페이지 분할 — ① 6칸이 찼거나 ② **동이 바뀌면** 새 페이지를 연다.
  // `buildingNames` 를 안 넘긴 경우 모든 값이 `null` 이라 ②가 절대 걸리지 않는다 → 옛 동작 그대로.
  const pages: PhotoBookPage[] = [];
  let cur: PhotoBookPage | null = null;
  for (let i = 0; i < cells.length; i += 1) {
    const building = cellBuildings[i] ?? null;
    if (cur === null || cur.cells.length >= perPage || cur.buildingName !== building) {
      cur = { index: pages.length, buildingName: building, cells: [] };
      pages.push(cur);
    }
    cur.cells.push(cells[i]!);
  }
  return pages;
}

/**
 * 사진첩 **페이지 머리말** 한 줄 — `{용역명}` 또는 `{용역명} - {동이름}` (2026-09-04 양식 · D45 B-5).
 *
 * ⭐ 문서 전체가 아니라 **페이지마다** 계산한다. 동이 바뀌면 페이지가 끊기므로(`buildPhotoBook`)
 *    각 페이지의 머리말은 그 페이지 사진들의 동을 정확히 가리킨다.
 *
 * 동이 1개인 용역(또는 한 동만 골라 뽑은 경우)은 모든 페이지의 `buildingName` 이 같으므로
 * **예전 산출물과 한 글자도 달라지지 않는다**(P1). 이름이 빈 동은 `null` 로 들어와 용역명만 난다(P4).
 */
export function photoBookPageHeader(projectName: string, buildingName: string | null): string {
  const b = (buildingName ?? '').trim();
  return b === '' ? projectName : `${projectName} - ${b}`;
}

/**
 * 캡션 한 줄 — 참고 양식(사진첩 양식.pdf) 재현, 2026-09-04 사용자 요청.
 *
 * `{위치} {부재명} {결함유형} ({가로}x{세로})` — 예: `지상1층 벽체 수평 및 수직균열 (0.2x2)`.
 * 크기가 없는 결함(도장박리 등)은 괄호를 통째로 뺀다 — 참고 양식의 `지상2층 계단 슬래브 도장박리`.
 *
 * ⚠️ **WL 은 옛 관례를 그대로 지킨다** — 폭은 mm 원값(`0.2` = 균열폭 0.2mm), 길이만 m 로
 * 환산한다(`lengthMm/1000`). AREA(가로×세로, D31 RECT)는 둘 다 실측 mm 라 **둘 다 m 로 환산한다** —
 * WL 의 "폭은 실은 미소값" 관례가 사각 손상 패치의 가로·세로에는 안 맞기 때문이다(비차단 가정).
 *
 * ⭐ 사진번호("사진 12")는 더 이상 안 넣는다 — 좌측 번호 칸의 결함번호가 그 자리를 대신한다.
 *    개소(EA)도 뺐다 — 참고 양식 어디에도 없다.
 */
export function photoBookCaption(a: {
  location: string;
  defect: PhotoBookDefect;
  /** 수동 캡션. 있으면 이 함수가 만드는 캡션 대신 쓴다 (§2-5) */
  photoCaption: string | null;
}): string {
  const manual = (a.photoCaption ?? '').trim();
  if (manual !== '') return manual;

  const size = outputSize(a.defect);
  const sizeSuffix =
    size.widthMm > 0 && size.lengthMm > 0
      ? a.defect.sizeMode === 'AREA'
        ? ` (${numText(size.widthMm / 1000, 2)}x${numText(size.lengthMm / 1000, 2)})`
        : ` (${numText(size.widthMm, 2)}x${numText(size.lengthMm / 1000, 3)})`
      : '';

  const parts = [a.location.trim(), (a.defect.memberName ?? '').trim(), (a.defect.defectTypeName ?? '').trim()]
    .filter((s) => s !== '');
  return parts.join(' ') + sizeSuffix;
}
