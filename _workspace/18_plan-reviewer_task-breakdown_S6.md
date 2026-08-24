# 작업 분해 — S6: 직전 입력 기억

검토일 2026-08-24 · plan-reviewer · 근거 `_workspace/00_input/scope_S6.md` · `DECISIONS.md` **D9**

> 재검토가 아니다. **D9 는 확정이다.** 이 문서는 D9 를 코드로 옮기는 순서와, 옮기다 밟을 함정만 다룬다.

---

## 0. 판정

**바로 착수 가능** (차단 질문 없음)

D9 가 필드 목록·갱신 시점·리셋 범위 세 가지를 다 정해 뒀고, 코드에 이미 `defectSeed` 통로가
뚫려 있다(`ReduceContext.defectSeed` → 결함 생성 4곳). **새로 만들 구조가 없다.**
scope_S6 의 질문 3개는 전부 D9 **안쪽**의 구현 디테일이라 비차단으로 정하고 `ASSUMPTIONS.md` **J1~J5** 에 적었다.

단, 아래 §2 의 **[T-A] 함정 하나는 반드시 J1 방식으로 구현해야 한다.** 반대로 하면 저장 데이터가 오염된다.

---

## 1. scope_S6 질문 3개에 대한 답

### Q1. `Partial<DefectAttrs>` 를 어떻게 갱신하는가 — `undefined` 로 지우기 vs 화이트리스트

**답: 화이트리스트로 골라 담는다. `undefined` 를 넣는 방식은 쓰지 마라.** (비차단 · 가정 **J1**)
타입은 `Partial<DefectAttrs>` **그대로 둔다** — 재정의하지 않는다.

D9 원문이 이미 "위 '이어받음' 필드**만 골라** 갱신한다" 라고 적혀 있어 해석의 여지도 없다.

**`undefined` 방식이 왜 위험한가 (실제 코드 근거):**

`packages/canvas-core/src/interaction.ts` 1441·1499·1567·1714행은 전부 이 모양이다.

```ts
    ...EMPTY_DEFECT_ATTRS,
    ...(ctx.defectSeed ?? {}),
```

객체 스프레드는 **값이 `undefined` 라도 키가 있으면 덮어쓴다.** `defectSeed.widthMm = undefined` 를
넣으면 `EMPTY_DEFECT_ATTRS.widthMm = null` 을 지우고 `undefined` 가 그대로 **새 결함 레코드에 실려
IndexedDB 로 간다.** 뒤따르는 피해:

| 곳 | 증상 |
|---|---|
| `changedAttrKeys` (`from[k] !== to[k]`) | `undefined` vs `null` 이 달라 유령 변경이 잡히고 Undo 병합키가 흔들린다 |
| `normalizeDefectAttrs` 조기 반환 | `sizeMode`·`progress`·`surveyKind` 가 `undefined` 면 매 읽기마다 재정규화 → 참조 비교로 재렌더를 줄이려던 최적화가 죽는다 |
| `inferSizeMode` | `sizeMode: undefined` 로 저장되면 다음 로드에서 모드가 **추론값으로 바뀐다** — 사용자가 고른 AREA 가 WL 로 돌아간다 |
| 저장 위생 | 레코드에 `null` 과 `undefined` 두 종류의 "빈 값" 이 생긴다 |

**구조 (J3):** 키 배열이 아니라 **전 키를 요구하는 Record** 로 선언한다.

```ts
// packages/canvas-core/src/defectAttrs.ts — EMPTY_DEFECT_ATTRS 바로 아래
const DEFECT_SEED_CARRY: Record<keyof DefectAttrs, boolean> = { ... };
```

`Record<keyof DefectAttrs, boolean>` 은 **모든 키를 강제**한다. 나중에 `DefectAttrs` 에 필드가 늘면
**타입 검사가 깨지면서** "이건 이어받나?" 를 그 자리에서 정하게 된다.
배열(`['structureType', ...]`)로 두면 새 필드가 아무도 모르게 "새로 받음" 으로 떨어진다 — 이 파일 상단
주석이 말하는 *"필드가 늘어도 고쳐야 할 곳이 여기 하나다"* 원칙과도 맞다.

`canvas-core` 에 두는 근거: **D13** 이 "나머지 필드의 초기값(`EMPTY_DEFECT_ATTRS`)은 canvas-core 소관이고
project-core 는 그 상수를 모른다" 를 이미 정해 뒀다. 필드별 메타데이터는 canvas-core 쪽이 정본이다.
(`project-core` 의 `AttrsLike` 는 이어받는 13개 중 11개만 갖고 있다 — `progress`·`leak` 이 없다.
거기에 넣으려면 `AttrsLike` 를 넓혀야 하고 `setMember`/`setDefectType` 의 모든 호출자·테스트가 깨진다. **하지 마라.**)

### Q2. Undo/Redo 시 `defectSeed` 도 되돌아가는가

**답: 되돌아가지 않는다. 세션은 앞으로만 간다.** (비차단 · 가정 **J2**)

- D9 §2 는 갱신 시점을 "**`SET_DEFECT_ATTRS` 커맨드가 커밋될 때마다**" 로 못박았다.
  `UNDO`/`REDO` 는 `{ t: 'UNDO' }` 라는 **별개 액션**이고 `setDefectAttrs()` 를 타지 않는다.
  즉 **아무 코드도 안 쓰는 것이 D9 의 문자 그대로**다.
- D9 가 이 방식을 고른 이유("구현이 가장 단순하고 별도 판정 로직이 필요 없다")와도 일치한다.
- `defectSeed` 는 저장 데이터가 아니라 **다음 입력의 시작값**일 뿐이다. 틀려도 폼에서 바로 고치면 되고
  출력물·저장 레코드 어디에도 흔적이 남지 않는다 → 잘못 정했을 때의 대가가 낮다.
- 되돌리는 비용도 낮다: 나중에 뒤집고 싶으면 `UNDO`/`REDO` 케이스에서 `r.command.k === 'SET_DEFECT_ATTRS'`
  일 때 `command.from`(undo) / `command.to`(redo) 를 `pickDefectSeed` 에 넣는 4줄이면 된다.

**사용자에게는 §4 체크리스트로 넘긴다** — 실제로 써 보고 어색하면 그때 뒤집는다.

### Q3. 작업을 몇 개로 쪼개는가

**2개** (§3). 쪼개는 기준은 **패키지 경계**다 — 1번은 `canvas-core`(테스트 가능), 2번은 `apps/web`(배선).

> ⚠️ scope_S6 은 "store.ts 갱신 + 단위테스트" 를 한 덩어리로 봤지만, **`apps/web` 에는 테스트 러너가 없다.**
> 루트 `npm test` 는 `canvas-core`·`project-core` 두 워크스페이스만 돈다. 테스트 파일도 0개다.
> 그래서 **위험한 로직을 전부 `canvas-core` 로 빼고 거기서 검증한다** (가정 **J5**).
> S6 하나 때문에 `apps/web` 에 vitest 를 새로 깔지 마라 — 범위 초과다.

---

## 2. 함정 체크 (구현 전에 읽어라)

| # | 함정 | 판정 |
|---|---|---|
| **T-A** | **스프레드 `undefined` 오염** — 위 Q1. 이번 작업에서 유일하게 데이터를 망칠 수 있는 지점 | 🔴 J1 방식 필수 |
| **T-B** | **갱신은 커밋 뒤에.** `setDefectAttrs` 는 `!d \|\| isLocked(d)` 와 `changed.length === 0` 에서 조기 반환한다. `defectSeed` 갱신을 그 **위**에 두면 전회차(PREV_PENDING)·보수완료(REPAIRED) 결함을 클릭만 해도 씨앗이 오염된다 | 🟡 `applyAndPush(...)` 결과에 얹어라 |
| **T-C** | **`LOAD` 재실행 = 씨앗 리셋.** D9 §3 은 "층 전환에도 유지" 다. 확인 결과 `CanvasRoute` 의 로드 `useEffect` 의존성은 `[storage, projectId, guard]` 이고 층 전환은 `SET_FLOOR` 라 **지금은 안전하다.** 다만 builder 는 `storage`·`guard` 가 READY 이후 참조가 안정적인지 눈으로 확인하라 — 흔들리면 조사 도중 씨앗이 초기화된다 | 🟢 현재 코드 OK · 확인만 |
| **T-D** | **미완성 배지가 안 뜨게 된다.** `REQUIRED_FIELDS = ['memberName','defectTypeName']` 인데 둘 다 이어받으므로 **점을 찍는 즉시 "완성"** 이 된다. D9 가 의도한 결과지만 *"미완성 N건"* 안전망이 새 결함을 더 이상 못 잡는다 | 🟡 의도됨 · §4 로 사용자 확인 |
| **T-E** | **`sizeMode` 만 이어받고 측정값은 초기화** → 새 결함이 `sizeMode:'AREA'` + 면적 전부 `null` 로 시작한다. `EMPTY_DEFECT_ATTRS` 도 `'WL'` + `null` 조합이라 **표현 가능한 정상 상태**다. 폼이 이 조합에서 깨지지 않는지만 본다 | 🟢 정상 |
| **T-F** | **연동 규칙(§3-6) 정합성** — `memberId`/`memberName`/`structural`, `defectTypeId`/`defectTypeName` 을 **짝으로** 이어받으므로 id 와 name 이 어긋날 수 없다. `structural: null`("부재 마스터 값을 따름")도 그대로 옮겨도 뜻이 유지된다 | 🟢 문제없음 |
| **T-G** | **번호 3종 분리** — `seq`(입력순번)는 `maxSeq + 1` 로 생성 시점에 계산되고 `defectSeed` 에 없다. 출력번호·사진번호는 애초에 `DefectAttrs` 에 없다 | 🟢 위반 없음 |
| **T-H** | **좌표·스타일 불간섭** — `DefectAttrs` 에는 `marks`·`label`·`style` 이 없다(`attrsOf` 가 걸러 낸다). 씨앗이 위치나 스타일을 옮길 경로가 구조적으로 없다 | 🟢 위반 없음 |
| **T-I** | **오프라인 우선** — 세션 메모리만 만진다. 저장 경로(`writes`)에 새로 얹는 것이 없다. IndexedDB 버전 그대로 | 🟢 위반 없음 |

---

## 3. 작업 목록 (builder 용)

### 작업 1 — `canvas-core`: 이어받는 필드 정의 + 골라 담기

**파일:** `packages/canvas-core/src/defectAttrs.ts` (+ `test/s2b.test.ts` 또는 새 `test/s6.test.ts`)

1. `EMPTY_DEFECT_ATTRS` 바로 아래에 `DEFECT_SEED_CARRY: Record<keyof DefectAttrs, boolean>` 를 선언한다.
   **D9 표 그대로:**
   - `true` (13): `structureType` · `memberId` · `memberName` · `structural` · `defectTypeId` ·
     `defectTypeName` · `sizeMode` · `progress` · `leak` · `causeId` · `causeName` · `repairId` · `repairName`
   - `false` (9): `surveyKind`(J4) · `locationNote` · `widthMm` · `lengthMm` · `areaM2` ·
     `areaWMm` · `areaHMm` · `countEa` · `memo`
   - 합계 22 = `DefectAttrs` 전 필드. 하나라도 빠지면 타입 검사가 잡는다.
2. `export function pickDefectSeed(a: DefectAttrs): Partial<DefectAttrs>` — `true` 인 키만 **대입**한다.
   `false` 인 키는 `undefined` 를 넣는 것이 아니라 **키를 만들지 않는다.**
3. 파일 상단 주석의 *"canvas-core 는 이 값을 **해석하지 않는다**"* 에 한 줄 덧붙인다 —
   필드별 메타데이터(초기값·키 목록·이어받기 여부)는 이 파일이 정본이라는 것(D13 근거).
4. `index.ts` 는 이미 `export * from './defectAttrs.js'` 라 **손댈 것 없다.**

**완료 확인 기준** (전부 자동 검증 가능)
- [ ] `pickDefectSeed(attrs)` 결과에 대해 **`Object.hasOwn(seed, 'widthMm') === false`** — `toBeUndefined()` 가
      아니라 **키 부재**를 단언한다. 이것이 T-A 를 잡는 유일한 단언이다 (`locationNote`·`countEa`·`memo`·`areaM2` 도 같이)
- [ ] 이어받는 13개는 값이 그대로 실린다. **`memberId: null` 같은 명시적 `null` 도 그대로 실린다**
      (사용자가 부재를 비운 것을 "안 바뀜" 으로 되돌리면 안 된다)
- [ ] 합성 왕복: `{ ...EMPTY_DEFECT_ATTRS, ...pickDefectSeed(prev) }` 결과에서
      새로 받는 9개가 **`EMPTY_DEFECT_ATTRS` 와 정확히 같다**(`null`/`false`/`'WL'`… — `undefined` 없음)
- [ ] 실제 생성 경로 검증: `test/s2b.test.ts` 의 `createDefect(seed)` 헬퍼(193행~)를 재사용해
      `reduce()` 로 만든 새 결함이 부재·결함유형·진행여부·누수여부를 이어받고, 폭·길이·개소·메모는 비어 있음을 확인
- [ ] `npm run test` · `npm run typecheck` 통과

### 작업 2 — `apps/web`: 커밋 시점에 씨앗 갱신

**파일:** `apps/web/src/store.ts` 단 하나

1. `setDefectAttrs`(360행) 의 마지막 `return applyAndPush(state, {...})` 를 커밋 결과에 씨앗을 얹는 형태로 바꾼다.
   **조기 반환 두 개(`!d || isLocked(d)` · `changed.length === 0`) 뒤여야 한다** (T-B).
   씨앗의 출처는 `next` 가 아니라 **`to`**(= `attrsOf(next)`, 이미 attr 키로 정규화된 값)를 쓴다.
2. `AppState.defectSeed`(85~89행) 주석을 갱신한다 — 지금은 "설정 스냅샷에서 온다(D6)" 라고만 돼 있다.
   **최초값은 `seedAttrs()`, 그 뒤로는 직전 커밋이 덮어쓴다(D9)** 를 적는다.
3. `pickDefectSeed` 를 `@onspect/canvas-core` import 목록에 추가한다.
4. **`interaction.ts` · `CanvasRoute.tsx` 는 건드리지 않는다.** (D9 명시)
   `runInput` 의 `defectSeed: state.defectSeed`(336행)도 그대로 — 이미 최신 씨앗을 넘긴다.
5. `UNDO`/`REDO` 케이스에 **아무것도 추가하지 않는다** (J2).

**완료 확인 기준**
- [ ] `npm run typecheck` (3개 워크스페이스) · `npm run build` 통과
- [ ] `store.ts` 외 `apps/web` 파일 변경 0건 · `packages/canvas-core/src/interaction.ts` 변경 0건 (diff 로 확인)
- [ ] `UNDO`/`REDO`/`LOAD`/`SET_FLOOR` 케이스 코드에 변경 없음 (diff 로 확인)

**커밋 2개** — 작업 1 · 작업 2 각각. (작업 1 만으로는 동작이 안 바뀌므로 안전하게 분리된다)

---

## 4. 사용자에게 넘길 확인 항목 (리더가 최종 보고에 붙일 것)

동작을 바꾸는 판단이라 **화면에서 봐야 아는 것들**이다.

- [ ] **핵심** — 같은 부재·결함유형으로 점을 연달아 3개 찍는다. 2번째부터 부재·결함유형·발생원인·
      보수방안·진행여부·누수여부가 **이미 채워져 있고**, 폭·길이·개소·위치보조·메모는 **비어 있는가**
- [ ] **층 전환** — 다른 층으로 갔다가 점을 찍어도 씨앗이 유지되는가 (D9 §3)
- [ ] **새로고침** — F5 후에는 씨앗이 초기화되고 용역 기본 구조유형만 남는가 (D9 §3)
- [ ] **T-D** 점을 찍은 직후 그 결함이 **"미완성" 로 안 잡히는데** 괜찮은가.
      (부재·결함유형이 이미 채워졌으니 규모를 안 넣어도 경고가 없다. 의도된 결과지만 확인 필요)
- [ ] **J2 / Undo** — 부재를 잘못 바꾼 뒤 `Ctrl+Z` 로 되돌리고 새 점을 찍으면
      **되돌리기 전의(=잘못 고른) 부재**로 시작한다. 어색하면 알려 달라 — 뒤집는 데 4줄이면 된다
- [ ] **옛 결함 편집** — 30분 전에 찍은 결함을 선택해 메모만 고쳐도 그 결함의 분류가 씨앗이 된다
      (D9 §2 "마지막으로 만졌던 값" 의 결과다). 실제로 써 보고 거슬리면 알려 달라
- [ ] **전회차/보수완료 결함**(보라·회색)을 클릭해도 씨앗이 안 바뀌는가 (T-B)

---

## 5. 질문 / 차단

**차단 질문 없음. `QUESTIONS.md` 에 추가한 항목 없음.**
비차단 가정 5건은 `_workspace/ASSUMPTIONS.md` **§J (J1~J5)** 에 기록했다.
