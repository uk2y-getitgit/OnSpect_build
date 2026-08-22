# 구현 로그 — R 반응형 정리 + S2a 마커 도구 3종 · 메모

스펙: `_workspace/07_spec_S2a_and_responsive.md`
검증 분담: 에이전트는 코드·기능 검증 + 스모크 1회. 클릭 검증은 사용자 (`ui-quality §7`)

---

# R. 반응형 정리 — 완료

> 예산 규칙에 따라 R 을 먼저 끝내고 이 시점에 기록했다. 아래 S2a 절은 이어서 추가된다.

## R-1. 무엇이 바뀌었나

전부 `apps/web/src/styles.css` 한 파일. **JSX 변경 없음** —
행 구조는 이미 `손잡이 / 이름 / 도면정보` 로 나뉘어 있었고, 문제는 그것들을
양끝으로 밀던 CSS 였다.

| # | 문제 (리더 1920×1080 실측) | 처방 | 위치 |
|---|---|---|---|
| 1 | 목록·설정 본문이 화면 폭 전체로 늘어남 | `--page-max: clamp(720px, 92vw, 1180px)` 도입 + `.page > *:not(.modal-scrim)` 가운데 정렬 | `.page` |
| 2 | `지하1층` 왼쪽 끝 · `도면 없음 / 도면 올리기` 오른쪽 끝, 사이 1200px 공백 | `.frow` 를 flex→**명시적 4열 그리드** `auto / minmax(140px,220px) / auto / minmax(0,1fr)`. 남는 폭을 **마지막 빈 칸**이 흡수한다 | `.frow` |
| 3 | 위 2의 직접 원인 | `.frow__drawing` 의 `flex: 1` + `justify-content: flex-end` **제거** → `flex-start` | `.frow__drawing` |
| 4 | 빈 패널이 세로로 화면 끝까지(≈1000px) 늘어남 | `.setup` 에서 `flex:1` 제거 + **`align-items: start`**, `.page--setup { overflow:hidden }` 삭제, 패널에 `min-height: 160px` | `.setup` |
| 5 | 용역 목록 행에서 제목과 메타가 멀리 떨어짐 | `.plist__row` 를 `space-between` flex → **3열 그리드** `clamp(220px,38%,560px) / auto / minmax(0,1fr)` | `.plist__row` |
| 6 | 동 행도 같은 방식 | `.orow` 를 `auto / minmax(0,1fr) / auto` 그리드로 | `.orow` |
| 7 | `space-between` 잔존 | `.topbar` · `.page__head` · `.panel__title` 전부 `grid-template-columns: minmax(0,1fr) auto` 로 교체 | 3곳 |

### 곁다리로 함께 고친 것 (위 변경이 깨뜨릴 수 있던 것)

- 인라인 편집 줄이 좁은 이름 칸에 갇히지 않게 `.orow > .inline-edit`,
  `.frow > .inline-edit { grid-column: 2 / -1 }`. `.orow--new` 는 손잡이가 없어 `1 / -1`
- `.page__note` 의 `margin: auto 0 0` → `auto auto 0`. 안 고치면 하단 안내문만
  컨테이너 정렬에서 이탈해 왼쪽 끝으로 튄다
- `.modal-scrim` 을 컨테이너 규칙에서 제외. `position:fixed; inset:0` 인 전면 덮개에
  `max-width` 가 걸리면 화면이 덜 덮인다
- `.frow__dname { max-width: 28ch }`. 긴 도면 이름이 `auto` 트랙을 밀어내는 것 차단
  (전문은 기존 `title` 툴팁으로 본다)

## R-2. 캔버스는 건드리지 않았다

스펙 R-0 대로 **화면 종류마다 다르게** 대했다.

- 캔버스 화면(`CanvasRoute`)은 `.app` / `.body` / `.stage` 를 쓴다. `.page` 를 쓰지 않는다
  → 컨테이너 `max-width` 가 **적용되지 않는다**
- `.body { grid-template-columns: var(--sidebar-w) minmax(0,1fr) var(--inspector-w) }`
  에 상한이 없다. ≥1600px 에서도 도면 영역이 그대로 커진다 (R-2-5)
- 기존 브레이크포인트 1200/980/820/720 을 유지했다. **새 브레이크포인트를 추가하지 않았다.**
  좁은 폭 대응은 이미 있던 720/820 안에서 처리했다
  (`.plist__row` → 1열, `.frow` → 2열, `.page__head` → 1열)

## R-3. 검증한 것

| 항목 | 방법 | 결과 |
|---|---|---|
| 타입 검사 3개 패키지 | `npm run typecheck` | ✅ 통과 |
| 단위 테스트 | `npm test` | ✅ canvas-core 79 + project-core 50 = **129개 통과** |
| 프로덕션 빌드 | `npm run build` | ✅ 78 모듈, CSS 31.16 kB (gzip 6.49 kB) |
| `space-between` 잔존 | `grep -rn 'space-between' styles.css routes ui canvas` | ✅ **주석 2줄 외 0건** |
| 스페이서 `flex:1`+`flex-end` 잔존 | `grep -rn 'justify-content'` | ✅ 남은 `flex-end` 는 `.modal__actions`(모달 푸터 버튼) 하나뿐 — 행 레이아웃 아님 |
| 캔버스에 컨테이너 미적용 | `grep -rn 'className="page'` | ✅ `CanvasRoute.tsx` 에 `.page` 없음 |
| `word-break: break-all` | `grep -rn 'break-all'` | ✅ 0건 (한글 단어 중간 잘림 없음) |

## R-4. 미검증 (사용자 몫)

값이 **감각으로만 판단되는 것**이라 수치로 정할 수 없다 — `ui-quality §7-2`.

- `--page-max` 상한 1180px 가 실제로 읽기 편한 폭인지
- `.frow` 이름 칸 `minmax(140px, 220px)` 이 층 이름에 적절한지
- `.plist__row` 1열 `clamp(220px, 38%, 560px)` 가 용역명에 적절한지

---

# S2a. 마커 도구 3종 + 메모 — 완료

## S2a-1. 만든 것

### canvas-core (신규 파일 2)

| 파일 | 내용 |
|---|---|
| `packages/canvas-core/src/shapes.ts` **(신규)** | 순수 기하 — 사각 정규화 · Shift 정사각 · 8방향 핸들/리사이즈 · 사각/타원 내부·테두리 히트 · 폴리라인 거리 · 화살촉 · **구름(revision cloud)** · **45° 해치**(사각·타원 해석적 클리핑) · 정규화 평행이동/클램프 |
| `packages/canvas-core/src/memoGeom.ts` **(신규)** | 메모 스타일 해석 · **한국어 어절 단위 줄바꿈** · 상자 기하(스크린) |

### canvas-core (변경)

| 파일 | 변경 |
|---|---|
| `types.ts` | `MarkGeometry` 확정 · `SketchPath` · `Memo`/`MemoStyle` · `Defect.sketch` · `Tool` 7종 · `Part`/`Handle` · `Selection`/`HoverTarget` 확장 · `AreaShape`/`AreaFill` · `DragState` 9종 · 새 InputEvent 5종 · `EDIT_MEMO` 이펙트 · 리사이즈 커서 |
| `constants.ts` | 생성 최소 드래그 8px · 스케치 점 간격/상한 · 해치·구름 튜닝값 · **메모 색 3종** |
| `hitTest.ts` | **우선순위 전면 재작성** (아래 S2a-3) |
| `defectGeom.ts` | `centerOfGeometry` · `geometryToScreen` · `MarkScreen` 에 rect/from/to · `DefectScreen.sketch` · `sketchOf()` |
| `renderModel.ts` | 화살표·영역(3모양×2채움)·자유그리기·메모·핸들·**생성 미리보기(ghost)** DrawOp. 뷰 컬링을 도형 bbox 기준으로 수정 |
| `commands.ts` | `Doc = {defects, memos}` · 새 커맨드 8종 · `applyMemoCommand`/`applyToDoc` · `undo`/`redo` 가 Doc 을 다룬다 |
| `interaction.ts` | 생성 드래그 3종 · 도형 이동/리사이즈 · 스케치 이동 · 메모 이동/편집/삭제 · 스타일 커맨드 3종 · 도구별 커서 |
| `style.ts` | `patchStyle()` — 마지막 키가 지워지면 **null 로 되돌려 전역 상속에 복귀** |

### 웹 어댑터

| 파일 | 변경 |
|---|---|
| `canvas/ToolPalette.tsx` | 6개 도구 전부 활성. `영역` 아래 **사각/타원 모양 줄** 펼침 |
| `canvas/ContextToolbar.tsx` | 종류별 툴바. 색상 팔레트 · 영역 `실선/점선/구름` · `채움` 토글 · **`스타일 초기화`** |
| `canvas/MemoEditor.tsx` **(신규)** | 캔버스 위 textarea. Ctrl+Enter 저장 · Esc 취소 · 비우면 삭제 |
| `canvas/CanvasView.tsx` | `memoScreens` · `ghost` 를 렌더 입력에 연결 |
| `canvas/renderCanvas2d.ts` | `polyline`(dash/cap/join/noStroke) · `ellipse`(dash) · **`textLeft`** |
| `routes/CanvasRoute.tsx` | 메모 로드·저장·편집기 배선, 툴바 콜백 |
| `store.ts` | `memos` 상태 · 메모 저장 대기열 분리 · Undo/Redo 가 Doc 경유 |
| `data/idb/repo.ts` | `loadBundle` 에 memos · `listMemos`/`upsertMemos`/`deleteMemos` · **층 삭제 시 메모 연쇄 삭제** · `normalizeDefect` |
| `packages/project-core/src/repo.ts` | `ProjectRepo<TDefect, TMemo>` 에 메모 3메서드 |
| `styles.css` | 팔레트 모양 줄 · 툴바 펼침 메뉴 · 메모 편집기 · 리사이즈 커서 5종 |

## S2a-2. 불변식·함정을 어떻게 지켰는가

| 규칙 | 어떻게 |
|---|---|
| **#1 모든 좌표 0~1 정규화** | 새 geometry 4종 전부 정규화. **크기(w·h)도 비율이다.** 생성·이동·리사이즈 모든 경로에서 `clamp(0,1)` / `clampGeometryInside` / `translatePathInside`. 테스트로 고정 |
| **기하 판정은 스크린 px** | Shift 정사각·리사이즈·해치 간격·구름 호 길이·히트 거리 **전부 스크린에서 계산**하고 마지막에만 정규화로 되돌린다. 테스트를 **4000×1000 (종횡비 4:1)** 도면으로 돌려 N 공간 계산이면 반드시 깨지게 만들어 뒀다 |
| **위치·크기는 geometry, style 이 아니다** | `SET_MARK_GEOMETRY` 는 `marks[].geometry` 만 쓴다. 테스트 `영역을 옮기고 크기를 바꿔도 style 은 null 로 남는다` 로 고정. 반대로 색·모양만 `SET_STYLE` 로 가고, 마지막 키가 지워지면 `patchStyle` 이 **null 로 되돌려** 상속에 복귀시킨다 |
| **영역 내부 히트는 최하위** | 순위 8번 + **채움일 때만.** 투명 영역의 빈 속은 아예 안 잡혀 팬이 된다. 테스트 2건으로 고정 |
| **메모는 결함이 아니다** | 별도 스토어 · 별도 저장 대기열 · `defectsOfDrawing` 과 분리 · 결함 리스트/건수 미포함. 색은 포스트잇 노랑이고 **예약색 회피를 테스트로 고정** |
| **전부 Undo 대상** | 커맨드 8종을 기존 스택에 편입. 7개 조작에 대해 `apply → invert → 원본과 동일` 왕복 테스트 |
| **`canvas-core` 경계** | 새 파일 2개 포함 `window`/`document`/`Image`/`rAF`/React **0건** (아래 grep). 시간은 `ctx.now()`, 기기 id 는 `ctx.deviceId` 로 주입받는다 |

## S2a-3. 히트 우선순위 (실제 구현)

```
1. 번호 라벨
2. 영역 리사이즈 핸들   ← 선택된 결함의 것만
3. 점 마크
4. 화살표 (머리·꼬리 핸들 → 몸통)
5. 영역 테두리
6. 자유그리기 선
6-b. 리더선            ← 스펙 목록에 없어 얇은 선들 사이에 뒀다 (ASSUMPTIONS E3)
7. 메모
8. 영역 내부           ← **채움일 때만**
9. 빈 도면
```

## S2a-4. 검증한 것

| 항목 | 방법 | 결과 |
|---|---|---|
| 타입 검사 3개 패키지 | `npm run typecheck` | ✅ 통과 |
| 단위 테스트 | `npm test` | ✅ **161개 통과** (canvas-core 111 + project-core 50). S2a 신규 **32개** |
| 기존 테스트 회귀 | 위와 동일 | ✅ 기존 129개 **전부 유지** (ARROW geometry 형식 변경분만 테스트 수정) |
| 프로덕션 빌드 | `npm run build` | ✅ JS 316.11 kB (gzip 97.35 kB) / CSS 34.78 kB (gzip 6.94 kB) |
| **부팅 스모크 1회** | dev 서버 → 목록 → 샘플 시딩 → 용역 구성 → **캔버스 진입** | ✅ 흰 화면 없음. **콘솔 에러·경고 0건** (favicon 404 제외 — 기존부터 있던 것) |
| 도구 팔레트 실측 | 접근성 스냅샷 | ✅ `선택 · 점 · 방향 · 영역 · 그리기 · 메모` **6개 전부 활성**. `준비 중` 비활성 사라짐 |
| `canvas-core` 경계 | `grep -rnE "window\|document\|Image\|requestAnimationFrame\|from 'react'" src/` | ✅ **0건** |
| `word-break: break-all` | 전역 grep | ✅ 0건 (주석 제외) |
| `@media (hover: hover)` 누락 | 스크립트로 CSS 블록 파싱 | ✅ 감싸지 않은 `:hover` **0건** |
| 새 조작요소 상태 정의 | `palette__subbtn` `ctx-pop__swatch` `ctx-pop__item` 대조 | ✅ hover·active·focus-visible·selected·disabled 정의. **hover ≠ selected ≠ (selected+hover)** 세 값이 서로 다름 |
| 아이콘 전용 버튼 접근 이름 | 소스 대조 | ✅ 모양 버튼·색상 스와치 전부 `aria-label` |

### 32개 신규 테스트가 잡는 것

생성(꼬리→머리 / 역방향 대각 / 8px 취소 / 생성 즉시 선택 / **Shift 정사각이 스크린 기준** /
좌표 0~1 클램프 / 도면 밖 시작 거부) · 자유그리기(결함 종속 · 마크가 아님 · 선택 없으면 거부) ·
메모(생성 즉시 편집 요청 · 결함 컬렉션 불변 · **예약색 회피** · 빈 메모 삭제 · 한글 어절 줄바꿈) ·
히트(**채운 큰 영역이 위의 점을 삼키지 않음** · 투명 영역 속은 팬 · 테두리는 잡힘 · 메모는 결함보다 아래 ·
핸들은 선택된 것만) · 스타일(기하 변경이 style 을 더럽히지 않음 · 색 변경 후 null 복귀) ·
Undo 7종 왕복 · 순수 기하 4종

## S2a-5. 안 되는 것 / 범위 밖

| 항목 | 상태 | 이유 |
|---|---|---|
| 출력 시 자유그리기·메모 ON/OFF 체크박스 | 미구현 | Phase 4 — 스펙 §S2a-7 이 명시 제외 |
| 결함정보 입력 패널 연결 | 미구현 | S2b |
| 컨텍스트 툴바 `복제` · `추가` | **비활성 유지** | 마크 그룹 편집 UI = 범위 밖 (§S2a-7). 데이터 구조는 이미 지원 |
| 자유그리기 **점 단위** 편집 | 미구현 | 스펙 §S2a-4 가 "전체 이동만" 으로 못박음 |
| 메모 스타일 편집 UI | 미구현 | 스펙에 `style?` 타입만 있고 조작이 정의되지 않음. 타입·렌더 경로만 뚫어 둠 |
| 표기 종류 변경 `[점 ▾]` 드롭다운 | **비활성 유지** | Phase 3 부터 `준비 중`. 스펙이 켜라고 하지 않음 |

## S2a-6. 미검증 (클릭해봐야 아는 것)

브라우저에서 **띄워서 콘솔이 깨끗한 것까지만** 확인했다.
실제로 끌어 그려 본 검증은 하지 않았다 — 검증 분담 (`ui-quality §7`).

---

# 실행 방법

```
cd C:\Users\samsung\Desktop\OnSpect
npm install
npm run dev      →  http://localhost:5173/
```

빈 목록이면 `[샘플 용역 만들기]` → `[캔버스 열기 ▶]`.

---

# 직접 확인해주실 것

## A. 반응형 (R)

1. **창을 1920px 로 최대화하고 용역 구성 화면을 연다**
   → `지하1층` 과 `도면 없음 / 도면 올리기` 가 **바로 옆에 붙어 있는가**, 아니면 여전히 멀리 떨어지는가
2. **같은 화면에서 층이 2~3개뿐일 때**
   → 좌측 `동` 패널과 우측 `층·도면` 패널이 **내용 높이에서 멈추는가** (화면 끝까지 늘어나지 않는가)
3. **용역 목록에서** → 용역명과 `41분 전 · 도면 5장` 사이 거리가 눈으로 훑기에 적당한가
4. **캔버스 화면에서 창을 최대화** → 도면이 **여전히 꽉 차는가** (목록처럼 가운데로 좁아지면 잘못된 것)
5. **창 폭을 900px · 700px 로 줄인다** → 층 행·목록 행에서 라벨이 깨지거나 넘치는 곳이 있는가
6. **층 이름을 아주 길게** (`지하3층 기계실 및 전기실`) → 말줄임되는가, 행이 밀리는가

## B. 마커 도구 (S2a)

7. **`방향` 도구 → 도면을 짧게(5px) 끌었다 놓는다** → 아무것도 안 생기고 안내가 뜨는가
8. **`방향` 을 길게 끈다** → 누른 곳이 꼬리, 뗀 곳에 화살촉인가. **번호 풍선이 화살촉 쪽**에 붙는가
9. **`영역` → 아래 `사각`/`타원` 을 바꿔 가며 그린다** → 두 모양이 다 나오는가
10. **`영역` 을 그릴 때 Shift 를 누른다** → 화면에서 **정사각형/정원**으로 보이는가
    (`지하2층` 은 4000×800 도면이라 여기서 확인하면 확실하다)
11. **그린 영역을 선택 → 8개 핸들을 각각 끌어 본다** → 커서가 방향에 맞게 바뀌는가, 크기가 자연스러운가
12. **화살표를 선택 → 머리/꼬리 끝점을 각각 끈다** → 한쪽만 움직이는가
13. **영역 툴바에서 `구름` 을 고른다** → 구름 테두리가 자연스러운가. **호 크기가 적당한가**
14. **`채움` 을 켠다** → 45° 해치가 도면 선을 가리지 않는가. **간격·진하기가 적당한가**
15. **`채움` 을 켠 큰 영역 위에 점을 찍고, 그 점을 클릭** → 점이 잡히는가 (영역이 삼키면 잘못된 것)
16. **`채움` 을 끈 영역의 빈 속을 끈다** → 화면이 팬 되는가 (영역이 끌려가면 잘못된 것)
17. **결함을 하나 선택한 뒤 `그리기` 로 곡선을 그린다** → 그 결함에 붙는가. **선 굵기가 적당한가**
18. **아무것도 선택하지 않고 `그리기`** → 안내가 뜨고 아무것도 안 생기는가 → **이 동작이 맞는지 판단해주세요 (QUESTIONS Q16)**
19. **그린 곡선을 끌어 옮긴다** → 획 전체가 따라오는가
20. **`메모` 도구로 도면을 클릭** → 노란 입력창이 그 자리에 뜨는가
21. **글을 쓰고 `Ctrl+Enter`** → 도면 위에 노란 쪽지로 남는가. **글자 크기·상자 폭이 적당한가**
22. **긴 한글을 쓴다** (`천장 슬래브 누수 흔적 확인 요망`) → **단어 한가운데가 잘리지 않는가**
23. **메모를 더블클릭** → 다시 고칠 수 있는가
24. **메모 내용을 다 지우고 저장** → 메모가 사라지는가
25. **메모가 결함 목록(좌측·우측 패널)에 나타나지 않는가** ← 나타나면 결함
26. **메모 색이 결함 표기(빨강)와 헷갈리지 않는가**
27. **줌인/줌아웃을 크게 해본다** → 메모·영역·화살표가 도면과 함께 자연스럽게 커지고 작아지는가
28. **위 조작을 하나씩 하고 매번 `Ctrl+Z`** → 전부 되돌아가는가 (특히 **메모 이동 · 스타일 변경**)
29. **색상 팔레트에서 색을 고른 뒤 `스타일 초기화`** → 상태 기본색(빨강)으로 돌아가는가
30. **도구를 바꿀 때마다 커서를 본다** → `선택`=손 / `점·방향·영역·그리기`=십자 / `메모`=글자 커서로 바뀌는가
