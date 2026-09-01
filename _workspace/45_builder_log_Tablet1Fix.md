# 구현 로그 — 태블릿 배치1 검수 반영 (보통1 · 보통2 · 경미)

- **검수 문서:** `_workspace/43_code-reviewer_findings_Tablet1.md` (심각0 · 보통2 · 경미3)
- **대상 스펙:** `_workspace/00_input/scope_TabletFeedback0901.md` (T-3 · T-4 · T-5 · T-6)
- **원 구현 로그:** `_workspace/41_builder_log_Tablet1.md`
- **브랜치:** `feat/photo-polish`

## 완료

| 지적 | 작업 | 파일 | 상태 |
|---|---|---|---|
| 보통1 | `POINTER_DOWN` 을 `EXPLICIT_SELECT_EVENTS` 에서 빼고, "무엇을 눌렀는가"(`changed` ∨ `grabbed`)로 따로 판정 | `apps/web/src/store.ts` (`nextToolbarFor`) | 완료 |
| 경미1 | 도형 도구로 도면 밖 탭 → 툴바 뜸 | 〃 (보통1 수정으로 함께 해소, 별도 코드 없음) | 완료 |
| 보통2 | `autoFocusFirst=false` 모달의 초기 포커스를 **모달 컨테이너**(`tabIndex={-1}`)로 옮김 + Tab 트랩이 "포커스가 모달 밖" 인 경우를 잡도록 보강 | `apps/web/src/ui/Form.tsx` | 완료 |
| 보통2 부수 | 컨테이너 포커스 시 상자 전체에 초점 테두리가 생기지 않게 `.modal:focus{outline:none}` | `apps/web/src/styles.css` | 완료 |
| 경미2 | CSS 주석 `(ASSUMPTIONS U1)` → `U29` 오타 | `apps/web/src/styles.css` | 완료 |
| 경미3 | 메모 힌트의 "비우면 삭제" 를 터치에서도 남길지 | — | **미수정 (사용자 결정 대기)** |

### 보통1 — 무엇을 바꿨나

`POINTER_DOWN` 은 더 이상 이벤트 종류만으로 "직접 고름" 이 되지 않는다.

```ts
if (ev.k === 'POINTER_DOWN') {
  const changed = prev.canvas.selection.defectId !== selId; // 이번에 선택이 이 결함으로 옮겨왔다
  const grabbed = next.canvas.drag?.defectId === selId;     // 이 결함의 표기·풍선·획을 잡았다
  if (changed || grabbed) return selId;
  return prev.toolbarFor === selId ? selId : null;          // 그 밖엔 직전 판정 유지
}
```

드래그 **종류를 열거하지 않고** `drag.defectId` 하나만 본다 (U37). 코어 `newDrag` 의 기본값이
`defectId: null` 이라 `PAN`·`CREATE_SHAPE`·`CREATE_SKETCH`·`ERASE`·`MOVE_MEMO` 는 자동으로 거짓이고,
`MOVE_MARK`·`MOVE_LABEL`·`MOVE_SHAPE`·`MOVE_SKETCH`·`RESIZE_SHAPE` 만 대상 결함을 담는다
(`interaction.ts:1040·1064·1080·1100·1122·1139` 확인). 나중에 드래그 종류가 늘어도 여기를 고칠 필요가 없다.

`DOUBLE_CLICK`·`CONTEXT_MENU`·`SELECT_DEFECT` 는 그대로다.

### 보통2 — 무엇을 바꿨나

포커스를 **끄지 않고 옮겼다.** `autoFocusFirst=false` 면 `.modal` 컨테이너(`tabIndex={-1}`)를 포커스한다.
`div` 는 텍스트 입력이 아니라 소프트 키보드가 올라오지 않으므로 T-3 의 목적은 유지된다.

여기에 한 갈래를 더 넣었다 (U38). 컨테이너 포커스만으로는 **Shift+Tab 이 여전히 샌다** —
컨테이너는 `[tabindex="-1"]` 이라 트랩의 `items` 목록에 안 들어가고, `activeElement === firstEl/lastEl`
비교가 둘 다 거짓이라 브라우저 기본 Tab 이 배경으로 넘어간다. 그래서:

```ts
if (!(active instanceof HTMLElement) || active === el || !el.contains(active)) {
  e.preventDefault();
  (e.shiftKey ? lastEl : firstEl).focus();
  return;
}
```

기존 요소 간 순환(첫↔마지막) 로직은 손대지 않았다.

## 회귀검증 — 수정 전 상태로 되돌려 재검증했는가

### 보통1 → 예. 차분(differential) 실행으로 확인했다

`nextToolbarFor` 는 `apps/web` 에 있고 이 워크스페이스에는 **테스트 러너가 없다**(검수 §확인하지 못한 것 3).
러너 도입은 스펙 밖이라, 레포 **밖 임시 스크립트**(`%TEMP%/onspect_toolbar_regression.mjs`, 커밋하지 않음)에
**수정 전 함수와 수정 후 함수를 나란히 복제**해 같은 14개 상태 시나리오 + 1개 연속 시나리오를 돌렸다.
입력값(선택 id·`drag.defectId`·이벤트 종류·`created`)은 검수 문서가 코드 추적으로 확정한 값을 그대로 썼다.

낱개 시나리오 14건 — **수정 전 4건 실패 / 수정 후 0건 실패**:

| # | 시나리오 | 기대 | 수정 전 | 수정 후 |
|---|---|---|---|---|
| 1 | 점 도구 탭으로 생성 (`created`) | 툴바 없음 | 없음 | 없음 |
| 2 | 생성 직후 빈 도면 `POINTER_DOWN`(팬 시작) | 없음 | **X ←버그** | 없음 |
| 4 | 핀치 둘째 손가락(`cancelDrag` → `drag=null`) | 없음 | **X ←버그** | 없음 |
| 5 | 다른 마커 B 탭 | B | B | B |
| 6 | 이미 선택된 마커 재탭(`MOVE_MARK`) | X | X | X |
| 7 | 좌측 리스트 클릭(`SELECT_DEFECT`) | X | X | X |
| 8 | 마커를 끌어 옮긴 뒤 손 뗌(`POINTER_UP`) | X | X | X |
| 9 | 도형 도구로 도면 밖 탭 (경미1) | 없음 | **X ←버그** | 없음 |
| 10 | 빈 곳 탭으로 선택 해제 | 없음 | 없음 | 없음 |
| 11 | 번호 풍선 잡기(`MOVE_LABEL`) | X | X | X |
| 12 | 우클릭 메뉴(`CONTEXT_MENU`) | X | X | X |
| 13 | 선택 유지 중 `SET_TOOL` | X | X | X |
| 14 | 지우개 드래그 시작(선택 유지, 툴바 숨김) | 없음 | **X ←버그** | 없음 |

연속 시나리오 — 판정은 직전 `toolbarFor` 를 이어받으므로 낱개가 아니라 이어서 돌려야 실제 거동이 나온다.
"빈 도면 탭(생성) → 도면을 민다 → 손을 뗀다":

```
수정 전: POINTER_UP→null  POINTER_DOWN→X  POINTER_MOVE→X  POINTER_UP→X   최종 툴바=X   ← 검수 재현 그대로
수정 후: POINTER_UP→null  POINTER_DOWN→null POINTER_MOVE→null POINTER_UP→null 최종 툴바=null
```

즉 **수정 전 코드로는 검수가 기술한 버그가 그대로 재현되고, 수정 후에는 사라지며,
검수가 지킬 것을 요구한 5개 요구(다른 마커 탭 / 재탭 / 리스트 클릭 / 드래그 후 재표시 / 우클릭)는
수정 전후 판정이 동일하다.** 4건의 "수정 전 실패" 중 2·4·9 는 검수가 지목한 것이고,
14(지우개)는 같은 원인의 미보고 경로다 — 함께 해소됐다.

배선(어느 상태가 함수에 들어가는가)은 실행이 아니라 코드 추적으로 확인했다:
`runInput` 이 `nextToolbarFor(state, next, ev, created)` 를 호출하고 `state` 는 커맨드·효과 적용 **전**의
원본이므로 `prev.canvas.selection` 은 이번 이벤트 직전 선택이 맞다(`store.ts:360·385·398`).
`next.canvas` 는 `reduce` 결과라 `drag` 는 이번 `POINTER_DOWN` 이 만든 드래그를 가리킨다.

### 보통2 → 부분적. 코드로 되돌려 추적 비교했고, 실행 재현은 못 했다

`apps/web` 에 DOM 테스트 환경이 없다(`jsdom`·`happy-dom` 미설치 — 확인함). 실행으로 재현하려면
테스트 러너 + DOM 환경을 새로 들여야 하는데 스펙 밖이다. 대신 **수정 전 코드 경로를 그대로 따라가**
검수의 재현 경로가 성립하는지 확인했다:

- 수정 전: `if (!autoFocusFirst) return;` → 모달 안 어디에도 포커스 없음 → `activeElement` 는 스크림 뒤 트리거 버튼
  → 트랩의 두 조건(`=== firstEl` / `=== lastEl`) 모두 거짓 → 브라우저 기본 Tab → **배경으로 샌다** (검수 일치)
- 수정 후: 컨테이너 포커스 → `active === el` 갈래에 걸려 `preventDefault` 후 첫(또는 Shift 면 마지막) 요소로
  들어온다 → 이후 순환은 기존 로직
- 트랩의 `items` 선택자에 `[tabindex]:not([tabindex="-1"])` 가 있어 **컨테이너 자신은 목록에 포함되지 않는다**
  (읽어서 확인) — 그래서 `active === el` 갈래가 반드시 필요하다
- `focusedRef` 1회 보장(B1-b)은 그대로다. `autoFocusFirst=false` 경로도 `focusedRef.current = true` 를 세우므로
  부모 리렌더로 포커스를 다시 뺏지 않는다
- `autoFocusFirst=false` 를 넘기는 곳은 `SimilarDefectPicker.tsx` 하나뿐(검수 §3에서 전수 확인) —
  다른 모달의 거동은 한 줄도 바뀌지 않는다

→ **실제 Tab 이동은 사용자 확인 항목으로 넘긴다** (아래 체크리스트).

### 경미2 → 문자열 치환. `_workspace/ASSUMPTIONS.md` 에서 U29 가 T-5 힌트 숨김 항목임을 확인하고 바꿨다

## 미완료 / 막힌 것

| 작업 | 이유 | 필요한 것 |
|---|---|---|
| 경미3 — 메모 힌트 "비우면 삭제" | 검수가 **스펙 위반 아님**으로 판정하고 사용자 선택지로 넘겼다. 화면에 보이는 동작이라 임의로 정하지 않는다 | 사용자 결정: (A) 그대로 둔다 (B) 단축키 span 만 숨기고 "비우면 삭제" 는 터치에서도 남긴다 |
| `apps/web` 단위 테스트 | 러너 없음(스펙 밖). 이번엔 레포 밖 임시 차분 스크립트로 대체 | 러너 도입 여부는 사용자 결정 |

## 검증한 것

- `npm run typecheck` **통과** (canvas-core · project-core · web 전부, exit 0)
- `npm test` **통과** — canvas-core 19파일 350건 + project-core 15파일 307건 = **657건 전부 통과**
- `npm run build` **통과** (vite 프로덕션 빌드, 7.65s)
- 차분 회귀 스크립트 **통과** — 수정 전 5건 실패(낱개 4 + 연속 1) / 수정 후 0건
- 코드 점검: 이번 diff 는 UI 표시·포커스 전용이다. 좌표·번호·면적·정렬·저장 경로에 닿는 줄이 없다
  (`store.ts` 는 `toolbarFor` 파생 판정만, `Form.tsx` 는 포커스, `styles.css` 는 outline·주석)

**미검증:** 실제 태블릿·브라우저에서의 터치/키보드 거동 (에이전트는 브라우저를 띄우지 않는다)

## 직접 확인해주실 것

- [ ] **보통1** — 결함을 하나 찍은 **직후 도면을 손가락으로 밀었다 떼면** → 방금 찍은 결함 위에
      편집 툴바가 **뜨지 않아야** 정상 (수정 전에는 떴다)
- [ ] **보통1** — 결함을 찍은 직후 **두 손가락 핀치줌** 중 → 툴바가 **한 번도 보이지 않아야** 정상
- [ ] **경미1** — 결함을 그린 직후 영역/화살표 도구로 **도면 여백**을 탭 → "도면 안쪽에서 시작해 주세요"
      토스트만 뜨고 **툴바는 안 떠야** 정상
- [ ] **기존 요구 유지** — ① 다른 마커 탭 → 툴바 뜸 ② 이미 선택된 마커 다시 탭 → 툴바 뜸
      ③ 좌측 리스트에서 결함 클릭 → 툴바 뜸 ④ 마커를 끌어 옮기고 손을 떼면 → 툴바 다시 뜸.
      **넷 다 그대로여야 한다**
- [ ] **보통2** — PC 에서 결함 선택 → `[유사결함 불러오기]` → **Tab** 을 계속 눌러본다.
      포커스가 모달 안(검색창·목록·닫기)에서만 돌고 **배경으로 나가지 않아야** 정상.
      **Shift+Tab** 도 마찬가지. 모달을 연 직후 **소프트 키보드가 올라오지 않아야** 한다(태블릿)
- [ ] **보통2 부수** — 모달이 열릴 때 상자 **전체를 두르는 파란 테두리**가 보이면 알려주세요 (안 보여야 정상)
- [ ] **경미3 결정** — 메모 편집기 힌트: 태블릿에서 `Ctrl+Enter·Esc` 안내를 숨기면서 **"비우면 삭제"** 도
      함께 사라진다. 터치에서는 이 안내가 아예 안 보인다. 그대로 둘지 / "비우면 삭제" 만 남길지 알려주세요

## 알려진 한계

1. **실행 재현 없음** — 두 수정 모두 브라우저에서 확인하지 않았다. 보통1 은 판정 함수를 실제로
   두 벌 돌려 차분을 봤지만, 그 함수에 들어가는 상태 배선은 코드 추적이다.
2. **보통2 는 DOM 실행 검증 불가** — 러너·DOM 환경이 없다. Tab 순환은 코드 추적 결과다.
3. **`toolbarFor` 는 여전히 테스트가 없다** — 이번 차분 스크립트는 레포 밖 임시 파일이라 커밋하지
   않았다. 앞으로 이 로직을 고치면 같은 방식으로 다시 만들어야 한다.
4. **동시 작업과 분리** — 커밋 시점 워크트리에 태블릿 배치2 수정(`CanvasView.tsx`·`pointerAdapter.ts`)이
   섞여 있었다. 내 커밋에는 **`store.ts`·`Form.tsx`·`styles.css` 3개만** 담았다.

## 가정 (ASSUMPTIONS)

U37(드래그 종류 열거 대신 `drag.defectId` 하나만 본다) · U38(컨테이너 포커스 + 트랩 밖 갈래 보강) ·
U39(컨테이너 `outline:none`) — 전부 비차단. 상세는 `_workspace/ASSUMPTIONS.md`.
