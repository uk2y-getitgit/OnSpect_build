# 구현 로그 — 배치3 검수 반영 (36_code-reviewer_findings_Batch3 §8 + D20)

builder · 2026-08-30
기준: `_workspace/36_code-reviewer_findings_Batch3.md` §8 · `DECISIONS.md` D20(Q54 답변)

---

## 완료

| # | 작업 | 파일 | 상태 |
|---|---|---|---|
| 1 | **[심각1 · D20] 층 접두어를 옵트인으로** | `packages/project-core/src/floorOrder.ts` · `types.ts` · `apps/web/src/routes/Export.tsx` · `ProjectSetup.tsx` · `data/factory.ts` | 완료 |
| 2 | **[심각2] 번호 풍선 원 → 스타디움** (렌더·히트·자동배치 동시) | `canvas-core/src/{shapes,defectGeom,hitTest,renderModel,interaction,constants}.ts` · `apps/web/src/{store.ts,canvas/CanvasView.tsx,export/locationMap.ts}` | 완료 |
| 3 | [보통1] 전체연속이면 접두어를 안 붙인다 | `apps/web/src/export/exportModel.ts` · `routes/export/OptionsPanel.tsx` | 완료 |
| 4 | [보통2] `FloorCodeInput` 의 `Esc` = 취소 | `apps/web/src/routes/ProjectSetup.tsx` | 완료 |
| 5 | [보통3] EXTERIOR 부분일치 → 완전일치 | `packages/project-core/src/floorOrder.ts` | 완료 |
| 6 | [경미1] 상태 색 하드코딩 → `var(--defect-*)` | `apps/web/src/styles.css:3119-3121` | 완료 |
| 7 | [경미4] `DEFAULT_PROJECT_TITLE_BLOCK` 을 파생으로 | `packages/project-core/src/types.ts` | 완료 |

---

## 1. 심각1 — 접두어 옵트인 (D20)

**바꾼 것은 딱 한 곳의 의미다.** `floorCodesOf`(출력 스냅샷 생성)가 이제
`normalizeFloorCode(f.code)` 만 읽는다. 이름에서 파생하지 않는다.

```ts
// floorOrder.ts
export function floorCodesOf(floors) {
  const out = {};
  for (const f of floors) out[f.id] = normalizeFloorCode(f.code);  // 파생 없음
  return out;
}
```

`normalizeFloorCode` 는 **새로 만들지 않았다** — `types.ts:119` 에 이미 있었다
(공백 제거 · 대문자 · 6자 절단). `floorOrder.ts` 가 그것을 import 한다.
중복 정의했다면 `export *` 두 곳에서 같은 이름이 나가 충돌했을 것이다.

`floorCodeOf`(자동 파생)는 **지우지 않고 그대로 남겼다.** 호출부를 정리해
지금은 `ProjectSetup.tsx:1276` 한 곳 — 입력칸 placeholder/툴팁 전용이다.

### 영향 확산 4지점 처리

| 지점 | 조치 |
|---|---|
| `Export.tsx:129` 번호모드 자동 제안 | `floorCodeOf(f) !== null` → 새 `hasAnyFloorCode(b.floors)`. 수동 입력만 본다 |
| `exportModel.ts:118` 옛 run 폴백 | `params.floorCodes ?? floorCodesOf(...)` **구조 유지**(검수자 권고). 폴백이 이제 수동 입력만 읽으므로 접두어를 안 넣은 옛 run 은 값이 전부 `null` → 예전 파일 그대로 |
| `damageTable.ts:203` NO 열 | 코드 무변경. `floorCode === null` 이면 `row.no`(**number**)를 그대로 넣는 분기가 이미 있었다 → 엑셀 셀 타입까지 예전과 동일 |
| `produce.ts:122` · `PrintRoute.tsx:161` 풍선 | 코드 무변경. `floorCodesFor` 결과가 비어 `formatDefectNo(no, null)` = `"1"` |

### 회귀 기준 (체크리스트 D-22) — 코드로 확인한 근거

접두어를 한 곳도 입력하지 않은 용역에서:
1. `hasAnyFloorCode` = false → `DEFAULT_EXPORT_PARAMS.mode = 'CONTINUOUS'`(`params.ts:87`) 유지 → **번호모드 기본값 `전체 이어서`**
2. `floorCodesFor` → `mode !== 'PER_FLOOR'` 이므로 `{}` (설령 PER_FLOOR 로 바꿔도 값이 전부 `null`)
3. `damageRow.no` → `row.no` (number) → NO 열 `1`·`2`·`3`
4. `displayNumbersOf` → `formatDefectNo(no, undefined)` → `String(no)` → 풍선 `1`
5. 풍선 폭: `balloonHalfExtra('1'|'12', 34, 35.7) === 0` → **circle op 그대로** = 픽셀 동일

단위테스트로 고정: `floorOrder.test.ts` → `floorCodesOf — 출력 스냅샷 맵 (D20 옵트인)` 4케이스.
그중 `⭐ 접두어를 안 넣으면 자동 파생하지 않는다`가 D-22 를 직접 지킨다.

---

## 2. 심각2 — 번호 풍선 스타디움

**폭 계산을 함수 하나로 만들고 세 곳이 전부 그것만 본다.**

```ts
// defectGeom.ts — balloonR 과 fontSize 는 같은 단위여야 한다
export function balloonHalfExtra(label, balloonR, fontSize): number {
  if (label === '') return 0;
  const textW = estimateEm(label) * fontSize;             // legend.ts 와 같은 근사
  const w = Math.max(balloonR * 2, textW + fontSize * BALLOON_TEXT_PAD_EM);  // 0.6em
  return Math.max(0, w / 2 - balloonR);
}
```

계산 결과는 `DefectScreen.labelHalfExtra`(스크린 px)에 **한 번 실려**, 렌더·히트·컬링·
여백계산이 전부 그 값을 읽는다. 각자 다시 계산하지 않는다.

| 소비 지점 | 조치 |
|---|---|
| 렌더 `renderModel.ts` | `labelHalfExtra === 0` 이면 **예전 circle op 그대로**, 아니면 `stadiumPolyline` 로 그린다. 선택 글로우·호버 헤일로도 같은 헬퍼(`balloonOp`)를 거친다 |
| 히트 `hitTest.ts:78` | `dist(p, s.label) <= r` → `pointInStadium(p, s.label, r, s.labelHalfExtra)`. `halfExtra=0` 이면 선분이 한 점이라 **예전 원 판정과 수식이 동일** |
| 리더선 `leaderSegment` | `balloonR` 로 자르던 것을 `stadiumBoundaryDist(u, r, e)` 로. `e=0` 이면 정확히 `r` 을 돌려준다 |
| 자동배치 `autoLabelNorm` | 선택 인자 `halfExtraImg` 추가. 가로로 그만큼 더 민다(세로는 그대로). `effectiveLabelNorm(..., labelText)` 이 이미지 px 로 계산해 넘긴다 |
| 뷰 컬링 `intersectsCanvas` | 가로 반폭을 `balloonR + halfExtra` 로 |
| 출력 여백 `locationMap.screensBounds` · `clippedDefects` | 좌우 끝 두 점을 넣어 잰다 — 안 그러면 늘어난 풍선 오른쪽이 PNG 밖으로 잘린다 |

### 폭 소스 배선 (`displayNumbers` 주입)

`buildScreens` 에 optional `displayNumbers` 를 추가하고 **번호를 그리는 호출부 전부** 넘겼다.

| 호출부 | 넘김 |
|---|---|
| `CanvasView.tsx:246`(화면 렌더) | `inp.displayNumbers` |
| `store.ts` `runInput` → `ReduceContext.displayNumbers`(히트·드래그) | `displayNumbersOf(drawingDefects)` — 렌더와 **같은 함수** |
| `locationMap.ts:165`(여백 프로브) · `:237`(본 렌더) | `input.displayNumbers`(= 출력 결함번호) |
| `CanvasRoute.tsx:495`(툴바 위치) | 안 넘김 — **세로 범위만** 쓴다. 가로는 `s.label.x` 한 점 |
| `visibility.ts:41`(결함으로 스크롤) | 안 넘김 — 화면 이동 박스가 몇 px 좁을 뿐. 기능 영향 없음 |

### 회귀 없음의 근거

`GS.balloonRadius = 34` · `fontFactor = 1.05` → `fontSize ≈ 35.7`.
`'12'` → `estimateEm = 1.1` → `textW = 39.3`, `+0.6em = 60.7 < 68(지름)` → `halfExtra = 0` → **circle op**.
`'123'` 부터 늘어난다(원 안에서 글자가 이미 테두리에 닿는 폭이었다).
테스트 `balloonStadium.test.ts` 의 `⭐ 회귀` 2건이 이것을 고정한다.

---

## 3. 보통1 — 전체연속에서 접두어 미사용

`floorCodesFor` 첫 줄에 `if (params.mode !== 'PER_FLOOR') return {};`.
이 함수 하나를 엑셀·인쇄뷰·조사위치도가 전부 부르므로 세 산출물이 동시에 맞는다.
`OptionsPanel` 의 `전체 이어서` 툴팁에 *"층 접두어는 이 모드에서 쓰이지 않습니다"* 를 덧붙였다
(툴팁 문구 1줄. 이유를 안 알려 주면 "접두어를 넣었는데 안 나온다"로 신고될 자리다).

## 4. 보통2 — `Esc` 취소

`skipCommit` ref 가드. `Escape` 에서 `true` 로 올리고 `blur()`,
`onBlur` 는 그 플래그를 보면 커밋을 건너뛰고 플래그를 내린다.
`blur()` 가 동기이므로 플래그가 남아 다음 blur 를 삼키는 경로는 없다.

## 5. 보통3 — EXTERIOR 완전일치

`includes` → `EXTERIOR_NAMES` Set 완전일치(`외부`·`외곽`·`옥외`·`외벽`·`외부전경`·`EXT`·`EXTERIOR`).
`지상3층 외벽` · `지하1층 외부계단` 은 이제 `UNKNOWN` — 목록 끝에 놓이고 드래그가 최종 권한이다
(§2-7 기본 규칙). 잘못된 9500 배치와 `순서 확인` 오탐이 사라진다.
**저장된 `sortOrder` 는 건드리지 않는다** — 파서는 신규 생성·경고에만 쓰인다.

---

## 검증한 것

- `npm run typecheck` — 3워크스페이스 오류 **0**
- `npm test` — canvas-core **309 통과**(17파일, 신규 `balloonStadium.test.ts` 15케이스) ·
  project-core **307 통과**(15파일, `floorOrder.test.ts` 37케이스로 증가)
- `npm run build` — 프로덕션 빌드 통과
- 기존 테스트 중 **2건을 새 사양에 맞게 갱신**했다(EXTERIOR 부분일치 · `floorCodesOf` 자동 파생).
  둘 다 이번 결정(D20 · 보통3)으로 **의도적으로 바뀐 동작**이다.
- `DB_VERSION` 1 유지 · 마이그레이션 0건 · `canvas-core` 는 여전히 `project-core`/`window`/
  `document`/React 를 참조하지 않는다(추가한 import 는 `titleBlock.estimateEm` · `shapes` — 코어 내부).
- `renumber()`(드래그 재번호) **무변경**.

## 미검증 (사용자 확인 필요)

실제 렌더 픽셀, 늘어난 풍선의 시각적 균형, 엑셀 파일을 연 상태의 NO 열.

---

## 직접 확인해주실 것

| # | 무엇을 | 어떻게 | 정상 |
|---|---|---|---|
| A-1 | **접두어 미입력 회귀** | 접두어를 아무 층에도 안 넣은 용역에서 출력 → 엑셀 | 번호모드가 `전체 이어서`로 선택돼 있고, NO 열이 `1`·`2`·`3`. 조사위치도 풍선도 `1`·`2` (예전과 완전히 동일) |
| A-2 | 옛 이력 재다운로드 | 이력에서 `[같은 번호로 다시 받기]` | 그때 받은 파일과 같은 번호 |
| A-3 | 접두어 입력 후 | 층 설정에서 `1F` 입력 → 출력 화면 다시 열기 | 번호모드가 `층별 1번부터`로 제안됨. NO 열 `1F-01` |
| A-4 | **접두어 + 전체 이어서** | A-3 상태에서 번호모드를 `전체 이어서`로 바꾸고 생성 | NO 열이 `1`·`2`·`3`(접두어 없음). 라디오 툴팁에 이유가 보인다 |
| B-1 | **풍선 오버플로** | 접두어를 넣고 결함이 많은 도면의 조사위치도 PNG 생성 | `1F-01` 이 알약 모양 풍선 **안에** 들어간다. 오른쪽이 잘리지 않는다 |
| B-2 | 짧은 번호 회귀 | 접두어 없이 조사위치도 생성 | 풍선이 예전 그대로 **동그란 원** |
| B-3 | 히트 영역 | (캔버스에서 결함이 100개 이상일 때) 3자리 번호 풍선의 좌우 끝을 클릭 | 늘어난 부분을 눌러도 번호가 잡혀 드래그된다 |
| C-1 | **Esc 취소** | 층 접두어 칸에 `ZZ` 치고 `Esc` | 칸이 원래 값으로 돌아가고 **저장되지 않는다**(새로고침해도 `ZZ` 없음) |
| C-2 | Enter 저장 | 같은 칸에 `1F` 치고 `Enter` | 저장된다 |
| D-1 | **EXTERIOR 오분류** | 층 이름을 `지상3층 외벽`으로 새로 추가 | 목록 **맨 위(외부 자리)로 튀지 않는다**. `순서 확인` 배지도 안 뜬다 |
| D-2 | 순수 외부 층 | 층 이름 `외부` 추가 | 예전처럼 목록 맨 아래(9500) |
| E-1 | 도곽 설정 색 견본 | 도곽·범례 설정 모달의 상태 체크박스 옆 점 | 빨강/보라/회색 그대로 |

## 알려진 한계 / 남긴 것

1. **`FloorChips.tsx:61` 화면 층 칩은 여전히 접두어를 안 붙인다**(경미2).
   지시대로 이번 범위 밖으로 남겼다. 파일은 `1F-01 – 1F-12`, 화면 칩은 `①–12` 다.
2. **경미3(새 optional 필드 읽기 정규화 함수 부재)** 는 손대지 않았다.
   호출부 전부가 `?? null` 로 안전하다는 검수 결과가 있고, 고치면 읽기 경로를 넓게 건드린다.
3. `visibility.ts` · `CanvasRoute.tsx:495` 는 `displayNumbers` 를 안 넘긴다(위 표 참조).
   둘 다 가로 폭을 판단에 쓰지 않아 영향이 없다고 판단했다.
4. **`estimateEm` 은 근사다.** 실제 Pretendard 볼드 글자폭과 몇 % 차이가 날 수 있다.
   여백 `0.6em` 이 그 오차를 흡수하도록 잡았지만, B-1 에서 글자가 테두리에 닿아 보이면
   `BALLOON_TEXT_PAD_EM`(`canvas-core/src/constants.ts`) 한 값만 올리면 된다.
5. `parseFloorName('지상3층 외벽')` 은 `ABOVE(3)` 가 아니라 `UNKNOWN` 이다.
   완전일치로 좁힌 결과이고, 층 번호 정규식이 `^지상3층$` 를 요구하기 때문이다.
   "층 번호가 든 이름도 그 층으로 읽어 달라"는 요구가 있으면 별건으로 논의가 필요하다.
