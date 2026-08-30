# 구현 로그 — 배치4 (G-5 → G-1)

기준 스펙 `_workspace/30_plan-reviewer_spec_UserFeedback0828.md` §5-4(G-5) · §5-1(G-1)
기준선 `2574787` (배치3 검수 반영) → **커밋 2건**

| 커밋 | 범위 |
|---|---|
| `f358ae1` | G-5 · D9 폐기 → `[유사결함 불러오기]` (D18) |
| `8e92157` | G-1 · 필기메모 점선상자 숨김 · 획 히트 · 지우개 (D14) |

착수 순서는 스펙 §9 지시대로 **G-5 먼저, G-1 나중**이다. 롤백 단위를 나누기 위해 커밋도 분리했다.

---

## 완료 — G-5 · D9 폐기 → `[유사결함 불러오기]` (D18)

| 작업 | 파일 | 상태 |
|---|---|---|
| `DEFECT_SEED_CARRY` → `DEFECT_CARRY_FIELDS` · `pickDefectSeed` → `pickCarryAttrs` (**표 값 유지**) | `packages/canvas-core/src/defectAttrs.ts` | ✅ |
| 머리 주석의 D9 근거 → D18 로 교체 | 〃 | ✅ |
| `ReduceContext.defectSeed` → **`defaultAttrs`** (프로젝트 고정. 절대 갱신 안 됨) · 생성 3곳 스프레드 교체 | `packages/canvas-core/src/interaction.ts` | ✅ |
| `AppState.defectSeed` → `defaultAttrs` · `initialAppState` · `LOAD` · `runInput` 배선 | `apps/web/src/store.ts` | ✅ |
| `setDefectAttrs` 의 **씨앗 자동 갱신 제거** + 주석 삭제 | 〃 | ✅ |
| `SET_DEFECT_ATTRS` 액션에 optional `toast` 추가 (조기 반환 통과 시에만 [되돌리기] 토스트) | 〃 | ✅ |
| `LOAD` 시 `defectSeed:` → `defaultAttrs:` | `apps/web/src/routes/CanvasRoute.tsx` | ✅ |
| 불러오기 후보 목록 · 다이얼로그 개폐 · 14필드 적용 | 〃 | ✅ |
| `SimilarDefectPicker` 신설 (검색창 · `seq`·부재·결함유형·층·상태) | `apps/web/src/ui/SimilarDefectPicker.tsx` **신규** | ✅ |
| `[유사결함 불러오기]` 버튼 (`onLoadSimilar` · `similarCount` props) | `apps/web/src/ui/defectForm/DefectInfoForm.tsx` | ✅ |
| 폼 → 라우트 배선 | `apps/web/src/ui/Inspector.tsx` | ✅ |
| 다이얼로그·버튼 스타일 | `apps/web/src/styles.css` | ✅ |
| 테스트 이름·문구 교체, 씨앗 자동갱신 케이스 삭제, `pickCarryAttrs` 순수 검증 유지 | `packages/canvas-core/test/s6.test.ts` | ✅ |
| `defectSeed` 픽스처 정리 | `packages/canvas-core/test/s2b.test.ts` | ✅ |
| D9 `⚠️ D18 로 폐기됨` 주석 존재 확인 (이미 되어 있었다) | `_workspace/DECISIONS.md` | ✅ 확인만 |
| J1~J5 유효/소멸 재판정 + 신규 J6 | `_workspace/ASSUMPTIONS.md` | ✅ |

**grep 결과 (`defectSeed|DEFECT_SEED_CARRY|pickDefectSeed|seedAttrs`)** — 소스에서 잔존 0건.
남은 것은 주석 2줄(변경 이력 설명)과 `_workspace` 문서뿐이다.

**⚠️ 함정 회피 확인:** `PreviewTab.tsx` · `project-core/src/items/apply.ts` · `test/apply.test.ts` 의
`seedAttrs`(항목설정 씨앗)는 **한 글자도 건드리지 않았다.**

**⭐ 회귀 방지:** 프로젝트 기본 구조유형은 `ReduceContext.defaultAttrs` 로 살렸다.
`s6.test.ts` 에 *"새 결함은 빈 폼이다. 프로젝트 기본 구조유형만 채워진다"* 케이스로 고정했다.

### 동작 요약

```
결함을 찍는다               → 빈 폼 (구조유형만 채워짐. 자동 이어받기 없음)
[유사결함 불러오기]          → 이 용역의 결함 목록 (seq 내림차순 · 검색창)
하나 고르면                 → 현재 선택 결함에 분류·판정 14필드 적용 (SET_DEFECT_ATTRS)
                             규모·개소·메모·위치보조는 그대로 남는다
Ctrl+Z                     → 1스텝 되돌림
잠긴 결함(전회차)            → 버튼 disabled + store 가 마지막 관문에서 거부
```

---

## 완료 — G-1 · 필기메모 (D14)

**대상은 `MEMO` 뿐이다. `SKETCH`(자유그리기)는 한 줄도 건드리지 않았다.**

| 작업 | 파일 | 상태 |
|---|---|---|
| (a) 필기 메모 점선 상자를 **선택·hover 일 때만** 그린다. 텍스트 메모 노란 상자는 유지 | `packages/canvas-core/src/renderModel.ts` | ✅ |
| (b) 필기 메모 히트를 `inRect`/테두리 → **획까지의 거리**로 교체. `nearestMemoPath()` 신설 | `packages/canvas-core/src/hitTest.ts` | ✅ |
| (b) `HIT_MEMO_INK_PX = 12` + `HitProfile.memoInk` (터치 주입 가능) | `packages/canvas-core/src/constants.ts` | ✅ |
| (c) 이동 — **코드 변경 없음.** `MOVE_MEMO` 가 이미 획 앵커 델타 이동 | — | ✅ 확인만 |
| (d) `Tool` 에 `'ERASER'` · `DragKind` 에 `'ERASE'` · `DragState.eraseId`·`erasedCount` | `packages/canvas-core/src/types.ts` | ✅ |
| (d) `DELETE_MEMO_PATH` / `RESTORE_MEMO_PATH` 커맨드 + apply · invert · `memoTargetsOf` | `packages/canvas-core/src/commands.ts` | ✅ |
| (d) `pushHistory` 에 `mergeEraseCommand` — 같은 `eraseId` 를 **Undo 1스텝**으로 | 〃 | ✅ |
| (d) `eraseCommandAt()` · POINTER_DOWN/MOVE/UP 배선 · `ERASER: 'crosshair'` | `packages/canvas-core/src/interaction.ts` | ✅ |
| (d) 지우개 중 `DOUBLE_CLICK` 무시 (연속 지우기가 화면 fit 을 부르지 않게) | 〃 | ✅ |
| (d) 팔레트 `지우개` 슬롯 (`필기메모` **바로 다음**) | `apps/web/src/canvas/ToolPalette.tsx` | ✅ |
| (d) 커맨드 1건이 여러 메모를 건드리므로 저장 대기열을 `memoTargetsOf` 로 전환 | `apps/web/src/store.ts` | ✅ |
| 신규 테스트 21건 | `packages/canvas-core/test/eraser.test.ts` **신규** | ✅ |
| `HitProfile`·`DragState` 필드 추가에 따른 픽스처 갱신 | `test/phase5TrackA.test.ts` · `test/visibility.test.ts` | ✅ |

### 구현 중에 잡은 버그 1건 (테스트가 잡았다)

`RESTORE_MEMO_PATH` 에서 **되살리기 순서**가 틀려 있었다.
한 드래그가 같은 메모의 획을 하나씩 지우다 마지막에 레코드째 지우면
`items`(먼저 지운 획)와 `memos`(마지막 상태)가 **같은 메모**를 가리킨다.
획 삽입을 먼저 하면 그 시점에 메모가 없어 **먼저 지운 획이 영영 사라진다.**
→ 되살리기를 먼저 하고 획을 꽂도록 고쳤다. 테스트로 고정했다.

### 확정 동작

| 항목 | 확정 |
|---|---|
| 대상 | 필기 메모의 획만. 점·화살표·영역·자유그리기·번호풍선·리더선은 **절대 안 지운다** |
| 단위 | 획 1개 통째로. 한 샘플에 **가장 가까운 하나만** (가정 U24) |
| 판정 | 커서 중심 12 스크린 px (또는 획 두께의 절반 중 큰 쪽) |
| 드래그 | 지나가는 동안 계속 지운다. 한 번의 드래그 = **Undo 1스텝** |
| 마지막 획 | 메모 레코드도 삭제 (빈 메모를 남기지 않는다) |
| 잠금 | 메모에는 `status` 가 없으므로 `isLocked` 검사 안 한다 |
| 커서 | `crosshair`. 원형 커서 링 없음 |
| 마퀴 다중선택 | **넣지 않았다** (D14 명시). `selectedIds` 모델 없음 |

---

## 미완료 / 막힌 것

없다. 지시한 범위를 전부 구현했다.

---

## 검증한 것

| 항목 | 결과 |
|---|---|
| 타입 검사 (`npm run typecheck` — canvas-core · project-core · web) | ✅ 0 오류 |
| 단위 테스트 (`npm test`) | ✅ **638건 전부 통과** (canvas-core 331 · project-core 307) |
| 신규 테스트 | `eraser.test.ts` 21건 · `s6.test.ts` 12건(재작성) |
| 프로덕션 빌드 (`npm run build`) | ✅ 성공 |
| 잔존 심볼 grep | `defectSeed`·`DEFECT_SEED_CARRY`·`pickDefectSeed` 소스 0건 |
| 불변식 #1 (좌표 0~1 정규화) | ✅ 커맨드가 저장하는 획 좌표는 원본 `SketchPath` 그대로. 기하 판정만 스크린 px |
| 불변식 #2 (출력번호 미저장) | ✅ 불러오기 다이얼로그는 `seq` 만 보여준다. `assignNumbers` 미접촉 |
| 불변식 #3 (로컬 DB 우선) | ✅ 지우개도 기존 커맨드 → 저장 대기열 경로 그대로 |
| `DB_VERSION` | ✅ 1 유지. 마이그레이션 0건 |
| 경계 규칙 (`canvas-core` 가 `window`/`document`/React 미참조) | ✅ 새 코드에 DOM 참조 없음 |
| 경계 규칙 (`ui/defectForm/*` 이 store·repo·캔버스 미import) | ✅ 버튼은 콜백 prop 만 받는다. 다이얼로그는 `ui/` 에 두고 `CanvasRoute` 가 띄운다 |

**미검증:** 실제 브라우저 동작. 지시대로 개발 서버를 띄우지 않았다.

---

## 직접 확인해주실 것

### G-5 · 유사결함 불러오기

1. **빈 폼 확인** — 도면에서 점을 찍는다
   → 우측 폼의 부재·결함유형·원인·보수방안이 **비어 있어야** 정상.
   단 **구조 유형은 용역 기본값(RC 등)으로 채워져 있어야** 정상 (이게 비어 있으면 회귀다).
2. **불러오기** — 결함을 하나 선택 → 폼 맨 위 `[유사결함 불러오기]` 클릭
   → 이 용역의 결함 목록이 뜨고, **최근에 찍은 것이 위**에 온다.
   번호는 도면 위 풍선·좌측 리스트와 **같은 번호**여야 정상.
3. **검색** — 상단 검색창에 부재 이름 일부(예: `슬래`)를 친다 → 그 결함만 남아야 정상.
4. **적용 결과** — 목록에서 하나를 고른다
   → 부재·결함유형·원인·보수방안·조사구분·진행·누수·규모모드가 바뀌고,
   **폭·길이·면적·개소·위치보조·메모는 손대지 않은 그대로**여야 정상.
   토스트: `○○(N번)의 분류·판정을 불러왔습니다. 규모·개소·메모는 직접 입력하세요`
5. **되돌리기** — 토스트의 `[되돌리기]` 또는 `Ctrl+Z` **한 번**
   → 불러오기 직전 값으로 정확히 돌아가야 정상.
6. **잠긴 결함** — 전회차(보라) 결함을 선택
   → `[유사결함 불러오기]` 버튼이 **회색(비활성)** 이어야 정상.
7. **결함이 하나뿐일 때** — 첫 결함을 찍고 바로 버튼을 본다
   → 비활성 + 툴팁 `이 용역에 불러올 다른 결함이 아직 없습니다`.

### G-1 · 필기메모 · 지우개

8. **점선 상자** — 필기메모로 도면에 글씨를 쓴다
   → 다 쓰고 나면 **점선 상자가 사라져야** 정상. 획(글씨)만 남는다.
   마우스를 획 위에 올리거나 클릭하면 그때 점선 상자가 나타나야 정상.
9. **획 히트** — 글씨의 **획 사이 빈 공간**을 클릭
   → 메모가 **안 잡혀야** 정상(도면이 그대로 보인다). 획 위를 클릭하면 잡혀야 정상.
10. **이동** — 획을 잡고 끈다 → 글씨 전체가 따라와야 정상 (동작 변화 없음).
11. **지우개 · 필기만** — 팔레트에서 `필기메모` **바로 아래** `지우개` 선택
    → 커서가 십자로 바뀐다. 글씨 위를 문지른다
    → **획 단위로** 사라져야 정상. 획의 일부만 지워지지는 않는다.
12. **⭐ 다른 것은 안 지워진다** — 지우개로 **점·화살표·영역·자유그리기·번호 풍선** 위를 문지른다
    → **아무것도 지워지지 않아야** 정상. (여기서 하나라도 지워지면 즉시 알려주세요)
13. **되돌리기 1스텝** — 지우개로 여러 획을 한 번에(손 떼지 않고) 쓸어 지운다
    → 토스트 `필기 N획을 지웠습니다` [되돌리기].
    `Ctrl+Z` **한 번**에 지운 획이 **전부** 돌아와야 정상.
14. **빈 메모** — 메모의 마지막 획까지 지운다
    → 빈 점선 상자가 남지 않아야 정상. `Ctrl+Z` 하면 메모가 통째로 돌아와야 정상.
15. **출력 확인** — 조사위치도를 출력한다
    → 필기 메모의 **점선 상자가 안 나와야** 정상. 글씨는 나온다.
16. **텍스트 메모(옛 데이터)** — 예전에 만든 노란 상자 메모가 있다면
    → **노란 상자는 그대로 보여야** 정상. 지우개로 문질러도 안 지워져야 정상.

---

## 알려진 한계 · 가정

`_workspace/ASSUMPTIONS.md` 의 **U23~U26** 과 **J 계열 재판정**에 기록했다. 요약:

| # | 내용 |
|---|---|
| **U23** ⭐ | `DELETE_MEMO_PATH` payload 를 스펙의 단수 `{memoId,path,index}` 가 아니라 **배열**(`eraseId`·`items[]`·`memos[]`)로 만들었다. 단수로는 같은 표가 요구한 *"드래그 1회 = Undo 1스텝"* 을 만족시킬 수 없다. 사용자에게 보이는 동작은 스펙 그대로이고 바뀐 것은 내부 자료구조뿐이다 |
| **U24** | 지우개는 한 샘플에 **가장 가까운 획 하나만** 지운다 (허용치 안 전부가 아니다) |
| **U25** | 지우개 드래그가 끝날 때 토스트를 한 번 낸다. 지운 게 0이면 침묵 |
| **U26** | 불러오기 후보는 **용역 전체** · `seq` 내림차순 · 자기 자신 제외 |
| **J1·J3·J5** | 이름만 바뀌고 유효 |
| **J2** | 소멸 (되돌릴 씨앗 자체가 없다) |
| **J4** | 이미 2026-08-25 에 뒤집혔다 (`surveyKind: true`) |
| **J6** | (신규) U26 과 같은 내용을 J 계열에도 남겨 둠 |

### 고치지 않고 남긴 것 (수정 모드 규칙 — 눈에 띄었지만 범위 밖)

1. **`MEMO_BOX_ALPHA` 상수가 미사용이 됐다** (`constants.ts:258`).
   점선 상자를 선택·hover 일 때만 그리게 되면서 흐린 알파가 쓰일 자리가 없어졌다.
   지우면 깨끗하지만 **공개 상수라 지우는 것이 이번 범위 밖**이라 그대로 뒀다.
2. **`memoTargetOf` 가 이제 `memoTargetsOf()[0]`** 이다.
   앱 안 유일한 호출부(`store.recordCommandWrites`)는 복수형으로 옮겼으므로
   `memoTargetOf` 는 사실상 미사용이다. 외부(RN 전환) 호환을 위해 남겼다.
3. **지우개에 단축키가 없다.** 팔레트에 도구 단축키 체계 자체가 없어(`SELECT` 만 툴팁에 `V` 표기)
   지우개만 만들면 일관성이 깨진다. 스펙에도 없어 만들지 않았다.
4. **`DEFECT_CARRY_FIELDS` 는 `canvas-core` 에 그대로 뒀다.**
   D18 이후 이 표는 캔버스 상호작용과 무관해졌지만(폼 기능이다), 옮기면
   `defectAttrs.ts` 를 참조하는 곳이 전부 흔들린다 — D13("필드별 초기값은 canvas-core 소관")도 유지된다.
