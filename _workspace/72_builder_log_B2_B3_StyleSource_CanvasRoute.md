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

### 완료

| 작업 | 파일 | 상태 |
|---|---|---|
| **P-1** `applyScale` 를 공용 모듈로 승격 (`applyDrawingScale`) | `apps/web/src/data/drawingScale.ts` (신설) | 완료 |
| **P-1** `ProjectSetup.applyScale` → 위임 (계산 1벌) | `routes/ProjectSetup.tsx` | 완료 |
| **P-1** 캔버스 상단바에 `[도면 크기]` 버튼 + `DrawingScaleDialog` 재사용 | `routes/CanvasRoute.tsx` | 완료 |
| **T-9** 미니맵 렌더 제거 (`Minimap.tsx` 파일은 보존) | `routes/CanvasRoute.tsx` | 완료 |
| **T-8** 롱프레스 리사이즈 (1000ms · 8px · 12px 띠 · 260~min(vw×0.6,560)) | `routes/CanvasRoute.tsx` · `styles.css` | 완료 |
| **T-8** 폭 `localStorage` 저장 (`onspect.inspectorW`) | `routes/CanvasRoute.tsx` | 완료 |
| **T-8** 패널 내부 반응은 **CSS 컨테이너 쿼리만** (JS 리렌더 0) | `styles.css` | 완료 |

### P-1 — 무엇이 달라지나

- 캔버스 상단 도구줄에 `[도면 크기]` 버튼이 생긴다. 누르면 **도면관리에 있던 그 다이얼로그**
  (range 슬라이더 + 프리셋 6 + 경고 문구)가 그대로 뜬다. 새로 만든 UI 가 아니다.
- 적용 계산은 `data/drawingScale.ts` **한 벌**이다. 두 진입점이 같은 `imgLayout` 을 만든다.
- `imgLayout` 이 없는 옛 도면은 지금과 똑같이 거부한다 —
  `"이 도면은 A4 정규화 전에 등록되었습니다. 먼저 [A4로 맞추기]를 해주세요"`.
  **여기서 자동으로 `renormalizeAll` 을 돌리지 않는다** (돌리면 기존 결함 좌표가 전부 옮겨진다).
- 실시간 미리보기 없음 — 다이얼로그가 `[적용]` 을 눌러야 `onApply` 를 부른다(원래 그랬다).
  래스터 합성(`composeA4`)이 슬라이더 tick 마다 돌지 않는다.
- **저장 필드 변경 0 · `DB_VERSION` 1 유지 · 좌표 불변식 무영향.**

### T-9 — 무엇이 달라지나

태블릿에서 우하단 미니맵이 더 이상 뜨지 않는다. `shell/Minimap.tsx` 는 그대로 있고,
`CanvasRoute` 의 그 자리에 되살리는 방법을 주석으로 남겼다. 코어(`CENTER_ON_NORM`)는 무변경.

### T-8 — 무엇이 달라지나

**가로 태블릿에서만** 결함정보 패널 왼쪽 경계에 12px 투명 띠가 생긴다.
- 그냥 스치면 아무 일도 없다 (평소 화면 변화 0)
- 그 자리를 **1초** 누르고 있으면 경계선이 파랗게 굵어지고 진동이 온다 → 리사이즈 모드
- 그대로 좌우로 끌면 패널 폭이 실시간으로 바뀐다 (260px ~ min(화면폭×0.6, 560px))
- 손을 떼면 폭이 `localStorage['onspect.inspectorW']` 에 저장된다. 다음에 열면 그 폭이다
- 1초 전에 8px 넘게 움직이면 진입 취소
- 드래그 중에는 React 상태를 갈지 않는다 — DOM 의 `--inspector-w` 만 직접 쓴다.
  놓는 순간 딱 한 번 상태·저장으로 확정한다 (U51)
- 패널 내부(버튼 그리드·프리셋·사진 타일)는 `@container inspector` 로 CSS 만 반응한다

**PC 는 DOM 도 CSS 도 예전 그대로다** — 띠는 `tablet && !sheetMode` 일 때만 렌더되고,
컨테이너 쿼리는 `.app[data-shell='tablet-landscape']` 안에서만 산다.

---

## 검증한 것

| 항목 | 결과 |
|---|---|
| `npm run typecheck` (canvas-core · project-core · web) | 통과 |
| `npm test` | canvas-core 25 파일 · project-core 16 파일 **전부 통과** (신규 4건 포함) |
| `npm run build` (프로덕션) | 통과 (252 모듈) |
| `DB_VERSION` | `apps/web/src/data/idb/db.ts:15` = **1** (변경 없음) |
| 마이그레이션 | 0건. 저장 스키마 변경 0 |

**미검증(코드로 확인 불가):** 롱프레스 체감·진동·60fps, 도면 크기 다이얼로그의 실제 합성 결과.
→ 아래 `## 직접 확인해주실 것`.

## 세운 가정

| # | 가정 | 이유 |
|---|---|---|
| B2-a | `LOAD` 가 아니라 `SET_FLOOR` 페이로드 + `SET_LABEL_SCALE` 액션으로 `labelScale` 을 갱신 | `LOAD` 는 도면을 모른다(도면은 그 뒤 `SET_FLOOR` 가 건다). 의도(전환 시 갱신)는 동일 |
| B2-b | `SET_FLOOR` 이펙트 의존성에 `labelScale` 을 넣지 않음 | `SET_FLOOR` 는 `SET_DRAWING` 을 태워 뷰포트를 재조정한다. 넣으면 `+`/`−` 마다 화면이 리셋된다 |
| B3-a | T-8 은 **가로 태블릿 전용** | 세로는 바텀시트라 폭 개념이 없고, PC 는 요구가 없다. PC 동작 변화 0 을 보장하는 가장 싼 방법 |
| B3-b | 롱프레스가 취소된 제스처는 **캔버스 팬으로 넘기지 않는다** | 이미 발생한 `pointerdown` 을 다른 요소로 재전달할 방법이 없다. 합성 이벤트 전달은 취약하다. 12px 띠 안에서만 생기는 손실 |
| B3-c | 컨테이너 쿼리 임계값 `380px` (버튼 96px · 프리셋 60px · 사진 타일 112px) | 기본 폭 320px 에서는 아무것도 안 바뀌고, 넓힌 뒤에만 손가락 타깃이 커진다 |

## 직접 확인해주실 것

| # | 무엇을 | 어떻게 | 무엇이 보여야 정상 |
|---|---|---|---|
| 1 | **C-2 히트 영역** | 캔버스 상단 `번호 크기` 를 `150%` 로 키우고, 커진 풍선의 **가장자리**를 누른다 | 잡힌다. 예전에는 중앙 34px 안쪽만 잡혔다 |
| 2 | **C-2 드래그 시작 점프** | 한 번도 옮기지 않은 번호 풍선(`placed=false`)을 `150%` 에서 잡는다 | 잡는 순간 풍선이 튀지 않는다 |
| 3 | **C-2 정렬 스냅** | 배율을 키운 상태에서 풍선을 옆 풍선의 세로줄에 맞춰 끈다 | 가이드선이 뜬 그 줄에 풍선이 **실제로 붙는다** |
| 4 | **C-2 회귀** | 배율 `100%` 인 도면에서 평소처럼 결함 찍기·이동·스냅 | 예전과 완전히 동일 (한 픽셀도 안 바뀌어야 한다) |
| 5 | **P-1 진입점** | 캔버스 상단 `[도면 크기]` → 슬라이더/프리셋으로 `120%` 적용 | 도면 그림만 커지고 **결함 표기 위치는 그대로** |
| 6 | **P-1 두 진입점 일치** | 같은 도면을 도면관리 `[크기]` 로 열어 본다 | 방금 준 값(120%)이 그대로 보인다 |
| 7 | **P-1 옛 도면 거부** | A4 정규화 전에 등록한 도면에서 `[도면 크기]` 적용 | `"먼저 [A4로 맞추기]를 해주세요"` 경고 토스트. 결함이 움직이지 않는다 |
| 8 | **T-9** | 태블릿에서 캔버스를 본다 | 우하단 미니맵이 없다 |
| 9 | **T-8 진입** | 가로 태블릿에서 결함정보 패널 왼쪽 경계를 **1초** 누른다 | 경계선이 파랗게 굵어지고 진동. 그 뒤 끌면 폭이 따라온다 |
| 10 | **T-8 취소** | 같은 자리를 누르자마자 빠르게 쓸어 넘긴다 | 리사이즈 모드로 들어가지 않는다 |
| 11 | **T-8 저장** | 폭을 바꾸고 새로고침 | 바꾼 폭이 그대로 |
| 12 | **T-8 한계** | 아주 좁게 / 아주 넓게 끝까지 끌어본다 | 260px 아래로, 화면폭 60%(최대 560px) 위로 안 간다 |
| 13 | **T-8 PC 무영향** | PC 에서 패널 경계 근처를 눌러본다 | 아무 일도 없다 (띠 자체가 없다) |

## 알려진 한계 · 기록만 (고치지 않음)

- `defectGeom.ts:366` 의 `balloonR = style.balloonRadius * vp.zoom` 은 **클램프가 없다.**
  `renderModel.ts:398` 은 `Math.max(4, s.balloonR)` 하한을 쓴다 → 아주 축소했을 때 기준이 갈린다.
  히트에는 `HIT_MIN_LABEL_PX` 하한이 따로 있어 실무 영향은 작다. 스펙도 "이번 범위 밖" 으로 뒀다.
- 롱프레스가 취소된 제스처는 캔버스 팬으로 이어지지 않는다 (가정 B3-b).
