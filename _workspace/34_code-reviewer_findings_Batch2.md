# 검수 결과 — 배치2 (R-4 캡션·EXIF표시 / R-9 손상결함표 인쇄뷰 / R-8 코어+배선 / R-5 자르기 / R-6 주석 / F-4)

검수자: code-reviewer · 2026-08-28
대상 커밋: `ad820c6` · `7f6ef29` · `62cbaff` · `4d44354`
기준: `29_plan-reviewer_spec_PhotoPolish.md` §2-1~§2-5·§2-8·§2-9·§7 · `30_plan-reviewer_spec_UserFeedback0828.md` 2-4절

## 판정

**조건부 통과 — 배치2 완료 승인 (심각 0건)**

도메인 불변식 위반·데이터 손실·잘못된 보고서 수치 **0건**.
좌표 왕복·합성 순서 공유·objectURL 짝·키보드 양보·R-9 회귀 — **최고위험 6개 항목 전부 코드로 추적해 통과**.
아래 보통 3건은 사용자가 실제로 밟을 수 있는 경로이므로 다음 라운드에서 고친다(배치2 재작업 불필요).

| 심각도 | 건수 |
|---|---|
| 심각 | 0 |
| 보통 | 3 |
| 경미 | 5 |

---

## 1. 최고위험 항목 추적 결과

### ① 좌표 왕복 — UI 호출 방향 ✅ 통과

`photoTransform.ts` 는 단위테스트로 고정돼 있으므로 **호출 방향만** 추적했다.

| 지점 | 방향 | 판정 |
|---|---|---|
| `PhotoCropEditor.tsx:62-63, 71` 초기 rect | `crop`(렌더) → `toDisplayRect` → 표시 | ✅ 로드 = 렌더→표시 |
| `PhotoCropEditor.tsx:88` `[적용]` | 표시 → `toSourceRect` → `roundRect` → 저장 | ✅ 저장 = 표시→렌더 |
| `PhotoCropEditor.tsx:195-196` 픽셀 표기 | `toSourceRect` × `photo.width/height` | ✅ 렌더 프레임 기준(§2-3 명시) |
| `PhotoAnnotateEditor.tsx:92, 102` 로드 | `toDisplayAll`(= `toDisplayPoint`) | ✅ |
| `PhotoAnnotateEditor.tsx:138` `[적용]` | `toSourceAll`(= `toSourcePoint` + `ROUND4`) | ✅ |

**추가로 표시 프레임 자체가 변환표와 일치하는지 캔버스 수식으로 검산했다.**
`photoStage.useRotatedFrame` 은 `composePhoto` 로 회전만 굽는다. `composeFromDecoded` 의
`translate(ow/2,oh/2) → rotate(θ) → drawImage(-W/2,-H/2)` 를 전개하면

- rotate 90: 렌더 픽셀 `(px,py)` → 출력 `(H-py, px)` → 정규화 `u = 1-y, v = x`
- rotate 270: → 출력 `(py, W-px)` → 정규화 `u = y, v = 1-x`

`toDisplayPoint` 의 90 = `{1-y, x}` · 270 = `{y, 1-x}` 와 **정확히 일치**한다.
즉 "굽는 쪽"과 "좌표 변환하는 쪽"이 같은 회전 방향을 쓴다. 90° 어긋남 없음.
(CSS `transform: rotate(deg)` 도 같은 시계방향이므로 비합성 폴백 경로도 일치)

**결론: 회전된 사진에서 자르기·주석이 90° 어긋나는 경로는 코드상 없다.**
(단 실제 픽셀 확인은 사용자 몫 — §4 체크리스트)

### ② 합성 순서를 화면·출력이 같은 함수로 쓰는가 ✅ 통과

- `PrintPhotoBook.tsx` 는 **자체 렌더링을 하지 않는다.** `<img src={image.url}>` 와
  `frameStyle()` 뿐이고, 합성은 전부 `photoBookImages.ts → composePhotoFromUrl` 이다.
- 미리보기(`usePhotoComposite`)·편집기 회전 프레임(`useRotatedFrame`)·인쇄 뷰
  (`renderPhotoBookImages`) **세 소비자가 모두 `composePhotoFromUrl` 하나**를 부른다.
  합성 순서(`주석→자르기→회전`)는 `composeFromDecoded` 한 곳에만 있다. 두 벌 없음. ✅ 절대규칙 2
- **빠른 경로 검증**: `needsCompose(c)` = `hasPhotoEdits` = `crop !== null || annotations.length > 0`
  (회전 제외). false 면 `fallback = { url: repo.objectUrl(renderBlobKey), baked:false }` 가 그대로
  나가고 `frameStyle` 이 **기존과 똑같이** CSS `rotate` + 90/270 프레임 스왑을 건다.
  → 자르기·주석 없는 사진의 출력 결과는 이번 배치 전과 **한 픽셀도 다르지 않다.** ✅
- **이중 회전 없음**: `baked === true` 면 `frameStyle` 이 `transform` 을 아예 넣지 않는다
  (`PrintPhotoBook.tsx:80-82`). 미리보기도 `composite.baked ? undefined : rotate(...)`
  (`PhotoPreviewDialog.tsx:282-284`). ✅

### ③ objectURL 생명주기 ✅ 통과 (경미 1건)

| 생성 지점 | 해제 짝 | 판정 |
|---|---|---|
| `photoBookImages.ts:87` `created.push(url)` | `PrintRoute.tsx:169, 183` `releasePhotoBookImages(createdPhotos)` | ✅ |
| `photoStage.tsx:112` `useRotatedFrame` | 같은 effect 정리 `URL.revokeObjectURL(created)` (`:118`) | ✅ |
| `usePhotoComposite.ts:68` | 같은 effect 정리 (`:75`) | ✅ |

- **취소 경로**: 세 곳 모두 `if (!alive) return;` 가 `createObjectURL` **앞**에 있다
  (`photoStage.tsx:106`, `usePhotoComposite.ts:65`). 언마운트 중 완료된 굽기는 URL 을 아예 안 만든다.
- **`PrintRoute` 의 `createdPhotos = photoImages` 는 `await` 직후(`:148`)** 대입되고,
  `if (!alive)` 검사(`:167`)는 그 **뒤**에 있다 → 굽는 도중 kind/run 이 바뀌어도 새지 않는다. ✅
- effect 의존성이 `[storage, projectId, runId, kind]` 이므로 **kind 변경 = 정리 실행**.
  질문하신 "언마운트 전 kind 변경" 경로는 닫혀 있다. ✅
- 반복 출력 누수: 사진첩 인쇄 뷰를 열고 닫을 때마다 정리가 돌므로 누적되지 않는다. ✅
- ⚠️ 유일한 구멍은 아래 **경미 5**(예외 던짐 경로) — 실현 확률이 매우 낮다.

### ④ builder 자체결정 5건 판정 → 아래 §3

### ⑤ 키보드 양보 경로 ✅ 통과 (양방향 확인)

DOM 이벤트 전파 규칙 확인: `stopPropagation()` 은 **경로상 다음 객체**로 가는 것을 막고,
**같은 객체·같은 단계의 다른 리스너는 막지 않는다**(그건 `stopImmediatePropagation`).
`window` 는 경로에 struct 하나이고 capture pass / bubble pass 가 **따로 invoke** 되므로,
window-capture 에서 `stopPropagation()` 하면 **window-bubble 리스너는 건너뛴다**.

실제 리스너 배치:

| 리스너 | 대상 | 단계 |
|---|---|---|
| `CanvasView.tsx:300-301` | window | **bubble** |
| `PhotoPreviewDialog.tsx:192-193` | window | capture |
| `PhotoCropEditor.tsx:133` / `PhotoAnnotateEditor.tsx:164` | window | capture |

**캔버스로 새는가 (막아야 하는 방향)**

| 키 (편집 모드) | 경로 | 결과 |
|---|---|---|
| `Delete`·`Backspace` | 다이얼로그 `isCanvasShortcut` → `stopPropagation`+`preventDefault` (`:150-153`) | ✅ 캔버스 도달 안 함 |
| `Ctrl+Z`·`Ctrl+Y` | 같음 | ✅ 캔버스 히스토리 무사 (절대규칙 7) |
| `0`·`+`·`-` | 같음 | ✅ |
| `Escape` | 다이얼로그는 통과시키지만 **편집기가** `stopPropagation` (`:102-105` / `:147-150`) | ✅ |
| `Enter` | 편집기가 `stopPropagation` | ✅ |
| 방향키 (CROP) | 크롭 편집기가 `stopPropagation` (`:125-126`) | ✅ |
| 방향키 (ANNOTATE) | **아무도 안 막는다** → `CanvasView` 로 새어 `KEY_DOWN` 디스패치 | ⚠️ 경미 3 (canvas-core 에 `Arrow*` 처리가 없어 무해) |
| `keyup` | 다이얼로그가 편집 모드와 무관하게 항상 막는다 (`:186-191`) | ✅ (B1 재발 없음) |

**편집기 단축키가 씹히는가 (반대 방향)**

- `Ctrl+Z`: 다이얼로그가 `preventDefault`+`stopPropagation` 하지만 **같은 window·같은 capture 단계**라
  편집기 리스너가 이어서 돈다 → `doUndo()` 실행 ✅
- `Escape`: 다이얼로그는 `editing` 분기에서 **즉시 return** 하므로 다이얼로그가 안 닫힌다.
  편집기만 `onCancel()` → `setMode('VIEW')` ✅ (편집 중 Esc 한 번에 창까지 닫히는 사고 없음)
- 리스너 **등록 순서에 의존하지 않는다**: `PhotoSection` 이 `onPrev/onNext` 를 인라인 화살표로 넘겨
  다이얼로그 effect 가 매 렌더 재등록되지만, 두 경우(편집기 먼저 / 다이얼로그 먼저) 모두 검증했다.
  편집기가 먼저 도는 경우 `modeRef.current` 는 아직 편집 모드이므로 다이얼로그는 여전히 early-return 한다. ✅
- 캡션 입력(`isTypingTarget`) 예외는 VIEW 모드에만 적용되고 편집 모드에는 입력 요소가 없다. ✅

### ⑥ R-9 손상결함표 인쇄 뷰 ✅ 통과 (회귀 0)

- `groupHeader`/`legend` 는 **플래그**다. 자동 판정 없음(`PrintDamageTable.tsx:47`).
  `PrintRoute.tsx:253` 에서만 `groupHeader legend` 를 켜고, `PrintDefectList.tsx:13` 은
  `groupHeader={false} legend={false}` 로 명시. ✅ (`DEFECT_LIST_COLUMNS` 의 폭·길이·면적·개소가
  `group:'손상규모'` 를 갖고 있는 것을 확인 — 자동 판정이었다면 결함 리스트에 병합 머리가 생겼다)
- **`PrintDefectList` 회귀 없음**: 이전 구현(`7f6ef29^`)과 `groupHeader=false` 경로의 산출 마크업을
  1:1 대조했다. `pv-page` / `pv-page__head` / `colgroup` 폭 계산 / `thead` 단일행 / `PrintSection` /
  빈 표 문구 / `subtitle="결함 리스트"` 까지 **완전히 동일**하다. ✅
- `pageRule()` 가로 조건: `kind === 'LOCATION_MAP' || kind === 'DAMAGE_TABLE'`
  (`PrintRoute.tsx:59`). `DEFECT_LIST`·`PHOTO_BOOK` 은 그대로 세로. **다른 kind 로 안 샌다.** ✅
  `@page` 는 여전히 런타임 주입 + 언마운트 시 `el.remove()`. ✅
- `headerGroups()` 검산: `DAMAGE_COLUMNS` 에서 `손상규모` 4열(`widthMm`·`lengthMm`·`areaM2`·`countEa`)이
  **연속**이므로 `colSpan=4` 1개 + `rowSpan=2` 9개 = 13열. 2행에는 그룹 하위 4열만. HTML 정합. ✅
- 엑셀·PDF 동일성: 둘 다 `damageTableModel` → `buildDamageTable`, 범례는 둘 다
  `formatCauseLegend`. `run.params.doc.headerLine2` 도 run 에서 온다. ✅
- `.pv-legend` · `.pv-legend__label` CSS 는 `print.css:138-147` 에 **이미 존재**한다
  (커밋이 `print.css` 를 안 건드린 것이 누락이 아님을 확인). ✅
- `router.ts` 기본값 `DEFECT_LIST` 유지, `PRINT_KINDS` 에 추가. 옛 링크 동작 불변. ✅
  `ExportArtifactKind` 와 `PrintKind` 가 이제 같은 4개 집합이라 `Export.tsx:476` 의
  `kind as PrintKind` 캐스팅이 **비로소 안전해졌다**. ✅

---

## 2. 경계면 교차 비교

| 경계 | 생산자 | 소비자 | 판정 |
|---|---|---|---|
| 옵션 → 사진첩 | `OptionsPanel` 체크박스 → `params.doc` | `exportModel.ts:143-144` `includeNonPrimary`/`hidePhotoNumber` | ✅ 둘 다 `=== true` 로 전달. 누락 없음 |
| 옵션 → 스냅샷 | `Export.tsx:181,207` `record.params = useParams` | `PrintRoute.tsx:142` `photoBookModel(source, plan, run.params)` | ✅ **재현성 유지** |
| `[같은 번호로 다시 받기]` | `Export.tsx:181` `opts.existing ? opts.existing.params : params` | 같음 | ✅ 두 옵션도 스냅샷에서 온다 |
| 옛 이력 복원 | `isExportRun` 가드가 `params` 를 검사·가공하지 않음 | `params.doc.hidePhotoNumber === true` | ✅ `undefined` → false. 옛 출력물 무변경 |
| 셀 키 | `photoBook.ts` `key = \`${defectId}:${photoId}\`` | `photoBookImages.byCell[c.key]` · `PrintPhotoBook key={c.key}` | ✅ 3곳 표기 일치. `defectId` 잔재 없음 |
| 셀 → 합성 | `PhotoBookCell{renderBlobKey,edits,annotations}` | `needsCompose(c)` · `composeSignature(c)` · `composePhotoFromUrl(base, c)` | ✅ `Pick<Photo,'edits'\|'annotations'>` 구조 호환 |
| 페이지 ↔ 이미지 | `PrintRoute` 가 `bookPages` 를 **한 번만** 만들어 이미지·렌더에 같이 넘김 | — | ✅ 두 번 계산해 갈리는 경로 없음 |
| 코어 무변경 | `git show --stat 62cbaff` = `params.ts` · `photoBook.ts` · `photoBook.test.ts` **3개뿐** | — | ✅ `numbering.ts`(`assignNumbers`)·`ExportRun` 스키마 **미변경** |
| DB | `git diff ad820c6^..HEAD -- apps/web/src/data/idb` = 변경 0 | `DB_VERSION = 1` | ✅ 마이그레이션 0건 |
| 편집기 ↔ 저장 | 편집기가 `[적용]` 직전 렌더 프레임으로 되돌려 넘김 | `usePhotos.editOne` → `setPhotoCrop`/`setPhotoAnnotations` (변환 없음) | ✅ 이중 변환 없음 |
| CSS ↔ 좌표 | `.photoEdit__box{position:relative;display:inline-block;line-height:0}` + `img{display:block}` | `normPoint(boxEl,…)` | ✅ 박스 = 이미지 표시 박스. 그리드 아이템 blockify 후에도 `justify-items:center` 라 fit-content 유지 → 레터박스 0 |
| 레이아웃 높이 | `.photoView{height:min(820px,…)}` → `.photoEdit{flex:1}` → `.photoEdit__stage{flex:1;min-height:0}` → `.photoEdit__fit{absolute;inset:12px}` | `useBoxSize(fitEl)` | ✅ 확정 픽셀 크기 사슬이 끊기지 않음 |
| 프레임 폭 | `print.css .pv-photos{2×1fr, gap 6mm}` (A4 세로 본문 186mm → 90mm) | `PrintPhotoBook FRAME_W_MM=90 / H=68` | ✅ 일치 |

**검증 실행:** `npm run typecheck` 통과(3패키지) · `npm run test` project-core **270 통과**
(`photoBook.test.ts` 18건 — 대표 중간 배치·부번 순서·정수번호 불변·키 중복·`hidePhotoNumber` 포함).

---

## 3. builder 자체결정 5건 — 판정

### ① 회전 표시 프레임을 CSS `transform` 이 아니라 `composePhoto` 래스터로 → **승인**

- 근거가 정확하다. `transform: rotate()` 는 레이아웃 박스를 바꾸지 않으므로 90/270 에서
  `.photoEdit__box` 가 여전히 W×H 로 남아 **"래퍼 = 표시 박스" 규약이 실제로 깨진다.**
  대안(수동 레터박스 산술)은 이 배치에서 가장 틀리기 쉬운 계산을 테스트 밖에 다시 만드는 것이다.
- **§2-2 위반 아님** — 굽는 함수가 출력과 같은 `composePhoto` 경로다. 위 ①에서 회전 방향이
  `toDisplayPoint` 와 수식으로 일치함을 확인했다.
- 실패 시 폴백으로 **안 돌린 이미지를 보여주지 않고** `failed` 로 편집을 막는 선택도 옳다
  (`photoStage.tsx:108-110`) — 조용히 90° 틀어진 좌표를 저장하는 것이 최악이다.
- 비용: 회전된 사진에서 편집기를 열 때 캔버스 1회 + JPEG 인코드 1회. 화면 표시용이고
  **저장 좌표에 영향이 없다**(재압축은 정규화 좌표를 바꾸지 않는다). `rotate===0` 은 안 굽는다.
- 되돌리는 비용: 높음(레터박스 산술 신규 작성). **되돌리지 마라.**

### ② 이미지 표시 상한을 px 로 강제 → **승인 (조건: 주석 정정)**

- 진단이 맞다. `.photoEdit__box` 는 높이가 `auto` 인 shrink-to-fit 박스라 자식 `img` 의
  `max-height:100%` 가 해소되지 않는다(퍼센트 높이 순환). 세로 사진이 스테이지를 넘친다.
- `.photoEdit__fit` 은 `position:absolute; inset:12px` 라 **확정 픽셀 크기**이고
  `ResizeObserver` 로 따라간다. React 는 `maxWidth/maxHeight` 숫자에 `px` 를 붙인다. 정상.
- **조건**: `styles.css:3482-3484` 주석이 아직 *"이미지가 `max-width/height:100%` 이므로"* 라고
  적혀 있다. 구현과 반대다 — 다음에 읽는 사람이 px 상한을 지우게 만든다. **주석을 고쳐라.**

### ③ 전체 crop 사각형에서 안쪽 드래그도 "새로 그리기" → **조건부 승인 (보통 1 수정 필요)**

- 전제는 옳다. 전체 사각형에는 "바깥"이 없으므로 그대로 두면 **자른 적 없는 사진에서
  새 사각형을 그릴 방법이 아예 사라진다.** 이 결정 자체는 유지한다.
- **문제는 커밋 시점이다.** `onPointerDown` 이 즉시 `setRect(rectFromDrag(p,p))` 를 부르고
  `rectFromDrag` 가 `Math.max(CROP_MIN_SIZE, 0)` 으로 폭·높이를 0.05 로 올린다
  (`PhotoCropEditor.tsx:158`, `:317-318`) → **끌지 않은 단순 클릭 한 번에 전체 사각형이
  5%×5% 로 붕괴한다.** 크롭 편집기에는 Undo 가 없고 `[자르기 해제]` 는
  `photo.edits.crop === null` 일 때 비활성이라 **화면에서 되돌릴 버튼이 없다.**
- → **보통 1** 로 수정 요청.

### ④ `pointercancel` 은 획을 확정하지 않는다 → **승인**

- §2-4 "up = 확정" 과 정확히 맞다. `pointercancel` 은 브라우저가 제스처를 회수한 것이라
  그 시점 좌표를 사용자 의도로 볼 수 없다. `.photoEdit__overlay{touch-action:none}` 이라
  발생 빈도도 낮다.
- 비대칭 1건 확인: 크롭 편집기의 `endDrag` 는 `pointercancel` 을 `pointerup` 과 **같게** 처리해
  진행 중 사각형을 유지한다. 그러나 크롭 사각형은 `[적용]` 전까지 레코드에 안 들어가고
  화면에 계속 보이므로 "조용한 손실"이 아니다. **일관성 문제 없음. 그대로 둔다.**

### ⑤ 편집 중 스크림 클릭으로 안 닫힘 → **조건부 승인 (보통 2 수정 필요)**

- 판단은 옳다(그린 것이 조용히 사라지면 안 된다).
- 그런데 **헤더 `[닫기]` 는 편집 중에도 그대로 눌리고, 경고가 `title` 툴팁 하나뿐**이다
  (`PhotoPreviewDialog.tsx:227-236`). 툴팁은 태블릿에서 뜨지 않는다 — 이 제품의 주 사용 환경이다.
  즉 **스크림만 막고 더 크고 눈에 띄는 손실 경로를 열어 뒀다.** → **보통 2**.

### (보너스) ⑥ 주석 id — 새 것만 생성, 기존 유지 → **승인**. 삭제 식별·React key 용도로만 쓰이고
`toSourceAll` 이 `...a` 로 id 를 보존한다. 부작용 없음.

---

## 4. 지적 사항

### [보통 1] 크롭 편집기 — 클릭 한 번에 자르기 사각형이 5%로 붕괴한다

- 파일: `apps/web/src/ui/photos/PhotoCropEditor.tsx:155-159` · `:314-325`
- 문제: `onPointerDown` 이 드래그가 시작되기도 전에 `setRect(rectFromDrag(p, p))` 를 커밋한다.
  `rectFromDrag` 는 `w = Math.max(CROP_MIN_SIZE, |Δx|)` 이므로 Δ=0 이어도 0.05×0.05 사각형이 된다.
- 재현:
  1. 자른 적 없는 사진에서 `[자르기]` 를 연다(사각형 = 전체).
  2. 사진 위 아무 곳이나 **한 번 클릭**(드래그 없음).
  3. 전체를 덮던 사각형이 즉시 사방 5% 짜리 작은 네모로 바뀐다.
  4. `[자르기 해제]` 는 `photo.edits.crop === null` 이라 **비활성**, 편집기에 Undo 없음
     → 되돌릴 버튼이 화면에 하나도 없다(`Esc` 로 나갔다 다시 여는 수밖에 없다).
  · 이미 자른 사진에서 사각형 **바깥**을 클릭해도 같다(직전 사각형이 5%로 대체).
- 수정: `NEW` 드래그를 **포인터가 실제로 움직였을 때** 확정한다.
  `Drag` 를 `{ mode:'NEW'; anchor: Pt; prev: Rect; moved: boolean }` 로 넓히고
  ① `onPointerDown` 에서 `setRect` 를 호출하지 않는다(상태만 만든다)
  ② `onPointerMove` 의 `NEW` 분기에서 `setRect(rectFromDrag(anchor, p))` + `moved = true`
  ③ `endDrag` 에서 `mode === 'NEW' && !moved` 면 `setRect(drag.prev)` 로 되돌린다.

### [보통 2] 편집 중 헤더 `[닫기]` 가 확인 없이 작업을 버린다 — 툴팁은 태블릿에서 안 뜬다

- 파일: `apps/web/src/ui/photos/PhotoPreviewDialog.tsx:227-236`
- 문제: 스크림 클릭은 막았는데(`:214`) 같은 손실을 일으키는 `[닫기]` 는 열려 있다.
  경고 수단이 `title` 속성뿐이라 터치 환경(현장 태블릿)에서는 **아무 경고도 표시되지 않는다.**
- 재현: 주석 20획을 그린 뒤 헤더 `[닫기]` 탭 → 다이얼로그가 닫히고 획이 전부 사라진다.
  (편집기 `[취소]` 와 시각적으로 구분되지 않는 위치다)
- 수정(둘 중 하나):
  · A. `mode !== 'VIEW'` 이면 `[닫기]` 를 `disabled` 로 두고 라벨 옆에 "편집 중 — [취소] 또는 [적용]" 안내.
  · B. 편집기가 "변경 있음" 플래그를 위로 올려주고(`onDirtyChange`), dirty 일 때만
    `window.confirm('편집 중인 내용이 저장되지 않습니다. 닫을까요?')`.
  A 가 코드가 적고 되돌리기 쉽다. **A 권장.**

### [보통 3] 주석 편집기에 자르기 경계 표시가 없다 — 버려질 획을 그리게 된다

- 파일: `apps/web/src/ui/photos/PhotoAnnotateEditor.tsx` (`EditStage` 오버레이)
- 문제: 편집기가 **자르기 전 전체 프레임** 위에서 조작하는 것은 §2-1 의도대로 옳다.
  그러나 이미 `crop` 이 설정된 사진에서 잘려 나갈 영역 표시가 전혀 없어,
  사용자는 **출력에 안 나올 자리에 화살표를 그리고 그 사실을 인쇄 전까지 모른다.**
  (§6 체크리스트의 "잘려 나간 쪽 획이 사라지는가" 는 **의도된 동작**이지만, 그리는 동안
  경계가 보여야 의도가 성립한다)
- 재현: 사진을 가운데 40%만 남기고 자른 뒤 `[주석]` → 가장자리에 화살표 → `[적용]`
  → 미리보기·사진첩에서 화살표가 사라져 있다. 사용자에게는 "주석이 안 먹었다" 로 보인다.
- 수정: `photo.edits.crop !== null` 이면 `toDisplayRect(crop, rotate)` 로 표시 사각형을 만들어
  `.cropRect` 와 같은 `box-shadow: 0 0 0 9999px rgba(0,0,0,.45)` 를 `pointer-events:none` 으로 깐다.
  기존 CSS 재사용이라 신규 스타일 0개. (좌표 변환 함수도 이미 있다)

### [경미 1] `styles.css:3482-3484` 주석이 구현과 반대다

`.photoEdit__box` 블록 머리 주석이 *"이미지가 `max-width/height:100%` 이므로"* 라고 적혀 있으나
실제로는 `photoStage.tsx:167-169` 가 **px 상한을 인라인으로** 넣는다(그 방식을 쓴 이유가
바로 퍼센트가 해소되지 않기 때문이다). 다음 사람이 px 상한을 "중복"으로 보고 지울 위험.
→ 주석을 `photoStage.tsx:12-14` 와 같은 내용으로 고친다.

### [경미 2] `frame.ready === false` 상태에서 `Enter` 가 `apply()` 를 실행한다

`PhotoCropEditor.tsx:107-111` · `PhotoAnnotateEditor.tsx:152-156`.
`[적용]` 버튼은 `disabled={disabled || !frame.ready}` 로 막았는데 키보드 경로만 열려 있다.
실제 손상은 없다(값이 초기값과 같아 `setPhotoCrop`/`setPhotoAnnotations` 가 no-op 이거나
동일 값 재기록). 다만 주석이 1개 이상이면 **내용이 같은 불필요한 IDB 쓰기**가 나간다.
→ `apply()` 첫 줄에 `if (!frame.ready) return;` 추가(각 1줄).

### [경미 3] 주석 편집 중 방향키가 캔버스로 샌다

다이얼로그는 편집 모드에서 `isCanvasShortcut` 만 막고(`PhotoPreviewDialog.tsx:149-155`),
주석 편집기는 방향키를 다루지 않는다 → `CanvasView` 의 bubble 리스너가
`send({k:'KEY_DOWN', key:'ArrowLeft'})` 를 디스패치한다.
`canvas-core` 에 `Arrow*` 처리가 없어 **현재는 무해**하지만(리듀서에서 검색해 확인),
나중에 "방향키로 결함 미세 이동" 이 생기면 그날 조용히 버그가 된다.
→ 주석 편집기 키 핸들러에 방향키를 `stopPropagation` 만 하는 분기를 넣거나,
다이얼로그의 편집 분기에서 `ArrowLeft/Right/Up/Down` 도 함께 막는다.

### [경미 4] `doUndo` 가 `setUndo` 업데이터 **안에서** `setAnns`·`setDraft` 를 부른다

`PhotoAnnotateEditor.tsx:119-127`. 업데이터는 순수해야 하고 StrictMode 는 두 번 부른다.
여기서는 두 호출이 멱등이라 실동작은 맞지만, React 규약 위반이라 향후 변경 시 함정이 된다.
→ `annsRef` 처럼 `undoRef` 를 두고 `doUndo` 를 업데이터 밖에서 계산하도록 바꾼다.

### [경미 5] `renderPhotoBookImages` 가 예외를 던지면 이미 만든 objectURL 이 샌다

`photoBookImages.ts:45-95`. 내부에서 예외를 던질 수 있는 것은 사실상
`input.objectUrl`(= `repo.objectUrl`) 뿐이고 그 호출은 `createObjectURL` 루프 **앞**에 몰려 있어
현재 실현 확률은 매우 낮다. 다만 구조적으로는 부분 결과가 버려지는 경로다.
→ `for (const c of cells)` 루프를 `try { … } catch { }` 로 감싸고 **항상**
`{ byCell, created }` 를 반환하면 완전히 닫힌다(약 3줄).

### [경미 6·기록만] `hidePhotoNumber` 를 켜면 `위치 부재명` 행이 굵게 나온다

`PrintPhotoBook.tsx:65` 가 `i === 0` 을 굵게 그린다. `photoCaptionLines` 가 1행을
**배열에서 제거**하므로(스펙 F-4 가 지시한 방식) 2행이 인덱스 0 이 되어 굵어진다.
칸 높이는 흔들리지 않으니 F-4 의 목적은 달성됐다. 서식 취향 문제이므로 **사용자 확인 대상**으로만 남긴다.

---

## 5. 불변식 검수표

| # | 불변식 | 결과 | 근거 |
|---|---|---|---|
| 1 | 마커·사진 좌표는 정규화 저장(픽셀 금지) | ✅ | `crop`·`annotations` 저장 경로가 전부 `toSourceRect`/`toSourcePoint` + `ROUND4` 를 통과(`PhotoCropEditor.tsx:88`, `PhotoAnnotateEditor.tsx:397-415`). 픽셀은 `strokePx`·`normPoint`·`hitHandle`·`nearestAnnotation` 등 **화면 판정용으로만** 쓰이고 저장되지 않는다. `PhotoAnnotation.width` 도 장변 대비 비율로 저장 |
| 2 | DB 스키마에 `defectNo`/`photoNo` 컬럼 없음 | ✅ | `git diff ad820c6^..HEAD -- apps/web/src/data/idb` = 변경 0. `photoNo`·`subNo` 는 `PhotoBookCell`(출력 모델) 파생값이고 저장되지 않는다. `assignNumbers`(`numbering.ts`) 미변경 — `62cbaff` 는 `params.ts`·`photoBook.ts`·테스트 3개뿐 |
| 3 | 로컬 우선 쓰기(서버 `await` 후 로컬 쓰기 금지) | ✅ | `usePhotos.editOne` 이 `persist([next])`(fire-and-forget IDB) 직후 `setPhotos` 를 동기 호출(`usePhotos.ts:288-305`, `persist` `:177-182`). UI 가 즉시 반영된다 |
| 4 | 면적 계산 나눗셈 순서·절사·개소 미곱 | ✅ 무관 | `items/size.ts` 미변경. 이번 배치는 사진·인쇄 뷰만 건드렸다 |
| 5 | 층 정렬은 `sortOrder` 정수 비교 | ✅ 무관 | `floorOrder.ts` 미변경(테스트 20건 통과) |
| 6 | 원인·보수방안에 `defectTypeId` FK 직접 박기 금지 | ✅ 무관 | 미변경 |
| 7 | 과업 생성이 설정을 복사(참조 아님) | ✅ 무관 | 미변경 |
| 8 | `isPrimary` 가 항상 정확히 1개 | ✅ | 쓰기 경로 미변경. 읽기는 `buildPhotoBook` 이 `normalizePhotos()` → `primaryOf()` 단일 경로를 쓰고(`photoBook.ts:88-90`), `photoBookImages.ts` 도 **셀이 고른 `renderBlobKey` 만** 로드해 각자 `find(isPrimary)` 하지 않는다. 부번은 `p.id === primary.id` 로 대표를 제외하므로 대표가 중복 계상되지 않는다 |

**추가 — PhotoPolish §7 절대규칙 10개**

| # | 규칙 | 결과 | 근거 |
|---|---|---|---|
| 1 | 좌표 렌더 프레임 0~1 정규화 | ✅ | 위 불변식 1 |
| 2 | 합성 순서 `주석→자르기→회전`, 화면·출력 동일 함수 | ✅ | `composeFromDecoded` 단일 지점. 소비자 3곳 전부 `composePhotoFromUrl` |
| 3 | `assignNumbers()` 무변경 | ✅ | `62cbaff` diff --stat 로 확인 |
| 4 | `ExportRun` 스키마·`DB_VERSION` 무변경 | ✅ | `DB_VERSION = 1`, idb 변경 0 |
| 5 | `ui/defectForm/*` 경계 | ✅ | 편집기 3개 전부 `ui/photos/` |
| 6 | 편집기가 `canvas-core` 를 import 안 함 | ✅ | `photoStage`·`PhotoCropEditor`·`PhotoAnnotateEditor` import 목록 확인 — `@onspect/project-core` 와 로컬만 |
| 7 | 주석 Undo 가 캔버스 스택에 안 들어감 | ✅ | 로컬 `useState` 스택 + 위 ⑤ 키보드 추적으로 `Ctrl+Z` 가 `CanvasView` 에 **도달하지 않음**을 DOM 전파 규칙으로 확인 |
| 8 | `project-core` 에 Blob/File/URL 없음 | ✅ | `62cbaff` 는 순수 타입·배열 로직만 |
| 9 | PDF 라이브러리 없음 | ✅ | `window.print()` + `@page` |
| 10 | 새 npm 의존성 0 | ✅ | `package.json` 미변경 |

---

## 6. 확인하지 못한 것 (코드로 판단 불가 — 사용자 실행 검증 필요)

1. **실제 픽셀에서의 좌표 일치.** 회전 방향은 캔버스 변환 수식으로 검산했지만,
   브라우저의 `drawImage` 반올림·`decodeUrl` 의 `naturalWidth` 가 `photo.width` 와 다른 경우
   (렌더본이 2048 로 축소된 뒤 저장된 값과 어긋난 이력이 있는 사진)는 실행해야 안다.
   → **세로(EXIF 90°) 사진에서 자르기 사각형이 손가락을 따라오는지** 반드시 확인.
2. **인쇄 결과물.** A4 가로 손상결함표의 13열이 실제로 한 페이지 폭에 들어가는지,
   `손상규모` 병합 머리가 4칸을 덮는지, `thead` 2행이 페이지마다 반복되는지.
3. **objectURL 실측 누수.** 해제 짝은 코드로 전부 확인했으나
   Chrome `chrome://blob-internals` 수준의 실측은 못 한다. 사진첩 인쇄 뷰를 5회 열고 닫아
   메모리가 계단식으로 오르지 않는지 봐 달라.
4. **드래그 감각** — 핸들 히트 10px, 자유획 간격 0.004, 지우개 12px 이 태블릿에서 적절한지.
5. **`apps/web` 테스트 러너 부재**(builder 알려진 한계 1). `resizeRect`·`rectFromDrag`·
   `nearestAnnotation`·`headerGroups`·`frameStyle` 은 순수 함수로 export 돼 있는데 테스트가 없다.
   이번 검수는 **읽기로만** 검증했다. 다섯 함수를 `project-core` 로 올릴지는 별도 판단 사항
   (스펙 §3 산출물 목록이 `ui/photos/*` 로 한정돼 있어 builder 가 올리지 않은 것은 스펙 준수다).
6. **`PhotoSection` 썸네일 배지**(`hasPhotoEdits(p)` → `✎`) 는 코드상 정상이나 표시 확인 필요.

## 7. builder 에게 넘길 수정 지시 (우선순위 순)

1. `PhotoCropEditor.tsx:155-159, 185-191` — `NEW` 드래그를 첫 `pointermove` 에서 확정하고,
   움직이지 않고 끝나면 이전 rect 로 복원 (**보통 1**)
2. `PhotoPreviewDialog.tsx:227-236` — `mode !== 'VIEW'` 일 때 `[닫기]` `disabled` + 안내 문구 (**보통 2**)
3. `PhotoAnnotateEditor.tsx` `EditStage` 오버레이 — `crop` 이 있으면 `toDisplayRect` 로 잘릴 영역
   어둡게(`pointer-events:none`) (**보통 3**)
4. `styles.css:3482-3484` 주석 정정 (**경미 1**)
5. `PhotoCropEditor.apply` / `PhotoAnnotateEditor.apply` 첫 줄 `if (!frame.ready) return;` (**경미 2**)
6. 주석 편집 중 방향키 `stopPropagation` (**경미 3**)
7. `doUndo` 를 `setUndo` 업데이터 밖으로 (**경미 4**)
8. `renderPhotoBookImages` 루프 `try/catch` → 부분 결과 반환 (**경미 5**)

**1~3 만 고치면 무조건 통과다.** 4~8 은 여유 있을 때.
