# 구현 로그 — Phase 5 태블릿 1차: T2-3(층 칩 스트립) · T2-4(미니맵) · T2-6(안전영역 배선)

작성: builder · 2026-09-03
스펙: `_workspace/50_plan-reviewer_spec_Phase5_TeamSync.md` §6-2, D10.
전제로 읽은 것: `apps/web/src/shell/useUiMode.ts` · `apps/web/src/shell/TabletSheet.tsx`(T2-1, 이미 완료) ·
`apps/web/src/canvas/CanvasView.tsx`(안전영역 실측 로직) · `apps/web/src/routes/CanvasRoute.tsx` ·
`packages/canvas-core/src/viewport.ts`(`CENTER_ON_NORM`) · `packages/project-core/src/floorOrder.ts`(`sortByOrder`).

## 완료

| 작업 | 파일 | 상태 |
|---|---|---|
| T2-3 층 칩 스트립 | `apps/web/src/shell/FloorChips.tsx`(신규) · `CanvasRoute.tsx`(배선) · `styles.css` | 완료 |
| T2-4 미니맵 | `apps/web/src/shell/Minimap.tsx`(신규) · `CanvasRoute.tsx`(배선) · `styles.css` | 완료 |
| T2-6 안전영역(safe-insets) 배선 | `apps/web/src/canvas/CanvasView.tsx`(`reserveBottomPx` prop 추가) · `CanvasRoute.tsx`(`sheetBottomPx` 계산) · `TabletSheet.tsx`(`viewportHeight` export) | 완료 |

### 설계 메모

**T2-3 — 층 칩 스트립.** 기존 층 전환은 `Sidebar`(좌측 동·층 트리) 하나뿐이었다. 이걸 대체하지
않고 **보완**한다 — 같은 `onSelectFloor`(`CanvasRoute.selectFloor`)로 이어지는 새 컴포넌트
`FloorChips`를 만들어 태블릿(`tablet` 플래그, 가로·세로 둘 다)에서만 `.stage` 상단에 띄운다.
정렬은 `CanvasRoute`가 이미 만들어 둔 `orderedFloors`(동 순서 → `Floor.sortOrder` 오름차순,
`project-core/sortByOrder` 그대로)를 그대로 받는다 — **새 정렬 규칙을 만들지 않았다.**
칩에는 `defectCountByFloor`로 결함수 뱃지, 도면 없는 층은 작은 점 표시(Sidebar의 "도면 없음"
칩과 같은 의미, 좁은 자리라 문구 대신 점으로 줄였다). 층이 1개뿐이면 렌더하지 않는다(전환할
것이 없다).

**T2-4 — 미니맵.** 이동은 스펙 지시대로 새로 만들지 않고 `CENTER_ON_NORM`(코어, Phase5
트랙A에 이미 구현·테스트됨, `viewport.ts`)을 그대로 쓴다. 썸네일도 새 이미지 로드 파이프라인을
만들지 않았다 — 캔버스가 이미 그리고 있는 `drawingUrl`(디코드된 같은 이미지, `objectUrl` 또는
합성 결과)을 `<img>` + `object-fit:contain`으로 축소해 재사용한다. 뷰포트 사각형은
`toNorm({0,0}/{canvas.w,canvas.h}, viewport, iw, ih)`로 화면 네 모서리를 도면 정규화 좌표로
역변환해 퍼센트 박스로 그린다 — 코어의 기존 좌표 변환 함수(`geometry.ts`)를 그대로 썼다.
탭하면 탭 지점의 정규화 좌표를 계산해 `send({k:'CENTER_ON_NORM', n})`으로 보낸다. 코어는 이
파일의 존재를 모른다(스펙 요구 그대로 "canvas-core 쪽엔 손댈 게 없다").

**T2-6 — 안전영역 배선.** 처음에 `.sheet`에 기존 `[data-floating]` 스캔 메커니즘
(`CanvasView.tsx`의 `measureInsets`, `.stage` 자식만 `querySelectorAll`)을 그대로 태우려 했으나
**안 된다** — `.sheet`는 `position:fixed`로 `.stage` 형제(`.body`의 직계 자식)에 뜬다. DOM
조상 기준 스캔의 사각지대다. 대신 `CanvasView`에 새 prop `reserveBottomPx`를 추가해
`measureInsets`가 계산한 `insets.bottom`과 **max**로 합치는 방식을 택했다 — 다른 떠 있는 UI가
이미 그 이상을 잡아먹고 있으면 그 값을 존중한다. `CanvasRoute`는
`SHEET_SNAP_RATIO[sheetSnap] * viewportHeight()`로 시트의 실제 CSS 높이(`styles.css`
`.sheet[data-snap] { height: N% }`)와 **같은 공식**을 계산해 넘긴다 — `viewportHeight()`는
`TabletSheet.tsx`에서 새로 `export`해 재사용했다(값이 어긋나면 안전영역이 시트 높이와
따로 논다). 시트가 열려 있지 않을 때(결함 미선택 · PC · 태블릿 가로)는 0이라 지금까지의
동작과 동일하다.

`measureInsetsRef`(ref로 노출한 `measureInsets` 함수)를 만들어 `reserveBottomPx`가 바뀔 때마다
(3단 스냅 전환 등) `ResizeObserver`/`MutationObserver` 설정을 다시 만들지 않고 같은 함수를 다시
불러 재계산한다 — 관찰자 재구성 비용 없이 최신 값을 반영한다.

## 미완료 / 막힌 것

없음. 3개 작업 전부 스펙대로 완료했다.

## 검증한 것

- `npm run typecheck` — 3개 패키지(canvas-core · project-core · web) 전부 통과
- `npm test` — canvas-core 392개 · project-core 308개, 총 700개 테스트 전부 통과(회귀 없음).
  이번 작업은 신규 순수 함수를 추가하지 않아(전부 화면 배선) 새 단위 테스트는 추가하지 않았다 —
  기존 `CENTER_ON_NORM`·`toNorm`·`clamp01`·`sortByOrder`는 이미 테스트돼 있다
  (`phase5TrackA.test.ts`·`geometry.test.ts`·`floorOrder.test.ts`).
- `npm run build` — `apps/web` 프로덕션 빌드 통과(vite). 청크 크기 경고는 기존에도 있던 것으로
  이번 변경과 무관(538KB 메인 청크 — 도면 렌더러·엑셀 라이브러리 등 기존 구성).
- 코드 점검(ui-quality §7-1 취지) — PC 경로: `FloorChips`·`Minimap`은 `{tablet && …}`로만
  렌더되고, `reserveBottomPx`는 PC에서 `sheetMode=false → sheetBottomPx=0`이라 `measureInsets`의
  `Math.max(insets.bottom, 0)`은 항상 기존 값 그대로다 — **PC 안전영역 계산 결과 불변**을 코드로
  확인(로직 추적, 런타임 실행은 안 했다).

## 직접 확인해주실 것

- [ ] 태블릿(가로·세로) 실기기에서 층이 2개 이상인 용역을 열면 도면 위쪽에 층 칩 스트립이 뜨고,
  가로로 밀어 넘기면(스크롤) 잘리지 않고 전부 보이는가
- [ ] 칩을 탭하면 그 층으로 전환되고(Sidebar 트리를 눌렀을 때와 동일한 결과), 결함수 뱃지가
  Sidebar의 층별 건수와 일치하는가
- [ ] 도면이 없는 층의 칩에 작은 점(●) 표시가 뜨고, 눌러도 캔버스는 "도면이 없습니다" 빈 상태로
  정상 전환되는가
- [ ] 태블릿에서 도면 우하단에 미니맵이 뜨고, 확대·축소·팬을 하면 미니맵 안 사각형이 실제
  보이는 영역과 맞게 움직이는가
- [ ] 미니맵을 탭하면 그 지점이 화면 중앙으로 이동하는가(배율은 안 바뀌어야 한다)
- [ ] **세로 태블릿**에서 결함을 선택해 바텀시트가 뜬 상태로, 시트를 PEEK→HALF→FULL로 끌어
  올리면서 시트 바로 위 결함 번호 풍선이 시트에 가려지지 않고 화면 안으로 밀려 보이는가
  (선택된 결함이 시트 아래로 숨으면 안 된다 — 이게 T2-6의 핵심 확인 포인트)
- [ ] 시트를 접었다 펼 때(PEEK/HALF/FULL 전환)마다 도면이 그 즉시 다시 안전영역에 맞게
  자리를 잡는가(늦게 따라오거나 안 따라오면 안 된다)
- [ ] **PC 화면은 이번 변경으로 아무것도 달라지지 않아야 한다** — 층 칩 스트립·미니맵이 안 보이고,
  기존 좌측 팔레트·하단 도움말 줄의 안전영역 동작(선택 대상이 팔레트에 가리지 않는 것)이
  그대로인가

## 알려진 한계

- **바텀시트 드래그 중(손잡이를 끄는 동안)에는 안전영역이 실시간으로 안 따라온다.** `sheetBottomPx`는
  `sheetSnap`(3단 스냅 값) 기준으로만 재계산된다 — 드래그를 놓아 스냅이 확정된 순간에 반영된다.
  스펙 원문("시트 높이가 바뀔 때마다(3단 스냅 등) 값을 다시 계산해서 보내라")이 3단 스냅을
  콕 집어 말한 것과 일치한다고 판단해 드래그 중 픽셀 단위 실시간 추적은 넣지 않았다. 실기기에서
  드래그 중 표기가 잠깐 가려지는 것이 거슬리면 후속 작업으로 뺄 수 있다.
- 미니맵 위치(우하단, 130×100px 이내)·층 칩 스트립 위치(상단 전체 폭)는 스펙에 정확한 좌표가
  없어 기존 떠 있는 UI(좌측 팔레트·좌하단 도움말 줄)와 겹치지 않는 자리로 임의로 정했다. 실기기
  확인 후 조정이 필요할 수 있다.
- 미니맵 썸네일은 원본 `drawingUrl`을 CSS로 축소해 쓴다. 도면이 매우 크면(수천만 px) 디코드
  비용은 어차피 캔버스가 이미 지불하고 있으므로 미니맵이 추가로 비용을 더하지 않지만,
  `Drawing.thumbBlobKey`(더 작은 썸네일 전용 Blob)를 쓰는 경로는 이번에 만들지 않았다 —
  스펙이 "새로 만들지 말라"고 명시한 것은 이동 로직(`CENTER_ON_NORM`)이었고 썸네일 소스는
  범위 밖으로 판단했다.
