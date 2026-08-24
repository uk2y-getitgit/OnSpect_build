# 구현 로그 — S6: 직전 입력 기억 (D9)

작성일 2026-08-24 · builder · 근거 `_workspace/18_plan-reviewer_task-breakdown_S6.md` · `DECISIONS.md` **D9** · `ASSUMPTIONS.md` **J1~J5**

---

## 완료

| 작업 | 파일 | 상태 | 커밋 |
|---|---|---|---|
| 1 — 이어받는 필드 정의 + 골라 담기 | `packages/canvas-core/src/defectAttrs.ts` | 완료 | `18bfd24` |
| 1 — 단위 테스트 10개 | `packages/canvas-core/test/s6.test.ts` (신규) | 완료 | `18bfd24` |
| 2 — 커밋 시점 씨앗 갱신 | `apps/web/src/store.ts` | 완료 | `0a58b02` |

### 작업 1 — `canvas-core`

- `DEFECT_SEED_CARRY: Record<keyof DefectAttrs, boolean>` 을 `EMPTY_DEFECT_ATTRS` 바로 아래에 선언.
  D9 표 그대로 **이어받음 13 / 새로 받음 9 = 22** (`DefectAttrs` 전 필드).
  `surveyKind` 는 `false` (J4 — D9 표 어느 칸에도 없다).
- `pickDefectSeed(a: DefectAttrs): Partial<DefectAttrs>` — `DEFECT_ATTR_KEYS` 를 돌며
  `DEFECT_SEED_CARRY[k]` 가 `true` 인 키만 **대입**한다.
  `false` 인 키는 **키 자체를 만들지 않는다** (J1 / T-A). `undefined` 대입 없음.
- 파일 상단 주석에 "필드별 메타데이터(초기값·키 목록·이어받기 여부)의 정본은 이 파일" 을 덧붙였다 (D13 근거).
- `index.ts` 는 `export * from './defectAttrs.js'` 라 손대지 않았다 —
  `pickDefectSeed`·`DEFECT_SEED_CARRY` 가 자동으로 `@onspect/canvas-core` 에 노출된다.

### 작업 2 — `apps/web`

`apps/web/src/store.ts` **단 하나**만 바꿨다. 실질 변경은 다음 한 줄이다.

```ts
  const committed = applyAndPush(state, { k: 'SET_DEFECT_ATTRS', ... });
  return { ...committed, defectSeed: pickDefectSeed(to) };
```

- 조기 반환 두 개(`!d || isLocked(d)` · `changed.length === 0`) **뒤**다 (T-B).
  `isLocked` 는 `status !== 'CURRENT'` 라 전회차(PREV_PENDING)·보수완료(REPAIRED)를 모두 막는다 —
  잠긴 결함을 클릭·선택만 해서는 씨앗이 바뀌지 않는다.
- 씨앗 출처는 `next` 가 아니라 **`to`**(`= attrsOf(next)`).
- `AppState.defectSeed` 주석 갱신 — 최초값 `seedAttrs()`(D6), 그 뒤 직전 커밋이 덮어씀(D9),
  세션 상태라 영속화 없음, 층 전환 유지, Undo/Redo 로 안 돌아감(J2).
- `pickDefectSeed` 를 `@onspect/canvas-core` import 목록에 추가.
- `UNDO`/`REDO`/`LOAD`/`SET_FLOOR` 케이스 **변경 0건**.

---

## 완료 확인 기준 체크리스트

### 작업 1

- [x] **`Object.hasOwn(seed, 'widthMm') === false`** — `toBeUndefined()` 가 아니라 **키 부재**를 단언.
      `locationNote`·`countEa`·`memo`·`areaM2` 및 새로 받는 9개 전부에 대해 확인 (`s6.test.ts`
      "⚠️ 새로 받는 필드는 키 자체가 없다")
- [x] 이어받는 13개 값이 그대로 실린다. `memberId: null` 같은 **명시적 `null` 도 실린다**
      (`Object.hasOwn(seed,'memberId') === true` + `seed.memberId === null` 로 단언)
- [x] 합성 왕복 `{ ...EMPTY_DEFECT_ATTRS, ...pickDefectSeed(prev) }` 에서 새로 받는 9개가
      `EMPTY_DEFECT_ATTRS` 와 **정확히 같다**(`toBe` 동일성 + `undefined` 아님) · 키 22개 유지
- [x] 실제 생성 경로 — `s2b.test.ts` 의 `createDefect(seed)` 헬퍼 방식을 재사용해 `reduce()` 로 만든
      새 결함이 부재·결함유형·진행여부·누수여부·구조유형·sizeMode·원인·보수방안을 이어받고
      폭·길이·면적3종·개소·위치보조·메모는 `null` 임을 확인
- [x] 덤으로 `DEFECT_SEED_CARRY` 키 집합 == `DEFECT_ATTR_KEYS`, 멱등성, 좌표 0~1 정규화(불변식 1) 단언 추가
- [x] `npm run test` — canvas-core **219 passed** (13 파일, s6 10개 신규) · project-core **140 passed**
- [x] `npm run typecheck` 통과

### 작업 2

- [x] `npm run typecheck` — canvas-core · project-core · web 3개 워크스페이스 전부 통과
- [x] `npm run build` — `vite build` 성공 (115 modules, 406.62 kB)
- [x] `store.ts` 외 `apps/web` 파일 변경 **0건** · `packages/canvas-core/src/interaction.ts` 변경 **0건**
      (`git diff --stat` 으로 확인 — 코드 변경 파일은 `defectAttrs.ts`·`s6.test.ts`·`store.ts` 3개뿐)
- [x] `UNDO`/`REDO`/`LOAD`/`SET_FLOOR` 케이스 코드 변경 없음 (diff 로 확인)

### 함정 체크 결과

| # | 결과 |
|---|---|
| **T-A** 스프레드 `undefined` 오염 | ✅ J1 방식으로 구현. `Object.hasOwn === false` 단언이 회귀를 잡는다 |
| **T-B** 갱신은 커밋 뒤에 | ✅ `applyAndPush(...)` 결과에 얹었다. 조기 반환 2개 아래 |
| **T-C** `LOAD` 재실행 = 씨앗 리셋 | ✅ **확인함.** `appData.tsx` 의 `storage` 는 `openDb()` 완료 시 **한 번만** `setStorage` 되고(마운트 effect deps `[]`), `guard` 는 `useCallback(..., [])` 로 **영구 고정**이다. `CanvasRoute` 로드 effect deps `[storage, projectId, guard]` 는 READY 이후 안정적 → 층 전환(`SET_FLOOR`)으로 재실행되지 않는다 |
| **T-D** 미완성 배지 | 코드 변경 없음. 의도된 결과 — 사용자 확인 항목 |
| **T-E** `sizeMode:'AREA'` + 측정값 `null` | 테스트로 표현 가능한 상태임을 확인 (`createDefect` 결과가 `sizeMode:'AREA'` + 면적 전부 `null`) |
| **T-F~T-I** | 코드 구조상 위반 경로 없음. `DefectAttrs` 에 `marks`·`label`·`style`·번호가 없다는 점은 기존 `attrsOf` 테스트가 이미 고정 |

---

## 미완료 / 막힌 것

없다. 차단 질문 없음 — `QUESTIONS.md` 에 추가한 항목 없다.

---

## 검증한 것

- `npm run typecheck` (canvas-core · project-core · web) — 통과
- `npm run test` — canvas-core 219개 · project-core 140개, 전부 통과 (S6 신규 10개 포함)
- `npm run build` (`vite build` 프로덕션) — 통과
- `git diff` 로 변경 범위 확인 — 코드 파일 3개, 금지된 파일 변경 0건

**미검증(코드로는 확인 불가):** 폼 UI 에서 실제로 씨앗이 채워져 보이는지, 층 전환·새로고침 시 체감 동작.
아래 체크리스트로 넘긴다.

---

## 직접 확인해주실 것

- [ ] **핵심** — 같은 부재·결함유형으로 점을 연달아 3개 찍는다.
      2번째부터 부재·결함유형·발생원인·보수방안·진행여부·누수여부가 **이미 채워져 있고**,
      폭·길이·개소·위치보조·메모는 **비어 있는가**
- [ ] **층 전환** — 다른 층으로 갔다가 점을 찍어도 씨앗이 유지되는가 (D9 §3)
- [ ] **새로고침** — F5 후에는 씨앗이 초기화되고 용역 기본 구조유형만 남는가 (D9 §3)
- [ ] **T-D 미완성 배지** — 점을 찍은 직후 그 결함이 **"미완성" 으로 안 잡히는데** 괜찮은가.
      부재·결함유형이 이미 채워졌으니 규모를 안 넣어도 경고가 없다. 의도된 결과지만 확인이 필요하다
- [ ] **T-E 폼** — 직전 결함이 면적(AREA) 모드였다면, 새 결함이 **AREA 모드 + 면적칸 전부 빈 상태**로
      열린다. 폼이 이 조합에서 깨지지 않는가
- [ ] **J2 / Undo** — 부재를 잘못 바꾼 뒤 `Ctrl+Z` 로 되돌리고 새 점을 찍으면
      **되돌리기 전의(=잘못 고른) 부재**로 시작한다. 어색하면 알려 달라 — 뒤집는 데 4줄이면 된다
- [ ] **옛 결함 편집** — 30분 전에 찍은 결함을 선택해 메모만 고쳐도 그 결함의 분류가 씨앗이 된다
      (D9 §2 "마지막으로 만졌던 값" 의 결과다). 써 보고 거슬리면 알려 달라
- [ ] **전회차/보수완료 결함**(보라·회색)을 클릭해도 씨앗이 안 바뀌는가 (T-B)

---

## 알려진 한계

1. **`apps/web` 쪽 배선은 단위테스트가 없다** (J5 — `apps/web` 에 테스트 러너 자체가 없다).
   `setDefectAttrs` 의 씨앗 갱신 한 줄은 타입 검사 + 위 사용자 확인으로 덮는다.
   위험한 로직(어느 필드를 이어받는가 · `undefined` 금지)은 전부 `canvas-core` 에서 검증했다.
2. **Undo/Redo 는 씨앗을 되돌리지 않는다** (J2, 의도). 뒤집으려면 `UNDO`/`REDO` 케이스에서
   `r.command.k === 'SET_DEFECT_ATTRS'` 일 때 `command.from`(undo) / `command.to`(redo) 를
   `pickDefectSeed` 에 넣는 4줄이면 된다.
3. **`surveyKind` 는 이어받지 않는다** (J4). 나중에 내부조사 모드가 생기면
   `DEFECT_SEED_CARRY.surveyKind` 를 `true` 로 한 글자만 바꾸면 된다.
4. IndexedDB 마이그레이션 없음. DB 버전 **1 유지**. 저장 경로(`writes`)에 새로 얹은 것 없음 —
   `defectSeed` 는 세션 메모리에만 산다 (불변식 3 위반 없음).
