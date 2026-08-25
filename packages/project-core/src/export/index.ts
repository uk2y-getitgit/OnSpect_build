/**
 * 출력(Phase 4) 공통 기반 — 순수 TS.
 *
 * 규칙:
 *   · **번호는 `numbering.ts` 하나에서만 계산한다.** 산출물이 각자 세지 않는다
 *   · `canvas-core` · DOM · IndexedDB · 시간 · 난수를 참조하지 않는다
 *   · 파일 생성(엑셀·PNG·인쇄)은 `apps/web/src/export/*` 어댑터의 몫이다
 */
export * from './numbering.js';
export * from './params.js';
export * from './damageTable.js';
export * from './defectList.js';
export * from './photoBook.js';
