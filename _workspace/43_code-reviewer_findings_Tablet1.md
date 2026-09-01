# 검수 결과 — 태블릿 피드백 배치1 (T-3 · T-4 · T-5 · T-6)

- **스펙:** `_workspace/00_input/scope_TabletFeedback0901.md`
- **구현 로그:** `_workspace/41_builder_log_Tablet1.md`
- **검수 대상 커밋:** `14302a7` (코드) · `4199492` (로그)
- **검수 방법:** `git show 14302a7` 로 이 커밋이 실제로 바꾼 6개 파일만 열었다.
  워크트리는 검수 시점에 `27c4b83`(배치2 T-1·T-2)까지 커밋된 상태였고,
  검수 대상 5개 파일은 HEAD 와 diff 0 (배치2 변경과 섞이지 않았다).
  `packages/canvas-core/*` 는 **읽기만** 했고 아무것도 고치지 않았다(경계 확인 목적).

## 판정

**조건부 통과** — 심각 **0** · 보통 **2** · 경미 **3**

T-5·T-6 은 스펙 그대로다. T-4 는 판정 로직에 반례가 있고(보통1), T-3 은 부작용이 하나 있다(보통2).
둘 다 데이터·번호·좌표와 무관해 심각은 아니지만, 보통1 은 **T-4 가 없애려던 바로 그 화면**이
흔한 조작(찍고 → 도면 밀기)에서 다시 나타나므로 배치3 전에 고치는 것이 옳다.

---

## 지적 사항

### [보통 1] T-4 — 생성 직후 도면을 팬(또는 핀치)하면 방금 찍은 결함의 편집 툴바가 다시 뜬다

- 파일: `apps/web/src/store.ts:406-426` (`EXPLICIT_SELECT_EVENTS` · `nextToolbarFor`)
- 문제: `nextToolbarFor` 가 `POINTER_DOWN` 을 **무조건** "사용자가 직접 고름" 으로 친다.
  그 `POINTER_DOWN` 이 **무엇을 눌렀는지**(선택된 결함을 잡았는지 / 빈 도면을 눌러 팬을 시작했는지)를
  전혀 보지 않는다. 그래서 이미 선택돼 있던 결함이 무엇이든 — 방금 만들어 툴바를 일부러 숨겨 둔
  결함이라도 — 다음 `POINTER_DOWN` 한 번이면 툴바 권한을 얻는다.

- 재현 (태블릿, 점 도구):
  1. 빈 도면을 탭해 결함 X 를 만든다.
     `POINTER_UP → createDefectAt → CREATE_DEFECT` → `created=true` → `toolbarFor=null`. 툴바 없음 ✔
  2. 다음 위치로 가려고 **한 손가락으로 도면을 민다(팬)**.
     - `POINTER_DOWN`: `interaction.ts:995` `hit===null` → `startPan(true)`.
       **선택은 그대로 X** (빈 곳 탭의 선택 해제는 `POINTER_UP` 의 `!moved` 분기 `interaction.ts:1602`
       에서만 일어난다). `nextToolbarFor` → `POINTER_DOWN ∈ EXPLICIT_SELECT_EVENTS` → **`toolbarFor = X`**
     - 드래그 중에는 `CanvasRoute.tsx:530` 의 `state.canvas.drag` 가드로 가려져 안 보인다
     - `POINTER_UP`(`moved=true`): `interaction.ts:1597` `ok(cleared)` — 커맨드 없음, 선택 X 유지.
       `POINTER_UP` 은 명시 이벤트가 아니라 **직전 판정 유지** → `toolbarFor` 는 여전히 X,
       `drag` 는 null → **툴바가 방금 찍은 결함 X 위에 뜬다**
  3. 즉 "찍는다 → 도면 민다 → 다음을 찍는다" 라는 T-4 가 겨냥한 바로 그 연속 작업에서 툴바가 돌아온다.

- 같은 원인의 다른 경로:
  - **핀치줌**(배치2 배선 이후): 두 번째 손가락의 `POINTER_DOWN` 은 `interaction.ts:924` 에서
    `cancelDrag` 로 **드래그를 지우고** 리턴한다. 선택은 유지 → `toolbarFor = X` 가 되고 `drag` 가
    null 이라 **핀치하는 내내 툴바가 떠 있다.**
  - `WHEEL`(PC 휠 줌)은 명시 이벤트가 아니라 안전하다 — 문제는 `POINTER_DOWN` 한정이다.

- 수정 (권장): `POINTER_DOWN` 만 "그 결함을 실제로 건드렸는가" 를 추가로 본다.
  드래그의 `defectId` 가 스토어에서 그대로 읽히므로 새 정보가 필요 없다
  (`newDrag` 기본값 `defectId: null` — `PAN`·`CREATE_SHAPE`·`ERASE` 는 전부 null,
  `MOVE_MARK`·`MOVE_LABEL`·`MOVE_SHAPE`·`MOVE_SKETCH`·`RESIZE_SHAPE` 만 대상 결함을 담는다).

  ```ts
  if (ev.k === 'POINTER_DOWN') {
    const changed = prev.canvas.selection.defectId !== selId; // 이번에 선택이 이 결함으로 옮겨왔다
    const grabbed = next.canvas.drag?.defectId === selId;     // 이 결함의 표기·풍선·획을 잡았다
    if (changed || grabbed) return selId;
    return prev.toolbarFor === selId ? selId : null;          // 그 밖엔 직전 판정 유지
  }
  ```
  나머지 세 이벤트(`DOUBLE_CLICK`·`CONTEXT_MENU`·`SELECT_DEFECT`)는 그대로 두면 된다.

- 이 수정이 기존 요구를 깨지 않는지 확인함:
  - 다른 마커를 탭 → `changed` → 뜬다 ✔ (스펙 "기존 마커를 다시 탭")
  - **이미 선택된** 마커를 다시 탭 → `MOVE_MARK` 드래그의 `defectId === selId` → `grabbed` → 뜬다 ✔
    (`interaction.ts:1651` `!drag.moved` 면 커맨드가 안 나가므로 탭만으로는 아무것도 바뀌지 않는다)
  - 좌측 리스트 클릭(`SELECT_DEFECT`) → 그대로 뜬다 ✔
  - 마커를 끌어 옮긴 뒤 손을 떼면 → `POINTER_DOWN` 에서 이미 `grabbed` 로 허용됐고
    `POINTER_UP` 은 직전 판정 유지 → 다시 뜬다 ✔ (builder 체크리스트 T-4-4 유지)

### [보통 2] T-3 — 자동포커스를 끈 모달에서 Tab 포커스 트랩이 무력화된다

- 파일: `apps/web/src/ui/Form.tsx:148-160` (포커스 이펙트) · `Form.tsx:162-190` (Tab 트랩)
- 문제: `autoFocusFirst=false` 면 **모달 안 어디에도 포커스가 가지 않는다.** 포커스는 모달을 연
  트리거 버튼(스크림 뒤)에 남는다. 그런데 Tab 트랩은 `document.activeElement` 가 모달의
  첫/마지막 요소일 때만 개입한다(`Form.tsx:180-186`). 포커스가 모달 **밖**에 있으면
  두 조건 모두 거짓이라 브라우저 기본 Tab 이 그대로 동작한다.
- 재현 (PC): 결함 선택 → `[유사결함 불러오기]` → 모달이 뜬 상태에서 **Tab** 을 누른다.
  → 포커스가 모달 안이 아니라 **뒤쪽 페이지의 다음 요소**로 간다. 계속 Tab 하면 배경 UI 를
  전부 훑은 뒤에야 모달 항목에 닿는다. `ui-quality §7-2`("Tab 이 모달 밖으로 새지 않게 가둔다")
  가 이 모달에서만 깨진다. (T-3 이전에는 검색 input 에 포커스가 잡혀 트랩이 정상 동작했다)
- 수정: 포커스를 **끄지 말고 옮긴다.** 모달 컨테이너에 `tabIndex={-1}` 을 주고
  `autoFocusFirst=false` 일 때 컨테이너를 포커스한다 — `div` 는 텍스트 입력이 아니라
  소프트 키보드가 올라오지 않으므로 T-3 의 목적(태블릿 키보드 억제)은 그대로 달성된다.
  ```ts
  if (!autoFocusFirst) { focusedRef.current = true; el.focus(); return; }  // el 에 tabIndex={-1}
  ```
  (Esc 는 window 캡처 리스너라 지금도 동작한다 — 영향 없음)

### [경미 1] T-4 — 도형 도구로 도면 밖을 누르면 같은 이유로 툴바가 뜬다

- 파일: `apps/web/src/store.ts:424` · `packages/canvas-core/src/interaction.ts:1166-1168`
- 문제: 영역/화살표 도구로 이미지 **바깥**을 누르면 `startCreateShape` 가 경고 토스트만 내고
  선택도 드래그도 만들지 않은 채 리턴한다. `POINTER_DOWN` 이 명시 이벤트라 이때도
  직전에 선택돼 있던 결함의 `toolbarFor` 가 켜진다.
- 재현: 결함 X 를 그린 직후(툴바 숨김) 영역 도구로 도면 여백을 탭 →
  "도면 안쪽에서 시작해 주세요" 토스트와 함께 X 의 툴바가 뜬다.
- 수정: **[보통 1] 의 수정으로 함께 해결된다**(`changed`·`grabbed` 둘 다 거짓). 별도 조치 불필요.

### [경미 2] CSS 주석의 가정 번호가 틀렸다

- 파일: `apps/web/src/styles.css:4134` — `(ASSUMPTIONS U1)`
- 문제: 실제로 기록된 항목은 `_workspace/ASSUMPTIONS.md` 의 **U29** 다. U1 은 다른 가정이다.
- 수정: `U1` → `U29`.

### [경미 3] T-5 — 숨긴 메모 힌트에 단축키가 아닌 안내("비우면 삭제")가 섞여 있다

- 파일: `apps/web/src/canvas/MemoEditor.tsx:75-77` · `apps/web/src/styles.css:4135`
- 문제: 힌트 문구는 `Ctrl+Enter 저장 · Esc 취소 · **비우면 삭제**` 다. 앞의 둘은 태블릿에서
  실행 불가능한 단축키가 맞지만 "비우면 삭제" 는 **동작 규칙**이라 터치에서도 유효하다.
  `MemoEditor` 에는 저장·취소 버튼이 없고 커밋 경로가 `onBlur`(`MemoEditor.tsx:73`) 하나뿐이라,
  터치 기기에서는 메모 편집기에 **아무 안내도 남지 않는다.**
- 판단: 스펙(`scope §T-5`)이 이 요소를 명시적으로 지목했고 U29 로 기록돼 있으므로 **스펙 위반은 아니다.**
  다만 "비우면 삭제" 만 남기거나(단축키 span 만 숨김) 그대로 두는 선택지가 있다 —
  사용자 확인 사항으로 넘긴다.

---

## 확인 결과 — 리더가 지목한 4개 항목

### 1. T-4 판정 로직이 스펙 의도를 정확히 구현했는가 → **부분적으로만**

로직을 코어까지 따라가 확인한 것:

| 생성 경로 | 이벤트 | `created` | 결과 |
|---|---|---|---|
| 점 도구 탭 (`createDefectAt`, `interaction.ts:1600`) | `POINTER_UP` | true | `null` ✔ 툴바 없음 |
| 영역·화살표 드래그 (`commitCreateShape`, `:1625`) | `POINTER_UP` | true | `null` ✔ |
| 자유그리기 → [그리기 완료] (`pendingSketchToNewDefect`, `:835`) | `PENDING_SKETCH_TO_NEW_DEFECT` | true | `null` ✔ |
| 기존 마커 탭 | `POINTER_DOWN` | false | `selId` ✔ 툴바 뜸 |
| 좌측 리스트 클릭 (`CanvasRoute.tsx:566`) | `SELECT_DEFECT` | false | `selId` ✔ |

`CREATE_DEFECT` 를 내는 곳은 코어 세 군데뿐이고(`interaction.ts:1783·1862·1963`)
`apps/web` 에서 커맨드를 직접 만드는 경로는 없다 — `created` 판정의 커버리지는 완전하다.
**단, "선택 후 아무 POINTER_DOWN 이나 한 번" 이면 판정이 뒤집힌다** → [보통 1]·[경미 1].

경계면·불변식 쪽은 이상 없음:
- `clampToolbar` 가 `appReducer` 출구 한 곳(`store.ts:201-203`)에 있어 `INPUT` 이 아닌 경로
  (`UNDO`·`REDO`·`SET_FLOOR`·`LOAD`·`SET_DEFECT_ATTRS`)로 선택이 바뀌어도 `toolbarFor` 가
  유령으로 남지 않는다. `runEffect` 안의 중첩 `appReducer(state,{t:'UNDO'})`(`store.ts:490`)도
  같은 클램프를 탄다.
- `nextToolbarFor` 는 **부수효과 처리 뒤**(`runInput` 3단계)에 계산되므로
  `REVEAL_DEFECT`·`FOCUS_PANEL` 로 상태가 더 바뀌어도 최종 선택을 본다. 순서 정상.
- 소비 측 `CanvasRoute.tsx:534` 는 `state.toolbarFor !== selected.id` 로 게이트하고
  `selected` 는 `state.canvas.selection.defectId` 파생(`:486-489`)이라 두 계약이 일치한다.
  의존 배열에 `state.toolbarFor` 가 추가돼 있어 stale memo 도 없다.
- `toolbarAt` 소비처는 `ContextToolbar` 한 곳뿐(`:834`). `ContextMenu`(`:849`)는
  `state.menu` 를 별도로 보므로 우클릭 메뉴는 영향 없음 — 스펙 "ConfirmDialog·ContextMenu 유지" ✔

### 2. T-6 이 배경클릭에 의존하던 모달을 깼는가 → **아니오**

`<Modal` 사용처 전수(5곳):

| 사용처 | 닫는 길 | 배경클릭 의존 |
|---|---|---|
| `routes/ProjectForm.tsx:219` | Esc · ✕ · 푸터 | 없음 |
| `routes/DrawingUpload.tsx:392` | Esc · ✕ · 푸터 | 없음 |
| `routes/DrawingScaleDialog.tsx:38` | Esc · ✕ · 푸터 | 없음 |
| `routes/TitleBlockDialog.tsx:87` (`dock="right"`) | Esc · ✕ · 푸터 | 없음 |
| `ui/SimilarDefectPicker.tsx:53` | Esc · ✕ · 닫기 | 없음 |

`Modal` 은 헤더 ✕ 를 **무조건** 렌더하고(`Form.tsx:217-219`) Esc 는 window 캡처
리스너(`Form.tsx:188`)라 닫는 길이 막힌 모달은 없다.

공용 `Modal` 이 아닌 스크림 2곳은 이번에 안 바뀌었고, 확인해 보니 문제 없다:
- `routes/Export.tsx:528` `DefectListDialog` — 읽기 전용 목록. 잘못 닫혀도 **잃을 입력이 없다**
- `ui/Overlays.tsx:108` `ConfirmDialog` — 배경클릭 = `onCancel`(안전한 방향). 스펙이 범위 밖으로 못박음

`modal-scrim--dock`(`styles.css:3191`)은 `pointer-events` 를 끄지 않으므로 도곽 다이얼로그가
떠 있는 동안 캔버스는 **원래도** 조작할 수 없었다. 바뀐 것은 "배경을 누르면 닫힌다" → "아무 일도
안 한다" 뿐이다(U32 기록됨). 회귀 아님.

### 3. T-3 이 다른 모달의 자동포커스를 건드렸는가 → **아니오**

`autoFocusFirst` 기본값 `true`(`Form.tsx:103`), `false` 를 넘기는 곳은
`SimilarDefectPicker.tsx:59` **하나뿐**(전체 검색 확인). B1/B1-b/B1-c 보호장치
(`focusedRef` 1회 · `.modal__scroll` 첫 입력 · `onCloseRef`)는 그대로다.
다만 끈 모달 자체에 [보통 2] 의 부작용이 있다.

### 4. T-5 미디어쿼리가 스펙 술어와 동등한가 → **동등하다**

`styles.css:4129` `@media (hover: none) and (pointer: coarse)` 는 스펙이 지시한
`window.matchMedia('(hover: none) and (pointer: coarse)')` 와 **문자 그대로 같은 술어**다
(CSS 미디어쿼리와 `matchMedia` 는 같은 파서·같은 평가). UA 스니핑 없음 ✔

부수 확인:
- 대상 2곳 모두 정확히 걸린다 — `.stage__help`(`CanvasRoute.tsx:881`) · `.memo-editor__hint`(`MemoEditor.tsx:75`).
  `<kbd>` 를 쓰는 곳은 이 둘뿐(전체 검색)이라 빠진 힌트는 없다.
- 특이도 충돌 없음: 기본 규칙 `.stage__help`(`styles.css:642`, `display:flex`)와 특이도가 같고
  미디어쿼리가 **파일 뒤쪽**(4129)이라 이긴다. 재정의하는 다른 미디어쿼리도 없다.
- 안전영역 회귀 없음: `CanvasView.tsx:157` 이 `r.width<=0 || r.height<=0` 을 건너뛰므로
  `display:none` 인 `[data-floating]` 은 계산에서 자동 제외된다 — builder 의 U30 근거가 실제로 맞다.

---

## 불변식 검수표

이 배치는 **UI 표시 전용**이다. 커밋이 바꾼 5개 파일의 diff 전체를 확인한 결과
좌표·번호·저장·면적·정렬 로직에 닿는 줄이 한 줄도 없다(`store.ts` 추가분은 `toolbarFor` 파생 상태뿐,
`Form.tsx`/`SimilarDefectPicker.tsx` 는 포커스·스크림 핸들러, `styles.css` 는 `display:none`,
`CanvasRoute.tsx` 는 렌더 게이트 1줄).

| # | 불변식 | 결과 | 근거 |
|---|---|---|---|
| 1 | 좌표 0~1 정규화 | 해당 없음 | 좌표를 읽지도 쓰지도 않는다. `toolbarAt` 은 기존 `buildScreens` 결과만 소비(변경 없음) |
| 2 | 출력번호 미저장 | 해당 없음 | 새 필드 `toolbarFor: string \| null` 은 **메모리 전용 UI 상태** — `writes`·IDB 스키마와 무관 |
| 3 | 로컬 우선 쓰기 | 유지 | `runInput` 의 커맨드 적용 순서(1 커맨드 → 2 효과)를 건드리지 않았고, 3단계는 읽기만 한다 |
| 4 | 면적 계산 | 해당 없음 | 미변경 |
| 5 | 층 정렬 | 해당 없음 | 미변경 |
| 6 | 마스터+연결 | 해당 없음 | 미변경 |
| 7 | 설정 스냅샷 | 해당 없음 | 미변경 |
| 8 | isPrimary 1장 | 해당 없음 | 사진 경로 미변경 (`PhotoSection` 은 이번 diff 밖) |

빌드 검증(재실행): `npm run typecheck` **통과** (canvas-core · project-core · web 전부).

---

## 확인하지 못한 것

1. **실제 태블릿 거동** — 소프트 키보드가 실제로 안 뜨는지, `(hover:none) and (pointer:coarse)` 가
   그 기기에서 참인지는 코드로 판단할 수 없다. 사용자 확인 필요.
2. **[보통 1] 의 체감 빈도** — 팬 종료 후 툴바가 뜨는 것을 코드로는 확정했으나, 실제로 얼마나
   거슬리는지는 조작해봐야 안다. 다만 재현 경로는 코드 추적으로 확정적이다.
3. **`apps/web` 단위 테스트 없음** — `nextToolbarFor`/`clampToolbar` 는 순수 함수라
   테스트하기 좋지만 러너가 없다(builder 도 같은 이유로 못 넣었다). 지금은 코드 추적이
   유일한 검증 수단이다. 러너 도입은 스펙 밖이라 요구하지 않는다.
4. **배치2(`27c4b83`) 와의 상호작용은 [보통 1] 의 핀치 경로 한 건만** 확인했다.
   `pointerAdapter`·`CanvasView` 변경 자체는 이 검수의 범위가 아니다.
5. **`ContextToolbar` 컴포넌트 내부**는 미변경이라 읽지 않았다.

## 확인해주실 것 (사용자)

- [ ] 결함을 하나 찍은 **직후 도면을 손가락으로 밀었다가 떼면** 방금 찍은 결함 위에 편집 툴바가
      뜨는지 — 뜬다면 [보통 1] 이 실제로 재현된 것이다
- [ ] 결함을 찍은 직후 **두 손가락 핀치줌** 중에 툴바가 떠 있는지
- [ ] PC 에서 `[유사결함 불러오기]` 를 열고 **Tab** 을 눌렀을 때 포커스가 모달 밖으로 나가는지 ([보통 2])
- [ ] 메모 편집기에서 "비우면 삭제" 안내가 사라진 것을 그대로 둘지 ([경미 3])
