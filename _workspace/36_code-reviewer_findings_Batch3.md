# 검수 결과 — 배치3 (G-6 층접두번호 / G-3 도곽·범례 프로젝트스코프 / G-2 상태범례)

검수자: code-reviewer · 2026-08-30
대상 커밋: `fc12efa` · `efd9e00` · `8770c42` · `e4a9e6d`
기준: `30_plan-reviewer_spec_UserFeedback0828.md` §5-2 · §5-3 · §5-5 · §6-C · §10 ·
`DECISIONS.md` D15 · D16 · D19 · `ASSUMPTIONS.md` U17~U22 · `35_builder_log_Batch3.md`

---

## 판정

**조건부 통과 — 심각 2건 해소 전에는 사용자에게 넘기지 않는다.**

G-3(도곽·범례 스코프 분리 + B2 해소)과 G-2(상태 범례)는 **코드로 추적한 범위에서 결함 0건**이다.
경계면·불변식·읽기 정규화·승격 결정론 전부 통과했고 `DB_VERSION` 1 유지도 확인했다.

문제는 **G-6 하나에 몰려 있다.** 두 심각 모두 "접두어가 옵트인이 아니라 사실상 전원 강제"라는
같은 뿌리에서 나온다. 둘 다 builder 의 코드 실수가 아니라 **스펙 §5-5(c) 그대로 구현한 결과**이므로,
심각 1은 **사용자 결정(Q54)** 없이 고칠 수 없다. 심각 2는 결정과 무관하게 코드 수정이 필요하다.

| 심각도 | 건수 |
|---|---|
| 심각 | 2 |
| 보통 | 3 |
| 경미 | 4 |

검증 재현: `npm run typecheck` 3워크스페이스 오류 0 · `npm test` project-core 303 통과(15파일).
builder 주장(597/0, 빌드 통과)과 모순 없음.

---

## 1. 심각

### [심각 1] 층 접두어가 옵트인이 아니다 — 손대지 않은 기존 용역의 보고서 번호가 전부 바뀐다

- 파일: `packages/project-core/src/floorOrder.ts:110-135` (`floorCodeOf`)
  · `apps/web/src/routes/Export.tsx:128-130` · `apps/web/src/export/exportModel.ts:114-119`
  · `packages/project-core/src/export/damageTable.ts:203`

**문제.** `floorCodeOf` 는 `floor.code` 가 비면 **이름에서 접두어를 파생**한다.
`지상1층` → `1F`, `지하1층` → `B1F`. 현장 데이터의 층 이름은 거의 전부 파싱된다.
결과적으로 **접두어가 `null` 인 층은 사실상 존재하지 않고, 사용자가 접두어를 끌 방법도 없다**
(입력칸을 비우면 자동 파생으로 돌아간다).

이 한 가지가 네 곳에 동시에 번진다.

| 지점 | 지금 동작 |
|---|---|
| `Export.tsx:129` `b.floors.some(f => floorCodeOf(f) !== null)` | 사실상 **항상 true** → 모든 용역의 번호모드 기본값이 `PER_FLOOR` 로 바뀐다 |
| `damageTable.ts:203` | NO 열이 `1` → **`1F-01`** (모든 손상결함표·결함리스트) |
| `produce.ts:122` · `PrintRoute.tsx:161` | 조사위치도 번호 풍선이 `1` → **`1F-01`** |
| `exportModel.ts:118` `params.floorCodes ?? floorCodesOf(...)` | **옛 `ExportRun` 재다운로드**도 현재 층에서 파생 → 지난주에 낸 보고서를 `[같은 번호로 다시 받기]` 하면 **번호 표기가 달라진 파일**이 나온다 |

**재현.** 배치3 이전에 만든 아무 용역이나 연다(층 이름 `지상1층`, 접두어 입력 안 함).
출력 → 번호모드가 `층별 1번부터` 로 선택돼 있고, 생성한 엑셀 NO 열이 `1F-01`이다.
이력에서 옛 run 을 `[같은 번호로 다시 받기]` 해도 `1F-01`이 나온다(그때 파일은 `1`이었다).

**근거 — 이게 의도가 아닐 가능성이 높은 이유 셋.**
1. D19 원문: *"접두어(Floor.code 등)를 **입력하면** 그 층은 층별 번호부여가 활성화된다 —
   접두어 **유무**가 그 층의 넘버링 표기 방식을 결정하는 **스위치**가 된다."*
   자동 파생이면 스위치가 항상 ON 이고 사용자가 끌 수 없다.
2. builder 자신의 회귀 체크리스트 D-22: *"접두어를 **아무 층에도 넣지 않고** 뽑은 산출물이
   예전과 똑같아야 한다(NO 열이 1·2·3)"* — **현재 코드로는 성립하지 않는다.** 이 항목은
   사용자가 확인하면 반드시 실패한다.
3. §10-1 "재현성" — 옛 run 의 재다운로드 결과가 달라지는 것은 이 원칙에 정면으로 걸린다.

**단, builder 잘못이 아니다.** 스펙 §5-5(a) *"null/'' = 이름에서 자동 파생"* · §5-5(c)
`floorCodeOf` 의사코드를 **글자 그대로** 구현했다. 스펙과 D19 원문이 갈리는 지점이다.

**수정(사용자 결정 후).** 권장은 **명시 입력만 접두어로 인정**하는 것이다 — 파생값은 입력칸의
placeholder(제안)로만 남긴다.
```ts
// floorOrder.ts — 파생 함수는 그대로 두고, 스냅샷을 만드는 경로만 바꾼다
export function floorCodesOf(floors) {           // 출력용 = 수동 입력만
  const out = {};
  for (const f of floors) out[f.id] = normalizeFloorCode(f.code);   // 파생 안 함
  return out;
}
// floorCodeOf 는 ProjectSetup 의 placeholder 전용으로 남긴다
```
그러면 `Export.tsx:129` 의 자동 제안도, NO 열도, 옛 run 재다운로드도 **접두어를 넣은 용역에서만**
바뀐다. 옛 run 은 `floorCodes` 가 없고 층 `code` 도 비어 있으므로 **정확히 예전 파일이 재현된다.**

→ **`QUESTIONS.md` Q54 로 올렸다. 차단.**

---

### [심각 2] 조사위치도 번호 풍선에 `1F-01` 이 들어가지 않는다 — 원 밖으로 넘친다

- 파일: `packages/canvas-core/src/constants.ts:159,165` · `packages/canvas-core/src/style.ts:59`
  · `packages/canvas-core/src/renderModel.ts:391-416`

**문제.** 번호 풍선은 **고정 반지름 원**이다.
`balloonRadius = 34`(이미지 px), `fontSize = balloonRadius × fontFactor(1.05) ≈ 35.7px`.
원의 지름은 68px 인데 굵은 35.7px 글자로 `1F-01`(5글자)를 그리면 폭이 **100px 을 넘는다.**
`renderModel.ts:405` 는 `align:'center'` 로 그냥 중앙에 찍으므로 좌우로 각각 20px 이상 삐져나간다.

**`labelScale`(F6)로 못 피한다.** 그 값은 `balloonRadius` 를 키우고 `fontSize` 는 그 배수라
**원과 글자가 같이 커진다 — 비율이 그대로다.** 사용자가 손쓸 방법이 없다.

**재현.** 접두어가 붙은 상태(심각 1 때문에 지금은 기본값)에서 결함이 여러 개인 도면의
조사위치도 PNG 를 뽑는다 → 번호가 원 밖으로 나와 옆 풍선·리더선·도면 선과 겹친다.
결함 밀도가 높은 도면일수록 못 읽는다.

**이 지점은 스펙이 검토한 적이 없다.** §7 표의 "번호 풍선 34px 고정"(→Q51)은 **크기** 얘기지
**글자 폭** 얘기가 아니다. `renderModel.ts:11` 주석도 *"코어는 그 문자열이 무엇인지 묻지 않는다"*
라고만 돼 있다 — 지금까지 항상 1~3자리 숫자였기 때문에 성립하던 가정이다.

**수정.** 코어에서 **텍스트 폭에 맞춰 풍선을 늘리는 것**이 맞다. `legend.ts` 가 이미 쓰는
`estimateEm` 이 있으므로 새 의존이 없다.
```ts
// renderModel.ts — 풍선을 원 → 스타디움(pill)으로. 1~2글자면 지금과 픽셀 동일
const label = displayNumbers[s.defectId] ?? '';
const size  = Math.max(7, st.fontSize * zoomOf(s));
const textW = estimateEm(label) * size;
const w = Math.max(br * 2, textW + size * 0.6);   // 좌우 여백
// k:'rect' + rx = br  (또는 원 2개 + 사각형) 로 그린다
```
`hitTest.ts:78`(`r = max(balloonR + HIT_PAD, HIT_MIN_LABEL_PX)`)과
`defectGeom.ts:171-201`(`autoLabelNorm` 자동 배치 거리)이 같은 `balloonR` 을 쓰므로 **세 곳을 함께**
바꿔야 한다 — 렌더만 늘리면 히트 영역과 어긋난다(전형적인 경계면 불일치).

폭 확장이 이번 라운드에 과하면, **최소 조치**로 접두어가 붙을 때만 글자를 줄이는 방법도 있다:
`size = st.fontSize * zoom * min(1, 2.2 / label.length)`. 다만 이건 대증요법이라 권하지 않는다.

---

## 2. 보통

### [보통 1] 번호모드가 `전체 이어서` 여도 접두어가 붙는다 — `1F-12` 다음이 `2F-13`

- 파일: `packages/project-core/src/export/damageTable.ts:203` · `apps/web/src/export/exportModel.ts:130`

`damageRow` 는 `params.mode` 를 아예 모른다. 접두어 유무만 본다. 그래서 사용자가
`Export.tsx:129` 의 자동 제안을 되돌려 `CONTINUOUS` 를 고르면 NO 열이
`1F-01 … 1F-12 · 2F-13 · 2F-14` 가 된다.

이건 **Q53 의 선택지 B** — plan-reviewer 가 *"D19 문장과 어긋난다"* 며 **탈락시킨 안**이다.
채택안 A("PER_FLOOR 자동 제안, 강제 아님")를 그대로 구현하면 이 조합이 반드시 도달 가능해진다.
`Export.tsx:124-127` 의 주석도 *"전체연속이면 접두어가 뜻을 잃는다"* 라고 스스로 인정하면서
그 상태를 막지 않는다.

**수정 후보 (택1, 사용자 결정 필요 없음 — 어느 쪽이든 모순이 없다):**
- (a) `tableInput`/`displayNumbersOf` 가 `params.mode !== 'PER_FLOOR'` 면 `floorCodes` 를 안 넘긴다
  → 전체연속에서는 예전처럼 `13`. **한 줄이고 되돌리기 쉽다. 추천.**
- (b) `OptionsPanel` 에서 접두어가 있으면 `전체 이어서` 를 disabled + 사유 표시(강제가 된다 — A 위반)

### [보통 2] 층 접두어 입력칸에서 `Esc` 가 취소가 아니라 **저장**된다

- 파일: `apps/web/src/routes/ProjectSetup.tsx:1268-1275` (`FloorCodeInput`)

```ts
if (e.key === 'Escape') {
  setValue(saved ?? '');
  (e.currentTarget as HTMLInputElement).blur();   // ← 여기서 onBlur 가 동기로 터진다
}
```
`setValue` 는 배치돼 **아직 리렌더되지 않았다.** `blur()` 는 네이티브 focusout 을 **동기로** 발생시키고
React 의 위임 리스너가 그 자리에서 `onBlur={() => onCommit(floor.id, value)}` 를 부른다.
이때 `value` 는 **직전 렌더의 클로저 = 사용자가 방금 친 문자열**이다. → 취소하려던 값이 저장된다.

**재현.** 층 접두어 칸에 `ZZ` 를 치고 `Esc` → 칸에 `ZZ` 가 남고 IndexedDB 에도 `ZZ` 가 들어간다.
builder 체크리스트 A-2(*"Esc 를 누르면 입력이 취소돼야 한다"*)가 실패한다.

**수정.**
```ts
const skip = useRef(false);
// Escape: skip.current = true; setValue(saved ?? ''); blur();
// onBlur:  if (skip.current) { skip.current = false; return; } onCommit(floor.id, value);
```

### [보통 3] `외벽`·`외부` 부분일치가 층 이름 전체를 삼킨다 — `지상3층 외벽` → `W`(9500)

- 파일: `packages/project-core/src/floorOrder.ts:60-70`

EXTERIOR 검사가 `includes` 이고 **ABOVE/BELOW 검사보다 앞**에 있다.
`3층 외벽` · `지하1층 외부계단` 같은 이름은 이제 `EXTERIOR`(sortOrder 9500, 접두어 `W`)로 읽힌다.

영향 범위(코드로 추적함):
- `floorCodeOf` → 그 층 결함 NO 열이 `3F-01` 이 아니라 `W-01`. **심각 1 때문에 자동으로 발동한다.**
- `floorsNeedingOrderCheck` → 예전엔 `UNKNOWN`(검사 제외)이던 이름이 이제 9500 과 비교돼
  **`순서 확인` 배지가 새로 뜬다**(builder 알려진 한계 4).
- 저장된 `Floor.sortOrder` 는 안 바뀐다(파서는 신규 생성·경고에만 쓰인다) → 데이터 손상은 없다.

스펙 §5-5(b)가 이 패턴 목록을 명시했고 *"기존 패턴과 겹치지 않는다"* 고 검사했지만,
그 검사는 **`외부`가 `1층`을 포함한 이름 안에 들어올 수 있다**는 경우를 안 봤다.

**수정.** 층 번호 패턴이 먼저 매치되면 그쪽을 이긴다 — EXTERIOR 검사를 `ROOFTOP` 앞이 아니라
`ABOVE`/`BELOW` **뒤**로 내리거나, 완전일치+짧은 이름으로 좁힌다(`s === '외부'` · `s === '외벽'` 등).
후자가 스펙 의도(*"사용자는 '외부'라고 입력한다"*)에 더 가깝다.

---

## 3. 경미

### [경미 1] 상태 색이 CSS 에 하드코딩됐다 — 이미 변수가 있다
`apps/web/src/styles.css:3119-3121` 이 `#e5342a` · `#7c4dff` · `#9aa4b0` 을 직접 쓴다.
같은 파일 `:36-38` 에 `--defect-current` · `--defect-prev` · `--defect-repaired` 가 이미 있다.
예약색을 바꾸는 날 다이얼로그 견본만 조용히 어긋난다. `var(--defect-*)` 로 바꾸면 된다.

### [경미 2] 출력 화면 층 칩은 접두어를 안 붙인다
`apps/web/src/routes/export/FloorChips.tsx:61` `formatFloorRange` 는 `①–12` 를 그대로 쓴다.
파일에는 `1F-01 – 1F-12` 가 나가는데 화면 미리보기는 `①–12` 다. 기능 문제는 아니지만
사용자가 "화면과 파일이 다르다"고 신고할 수 있는 지점이다.

### [경미 3] 새 optional 필드에 읽기 정규화 함수가 없다 — 관례가 갈린다
`apps/web/src/data/idb/repo.ts:807-833` 은 `normalizeMemo` · `normalizeDrawing` 으로
**읽는 자리 한 곳에서** 옛 레코드를 정규화한다. 이번에 늘어난 `Project.titleBlock`/`legend` ·
`Floor.code` 는 그 관례를 쓰지 않고 **호출부마다 `??`** 로 받는다.
지금은 전 호출부가 지킨다(추적 완료: `projectTitleBlockOf`/`projectLegendOf`/`floorCodeOf`/
`FloorCodeInput`/`setFloorCode` 전부 `undefined` 안전). 다만 새 호출부가 늘 때 깨지기 쉽다.

### [경미 4] `DEFAULT_PROJECT_TITLE_BLOCK` 이 `DEFAULT_DRAWING_TITLE_BLOCK` 의 값 복제다
`packages/project-core/src/types.ts:292-301` ↔ `:271-281`. 8개 값이 지금은 일치한다(확인함).
한쪽만 고치면 승격 결과와 새 도면 기본값이 갈린다.
`const DEFAULT_PROJECT_TITLE_BLOCK = (({drawingName, ...r}) => r)(DEFAULT_DRAWING_TITLE_BLOCK)`
같은 파생이면 갈릴 수 없다.

---

## 4. builder 가 답을 요청한 4항목

### ① `CanvasRoute` 범례 `useMemo` 의존 배열 — **충분하다 (조건부)**

`[currentDrawing?.id, project?.legend, lgPreview, legendSig]` 를 `legendConfigFor` 가 실제로 읽는
값과 맞대 봤다.

| `legendConfigFor` 가 읽는 것 | 커버하는 dep |
|---|---|
| `drawing` 존재 · `drawing.id`(필터) | `currentDrawing?.id` ✅ |
| `lg.enabled` · `lgScale` · `showTypes` · `status*` 3종 | `project?.legend` — `applyTitleBlock` 이 **새 객체**를 만드므로 참조가 바뀐다 ✅ 승격도 새 객체 ✅ |
| override | `lgPreview` ✅ |
| 결함 유형 구성 | `legendSig` 의 types 부분 ✅ |
| 결함 **상태** 구성(D15) | `legendSig` 의 statuses 부분 ✅ — G-2 에서 추가한 것이 정확히 이 구멍이었다 |

**남는 stale 경로 1개(기존과 동일, 이번 회귀 아님):** `defectTypeId` 는 그대로인 채
`defectTypeName` **만** 바뀌면 서명이 안 변해 범례 설명 문구가 옛 이름으로 남는다.
행 **순서**(첫 등장 seq 순)가 바뀌는 경우도 서명이 정렬돼 있어 안 잡힌다.
배치3 이전 코드도 같았으므로 이번 판정에는 넣지 않는다.

### ② `TitleBlockDialog` 의 `onPreview` ref 패턴 — **안전하다**

언마운트 정리(`TitleBlockDialog.tsx:76-81`)가 `(null, null)` 을 보내는 시점을 추적했다.

- **저장 경로:** `onApply` → `applyTitleBlock`(`CanvasRoute.tsx:437-462`)이 **동기로**
  `setProject(nextProject)` 를 먼저 부른다. 다이얼로그 언마운트는 그 뒤 async 블록의
  `setTitling(false)`(`:456`)에서 일어난다. 즉 오버라이드를 버릴 때 `project` 에 **이미 새 값**이
  들어 있다 → `titleBlockConfigFor` 폴백이 같은 값을 낸다. **화면이 안 튄다.** ✅
- **취소 경로:** 저장된 값으로 되돌아가는 것이 의도다. ✅
- **마운트 직후:** `useEffect([tb,lg])` 가 초기값으로 한 번 더 흘려보내지만 저장값과 동일. 무해. ✅
- `previewRef` 로 인라인 콜백을 의존에서 뺀 것은 `Form.tsx` 의 `onClose` 처리와 같은 수법이고,
  플랜리뷰가 §7 에서 지적했던 "인라인 함수 의존 → 매 렌더 재실행" 을 정확히 회피한다. ✅

### ③ 승격이 두 진입점에서 동시에 — **같은 탭 안에서는 안전. 다른 탭은 이론적 위험만**

- **결정론:** `promoteProjectDecor` 는 순수 함수이고 정렬 키가 `[층 sortOrder → 도면 sortOrder → 도면 id]`
  로 전순서다(`projectDecor.ts:29-38`). 어느 진입점에서 돌아도 **같은 값**이 나온다.
  `projectDecor.test.ts` 가 입력 순서 무관까지 고정한다. ✅
- **같은 탭 IDB 경합 — 검산함.** `CanvasRoute.tsx:143` 의 `putProject(promoted)` 와
  `:165` 의 `touchProject`(get→put 하는 **read-modify-write**)가 둘 다 fire-and-forget 이다.
  둘 사이에 `await` 가 없어 `putProject` 의 `readwrite` 트랜잭션이 **먼저 생성**되고,
  IndexedDB 는 스코프가 겹치는 트랜잭션을 **생성 순서대로** 처리한다.
  → `touchProject` 는 승격된 레코드를 읽는다. **승격이 덮여 사라지는 경로 없음.** ✅
- **다른 탭:** 탭 A 가 `ProjectForm` 에서 용역명을 고치는 사이 탭 B 가 stale 스냅샷으로
  `{...project, titleBlock, legend}` 를 쓰면 이름이 되돌아갈 수 있다. 다만 이건 이 앱의
  `putProject` 전체가 공유하는 기존 성질(`ProjectForm.tsx:148` · `Settings.tsx:208` 도 같다)이고
  배치3이 새로 만든 것이 아니다. **이번 판정 대상 아님.**

### ④ `Export.tsx` 의 `PER_FLOOR` 자동 제안 — **한 번만 적용된다. 사용자 선택을 덮지 않는다**

`Export.tsx:119-131` 이 `initialized.current` 안에 있고 이 ref 는 어디서도 `false` 로 돌아가지 않는다.
`reloadRuns`(`:156`)는 `setRuns` 만 하고 `setParams` 를 안 건드린다.
`[생성]` 후에도 `params` 는 유지된다. ✅

**다만 심각 1 때문에 이 가드는 실질적으로 무의미하다** — 조건식이 거의 항상 참이라
"제안"이 아니라 "모든 용역의 새 기본값"이 됐다.

---

## 5. 도메인 불변식 검수표

| # | 불변식 | 결과 | 근거 |
|---|---|---|---|
| 1 | 마커 좌표는 정규화 0~1 로만 저장 | ✅ 통과 | 배치3 diff 전체에 좌표를 읽거나 쓰는 코드가 없다. `applyTitleBlock` 은 `titleBlock`/`legend` 만 갈아 끼운다(`CanvasRoute.tsx:443-449`). 풍선 위치 계산(`autoLabelNorm`)도 미변경 |
| 2 | 출력 번호를 저장하지 않는다 | ✅ 통과 | `ExportRun.mapping` 은 `{no:number, photoNo}` 그대로(`Export.tsx:222`). `formatDefectNo` 는 표기 전용이고 결과가 어디에도 안 들어간다. `ExportParams.floorCodes` 는 **접두어 문자열이지 번호가 아니다** — 스펙 §5-5(f)가 명시 승인 |
| 3 | 로컬 우선 쓰기 (서버 응답 대기 없음) | ✅ 통과 | 서버 호출 없음. `applyTitleBlock` 은 `setProject`/`setDrawings` 를 **먼저** 하고 IDB 는 뒤에서 쓴다. 승격도 `void guard(...)` 로 화면을 안 막는다 |
| 4 | 면적 계산 (나눗셈 순서·절사·개소 미곱) | ✅ 해당 없음 | `outputSize`/`size.ts` 미변경 |
| 5 | 층 정렬은 `sortOrder` 정수 비교 | ✅ 통과 | `orderedDrawings`(`projectDecor.ts:31-37`)가 `fa - fb` 정수 비교. `SORT_EXTERIOR = 9500` 도 정수. 문자열 비교 없음 |
| 6 | 원인·보수방안에 `defectTypeId` FK 직결 금지 | ✅ 해당 없음 | D17 로 이번 범위 제외. `items/` 무변경 |
| 7 | 과업이 설정을 **복사**(FK 참조 아님) | ✅ 통과 | `ensureProjectSettings` 미변경. 승격은 도면 값을 **복사**해 `Project` 에 넣고 도면을 참조하지 않는다(`fromDrawingTitleBlock`) |
| 8 | `isPrimary` 가 항상 정확히 1개 | ✅ 해당 없음 | 사진 경로 미변경 |

**추가 확인 (§10 "절대 어기면 안 되는 것")**

| 항목 | 결과 |
|---|---|
| §10-2 `DB_VERSION` 1 유지 · 마이그레이션 0건 | ✅ `idb/db.ts` 미변경. 새 필드 3종 전부 읽기 시점 정규화(`projectTitleBlockOf`/`projectLegendOf`/`floorCodeOf`). **단 경미 3 참고** |
| §10-2 저장된 `null` 을 일괄로 채우지 않는다 | ⚠️ **해석 확인 필요 · 통과로 본다.** 승격은 여는 시점에 **그 용역 1건만** `Project` 를 쓴다(도면 0건). §5-3(c)가 이 쓰기를 명시 승인했으므로 "일괄"이 아니다 |
| §10-6 `canvas-core` 가 `window`/`document`/React 미참조 | ✅ `legend.ts` 는 `STATUS_COLOR` · `estimateEm` 만 쓴다 |
| **`canvas-core` 가 `project-core` 를 import 하지 않는다** (D13) | ✅ `StatusLegendToggles`/`StatusLegendDefect` 로컬 구조 타입. `legend.ts` import 4개 전부 코어 내부 |
| **`project-core` 가 `canvas-core`/IDB 를 import 하지 않는다** | ✅ `projectDecor.ts` 는 `./types.js` 만 import |
| §10-7 색 예약(빨강/보라/회색) 유지 | ✅ `statusRows` 가 `STATUS_COLOR` 를 그대로 쓴다. 결함유형 행은 여전히 무채색(`LG_INK`) — D8 무손상 |
| §10-4 `assignNumbers()` 서명 무변경 | ✅ 본문에서 지운 것은 `photoNo = 0` 한 줄뿐(`numbering.ts:181`) |

---

## 6. 경계면 교차 비교 — 양쪽 동시 확인

| 경계 | 생산자 | 소비자 | 판정 |
|---|---|---|---|
| NO 셀 타입 (U19) | `damageTable.ts:203` `number \| string` | `damageTableFile.ts:98` `typeof raw === 'number' ? raw : formatDamageCell(...)` | ✅ 문자열이 엑셀에 문자열로 들어간다. `formatDamageCell:232-236` 이 string 을 그대로 반환. **접두어 없으면 셀이 number 그대로**라 합계·정렬 회귀 없음 |
| 〃 인쇄 뷰 | 동상 | `PrintDamageTable.tsx:139` `formatDamageCell` | ✅ 같은 포매터 |
| 〃 `text` 파생 | `damageTable.ts:220` | 테스트 `text.no === '1F-01'` | ✅ |
| 접두어 스냅샷 | `Export.tsx:195` `floorCodesOf(bundle.floors)` | `exportModel.ts:118` `params.floorCodes ?? 파생` | ✅ 새 run 은 스냅샷 · 옛 run 은 폴백. **단 심각 1** |
| 표 ↔ 도면 번호 일치 | `tableInput` → `floorCodesFor` | `produce.ts:122` · `PrintRoute.tsx:161` → **같은** `floorCodesFor` | ✅ **일원화 확인.** 두 산출물이 같은 소스를 쓴다(U20 달성) |
| 번호 문자열 → 렌더 | `displayNumbersOf` (5글자 문자열) | `renderModel.ts:402-416` (고정 원) | ❌ **심각 2** |
| `legendConfigFor` 시그니처 | `pageDecor.ts:92-97` (4인자) | `CanvasRoute.tsx:404` · `locationMap.ts:225` | ✅ 호출부 2곳 모두 `project` 전달. 3번째 인자 위치·타입 일치 |
| `titleBlockConfigFor` | `pageDecor.ts:39-43` | `CanvasRoute.tsx:384` · `locationMap.ts:164` | ✅ |
| `onApply` 시그니처 변경 | `TitleBlockDialog.tsx:46` `(tb, lg, name)` | `CanvasRoute.tsx:919` · `ProjectSetup.tsx:1228` | ✅ 양쪽 다 3인자로 갱신. **인자 순서 일치** |
| `onPreview` | `TitleBlockDialog.tsx:51` optional | `CanvasRoute` 만 전달 · `ProjectSetup` 미전달 | ✅ optional 이고 `?.` 호출 |
| `LegendConfig.statusRows` | `legend.ts:63` | `legendLayout:155` · `legendOps:272` 둘 다 `?? []` | ✅ 옛 객체가 들어와도 안 터진다 |
| `statusRows(cfg, defects)` | `canvas-core` 구조 타입 | `pageDecor.ts:103` 이 `ProjectLegend` + `Defect[]` 를 그대로 넘김 | ✅ 필드명 3개(`statusNew/Pending/Repaired`)·`status` 값 3종 일치 |
| `DrawOp k:'circle'` | `legend.ts:277-282` (`fill` 만) | `renderCanvas2d.ts:60` | ✅ `stroke`/`width` optional |
| 승격 ↔ 저장 | `promoteProjectDecor` → `Project` | `repo.putProject` → `stamp()` | ✅ 도면 레코드 미접촉 확인 |
| `copyStructure` ↔ 새 필드 | `repo.ts:626` `{...f, id, ...}` 스프레드 | 새 용역의 `Floor.code` | ✅ 접두어가 따라온다. 도면 `titleBlock` 도 스프레드로 남아 **새 용역 승격이 옛 설정을 복원한다** |
| `saveFloors(changed, all)` | `ProjectSetup.tsx:203` | `setFloorCode:299` | ✅ 인자 순서 정확 |
| 사진첩 ↔ 접두어 | — | `photoBook.ts:180-186` 캡션 3행에 결함번호 없음 | ✅ builder 판단 확인. 배선 지점이 실제로 없다 |

---

## 7. 확인하지 못한 것

- **실제 렌더 결과.** 도곽·범례가 화면에 그려진 모양, 상태 범례 구분선 굵기, 우측 붙임 모달의
  실제 겹침은 코드로 판단할 수 없다. 다만 **심각 2(풍선 넘침)는 수식으로 확정**했다 — 확인 불필요.
- **엑셀 파일을 연 상태의 NO 열 표시.** 코드 경로(문자열 → `SheetCell.v`)까지만 추적했다.
- **`estimateEm` 의 한글/영숫자 근사 정확도.** 심각 2 의 수정안이 이 함수에 기대므로,
  고칠 때 `1F-01` 같은 혼합 문자열에 대한 근사를 함께 봐야 한다.
- **IndexedDB 실제 옛 레코드.** `undefined` 폴백은 코드로 전부 추적했으나 실제 마이그레이션 없는
  DB 를 열어 확인하지는 못했다.
- **배치1·2 지적의 회귀 여부.** 이번 범위(배치3 4커밋)만 봤다. `194cef8` 이후 관련 파일이
  다시 바뀐 곳은 없었다.

---

## 8. builder 에게 넘기는 수정 요청 (우선순위 순)

| # | 파일:라인 | 조치 | 차단 |
|---|---|---|---|
| 1 | `renderModel.ts:391-416` + `hitTest.ts:78` + `defectGeom.ts:171-201` | 번호 풍선을 텍스트 폭에 맞춰 늘린다(원 → 스타디움). 렌더·히트·자동배치 **세 곳 동시** | **차단** |
| 2 | `floorOrder.ts:110-135` / `exportModel.ts:118` | 심각 1 — **Q54 답변 후** 착수. 답이 "옵트인"이면 `floorCodesOf` 를 수동 입력만 보게 바꾼다 | **차단(질문)** |
| 3 | `exportModel.ts:89-132` | 보통 1 — `params.mode !== 'PER_FLOOR'` 면 접두어를 안 붙인다 | 비차단 |
| 4 | `ProjectSetup.tsx:1268-1275` | 보통 2 — `Esc` 에 `skip` ref 가드 | 비차단 |
| 5 | `floorOrder.ts:60-70` | 보통 3 — EXTERIOR 패턴을 완전일치로 좁히거나 ABOVE/BELOW 뒤로 내린다 | 비차단 |
| 6 | `styles.css:3119-3121` · `types.ts:292-301` · `FloorChips.tsx:61` | 경미 1·4·2 | 여유 시 |
