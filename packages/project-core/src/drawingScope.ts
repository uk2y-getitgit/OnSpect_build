/**
 * 도면 범위 좁히기 — D45 A-1 (2026-09-08).
 *
 * ## 왜 필요한가
 *
 * 캔버스의 [도면 크기] → `모든 도면에 같은 배율 적용` 은 **용역 전체 도면**을 대상으로 삼았다.
 * 배율을 바꾸면 그 도면의 **결함·메모 좌표까지 함께 옮겨지므로**(D37), A동을 만지다가
 * B동 도면과 그 위의 모든 표기가 통째로 밀린다. 되돌리려면 동마다 원래 배율로 다시 맞춰야
 * 하는데 좌표 이동은 왕복해도 부동소수 오차가 남는다 — 사고 비용이 크다.
 *
 * 그래서 일괄 적용 대상을 **지금 보고 있는 동의 도면**으로 좁힌다(D45 A · U82: 교체).
 *
 * ## 왜 `apps/web` 이 아니라 여기인가
 *
 * `apps/web` 에는 테스트 러너가 없다(`photoTransform.ts` 와 같은 이유). 대상 선정이 틀리면
 * 다른 동의 좌표가 조용히 밀리는 **되돌리기 어려운 사고**라 반드시 단위 테스트로 고정한다.
 * 웹 쪽은 `apps/web/src/data/drawingScale.ts` 가 이 함수를 다시 내보내
 * 호출부(`CanvasRoute`)의 import 경로는 배율 계산과 한 곳으로 유지한다.
 *
 * ⚠️ 순수 함수. DB·전역 상태·시간을 참조하지 않는다.
 */
import type { Drawing } from './types.js';

/**
 * 같은 동에 속한 도면만 고른다. **입력 순서를 그대로 보존한다** —
 * 호출부(`computeScale`)가 스냅샷 순서대로 순회하며 토스트 건수를 세기 때문이다.
 *
 * @param drawings        후보 도면 (보통 용역 전체 스냅샷)
 * @param floorBuildingId 층 id → 동 id
 * @param buildingId      기준 동 id. 빈 문자열이면 **아무것도 고르지 않는다** —
 *                        동을 모르는 상태에서 전체를 대상으로 삼는 것이 이 함수가 막으려는 사고다
 *
 * 층이 맵에 없는 도면(층이 지워졌는데 도면이 남은 경우 등)은 **제외한다.**
 * 동을 알 수 없는 도면을 일괄 대상에 넣으면 어느 동의 좌표가 움직였는지 설명할 수 없다.
 */
export function drawingsInBuilding(
  drawings: readonly Drawing[],
  floorBuildingId: ReadonlyMap<string, string>,
  buildingId: string,
): Drawing[] {
  if (buildingId === '') return [];
  return drawings.filter((d) => floorBuildingId.get(d.floorId) === buildingId);
}

/** 층 목록 → `floorId → buildingId` 맵. 위 함수의 두 번째 인자를 만드는 유일한 경로 */
export function floorBuildingMap(
  floors: readonly { id: string; buildingId: string }[],
): Map<string, string> {
  return new Map(floors.map((f) => [f.id, f.buildingId]));
}
