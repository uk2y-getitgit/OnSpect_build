# 범위 — 사진첩 엑셀 다운로드 (2026-09-11)

## 사용자 요청 원문
"출력물 사진첩을 엑셀파일로 다운받을 수 있게 구현했으면 좋겠어. 사용자가 엑셀에서 사진파일을
수정할 수 있도록"

## AskUserQuestion으로 확정한 결정
1. **일회성 출력물** — 엑셀에서 고쳐도 OnSpect 앱 데이터에 재반영되지 않는다. 순수 export.
2. **셀에 실제 썸네일 이미지 삽입** — 파일명/정보만 표로 담고 사진은 별도 ZIP으로 주는 방식이
   아니라, 엑셀 파일 하나만 열면 사진이 바로 보이게 한다.

## 기존 코드 조사 결과 (착수 전 확인)
- 사진첩은 지금 **인쇄 뷰(PDF) 전용**이다 — `produce.ts`의 `FILE_ARTIFACTS`에 `PHOTO_BOOK`이
  빠져 있다("사진첩은 인쇄 뷰 전용이다 (M3)").
- 손상결함표·결함리스트·조사위치도는 이미 "엑셀/PNG 또는 PDF" 둘 다 같은 체크박스 하나로
  제공한다(`Export.tsx` KIND_HINT 패턴) — 사진첩도 같은 패턴으로 맞추는 것이 기존 UI 관례와
  일치한다. **새 아티팩트 종류를 만들지 않고, 기존 `PHOTO_BOOK`을 확장한다.**
- 사진첩 데이터 조립은 이미 순수함수로 다 있다 — `photoBookModel()`(exportModel.ts)이
  `buildPhotoBook()`(project-core, 결함/사진 그룹핑·번호·캡션·동별 페이지분할까지 처리)을
  감싸고, `renderPhotoBookImages()`(photoBookImages.ts)가 자르기·회전·주석까지 반영된
  합성 이미지를 인쇄 뷰와 **똑같은 함수**로 구워 준다. 이 둘을 그대로 재사용한다 — 사진
  합성을 다시 만들지 않는다.
- 엑셀 라이브러리(`write-excel-file@4`, 이미 사용 중)는 셀 이미지 삽입을 네이티브로
  지원한다(`images: [{content, contentType, width, height, dpi, anchor:{row,column}}]`,
  `content`는 브라우저에서 `File|Blob|ArrayBuffer`). **새 의존성 불필요.**

## 설계
- **레이아웃: 사진 1장 = 1행**(인쇄 뷰의 2×3 그리드를 엑셀에 그대로 재현하지 않는다 —
  "엑셀에서 수정한다"는 목적에는 표 형태가 인쇄 그리드보다 훨씬 다루기 쉽다. 정렬·필터·행
  추가/삭제가 자연스럽다).
- 열: 결함번호 | 동(2개 이상일 때만) | 위치 | 부재 | 결함유형 | 사진(이미지 삽입) | 캡션
- `includeNonPrimary` 옵션을 켰으면 대표 외 사진도 각자 한 행씩(기존 사진첩 옵션 그대로 따름).
- 이미지는 **다운스케일**해서 삽입한다(원본 그대로 넣으면 결함 수백 건일 때 파일이 수백MB
  로 커진다) — 셀당 표시 폭 기준 정사각 근사 썸네일. 원본 고화질이 필요하면 기존 ZIP
  사진 다운로드 기능을 쓰면 된다(이미 있음, 범위 밖).
- 새 파일: `apps/web/src/export/photoBookXlsx.ts` — `buildPhotoBookXlsxSheet(pages, images):
  Promise<SheetSpec>`.
- `produce.ts`: `FILE_ARTIFACTS`에 `'PHOTO_BOOK'` 추가, `produceArtifacts()`에 케이스 추가
  (다른 세 산출물과 같은 패턴 — `photoBookModel` → `renderPhotoBookImages` →
  `buildPhotoBookXlsxSheet` → `writeWorkbook` → `push()`).
- `Export.tsx`: `KIND_HINT.PHOTO_BOOK` 문구를 다른 셋과 같은 "엑셀 또는 PDF" 패턴으로 교체.
  "사진첩만 골랐다 — 파일이 없다" 특수분기(238~244행)는 더 이상 참이 아니므로 제거.
- `RunHistory.tsx`: **변경 없음** — 파일 받기 버튼은 이미 `FILE_ARTIFACTS` 기준으로 범용
  동작한다.

## 비차단 가정 (ASSUMPTIONS.md에도 기록)
- 썸네일 다운스케일 크기·화질은 사용자가 지정하지 않아 구현자가 임의로 정한다(내부 구현
  세부사항으로 판단, "사진 파일 형태" 결정이 아니라 "성능·용량" 결정이라 되묻지 않음).
- CSV 폴백(엑셀 라이브러리가 막힐 때) 시 이미지는 낼 수 없다 — 폴백 CSV엔 사진 없이 표만
  나간다는 걸 사용자 안내 문구에 반영한다(기존 CSV_FALLBACK_NOTICE 재사용, 이미지 손실은
  별도 언급 불필요할 만큼 드문 경로로 판단).

## 검증 계획
- `writeWorkbook`/`sheetsToCsv`는 project-core 밖(apps/web)이라 기존에도 단위테스트가 없다
  (NEXT.md: "apps/web에는 테스트 러너가 없어 UI·훅은 타입검사로만 검증"과 같은 이유) — 이번
  것도 타입검사·빌드로 검증. `buildPhotoBook()` 자체(project-core, 순수함수)는 이미 테스트
  커버됨 — 그대로 재사용하므로 회귀 없음.
