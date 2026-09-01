# 범위 — 태블릿 실사용 피드백 (2026-09-01)

사용자가 태블릿에서 직접 조작하며 발견한 7건. 리더가 코드에서 원인을 먼저 확인했다
(아래는 그 결과 — builder 는 이 파일을 스펙으로 삼고 재조사하지 않는다).

## T-1. 필기메모 드로잉 중 점선박스 표시

**원인:** `interaction.ts:1979` — 메모(획 묶음) 생성 즉시 `selection = {part:'MEMO', memoId}`.
`renderModel.ts:611-634`(memoOps_)는 `selected || hovered` 일 때만 점선박스를 그리므로
(D14, 이미 구현됨), 방금 만든 메모는 그리는 동안 계속 "선택됨" 상태라 박스가 안 없어진다.

**요청:** 드로잉 중(포인터 down~up, 여러 획 이어그리기 포함)에는 선택 상태와 무관하게
박스를 그리지 않는다. 그리기가 끝나고 도구를 바꾸거나 다른 곳을 탭하면 기존 규칙(선택/hover)대로 돌아간다.

**주의:** D14 규칙 자체(선택·hover 시에는 보임)는 유지한다 — "항상 숨김"이 아니라
"그리는 도중만 숨김"이다. 지우개(ERASER)로 획 선택/hover 시 표시되는 것도 유지.

## T-2. 태블릿 핀치줌

**현황:** `canvas-core`의 리듀서는 이미 완성·테스트돼 있다
(`GESTURE_PINCH_START` / `GESTURE_PINCH{center,factor,pan}` / `GESTURE_PINCH_END`,
`packages/canvas-core/test/phase5TrackA.test.ts` A1). **DOM 쪽 배선만 없다.**

**요청:** `apps/web/src/canvas/pointerAdapter.ts`(또는 `CanvasView.tsx`)에 네이티브
`touchstart/touchmove/touchend` 2손가락 처리를 추가해 위 세 이벤트를 `send()`한다.
- 스테이지 요소는 이미 `touch-action:none`(styles.css:601) — pointer 이벤트만으로는
  브라우저가 두 번째 손가락을 별도 pointer로 주지만 핀치 계산(중심점·거리비)은 앱에서 직접 해야 한다.
- 한 손가락 = 기존 pan/draw 동작 유지. 두 손가락 감지 시에만 GESTURE_PINCH_* 로 전환.
- `packages/canvas-core/test/phase5TrackA.test.ts` 의 좌표계·클램프 동작을 그대로 신뢰하고
  새로 만들지 않는다.

## T-3. [유사결함 불러오기] 검색창 자동포커스 끄기

**원인:** `Form.tsx`의 공용 `Modal`이 열릴 때 본문 첫 입력에 자동 포커스한다(B1-b, 의도된 동작).
`SimilarDefectPicker.tsx:64`의 검색 `<input>`이 본문 첫 요소라 매번 포커스 → 태블릿 키보드가 뜬다.

**요청:** `Modal`에 옵트아웃(예: `autoFocusFirst?: boolean = true`) 추가하고
`SimilarDefectPicker`에서만 `false`로 끈다. **다른 모달의 자동포커스(B1-b)는 그대로 둔다** —
전역으로 끄면 PC 키보드 사용성이 나빠진다.

## T-4. 결함 선택 시 뜨는 편집 툴바(ContextToolbar) 과다 노출

**원인:** `CanvasRoute.tsx:830-843` — `selected && toolbarAt` 이면 항상 `ContextToolbar`를 띄운다.
결함을 새로 그리면 자동 선택되므로, 연속으로 결함을 그릴 때마다 방금 그린 자리 위에
색상·모양·삭제 툴바가 뜬다 (사용자 확인: 삭제 확인창이 아니라 **이 편집 툴바**가 문제).

**요청:** **새로 생성된 직후의 자동 선택**에는 툴바를 띄우지 않는다. 사용자가 **기존 마커를
다시 탭해서 명시적으로 선택**했을 때만 뜨도록 한다. (Inspector 패널은 계속 그대로 — 거긴 사이드라
시야를 안 가린다.)
**주의:** 삭제 확인 다이얼로그(`ConfirmDialog`)는 이번 범위가 아니다 — 그대로 둔다.

## T-5. 태블릿에서 단축키 힌트 숨기기

**대상 2곳:**
- `CanvasRoute.tsx:877-880` `.stage__help` — 휠·Space·Alt·Shift·Ctrl+Z 안내
- `MemoEditor.tsx:75-77` `.memo-editor__hint` — Ctrl+Enter·Esc 안내 (사용자가 직접 언급하진 않았으나
  같은 종류라 함께 처리 — U(가정)로 남기고 최종 보고에 포함할 것)

**요청:** 터치 전용 기기(포인터 온리 터치 — coarse pointer, hover 불가)에서는 숨긴다.
**판정 기준:** `window.matchMedia('(hover: none) and (pointer: coarse)')` 같은 표준 미디어쿼리 기반으로.
User-Agent 스니핑 금지(신뢰 불가). 마우스+터치 겸용(투인원 노트북)은 커버 못 해도 괜찮다 — 이번 범위는
"핀치줌이 필요한 순수 터치 태블릿"이 대상이다.

## T-6. 생성 다이얼로그 배경 클릭 시 오작동 종료 방지

**원인:** `Form.tsx:85` — 공용 `Modal`은 스크림(배경) 클릭 시 무조건 닫힌다(`onClose` 호출).
터치 실수(스크롤 중 배경을 스침 등)로 용역 생성(`ProjectForm`)·도면 업로드(`DrawingUpload`) 등
입력 중인 폼이 통째로 날아간다.

**요청:** `Modal`의 배경 클릭 닫기 동작을 **기본 비활성화**한다 — Esc 키와 명시적 취소/닫기(✕) 버튼은
그대로 둔다. (모든 모달이 폼은 아니지만, 배경 클릭으로 닫아야만 하는 특별한 이유가 있는 모달은 지금 없다 —
있다면 개별적으로 옵트인 prop을 추가한다.)

## T-7. [핵심] 전차결함에 현회차 사진 추가 시 금차분(CURRENT) 전환 — 미구현

**현황 확인:**
- `Project.prevProjectId` + `copyStructure(..., {includeDefects:true})` 로 전차 결함을
  `status:'PREV_PENDING'`, `prevDefectId:src.id` 로 승계하는 것까지는 **이미 구현돼 있다**
  (`apps/web/src/data/idb/repo.ts:653-661`).
- 상세기획 §Phase 2-D: *"촬영하는 순간 status = CURRENT, 보라 → 빨강"* — **이 전이 로직이 없다.**
- 오히려 `isLocked(defect) = status !== 'CURRENT'`(`defectGeom.ts:330-333`)가
  **사진 추가 UI 자체를 잠가버린다** (`CanvasRoute.tsx:896` `disabled={isLocked(selected)}`).
  즉 지금은 전차 결함에 사진을 추가하는 것 자체가 막혀 있다.
- **Q42(미답)** — "사진을 지우면 상태가 되돌아가는가"는 `ASSUMPTIONS.md N8`로 **비차단·B 가정**
  이미 돼 있다: *"한 번 CURRENT가 되면 되돌아가지 않는다. 되돌리려면 명시적 버튼."* 그 명시적
  되돌리기 버튼은 **아직 없다.**
- **사진 자체를 이전 회차에서 복사해오는 것(K13, "사진 승계")은 이번 범위가 아니다.** 그건 더 큰
  Phase 2-D 항목이고 의도적으로 막혀 있다(`repo.ts:590` 주석). 이번 요청은 "이번 회차에 새로
  찍은 사진을 추가하면 상태만 전환"이므로 범위가 다르다 — **혼동해서 사진 승계까지 만들지 말 것.**

**요청 (G-8, 축소 범위):**
1. `PhotoSection`의 사진 추가만 `PREV_PENDING` 결함에도 허용 (다른 속성 편집은 계속 잠금 — A8 유지)
2. 사진 추가가 성공하면(장수 1장 이상이 되는 순간) `status: 'PREV_PENDING' → 'CURRENT'` 전이
3. 색상(보라→빨강)·범례 카운트·출력 시 포함여부(`includePrevPending`)는 `status` 필드를 그대로
   읽으므로 **전이만 되면 자동 반영된다** — 별도로 손댈 곳 없는지 확인만 한다
4. N8 가정대로 **자동 되돌림 없음.** 대신 명시적 `[전회차로 되돌리기]` 버튼을 Inspector에 추가해
   `status: 'CURRENT' → 'PREV_PENDING'` 수동 전환을 제공한다 (사진 삭제 여부와 무관하게 항상 가능)
5. Undo(Ctrl+Z) 대상에 포함— 다른 상태 변경 커맨드와 같은 방식으로

**차단 여부:** 비차단. Q42/N8 그대로 적용. 다만 4번(되돌리기 버튼)의 정확한 문구·위치는
builder 재량으로 정하고 ASSUMPTIONS.md 에 기록한다.

---

## 실행 순서 (파일 겹침·위험도 기준)

| 배치 | 항목 | 건드리는 영역 |
|---|---|---|
| **1** | T-3·T-4·T-5·T-6 | `apps/web` 전용 (Form.tsx·CanvasRoute.tsx·MemoEditor.tsx·SimilarDefectPicker.tsx). canvas-core 미변경 |
| **2** | T-1·T-2 | `canvas-core`(interaction.ts·renderModel.ts) + `apps/web/canvas`(pointerAdapter.ts). 1과 파일 안 겹침 → 병행 가능 |
| **3** | T-7(G-8) | `canvas-core`(defectGeom.ts) + `apps/web`(photo 흐름·Inspector). 1·2 완료 후 — `isLocked`가 배치2와 같은 패키지라 순서를 늦춘다 |
