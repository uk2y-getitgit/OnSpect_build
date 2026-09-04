# 검수 결과 — U-3 범례 정리 (결함유형 범례 제거 + 상태범례 문구 축약)

스코프: `_workspace/00_input/scope_UIPolish0902.md` §U-3
대상 커밋: `cea85b1` (배지 로그: `_workspace/58_builder_log_UI3_Legend.md`)

## 판정
**통과**

## 검수 방법
- `git show cea85b1` 로 9개 파일 전체 diff 를 읽음 (project-core/types.ts, canvas-core/legend.ts,
  pageDecor.ts, ProjectSetup.tsx, CanvasRoute.tsx, TitleBlockDialog.tsx, legend.test.ts,
  projectDecor.test.ts, builder log)
- `projectLegendOf` / `showTypes` / `legendSymbol` / `LegendRow` / `legendRowsFor` / `legendTypes` /
  `typeCount` / `LG_GROUP_RULE_MUL` / `.legend` 전수 grep
- `DefectTypeColumn.tsx` 마지막 수정 커밋 확인 + `legend` 문자열 grep(0건)
- `npm run typecheck` (canvas-core·project-core·web) 재실행
- `npm test` 전체 재실행 (canvas-core 383/383, project-core 308/308 — 실패 0)
- `packages/canvas-core/src/index.ts` 배럴 export 확인 (와일드카드라 깨진 재수출 없음, typecheck 통과로 증명됨)

## 지적 사항
없음. 심각·보통·경미 지적 없음.

## 확인 항목별 결과

### 1. `DB_VERSION` 1 유지 주장 검증
**사실.** diff 9개 파일 중 `apps/web/src/data/idb/db.ts`(스키마 정의 파일)는 포함되지 않았다.
`DB_VERSION = 1` 은 그대로이고 `onupgradeneeded`·스토어·인덱스 정의에 손댄 흔적이 없다.
`ProjectLegend` 는 `project-core/src/types.ts` 에서 `Project.legend: ProjectLegend | null` 필드 하나로
직렬화되는 값 객체이지, IndexedDB 별도 스토어·인덱스가 아니다(`idb` 폴더 grep 결과 `legend` 관련 코드는
`repo.ts` 의 `d.legend ?? null` 통짜 저장/로드 두 줄뿐 — 필드별 컬럼화가 없다). builder 주장과 일치.

### 2. 옛 레코드(`showTypes` 필드가 남은 저장 프로젝트) 읽기 안전성
**안전.** `projectLegendOf()` 호출부를 전수 검색한 결과 4곳:
- `apps/web/src/canvas/pageDecor.ts:72` (`legendConfigFor`)
- `apps/web/src/routes/TitleBlockDialog.tsx:53` (다이얼로그 초기 state)
- `packages/project-core/src/projectDecor.ts:65` (`promoteProjectDecor` — `hasLg` 분기)
- `packages/project-core/src/projectDecor.ts:94` (`fromDrawingLegend` — 옛 `DrawingLegend` 승격 경로)

builder 로그는 "호출부 3곳"이라 적었으나 실제로는 `projectDecor.ts` 안에 2곳이 있어 4곳이다(사소한
기록 누락, 코드 자체는 문제없음). `project.legend` 를 **직접** 읽는 다른 지점도 찾았으나 전부 안전:
- `promoteProjectDecor` 의 `hasLg = (project.legend ?? null) !== null` → null 여부만 보는 존재 확인,
  `showTypes` 필드를 읽지 않는다.
- `fromDrawingLegend` 의 `rep?.legend` → 이건 `Project.legend`(`ProjectLegend`)가 아니라
  `Drawing.legend`(`DrawingLegend`) 타입이고, `DrawingLegend` 는 애초 `{enabled, lgScale}` 뿐이라
  `showTypes` 개념 자체가 없었다(둘을 혼동하지 않았는지 별도 확인함).
- `CanvasRoute.tsx:424` 의 `project?.legend` 는 `useMemo` 의존성 배열에만 쓰여 필드를 읽지 않는다.

즉 `project.legend.showTypes` 를 `projectLegendOf()` 우회해서 직접 읽는 코드는 0건. 옛 레코드에
`showTypes: true` 가 남아 있어도 정규화 함수를 거치는 순간 사라지므로 결함유형 범례가 화면에
되살아나는 경로는 없다. `packages/project-core/test/projectDecor.test.ts` 의 신규 테스트
("옛 레코드에 남은 showTypes 는 읽는 순간 사라진다")도 실제로 통과함을 재실행으로 확인.

### 3. 상태범례(`statusRows`) 경로 무손상 여부
**무손상.** `legend.test.ts` diff 를 정독한 결과 결함유형 관련 케이스(`legendSymbol` describe 블록,
`ROWS` 상수를 쓰던 `legendLayout`/`legendOps` 케이스)만 삭제·재작성되었고, D15 상태범례 테스트
(`statusRows — 켜져 있어도 없는 상태는 그리지 않는다` describe 블록 전체, "예약색을 그대로 쓴다" 등)는
**한 줄도 지워지지 않고 그대로 남아 있다.** 실제로 `npx vitest run test/legend.test.ts` 재실행 →
23/23 통과. `legendOps`/`legendLayout` 은 상태 행만으로 재작성된 새 버전이 여전히 통과한다.
G-2/D15 (`상태 범례 신설`, 커밋 `8770c42`) 이 만든 도메인 규칙("켜져 있어도 없는 상태는 안 그린다",
"신규→미보수→보수완료 고정 순서", "예약색 그대로")은 전부 diff 이후에도 코드·테스트 양쪽에 남아있다.

### 4. `STATUS_LEGEND_LABEL` 변경이 한 곳에만 있는지
**한 곳뿐.** `CURRENT:'...', PREV_PENDING:'...', REPAIRED:'...'` 형태의 객체 리터럴을 전수 검색한 결과:
- `packages/canvas-core/src/legend.ts` — 실제 정의 (변경됨: 신규/결함/보수완료)
- `packages/canvas-core/test/legend.test.ts` — 그 값을 검증하는 테스트 (같이 갱신됨)
- `apps/web/src/ui/SimilarDefectPicker.tsx`, `Sidebar.tsx`, `Inspector.tsx` — **범례와 무관한 각자의
  라벨**(`현회차`/`전회차 미보수`/`보수완료` 등, 문구도 다르다). 이 셋은 스코프 §U-3 4번 지시
  ("다른 화면의 문구는 건드리지 마라")대로 손대지 않은 것이 맞고, `STATUS_LEGEND_LABEL` 을 복제한
  것도 아니라 애초부터 독립된 상수다.
`TitleBlockDialog.tsx` 의 체크박스 라벨("신규(현회차)"·"미보수(전회차)")도 `STATUS_LEGEND_LABEL` 을
쓰지 않는 별도 하드코딩 텍스트다 — 범례에 실제로 인쇄되는 문구(`legend.ts`)와 다이얼로그 안내문 사이에
불일치가 생겼지만, 이는 스코프가 명시적으로 요구한 대로다(§U-3 4번, builder 로그 "알려진 한계" 1·2번에도
스스로 기록됨). 코드 결함이 아니라 스코프가 지정한 의도된 비대칭.

### 5. `DefectTypeColumn.tsx` 무손상 여부
**무손상.** `git log -1 -- .../DefectTypeColumn.tsx` → 마지막 수정 커밋은 `180f51f`(이 작업 이전),
`cea85b1` diff stat 에 이 파일이 없다. 파일 내용에 `legend`/`Legend` 문자열이 0건이라 애초 이 기능과
연결점이 없었다(기호 입력칸은 결함유형 설정 화면 전용이고, 그 값을 읽던 유일한 소비자는 이번에 삭제된
`legendRowsFor`/`legendSymbol` 이었다). 화면 자체의 입력 로직은 이번 커밋과 완전히 분리되어 있어
깨질 경로가 없다.

### 6. canvas-core 경계 규칙 위반 여부
위반 없음. `legend.ts` 는 여전히 DOM·IndexedDB·전역상태 접근이 없는 순수 계산/레이아웃 모듈이고,
`DrawOp[]` 를 반환하는 계약(`legendOps`)도 그대로다. `pageDecor.ts`(어댑터)가 `LegendConfig` 를
만들어 넘기는 형태도 이전과 동일 — `rows` 필드가 빠졌을 뿐 타입 계약 자체는 양쪽(정의처 `legend.ts`
의 `LegendConfig`, 소비처 `pageDecor.legendConfigFor`)이 diff 안에서 함께 좁혀져 있어 어긋남이 없다
(typecheck 로 재확인).

## 부가 확인 — 경계면 교차 비교
- **생산자** `legendConfigFor()`(`pageDecor.ts`) 반환 shape `{enabled, lgScale, statusRows}` ↔
  **소비자** `legendLayout`/`legendOps`(`legend.ts`) 가 기대하는 `LegendConfig` — 필드 일치 확인.
- **생산자** `projectLegendOf()` 반환 shape(더 이상 `showTypes` 없음) ↔ **소비자**
  `TitleBlockDialog` 의 `lg.showTypes` 참조 — diff 에서 체크박스 블록째 삭제되어 참조 없음(grep 0건).
- **저장 ↔ 로드**: `Project.legend` 저장 시 `showTypes` 를 더 이상 쓰지 않는 값(정규화된
  `ProjectLegend`, `showTypes` 필드가 타입에서 사라짐)으로 저장되고, 로드 시 `projectLegendOf()` 가
  옛 키를 흘려버림 — 왕복 일치.
- **export/locationMap.ts** 경로: `legendConfigFor(drawing, defects, input.project)` 호출 시그니처가
  diff 이후에도 그대로라 `ExportRun` 스냅샷 렌더 경로는 깨지지 않음. 다만 그 옆 주석(227행 부근)이
  "행은 여전히 이 도면의 결함에서 파생한다(D8)" 라고 삭제된 D8 결함유형 개념을 언급하는 **낡은 주석**
  이 남아 있음 — 동작에는 영향 없는 경미한 문서 부채라 지적 목록에는 올리지 않았으나 다음에 그 파일을
  건드릴 사람을 위해 기록해 둔다.

## 불변식 검수표
이번 변경은 8개 도메인 불변식 중 어느 것도 직접 건드리지 않는다(범례는 순수 표시 파생값이라
저장 스키마·번호계산·좌표계·isPrimary 등과 무관). 참고로 확인한 인접 항목만 기록:

| # | 불변식 | 결과 | 근거 |
|---|---|---|---|
| 2 | 출력번호(`defectNo`/`photoNo`) DB 미저장 | 무관 | 이번 diff 는 범례 표시 로직만 다룸, 번호 계산 코드 미접촉 |
| 5 | 층 정렬 `sortOrder` 정수 비교 | 무관 | `orderedDrawings`(`projectDecor.ts`) 는 이번 diff 대상 아님, 기존 로직 유지 확인(읽음) |

## 확인하지 못한 것
- 실제 브라우저에서 범례가 우측 상단에 시각적으로 올바르게 그려지는지(레이아웃 픽셀 결과)는
  코드 읽기로 좌표 계산 로직만 확인했고 렌더링 결과물은 확인하지 못함 — builder 로그의
  "직접 확인해주실 것" 체크리스트로 이미 사용자에게 위임되어 있음.
- `.tbset__checks` CSS(`flex-wrap`)가 체크박스 3개로 줄었을 때 실제 화면에서 줄바꿈·여백이
  어색하지 않은지는 CSS 파일을 열어 규칙만 확인했고 렌더 결과는 미확인.
