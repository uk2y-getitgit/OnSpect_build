# 구현 로그 — T2-1 태블릿 셸 (방향 감지 · 터치 프로파일 주입 · 좌측 세로 툴바)

스펙: `_workspace/50_plan-reviewer_spec_Phase5_TeamSync.md` §4-2/§4-3/§6-2(T2-1) · D10

## 시작 상태에 대한 메모

이 작업을 시작했을 때 공유 작업트리(`main`)에 **T2-1 이 이미 코드 수준에서 거의 완성돼
있었다** — `_workspace/TASKS.md` 에 `T2-1-B`·`T2-5-B` 가 둘 다 `🟦 진행중`으로 기록돼 있었고,
로그(`61_builder_log_*`)는 아직 없었다. 커밋도 안 돼 있었다. 즉 이전 세션이 두 작업을 함께
진행하다가 로그·커밋 없이 끊긴 상태였다.

이번 지시는 **T2-1 만** 범위이고 T2-5(뷰포트 영속)는 "다른 배치가 병행 중일 수 있음"으로
명시적으로 범위 밖이었다. 두 작업이 `CanvasRoute.tsx` 한 파일 안에 섞여 있었으므로,
**그 파일만 hunk 단위로 골라 스테이징**해 T2-5 관련 3줄(`import` 1줄 + 주석·훅 호출 6줄)은
커밋에서 뺐다. 작업트리 파일 자체는 건드리지 않았다 — T2-5 를 담당하는 다른 배치가 그대로
이어받을 수 있도록. (`git hash-object` 로 T2-1 만 남긴 블롭을 만들어 `git update-index` 로
해당 파일만 스테이징 — `store.ts`·`styles.css`·`shell/*.tsx` 는 처음부터 T2-1 전용이라 그대로 add)

**커밋하지 않은 것** (T2-5, 다른 배치 소관 — 작업트리에 그대로 남겨 둠):
`apps/web/src/data/idb/repo.ts`(getLastView/putLastView) · `packages/canvas-core/src/viewport.ts`
(viewCenterOf/restoreViewEvents) · `apps/web/src/data/idb/lastView.ts` · `apps/web/src/data/useLastView.ts` ·
`packages/canvas-core/test/lastView.test.ts` · `CanvasRoute.tsx` 안의 `useLastView` import·호출 3줄.

## 완료

| 작업 | 파일 | 상태 |
|---|---|---|
| 방향 감지(가로/세로) + 터치 판정(강제전환 `data-ui-mode` 우선, 실기기 `(hover:none)&(pointer:coarse)`) | `apps/web/src/shell/useUiMode.ts`(신규) | 완료 — `U-4` 절과 동일 규칙 재사용, `MutationObserver`로 강제전환 속성 변화도 구독 |
| 결함정보 패널 배치 전환 (가로=우측 열 그대로 / 세로=바텀시트 3단) | `apps/web/src/shell/TabletSheet.tsx`(신규) `InspectorPlacement` | 완료 — `<Inspector>` 는 재사용, 자리만 갈아끼움. `sheet===false`면 Fragment로 그대로 통과(DOM 불변) |
| 터치 히트 프로파일 주입 배선 (store 액션 + reduceCtx) | `apps/web/src/store.ts`(`SET_HIT_PROFILE` 액션·상태) · `apps/web/src/routes/CanvasRoute.tsx`(`reduceCtx.hitProfile`) | 완료 — `TOUCH_HIT_PROFILE`(44pt) 은 태블릿에서만 주입, PC 는 `null`→코어 기본값(마우스) |
| 좌측 세로 툴바 (엄지 자리) | `apps/web/src/styles.css` "T2-1 태블릿 셸" 절 | 완료 — `.app[data-shell^='tablet'] .stage__palette`로 `right→left`, 세로 중앙 정렬. PC 기본 CSS(`.stage__palette{right:12px}`)는 안 건드림 |
| `.app[data-shell]` 속성 배선 | `CanvasRoute.tsx` 루트 div | 완료 — `pc`/`tablet-landscape`/`tablet-portrait` 3값, `pc`엔 CSS 규칙 0개 |
| 가로 태블릿 = 우측 사이드시트 폭 확장(400pt, D10) | `styles.css` `.app[data-shell='tablet-landscape']{--inspector-w:400px}` | 완료 |

`ToolPalette.tsx` 컴포넌트 자체는 **수정하지 않았다** — 배치는 순수 CSS 로만 바뀐다(지시사항
"패널 자체를 새로 만들지 마라, 배치만 바꾼다"와 동일한 원칙을 툴바에도 적용). `canvas-core` 는
이번 작업으로 한 줄도 바뀌지 않았다 — `ReduceContext.hitProfile` 은 트랙 A 에서 이미 있었고,
apps/web 쪽에서 값을 채워 넣기만 했다.

## 미완료 / 막힌 것

없음. 지시된 4개 요구사항(방향 감지·터치 프로파일 주입·좌측 세로 툴바·터치 전용 판정 패턴)
전부 코드로 확인됨.

## 검증한 것

- **타입 검사**: `npm run typecheck` (canvas-core·project-core·web 3개 워크스페이스) — 오류 0
- **단위 테스트**: `npm test` — canvas-core 392개(23개 파일) · project-core 308개(15개 파일), 전부 통과.
  ⚠️ canvas-core 392개 중 `lastView.test.ts`(9개)는 **T2-5(범위 밖)** 소관이며 이번 커밋에는
  포함되지 않는다 — 작업트리에 남아 있어 실행 결과에는 잡혔을 뿐이다. T2-1 자체가 새로 추가한
  테스트는 없다(canvas-core `ReduceContext.hitProfile` 배선은 트랙 A 때 이미 테스트됨,
  `phase5TrackA.test.ts` "A4 · 히트 프로파일 주입" 참고). apps/web 은 테스트 러너가 없어
  타입 검사로만 검증(`NEXT.md` 기존 방침 그대로)
- **프로덕션 빌드**: `npm run build` — 통과. `sw.js`·`assets/*` 정상 산출
- **PC 레이아웃 불변 코드 점검**:
  - `styles.css` "T2-1 태블릿 셸" 절 전체가 `.app[data-shell^='tablet']` / `[data-shell='tablet-landscape']` /
    `[data-shell='tablet-portrait']` 셀렉터로만 걸려 있다. `data-shell='pc'` 에 걸리는 규칙은 0개
    (직접 grep 확인)
  - `useUiMode()` 는 `mode==='pc'` 면 `shell`이 `'pc'` 고정, `tablet===false` → `hitProfile` 은
    `SET_HIT_PROFILE` 로 항상 `null` 주입 → 코어가 `DEFAULT_HIT_PROFILE`(마우스)을 그대로 씀
  - `InspectorPlacement`: `sheet===false`(PC·태블릿 가로)면 `children`을 Fragment로 그대로
    반환 — DOM 노드가 늘지 않는다(코드 확인, `TabletSheet.tsx` 92~106행)
  - `ToolPalette.tsx` 자체 미변경 확인(diff 없음)

## 직접 확인해주실 것

`/tablet` (또는 `?ui=tablet`) 강제 전환으로 PC 브라우저에서도 확인 가능. 실기기는 아래 전부.

- [ ] 태블릿을 **가로**로 들면: 결함을 찍고 선택 → 결함정보 패널이 **우측에 그대로**(PC와 같은 구조,
      폭만 넓어짐) 뜨는가
- [ ] 태블릿을 **세로**로 들면: 결함 선택 → 화면 **하단에서 바텀시트**가 올라오는가(PEEK→HALF→FULL
      3단, 손잡이를 위아래로 끌면 따라오는가)
- [ ] 세로에서 시트 밖 도면을 탭하면 시트가 **PEEK**(요약 한 줄)로 내려가는가(닫히지는 않는가)
- [ ] 새 결함을 찍으면 시트가 **HALF**로 자동으로 올라오는가
- [ ] 좌측 **세로 툴바**가 엄지가 닿는 화면 왼쪽 중앙에 있는가(가로·세로 둘 다)
- [ ] 손가락으로 결함 마커·화살표·번호풍선을 눌러 선택할 때 **PC보다 넉넉하게** 잡히는가(44pt
      허용치 — 좁은 표기를 손가락 끝으로 겨우 안 눌러도 선택되는지)
- [ ] **PC(마우스) 화면은 이번 변경으로 전혀 달라진 게 없는가** — 툴 팔레트가 여전히 우측 상단,
      결함정보 패널이 우측 열, 히트 판정이 예전과 동일(좁은 표기를 대충 눌러도 안 잡히는 게 정상)
- [ ] 회전 중(가로↔세로) 시트가 튀거나 레이아웃이 깨지지 않는가

## 알려진 한계

- `TOUCH_HIT_PROFILE`(44pt·pad 22·handle 30 등)은 실기기 라운드에서 조정할 자리로 스펙에
  이미 명시돼 있다(트랙 A 로그 참고) — 이번 라운드에서 숫자를 바꾸지 않았다
- 세로 바텀시트의 `SET_SAFE_INSETS` 배선(안전 영역 — 시트가 도면 하단을 가리는 문제)은
  **T2-6 범위**로 스펙에 명시돼 있어 이번에 손대지 않았다. 지금은 시트가 열려 있는 동안
  캔버스 안전영역이 시트 높이만큼 줄지 않는다(다음 배치 소관)
- 층 칩 스트립(T2-3)·미니맵(T2-4)·결함 폼 터치 프로파일(T2-7)은 이번 범위가 아니다

## 커밋

`main` 브랜치. 공유 작업트리라 파일을 정확히 지정해 스테이징했다(위 "시작 상태에 대한 메모"
참고) — `CanvasRoute.tsx`는 T2-1 hunk만 골라 담은 블롭으로 스테이징했고, T2-5 관련 파일
(`repo.ts`·`viewport.ts`·`lastView.ts`·`useLastView.ts`·`lastView.test.ts`)과 이번 작업과
무관한 미추적 파일(`_workspace/00_input/scope_UIPolish0902.md`, `54~60` 검수 로그 등, 사용자
루트의 `Onspect 수정사항*.txt`)은 커밋에서 제외했다.
