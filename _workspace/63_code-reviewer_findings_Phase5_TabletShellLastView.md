# 검수 결과 — Phase 5 T2-1(태블릿 셸) + T2-5(마지막 뷰포트 영속), 동시편집 병합 검수

검수 대상 커밋: `6c06141`(T2-1) · `c4ed288`(T2-1 로그 보강) · `9a34101`(T2-5) · `e6c1db5`(리더 재검증)
검수 시점 HEAD: `e6c1db5`
스펙: `_workspace/50_plan-reviewer_spec_Phase5_TeamSync.md` §6-2 T2-1/T2-5, D10
로그: `_workspace/61_builder_log_Phase5_TabletShell.md` · `_workspace/62_builder_log_Phase5_LastView.md`

## 판정

**통과.**

두 배치가 공유 작업트리에서 `CanvasRoute.tsx`를 동시 편집한 뒤 각자 `git hash-object` +
`git update-index --cacheinfo`로 hunk 단위 분리 커밋했다고 주장한 부분을, 현재 HEAD 파일
전체 재독 + 개별 커밋 diff 대조 + 빌드 도구 3종 재실행으로 직접 확인했다. 병합 결과에
지워지거나 잘못 덮인 코드가 없고, import 중복·누락도 없고, 훅 호출 순서도 정상이다.

## 검증한 것 (코드로 직접, builder 주장 재확인이 아니라 재수행)

1. `apps/web/src/routes/CanvasRoute.tsx` 전체(1132줄) 재독 — T2-1(useUiMode·SET_HIT_PROFILE·
   InspectorPlacement·`data-shell`)과 T2-5(`useLastView` import + 호출 1줄)가 논리적으로
   일관되게 공존. 중복 import·중복 훅 호출·죽은 코드 없음
2. `git show 6c06141 -- CanvasRoute.tsx`와 `git show 9a34101 -- CanvasRoute.tsx`를 각각 대조 —
   T2-5 커밋은 6c06141 위에 정확히 2개 지점(`import { useLastView }` 1줄, 훅 호출 1블록)만
   더한다. T2-1이 만든 194줄 diff(useUiMode 배선·InspectorPlacement 래핑·`data-shell` 속성)와
   물리적으로 겹치지 않는다 — hunk 분리 주장이 사실과 일치
3. `npm run typecheck` — 3개 워크스페이스(canvas-core·project-core·web) 오류 0 (재실행, 결과 확인)
4. `npm test` — canvas-core 392건(23파일, `lastView.test.ts` 9건·`phase5TrackA.test.ts` "A4 히트
   프로파일 주입" 포함) + project-core 308건, 700건 전부 통과 (재실행, 결과 확인)
5. `npm run build -w @onspect/web` — 성공, `dist/sw.js`·에셋 정상 산출 (재실행, 결과 확인)
6. `git status` / `git fsck --unreachable` — 작업트리 클린(무관 미추적 파일만 남음), 리라이트된
   `443a3c0`는 dangling으로만 남고 어떤 참조에도 물려 있지 않음 — git 조작(`commit-tree`·
   `reset --soft`) 자체가 히스토리를 오염시키지 않았음을 확인

## 항목별 확인

### 1. 동시편집 병합 무결성 — 통과
`import`·훅 호출·JSX 구조 전부 1회씩만 존재. `useLastView(projectId, state.canvas, send)`가
`SET_HIT_PROFILE` 이펙트 바로 뒤, 조준(D22) 블록 바로 앞이라는 T2-1 커밋의 원래 빈 줄 자리에
정확히 얹혔다(코드:60·72-73·151행). 훅 호출 순서(useState → useReducer → useEffect들)에 조건부
호출이나 순서 어긋남 없음.

### 2. T2-1 — PC 레이아웃 불변 — 통과
`styles.css` "T2-1 태블릿 셸" 절(4384~) 전체 grep 결과 선택자는 `.app[data-shell^='tablet']` /
`[data-shell='tablet-landscape']` / `[data-shell='tablet-portrait']` 3종뿐, `data-shell='pc'`에
걸리는 규칙 0개. 기존 PC 기본 규칙(`.stage__palette{right:12px;top:12px}` 635행, `.body{grid-
template-columns: var(--sidebar-w) minmax(0,1fr) var(--inspector-w)}` 132행)은 그대로 남아 있고
새 규칙은 더 높은 특이도의 속성 선택자로만 태블릿에 얹힌다.

### 3. T2-1 — `SET_HIT_PROFILE`과 canvas-core 경계 — 통과
- `store.ts` 255-257행: `SET_HIT_PROFILE`은 `AppState.hitProfile`(store 자체 상태)만 갱신
- `store.ts` 401-419행 `runInput`: `ctx.hitProfile`은 `state.hitProfile`이 있을 때만 스프레드로
  주입 — PC(`null`)면 키 자체가 안 실려 canvas-core의 `hitProfileOf(ctx) ?? DEFAULT_HIT_PROFILE`
  (`interaction.ts` 366-367행)가 마우스 기본값을 그대로 씀
- `git show --stat 6c06141`·`c4ed288`·`9a34101` 세 커밋 전부에 `packages/canvas-core/**` 경로가
  하나도 없음(뷰포트 관련 파일 제외 — 아래 6번). `ReduceContext.hitProfile` 필드 자체는 Track A
  때 이미 존재(`interaction.ts` 119행 `hitProfile?: HitProfile`) — 이번 배치는 값을 채워 넣기만 함

### 4. T2-5 — `DB_VERSION` 1 유지 — 통과
`db.ts` grep 결과 `DB_VERSION = 1`(15행) 그대로, `createObjectStore`/`createIndex` 목록에 새
스토어·인덱스 없음. `lastView.ts`는 `STORE.meta`만 `get`/`put`(64-83행) — 기존 `exportRun:`
관용구와 동일 패턴.

### 5. T2-5 — 디바운스·이탈시 플러시 — 통과
`useLastView.ts` 106-115행: 뷰포트가 바뀔 때마다 `pendingRef.current`를 **동기로** 갱신하고
600ms `setTimeout`으로 `flushLastView`를 예약. 118-130행 이탈 이펙트가 `beforeunload`·
`visibilitychange(hidden)`·언마운트(cleanup) 3경로에서 `flushLastView()`를 호출한다.
같은 컴포넌트 안 여러 `useEffect`의 클린업은 선언 순서(위→아래)대로 실행되므로, 언마운트 시
디바운스 이펙트(107행 선언, 위)의 클린업이 먼저 타이머를 지우고, 그 아래(118행 선언) 이탈
이펙트의 클린업이 `pendingRef.current`에 남아 있는 최신 값을 즉시 플러시한다 — 타이머가
지워져도 값 자체는 ref에 남아 있어 유실 없음. 코드 주석(127행)이 정확히 이 순서를 근거로 든다.

### 6. `viewport.ts`(canvas-core) — 통과
`ViewCenter`(99행)는 정규화 좌표(`cx`·`cy` = `toNorm` 결과) + `zoom`만 담아 캔버스 px 크기에
안 묶인다 — 기존 `toScreen`/`toNorm`(geometry.ts 46-52행)과 같은 정규화 공간을 그대로 재사용.
`viewCenterOf`는 `toNorm`을 그대로 호출(117행), `restoreViewEvents`가 만드는
`CENTER_ON_NORM`은 기존 `centerOn`(145-162행, `interaction.ts` 643행 핸들러)이 처리 — 새 좌표계를
만들지 않았다. `window`/`document`/`React` 참조 없음(grep 확인) — 순수 함수 유지.

### 7. 회귀 — Undo·Inspector 배치 — 위험 없음
Undo/Redo(`dispatch({t:'UNDO'})`/`REDO`)와 히스토리 스택 코드는 이번 두 배치 diff 어디에도
없음(변경 파일 목록에 `interaction.ts`·히스토리 관련 파일 없음). `InspectorPlacement`는
`sheet===false`(PC·태블릿 가로)일 때 `<>{children}</>`로 그대로 통과(`TabletSheet.tsx` 99행) —
DOM 노드 추가 없이 `<Inspector ref={inspectorRef} .../>`가 이전과 동일한 위치에 렌더되므로
`state.focusTick` 이펙트의 `inspectorRef.current?.focus()`도 영향 없음.

## 지적 사항

없음. 심각·보통·경미 어느 등급에도 해당하는 지적을 찾지 못했다.

## 불변식 검수표

| # | 불변식 | 결과 | 근거 |
|---|---|---|---|
| 1 | 좌표 0~1 정규화 | 해당 없음(이번 배치는 결함 마커 좌표를 다루지 않음) | — |
| 2 | 출력번호 미저장 | 해당 없음(이번 배치가 건드리는 스키마 없음) | — |
| 3 | 로컬 우선 쓰기 | 통과(추가 확인) | `useLastView`·`lastView.ts` 모두 서버 왕복 없이 로컬 IndexedDB만 씀. 실패는 `.catch(()=>{})`로 삼켜 UI를 막지 않음 |
| 4 | 면적 계산 | 해당 없음 | — |
| 5 | 층 정렬 | 해당 없음(이번 배치가 정렬 로직을 건드리지 않음) | — |
| 6 | 마스터+연결 | 해당 없음 | — |
| 7 | 설정 스냅샷 | 해당 없음 | — |
| 8 | isPrimary 1장 | 해당 없음(이번 배치는 사진 저장 경로를 건드리지 않음) | — |

이번 두 배치(T2-1·T2-5)는 8개 도메인 불변식의 핵심 영역(마커 좌표·번호·면적·층 정렬·마스터+연결·
설정 스냅샷·isPrimary)을 건드리지 않는다. 대신 이번 검수의 실제 초점은 **동시편집 병합
무결성**·**canvas-core 경계**·**DB_VERSION 불변**·**좌표계 일관성**이었고, 전부 위 1~6번에서
직접 확인했다.

## 확인하지 못한 것

- **실기기 동작**(회전·핀치·바텀시트 드래그·안전 영역)은 코드 검수 범위 밖 — 두 builder 로그의
  "직접 확인해주실 것" 체크리스트가 이미 이 항목들을 사용자 확인 대상으로 넘겨 놨다
- `git commit-tree`/`hash-object`/`update-index --cacheinfo`를 이용한 수동 hunk 분리 자체의
  **일반적 안전성**은 검증하지 않았다(도구 사용법 자체는 검수 대상이 아님) — 다만 그 결과물인
  현재 HEAD 상태가 논리적으로 올바른지는 위에서 코드로 직접 확인했다
- T2-6(`SET_SAFE_INSETS` 배선)·T2-3·T2-4·T2-7은 이번 범위가 명시적으로 아니며 미구현 상태
  그대로 확인됨(로그의 "알려진 한계"와 일치) — 별도 배치 소관
