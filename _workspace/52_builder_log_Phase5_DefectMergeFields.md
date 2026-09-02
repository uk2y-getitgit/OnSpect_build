# 구현 로그 — Phase 5 T1-2 · `Defect` 병합 재료 3필드

**범위:** `50_plan-reviewer_spec_Phase5_TeamSync.md` §6-1 **T1-2** 만.
`Defect` 에 `updatedAt`·`deviceId`·`createdBy` 를 신설하고, 생성·수정·읽기 세 지점에서 올바르게 채운다.
근거: 스펙 §2(최우선 발견) · `DECISIONS.md` **D23**(B안 — 첫 동기화 때 서버가 시각 부여).

**범위 밖(손대지 않음):** 서버·Supabase·동기화 API·로그인 화면·삭제 전파(T1-3)·태블릿 UI(T2-*).

---

## 완료

| 작업 | 파일 | 상태 |
|---|---|---|
| `DefectBase` 타입 신설 + `Defect` 에 교차 | `packages/canvas-core/src/types.ts` | ✅ |
| `defectBase.ts` — 생성 스탬프·저장 스탬프·읽기 정규화의 **정본 한 곳** | `packages/canvas-core/src/defectBase.ts` (신규) | ✅ |
| 배럴 export | `packages/canvas-core/src/index.ts` | ✅ |
| 결함 생성 **3곳** 스탬프 (점 / 영역·화살표 / 자유그리기) | `packages/canvas-core/src/interaction.ts` (1762·1845·1942행 부근) | ✅ |
| `ReduceContext.deviceId` 주석 갱신 (메모 전용 → 결함 포함) | `packages/canvas-core/src/interaction.ts` | ✅ |
| 결함 **쓰기 경로 4곳** 스탬프 | `apps/web/src/data/idb/repo.ts` | ✅ |
| 읽기 정규화 합류 (`normalizeDefect` → `normalizeDefectBase`) | `apps/web/src/data/idb/repo.ts` | ✅ |
| 테스트 헬퍼·샘플 데이터에 필드 채움 | `packages/canvas-core/test/helpers.ts` · `apps/web/src/data/sampleProject.ts` | ✅ |
| 단위 테스트 19개 신설 | `packages/canvas-core/test/defectBase.test.ts` (신규) | ✅ |

### 타입 — `DefectBase` 는 `DefectAttrs` 에 **섞지 않았다**

```ts
export type DefectBase = { updatedAt: number | null; deviceId: string; createdBy: string | null };
export type Defect = { …캔버스 최소형태… } & DefectAttrs & DefectBase;
```

`DefectAttrs` 에 넣으면 `DEFECT_ATTR_KEYS` · `changedAttrKeys` · `pickCarryAttrs` 가 전부 오염된다 —
`[유사결함 불러오기]` 가 남의 `updatedAt` 을 복사하고, Undo 병합 키가 스탬프 때문에 매번 달라진다.
`Memo`(types.ts 104~107행)가 `RecordBase` 를 직접 나열한 것과 같은 이유·같은 모양이다.

**`createdAt` 은 일부러 넣지 않았다.** D23 이 세 필드만 신설하기로 정했고, 입력순서는 `seq` 가 이미 갖고 있다.

### 옛 결함 읽기 — `updatedAt` 은 `null` 을 유지한다 (요구 4의 핵심)

| 필드 | 옛 레코드에 채우는 값 | 이유 |
|---|---|---|
| `updatedAt` | **`null` 유지** | "아직 동기화된 적 없음" 신호. 첫 동기화 때 서버가 받은 시각을 부여한다(D23 B안) |
| `deviceId` | 현재 기기 id (빈 문자열도 메운다) | 과거 사실이 아니라 **현재 관측값**이라 위험이 없다 |
| `createdBy` | `null` | "작성자 미상" — 로그인 이전 결함은 영원히 알 수 없다 |

⛔ `Date.now()` 로 채우지 않는다(스펙 §2-3 "가장 위험하다" — 읽기만 해도 최신이 된다).
⛔ `0` 으로도 채우지 않는다(옛 결함이 항상 지는 쪽이 되어 사무실 PC 데이터가 빈 태블릿에 덮인다).
이 두 가지를 **각각 별도 테스트로 못 박았다.**

같은 이유로 **`newDefectBase(now, …)` 의 `now` 도 `number | null`** 이다 — 호출자가 시계를 안 넘겼을 때
`0`(기존 `Memo` 의 `ctx.now ?? (() => 0)` 관행) 을 쓰면 그 결함이 병합에서 항상 진다.
시각을 모를 때의 정답은 언제나 "서버가 첫 동기화에 부여한다" 이므로 `null` 로 떨어뜨린다.
(실사용 경로인 `apps/web/src/store.ts:395` 는 `now: () => Date.now()` 를 넘기므로 항상 실제 시각이 들어간다.)

### 수정 시 갱신 — 저장 지점에서 한 번만 찍는다

`Photo`·`ItemSettings` 가 `repo.stamp()` 를 통과하는 것과 **같은 규칙**이다.
결함은 `RecordBase` 가 아니라 `DefectBase`(`updatedAt: number | null`) 라 기존 제네릭에 안 들어가므로
`repo.stampDefect()` 를 따로 두고, 규칙의 정본은 `canvas-core/defectBase.ts::stampDefect` 하나다.

| 쓰기 경로 | 위치 | 처리 |
|---|---|---|
| `upsertDefects` (주 경로 — 캔버스 편집 전부) | `repo.ts` | `stampDefect(d, now, deviceId)` |
| `writeRenormalize` (도면 재정규화로 좌표 이동) | `repo.ts` | 〃 |
| `registerDrawings` — 도면 교체 시 `drawingId` 재연결 | `repo.ts` | 〃 |
| `duplicateStructure` — F7 전차 승계 복사 | `repo.ts` | `...newDefectBase(now, deviceId)` (원본 스탬프를 물려받지 않는다) |

`CanvasRoute` 의 `writes.upsert` 는 `recordCommandWrites` → `defectTargetOf(c)` 로 **커맨드가 실제로 건드린
결함만** 담는다(`store.ts:351`). 즉 "안 바뀐 옛 결함이 통째로 다시 저장돼 `null` 표식이 지워지는" 일은 없다.

### `DB_VERSION` 은 1 그대로

optional 필드 추가 + 읽기 정규화로 끝냈다. 새 오브젝트 스토어 0개, 인덱스 0개, 마이그레이션 0건.
`db.ts` 를 열지도 않았다. `canvas-core` 는 window/document/React/`Date.now()` 를 여전히 참조하지 않는다.

---

## 미완료 / 막힌 것

없음. 막히는 스펙 모호함이 없었으므로 `QUESTIONS.md` 에 추가한 항목도 없다.

---

## 검증한 것

| 검증 | 결과 |
|---|---|
| `npm run typecheck` (canvas-core · project-core · web) | ✅ 통과 |
| `npm test` — canvas-core **379개**(신규 19개 포함) | ✅ 전부 통과 |
| `npm test` — project-core **307개** | ✅ 전부 통과 (회귀 없음) |
| `npm run build` (vite 프로덕션) | ✅ 성공 (경고는 기존 chunk-size 하나뿐) |

신규 테스트 19개가 덮는 것:

- 생성 3곳(점·영역·화살표·자유그리기 4케이스) 이 `updatedAt=now` · `deviceId` · `createdBy=null` 을 채운다
- `defaultAttrs` 스프레드가 스탬프를 덮어쓰지 못한다 (스프레드 순서 회귀 방지)
- 시계 미주입 시 `0` 이 아니라 `null` 이다
- `stampDefect` 가 수정 저장 때 `updatedAt`·`deviceId` 를 갈아 끼우고 원본을 변형하지 않는다
- 옛 결함(`updatedAt: null`) 도 실제로 고치면 시각이 붙는다
- **읽기 정규화가 `Date.now()` 로 채우지 않는다** / **`0` 으로도 채우지 않는다** (각각 별도 케이스)
- 이미 스탬프가 있는 결함은 **같은 객체를 반환**한다(참조 비교 — 남의 기기 스탬프를 뺏지 않는다)
- 정규화 멱등성 · 세 필드 말고는 아무것도 안 바뀐다

**미검증(코드로 확인 불가):** IndexedDB 실제 왕복. `apps/web` 에는 테스트 러너가 없다
(`npm test` 는 canvas-core·project-core 두 패키지만 돈다).

---

## 직접 확인해주실 것

이번 변경은 **화면에 보이는 것이 하나도 없다.** 데이터 필드만 늘었다.
따라서 확인 목적은 "기존 동작이 그대로인가" 다.

1. **기존 용역을 열어 도면을 본다** → 결함·번호·색·리더선이 **예전과 완전히 같아야** 정상.
   (옛 결함에 없던 필드를 읽기 시점에 채우므로, 여기서 뭔가 사라지면 정규화가 잘못된 것)
2. **점·영역·화살표·자유그리기로 결함을 하나씩 새로 만든다** → 넷 다 예전처럼 만들어지고
   토스트·번호·선택 상태가 같아야 정상.
3. **결함 속성을 고치고 새로고침한다** → 고친 값이 그대로 남아야 정상.
4. **Ctrl+Z / Ctrl+Shift+Z** → 예전과 동일하게 되돌아가야 정상.
5. **[샘플 용역 만들기]** → 결함 8건이 예전처럼 들어와야 정상.
6. **전차 승계(용역 복제, 결함 포함)** → 승계된 결함이 전부 `전회차 대기` 로 들어와야 정상.
7. **출력 4종을 뽑아 본다** → 이번 변경 전과 **완전히 동일한 파일**이 나와야 정상
   (새 필드는 출력에 한 글자도 실리지 않는다).

무엇 하나라도 예전과 다르면 알려주십시오 — 그 지점만 좁게 고치겠습니다.

---

## 알려진 한계

1. **`updatedAt: null` 을 실제로 해소하는 것은 동기화가 붙어야 가능하다.** 이번 배치에는 동기화가 없으므로
   옛 결함은 계속 `null` 로 남는다. T1-7/T1-8 에서 *"서버가 첫 수신 시각을 부여한다"* 를 구현할 때
   **`updatedAt === null` 인 결함을 그 규칙의 진입점으로 쓰면 된다** — 그러라고 `null` 로 남긴 것이다.
2. **`createdBy` 는 현재 모든 경로에서 `null` 이다.** 로그인(T1-5)이 붙기 전까지는 채울 값이 없다.
   `newDefectBase(now, deviceId, createdBy?)` 의 세 번째 인자가 그때 연결할 자리다.
3. **`repo.listDefects()` 는 정규화를 통과하지 않는다**(기존부터 그랬다 — `normalizeDefectAttrs` 도 안 탄다).
   현재 유일한 호출자인 `Settings.tsx:112` 는 "이 항목이 몇 건에 쓰였나" 를 세기만 하고 다시 쓰지 않으므로
   지금은 안전하다. **동기화가 이 함수를 재사용하려 하면 그때 정규화를 붙여야 한다** — 이번 배치에서는
   범위를 넘어 손대지 않았다.
4. **`duplicateStructure`(F7 승계)는 스펙이 말한 "생성 3곳" 밖이지만 결함 레코드를 새로 만든다.**
   타입상 `...src` 로 원본 스탬프가 딸려오므로 방치할 수 없어 `newDefectBase(now, 기기)` 로 덮었다.
   판단 근거: 승계 결함은 *지금 이 기기에서 새로 만들어지는 레코드*이지 원본의 사본이 아니다
   (id·projectId·status·prevDefectId 를 이미 전부 새로 부여하고 있다).
5. **다른 에이전트가 동시에 손대고 있는 파일과 겹치지 않았다.** 이번 커밋은 아래 8개 파일만 담는다 —
   작업 트리에 함께 있던 태블릿(T2-2) 변경분(`CanvasView.tsx`·`ToolPalette.tsx`·`AimOverlay.tsx`·
   `aimSynth.ts`·`styles.css`·`CanvasRoute.tsx`·`TASKS.md`)은 **건드리지 않았다.**
