/**
 * 동기화 충돌 판정 (LWW) — Phase 5 스펙 §3-7.
 *
 * ⭐ **정본은 이 함수 하나다.** push 가드(서버가 더 최신인데 덮어쓰는 사고 방지)와
 *    pull 적용이 서로 다른 규칙을 쓰면, 두 기기가 서로를 영원히 덮어쓰는 핑퐁이 난다.
 *    복제하지 말고 이것만 불러라 (`apps/web/src/data/sync.ts`).
 *
 * ⚠️ **필드 단위 병합을 하지 않는다** (§3-7). "폭은 A가, 길이는 B가" 식 병합은
 *    화면에 없는 제3의 상태를 만든다. 이긴 쪽 레코드를 **통째로** 쓴다.
 *    이 파일이 돌려주는 것도 "어느 쪽이 이겼는가" 라는 boolean 하나뿐이다.
 *
 * 순수 함수다 — 부수효과·저장소 접근이 없다(경계 규칙 9).
 */

/** LWW 판정에 쓰이는 재료. 로컬은 `updatedAt`이 `null`일 수 있다(D23) */
export type MergeSide = {
  /**
   * epoch ms. `null` = **한 번도 동기화된 적 없는 옛 결함**(D23).
   * 서버에 같은 id 가 이미 있다면 그쪽이 원본이다 — "먼저 올린 쪽이 원본".
   */
  updatedAt: number | null;
  deviceId: string;
};

export type ServerSide = { updatedAt: number; deviceId: string };

/**
 * 로컬이 이기는가?
 *
 *   1. `updatedAt` 이 큰 쪽이 이긴다
 *   2. 동률이면 `deviceId` **사전순으로 큰 쪽**이 이긴다 (§3-7 "결정론")
 *   3. 로컬 `updatedAt === null` 이면 무조건 진다 (D23)
 *
 * 2번의 방향(큰 쪽/작은 쪽)은 어느 쪽이든 상관없지만 **한 곳에서만 정의해야** 한다.
 * 양쪽 기기가 같은 코드를 돌리므로 같은 답이 나오고, 그래서 수렴한다.
 */
export function localWins(local: MergeSide, server: ServerSide): boolean {
  if (local.updatedAt === null) return false;
  if (local.updatedAt !== server.updatedAt) return local.updatedAt > server.updatedAt;
  return local.deviceId > server.deviceId;
}

/** 두 쪽이 완전히 같은 판(= 올릴 것도 받을 것도 없다)인가 */
export function sameRevision(local: MergeSide, server: ServerSide): boolean {
  return local.updatedAt === server.updatedAt && local.deviceId === server.deviceId;
}
