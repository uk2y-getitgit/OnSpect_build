# 구현 로그 — 태블릿 배치3 검수(48) 반영 · T-7 후속 수정

**기준:** `_workspace/48_code-reviewer_findings_Tablet3.md` (보통1 · 경미1 · 경미2)
· `_workspace/DECISIONS.md` D21 (확인요청1 승인 · 확인요청2 N9 비차단 · 확인요청3 종결)
**브랜치:** `feat/photo-polish`
**작성일:** 2026-09-02

## 수정 순서 (지켜야 하는 순서였다)

1. **[보통] 샘플 데이터 `prevDefectId`** — 먼저 고쳤다.
2. **[경미1] 리듀서 화이트리스트 `prevDefectId` 가드** — 1번 뒤에 적용했다.
3. **[경미2] `addDisabled` 필수 prop 화** — 위 둘과 독립.

**왜 순서가 중요한가:** 2번은 `CURRENT → PREV_PENDING` 을 `prevDefectId !== null` 일 때만 허용한다.
1번을 먼저 하지 않고 2번만 넣으면, 샘플 데이터의 모든 결함이 `prevDefectId: null` 이므로
되돌리기가 **뷰에서 안 보일 뿐 아니라 리듀서에서도 거부**되어 편도 전환이 더 굳어진다.

## 완료

| 작업 | 파일 | 상태 |
|---|---|---|
| 샘플 결함의 `prevDefectId` 를 표기별로 부여 — `CURRENT` 면 `null`, 그 외(`PREV_PENDING`·`REPAIRED`)는 `prev-${uniqueId}` | `apps/web/src/data/sampleProject.ts:224` | 완료 |
| `setDefectStatus` 화이트리스트에 `d.prevDefectId !== null` 추가 (뷰가 아닌 리듀서를 마지막 관문으로) | `apps/web/src/store.ts:518-524` | 완료 |
| `PhotoSectionProps.addDisabled` 를 **필수 prop** 으로 (기본값 `= disabled` 폴백 제거) | `apps/web/src/ui/photos/PhotoSection.tsx:33-40, 68` | 완료 |

### 1 — 샘플 `prevDefectId` (보통)

```ts
prevDefectId: s.status === 'CURRENT' ? null : `prev-${uniqueId}`,
```

- 상수 `prev-${s.id}` 가 아니라 **결함 인스턴스 id(`uniqueId = ${s.id}-${random8}`)** 를 썼다.
  샘플 용역은 여러 번 만들 수 있고, seed id 만 쓰면 서로 다른 용역의 결함이 같은
  `prevDefectId` 를 공유하게 된다. 결함 id 자체가 이미 용역마다 고유하므로 이걸 접두어에 태웠다.
- `REPAIRED`(`dfx-004`)도 값을 받는다 — 보수완료 역시 전차에서 넘어온 신분이므로 의미가 맞다.
  다만 `REPAIRED` 는 화이트리스트가 어차피 막으므로 되돌리기 동작에는 영향이 없다.
- 존재하지 않는 id 를 넣는 안전성 근거는 D21(확인요청1 승인) — `prevDefectId` 역참조 조회가
  코드 어디에도 없고 FK 제약도 없다.

### 2 — 리듀서 가드 (경미1)

```ts
const allowed =
  (d.status === 'PREV_PENDING' && to === 'CURRENT') ||
  (d.status === 'CURRENT' && to === 'PREV_PENDING' && d.prevDefectId !== null);
```

`setDefectAttrs`(`store.ts:465`)가 스스로 적어 둔 *"마지막 관문을 여기 둔다"* 원칙에 맞췄다.
`PREV_PENDING → CURRENT` 방향에는 조건을 붙이지 않았다 — 전회차 결함이 금회차로 올라오는 데
전차 참조가 있어야 할 이유가 없고, 붙이면 전차 승계 없이 수동 생성한 전회차 표기가 영구히 잠긴다.

### 3 — `addDisabled` (경미2)

기본값 폴백(`addDisabled = disabled`)을 없애고 타입을 `addDisabled: boolean` 으로 바꿨다.
findings 가 제시한 두 선택지 중 **필수 prop** 을 골랐다 — 문구 갈래만 고치면 "잠금 의미가 두 개"
라는 원인은 그대로 남는다. 소비자는 `CanvasRoute.tsx:931` 하나뿐이고 이미 명시적으로 주고 있어
호출부 변경은 없었다. 툴팁 문구는 그대로 두었다: 이제 `addDisabled=true` 는 호출자가
`!canAddPhotos(selected)`(= `REPAIRED`)로 명시한 경우뿐이라 "보수완료" 문구가 정확하다.

## 고치지 않은 것 (지시대로)

| 항목 | 이유 |
|---|---|
| 경미3 — web 계층 테스트 부재 | 스코프 밖(`apps/web` 에 테스트 스위트 자체가 없다. 인프라 도입 필요) |
| 경미4 — Undo 후 "사진 가진 전회차 결함" | D21 에서 리더가 N9 비차단으로 종결 |

## 검증한 것

- `npm run typecheck` — 3패키지(canvas-core · project-core · web) 통과
- `npm test` — **667개 통과** (canvas-core 360 / project-core 307). 실패·스킵 0
- `npm run build` — `vite build` 239 모듈 성공 (기존 chunk 500kB 경고만, 이번 변경과 무관)

### 회귀 검증 방법 (무엇으로 안 깨진 걸 확인했나)

| 위험 | 확인 방법 | 결과 |
|---|---|---|
| 화이트리스트 조건 추가가 기존 전이 테스트를 깨뜨림 | `packages/canvas-core/test/tabletT7.test.ts` 10개 재실행 | 통과. 이 스위트는 커맨드 계층(`applyToDoc`)을 보므로 store 가드와 독립 — 즉 **이번 변경은 커맨드 의미를 건드리지 않았다**는 증거 |
| `addDisabled` 필수화로 다른 호출부가 깨짐 | `grep PhotoSection\|addDisabled` 전수 + `tsc --noEmit` | 소비자 1곳(`CanvasRoute.tsx:922-931`)뿐이고 이미 명시 전달. 타입 검사 통과 |
| 샘플 데이터 타입 변경(`null` → `string`) 이 `Defect` 타입과 충돌 | `tsc --noEmit`(web) | `prevDefectId: string \| null` 이라 통과 |
| 출력 번호 로직 영향 | `numbering.test.ts` 23개 · `damageTable` 25개 · `photoBook` 18개 | 통과. `prevDefectId` 는 채번에 쓰이지 않는다 |

**미검증(코드로 확인 불가):** 화면상 되돌리기 버튼의 실제 노출·클릭 동작, 마커 색 복귀,
토스트 문구 — 아래 체크리스트로 넘긴다.

## 직접 확인해주실 것

> ⚠️ **먼저 샘플 용역을 새로 만들어 주세요.** 이 수정은 샘플 **생성 시점**에 값을 넣는다.
> 기존에 만들어 둔 샘플 용역은 이미 `prevDefectId: null` 로 저장돼 있어 그대로다(마이그레이션 없음).
> 용역 목록에서 샘플을 새로 생성한 뒤 아래를 확인해 주세요.

1. **되돌리기 버튼이 뜬다 (보통1 본론)**
   → 새 샘플 용역 열기 → 지하3층 보라색 마커(전회차, seq 5) 선택 → `+ 사진 추가` 로 사진 1장 추가
   → 빨강·금회차로 전환된 뒤 **우측 패널 하단에 `전회차로 되돌리기` 버튼이 보여야 정상**
   (이전에는 이 버튼이 아예 안 떠서 편도였다)

2. **되돌리기가 실제로 동작한다**
   → 위 1번에서 `전회차로 되돌리기` 클릭
   → 마커가 다시 보라색, 우측 패널 입력칸이 다시 잠겨야 정상. 사진은 남아 있는 게 정상(D21 N9)

3. **금회차 결함에는 되돌리기가 없다**
   → 빨간 마커(원래부터 금회차인 결함) 선택
   → **`전회차로 되돌리기` 버튼이 없어야 정상** (전차 참조가 없는 결함이라 돌려보낼 곳이 없다)

4. **보수완료는 여전히 잠겨 있다**
   → 초록/회색 보수완료 마커 선택 → `+ 사진 추가` 버튼이 **비활성**이고 툴팁이
   "보수완료 표기에는 사진을 추가할 수 없습니다" 여야 정상

5. **사진 추가 버튼 툴팁이 상태별로 다르다**
   → 전회차 마커: "이번 회차에 찍은 사진을 붙이면 … 금회차로 전환됩니다"
   → 금회차 마커: "파일을 골라 추가합니다 …"

## 알려진 한계

1. **기존 샘플 용역은 소급되지 않는다.** 이번 값은 생성 시점 시드다. 이미 IDB 에 있는 샘플
   용역의 전회차 결함은 여전히 `prevDefectId: null` 이라 되돌리기가 안 뜬다.
   마이그레이션을 넣으면 실제 사용자 데이터의 `prevDefectId` 까지 건드리게 되므로 넣지 않았다.
2. `prev-*` 는 **존재하지 않는 결함 id** 다(D21 승인). 앞으로 "전회차 번호 조회"·"전차 사진 나란히
   보기" 같은 역참조 기능이 생기면 샘플에서 조회 실패로 뜬다 — 그때 실제 전차 레코드를 시드하거나
   샘플 전용 처리가 필요하다.
3. 경미4(Undo/되돌리기로 생기는 "사진 가진 전회차 결함")는 D21 N9 대로 남아 있다.
   되돌린 결함은 사진첩에 전회차 신분으로 실린다.
4. `apps/web` 계층은 여전히 테스트 스위트가 없다(경미3). 이번에 손댄 `store.ts` 화이트리스트와
   `sampleProject.ts` 시드는 **타입 검사와 정적 확인으로만** 덮였다.
