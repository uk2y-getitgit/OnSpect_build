/**
 * `DefectBase`(병합·감사 재료) 의 생성 스탬프와 옛 레코드 읽기 정규화 —
 * Phase 5 스펙 `50_plan-reviewer_spec_Phase5_TeamSync.md` §2 · D23.
 *
 * **필드가 늘어도 고쳐야 할 곳이 여기 하나다.** `defectAttrs.ts` 와 같은 역할을
 * `DefectAttrs` 가 아닌 쪽(레코드 메타)에 대해 한다 —
 * `DefectBase` 를 `DefectAttrs` 에 섞으면 `DEFECT_ATTR_KEYS`·`changedAttrKeys`·
 * `pickCarryAttrs` 가 전부 오염된다(유사결함 불러오기가 남의 `updatedAt` 을 복사하게 된다).
 *
 * ⚠️ 이 파일은 `Date.now()` 를 부르지 않는다. 코어의 경계 규칙이기도 하지만,
 *    **읽기 정규화가 시각을 지어내는 순간 병합이 망가지기 때문**이다(§2-3).
 */
import type { Defect, DefectBase } from './types.js';

/**
 * 새로 만드는 결함에 찍는 스탬프.
 *
 * - `updatedAt` 은 **생성시각**이다. 옛 레코드의 `null`("미동기화") 과 구분된다 —
 *   방금 만든 결함은 실제로 이 시각에 이 기기에서 생겼다는 사실이 있다.
 * - `createdBy` 는 로그인이 붙기 전까지 `null` 이다(D23 — "작성자 미상").
 *
 * `now` 가 `null`(호출자가 시계를 안 넘겼다) 이면 **`0` 이 아니라 `null` 을 넣는다.**
 * `0` 은 "1970년에 고친 결함" 이라 병합에서 **항상 지는** 독값이다(§2-3).
 * 시각을 모를 때의 정답은 언제나 "서버가 첫 동기화에 부여한다" 다.
 */
export function newDefectBase(
  now: number | null,
  deviceId: string,
  createdBy: string | null = null,
): DefectBase {
  return { updatedAt: now, deviceId, createdBy };
}

/**
 * **저장 직전 스탬프.** 결함을 로컬 DB 에 쓰는 모든 경로가 이것을 통과한다
 * (`Photo`·`ItemSettings` 가 `repo.stamp()` 를 통과하는 것과 같은 규칙).
 *
 * 화면·캔버스 코어는 스탬프를 신경 쓰지 않는다 — **쓰는 자리에서 한 번만** 찍는다.
 * 그래서 "결함을 고치면 `updatedAt` 이 반드시 갱신된다" 가 경로 수와 무관하게 성립한다.
 *
 * ⚠️ **안 바뀐 결함까지 이 함수에 넣지 마라.** 옛 결함의 `updatedAt: null`("미동기화") 표식이
 *    조용히 지워지고, 첫 동기화 때 서버가 시각을 부여할 기회를 잃는다(D23).
 */
export function stampDefect(d: Defect, now: number, deviceId: string): Defect {
  return { ...d, updatedAt: now, deviceId };
}

/** `deviceId` 로 쓸 수 없는 값(누락·빈 문자열)인가 */
function missingDeviceId(v: unknown): boolean {
  return typeof v !== 'string' || v === '';
}

/**
 * 옛 결함 레코드(이 세 필드 없이 저장된 것)를 **읽는 즉시** 채운다.
 * **DB 버전을 올리지 않는다** — `normalizeDefectAttrs` 와 같은 방식이다(ASSUMPTIONS E11).
 *
 * | 필드 | 옛 레코드에 채우는 값 | 이유 |
 * |---|---|---|
 * | `updatedAt` | **`null` 을 유지** | "아직 동기화된 적 없음" 신호. 첫 동기화 때 서버가 시각을 부여한다(D23 B안) |
 * | `deviceId` | 현재 기기 id | 과거 사실이 아니라 **현재 관측값**("지금 이 기기에 있다")이라 위험이 없다 |
 * | `createdBy` | `null` | "작성자 미상". 로그인 이전 결함은 영원히 알 수 없다(D23) |
 *
 * ⛔ `updatedAt` 을 `Date.now()` 나 `0` 으로 채우지 마라. 이유는 `DefectBase.updatedAt` 주석 참조.
 *
 * 이미 정규화된 레코드는 **같은 객체를 그대로 돌려준다**(참조 비교로 재렌더를 줄인다).
 */
export function normalizeDefectBase(d: Defect, deviceId: string): Defect {
  const raw = d as Partial<DefectBase>;
  if (raw.updatedAt !== undefined && raw.createdBy !== undefined && !missingDeviceId(raw.deviceId)) {
    return d;
  }
  return {
    ...d,
    // ⛔ `?? Date.now()` 가 아니다. 없으면 null 이 정답이다
    updatedAt: raw.updatedAt ?? null,
    deviceId: missingDeviceId(raw.deviceId) ? deviceId : (raw.deviceId as string),
    createdBy: raw.createdBy ?? null,
  };
}
