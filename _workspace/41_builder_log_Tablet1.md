# 구현 로그 — 태블릿 실사용 피드백 배치1 (T-3 · T-4 · T-5 · T-6)

- **스펙:** `_workspace/00_input/scope_TabletFeedback0901.md`
- **브랜치:** `feat/photo-polish` (새 브랜치 만들지 않음)
- **커밋:** `14302a7` — *태블릿 배치1 — T-3·T-4·T-5·T-6 (apps/web 전용)*
- **범위 준수:** `packages/canvas-core` **무변경.** T-1·T-2·T-7 은 손대지 않았다.

> ⚠️ 작업 중 같은 워크트리에서 **배치2(T-1·T-2)가 병행 진행 중**이었다
> (`packages/canvas-core/{interaction,renderModel,types}.ts` · `apps/web/src/canvas/{CanvasView,pointerAdapter}.ts` 가 dirty).
> 커밋은 **내가 고친 6개 파일만 명시적으로 stage** 해서 남겼다 — 배치2 변경은 섞이지 않았다.

---

## 완료

| 작업 | 파일 | 상태 |
|---|---|---|
| T-3 `Modal` 자동포커스 옵트아웃 `autoFocusFirst?: boolean = true` | `apps/web/src/ui/Form.tsx` | 완료 |
| T-3 유사결함 피커에서만 자동포커스 끄기 | `apps/web/src/ui/SimilarDefectPicker.tsx` | 완료 |
| T-4 생성 직후 자동선택 판정 (`toolbarFor`) | `apps/web/src/store.ts` | 완료 |
| T-4 툴바 렌더 게이트 | `apps/web/src/routes/CanvasRoute.tsx` | 완료 |
| T-5 터치 전용 기기 단축키 힌트 숨김 | `apps/web/src/styles.css` | 완료 |
| T-6 스크림 클릭 닫기 기본 비활성화 + 옵트인 `closeOnScrimClick` | `apps/web/src/ui/Form.tsx` | 완료 |
| 가정 U29~U32 기록 | `_workspace/ASSUMPTIONS.md` | 완료 |

---

## 판단 근거 (왜 이렇게 고쳤나)

### T-3 — 자동포커스 옵트아웃

스펙 그대로. `Modal` 의 포커스 이펙트 맨 앞에 `if (!autoFocusFirst) return;` 한 줄.
**B1/B1-b/B1-c 의 기존 보호장치(마운트 1회 · 본문 첫 입력 · `onCloseRef`)는 건드리지 않았다** —
그 셋은 "타이핑 중 포커스가 튀는" 버그를 막고 있던 것이라 옵트아웃과 별개다.
끈 곳은 `SimilarDefectPicker` **하나뿐**이고, 다른 모달의 자동 포커스는 그대로다.

### T-4 — 왜 판정을 스토어에 두었나 ⭐

`CanvasRoute` 쪽에서 "선택된 결함이 방금 만들어진 것인가"를 알아낼 방법이 없다.
`state.canvas.selection` 에는 그 정보가 없고, 결함 목록을 렌더 간에 비교하는 휴리스틱은
Undo·층 전환·재로드에서 곧바로 어긋난다.

**유일하게 확실한 신호는 리듀서 안에만 있다** — `reduce()` 가 돌려주는 `commands` 에
`CREATE_DEFECT` 가 들어 있는지. `interaction.ts` 에서 결함을 만드는 경로는 이 커맨드
세 군데뿐이고(점 · 도형 · 대기 스케치 → 새 결함), 셋 다 그 직후 자기 자신을 선택한다.

그래서 `store.ts` 에 파생 상태 하나를 두었다.

```ts
toolbarFor: string | null   // 편집 툴바를 띄워도 되는 결함. 항상 selection.defectId 이거나 null

// runInput 끝
toolbarFor: nextToolbarFor(state, next, ev, r.commands.some((c) => c.k === 'CREATE_DEFECT'))
```

판정 순서 (`nextToolbarFor`):

1. 선택된 결함이 없다 → `null`
2. **이번 입력이 결함을 만들었다 → `null`** (같은 `POINTER_DOWN` 이 선택까지 했더라도 이쪽이 우선)
3. `EXPLICIT_SELECT_EVENTS` (`POINTER_DOWN` · `DOUBLE_CLICK` · `CONTEXT_MENU` · `SELECT_DEFECT`)
   → 그 결함을 허용
4. 그 밖(`POINTER_MOVE` · `POINTER_UP` · `WHEEL` · `SET_TOOL` …) → **직전 판정 유지**

4번이 있어야 마커를 탭한 뒤 드래그·줌을 해도 툴바가 깜빡이지 않는다.

불변식(`toolbarFor` 는 항상 현재 선택이거나 `null`)은 `appReducer` **출구 한 곳**에서
`clampToolbar()` 로 강제했다. 케이스마다 챙기면 Undo·삭제·층전환 중 하나를 반드시 빠뜨린다.

**손대지 않은 것:** `Inspector` 패널(스펙 지시대로 항상 그대로), `ConfirmDialog`(이번 범위 아님),
`ContextMenu`(우클릭 메뉴), `ContextToolbar` 컴포넌트 자체.

### T-5 — CSS 미디어쿼리로 한 이유 (U30)

스펙이 요구한 것은 *"표준 미디어쿼리 기반 판정 · UA 스니핑 금지"* 이고,
CSS `@media (hover: none) and (pointer: coarse)` 는 `window.matchMedia` 와 **같은 술어**다.

JS 훅 대신 CSS 를 고른 결정적 이유는 `.stage__help` 가 `data-floating` 이라는 점이다.
안전영역 계산(`CanvasView.tsx` — `getBoundingClientRect()` 가 0 이면 건너뜀)이 이미 있어서,
`display:none` 이면 **계산에서 자동으로 빠지고 하단 여백까지 함께 돌려받는다.**
JS 훅으로 조건부 렌더하면 같은 결과에 상태·리스너·해제 코드가 더 붙는다.

`.memo-editor__hint` 도 함께 숨겼다 — 스펙이 명시적으로 지시한 가정이다(U29).

### T-6 — 전역 기본 비활성화

`Modal` 스크림의 `onPointerDown={onClose}` 를 `closeOnScrimClick ? onClose : undefined` 로 바꿨다.
안쪽 패널의 `stopPropagation` 은 옵트인을 켰을 때를 위해 그대로 남겼다.
**옵트인을 켠 곳은 지금 하나도 없다** — `dock="right"` 도곽·범례 다이얼로그도 껐다(U32).
모든 `Modal` 은 헤더 ✕ 를 항상 갖고 있고 Esc 도 살아 있어 닫는 길이 막힌 모달은 없다.

---

## 미완료 / 막힌 것

없음. 배치1 범위(T-3·T-4·T-5·T-6)는 전부 구현했다.
**막힌 스펙 모호함이 없어 `QUESTIONS.md` 에 새로 추가한 항목은 없다.**
재량으로 정한 4건은 `ASSUMPTIONS.md` **U29~U32** 로 기록했다(비차단).

---

## 검증한 것

| 항목 | 결과 |
|---|---|
| `npm run typecheck` (canvas-core · project-core · web) | 통과 |
| `npm test` | **644 통과** (canvas-core 337 / project-core 307), 실패 0 |
| `npm run build` (vite 프로덕션) | 통과 — 239 modules, 9.1s |
| 코드 점검 — `any`·타입 캐스팅 없이 구현 | 통과 (`toolbarFor: string \| null`, `ReadonlySet<InputEvent['k']>`) |
| 코드 점검 — canvas-core 무변경 | 통과 (`git status` 로 내 커밋에 포함 안 됨을 확인) |
| 코드 점검 — 도메인 불변식 8종 저촉 여부 | 해당 없음 (좌표·번호·저장·면적 로직 무변경) |

**미검증(코드로 확인 불가):** 실제 태블릿에서의 소프트 키보드 거동, 터치 미디어쿼리 매칭,
툴바가 실제로 사라지는지 — 전부 아래 체크리스트로 넘긴다.
`apps/web` 에는 테스트 러너가 없어 `toolbarFor` 판정에 대한 단위 테스트는 넣지 못했다
(러너 도입은 스펙 밖 인프라 결정이라 임의로 하지 않았다).

---

## 직접 확인해주실 것

### T-3 · 유사결함 불러오기
1. 결함 하나를 고른다 → 우측 결함정보 폼에서 **[유사결함 불러오기]** 를 누른다
2. **정상:** 모달이 뜨되 검색창에 커서가 없고 **소프트 키보드가 올라오지 않는다.**
   검색창을 직접 탭하면 그때 키보드가 뜨고 필터가 정상 동작한다
3. **회귀 확인:** 용역 생성(**+ 새 용역**)·도면 업로드 모달은 **예전처럼** 열자마자
   첫 입력칸에 커서가 있어야 한다 (여기까지 꺼졌으면 잘못된 것)

### T-4 · 편집 툴바
1. 점 도구로 도면에 결함을 **연속 3개** 찍는다
   → **정상:** 색상·모양·삭제 툴바가 **한 번도 뜨지 않는다.** 우측 Inspector 패널은 매번 뜬다
2. 방금 찍은 마커 중 하나를 **다시 탭**한다 → **정상:** 그 마커 아래에 툴바가 뜬다
3. 좌측 결함 리스트에서 다른 결함을 클릭 → **정상:** 툴바가 그 결함으로 따라간다
4. 마커를 탭해 툴바를 띄운 뒤 **드래그로 옮긴다** → 드래그 중에는 숨었다가 놓으면 다시 뜬다
5. 영역·화살표를 드래그로 그린다 → **정상:** 그린 직후 툴바 없음
6. 자유그리기 후 **[그리기 완료]** → **정상:** 툴바 없음
7. **회귀 확인:** 마커 우클릭(길게 누르기) → 컨텍스트 메뉴는 예전처럼 뜬다.
   결함 삭제 확인창도 예전 그대로 (이번 범위 아님)

### T-5 · 단축키 힌트 (태블릿에서 확인)
1. 태블릿(마우스 미연결)에서 캔버스를 연다
   → **정상:** 좌측 하단 `휠 줌 · Space드래그 팬 …` 안내가 **없다**
2. 메모 편집기를 연다 → **정상:** `Ctrl+Enter 저장 · Esc 취소` 안내가 **없다**
3. **PC 브라우저에서는 둘 다 예전처럼 보여야 한다** (여기서 사라졌으면 잘못된 것)

### T-6 · 배경 클릭
1. **+ 새 용역** 을 열고 이름을 입력하다가 **모달 바깥 회색 배경을 탭**한다
   → **정상:** 아무 일도 일어나지 않는다. 입력한 내용이 그대로 남아 있다
2. 같은 모달에서 **Esc** · 헤더 **✕** · 푸터 **취소** → 셋 다 예전처럼 닫힌다
3. 도면 업로드 · 도곽/범례 설정 · 축척 설정 · 유사결함 불러오기에서도 1·2 를 확인

---

## 알려진 한계

1. **투인원 노트북(마우스 + 터치 겸용)에서는 T-5 힌트가 계속 보인다.**
   `hover: hover` 로 판정되기 때문이고, 스펙이 *"커버 못 해도 괜찮다"* 고 허용한 범위다.
2. **T-4 — 이미 선택돼 있는(그리고 툴바가 숨겨진) 마커를 다시 탭하면 툴바가 뜬다.**
   `POINTER_DOWN` 이 명시적 선택으로 잡히므로 의도한 동작이다. 다만 결함을 찍은 직후
   같은 자리를 한 번 더 탭하면 툴바가 뜬다 — "생성 → 바로 탭" 이 사용자의 명시적 조작이라
   그대로 두었다.
3. `apps/web` 에 테스트 러너가 없어 `nextToolbarFor` / `clampToolbar` 는 **타입 검사와
   프로덕션 빌드까지만** 검증했다. 단위 테스트 없음.
4. T-6 은 **공용 `Modal` 만** 바꿨다. 사진 미리보기·크롭 등 자체 오버레이를 쓰는 화면의
   배경 클릭 동작은 이번에 손대지 않았다(스펙 범위 밖).
