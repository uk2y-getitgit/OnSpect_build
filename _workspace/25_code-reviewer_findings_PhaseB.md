# 검수 결과 — Phase B (T9~T16): 출력 화면 P6 · 엑셀 · 4종 산출물 · 출력 이력

검수: code-reviewer · 2026-08-25
범위: `git diff aa25f56..23826fb` (커밋 `33859d9` · `d00a97f` · `f7452a0` + 문서 `23826fb`)
기준: `21_plan-reviewer_spec_S5_Phase4.md` §3-1~3-7 · §4 · §5-C · §6 / `24_builder_log_PhaseB_Export.md`(M1~M12) /
`23_code-reviewer_findings_PhaseA.md` 경미 6 / `DECISIONS.md` D1~D9 / `ASSUMPTIONS.md` K·L·M / `CLAUDE.md`

---

## 판정

**조건부 통과**

- **심각 0건.** 데이터 손실·잘못된 보고서 수치·불변식 위반 없음.
- **보통 3건.** 그중 2건(#1·#2)은 이번 라운드의 핵심 가치인 **재현성·사진첩 출력**에 직접 닿는다. 병합 전 수정 권장.
- 경미 4건은 여유 있을 때.

핵심 4가지(4종 번호 공유 · 재계산 없음 · 하이라이트 미유출 · 미완성 미제외)는 **코드에서 전부 확인했고 전부 지켜졌다.**

---

## 가장 먼저 확인한 것 (전부 통과)

| 항목 | 결과 | 근거 |
|---|---|---|
| **IndexedDB `DB_VERSION` 1 유지 · 새 스토어/인덱스 0** | ✅ | `db.ts:15` `DB_VERSION = 1`. `createObjectStore`/`createIndex` 호출은 전부 `createV1()`(122~155행) 안이고 이번 diff 에 변경 없음. `ExportRun` 은 `meta` KV 재사용(`exportRuns.ts:42` `key: exportRun:{id}`) |
| **PDF 라이브러리 0** | ✅ | `apps/web/package.json` 신규 의존성은 `write-excel-file@4.1.1`(+전이의존 `fflate`) **하나뿐**. `jspdf`·`pdf-lib` 없음. PDF 는 `PrintRoute.tsx:33` `@page { size: A4 … }` + `window.print()` |
| **엑셀 라이브러리 동적 분리** | ✅ | `xlsx.ts:64` `await import('write-excel-file/browser')`. 실제 빌드 산출물 확인: 메인 `index-Bd-a9KFu.js` 안에 `import("./index-DByiMke3.js")` 가 있고 엑셀은 **별도 청크 71.68KB / gzip 19.95KB** 로 분리됨 |
| **`openDb()` 를 화면에서 직접 호출 0** (Phase A 경미 6) | ✅ | 전체 `apps/web/src` 에서 `openDb()` 호출은 `data/appData.tsx:50` **한 곳뿐**(데이터 프로바이더 = 유일 연결 소유자). `Export.tsx`·`PrintRoute.tsx`·`RunHistory.tsx` 는 전부 `storage.repo.*` 위임(`repo.ts:732~757` 6개 메서드) |
| **`canvas-core` 경계** | ✅ | `packages/canvas-core` 에 이번 diff 변경 **0줄**. `window`/`document`/`Image`/`rAF`/React 를 쓰는 `locationMap.ts`(228행 `document.createElement('canvas')`)는 `apps/web/src/export/` 에 있는 **어댑터**다. 반대로 `damageTable.ts`·`photoBook.ts` 는 `canvas-core` 를 import 하지 않고 로컬 최소 타입(`DamageDefect`·`PhotoBookDefect`)으로 구조적 타이핑 |
| **타입검사 · 테스트 · 빌드 (직접 재실행)** | ✅ | `npm run typecheck` 3패키지 전부 통과 / `npm test` **canvas-core 251 + project-core 212 = 463개 통과** / `npm run build` 통과 |

> builder 로그의 "212개 통과"는 project-core 기준이고 canvas-core 251개는 따로다. 신규 31개(damageTable 22 · photoBook 9)는 실재한다.

---

## 지적 사항

### [보통] 1. 출력 이력의 "결함 N건 추가" 경고가 **필터로 빠진 결함까지 센다** — 아무것도 안 바뀌어도 경고가 뜬다

- 파일: `apps/web/src/routes/Export.tsx:436` · `packages/project-core/src/export/params.ts:132`

**문제**

```ts
// Export.tsx:436
currentDefectIds={bundle.defects.map((d) => d.id)}   // ← 이 용역의 '모든' 결함
```
```ts
// params.ts:132
for (const id of now) if (run.mapping[id] === undefined) added.push(id);
```

`run.mapping` 에는 **그 출력에 포함된 결함만** 들어 있다. 그런데 비교 대상은 **필터 이전의 전체 결함**이다.
그래서 `added` 에는 "새로 생긴 결함"뿐 아니라 **그 출력에서 층 선택·상태 필터·조사구분 필터로 빠진 결함이 전부 섞인다.**

**재현**

1. 층이 3개인 용역에서 지하1층만 선택하고 `[생성]`
2. 곧바로(데이터를 하나도 안 건드리고) 이력 줄을 본다
3. `이 출력 이후 결함이 27건 추가되었습니다 · 번호는 그때 그대로 나갑니다` 가 뜬다 — 나머지 두 층의 결함 27건이다

기본 파라미터(`includeRepaired: false`)만으로도 재현된다. `REPAIRED` 결함이 1건이라도 있으면
**모든 층을 선택해 뽑아도** 곧바로 "1건 추가" 경고가 뜬다.

이건 재현성 UI 의 신뢰를 정확히 반대로 깎는다. 사용자는 "내가 뭘 바꿨지?" 를 찾다가,
몇 번 반복되면 이 경고 자체를 무시하게 된다 — 그러면 **진짜 결함이 추가됐을 때도 못 본다.**

**수정** — 비교 대상을 *그 출력의 파라미터로 걸러낸* 현재 결함 집합으로 바꾼다.
번호부여 진입점(`planExport`)을 그대로 재사용하므로 "각자 세지 않는다" 규칙을 깨지 않는다(드리프트 표시 전용, 출력에 안 쓰인다).

`apps/web/src/routes/export/RunHistory.tsx` — props 를 바꾼다:

```ts
export type RunHistoryProps = {
  runs: readonly ExportRun[];
  /** run 별로 "지금 그 조건이면 대상이 되었을 결함 id" 를 준다 */
  currentIdsFor: (run: ExportRun) => readonly string[];
  // …나머지 그대로
};
```
```ts
// 53행 근처
const drift = diffExportRun(run, currentIdsFor(run));
```

`apps/web/src/routes/Export.tsx` — `<RunHistory>` 호출부(434~436행):

```tsx
<RunHistory
  runs={runs}
  currentIdsFor={useCallback(
    (r: ExportRun) =>
      source ? planExport(source, r.params).rows.map((x) => x.defectId) : [],
    [source],
  )}
  …
```

(훅 규칙상 `useCallback` 은 컴포넌트 본문 위쪽으로 올려 `currentIdsFor` 변수로 빼는 편이 낫다.)

---

### [보통] 2. 사진첩 인쇄 뷰가 `primaryOf()` 를 우회해 **원본 `isPrimary` 를 직접 필터**한다 — 대표가 0장인 저장 상태에서 사진이 빈 칸으로 인쇄된다

- 파일: `apps/web/src/export/printView/PrintRoute.tsx:207`

**문제** — 생산자와 소비자의 계약이 어긋난다.

| | 어떤 사진을 고르는가 |
|---|---|
| 생산자 `buildPhotoBook` (`photoBook.ts:71`) | `primaryOf(list)` → **`normalizePhotos` 를 통과**한다. 대표가 0장이면 **첫 장을 대표로 선출**한다 |
| 소비자 `loadPhotoUrls` (`PrintRoute.tsx:207`) | `if (p.isPrimary && …) keys.add(p.renderBlobKey)` → **정규화 없이 원본 플래그** |

`photo.ts:208` 이 명시적으로 금지한 바로 그 행위다:
> `/** **사진번호·사진첩이 쓰는 유일한 조회 경로다.** 각자 find(isPrimary) 하지 않는다 */`

대표가 2장인 상태는 우연히 안전하다(두 키 다 로드된다). **문제는 대표가 0장인 상태**다 —
그때 `buildPhotoBook` 은 셀을 만들지만 `photoUrls` 에는 그 키가 없어
`PrintPhotoBook.tsx:68` 의 `사진을 불러오지 못했습니다` 로 인쇄된다.

**재현 경로** (읽기 정규화 설계상 저장소는 대표 0장을 가질 수 있다 — 스펙 §2-2 각주가 그 전제다)

1. 결함에 사진 A(대표)·B 가 있다
2. A 를 삭제 → `usePhotos.ts:303` `applyList` 가 B 를 대표로 승격하고 `persist(...)` 로 저장을 **기다리지 않고** 던진다(`usePhotos.ts:166` `void guardRef.current(...)`)
3. 이 쓰기가 실패한다(용량 초과·저장 오류 — `guard` 가 배너를 띄우지만 메모리 상태는 이미 진행됨)
4. 10초 뒤 `commitDelete([A])` 는 성공한다 → **DB 에는 B 만 남고 `isPrimary=false`**
5. 새로고침 후 화면·번호부여·`buildPhotoBook` 은 전부 정상(읽기 정규화가 B 를 대표로 선출)
6. **사진첩 PDF 만 그 칸이 빈다**

**수정** — `PrintRoute.tsx:198~215` 를 통째로 교체한다. 사진첩 셀이 실제로 요구하는 키를 그대로 쓰면 계약이 어긋날 여지가 사라진다:

```ts
import { buildPhotoBook } from '@onspect/project-core';   // 이미 photoBookModel 로 감싸져 있다
```
```ts
// PrintRoute.tsx:94~95 를 교체
if (kind === 'PHOTO_BOOK') {
  // ⭐ 사진첩 셀이 고른 키만 로드한다 — primaryOf() 결과와 100% 일치한다
  const pages = photoBookModel(source, plan);
  photoUrls = await loadPhotoUrls(repo, projectId, pages);
}
```
```ts
// 198~215 를 교체
async function loadPhotoUrls(
  repo: { objectUrl: (key: string, projectId: string) => Promise<string | null> },
  projectId: string,
  pages: readonly PhotoBookPage[],
): Promise<Record<string, string>> {
  const keys = new Set<string>();
  for (const p of pages) for (const c of p.cells) keys.add(c.renderBlobKey);
  const out: Record<string, string> = {};
  for (const key of keys) {
    const u = await repo.objectUrl(key, projectId);
    if (u) out[key] = u;
  }
  return out;
}
```

(`bookPages` useMemo 는 그대로 둬도 되고, 위에서 만든 `pages` 를 `Loaded` 에 담아 재사용해도 된다.
어느 쪽이든 `photoBookModel` 이 결정론적이라 결과가 같다.)

---

### [보통] 3. M2/Q36 이 약속한 **"출력 화면에 안내를 적어 둔다"가 코드에 없다** — 여러 페이지 손상결함표에서 머리말이 첫 장에만 나온다

- 파일: `apps/web/src/export/damageTableFile.ts:30` (`DAMAGE_REPEAT_ROWS = 5` — **어디서도 쓰이지 않는다**) · `apps/web/src/routes/Export.tsx:55` (`KIND_HINT.DAMAGE_TABLE`)

**실사용 영향 평가 (요청 항목 11)**

저장된 근거로 보면 **짧은 표라서 1페이지에 들어간다는 근거는 없다. 반대다.**

- `OnSpect_상세기획.md:283-285` · `317-318` 실측(건양대학교병원 정기안전점검 보고서 제2장 현장조사)에 **NO 93 · 94 · 96** 이 나온다 → 최소 96행. A4 가로 13열 기준 페이지당 35~45행이면 **3페이지 안팎**이고, 대형 시설물은 수백 행이다.
- `docs/benchmark/젠트릭스_분석.md:232` — 머리말이 `건양대학교병원 | 제2장 현장조사 | <계 속>` 이다. **`<계 속>`(continued)이라는 문구 자체가 "페이지마다 반복된다"는 전제 위에서만 뜻이 통한다.** 첫 페이지에만 `<계 속>` 이 찍히면 오히려 어색하다.

→ **실사용에 영향이 있는 것이 맞다.** 다만 데이터가 틀리는 게 아니라 **인쇄 서식**이고,
엑셀에서 `페이지 레이아웃 → 인쇄 제목 → 반복할 행 $1:$5` 를 파일당 한 번 지정하면 해결된다(30초).
그래서 라이브러리 교체(선택지 B)까지는 지금 필요 없다고 본다 — **builder 의 A 안 판단에 동의한다.**

**문제는 A 안의 나머지 절반이 구현되지 않은 것이다.** Q36 A 는
*"출력 화면에 이 안내를 적어 둔다"* 라고 적었는데 `Export.tsx` 어디에도 그 문구가 없다.
안내가 없으면 사용자는 그냥 "머리말이 안 반복되는 앱"으로 받아들인다.

**수정** — `apps/web/src/routes/Export.tsx:55`:

```ts
DAMAGE_TABLE:
  '엑셀 파일로 내려받습니다 (13열 · 층 섹션 · 원인 범례). ' +
  '여러 페이지로 인쇄할 때는 엑셀에서 [페이지 레이아웃 → 인쇄 제목 → 반복할 행]에 $1:$5 를 한 번 지정하세요',
```

그리고 `xp-hint`(418~421행) 옆이나 아래에 같은 문장을 상시 노출하는 편이 낫다 —
`title` 속성은 마우스를 올려야 보인다.

미사용 상수 `DAMAGE_REPEAT_ROWS` 는 그대로 둔다(교체 지점 표시로 쓸모가 있다). 다만 안내 문구에서 `$1:$5` 를 이 상수로 만들어 쓰면 둘이 어긋나지 않는다.

---

### [경미] 4. 폭(`widthMm`) 표시 소수 자리가 **세 곳에서 다르다**

- `damageTable.ts:59` 표 열 정의 `decimals: 1` → 인쇄 뷰·CSV 는 `0.25` 를 **`0.3`** 으로 낸다
- `damageTableFile.ts:98` 엑셀은 숫자 원값을 넣으므로 **`0.25`**
- `photoBook.ts:135` 사진첩 캡션은 `numText(size.widthMm, 2)` → **`0.25`**

폭 프리셋은 `0.1~0.5`(`presets.ts:11`, step 0.1)이라 정상 입력에서는 안 갈린다.
`0.5 초과 → 직접입력` 으로 `0.25`·`1.25` 를 넣었을 때만 세 산출물의 표기가 어긋난다.
"두 산출물이 같은 셀 값을 쓴다"는 `damageTable.ts` 머리주석의 취지와는 맞지 않으므로 언젠가 통일하는 게 옳다.

### [경미] 5. 재다운로드가 `ExportRun.artifacts` 를 중복 누적한다

- `apps/web/src/routes/Export.tsx:205-207`

`[같은 번호로 다시 받기]` 를 누를 때마다 같은 `kind` 의 artifact 가 계속 append 된다.
표시는 `RunHistory.tsx:68` 이 `new Set` 으로 중복 제거하고 이력은 20개 상한이 있어 실해는 없다(builder 한계 #9 에 기록됨).
같은 `kind` 는 최신 것으로 교체하는 편이 레코드가 깔끔하다.

### [경미] 6. 사진첩만 골라 만든 이력을 재다운로드하면 파일 3종이 나온다

- `apps/web/src/routes/Export.tsx:151-158`

`artifacts` 가 비면 `FILE_ARTIFACTS` 전체로 폴백한다(M9 에 명시됨).
"그때 그 파일"이라는 재다운로드의 취지와는 반대 방향이라 기록만 남긴다.
`artifacts.length === 0` 이면 파일을 내지 않고 `[사진첩 PDF]` 로 안내하는 편이 일관된다.

### [경미] 7. `deleteExportRunsOfProject` 가 여전히 호출되지 않는다

- `apps/web/src/data/idb/exportRuns.ts:101`

Phase A 경미 7 과 같은 상태. 용역 삭제가 소프트 삭제뿐(`ProjectList.tsx:66` `softDeleteProject`)이라 **지금 새는 곳은 없다.** 하드 삭제가 생기면 그때 연결한다. 새 지적이 아니라 상태 확인이다.

---

## 요청한 핵심 항목 검증 (재현성)

### 1. 4종이 같은 번호를 공유하는가 — ✅ 확인

`assignNumbers` 의 **호출 지점은 코드 전체에서 `exportModel.ts:53` 단 한 곳**이다
(테스트 파일 제외, `grep` 전수 확인). 4종이 각자 세는 경로가 **없다**.

```
Export.tsx:123  planExport(source, params) ──► plan.rows (배열 1개)
   └─ produce.ts:71   damageTableModel(source, plan, params)     ← 같은 plan
   └─ produce.ts:88   defectListModel(source, plan, params)      ← 같은 plan
   └─ produce.ts:113  displayNumbersOf(plan)  → locationMap      ← 같은 plan
   └─ PrintRoute:138  photoBookModel(source, planFromRun(run))   ← 같은 mapping
```

- `damageTable.ts:192` `no: row.no` / `204` `photoNo: row.photoNo` — 표는 세지 않고 **받는다**
- `photoBook.ts:68` `if (r.photoNo === null) continue` — 사진첩도 `NumberingRow` 를 그대로 따른다 → 사진번호 오름차순이 구조적으로 보장
- `produce.ts:141` `displayNumbersOf` — 조사위치도가 `seq` 가 아니라 `no` 를 받는다(B1 주입 지점)
- `locationMap.ts:197` `displayNumbers: input.displayNumbers`

### 2. `[같은 번호로 다시 받기]` 가 재계산하지 않는가 — ✅ 확인

- `exportModel.ts:68 planFromRun()` — `run.order` 를 돌며 `run.mapping[id]` 를 그대로 읽는다. `assignNumbers` 호출 **없음**
- `Export.tsx:150` `const usePlan = opts.existing ? planFromRun(source, opts.existing) : plan;`
- `Export.tsx:149` `useParams = opts.existing.params` — 머리말·층순서·도면표시 옵션도 **스냅샷 그대로** (화면의 현재 옵션이 새지 않는다)
- `Export.tsx:170` `record = opts.existing ?? {…}` — 재다운로드는 새 `ExportRun` 을 만들지 않는다
- `PrintRoute.tsx:89 · 133 · 138` — 인쇄 뷰도 전부 `planFromRun` 경유. 재계산 경로 없음
- `exportRuns.ts:75 appendArtifact` — `mapping` 은 손대지 않고 `artifacts` 만 늘린다
- `damageTable.ts:292` / `photoBook.ts:70` — `mapping` 에 있으나 사라진 결함은 **건너뛰고 번호는 밀지 않는다**(§3-3 3행 그대로). 테스트로도 덮여 있다(`damageTable.test.ts:215`)

**단 하나의 흠**: `planFromRun` 이 `floorId` 를 *현재* 결함에서 읽는다(`exportModel.ts:73`).
`ExportRun` 에 층 스냅샷이 없어서인데, 결함을 다른 층으로 옮기는 기능이 없으므로 **지금은 도달 불가**다.
층 이동 기능이 생기면 그때 `order` 대신 `{id, floorId}` 를 저장해야 한다 — 기록만 남긴다.

### 3. 선택 하이라이트·hover·가이드선이 출력에 새지 않는가 — ✅ 확인 (빠뜨린 시각 상태 없음)

`canvas-core/renderModel.ts:151-179` 의 `RenderInput` 필드를 **전수 대조**했다:

| RenderInput 필드 | `locationMap.ts` 에서 |
|---|---|
| `selection` | 200-207행 — 6개 하위 필드 전부 `null` |
| `hover` | 208행 `null` |
| `guides` | 209행 `[]` |
| `preview` | 210행 `null` (+ `buildScreens` 호출 2곳 모두 `preview: null`) |
| `dragDefectId` | 211행 `null` |
| `memos` | 212행 — `render.memo` 일 때만, 아니면 `undefined` |
| `ghost` | 221행 `null` |
| `pending` | 222행 `null` |
| `titleBlock` / `legend` | 164 · 224행 — 옵션 `false` 면 `null` |

**`RenderInput` 에 이것 말고 시각 상태 필드가 더 없다.** 빠뜨린 것 없음.
`memoScreens(..., null)`(213-219행) 의 마지막 인자도 선택 메모 없음이다.

부수 확인: `titleBlockOps(config, size, vp)`(`renderModel.ts:210`)가 `vp` 를 받으므로
도곽·범례가 `mapScale` 에 따라 함께 확대된다 — 배율 2로 뽑아도 도곽만 작게 남지 않는다.

### 4. 미완성 결함(D3)이 자동 제외되지 않는가 — ✅ 확인

- `params.ts:65` `includeIncomplete: true` (기본값)
- `numbering.ts:156` — `!params.includeIncomplete` **일 때만** 제외. 기본값에서는 포함되고 `numbering.ts:197` 에서 `warnings.incomplete` 에만 담긴다
- `Export.tsx:336-355` — 경고 배너 + `[목록 보기]`
- `Export.tsx:293` `canGenerate = plan.rows.length > 0 && kinds.length > 0 && busy === null` — **경고는 `[생성]` 을 막지 않는다**
- `OptionsPanel.tsx:76-86` — 끄는 체크박스는 있지만 기본 켜짐이고, `title` 에 *"끄면 출력에서 조용히 빠지므로 기본은 켜져 있습니다"* 라고 사유를 적어 뒀다

### 5. `purgeOrphanPhotos`(Phase A 수정)와 Phase B 산출물 경로의 충돌 — ✅ 없음

고아 사진이 `bundle.photos` 에 섞여 들어와도 **크래시하는 경로가 없다**:

- `defectIdsWithPrimaryPhoto`(`photo.ts:227`) 가 지워진 결함 id 를 포함할 수 있지만, `assignNumbers` 는 `defects` 배열을 순회하므로 그 id 는 애초에 후보가 아니다
- `photoBook.ts:69` `if (!d) continue` — `defects` 에 없는 행은 건너뛴다
- `photoBookModel` → `groupPhotosByDefect` 는 `Map` 조회라 없는 키는 `?? []`(`photoBook.ts:71`)
- `purgeOrphanPhotos` 는 `CanvasRoute.tsx:141` 에서만 돌고, `Export`/`PrintRoute` 는 매 마운트마다 `loadBundle` 을 다시 부른다 — 출력 도중 목록이 바뀌는 경로가 없다

### 6. 엑셀 라이브러리 API 계약 — ✅ 실제 패키지와 대조 확인

builder 보고를 믿지 않고 `node_modules/write-excel-file@4.1.1` 을 직접 열어 확인했다:

- `browser/index.d.ts` — 다중 시트 오버로드 `writeXlsxFile(sheets: Sheet[], options?)` 존재. `xlsx.ts:73` 의 2인자 호출과 일치 ✅
- `types/Sheet.d.ts` — `{ data, …SheetOptions }`. `types/SheetOptions.d.ts` 에 `sheet` · `columns[].width` · `orientation: 'landscape'` 존재 ✅
- `types/CellStyleProperties.d.ts:87-88` — `columnSpan` · `rowSpan` 존재 (`span` 은 구명칭이나 `processMergedCells.js:52` 가 둘 다 받는다) ✅
- `types/Options.d.ts` — `fontFamily` · `fontSize` 존재 ✅
- `browser/ReturnType.d.ts` — `toBlob(): Promise<Blob>` 존재 ✅
- `processMergedCells.js:96` — **병합에 먹힌 칸이 `null`/`undefined` 가 아니면 던진다.** `damageTableFile.ts` 의 헤더 2행을 수기로 대조했다:
  - `head1` = 세로병합 5칸 + `손상규모`(span 4) + `null`×3 + 세로병합 4칸 = **13칸**
  - `head2` = `null`×5 + 폭·길이·면적·개소 + `null`×4 = **13칸**
  - 결함 리스트 9열도 4 + (span 4 + null×3) + 1 로 성립
  → 겹침 위반 없음. 런타임 예외가 나지 않는다 ✅
- `cell.js` — `value: ''` + `type: String` 은 통과(빈 셀에 테두리를 그리려는 `xlsx.ts:111-113` 의 의도가 성립) ✅
- 폴백: `writeWorkbook`(`xlsx.ts:84`)이 예외를 삼키고 CSV(BOM)로 낸다. `fellBack` 이 화면 토스트까지 배선돼 있다(`Export.tsx:213`) ✅

### 7. 신규 단위테스트가 실제로 무엇을 검증하는가 — ✅ 실질적이다

`damageTable.test.ts`(22) — 불변식 #2(`NO 는 NumberingRow 를 그대로 쓴다`) · 불변식 #4(`개소를 곱하지 않는다` · AREA 모드 0/0/면적) · F16 구조체 해석 순서 · F6 원인 코드 재부여 금지 · `—` 표기 · K17 위치 열(동 1개/2개/locationNote) · 층 섹션 분기 · 머리말 3행 · K21 등장 원인만 오름차순 · **§3-3 재현성 3행(사라진 결함 건너뛰기)** · 결함 0건 · 13열↔9열 관계 · 알 수 없는 열 즉시 실패 · M1 숫자 표기

`photoBook.test.ts`(9) — 6장 페이지 분할 · `photoNo === null` 건너뛰기 · **불변식 #8(여러 장이어도 대표 1장)** · 사진 0장이면 빈 페이지를 만들지 않음 · 회전 값 전달 · K19 길이 m 환산(기획서 예시 그대로) · AREA 캡션 · 3행 구성 · `photo.caption` 우선

경계조건·불변식·재현성을 전부 건드린다. 형식적인 테스트가 아니다.

---

## builder 가 스펙과 다르게 정한 것 (M1~M12) 판정

| # | 판정 | 근거 |
|---|---|---|
| M1 숫자 표기(`toFixed` 후 꼬리 0 제거) | **정당** | 실측이 `0.2`(1자리)와 `0.0005`(4자리)를 동시에 요구한다. 엑셀엔 원값을 넣어 화면·엑셀이 같은 모양. 다만 경미 4 참조 |
| M2 인쇄 반복 행 미지원 | **정당하나 미완** | 라이브러리 한계는 사실(패키지 확인함). A 안 판단에 동의. **약속한 UI 안내가 빠졌다 → 보통 3** |
| M3 사진첩은 인쇄 뷰 전용 | **정당** | `[생성]` 이 `await` 뒤에 `window.open` 을 부르면 팝업 차단에 걸린다는 진단이 맞다 |
| M4 처음 열면 지하→지상 전체 선택 | **정당** | §4-1 화면 그림이 이미 구간 표시 상태다. `[해제]` 한 번으로 되돌아간다 |
| M5 `@page` 런타임 주입 | **정당·확인함** | 전역 CSS 에 `@page` 가 **없다**(전수 grep). 다른 화면 Ctrl+P 오염 없음 |
| M6 캔버스 8192px 상한 | **정당** | 초과 시 조용히 빈 PNG 가 나오는 실제 위험. `locationMap.ts:161` 에서 zoom 을 낮춘다 |
| M7 PNG 흰 배경 | **정당** | `locationMap.ts:232-233`. 보고서 부록용으로 맞다 |
| M8 층당 도면 1장 | **정당·확인함** | `repo.ts:363-372` `registerDrawings` 가 같은 층의 기존 도면을 **실제로 걷어낸다**. 여러 장 상태 자체가 도달 불가 |
| M9 재다운로드는 그때 낸 산출물만 | **정당** | 다만 `artifacts` 가 빈 경우 폴백은 경미 6 |
| M10 손상결함표 인쇄 뷰 없음 | **정당** | §5-C 의 인쇄 뷰 작업(T12·T13)에 손상결함표가 없다. 13열은 A4 세로에 안 들어간다 |
| M11 `ExportRun` 을 파일 생성 전에 저장 | **정당·중요** | `Export.tsx:187-190`. 다운로드가 막혀도 번호 스냅샷이 살아야 재현성이 성립한다. 판단이 맞다 |
| M12 `excluded` 를 화면에 안 띄움 | **정당** | 사용자가 방금 고른 조건의 결과다. D3 가 요구하는 건 "포함됐는데 손봐야 하는 것"이고 그건 띄운다 |

---

## 불변식 검수표

| # | 불변식 | 결과 | 근거 |
|---|---|---|---|
| 1 | 마커 좌표 0~1 정규화 (픽셀 저장 금지) | ✅ | 조사위치도가 좌표 변환을 새로 만들지 않는다. `locationMap.ts:157` `ref = {id, imageWidth, imageHeight}` 를 `buildScreens`/`buildBackground` 에 그대로 넘겨 **기존 코어 경로**를 탄다. 정규화 공간에서 각도·거리를 재는 코드 없음 |
| 2 | `defectNo`/`photoNo` 를 저장하지 않는다 | ✅ | DB 스키마(`db.ts:136-139` defects)에 번호 컬럼 없음. `damageRow` 는 `NumberingRow` 를 **받는다**. 저장되는 건 `ExportRun.mapping`(그 출력 1회의 스냅샷, `meta` KV)뿐이고 결함 레코드가 아니다 |
| 3 | 로컬 우선 (서버 응답 대기 후 로컬 쓰기 금지) | ✅ | 이번 diff 에 네트워크 호출 0. `remoteUrl` 은 여전히 항상 `null` |
| 4 | 면적 절사 · 개소 미곱셈 | ✅ | `damageTable.ts:186` `outputSize(d)` 를 그대로 호출. 이 파일에 곱셈 없음. `size.ts:22 trunc4`(`Math.trunc`, 반올림 아님) · `size.ts:31` mm² 로 곱한 뒤 1e6 나눔 · `outputSize` 어디에도 `countEa` 곱셈 없음. 테스트로 덮임 |
| 5 | 층 정렬은 `sortOrder` 정수 비교 | ✅ | `exportModel.ts:165` · `FloorChips.tsx:32-34` · `Export.tsx:510` 전부 `a.sortOrder - b.sortOrder`. 문자열 비교 없음. **표시 순서(sortOrder)와 출력 순서(누른 순서)가 분리**돼 있다 |
| 6 | 마스터 + 연결 (FK 직접 박기 금지) | ✅ | `damageTable.ts:280-283` — 부재 `structural` 과 원인 `code` 를 `ItemSettings` 마스터에서 **조회**한다. 결함에 복제하지 않는다. F16 해석 순서(결함 값 우선 → 마스터 폴백)도 그대로 |
| 7 | 과업 항목은 스냅샷(FK 참조 금지) | ✅ | `Export.tsx:94` · `PrintRoute.tsx:81` 이 `ensureProjectSettings(projectId)` 를 부른다. ORG 설정을 직접 읽는 곳 없음 |
| 8 | 대표사진 정확히 1장 | ⚠️ **부분** | `photoBook.ts:71` 은 `primaryOf()` 만 쓴다 ✅. 사진첩이 대표 없는 결함을 건너뛰고 뒤 번호를 밀지 않는 것도 확인 ✅. **다만 `PrintRoute.tsx:207` 이 정규화를 우회한다 → 보통 2.** 이번 diff 가 `isPrimary` 를 새로 쓰는 경로를 만들지는 않았다 |

---

## 확인하지 못한 것

코드 읽기로 판단할 수 없어 **사용자 실행 확인이 필요한 항목**이다. 숨기지 않고 적는다.

1. **엑셀 파일을 실제로 열었을 때의 모습** — 병합 헤더가 의도대로 보이는지, `맑은 고딕` 이 적용되는지, `landscape` 가 인쇄 설정에 반영되는지. API 계약은 패키지 타입·소스로 대조했지만 **생성된 xlsx 를 연 적은 없다.**
2. **인쇄 페이지네이션** — `break-inside: avoid` 로 사진첩 6장이 A4 1페이지에 실제로 들어가는지. 산술상으로는 3행 × 84mm + 12mm gap = 264mm ≤ 273mm(A4 세로 - 12mm 여백 ×2) 로 **맞지만**, 브라우저 렌더 결과는 다를 수 있다.
3. **90°/270° 회전 사진의 프레임 맞춤** — `PrintPhotoBook.tsx:49-59` 가 CSS `transform` 으로 회전하고 max 치수를 맞바꾼다. `transform` 은 레이아웃 박스를 바꾸지 않으므로 flex 중앙 정렬 + `overflow: hidden` 조합이 눈으로 어떻게 나오는지는 실행해야 안다.
4. **팝업 차단** — `Export.tsx:236` `window.open(..., '_blank', 'noopener')` 이 사용자 클릭 핸들러 안에서 동기적으로 불리므로 통과해야 하지만, 브라우저 설정에 따라 다르다.
5. **연속 다운로드 3~N개** — `downloadSequential` 의 220ms 간격이 실제 브라우저에서 충분한지.
6. **인쇄 탭의 두 번째 IndexedDB 연결** — `db.ts:99` `onversionchange` 는 걸려 있으나, 인쇄 탭이 열린 채로 `앱 초기화(deleteDatabase)` 를 누르면 `blocked` 가 뜰 수 있다. 현재 DB 버전을 올리지 않으므로 평소엔 무해하다.
7. **`apps/web` 테스트 러너 부재** — `planExport`/`planFromRun`/`produceArtifacts`/`locationMap` 은 단위테스트가 없다(builder 한계 #6, J5 와 같은 상황). 위험 로직은 `project-core` 로 빠져 있어 큰 구멍은 아니지만, **보통 1·2 같은 어댑터 경계 버그는 테스트가 못 잡는 자리**다.
8. **`styles.css` 318줄 추가분** — 클래스 충돌·반응형은 눈으로 봐야 한다. 정확성에 닿는 부분(예약색·`@page`)만 확인했다.

---

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-08-25 | Phase B(T9~T16) 최초 검수 — 심각 0 · 보통 3 · 경미 4 |
