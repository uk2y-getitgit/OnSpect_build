/**
 * 고아 결함 탐지 — D50 (Q88=B, 2026-09-08).
 *
 * ## 왜 필요한가
 *
 * 각자 로그인해 같은 용역을 동시에 만지면 다음 경합이 생길 수 있다(`86_plan-reviewer_spec_
 * SyncDataSafety0908.md` §2 시나리오 B):
 *
 *   1. A가 층 X를 삭제한다 → 로컬에서 층 X의 도면·결함·메모·사진까지 연쇄 삭제 + tombstone
 *      기록(`deletionLog.ts`, `apps/web/src/data/idb/repo.ts::purgeFloorIn`) — **그 순간 A의
 *      로컬에 있던 것만** 기록한다
 *   2. 그 직전에 B가 (A의 삭제를 아직 못 받은 채) 층 X에 결함을 새로 만들고 먼저 동기화한다
 *   3. A가 동기화한다 → A의 tombstone이 층 X를 지운다. B가 만든 새 결함은 A가 존재조차
 *      몰랐던 것이라 tombstone 목록에 없어 서버에 살아남는다
 *   4. 결과: "층은 없는데 그 층을 가리키는 결함"이 서버·다른 기기에 남는다
 *
 * ## 무엇을 하는가 / 하지 않는가
 *
 * 이 함수는 **탐지만** 한다. 지우지도, 되살리지도 않는다 — 데이터를 잃는 쪽보다 사용자에게
 * 판단을 맡기는 쪽이 안전하다(추천안 B: "안전하고 작음. 데이터는 안 지우고 알림만").
 * 서버 쪽 연쇄 삭제(S-4, Q88 C안)는 채택하지 않았다 — 삭제 로직 확장은 되돌리기 가장 비싼
 * 영역이라 실사용에서 실제로 문제가 드러난 뒤 다시 검토한다.
 *
 * ⚠️ 순수 함수. DB·전역 상태·시간을 참조하지 않는다. `Floor`·`Defect` 타입을 직접 import 하지
 * 않고 **구조적 타이핑**으로 받는다 — `Defect` 는 `canvas-core` 소속이고 이 패키지는 그쪽을
 * import 할 수 없다(경계 규칙 8). `drawingScope.ts::floorBuildingMap` 과 같은 수법.
 */

/** 화면에 보여줄 최소 단위 — 결함 id + 그 결함이 가리키는 (존재하지 않는) 층 id */
export type OrphanDefect = {
  defectId: string;
  floorId: string;
};

/**
 * 로컬에 없는 층을 가리키는 결함을 골라낸다. **입력 순서를 보존한다.**
 *
 * @param floors  로컬에 로드된 층 목록 (보통 `loadBundle` 결과 그대로)
 * @param defects 로컬에 로드된 결함 목록
 */
export function findOrphanDefects(
  floors: readonly { id: string }[],
  defects: readonly { id: string; floorId: string }[],
): OrphanDefect[] {
  const floorIds = new Set(floors.map((f) => f.id));
  const out: OrphanDefect[] = [];
  for (const d of defects) {
    if (!floorIds.has(d.floorId)) out.push({ defectId: d.id, floorId: d.floorId });
  }
  return out;
}
