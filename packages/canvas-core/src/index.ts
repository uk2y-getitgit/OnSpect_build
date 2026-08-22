/**
 * @onspect/canvas-core — 플랫폼 독립 캔버스 코어 (D1).
 *
 * 경계 규칙 (스펙 §2-11):
 *   1. window · document · Image · requestAnimationFrame · performance 를 참조하지 않는다
 *   2. 실제 그리기를 하지 않는다. 직렬화 가능한 DrawOp[] 만 만든다
 *   3. 이미지 객체를 모른다. imageWidth / imageHeight 숫자만 받는다
 *   4. React 를 import 하지 않는다
 *   5. 어댑터가 코어 상태를 직접 mutate 하지 않는다
 *   6. 입력은 정규화된 InputEvent 로 받는다
 *   7. 모든 좌표 인자는 스크린 CSS px. DPR 곱셈은 어댑터에서만
 *
 * RN 전환 시 그대로 재사용한다.
 */
export * from './constants.js';
export * from './types.js';
export * from './geometry.js';
export * from './viewport.js';
export * from './visibility.js';
export * from './style.js';
export * from './completeness.js';
export * from './shapes.js';
export * from './memoGeom.js';
export * from './defectGeom.js';
export * from './hitTest.js';
export * from './snapAlign.js';
export * from './snapAngle.js';
export * from './snapResolve.js';
export * from './commands.js';
export * from './renderModel.js';
export * from './interaction.js';
