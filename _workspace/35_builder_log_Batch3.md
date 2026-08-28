# 구현 로그 — 배치 3 (G-6 · G-3 · G-2)

기준 스펙: `_workspace/30_plan-reviewer_spec_UserFeedback0828.md` §5-2 · §5-3 · §5-5 · §6-C · §10
브랜치: `feat/photo-polish` (배치1·2 커밋 위에 이어서)

| 커밋 | 범위 |
|---|---|
| `fc12efa` | **G-6** 층 접두 번호 + 사진번호 전체연속 (D19 · §5-5) |
| `efd9e00` | **G-3** 도곽·범례 프로젝트 스코프 + 실시간 미리보기 + 버그 B2 (D16 · §5-3) |
| `8770c42` | **G-2** 상태 범례 신설 (D15 · §5-2) |
| *(미커밋 1건)* | `OptionsPanel` 문구 정정 + `ASSUMPTIONS.md` + 이 로그 |

---

## 완료

### G-6 — 층 접두 번호 + 사진번호 전체연속

| 작업 | 파일 | 상태 |
|---|---|---|
| `Floor.code` 신설 + `normalizeFloorCode`(공백제거·대문자·6자) + `FLOOR_CODE_MAX` | `project-core/src/types.ts` | ✅ |
| `SORT_EXTERIOR = 9500` | `project-core/src/types.ts` | ✅ |
| `FloorParse` 에 `EXTERIOR` · `parseFloorName` 삽입(PIT 다음 · ROOFTOP 앞) | `project-core/src/floorOrder.ts` | ✅ |
| `floorCodeOf` (ABOVE→`nF` / BELOW→`Bn F` / ROOF→`RF` / ROOFTOP→`PH` / PIT / EXTERIOR→`W`) | 동상 | ✅ |
| `floorCodesOf(floors)` — 스냅샷 맵 생성기 | 동상 | ✅ |
| `renumber()` **손대지 않음** (스펙이 명시적으로 확정) | 동상 | ✅ 미변경 |
| `formatDefectNo(no, floorCode)` — 2자리 0채움, 100↑ 자연확장 | `project-core/src/export/numbering.ts` | ✅ |
| **`PER_FLOOR` 의 `photoNo = 0` 삭제** (K6 폐기) | 동상 | ✅ |
| `ExportParams.floorCodes?` 스냅샷 | `project-core/src/export/params.ts` | ✅ |
| `DamageTableInput.floorCodes?` → NO 열 표기 배선 | `project-core/src/export/damageTable.ts` | ✅ |
| `defectList` — `Omit<DamageTableInput,'columns'>` 라 자동 전파 | `.../defectList.ts` | ✅ 변경 불필요 |
| `photoBook` — **결함번호를 표기하는 지점이 없음**(캡션 1행은 *사진*번호) | `.../photoBook.ts` | ✅ 변경 불필요(아래 note) |
| `floorCodesFor` · `displayNumbersOf(plan, floorCodes)` 일원화 | `web/src/export/exportModel.ts` | ✅ |
| 조사위치도 번호 풍선 배선 | `web/src/export/produce.ts` · `printView/PrintRoute.tsx` | ✅ |
| 층 접두어 입력칸(`FloorCodeInput`) + CSS | `web/src/routes/ProjectSetup.tsx` · `styles.css` | ✅ |
| `PER_FLOOR` 자동 제안(U13) + `floorCodes` 스냅샷 저장 | `web/src/routes/Export.tsx` | ✅ |
| `makeFloor` 에 `code: null` | `web/src/data/factory.ts` | ✅ |
| K6 케이스 뒤집어 재고정 · `formatDefectNo` 신규 3케이스 | `test/numbering.test.ts` | ✅ |
| EXTERIOR 파싱 · `floorCodeOf` · `normalizeFloorCode` · `floorCodesOf` | `test/floorOrder.test.ts` | ✅ |
| NO 열 접두어 3케이스 | `test/damageTable.test.ts` | ✅ |

> **note — `photoBook.ts` 를 안 고친 이유:** 사진첩 캡션 3행 어디에도 **결함번호가 없다**
> (1행 `사진 {photoNo}` · 2행 `위치 부재명` · 3행 `유형 치수`). 배선할 지점이 없어 손대지 않았다.
> 결함번호가 사진첩에 필요하다면 그건 캡션 서식 변경이라 별도 결정이 필요하다.

### G-3 — 도곽·범례 프로젝트 스코프 + B2

| 작업 | 파일 | 상태 |
|---|---|---|
| `ProjectTitleBlock`(8필드) · `DEFAULT_PROJECT_TITLE_BLOCK` | `project-core/src/types.ts` | ✅ |
| `ProjectLegend`(+D15 4필드) · `DEFAULT_PROJECT_LEGEND` | 동상 | ✅ |
| `Project.titleBlock` · `Project.legend` (`… \| null`) | 동상 | ✅ |
| `projectTitleBlockOf` · `projectLegendOf` — **읽기 시점 정규화**(`??` 사용) | 동상 | ✅ |
| `Drawing.titleBlock`/`legend` 타입 **삭제하지 않음** | 동상 | ✅ 미변경 |
| `titleBlockConfigFor(drawing, project, override?)` — **B2 해소** | `web/src/canvas/pageDecor.ts` | ✅ |
| `legendConfigFor(drawing, defects, project, override?)` | 동상 | ✅ |
| `promoteProjectDecor` — 승격(대표 = 층 sortOrder → 도면 sortOrder → id) | `project-core/src/projectDecor.ts` | ✅ |
| 승격 배선 — 진입점 2곳 | `CanvasRoute.tsx` · `ProjectSetup.tsx` | ✅ |
| 다이얼로그 2섹션 재구성 · `onApply(tb, lg, drawingName)` | `web/src/routes/TitleBlockDialog.tsx` | ✅ |
| **B2-c 문구 정정** ("출력 단계에서 따로" → "화면과 출력물 양쪽") | 동상 | ✅ |
| 실시간 미리보기 `onPreview` + 임시 오버라이드 | `TitleBlockDialog` · `CanvasRoute` | ✅ |
| 모달 우측 붙임 + 스크림 투명 (`dock="right"`) | `web/src/ui/Form.tsx` · `styles.css` | ✅ |
| `makeProject` 에 `titleBlock: null, legend: null` (확인 후 명시) | `web/src/data/factory.ts` | ✅ |
| `locationMap` 범례 호출부에 `project` 전달 | `web/src/export/locationMap.ts` | ✅ |
| 승격 · 읽기 정규화 단위테스트 14케이스 | `test/projectDecor.test.ts` (신규) | ✅ |

> **`promoteProjectDecor` 를 `project-core` 에 뒀다.** 처음엔 `apps/web/src/data/` 에 만들었지만,
> 순수 함수이고 `project-core` 타입만 쓰는데 `apps/web` 에는 테스트 러너가 없다.
> 코어로 옮겨 **결정론(입력 순서 무관)까지 테스트로 고정**했다. 경계 규칙 위반 없음(IDB·canvas-core 미참조).

### G-2 — 상태 범례

| 작업 | 파일 | 상태 |
|---|---|---|
| `LegendStatusRow` · `LegendConfig.statusRows` · `DEFAULT_LEGEND` 확장 | `canvas-core/src/legend.ts` | ✅ |
| `statusRows(cfg, defects)` — **없는 상태는 안 그린다** | 동상 | ✅ |
| `STATUS_LEGEND_LABEL` · `LG_DOT_EM` · `LG_GROUP_RULE_MUL` | 동상 | ✅ |
| `legendLayout` — 두 블록 합산 · 둘 다 비면 `null` · `typeCount`/`statusCount` | 동상 | ✅ |
| `legendOps` — 색 채운 원 + **두 블록 사이 굵은 가로 구분선 1개** | 동상 | ✅ |
| `pageDecor` 배선 | `web/src/canvas/pageDecor.ts` | ✅ |
| 범례 memo 서명에 `status` 포함 | `web/src/routes/CanvasRoute.tsx` | ✅ |
| 체크박스 4개 + 색 견본 | `TitleBlockDialog.tsx` · `styles.css` | ✅ |
| 신규 17케이스 (핵심: "켜도 없으면 안 그린다") | `canvas-core/test/legend.test.ts` | ✅ |

`canvas-core` 는 `project-core` 를 import 하지 않는다 — `StatusLegendToggles`/`StatusLegendDefect`
로컬 타입으로 **구조적 타이핑**을 썼다(`NumberingDefect` 와 같은 수법, D13 유지).

---

## 미완료 / 막힌 것

없다. 지시받은 G-6 · G-3 · G-2 전 항목을 구현했다.

---

## 검증한 것

| 항목 | 결과 |
|---|---|
| 타입 검사 (`npm run typecheck`, 3 워크스페이스) | ✅ 오류 0 |
| 단위 테스트 (`npm test`) | ✅ **597 통과 / 0 실패** (canvas-core 294 · project-core 303) |
| 프로덕션 빌드 (`npm run build`) | ✅ 통과 |
| 새 npm 의존성 | ✅ **0개** |
| `DB_VERSION` | ✅ **1 유지** — 추가한 것은 전부 optional 필드(`Floor.code` · `Project.titleBlock`/`legend` · `ExportParams.floorCodes`). 옛 레코드의 `undefined` 는 `?? null` / `projectXxxOf()` 로 읽는다 |
| `assignNumbers()` 서명 | ✅ 무변경. 본문에서 지운 것은 `photoNo = 0` 한 줄뿐 |
| `ExportRun.mapping` 스키마 | ✅ `{no: number, photoNo}` 그대로. 접두어는 저장하지 않는다(불변식 #2) |
| 색 예약 | ✅ 빨강 `#e5342a` / 보라 `#7c4dff` / 회색 `#9aa4b0` 그대로. `legend.test.ts` 가 "상태 행이 없으면 예약색이 안 나온다"를 계속 고정 |
| 좌표 불변식 #1 | ✅ 이번 범위에서 좌표를 읽거나 쓰는 코드가 없다 |

테스트 증가: 566 → **597** (+31 · G-6 12 · G-3 14 · G-2 17, 뒤집은 K6 1건 포함)

**미검증(코드로 확인 불가):** 캔버스에 실제로 그려진 도곽·범례 모양, 슬라이더를 끄는 동안의 미리보기 반응,
모달 우측 붙임의 실제 겹침, 엑셀 파일을 열었을 때의 NO 열 표시.

---

## 직접 확인해주실 것

### A. 층 접두 번호 (G-6)

1. **용역 구성(P3) → 층 행 오른쪽 작은 칸**을 본다
   → 비어 있고 회색으로 `1F` · `B1F` 같은 **자동 파생값이 placeholder** 로 보여야 한다.
2. 그 칸에 `w` 를 입력하고 다른 곳을 클릭(또는 Enter)한다
   → 대문자 `W` 로 저장돼야 한다. `Esc` 를 누르면 입력이 취소돼야 한다.
3. **층 이름을 `외부` 로 만든다** → placeholder 가 `W` 이고, 층 목록에서 **맨 아래**(옥탑보다 뒤)로 가야 한다.
4. **출력(P6)을 연다** → `번호 부여` 가 **`층별 1번부터`** 로 선택돼 있어야 한다(접두어가 있으므로).
   → 여기서 `전체 이어서` 로 바꿀 수 있어야 한다(**강제가 아니다**).
5. `[생성]` → 내려받은 **손상결함표 엑셀의 NO 열**이 `1F-01` · `1F-02` · `B1F-01` 형태여야 한다.
6. **조사위치도 PNG** 의 번호 풍선도 같은 `1F-01` 이어야 한다(표와 도면이 어긋나면 안 된다).
7. ⭐ **사진번호는 층이 바뀌어도 이어져야 한다** — 1층 마지막 사진이 12번이면 2층 첫 사진은 **13번**.
   (예전에는 1번으로 돌아갔다. D19 가 뒤집은 지점이다.)
8. 이력에서 `[같은 번호로 다시 받기]` → **접두어까지 그대로** 재현돼야 한다.
   층 이름을 고친 뒤 다시 눌러도 **옛 접두어**가 나와야 한다(스냅샷).

### B. 도곽 · 범례 (G-3)

9. ⭐ **도곽을 한 번도 설정한 적 없는 도면을 연다** → 이제 **도곽이 바로 보여야 한다**
   (예전에는 설정을 열고 [저장] 을 눌러야 나타났다 — 버그 B2).
10. **도곽 설정 다이얼로그**를 연다 → `이 도면`(DRAWING NAME 하나) / `용역 전체`(나머지 전부)
    **두 섹션**으로 갈려 있고, 용역 전체 섹션에 *"이 용역의 모든 도면에 함께 적용됩니다"* 안내가 있어야 한다.
11. `도곽 표시` 아래 문구가 **"화면과 출력물 양쪽의 표시 여부입니다"** 여야 한다
    (예전 문구 "출력물에 넣을지는 출력 단계에서 따로 고릅니다" 는 사실이 아니었다).
12. ⭐ **`도곽 크기` 슬라이더를 끄는 동안** 뒤 캔버스의 도곽이 **실시간으로** 커졌다 작아져야 한다.
    다이얼로그가 화면 **오른쪽에 붙어** 있어 캔버스가 보여야 한다.
13. **[취소]** 를 누른다 → 도곽이 **원래 크기로 돌아가야** 한다(저장 안 됨).
14. **[저장]** 후 **다른 층 도면으로 이동** → 그 도면에도 같은 크기가 적용돼 있어야 한다.
15. DRAWING NAME 만 도면마다 달라야 한다.
16. **이미 도곽을 설정해 둔 옛 용역**을 연다 → 그 설정이 **사라지지 않고** 용역 기본값이 돼 있어야 한다
    (맨 아래층 도면의 설정을 씁니다).

### C. 상태 범례 (G-2)

17. 범례 섹션에 체크박스 4개(**결함유형** / 신규 / 미보수 / 보수완료)가 보이고,
    처음에는 **결함유형만 체크**돼 있어야 한다 → **기존 출력물이 그대로여야 한다.**
18. `신규(현회차)` 를 켠다 → 범례 아래쪽에 **빨간 원 + `신규(현회차)`** 행이 붙고,
    결함유형 블록과 사이에 **가로 구분선 하나**가 있어야 한다.
19. ⭐ **`보수완료` 를 켠다. 그 도면에 보수완료 결함이 하나도 없으면 행이 안 나와야 한다.**
    보수완료 결함을 하나 만들면 그때 회색 원 행이 나타나야 한다.
20. `결함유형` 을 끄고 상태만 켜도 범례가 그려져야 한다. **둘 다 끄면 상자 자체가 안 보여야** 한다.
21. 조사위치도 PNG·인쇄 뷰에도 같은 범례가 나가야 한다.

### D. 회귀 확인 (안 바뀌어야 하는 것)

22. 접두어를 **아무 층에도 넣지 않고** `전체 이어서` 로 뽑은 산출물이 **예전과 똑같아야** 한다
    (NO 열이 `1` · `2` · `3`, 상태 범례 없음).
23. 다른 모달(용역 만들기 · 도면 업로드 등)은 여전히 **화면 가운데**에 뜨고 스크림이 어두워야 한다.

---

## 알려진 한계

1. **`Drawing.legend` 는 이제 아무도 쓰지 않는다.** 타입·레코드는 남겼다(마이그레이션 0건 원칙).
   나중에 정리하려면 별도 판단이 필요하다.
2. **`Drawing.titleBlock` 의 8필드도 읽히지 않는다.** `drawingName` 만 읽는다.
   저장할 때는 기존 8필드를 보존한 채 `drawingName` 만 갈아 끼운다.
3. **`renumber()`(드래그 재번호)는 `EXTERIOR` 의 9500 을 잃는다.** ROOFTOP·ROOF 도 이미 같은
   기존 동작이고 스펙이 "손대지 않는다"고 확정했다 — 드래그가 최종 권한(§2-7-b).
4. **`floorsNeedingOrderCheck` 가 `외부` 층에도 작동한다.** 외부 층을 옥탑 위로 끌어 두면
   `순서 확인` 배지가 뜬다. 경고일 뿐이고 자동으로 고치지 않는다.
5. **접두어 중복을 막지 않는다.** 두 층에 같은 접두어를 넣으면 `1F-01` 이 두 번 나온다.
   스펙에 검증 요구가 없어 넣지 않았다 — 필요하면 별도 결정.
6. **사진첩 캡션에는 결함번호가 없다**(위 note). 접두어가 사진첩에 보이지 않는다.
7. `promoteProjectDecor` 는 **저장소 쓰기가 실패해도 조용히 넘어간다**(`guard` 위임).
   그 경우 다음에 열 때 다시 승격을 시도한다 — 읽기 쪽이 기본값으로 폴백하므로 화면은 정상이다.

---

## 스펙과 다르게 한 것 (가정 · `ASSUMPTIONS.md` U17~U22)

| # | 무엇 | 왜 |
|---|---|---|
| U17 | 승격 대표 도면을 도곽·범례 **각각** 고른다 | 스펙(§5-3-c "같은 대표 도면")과 지시문("범례도 동일 규칙")이 두 가지로 읽힌다. 실데이터에서는 결과가 같고, 갈리는 예외 데이터에서는 이쪽이 값을 안 잃는다 |
| U18 | `onPreview(tb)` → `onPreview(tb, lg)` | 같은 모달의 `범례 크기` 슬라이더가 같은 문제를 갖는다. 콜백 하나로 둘 다 덮는 게 코드가 적다 |
| U19 | 접두어가 있으면 NO 셀 값이 문자열이 된다 | `1F-01` 은 엑셀에 숫자로 넣을 수 없다. 접두어가 없으면 정수 그대로라 기존 출력물의 셀 타입은 안 바뀐다 |
| U20 | `floorCodesFor` 를 접두어의 유일한 조회 경로로 두고 `displayNumbersOf` 를 `exportModel` 로 이관 | 산출물마다 각자 파생하면 층 이름을 고친 날 어긋난다(K20 과 같은 정신) |
| U21 | 모달 우측 붙임 **+** 스크림 투명화를 **둘 다** 적용 | 스펙이 "둘 중 하나, builder 재량"이라 했다. 720px 이하에서는 기존대로 가운데 |
| U22 | `OptionsPanel` 의 `층별 1번부터` 설명 문구 정정 | D19 로 K6 가 폐기돼 기존 문구가 거짓말이 됐다. 스펙이 이 파일을 명시하지 않았지만 안 고치면 화면이 코드와 다른 말을 한다 |

**새 질문 없음** — `QUESTIONS.md` 에 추가한 항목이 없다. 위 6건은 전부 비차단이고 되돌리는 비용이 낮다.

---

## code-reviewer 가 봐야 할 파일

**핵심 (경계면 · 불변식이 걸린 곳)**

| 파일 | 왜 |
|---|---|
| `packages/project-core/src/export/numbering.ts` | `photoNo = 0` 삭제가 유일한 본문 변경 · `formatDefectNo` |
| `packages/project-core/src/export/damageTable.ts` | NO 셀이 number↔string 으로 갈린다(U19) — 엑셀 경로 확인 필요 |
| `packages/project-core/src/floorOrder.ts` | `EXTERIOR` 삽입 위치(PIT 다음 · ROOFTOP 앞)와 기존 패턴 충돌 |
| `packages/project-core/src/projectDecor.ts` | 승격 결정론 · 값 손실 여부 |
| `packages/project-core/src/types.ts` | optional 필드 3종이 정말 마이그레이션 0건인가 |
| `apps/web/src/canvas/pageDecor.ts` | **B2 해소 지점.** 읽기 규칙이 바뀌어 사용자가 보는 동작이 달라진다 |
| `packages/canvas-core/src/legend.ts` | `statusRows` 순수성 · 레이아웃 합산 · 예약색 |
| `apps/web/src/export/exportModel.ts` | `floorCodesFor` 폴백(옛 run) · `displayNumbersOf` 일원화 |

**배선 (경계면 교차 비교용)**

`apps/web/src/export/produce.ts` · `apps/web/src/export/printView/PrintRoute.tsx` ·
`apps/web/src/export/locationMap.ts` · `apps/web/src/routes/Export.tsx` ·
`apps/web/src/routes/CanvasRoute.tsx` · `apps/web/src/routes/ProjectSetup.tsx` ·
`apps/web/src/routes/TitleBlockDialog.tsx` · `apps/web/src/routes/export/OptionsPanel.tsx` ·
`apps/web/src/data/factory.ts` · `apps/web/src/ui/Form.tsx` · `apps/web/src/styles.css`

**테스트**

`packages/project-core/test/{numbering,floorOrder,damageTable,projectDecor,displayName}.test.ts` ·
`packages/canvas-core/test/legend.test.ts`

**특히 봐 주었으면 하는 것**

1. `CanvasRoute` 의 범례 `useMemo` 의존 배열 — `eslint-disable` 가 걸려 있어 컴파일러가 안 잡는다.
   `[currentDrawing?.id, project?.legend, lgPreview, legendSig]` 로 충분한가.
2. `TitleBlockDialog` 의 `onPreview` ref 패턴 — 저장 직후 언마운트에서 `(null, null)` 이 나가는데,
   그 시점에 `project` 가 이미 갱신돼 있어 화면이 안 튀는지.
3. 승격이 **두 진입점에서 동시에** 일어날 수 있는가(다른 탭에서 같은 용역을 여는 경우).
4. `Export.tsx` 의 `PER_FLOOR` 자동 제안이 `initialized.current` 가드 안에 있어
   **한 번만** 적용되는지(사용자가 바꾼 뒤 다시 덮어쓰지 않는지).
