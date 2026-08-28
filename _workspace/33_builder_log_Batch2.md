# 구현 로그 — 배치2 (R-5 자르기 UI · R-6 주석 UI · R-8 사진첩 반영 · F-4 사진번호 숨김)

기준 스펙: `29_plan-reviewer_spec_PhotoPolish.md` §2-1 · §2-2 · §2-3 · §2-4 · §2-8 · §7
· `30_plan-reviewer_spec_UserFeedback0828.md` 2-4절(F-4)

직전 builder 세션이 R-8 코어를 **미커밋 상태**로 남기고 끊겼다. 그 diff 를 스펙과 대조해
확인한 뒤 그대로 커밋하고(커밋 1), 나머지를 한 덩어리로 이어 만들었다(커밋 2).

---

## 완료

### 커밋 1 — `62cbaff` 사진: R-8 핵심 로직 (project-core)

| 작업 | 파일 | 상태 |
|---|---|---|
| `PhotoBookCell` 에 `key`·`subNo`·`annotations` 추가 | `packages/project-core/src/export/photoBook.ts` | ✅ 인수인계분 검증 후 그대로 커밋 |
| `buildPhotoBook(includeNonPrimary)` — 대표 먼저 · 나머지 `sortOrder` 오름차순 · 부번 1부터 | 〃 | ✅ |
| `photoCaptionLines(subNo, hidePhotoNumber)` — `사진 12-1` / 1행 **제거**(빈 줄 금지) | 〃 | ✅ |
| `ExportDocOptions.hidePhotoNumber` (기본 `false`) | `packages/project-core/src/export/params.ts` | ✅ |
| 부번·숨김 테스트 | `packages/project-core/test/photoBook.test.ts` | ✅ |

**검증한 것:** §2-8 의 확정 사항 4가지(`assignNumbers` 무변경 · `ExportRun.mapping` 무변경 ·
손상결함표 사진번호 열 `12` 유지 · 셀 키 `defectId:photoId`)와 F-4 의 "1행을 빈 줄로 두지 않고
2행을 1행으로 올린다"가 코드·테스트에 그대로 들어 있음을 diff 로 대조했다.

### 커밋 2 — `4d44354` R-5 + R-6 + R-8/F-4 배선

중간에 컴파일이 깨지는 상태가 없도록 **한 덩어리로 커밋**했다
(스펙 경고: R-5 만 하고 R-8 을 안 하면 자른 사진이 안 잘린 채 보고서로 나간다).

| 작업 | 파일 | 상태 |
|---|---|---|
| 공용 스테이지(정규화 좌표 · 회전 프레임 · 지우개 거리) | `apps/web/src/ui/photos/photoStage.tsx` **(신규)** | ✅ |
| **R-5** 자르기 UI (8핸들 · 3분할 가이드 · 픽셀 표기) | `apps/web/src/ui/photos/PhotoCropEditor.tsx` **(신규)** | ✅ |
| **R-6** 주석 UI (자유획·화살표·지우개 · 2색 · 3굵기 · 로컬 Undo) | `apps/web/src/ui/photos/PhotoAnnotateEditor.tsx` **(신규)** | ✅ |
| 미리보기 본문 → 편집 모드 전환 · 키보드 양보 | `apps/web/src/ui/photos/PhotoPreviewDialog.tsx` | ✅ |
| 편집 콜백 통과 | `apps/web/src/ui/photos/PhotoSection.tsx` · `apps/web/src/routes/CanvasRoute.tsx` | ✅ |
| 편집기 스타일 | `apps/web/src/styles.css` | ✅ |
| **R-8** 사진첩 셀 합성 어댑터 | `apps/web/src/export/photoBookImages.ts` **(신규)** | ✅ |
| `photoBookModel(src, plan, params)` — 두 옵션 전달 | `apps/web/src/export/exportModel.ts` | ✅ |
| 인쇄 뷰에서 합성 렌더러 실제 호출 · objectURL 해제 | `apps/web/src/export/printView/PrintRoute.tsx` | ✅ |
| `key={c.defectId}` → `key={c.key}` · `baked` 면 CSS 회전 안 검 | `apps/web/src/export/printView/PrintPhotoBook.tsx` | ✅ |
| **F-4** 사진번호 숨김 + 대표 외 사진 체크박스 활성화 | `apps/web/src/routes/export/OptionsPanel.tsx` | ✅ |

---

## 설계 판단 (스펙에 없어서 정한 것 — 전부 내부 구현 사항)

1. **회전 표시 프레임을 CSS 가 아니라 래스터로 만든다.**
   `transform: rotate()` 는 래퍼 박스 크기를 바꾸지 않아서 90/270 에서 "래퍼 = 이미지 표시 박스"
   규약이 깨진다. 그래서 편집기를 열 때 **회전만 구운** 이미지를 한 장 만들어 쓴다
   (`useRotatedFrame`, `composePhoto` 재사용 — 출력과 같은 함수 경로). `rotate === 0` 이면 안 굽는다.
2. **이미지 상한을 px 로 준다.** `img { max-height: 100% }` 는 부모(래퍼) 높이가 `auto` 라
   퍼센트가 해소되지 않는다 → 세로 사진이 스테이지를 넘친다. 절대배치 `.photoEdit__fit` 을 재서
   `maxWidth/maxHeight` 를 픽셀로 넣는다.
3. **사각형이 전체일 때는 안쪽 드래그도 "새로 그리기"** 다. 전체 사각형에는 "바깥"이 없어서
   그대로 두면 **처음 열었을 때 새 사각형을 그릴 방법이 사라진다**(자른 적 없는 사진 = 전체 사각형).
   전체일 때는 옮길 것도 없으므로 손실이 없다.
4. **`pointercancel` 은 획을 확정하지 않는다.** 확정은 `pointerup` 하나뿐이다(§2-4 "up = 확정").
   `pointercancel` 은 브라우저가 제스처를 가져간 것이라 확정 신호로 볼 수 없다.
5. **편집 중에는 스크림 클릭으로 닫지 않는다.** 그린 것이 조용히 사라지면 안 된다.
   (헤더 `[닫기]` 는 그대로 두고 "저장되지 않습니다" 툴팁을 달았다.)
6. **주석 id** 는 새로 그린 것만 `a-{base36시각}-{n}` 으로 만들고 **기존 주석은 id 를 유지**한다.

## 절대 규칙 준수 확인 (§7)

| # | 규칙 | 확인 |
|---|---|---|
| 1 | crop·annotations 는 렌더 프레임 0~1 정규화 | `[적용]` 직전 `toSourceRect`/`toSourcePoint` + `ROUND4`. 픽셀 저장 0건 |
| 2 | 합성 순서 `주석 → 자르기 → 회전`, 화면·출력 같은 함수 | 화면·인쇄 뷰 둘 다 `composePhotoFromUrl` 만 부른다. 순서는 `photoCompose.ts` 한 곳 |
| 3 | `assignNumbers()` 무변경 | `numbering.ts` 미수정. 부번은 `buildPhotoBook` 파생값 |
| 4 | `ExportRun` 스키마·`DB_VERSION` 무변경 | 마이그레이션 0건 |
| 5 | `ui/defectForm/*` 경계 | 편집기는 전부 `ui/photos/` |
| 6 | 편집기가 `canvas-core` 를 import 안 함 | `photoStage.tsx`·`PhotoCropEditor.tsx`·`PhotoAnnotateEditor.tsx` 에 canvas-core import 없음. 포인터는 로컬 구현 |
| 7 | 주석 Undo 가 캔버스 스택에 안 들어감 | `useState<PhotoAnnotation[][]>` 로컬 스택(최대 50). `Ctrl+Z` 는 편집기 자체 window 리스너 |
| 8 | `project-core` 에 Blob/File/URL 없음 | 신규 코어 코드 없음 |
| 9 | PDF 라이브러리 없음 | 추가 0 |
| 10 | 새 npm 의존성 0개 | `package.json` 무변경 |

---

## 검증한 것

- **타입 검사** — `npm run typecheck` (canvas-core · project-core · web) 전부 통과
- **단위 테스트** — `npm run test`: canvas-core 277 / project-core 270, **총 547개 통과**
  (사진첩 부번·`hidePhotoNumber` 테스트 포함. 좌표 변환 왕복 항등은 R-2 에서 이미 고정돼 있다)
- **프로덕션 빌드** — `npm run build` 통과 (Vite, 237 모듈)
- **코드 점검** — §7 절대규칙 10개를 위 표로 대조. `key={c.defectId}` 중복 키 경로 제거 확인,
  objectURL 생성/해제 짝(`renderPhotoBookImages`/`releasePhotoBookImages`) 확인

**미검증(코드로 확인 불가):** 실제 드래그 감각, 회전된 사진에서의 좌표 일치, 인쇄 결과물.

---

## 직접 확인해주실 것

### 자르기 (R-5)
- [ ] 결함 사진을 클릭 → `[자르기]` → **새 창이 뜨지 않고 같은 창 본문이 바뀌는가**
- [ ] 처음 열면 사각형이 사진 전체를 덮고, **아무 데나 드래그하면 새 사각형이 그려지는가**
- [ ] 모서리·변 8개 핸들로 크기가 바뀌는가 / 사각형 안쪽을 끌면 크기를 유지한 채 움직이는가
- [ ] 바깥이 어둡게 깔리고 **3분할 가이드선**이 보이는가 · 우상단에 `1536×864` 같은 픽셀 수가 뜨는가
- [ ] `Enter` 적용 / `Esc` 취소 / 방향키(+Shift) 로 1%·5% 이동이 되는가
- [ ] **세로 사진(EXIF 90° 회전)에서 사각형이 손가락을 따라오는가** — 90° 어긋나면 좌표 버그
- [ ] `⟳ 오른쪽 90°` 를 누른 **뒤에** 자르기를 열어도 사각형이 화면과 맞는가
- [ ] 자른 뒤 다시 자르기를 열면 **직전 사각형이 그대로** 떠 있는가 (전체 사진이 보이는 상태에서)
- [ ] `[자르기 해제]` 를 누르면 원래대로 돌아가는가

### 주석 (R-6)
- [ ] `[주석]` → 화살표·자유획이 그려지는가 · 색 2종(빨강/노랑) · 굵기 3단이 눈에 띄게 다른가
- [ ] 지우개로 클릭하면 **획 하나가 통째로** 지워지는가 (일부만 지워지면 안 된다)
- [ ] **`Ctrl+Z` 를 눌렀을 때 주석만 되돌아가고 뒤쪽 도면 결함은 그대로인가** ⭐ 가장 중요
- [ ] 주석 편집 중 `Delete` 를 눌러도 캔버스 결함이 안 지워지는가
- [ ] `[취소]` 로 나가면 그린 것이 전부 사라지는가 / 새로고침해도 안 남는가
- [ ] 화살표를 그린 뒤 사진을 자르면 **잘려 나간 쪽 획이 사라지는가**
- [ ] 자르기·주석이 있는 사진 타일에 `✎` 배지가 뜨는가 (썸네일 자체는 합성 안 됨 — 정상)

### 출력 (R-8 · F-4)
- [ ] 출력 화면에서 `대표 외 사진 포함` 이 **더는 "준비 중" 이 아니고 눌리는가**
- [ ] 켜고 뽑으면 사진첩에 `사진 12` · `12-1` · `12-2` 가 연달아 나오는가
- [ ] 그때 **손상결함표 사진번호 열은 `12` 하나만** 그대로인가
- [ ] 그때 **결함번호가 하나도 안 밀리는가**
- [ ] `사진첩 사진번호 숨기기` 를 켜면 캡션 1행이 사라지고 **위치·부재명이 1행으로 올라오는가**
      (칸 높이가 흔들리면 안 된다)
- [ ] **자르기·주석이 사진첩 PDF 에 화면과 같은 모양으로 인쇄되는가** ⭐
- [ ] 회전만 한 사진(자르기·주석 없음)이 **두 번 돌아가 있지 않은가**
- [ ] 사진첩 인쇄 뷰를 여러 번 열고 닫아도 브라우저가 무거워지지 않는가 (objectURL 누수 점검)

---

## 알려진 한계

1. **`apps/web` 에는 테스트 러너가 없다.** `resizeRect`·`rectFromDrag`·`nearestAnnotation` 은
   순수 함수로 분리·export 했지만 단위테스트가 없다. 스펙의 R-5/R-6 산출물 목록이
   `ui/photos/*` 뿐이라 project-core 로 올리지 않았다 — 올리면 테스트가 붙는다(별도 판단 필요).
2. **잘릴 픽셀 수는 렌더 프레임 기준**이다(스펙 §2-3 명시). 90/270 회전 사진에서는
   최종 출력 이미지의 가로·세로와 **두 수의 순서가 반대**로 보인다.
3. **썸네일 그리드는 합성하지 않는다**(R1). 자르기·주석은 `✎` 배지로만 알리고,
   실제 모습은 미리보기 창에서 본다.
4. **부번(`12-1`)은 `ExportRun` 스냅샷에 없다.** 출력 뒤 사진 순서를 바꾸면 재출력 시
   부번 순서가 달라질 수 있다 (§2-8 이 이미 수용한 성질. 정수 번호는 안 흔들린다).
5. `.xp-check--off` · `.xp-soon` CSS 클래스는 이제 쓰는 곳이 없다. **삭제하지 않았다** —
   이번 범위 밖이고 다른 "준비 중" 항목이 생길 때 다시 쓴다.

## 눈에 띈 다른 문제 (고치지 않음 — 판단은 사용자 몫)

- `usePhotos.ts:126` `defectsWithPhoto` 가 `list.length > 0` 로 판정한다(대표 유무가 아니라).
  정규화 목록에서는 결과가 같지만 이름과 구현이 어긋난다. 스펙 §4 가 이미 "고치지 말고 기록만"
  으로 분류한 항목이다.
- `index-*.js` 번들이 505 kB 로 Vite 경고선(500 kB)을 넘었다. 이번 변경으로 넘은 것이 아니라
  누적 결과다. 코드 스플리팅은 별도 과제.

## 막힌 것 / 질문

**없다.** `_workspace/QUESTIONS.md` 에 새로 추가한 항목 없음.

---

# 검수 반영 (2026-08-28)

기준: `_workspace/34_code-reviewer_findings_Batch2.md` · 지시받은 **보통 3건 + 경미 3건만** 좁게 수정.
경미6(방향키 누수)·경미7(`doUndo` StrictMode 규약)·경미9(`hidePhotoNumber` 굵기 서식)는
**지시대로 손대지 않았다.**

## 고친 것

| # | 지적 | 파일 | 수정 내용 |
|---|---|---|---|
| 보통1 | 클릭 한 번에 자르기 사각형이 5%로 붕괴 | `apps/web/src/ui/photos/PhotoCropEditor.tsx` | `Drag` 의 `NEW` 를 `{anchor, prev, moved}` 로 확장. `pointerdown` 에서 `setRect` 제거(확정 안 함) → 첫 `pointermove` 에서 `rectFromDrag(anchor,p)` 확정 + `moved=true` → `endDrag` 에서 `!moved` 면 `setRect(drag.prev)` 로 복원 |
| 보통2 | 편집 중 헤더 `[닫기]` 가 경고 없이 작업을 버림 | `apps/web/src/ui/photos/PhotoPreviewDialog.tsx` | `mode !== 'VIEW'` 이면 `[닫기]` `disabled` + 헤더에 "편집 중 — **[취소]** 또는 **[적용]** 을 눌러주세요" 표시. 툴팁 문구도 정정 |
| 보통3 | 주석 편집기에 자르기 경계 표시 없음 | `apps/web/src/ui/photos/PhotoAnnotateEditor.tsx` | `photo.edits.crop` 이 있으면 `toDisplayRect(crop, rotate)` 로 표시 사각형을 만들어 **기존 `.cropRect`** 를 `pointer-events:none` 으로 SVG 위에 겹침. 힌트에 "어두운 영역은 자르기로 잘려 나갑니다" 추가 |
| 경미4 | `styles.css` 주석이 구현과 반대 | `apps/web/src/styles.css:3479-` | `max-width/height:100%` 서술을 삭제하고 "px 상한은 `photoStage.tsx` 가 인라인으로 넣는다 — 중복 아님, 지우지 마라" 로 정정 |
| 경미5 | `Enter` 가 `frame.ready` 가드를 안 거침 | `PhotoCropEditor.tsx` · `PhotoAnnotateEditor.tsx` | 두 `apply()` 첫 줄에 `if (!frame.ready) return;` + `useCallback` 의존성에 `frame.ready` 추가 |
| 경미8 | 예외 시 생성된 objectURL 유실 | `apps/web/src/export/photoBookImages.ts` | 셀 루프를 `try { … } catch {}` 로 감싸 **항상** `{ byCell, created }` 반환(부분 결과 + 해제 대상 보존) |

**신규 CSS 클래스 0개 · 신규 계산 함수 0개 · 신규 의존성 0개.**
보통3 은 `.cropRect`(기존) 와 `toDisplayRect`(project-core 기존, 단위테스트 26건으로 고정됨)만 재사용했다.

## 검증

- `npm run typecheck` — 3패키지 **통과**
- `npm run test` — canvas-core **277 통과** · project-core **270 통과** (합 547, 실패 0)
- `npm run build` — `@onspect/web` vite 프로덕션 빌드 **성공** (237 모듈)
- `apps/web` 은 테스트 러너가 없어(알려진 한계 1) 위 6건은 타입검사·빌드·코드 검토로만 확인했다

## 직접 확인해주실 것

- [ ] 자른 적 없는 사진에서 `[자르기]` → 사진 위를 **한 번 탭(끌지 않음)** → 사각형이 **전체 그대로** 남아 있는가 (붕괴 없음)
- [ ] 이미 자른 사진에서 사각형 바깥을 **탭만** → 직전 사각형이 그대로 유지되는가
- [ ] 바깥에서 **끌면** 새 사각형이 정상적으로 그려지는가 (기존 동작 유지)
- [ ] `[자르기]`/`[주석]` 편집 중 헤더 `[닫기]` 가 **눌리지 않고**, 옆에 "편집 중 — [취소] 또는 [적용]" 안내가 보이는가
- [ ] `[취소]`/`[적용]` 로 VIEW 로 돌아오면 `[닫기]` 가 **다시 활성**되는가
- [ ] 가운데 40%만 남기고 자른 사진에서 `[주석]` 을 열면 **잘릴 바깥이 어둡게** 보이는가 (그 위에 그은 획도 어둠 아래로 보임)
- [ ] 회전(90/270)된 자른 사진에서도 어두운 경계가 **사진의 실제 잘린 영역과 맞는가**
- [ ] 어두운 영역 위에서도 **그리기·지우기가 정상 동작**하는가 (`pointer-events:none` 확인)
