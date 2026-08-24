# 검수 결과 — S6 "직전 입력 기억" (D9)

검수일 2026-08-24 · code-reviewer
대상 커밋 `18bfd24`(작업1) · `0a58b02`(작업2) — `git diff f49cd2d..HEAD`
근거 `DECISIONS.md` **D9** · `18_plan-reviewer_task-breakdown_S6.md`(T-A~T-I) · `ASSUMPTIONS.md` **J1~J5**

---

## 판정

**심각 0건, 통과.**

지적은 **경미 3건**뿐이고, 그중 하나(N-1)만 사용자 확인이 필요하다. 어느 것도 수정 없이 병합 가능하다.
builder 가 로그에 적은 주장은 **전부 직접 재확인했고 거짓이 없었다.**

---

## 중점 항목 검증 결과

### T-A — `undefined` 오염 (🔴 유일한 데이터 파괴 지점) → **통과**

`packages/canvas-core/src/defectAttrs.ts:104`

```ts
export function pickDefectSeed(a: DefectAttrs): Partial<DefectAttrs> {
  const out: Record<string, unknown> = {};
  for (const k of DEFECT_ATTR_KEYS) if (DEFECT_SEED_CARRY[k]) out[k] = a[k];
  return out as Partial<DefectAttrs>;
}
```

`if` 가 대입 자체를 막으므로 **키가 생기지 않는다.** `undefined` 대입 경로 없음.

테스트 단언도 요구대로다 — `test/s6.test.ts:105`

```ts
for (const k of FRESH_KEYS) expect(Object.hasOwn(seed, k)).toBe(false);
```

`toBeUndefined()` 가 아니라 `Object.hasOwn(...) === false` 다. 9개 전부 + 지정된 5개 개별 단언.

**단언이 실제로 무는지 뮤테이션 테스트로 확인했다.** 구현을
`out[k] = DEFECT_SEED_CARRY[k] ? a[k] : undefined` 로 바꿔 돌린 결과 **4개 테스트가 즉시 실패**했다
(키부재 · 키13개 · 합성왕복 · 실제생성경로). 회귀 방지가 종이가 아니라 실제로 작동한다.
검사 후 원본 복구 확인(`git status` 에 `defectAttrs.ts` 없음).

### T-B — 씨앗 갱신 위치 → **통과**

`apps/web/src/store.ts:370-390`. 갱신은 조기 반환 두 개 **뒤**다.

```ts
  if (!d || isLocked(d)) return state;      // ← 잠금 게이트
  ...
  if (changed.length === 0) return state;   // ← 무변화 게이트
  const committed = applyAndPush(state, {...});
  return { ...committed, defectSeed: pickDefectSeed(to) };   // ← 여기
```

`isLocked` 를 직접 확인했다 — `defectGeom.ts:262` `return defect.status !== 'CURRENT';`
→ `PREV_PENDING` · `REPAIRED` 둘 다 걸린다. 잠긴 결함으로 씨앗이 오염될 경로 없음.

### DEFECT_SEED_CARRY 표 ↔ D9 대조 → **완전 일치**

`types.ts:201-245` 의 `DefectAttrs` 필드를 세었다 — **정확히 22개**.

| | 개수 | 대조 |
|---|---|---|
| 이어받음 `true` | 13 | `structureType` `memberId` `memberName` `structural` `defectTypeId` `defectTypeName` `sizeMode` `progress` `leak` `causeId` `causeName` `repairId` `repairName` — D9 왼쪽 칸과 **글자 단위로 일치** |
| 새로 받음 `false` | 9 | `locationNote` `widthMm` `lengthMm` `areaM2` `areaWMm` `areaHMm` `countEa` `memo` (D9 오른쪽 칸 8개) + `surveyKind`(J4) |
| 합계 | **22** | `DefectAttrs` 전 필드와 일치. 누락·오분류 **0** |

`Record<keyof DefectAttrs, boolean>` 선언이라 필드가 늘면 타입 검사가 깨진다(J3 의도대로).
테스트 `s6.test.ts:87` 이 `Object.keys(DEFECT_SEED_CARRY) === DEFECT_ATTR_KEYS` 를 별도로 고정한다.

### 경계면 교차 비교 — `pickDefectSeed` 반환 ↔ `interaction.ts` 소비 → **맞물린다**

4곳(1442·1500·1568·1715) 전부 원문을 열어 대조했다.

```ts
    ...EMPTY_DEFECT_ATTRS,
    ...(ctx.defectSeed ?? {}),
  };            // ← 스프레드가 객체 리터럴의 마지막이다
```

- **덮어쓰기 순서 OK** — 씨앗 스프레드 뒤에 오는 필드가 없다. 4곳 모두 동일.
- **키 오염 불가** — `pickDefectSeed` 는 `DEFECT_ATTR_KEYS` 만 순회하므로 `id`·`seq`·`marks`·`label`·
  `status`·`prevDefectId` 를 덮어쓸 키가 구조적으로 나올 수 없다 (T-G · T-H 재확인).
- **타입 계약 OK** — `ReduceContext.defectSeed?: Partial<DefectAttrs>`(`interaction.ts:100`)와
  `AppState.defectSeed: Partial<DefectAttrs>`(`store.ts:98`)가 같은 타입. 캐스팅 우회 없음.
- **초기 씨앗 경계도 확인** — `CanvasRoute.tsx:123` 의 `seedAttrs(s, b.project)` 는
  `Partial<AttrsLike>` 지만 실제 반환은 `{ structureType }` 하나뿐이고(`apply.ts:141-147`),
  `StructureType = 'RC'|'SRC'|'SS'`(project-core `types.ts:25`)가 canvas-core 쪽
  `'RC'|'SRC'|'SS'|null` 의 부분집합이라 **어긋나는 값이 흘러들 수 없다.**

### `to`(= `attrsOf(next)`)가 정말 정규화된 값인가 → **키 기준으로는 정규화, 값 기준으로는 "입력 신뢰"**

`attrsOf`(`defectAttrs.ts:166`)는 `DEFECT_ATTR_KEYS` 를 돌며 `out[k] = d[k]` 를 **무조건** 한다.
즉 **키는 항상 22개가 보장되지만, 값이 `undefined` 여도 걸러 내지 않는다.**
그래서 `next` 안에 `undefined` 값이 있으면 씨앗에도 실린다.

실제로 도달 가능한지 생산자를 끝까지 따라갔다 — **도달 불가**로 판단한다.

| 단계 | 파일 | 확인 |
|---|---|---|
| 폼 초기값 | `Inspector.tsx:95` | `value={attrsOf(defect)}` — 22키 완비 |
| 필드 변경 12곳 | `defectForm/DefectInfoForm.tsx:79~221` | 전부 `{ ...value, x }` 또는 project-core 헬퍼 |
| 헬퍼 4개 | `project-core/items/apply.ts` | `setStructureType`·`setMember`·`setDefectType`·`setSizeMode` 전부 `{ ...a, ... }` 스프레드. `optionToFields` 도 `?? null` 로 마감 — `undefined` 생성 지점 없음 |
| dispatch | `CanvasRoute.tsx:675` | 받은 `attrs` 를 그대로 넘김 |

→ 아래 **N-2** 로 경미 지적만 남긴다 (S6 이전부터 있던 성질이고, S6 가 새로 만든 위험이 아니다).

### `interaction.ts` · `CanvasRoute.tsx` 변경 0건 → **diff 로 직접 확인, 사실**

```
git diff f49cd2d..HEAD --stat
 apps/web/src/store.ts                   |  20 ++-
 packages/canvas-core/src/defectAttrs.ts |  67 ++++++++++
 packages/canvas-core/test/s6.test.ts    | 227 ++++++++++++++++++++++++++++++++
 3 files changed, 311 insertions(+), 3 deletions(-)
```

코드 파일 3개뿐. `interaction.ts` · `CanvasRoute.tsx` 는 diff 에 아예 없다.
`store.ts` 실질 변경도 **1줄 + 주석**이고 `UNDO`(209행)·`REDO`·`LOAD`(187행)·`SET_FLOOR`(202행)
케이스는 diff 에 잡히지 않았다 — J2 준수.

### T-C — 씨앗이 조사 중 초기화되지 않는가 → **builder 주장 재확인, 사실**

builder 의 주장을 믿지 않고 원본을 직접 읽었다.

- `data/appData.tsx:48-58` — `openDb()` effect 의 deps 가 `[]`. `setStorage` 는 READY 로 **한 번만**.
- `data/appData.tsx:60-69` — `guard` 는 `useCallback(..., [])`. **영구 고정**.
- `CanvasRoute.tsx:131` — 로드 effect deps `[storage, projectId, guard]` → READY 이후 재실행 없음.
- 층 전환은 `replace()` + `SET_FLOOR`(`CanvasRoute.tsx:175-196`)이고,
  `App.tsx:71` 은 `<CanvasRoute projectId floorId />` 를 **`key` 없이** 렌더한다 → 리마운트 없음.
- `store.ts:202-207` `case 'SET_FLOOR'` 은 `defectSeed` 를 건드리지 않는다.

→ D9 §3 "층 전환에도 유지" 코드상 성립.

### 자동 검증 재실행 (builder 주장 대조)

| 항목 | builder 주장 | 내가 실행한 결과 |
|---|---|---|
| `npm run typecheck` | 3 워크스페이스 통과 | ✅ canvas-core · project-core · web 전부 통과 |
| `npm test` | canvas-core 219 · project-core 140 | ✅ **219 passed (13 files)** · **140 passed (8 files)**, `s6.test.ts` 10 tests ✓ |

---

## 지적 사항

### [경미] N-1 · 항목설정·도면업로드로 나갔다 오면 씨앗이 리셋된다

- 파일: `apps/web/src/App.tsx:70` · `apps/web/src/routes/CanvasRoute.tsx:116-124` · `:412` · `:466`
- 문제: `defectSeed` 는 `CanvasRoute` 의 `useReducer` 안에만 산다. 캔버스 툴바의
  **[항목설정]**(`navigate({name:'SETTINGS'})`, 466행) 또는 **도면 업로드**(412행)로 이동하면
  `CanvasRoute` 가 언마운트되고, 돌아올 때 `LOAD` 가 다시 돌아 씨앗이
  `seedAttrs()`(구조유형 하나)로 **초기화된다.**
- 재현: 슬래브·균열로 결함 3개 입력 → [항목설정] 진입 → 뒤로 → 새 점을 찍는다.
  부재·결함유형이 **비어 있다.**
- 스펙 해석: D9 §3 은 *"용역을 여는 동안 유지"* 라고 쓰고, 리셋 조건을
  *"새로고침·용역 나가기(**라우트 언마운트**)"* 라고 괄호로 정의했다.
  항목설정 이동은 **같은 용역 안이지만 라우트 언마운트**라 두 문장이 서로 다른 답을 준다.
  D9 가 리셋 트리거를 "라우트 언마운트" 로 **명시**했으므로 **현재 구현은 D9 문자 그대로다.**
- 수정: **지금은 고치지 마라.** 고치려면 씨앗을 `AppDataProvider` 급으로 끌어올려야 해서
  S6 범위를 넘고, 부작용(용역 A 의 씨앗이 용역 B 로 새는 것)을 막을 코드가 더 필요하다.
  사용자가 실제로 거슬려 하면 그때 별도 작업으로 잡는다 → **아래 사용자 확인 항목에 추가했다.**

### [경미] N-2 · `attrsOf` 는 값이 `undefined` 여도 걸러 내지 않는다 (S6 이전부터)

- 파일: `packages/canvas-core/src/defectAttrs.ts:166-170`
- 문제: `out[k] = d[k]` 를 무조건 하므로, 입력 객체에 없는 필드는 **키는 있고 값은 `undefined`** 가 된다.
  이 값이 `pickDefectSeed` 의 **이어받는 13개** 중 하나라면 T-A 가 막으려던 그 오염이
  (새로 받는 9개가 아니라) **이어받는 쪽 경로로** 재현된다.
- 재현: 이론상 `structural` 이 없는 옛 레코드. `normalizeDefectAttrs`(130행)의 조기 반환은
  `sketch`·`sizeMode`·`progress`·`surveyKind`·`prevDefectId` 다섯 개만 검사하므로
  `structural`·`locationNote` 등이 빠진 레코드는 그대로 통과한다.
  **다만 이 다섯이 다 있는 레코드는 그보다 먼저 도입된 필드도 반드시 갖고 있어** 실제 DB 에서는 만들 수 없다.
- 수정: **S6 에서 고칠 것이 아니다.** S6 가 만든 위험도 아니다(`to` 는 원래도 커맨드·문서에 그대로 들어갔다).
  방어를 하고 싶으면 `pickDefectSeed` 에 `if (DEFECT_SEED_CARRY[k] && a[k] !== undefined)` 한 조건을
  더하는 1줄이면 되지만, 그러면 T-A 의 "키 부재" 계약이 카테고리별이 아니라 값별로 흔들려
  오히려 읽기 어려워진다. **기록만 남기고 두는 것을 권한다.**

### [경미] N-3 · `pickDefectSeed` 가 자기보다 56줄 아래의 `DEFECT_ATTR_KEYS` 를 참조한다

- 파일: `packages/canvas-core/src/defectAttrs.ts:106` ↔ `:160`
- 문제: 함수 선언은 호이스팅되고 호출은 런타임이라 **지금은 안전하다.**
  다만 나중에 이 파일 상단에 `const X = pickDefectSeed(...)` 같은 모듈 최상위 호출이 생기면
  `DEFECT_ATTR_KEYS` 의 TDZ 에 걸려 `ReferenceError` 로 죽는다.
- 재현: 현재 코드로는 재현 불가. 잠재 함정이다.
- 수정: 급하지 않다. 여유 있을 때 `DEFECT_ATTR_KEYS` 선언(160행)을 `EMPTY_DEFECT_ATTRS` 바로 아래
  (43행 뒤)로 올리면 `attrsOf`·`changedAttrKeys`·`pickDefectSeed` 세 소비자 모두가 선언 뒤에 온다.

---

## 함정 체크 재검증 (T-A~T-I)

| # | plan-reviewer 판정 | 내 검증 결과 | 근거 |
|---|---|---|---|
| **T-A** | 🔴 J1 필수 | ✅ **통과** | `defectAttrs.ts:106` 대입 자체를 건너뜀. `s6.test.ts:105` 키부재 단언. **뮤테이션 테스트로 4개 실패 확인** |
| **T-B** | 🟡 커밋 뒤 | ✅ **통과** | `store.ts:372·376` 조기 반환 뒤 `:389`. `isLocked` = `status !== 'CURRENT'` |
| **T-C** | 🟢 확인만 | ✅ **통과** | `appData.tsx:48·60` deps `[]`, `App.tsx:71` `key` 없음, `store.ts:202` 씨앗 미변경 |
| **T-D** | 🟡 의도됨 | ⚠️ **의도대로 발생** | `completeness.ts:13` `REQUIRED_FIELDS=['memberName','defectTypeName']` — 둘 다 이어받으므로 새 점은 즉시 "완성". 사용자 확인 항목 |
| **T-E** | 🟢 정상 | ✅ **표현 가능** | `s6.test.ts:196·205` `sizeMode:'AREA'` + 면적 3종 `null` 확인. 폼 렌더는 사용자 확인 |
| **T-F** | 🟢 문제없음 | ✅ **통과** | id·name 이 `DEFECT_SEED_CARRY` 에서 **짝으로** `true`. 4쌍 전부 확인 |
| **T-G** | 🟢 위반 없음 | ✅ **통과** | `seq` 는 `interaction.ts:1430` `maxSeq+1` 로 생성 시 계산. 씨앗 키에 없음 |
| **T-H** | 🟢 위반 없음 | ✅ **통과** | 씨앗은 `DEFECT_ATTR_KEYS` 22개뿐 → `marks`·`label`·`style` 도달 불가. `s6.test.ts:215` 가 좌표까지 고정 |
| **T-I** | 🟢 위반 없음 | ✅ **통과** | `defectSeed` 는 `AppState` 메모리에만. `writes`·IndexedDB 스키마 변경 0 |

---

## 불변식 검수표

| # | 불변식 | 결과 | 근거 |
|---|---|---|---|
| 1 | 마커 좌표는 정규화 0~1 | ✅ | 씨앗이 `marks` 를 실을 키를 안 가진다. `s6.test.ts:219-225` 가 생성 결과의 x·y 를 0~1 로 단언 |
| 2 | 결함번호·사진번호 미저장 | ✅ | `DefectAttrs` 22필드에 `defectNo`/`photoNo` 없음(`types.ts:201-245`). 씨앗은 그 22개의 부분집합 |
| 3 | 오프라인 우선 (서버 대기 없음) | ✅ | `setDefectAttrs` 는 동기 함수. `applyAndPush` 뒤에 `await` 없이 씨앗을 얹는다. 새 저장 경로 0 |
| 4 | 면적 = 나눗셈 순서·절사·개소 미곱 | ✅ | S6 는 계산 코드를 안 건드린다. `countEa` 는 오히려 `false`(새로 받음)라 엉뚱한 개소가 새 결함에 안 남는다 |
| 5 | 층 정렬은 `sortOrder` 정수 | ✅ | 변경 없음. 씨앗은 층을 모른다 |
| 6 | 원인·보수 테이블에 `defectTypeId` FK 미직결 | ✅ | 변경 없음 |
| 7 | 과업은 설정을 **복사**(참조 아님) | ✅ | `causeId`+`causeName`, `repairId`+`repairName`, `memberId`+`memberName`, `defectTypeId`+`defectTypeName` 를 **전부 짝으로** 이어받는다 — 이름 스냅샷이 id 와 함께 옮겨 가므로 설정이 바뀌어도 값이 흔들리지 않는다 |
| 8 | `isPrimary` 정확히 1개 | ✅ | 사진 경로 미변경 |

---

## 확인하지 못한 것

1. **폼 렌더 (T-E)** — `sizeMode:'AREA'` + 면적 3종 `null` 조합에서 `DefectInfoForm` 의 규모 그리드가
   어떻게 보이는지는 **코드로 판단할 수 없다.** 상태 자체가 유효함은 테스트로 고정했다.
2. **T-D 의 체감** — "미완성 N건" 안전망이 새 결함을 더는 못 잡는 것이 현장에서 괜찮은가는
   사용자만 답할 수 있다. 코드상으로는 D9 가 요구한 그대로다.
3. **J2 (Undo 가 씨앗을 안 되돌림)의 체감** — 의도 확인은 사용자 몫. 뒤집기 비용은 4줄로 여전히 낮다.
4. **`apps/web` 배선 1줄의 단위테스트** — J5 대로 테스트 러너가 없다.
   타입 검사 + 아래 체크리스트로 덮는다. **범위 초과라 요구하지 않는다.**

---

## 직접 확인해주실 것 (리더가 최종 보고에 붙일 것)

builder 가 낸 7개를 그대로 두고 **N-1 하나를 추가**한다.

- [ ] **핵심** — 같은 부재·결함유형으로 점을 연달아 3개 찍는다. 2번째부터 부재·결함유형·발생원인·
      보수방안·진행여부·누수여부가 **이미 채워져 있고**, 폭·길이·개소·위치보조·메모는 **비어 있는가**
- [ ] **층 전환** — 다른 층으로 갔다가 점을 찍어도 씨앗이 유지되는가 (D9 §3)
- [ ] **새로고침** — F5 후에는 씨앗이 초기화되고 용역 기본 구조유형만 남는가 (D9 §3)
- [ ] **N-1 (신규)** — 캔버스 툴바의 **[항목설정]** 에 들어갔다가 뒤로 돌아온 뒤 새 점을 찍으면
      **씨앗이 초기화된다.** D9 문자 그대로지만("라우트 언마운트 = 리셋") 같은 용역 안이라
      어색할 수 있다. 거슬리면 알려 달라 — 별도 작업으로 잡는다
- [ ] **T-D 미완성 배지** — 점을 찍은 직후 그 결함이 "미완성" 으로 안 잡히는데 괜찮은가
- [ ] **T-E 폼** — 직전이 면적(AREA) 모드였다면 새 결함이 **AREA 모드 + 면적칸 전부 빈 상태**로 열린다.
      폼이 이 조합에서 깨지지 않는가
- [ ] **J2 / Undo** — 부재를 잘못 바꾼 뒤 `Ctrl+Z` 로 되돌리고 새 점을 찍으면
      **되돌리기 전의(=잘못 고른) 부재**로 시작한다. 어색하면 알려 달라
- [ ] **옛 결함 편집** — 30분 전 결함의 메모만 고쳐도 그 결함의 분류가 씨앗이 된다 (D9 §2 의 결과)
- [ ] **전회차/보수완료 결함**(보라·회색)을 클릭해도 씨앗이 안 바뀌는가 (T-B)

---

## 질문 / 에스컬레이션

**`QUESTIONS.md` 에 추가한 항목 없음. 차단 없음.**

N-1 은 D9 본문("용역을 여는 동안 유지")과 괄호("라우트 언마운트에서 리셋")가 서로 다른 답을 주는
지점이지만, **괄호가 리셋 트리거를 명시적으로 정의**했으므로 현재 구현이 D9 를 따른 것으로 판정했다.
임의로 통과시킨 것이 아니라 **사용자 확인 항목으로 올려** 두었다.
