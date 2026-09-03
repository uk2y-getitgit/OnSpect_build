# 구현 로그 — B2(스타일 소스 통일) · B3(캔버스 라우트 묶음)

브랜치 `feat/ui-behavior-0903` · 2026-09-03 · builder

---

## B2 — C-2 결함 이동 스냅 (스타일 소스 통일)

### 무엇이 갈라져 있었나

렌더(`CanvasRoute.tsx:474`)만 `Drawing.labelScale` 을 반영한 `balloonRadius`(34×s)를 썼고,
리듀서(`store.ts:407`) · 파생 계산(`CanvasRoute.tsx:414`) · 툴바 위치(`:642`)는
`DEFAULT_GLOBAL_STYLE`(34) 을 **하드코딩**했다. 그래서 풍선을 키우면
히트 반경 · 자동배치 라벨 거리 · 드래그 시작 오프셋 · 정렬 스냅 후보가 전부 34 기준으로 남았다.

### 완료

| 작업 | 파일 | 상태 |
|---|---|---|
| `globalStyleForLabelScale(scale)` 신설 — 계산 단일 소스 | `apps/web/src/canvas/labelStyle.ts` (신설) | 완료 |
| `locationMap.globalStyleFor` → 위임 전환 (계산 3벌 → 1벌) | `apps/web/src/export/locationMap.ts` | 완료 |
| `AppState.labelScale: number`(기본 1) 신설 | `apps/web/src/store.ts` | 완료 |
| `SET_LABEL_SCALE` 액션 신설 (같은 값이면 상태 유지) | `store.ts` | 완료 |
| `SET_FLOOR` 페이로드에 `labelScale` 추가 — 도면 전환과 **같은 액션**에서 갱신 | `store.ts` · `CanvasRoute.tsx:292` | 완료 |
| `runInput` 의 `globalStyle` → `globalStyleForLabelScale(state.labelScale)` | `store.ts:407` | 완료 |
| `reduceCtx.globalStyle` → 렌더와 같은 memo 재사용 | `CanvasRoute.tsx:414` | 완료 |
| `toolbarAt` 의 `buildScreens` → 같은 memo 재사용 | `CanvasRoute.tsx:642` | 완료 |
| `globalStyle` memo 를 `reduceCtx` 앞으로 이동 + `labelStyle.ts` 위임 | `CanvasRoute.tsx` | 완료 |
| 회귀 고정 테스트 4건 | `packages/canvas-core/test/labelScaleSource.test.ts` (신설) | 완료 |

### 핵심 보증 (U47)

`globalStyleForLabelScale(1 | null | undefined)` 는 **`DEFAULT_GLOBAL_STYLE` 과 같은 객체 참조**를
돌려준다. 따라서 배율을 건드린 적 없는 도면에서는 `useMemo` 의존성이 한 번도 바뀌지 않고,
리듀서 컨텍스트도 예전과 동일한 객체를 받는다 → **동작·성능 변화 0**.

### 판단 기록

- `SET_FLOOR` 를 태우는 `useEffect` 의 의존성에 `labelScale` 을 **넣지 않았다.**
  `SET_FLOOR` 는 `SET_DRAWING` 을 태워 뷰포트를 다시 맞추므로, `+`/`−` 를 누를 때마다
  화면이 리셋된다. 배율만 바뀐 경우는 별도 `SET_LABEL_SCALE` 이펙트가 처리한다.
- 스펙은 "`LOAD` 액션 payload 에 실어 도면 전환 시 갱신" 이라고 썼지만,
  `LOAD` 는 프로젝트 로드용이고 **도면을 모른다**(도면은 그 뒤 `SET_FLOOR` 가 건다).
  그래서 `SET_FLOOR` + `SET_LABEL_SCALE` 조합으로 구현했다. 의도(전환 시 갱신)는 동일하다.

---

## B3 — P-1 · T-9 · T-8 + C-2 배선

(아래 §B3 참조)
