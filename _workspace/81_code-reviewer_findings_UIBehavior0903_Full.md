# 검수 결과 — UI·동작 개선 16건 + 실사용 2라운드 (브랜치 `feat/ui-behavior-0903`, `main` 병합 전)

대상: `origin/main`(303d81f) 이후 `feat/ui-behavior-0903`(bef974c)의 커밋 전부(18개).

## 판정
**조건부 통과**

타입검사 3워크스페이스 0오류 · 단위테스트 **823개 전부 통과**(canvas-core 470 · project-core 353) · 프로덕션 빌드 통과 — 전부 이 자리에서 직접 재실행해 확인했다. 도메인 불변식 위반이나 데이터 손실로 이어지는 심각 버그는 발견하지 못했다. 다만 이번 라운드가 세 번 뒤집은 규칙(D27→D35, D28→D36, F5-3→D37) 각각에 대해 **코드 자체는 새 규칙과 일관되지만, 옛 규칙을 그대로 서술하는 주석이 세 파일에 남아 있다** — 이 프로젝트가 스스로 "확정 사항이 세 번 뒤집혔다"고 경고한 바로 그 지점이라 [보통]으로 올려 반드시 정리를 권한다.

---

## 지적 사항

### [보통] D37(F5-3 뒤집기)을 부정하는 옛 주석이 3곳에 남아 있다 — ✅ 리더가 병합 전 정정함
- 파일:
  - `packages/project-core/src/a4.ts:22-28` — *"⚠️ 넘버링 좌표는 절대 함께 옮기지 않는다(F5-3 원문)... 두 번 변환되어 어긋난다."*
  - `apps/web/src/routes/DrawingScaleDialog.tsx:5-7` — *"결함 표기 좌표는 옮기지 않는다(Numdraw는 옮겼지만...)."*
  - `apps/web/src/routes/ProjectSetup.tsx:347` — *"F5-3 — 배율 적용. **좌표는 한 글자도 건드리지 않는다.**"*
- 문제: 세 곳 모두 실제 코드 동작과 정반대다. `applyDrawingScale`/`transformAll`은 D37대로 좌표를 옮기고, `DrawingScaleDialog.tsx`의 실제 안내 문구도 "결함 표기도 도면 그림을 따라 함께 움직입니다"라고 옳게 말한다. 즉 **동작은 맞고 문서만 틀렸다.**
- 재현: 코드를 처음 읽는 사람(다음 세션의 에이전트 포함)이 이 헤더 주석만 보고 "좌표는 안 옮긴다"고 믿은 채 다음 수정을 하면, D37을 실수로 되돌리는 회귀가 날 수 있다.
- 수정: 세 주석을 D37(2026-09-03 재확정) 기준으로 갱신 완료.

### [경미] `ARROW_HEAD_MAX_RATIO` 죽은 상수 — 조치 불요로 확인
- 파일: `packages/canvas-core/src/constants.ts:212`
- 문제 제기: C-1 초판(상한=전체길이×0.5) 설계에서 만든 상수인데, Q67 A안 재확정(길이 무관 고정)으로 로직이 바뀌며 쓰는 코드가 사라졌다.
- 재확인 결과: 이미 `@deprecated 2026-09-03` 태그 + "이력을 위해 남긴다"는 사유가 명시돼 있어 검수 기준(쓰지 않는 이유를 주석 한 줄로 남긴다)을 이미 충족. **변경 없음.**

### [경미] 배치 로그(B7-d)와 실제 코드가 어긋난다 — 문서만의 문제, ✅ 정정함
- 파일: `_workspace/79_builder_log_B7_Marquee.md` "세운 가정 B7-d" vs `packages/canvas-core/src/interaction.ts`
- 문제: 로그는 "다중선택 상태에서 우측 패널은 예전 그대로(마지막 단일 선택 기준)"라고 적었지만, 실제 `onPointerUp`의 `MARQUEE` 분기는 `selection: {...NO_SELECTION}`으로 **선택을 완전히 비운다.** 기능은 정상(오히려 이쪽이 혼동을 덜 준다), 로그 기술이 부정확할 뿐이었다.
- 수정: 로그에 정정 주석 추가 완료.

---

## 우선 지목 구간 정밀검수 결과 (근거 포함)

### 1) `DrawingScaleDialog.tsx` / `size.ts` — 배율 변경 시 좌표 동반 이동 (D37)
- **좌표 변환 수학 검증** — `apps/web/src/data/drawingScale.ts::layoutTransform`이 `a4Transform(from)`⁻¹∘`a4Transform(to)`를 합성한다. 직접 전개해 `sx = t1.sx/t0.sx`, `ox = t1.ox - t0.ox*sx` 식이 정확한 합성 결과임을 손으로 검산했다 — 맞다.
- **정규화 불변식** — `packages/canvas-core/src/renormalize.ts::mapPoint`(위치=오프셋+배율)와 `mapSize`(크기=배율만)를 분리해 적용하고 `roundNorm`으로 마무리한다. 마크·라벨·자유그리기·메모 앵커·필기획 전부 커버(`transformDefect`/`transformMemo`).
- **실시간 미리보기 vs 실제 적용값 어긋남** — `CanvasRoute.tsx`의 `computeScale`이 **항상 `scaleSnapshot`(다이얼로그를 연 시점의 스냅샷)에서** 계산하고 누적하지 않는다. `[적용]`도 같은 `computeScale`을 쓴다 — 미리보기와 확정이 같은 함수라 어긋날 수 없다.
- **여러 도면 일괄 적용 시 도면별 정확한 배율** — `computeScale`이 대상 도면마다 `applyDrawingScale(dw, raw)`을 개별 호출해 그 도면 고유의 `imgLayout`으로 계산한다. "모든 도면"을 켰다 끄면 `paintScale`이 대상에서 빠진 도면을 스냅샷으로 되돌리는 로직(`revert`)도 확인했다 — 저장 없이 취소해도 안전.
- **옛 도면(`imgLayout` 없음) 스킵** — `applyDrawingScale`이 `!dw.imgLayout`이면 `{ok:false}`, `computeScale`은 `continue`로 조용히 건너뛰고 `skipped` 건수를 센다. 토스트에 "N장은 A4 정규화 전이라 건너뛰었습니다"로 알린다 — D37 그대로.

### 2) `labelGrid.ts` / `interaction.ts` — 번호풍선 직교 정렬 재설계 (D36)
- **격자 스냅 잔재 확인** — `gridAlignLabels`/`GRID_PITCH_FACTOR`/`GridAlignItem` 전부 grep 0건. 완전히 새 함수(`alignLabelsToAnchors`)로 교체됐고 옛 코드가 안 남아 있다.
- **Undo 1스텝** — `ALIGN_LABELS` 커맨드 1개(`commands.ts`)가 여러 결함을 한 번에 적용/역적용한다. `defectTargetsOf`가 `ALIGN_LABELS`를 배치로 처리하도록 별도 분기 확인.
- **이미지 px 좌표계** — `labelGrid.ts` 자체는 이미지 px만 받고 정규화 변환은 호출자 몫으로 명시. 실제 호출부(`store.ts::alignLabels`)가 `effectiveLabelNorm(...) * iw/ih`로 변환 후 넘기고, 결과를 다시 `/iw`, `/ih`로 되돌린다 — 절대규칙("기하 판정은 스크린/이미지 px") 준수.
- **아키텍처 편차(버그 아님)** — 스펙 초안(§70 P-2)은 `InputEvent {k:'ALIGN_LABELS_GRID'}`를 canvas-core에 두라고 했으나, 실제 구현은 `apps/web/src/store.ts::alignLabels`가 직접 `alignLabelsToAnchors`를 호출하고 `applyAndPush`로 커밋한다. Undo·저장대기열은 이 앱의 다른 액션들과 동일 경로라 기능적으로는 문제없다 — 기록만 해둔다.

### 3) 4종 상태 재정의 + 잠금 규칙 반전 (D35)
- **`isLocked` 옛 규칙 잔재 검색** — `!== 'CURRENT'` 패턴을 전체 검색(주석·테스트 주석 제외) 결과 **0건**. `isLocked(d) = d.status === 'PREV_PENDING'`(`defectGeom.ts`) 하나만 존재하고, `interaction.ts`(15곳)·`store.ts`(3곳)·`CanvasRoute.tsx`(3곳)·`Inspector.tsx` 전부 이 함수 하나만 참조.
- **`canAddPhotos`** — 4종 전부 `true` 반환(`defectGeom.ts`)으로 정정됐고, 사진 추가 가드는 이 함수만 거친다.
- **색·불투명도** — `STATUS_COLOR`/`STATUS_OPACITY`(`constants.ts`)가 D35 표와 정확히 일치(결함 빨강/신규 보라/전차 남색/보수완료 파랑, 불투명도 전부 1). `styles.css`의 `--defect-*` 4변수가 같은 헥스값.
- **전이 게이트** — `canSetStatus`(`defectGeom.ts`)는 `to===from` 거부 + `prevDefectId===null`인 결함을 `PREV_PENDING`으로 못 보내는 것만 막는다. `Inspector.tsx`의 4버튼 셀렉터(`STATUS_PICK`)가 `locked`로 막지 않고 이 함수만 쓴다 — D33·D35 "종류 변경만은 잠긴 결함에서도 항상 활성" 요구와 일치.
- **범례** — `statusRows()`가 저장 필드와 화면 이름의 불일치를 타입 주석 표로 명시했고, `projectLegendOf`가 `statusNewFound ?? false`로 옛 레코드를 안전하게 정규화 — 마이그레이션 0.
- **numbering.ts** — `NEW`가 `CURRENT`와 함께 항상 포함(`statusAllowed`), `REPAIRED`/`PREV_PENDING`만 필터 대상 — 출력 개소 함정과 무관, 안전.

### 4) 영역선택(마퀴) + 일괄 삭제·이동, Delete 키 가드 (D32)
- **Delete 키 버그 재현·수정 확인** — 옛 코드는 `if (!s.selection.defectId) return`으로 막았는데, 지금은 `if (!s.selection.defectId && s.multi.length===0) return`으로 정정 — 신고된 버그가 코드로 재현 가능했고 수정도 정확하다.
- **`Selection`을 배열로 바꾸지 않은 판단** — `CanvasState.multi: readonly string[]`을 별도 목록으로 둔 설계가 히트판정·렌더·Inspector·좌측 리스트·Undo 여섯 곳의 단수 전제를 안 건드렸다.
- **잠긴 결함 처리** — 선택은 되고 삭제·이동에서만 제외 — "몇 건은 잠겨 있다"는 안내까지 포함해 D32 그대로.
- **일괄 이동 델타/클램프** — `TRANSLATE_DEFECTS{dx,dy}` 단일 델타, 역커맨드는 부호만 반전. `clampDefectsTranslate`가 **델타 자체**를 도면 경계로 좁혀 상대 위치가 안 깨지도록 함 — 결함마다 개별 클램프하지 않는다는 설계 확인.
- **팬 회귀 없음** — 중클릭·Space+좌클릭이 마퀴 분기보다 앞서 처리돼 팬을 잃지 않는다.
- **재현성 참고(기존 성질, 이번 라운드가 새로 만든 문제 아님)** — `ALIGN_LABELS`·마퀴 이동 후 `[같은 번호로 다시 받기]`는 번호만 같고 풍선 위치는 새 위치로 나온다(`ExportRun`이 좌표를 저장하지 않으므로). `NEXT.md`에 이미 "판단 필요"로 기록돼 있어 별도 지적으로 올리지 않음.

### 5) 화살촉 축척 고정 (C-1)
- **핵심 트릭 검증** — `resolveArrowHead`(`shapes.ts`)가 실제 좌표를 안 바꾸고 "방향은 같고 거리만 뒤로 물린" 가상 기준점을 만들어, `arrowHeadPolygon`/`arrowShaftEnd` 내부의 `Math.min(head, len*0.5)` 안전장치가 더는 촉을 깎지 못하게 한다 — `back = max(len, h*2)`로 계산해 `len*0.5 >= h`가 항상 성립하도록 만든 것을 수식으로 확인했다.
- **실제 렌더 vs 드래그 중 고스트 일치** — `ghostToOps`(`renderModel.ts`)가 `arrowOps`를 **그대로 재사용**해 그 안에서 `resolveArrowHead`가 호출된다 — 실제 렌더와 고스트가 같은 함수 한 벌을 타므로 "그릴 땐 컸는데 손을 떼면 작아진다" 회귀가 구조적으로 불가능하다.

---

## 불변식 검수표

| # | 불변식 | 결과 | 근거 |
|---|---|---|---|
| 1 | 마커 좌표 0~1 정규화 | ✅ 통과 | `renormalize.ts::mapPoint/mapSize`가 위치·크기를 분리 처리 + `roundNorm`. `clampDefectsTranslate`가 델타를 도면 경계로 좁힘. `layoutTransform` 합성식 수기 검산 완료 |
| 2 | 출력번호·사진번호 미저장 | ✅ 통과 | `ExportRun`·`numbering.ts` 무변경. `ALIGN_LABELS`는 `label.{x,y,placed}`만 바꾸고 번호는 계산값 그대로 |
| 3 | 로컬 쓰기 우선(오프라인) | ✅ 통과 | 이번 라운드 변경 파일에서 서버 호출(`fetch`/`supabase`) 0건. `applyScale`도 `repo.putDrawing` 로컬 저장 후 토스트 |
| 4 | 면적 계산(절사·개소 미곱) | ✅ 통과(무변경) | `size.ts::areaFromMm/trunc4` 로직 자체는 이번 라운드에서 안 바뀜. C-3(D31)은 표시 출처 판정만 추가 |
| 5 | 층 sortOrder 정수 비교 | — 무관 | 이번 범위에서 층 정렬 로직 변경 없음 |
| 6 | 원인·보수방안 FK 미직결 | ✅ 통과(무변경) | 이번 라운드 항목설정 변경은 `MemberMaster.tabletVisible` 불리언 필드 추가뿐 |
| 7 | 항목설정 스냅샷 복사(FK 아님) | ✅ 통과 | `tabletVisible`이 기존 스냅샷-복사 경로를 그대로 탄다. `isTabletVisible()`이 `undefined→true`로 읽어 옛 스냅샷도 안전(D34) |
| 8 | 사진 isPrimary 정확히 1장 | ✅ 통과(무변경) | T-7은 그리드 순서만 바꿨고 `isPrimary` 판정 로직은 손대지 않음 |

**추가 확인(이번 라운드 특유 위험)**
- **잠금 규칙 전면 반전(D35)** — `isLocked` 단일 정의, 21곳 참조 전부 일관. 옛 규칙 문자열 검색 0건.
- **좌표 동반 이동(D37)** — 수학적으로 정확하나 3개 파일에 이 규칙을 부정하는 옛 주석이 남아 있어 [보통]으로 지적 → 병합 전 정정 완료.

---

## 확인하지 못한 것

- **실기기 조작 검증 전부** — 태블릿 T-1·T-3·T-7·T-8·T-9, 마퀴 드래그·핀치줌과의 상호작용, 롱프레스 리사이즈(1초 타이밍·8px 이동 취소)는 코드 로직만 읽었다.
- **`MemberColumn.tsx`의 태블릿 노출 토글 UI 전체 플로우** — 판정 코드는 확인했으나 체크박스/컨텍스트메뉴 클릭 동작 자체는 시각적으로 확인 못함.
- **Undo 스택과 도면 크기조절의 상호작용 실측** — 기존 설계("도면 크기조절은 Undo 스택에 안 올라간다")라 새 버그로 보지 않았으나 경계 케이스는 코드만으로 전부 추적하지 못했다.
- **`ExportRun` 재현성 문제(정렬·크기조절 후 [같은 번호로 다시 받기])** — 이미 `NEXT.md`에 "판단 필요"로 기록된 기존 성질. 사용자 판단 아직 없음.
- **`layoutTransform`의 극단값** — 단위테스트(`a4Scale.test.ts` 6건, `renormalize.test.ts` 12건)가 일반 케이스는 덮지만 0-나눗셈 경계까지 전수 확인하지는 못했다.

---

## 요약(리더 전달용)

- 심각 버그 0건. `main` 병합을 막을 사유 없음.
- **병합 전 권장 조치(보통 1건)**: `a4.ts`·`DrawingScaleDialog.tsx`·`ProjectSetup.tsx`의 D37 이전 주석 3곳 갱신 — ✅ 완료.
- 경미 2건(죽은 상수는 이미 사유 명시돼 조치 불요, 배치로그 오기는 정정 완료).
- 타입검사·테스트(823개)·빌드 전부 재실행해 통과 확인.
