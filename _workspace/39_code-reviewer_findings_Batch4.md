# 검수 결과 — 배치4 (G-5 · G-1)

범위: `f358ae1` · `8e92157` · `80a62f4`
기준: 스펙 `30_..._UserFeedback0828.md` §5-1 · §5-4 · §10 / `DECISIONS.md` D14 · D18 / `38_builder_log_Batch4.md`

## 판정

### 조건부 통과 — 심각 1건 · 보통 2건을 고친 뒤 통과

기계 검증은 전부 재현됐다(타입체크 0오류, 638건 통과 — canvas-core 331 + project-core 307). 스펙 이탈로 보고된 U23은 **타당하다고 판정**한다. 다만 그 배치 payload의 **역적용(RESTORE) 순서 로직이 다중 획 케이스에서 틀렸고**, 지우개가 `Memo.pos` 앵커를 갱신하지 않아 **지운 뒤 메모를 옮기면 엉뚱한 자리로 점프한다.** 둘 다 코드로 재현했다.

---

## 지적 사항

### [심각 1] 지우개로 획을 지운 뒤 그 메모를 드래그하면 엉뚱한 위치로 점프한다

- 파일: `packages/canvas-core/src/commands.ts:310`(`DELETE_MEMO_PATH` apply) ↔ `packages/canvas-core/src/interaction.ts:962-967`(`MOVE_MEMO` grabOffset)
- 문제: `Memo.pos` 는 **획 묶음의 좌상단 앵커**다(`interaction.ts:1944` `inkAnchor([path])`). `DELETE_MEMO_PATH` 는 `paths` 만 지우고 `pos` 를 갱신하지 않는다. 그런데 `MOVE_MEMO` 시작 시 `grabOffsetScreen` 을 **`memo.pos` 가 아니라 `MemoScreen.box`**(= 현재 남은 획의 bbox − pad)에서 잡고(`interaction.ts:966`), 종료 시 `from: memo.pos → to: previewNorm` 델타로 획을 옮긴다(`commands.ts:297-309`). 지우개가 앵커와 실제 bbox 를 어긋나게 만들면 그 어긋난 양이 그대로 **이동 델타에 더해진다.**
- 재현 (zoom 1 · 2400×1600 도면 기준 산술):
  1. 한 메모에 획 A(x≈100px), 획 B(x≈300px). `pos.x → screen 100`, `box.x = 94`.
  2. 지우개로 **A 만** 지운다. 이제 `box.x = 294` 인데 `pos.x` 는 여전히 100 에 해당한다.
  3. B 를 잡고 오른쪽으로 100px 끈다 → `previewNorm.x = toNorm(394)`, `from = pos(100)` → `dx = +294`.
  4. **B 가 100px 이 아니라 294px 이동한다.** 지운 획이 왼쪽에 있었을수록 점프가 커진다.
- 부수: 같은 근본 원인으로 **지우개를 안 써도 항상 `MEMO_BOX_PAD`(6 이미지 px)만큼 어긋난다**(`constants.ts:256`). 이건 F2 시절부터 있던 것이고 6px 이라 눈에 안 띄었을 뿐이다. 지우개가 이 오차를 임의 크기로 키운다.
- 수정(둘 중 하나. 두 번째를 권한다):
  - (A) `applyMemoCommand` 의 `DELETE_MEMO_PATH` 에서 남은 획으로 `pos: inkAnchor(rest)` 재계산 + 되돌리기용으로 이전 `pos` 를 커맨드에 실어 `RESTORE_MEMO_PATH` 가 복원. → 커맨드 payload 가 또 늘어난다.
  - (B) **`MOVE_MEMO` 미리보기를 상자가 아니라 순수 델타로 계산한다.** `interaction.ts:966` 의 `grabOffsetScreen` 을 `box.box` 대신 `toScreen(memo.pos, …)` 기준으로 잡으면(`grabOffsetScreen = toScreen(memo.pos) − ev.screen`) `previewNorm = pos + Δ` 가 되어 앵커 staleness 도, 6px pad 오차도 동시에 사라진다. `applyMemoCommand` 는 이미 델타만 쓰므로 `pos` 가 bbox 와 달라도 무해해진다.
- 확인 필요 체크리스트 #10 은 **지우개를 쓴 뒤에 다시 해야** 이 버그가 보인다. 현재 체크리스트 순서(#10 이동 → #11 지우개)로는 못 잡는다.

### [보통 1] `RESTORE_MEMO_PATH` 의 획 재삽입 순서가 틀렸다 — Undo 가 원래 배열 순서로 복원하지 못한다

- 파일: `packages/canvas-core/src/commands.ts:325-341`
- 문제: 재삽입을 **index 오름차순**으로 한다.

  ```ts
  const its = c.items.filter((i) => i.memoId === m.id).slice().sort((a, b) => a.index - b.index);
  for (const it of its) paths.splice(Math.min(it.index, paths.length), 0, it.path);
  ```

  `index` 는 **삭제 시점의 배열 기준**으로 기록된다(`interaction.ts` `eraseCommandAt` 의 `memo.paths.findIndex(...)`, ctx 는 매 이벤트 최신 문서). 연속 삭제의 올바른 역연산은 **역-시간순** 재삽입이지 index 오름차순이 아니다.
- 재현 (실제로 돌려 확인함):
  - 메모 `[p1, p2, p3]`. 한 드래그로 `p1`(index 0) → `p3`(그 시점 index 1) 을 지운다 → 문서 `[p2]`, 병합 커맨드 `items=[{p1,0},{p3,1}]`.
  - `Ctrl+Z` → 결과 **`['p1','p3','p2']`**. 기대값 `['p1','p2','p3']`.

  ```
  CMDS [{"items":[["p1",0]],"memos":[]},{"items":[["p3",1]],"memos":[]}]
  BACK [ 'p1', 'p3', 'p2' ]
  ```
- 영향: 획은 전부 돌아오므로 **데이터 손실은 없다.** 그러나 배열 순서 = 그리기 z-순서라 굵기가 다른 획이 겹치면 겉모습이 달라지고, "Ctrl+Z 는 직전 상태를 정확히 복원한다"(J2 재판정 문구)가 성립하지 않는다. Redo 는 id 기준이라 정상.
- 테스트 공백: `eraser.test.ts` 의 `되돌리면 획이 원래 자리로 돌아간다 (index 복원)` 은 **삭제 1건**만 검증한다. `한 번의 드래그 = Undo 1스텝` 케이스는 `.sort()` 로 비교해 순서를 안 본다. 그래서 638건이 전부 통과한다.
- 수정: `sort((a,b) => a.index - b.index)` 를 빼고 **`c.items` 필터 결과를 역순으로** 순회한다(`mergeEraseCommand` 가 `[...prev.items, ...next.items]` 로 시간순을 보존하므로 `.slice().reverse()` 면 된다). `Math.min` 클램프는 방어용으로 남겨도 된다. 위 두 케이스 모두 정확히 복원되는 것을 손으로 검산했다:
  - `items=[{p1,0},{p3,1}]` → 역순: `[p2]`→splice(1,p3)→`[p2,p3]`→splice(0,p1)→`[p1,p2,p3]` ✅
  - 레코드 삭제 혼합(`items=[{p2,1},{p1,0}]`, `memos=[m(paths=[p3])]`) → 레코드 복원 후 역순: `[p3]`→splice(0,p1)→`[p1,p3]`→splice(1,p2)→`[p1,p2,p3]` ✅
- 다중 획 순서 회귀 테스트를 함께 추가할 것.

### [보통 2] `sizeMode` 만 복사되고 측정값은 안 와서, 이미 입력된 폭·길이가 손상결함표에서 0 으로 떨어진다

- 파일: `apps/web/src/routes/CanvasRoute.tsx:964`(`{ ...attrsOf(selected), ...pickCarryAttrs(attrsOf(src)) }`) ↔ `packages/project-core/src/items/size.ts:49-58`(`outputSize`)
- 문제: `DEFECT_CARRY_FIELDS.sizeMode = true` / `widthMm·lengthMm·areaM2·areaWMm·areaHMm = false` 다(스펙 §5-4(a) 그대로). D9 시절엔 대상이 **빈 새 결함**이라 무해했지만, D18 은 **이미 값이 들어 있는 현재 결함**에 덮어쓴다.
- 재현: 현재 결함에 `sizeMode='WL', widthMm=0.3, lengthMm=1200` 입력 → `sizeMode='AREA'` 인 결함을 불러온다 → 결과는 `sizeMode='AREA', areaM2=null`. `outputSize()` 가 `{ widthMm: 0, lengthMm: 0, areaM2: 0 }` 을 내므로 **손상결함표 4열이 전부 0** 이 된다. 값 자체는 레코드에 남아 있고 Ctrl+Z 로 복구되지만, 사용자는 표를 뽑을 때까지 모른다.
- 판단: **스펙 문언대로 구현된 것이 맞다.** 그러나 스펙이 "새 결함에 씨앗을 얹는다"에서 "기존 결함에 덮어쓴다"로 트리거를 바꾸면서 이 부작용이 검토되지 않았다.
- 선택지: (A) 의도된 동작 → 통과. 토스트 문구에 "규모 입력 방식(폭×길이/면적)도 함께 바뀝니다" 를 넣는 선에서 끝낸다. (B) 대상 결함에 이미 측정값이 있으면 `sizeMode` 를 복사에서 제외한다.
- 추천: **(A) + 토스트 문구 보강.** `sizeMode` 는 명백히 "분류"이고 폼에서 즉시 눈에 보인다(AREA 탭이 비어 있는 채로 열린다). (B) 는 "14필드 표"라는 단일 진실을 깨서 더 비싸다. **비차단.**

### [경미 1] 스펙이 지정한 파일 경로와 다르다 — `ui/defectForm/SimilarDefectPicker.tsx` → `ui/SimilarDefectPicker.tsx`

- 스펙 §6-C 는 `신규 ui/defectForm/SimilarDefectPicker.tsx` 로 적었다.
- 판정: **경계 규칙(§10-8)은 지켜졌다.** 이 파일은 `./Form`(Modal) 만 import 하고 store·repo·캔버스를 전혀 모른다. 후보 목록은 `items` props 로만 받고 커맨드 변환은 `CanvasRoute` 가 한다. 파일 위치는 계약이 아니라 배치이고, `defectForm/` 밖에 두는 편이 "이 디렉터리는 폼 위젯만" 이라는 의도에 오히려 부합한다. **지적만 하고 수정 요구하지 않는다.**

### [경미 2] 지우개 도구 상태에서 `Delete` 키를 누르면 이전에 선택돼 있던 결함이 지워진다

- 파일: `packages/canvas-core/src/interaction.ts:2153`(`onDelete` 는 `state.tool` 을 보지 않는다) · `:911-918`(ERASER pointerdown 이 선택을 만들지도 지우지도 않는다)
- 재현: 결함을 하나 선택 → 팔레트에서 `지우개` 선택 → `Delete` 키 → **그 결함이 삭제된다.**
- 지우개 모드에 들어온 사용자가 `Delete` 를 눌렀을 때 결함이 지워지는 것은 D14 의 "다른 것은 절대 안 지운다" 정신과 어긋난다. 되돌리기 토스트는 뜬다.
- 근본은 기존 동작(도구와 선택이 독립)이라 **범위 밖으로 볼 수 있다.** 값싼 방어는 ERASER pointerdown 에서 `selection: { ...NO_SELECTION }` 로 비우는 것.

### [경미 3] 지우개가 포인터 샘플 지점만 검사한다 — 빠르게 문지르면 획을 건너뛴다

- 파일: `packages/canvas-core/src/interaction.ts:1235`(`eraseCommandAt(state, ev.screen, …)`)
- 이전 샘플과 현재 샘플 사이를 선분으로 잇지 않는다. 60Hz + 12px 허용치라 보통은 문제없지만 빠른 드래그에서는 "문질렀는데 안 지워졌다"가 난다. U24(가장 가까운 하나만)와 결합하면 체감이 커진다.
- 스펙에 없고 `ASSUMPTIONS.md` 에도 기록되지 않았다. 가정으로 남기든 세그먼트 판정으로 올리든 선택하면 된다.

### [경미 4] 마지막 획 판정이 `MemoScreen.paths` 가 아니라 `Memo.paths` 길이를 본다

- 파일: `packages/canvas-core/src/interaction.ts:262`(`if (memo.paths.length === 1)`)
- `memoScreen()` 은 점 1개짜리 획을 걸러낸다(`memoGeom.ts:127`). 레코드에 그런 획이 섞여 있으면 화면상 마지막 획을 지워도 레코드가 남아, 획이 0개인 메모의 bbox 가 `Infinity` 가 되어(`memoGeom.ts:135-146`) `Infinity`/`NaN` DrawOp 이 나간다.
- 현재 생성 경로(`commitCreateMemoInk` 는 `pts.length < 2` 를 거부)로는 1점 획이 안 생긴다. 실제 재현 불가에 가까운 방어 항목이다.

### [경미 5] `MEMO_BOX_ALPHA` 가 미사용 공개 상수가 됐다

- `packages/canvas-core/src/constants.ts:258`. builder 가 이미 보고했다. 동의 — 이번 범위 밖.

---

## builder 자가보고 스펙 이탈(U23) 판정

**타당하다. 승인한다.**

- 스펙 §5-1(d) 는 같은 표 안에서 `DELETE_MEMO_PATH { memoId, path, index }`(단수)와 "한 번의 드래그 = Undo 1스텝" 을 동시에 요구한다. 이 리포지터리의 `History` 는 `Command[]` 평면 스택이고 그룹 개념이 없다. 병합 훅(`pushHistory`)만이 유일한 수단이고, 결과물은 필연적으로 복수 payload가 된다. 단수 payload 로는 두 요구를 함께 만족시킬 수 없다는 판단이 맞다.
- **다만 Undo/Redo 양방향 정확성은 통과가 아니다.** Redo(id 기준)는 정확하지만 Undo 방향이 [보통 1] 로 틀렸다. U23 의 설계는 맞고 그 안의 순서 로직 하나가 틀렸다.

## builder 자가보고 버그수정(`RESTORE_MEMO_PATH` 되살리기 순서) 재검증

**절반만 고쳐졌다.** 메모 레코드 복원이 획 삽입보다 먼저 오도록 고친 것은 맞다. 같은 블록에서 획 사이의 삽입 순서는 여전히 틀렸다 → [보통 1].

---

## 스펙 준수 확인

전 항목 통과, 단 §5-1(c) "이동 코드 변경 없음"은 코드는 변경 안 됐으나 [심각 1]로 동작이 깨져 판단 자체가 틀렸다.
§5-4(b) 잠긴 결함 적용 금지는 버튼 disabled + `setDefectAttrs`의 `isLocked` 2중 방어로 확인.
§5-4(c) `defectSeed` 인프라 잔존 0건, `seedAttrs`(항목설정 씨앗) 불가침 확인.
§5-4(d) 프로젝트 기본 구조유형은 `defaultAttrs`로 이름만 바뀌어 생존, 회귀 테스트로 고정.

## 불변식 · 경계 규칙

전부 통과. 좌표 정규화(스크린 px 판정 확인), 출력번호 미저장, 로컬 우선 쓰기, `sortOrder` 정수, FK 직결 금지, 과업 스냅샷, `isPrimary`, `canvas-core`의 window/document/React 미참조(grep 0건), `ui/defectForm/*`의 store·repo·캔버스 미참조, `DB_VERSION` 1 유지 — 전부 확인.

경계면 교차 비교 중 유일한 불일치: `DELETE_MEMO_PATH` ↔ `RESTORE_MEMO_PATH` 역커맨드 왕복 — [보통 1].

---

## 재검증한 builder 주장

타입체크 0오류·테스트 638건 통과 재현. `defectSeed` 계열 소스 잔존 0(주석 2줄만) 재현. `seedAttrs` 함정 회피 재현. 결함 생성 지점 "3곳" builder 표현이 정확(네 번째는 `sampleProject.ts` 시드 데이터로 무관). U23 배치 payload 불가피성 타당. `RESTORE_MEMO_PATH` 순서 버그 수정은 절반만.

## 확인하지 못한 것

브라우저 실행 검증(지우개 커서·팔레트 레이아웃·모달 스크롤), 결함 수백 건일 때 피커 성능, `ExportRun` 재현성(이번 범위 아님), IndexedDB 실제 왕복.

## 확인 체크리스트 보강 제안

builder 의 16항목에 다음을 추가해야 [심각 1]·[보통 1]이 잡힌다.
- **17.** 획 3개 이상인 필기 메모에서 왼쪽 끝 획을 지운다 → 남은 글씨를 잡고 오른쪽으로 조금 끈다 → 글씨가 손가락을 따라오지 않고 멀리 튀면 [심각 1].
- **18.** 획 3개 메모에서 한 드래그로 1번째와 3번째만 지운다(가운데는 건너뜀) → Ctrl+Z → 세 획이 다 돌아오는지, 겹친 자리에서 위아래가 안 뒤바뀌는지 확인.

## 질문 (비차단)

**[보통 2] `sizeMode` 복사가 의도인가.** 추천 A(의도된 동작 + 토스트 문구 보강). 차단하지 않는다.

## builder 에게 넘기는 수정 요청

| # | 조치 | 차단 |
|---|---|---|
| 1 | [심각1] `MOVE_MEMO` 를 상자가 아니라 `memo.pos` 기준 순수 델타로 재계산 (권장안 B) | 차단 |
| 2 | [보통1] `RESTORE_MEMO_PATH` 재삽입을 index 오름차순이 아니라 시간 역순으로 | 비차단(권장: 함께 처리) |
| 3 | [보통2] 토스트 문구에 "규모 입력 방식도 함께 바뀝니다" 보강 | 비차단 |
| 4 | 여유 시: 경미2(ERASER pointerdown에서 선택 비우기) | 여유 시 |
