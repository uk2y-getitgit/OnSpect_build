/**
 * @onspect/project-core — 용역 · 동 · 층 · 도면 도메인 코어 (순수 TS).
 *
 * 경계 규칙 (S1 스펙 §2-12):
 *   8.  `canvas-core` 를 import 하지 않는다. **역방향도 금지.** 두 코어는 서로를 모른다
 *   9.  `IDBDatabase` · `File` · `Blob` · `URL` 을 참조하지 않는다
 *   10. 이미지 디코드·래스터화는 웹 어댑터 전용이다
 *   11. `canvas-core` 는 `Drawing` 타입을 모른다 — `DrawingRef` 만 받는다
 *
 * RN 전환 시 그대로 재사용한다. 저장소 구현만 갈아끼운다.
 */
export * from './types.js';
export * from './a4.js';
export * from './displayName.js';
export * from './floorOrder.js';
export * from './fileNameParse.js';
export * from './relativeTime.js';
export * from './validate.js';
export * from './repo.js';
export * from './projectDecor.js';
export * from './photo.js';
export * from './photoExif.js';
export * from './photoTransform.js';
export * from './items/index.js';
export * from './export/index.js';
