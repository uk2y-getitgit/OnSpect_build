/**
 * 3컬럼이 공유하는 조작 창구. 컬럼은 저장소를 모른다 —
 * **순수 함수로 다음 문서를 만들고 `apply` 로 올릴 뿐이다** (불변식 #3: UI 는 저장을 기다리지 않는다).
 */
import type { ItemKind, ItemSettings } from '@onspect/project-core';

export type SettingsApi = {
  settings: ItemSettings;
  /**
   * 메모리 즉시 반영 → 250ms 디바운스 후 `put`.
   * `undo` 문구를 주면 되돌리기 토스트를 함께 띄운다 (ui-quality §4 — 삭제는 되돌릴 수 있어야 한다).
   */
  apply: (next: ItemSettings, undo?: { message: string }) => void;
  /** 안내 토스트 (되돌리기 없음) */
  notify: (text: string, kind?: 'info' | 'warn') => void;
  /** 마스터 완전 삭제는 **사용처 건수를 보여주는 확인 다이얼로그**를 거친다 (§2-5-d) */
  askDeleteMaster: (kind: ItemKind, id: string, name: string) => void;
  newId: () => string;
  now: () => number;
};
