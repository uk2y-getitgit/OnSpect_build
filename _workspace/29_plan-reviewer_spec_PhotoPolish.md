# 스펙 검토 결과 — 사진 마무리 + 출력 보완 (PhotoPolish)

작성: plan-reviewer · 2026-08-25 · 원격/비대화형 라운드 (차단 질문 0건)

범위 7건 — ① 사진 자르기 UI ② 사진 주석 UI ③ EXIF 촬영시각·기기 ④ 사진 캡션 UI
⑤ 조사구분 폼 노출 ⑥ 대표 외 사진 포함 옵션 활성 ⑦ 손상결함표 인쇄 뷰.

**데이터 모델은 확정된 것으로 보고 재검토하지 않았다.** `PhotoEdits.crop` · `PhotoAnnotation`
· `Photo.caption` · `Photo.takenAt/device` · `ExportDocOptions.includeNonPrimaryPhotos` 는
전부 이미 예약돼 있어 **필드를 새로 만들지 않는다.** 추가되는 것은 출력 모델(`PhotoBookCell`)의
파생 필드 3개뿐이고 저장 스키마·`DB_VERSION`·`ExportRun` 구조는 그대로다.

---

## 1. 구현 가능 판정

### ✅ **바로 착수 가능** — 7건 전부

근거:

| 항목 | 판정 | 이유 |
|---|---|---|
| ① 자르기 | 착수 가능 | 좌표 규약(§2-1)만 못 박으면 나머지는 순수 UI. 로컬 구현으로 `canvas-core` 무관 |
| ② 주석 | 착수 가능 | 같음. 되돌리기는 **편집 세션 로컬 스택**으로 충분 (§2-4 근거) |
| ③ EXIF | 착수 가능 | **자체 파서로 확정** (§2-6). 새 의존성 0 |
| ④ 캡션 | 착수 가능 | `photoBook.ts` 가 이미 `photo.caption` 을 3행에 쓴다 — 입력창만 붙이면 끝 |
| ⑤ 조사구분 | 착수 가능 | `SegmentField` 재사용 6줄. **다만 S6 씨앗 표(J4)를 함께 고쳐야 한다** (§2-7) |
| ⑥ 대표 외 사진 | 착수 가능 | `assignNumbers` 를 **건드리지 않는 부번 방식**으로 확정 (§2-8) — 재현성 무손상 |
| ⑦ 손상결함표 PDF | 착수 가능 | `damageTableModel()` 이 이미 있다. 인쇄 컴포넌트 1개 + 배선 4곳 |

### ⚠️ 착수 전에 반드시 읽어야 할 두 가지

1. **자르기·주석을 넣으면 사진첩·미리보기가 자동으로 따라오지 않는다.**
   지금 `PrintPhotoBook` 은 `<img src>` 에 CSS `rotate` 만 건다. 자르기를 만들어 놓고 이걸
   안 고치면 **사용자가 자른 사진이 보고서에는 안 잘린 채로 인쇄된다** — 이 라운드에서
   가장 조용히 틀릴 수 있는 지점이다. 그래서 R-3(합성 렌더러)·R-8(사진첩 반영)이
   자르기·주석과 **같은 묶음**에 들어가 있다. 둘 중 하나만 하면 안 된다.
2. **`PrintPhotoBook` 의 `key={c.defectId}` 는 대표 외 사진을 켜는 순간 중복 키가 된다.**
   (한 결함에 셀이 여러 개가 되므로) — R-8 에서 `cell.key` 로 교체한다.

---

## 2. 확정 스펙

### 2-1. 좌표 규약 ⭐ — 이 절이 이 라운드의 유일한 "잘못 잡으면 전부 갈아엎는" 지점

`photo.ts` 는 `crop` · `annotations` 를 **"원본 기준 0~1 정규화"** 라고만 적어 두었다.
`edits.rotate` 가 "EXIF 방향 보정 **이후**에 추가로 적용된다" 고 돼 있으므로,
**회전 적용 전인지 후인지**가 정해지지 않았다. 두 해석 모두 성립하고, 잘못 고르면
회전된 사진에서 자르기·주석이 90° 틀어진다.

#### 확정

```
기준 프레임 = 렌더 프레임
            = renderBlobKey 의 래스터 (EXIF 방향 이미 적용됨 · Photo.width/height 가 그 크기)
            = edits.rotate 를 적용하기 **전**
```

- `crop` · `annotations.points` · `annotations.from/to` 는 **전부 렌더 프레임 정규화 좌표**다.
- 이것이 문서의 "원본 기준" 과 실질적으로 같은 이유: 렌더본은 원본과 **종횡비·방향이 같고**
  장변만 2048 로 줄인 것이다. 정규화 좌표에서 축소는 무의미하다. 유일한 차이는 EXIF 방향인데,
  원본 픽셀 프레임은 세로 사진이 누워 있는 프레임이라 **UI 가 그 위에 좌표를 얹을 수 없다.**
- `Photo.width/height` 주석이 이미 *"렌더 래스터 픽셀(장변 2048 이하 · EXIF 방향 적용 후)"* 이라고
  못 박고 있으므로, 레코드 안에서 자기 정합적이다.

#### 합성 순서 (표시·출력이 **같은 순서**를 쓴다)

```
렌더본  →  주석 그리기  →  자르기(crop)  →  회전(rotate)
```

- 주석을 자르기 **전에** 그리므로, 잘려 나간 영역의 획은 자동으로 사라진다(별도 클리핑 불필요).
- 좌표는 항상 자르기 전 프레임 기준이므로 **자른 뒤에 다시 자르기를 열어도 주석이 안 움직인다.**

#### 표시 프레임 ↔ 렌더 프레임 변환

편집기는 **사용자가 보는 대로(= 회전 적용된 표시 프레임)** 조작하고, 저장 직전에 되돌린다.
90° 배수라 정확한 정수 변환이고, 아래 4줄이 전부다 (`x,y` = 렌더 프레임, `u,v` = 표시 프레임):

| rotate | 표시→렌더 | 렌더→표시 |
|---|---|---|
| 0 | `x=u, y=v` | `u=x, v=y` |
| 90 | `x=v, y=1-u` | `u=1-y, v=x` |
| 180 | `x=1-u, y=1-v` | `u=1-x, v=1-y` |
| 270 | `x=1-v, y=u` | `u=y, v=1-x` |

**이 변환은 `packages/project-core/src/photoTransform.ts` 에 순수 함수로 두고 단위테스트로 고정한다.**
(이유: `apps/web` 에는 테스트 러너가 없다. 이 라운드에서 가장 틀리기 쉬운 계산을 테스트 밖에 두면 안 된다.)

```ts
export function toSourcePoint(p: Pt, rotate: PhotoRotate): Pt;
export function toDisplayPoint(p: Pt, rotate: PhotoRotate): Pt;
export function toSourceRect(r: Rect, rotate: PhotoRotate): Rect;   // 90/270 이면 w↔h 도 바뀐다
export function toDisplayRect(r: Rect, rotate: PhotoRotate): Rect;
export function clampRect(r: Rect, min = 0.05): Rect;               // [0,1] 클램프 + 최소크기
export function arrowHeadPoints(from: Pt, to: Pt, headLen: number): [Pt, Pt]; // 화면·출력 공유
export const ROUND4 = (n: number) => Math.round(n * 1e4) / 1e4;
```

**왕복 항등(`toSource(toDisplay(x)) === x`) 을 4개 회전값 전부에 대해 테스트한다.**

#### `PhotoAnnotation.width` 의 단위 — 확정

**렌더 프레임 장변 대비 비율(0~1).** 픽셀이 아니다.

- 픽셀로 두면 자르기·출력 배율이 바뀔 때마다 선 굵기가 상대적으로 달라진다(= 자르면 선이 얇아진다).
- 3단 프리셋: `얇게 0.004` · `보통 0.008`(기본) · `굵게 0.014`.
  장변 2048 기준 8px / 16px / 29px. A4 반쪽(90mm) 인쇄에서 0.35 / 0.7 / 1.2mm.
- 저장 시 좌표·굵기 모두 **소수 4자리 반올림**(0.0001 × 2048 ≈ 0.2px — 눈에 안 보인다).
  레코드 크기를 1/3 로 줄인다.

#### 색 — 디자인시스템 §3 대조

| 색 | 값 | 판단 |
|---|---|---|
| 빨강 | `--defect-current #e5342a` | **주석 기본색.** 사진 위 빨간 화살표는 안전진단 보고서의 도메인 관행이고, 의미도 정확히 같다("여기가 그 결함이다") |
| 노랑 | `#ffd400` | **보조색.** 어두운 콘크리트·야간 사진에서 빨강이 묻힌다 |

색 예약 규칙은 **도면 캔버스 위**의 규칙이다. 사진 오버레이는 다른 표면이므로 같은 제약을 받지 않지만,
빨강을 "현회차 결함"과 같은 의미로 쓰므로 학습이 어긋나지 않는다. **2색 이상 늘리지 않는다** —
색이 늘면 "이 색은 무슨 뜻이냐"가 생기고 출력에서 의미가 흐려진다.

---

### 2-2. 합성 렌더러 (`apps/web/src/data/photoCompose.ts`)

화면과 출력이 **같은 함수 하나**를 쓴다. 두 벌로 그리면 반드시 갈라진다
(`photo.ts` 가 *"각자 find(isPrimary) 하지 않는다"* 로 이미 막아 둔 것과 같은 종류의 사고).

```ts
/** 자르기·주석이 있는가. 없으면 합성하지 않고 원본 URL 을 그대로 쓴다 (빠른 경로) */
export function needsCompose(p: Pick<Photo,'edits'|'annotations'>): boolean;

/** 렌더본 Blob → 자르기·주석·회전이 전부 구워진 JPEG */
export async function composePhoto(
  src: Blob,
  p: Pick<Photo, 'edits' | 'annotations'>,
): Promise<{ blob: Blob; width: number; height: number }>;
```

- 디코드는 `photoIngest.ts` 의 `<img>` 방식을 그대로 쓴다(`decodeImage` 를 export 로 승격해 재사용).
  `createImageBitmap` 은 EXIF 방향을 적용하지 않아 **쓰면 안 된다** — 기존 주석에 이미 경고가 있다.
- 캔버스 3단: ① W×H 에 원본+주석 → ② crop 영역 blit → ③ rotate. 각 단계는 필요할 때만 만든다.
- 출력 JPEG 품질 0.9 (원본은 0.85 로 이미 구워졌으므로 재압축 손실을 더 키우지 않는다).
- **objectURL 생성/해제는 호출자 책임.** `export/locationMap.ts` 의 `renderLocationMaps`/`releaseLocationMaps`
  패턴을 그대로 따른다.
- 실패하면 예외를 던지지 말고 `null` 을 돌려주고, 호출자는 **원본 URL 로 폴백**한다.
  주석 한 장 때문에 사진첩 인쇄가 통째로 죽으면 안 된다.

> **R1 · 썸네일 그리드(`PhotoSection`)는 합성하지 않는다.** 320px 썸네일 수십 장을 매번
> 캔버스로 돌리면 우측 패널이 무거워진다. 대신 자르기·주석이 있는 타일에 `✎` 배지를 띄운다.
> 미리보기 창을 열면 합성본이 보인다.

---

### 2-3. 자르기 UI (`apps/web/src/ui/photos/PhotoCropEditor.tsx`)

**`canvas-core` 를 import 하지 않는다.** 로컬 포인터 이벤트 구현이다(경계 규칙).

**진입** — `PhotoPreviewDialog` 의 `[자르기]` 를 누르면 **같은 다이얼로그 본문이 편집 모드로 바뀐다.**
창을 하나 더 띄우지 않는다(사진 미리보기 자체가 이미 모달이다).

**스테이지 좌표계** — 오버레이 박스를 **이미지 요소와 정확히 같은 박스**에 절대배치한다.
`img { max-width:100%; max-height:...; }` 를 `position:relative; display:inline-block` 래퍼에 넣으면
래퍼 = 이미지 실제 표시 박스가 되어 레터박스 계산이 통째로 사라진다.
정규화 좌표 = `(e.clientX - rect.left) / rect.width`.
**이미지는 `edits.rotate` 가 적용된 상태로 보여준다** (사용자가 보던 그대로).

**조작**

| 제스처 | 동작 |
|---|---|
| 사각형 **안쪽** 드래그 | 이동 (0~1 클램프, 크기 유지) |
| **8핸들** 드래그 | 모서리 4 + 변 4 리사이즈 |
| 사각형 **바깥** 드래그 | 새 사각형을 그린다 |
| `Esc` | 취소 |
| `Enter` | 적용 |
| 방향키 / `Shift`+방향키 | 1% / 5% 이동 *(있으면 좋음 — 필수 아님)* |

- 최소 크기 **각 축 0.05**. 그보다 작게 끌면 멈춘다.
- 핸들은 시각 12px, **히트 영역 20px**(`::before` 확장) — 태블릿에서도 잡힌다.
- 바깥은 `box-shadow: 0 0 0 9999px rgba(0,0,0,.45)` 로 어둡게. 3분할 가이드선 표시.
- 우상단에 **잘릴 실제 픽셀 수**를 `1536×864` 형태로 표기(렌더 프레임 기준, 계측 도구다운 표시).

**버튼** `[적용]` `[취소]` `[자르기 해제]`(현재 `crop !== null` 일 때만 활성)

**적용 시**
```
rect(표시) → toSourceRect(rect, rotate) → ROUND4 → crop
rect 가 사실상 전체(각 값이 0/1 과 0.001 이내)면 crop = null 로 저장한다
```
`disabled`(전회차 잠금)면 `[자르기]` 버튼 자체가 비활성.

---

### 2-4. 주석 UI (`apps/web/src/ui/photos/PhotoAnnotateEditor.tsx`)

같은 스테이지 규약(2-3)을 쓴다. 기존 주석은 **표시 프레임으로 변환해** SVG 로 겹쳐 그린다.

**도구** — `자유획(STROKE)` · `화살표(ARROW)` · `지우개`
**색** 2종(빨강 기본 / 노랑) · **굵기** 3단 · `[실행취소]` · `[모두 지우기]` · `[적용]` `[취소]`

- **자유획**: pointerdown→move→up. 직전 점에서 **0.004 이상 움직였을 때만** 점을 넣는다.
  한 획 최대 400점(넘으면 그 이상은 버린다 — 레코드가 무한히 커지지 않게).
  점이 2개 미만이면 버린다.
- **화살표**: down = `from`, move = `to` 미리보기, up = 확정. 길이 0.01 미만이면 버린다(오클릭 방지).
- **지우개**: 클릭 지점에서 **화면 기준 12px** 안의 가장 가까운 주석 **1개를 통째로** 지운다.
  획의 일부를 지우는 지우개가 아니다(벡터 배열이라 부분 삭제는 자료구조가 다르다).
- **화살촉**은 `<marker>` 를 쓰지 않고 `arrowHeadPoints()`(project-core 순수 함수)로 좌표를 계산해
  폴리라인으로 그린다 — **화면 SVG 와 출력 Canvas 가 같은 함수를 쓰게 하려는 것이 목적**이다.
  머리 길이 = 굵기 × 4, 각도 ±25°.
- SVG 는 `viewBox="0 0 {표시W} {표시H}"` (정규화 좌표를 ×W, ×H). `preserveAspectRatio="none"` 을
  **쓰지 않는다** — 종횡비가 다르면 획 굵기가 축마다 달라진다. `strokeWidth = width × max(W,H)`.
- `stroke-linecap="round"` `stroke-linejoin="round"`.

**되돌리기 — 편집 세션 로컬로 충분하다. 캔버스 코어의 Undo 스택을 쓰지 않는다.**

판단 근거:
1. 주석은 **[적용] 을 눌러야 비로소 레코드에 반영**된다. `[취소]` 는 통째 폐기다 —
   즉 세션 밖으로 나가는 순간 되돌릴 대상이 애초에 없다.
2. 캔버스 Undo 스택(`canvas-core`)은 **도면 문서**의 히스토리다. 사진 주석 획을 여기 섞으면
   "Ctrl+Z 를 눌렀는데 도면 결함이 사라진다" 는 최악의 혼선이 생긴다.
3. `PhotoPreviewDialog` 는 **이미 window 캡처 단계에서 `Ctrl+Z` 를 막고 있다**(기존 코드 78~88행).
   즉 새는 경로가 없다. 편집기가 열려 있을 때 이 핸들러가 로컬 undo 로 **연결**만 하면 된다.

구현: `useState<PhotoAnnotation[][]>` 스택 최대 50, `[실행취소]` 버튼 + `Ctrl+Z`.

**적용 시** 표시→렌더 프레임 변환 + `ROUND4` 후 `photo.annotations` 를 통째로 교체.
id 는 편집기 로컬 생성(`a-{base36 시각}-{n}`)으로 충분하다 — 삭제 대상 식별과 React key 에만 쓴다.

---

### 2-5. 캡션 UI

`PhotoPreviewDialog` 이미지 아래에 **한 줄 입력**을 둔다.

```
[캡션] ______________________________________  (최대 80자)
       비워 두면 결함 정보로 자동 생성됩니다
```

- 값이 `''` 이면 **`null` 로 저장**한다 — `photoBook.ts::photoCaptionLines` 가
  `(a.photoCaption ?? '').trim() || photoSizeCaption(...)` 로 이미 파생 캡션 폴백을 갖고 있다.
- 저장 시점: **blur + Enter + 다이얼로그 닫기**. 타이핑마다 IndexedDB 를 때리지 않는다.
- 캡션은 **사진첩 3행**만 바꾼다(1행 `사진 12`, 2행 `위치 부재명` 은 그대로).
- 같은 자리에 **촬영 정보**를 회색 작은 글씨로 노출한다 — EXIF 가 실제로 들어왔는지
  사용자가 눈으로 확인할 수 있는 유일한 지점이다.
  `2026-08-24 14:32 · SM-S918N` / 값이 없으면 그 조각을 생략.

---

### 2-6. EXIF — **자체 파서로 확정** (라이브러리 추가 안 함)

#### 결론과 근거

| 판단 근거 | 자체 파서 | 라이브러리(exifr 등) |
|---|---|---|
| 필요한 태그 | **3개뿐** — `DateTimeOriginal 0x9003` · `Make 0x010F` · `Model 0x0110` | 수백 개(GPS·렌즈·썸네일 추출…) 전부 따라온다 |
| 코드량 | ~150줄, 전부 바이트 산술 | 0줄 |
| 번들 | **0KB** | 최소 빌드 25~50KB(gzip), 결함 입력 화면에 얹힌다 |
| 단위테스트 | **가능** — 순수 함수로 `project-core` 에 두면 된다 | 남의 코드라 테스트 대상이 아니다 |
| 틀렸을 때 비용 | **0 에 수렴** — 폴백(`file.lastModified`)이 이미 있고, 실패 = 지금과 같은 동작 | 같음 |
| 프로젝트 원칙 | 의존성 최소(엑셀 1개, PDF 0개). **PDF 라이브러리를 거절한 것과 같은 판단** | 원칙과 어긋남 |

**결정적인 것은 "틀렸을 때 비용 0" 이다.** 라이브러리를 넣는 유일한 값어치는 희귀 카메라의
엣지 케이스 견고성인데, 이 값은 못 읽으면 지금과 똑같이 `lastModified` 로 떨어질 뿐이다.
그 보험료로 번들 25~50KB 와 의존성 1개를 내는 것은 이 프로젝트의 기준에서 비싸다.

#### 파서 명세 — `packages/project-core/src/photoExif.ts` (순수)

```ts
export type JpegExif = { takenAt: number | null; make: string | null; model: string | null };
/** JPEG 바이트(앞부분만으로 충분)에서 3개 태그만 읽는다. 실패하면 전부 null */
export function parseJpegExif(bytes: Uint8Array): JpegExif;
/** "Make Model" 정규화 — 중복 접두 제거 · 80자 상한 · 빈 값은 null */
export function formatDevice(make: string | null, model: string | null): string | null;
```

동작:
1. SOI(`FFD8`) 확인 → 마커를 걸으며 `FFE1`(APP1) 을 찾는다. `FFDA`(SOS) 를 만나면 중단.
   페이로드가 `"Exif\0\0"` 로 시작하지 않으면 다음 마커로(XMP 도 APP1 이다).
2. TIFF 헤더: `II`/`MM` 바이트오더, `0x002A` 확인, IFD0 오프셋.
3. IFD0 에서 `Make(0x010F)` · `Model(0x0110)` · `ExifIFD 포인터(0x8769)`.
   Exif IFD 에서 `DateTimeOriginal(0x9003)`, 없으면 `DateTimeDigitized(0x9004)`,
   그것도 없으면 IFD0 의 `DateTime(0x0132)`.
4. `"YYYY:MM:DD HH:MM:SS"` → **로컬 시간으로 해석**한다(`new Date(y, m-1, d, h, mi, s)`).
   EXIF 에는 타임존이 없고, 조사자와 카메라는 같은 지역에 있다. `OffsetTime` 태그는 읽지 않는다.
5. **모든 오프셋·길이를 경계 검사**한다. 하나라도 어긋나면 그 값만 null 로 두고 계속 간다.
   깨진 파일이 결함 입력을 막으면 안 된다.
6. 결과 위생 검사: 연도가 1990 미만이거나 `지금 + 1일` 초과면 버린다(카메라 시계 초기화 대응).

#### 배선 (`apps/web/src/data/photoIngest.ts`)

- `ingestOne()` 에서 **앞 256KB 만** 읽는다: `await file.slice(0, 262144).arrayBuffer()`.
  (EXIF 는 파일 맨 앞에 있다. 30MB 를 통째로 메모리에 올리지 않는다.)
- `mime === 'image/jpeg'` 일 때만 파싱한다. PNG·WEBP 는 그냥 null(둘 다 EXIF 가 없거나 다른 컨테이너).
- `ReadyPhoto` 에 `device: string | null` 추가. `takenAt` 우선순위:
  **EXIF → `file.lastModified` → null**.
- `toPhotoUploads()` 의 `device: null` 하드코딩을 `r.device` 로 바꾼다.
- `replaceFile` 경로는 같은 `ingestPhotos` 를 타므로 **자동으로 함께 고쳐진다.**
- **기존 레코드는 소급 적용하지 않는다.** 마이그레이션 금지 규칙 준수 —
  `takenAt` 은 이미 `lastModified` 로 채워져 있어 빈 칸이 아니다.

---

### 2-7. 조사구분(`surveyKind`) 폼 노출

`ui/defectForm/DefectInfoForm.tsx` 에 `SegmentField` 하나 추가.

```
조사구분   [ 외관조사 ] [ 상세조사 ]
```

- **자리: 폼 최상단(구조 유형 위).** 이 값은 "이 결함이 어떤 조사에서 나왔는가" 라는 틀이고,
  아래 두 항목(⑤ 씨앗 이어받기)에 따라 **한 번 정하면 계속 따라오므로** 위에 있어도 소음이 아니다.
- `onChange({ ...value, surveyKind: v })` — 연동 규칙 없음(부재·결함유형처럼 다른 필드를 건드리지 않는다).

#### ⭐ 함께 고쳐야 하는 것 — `DEFECT_SEED_CARRY.surveyKind`

지금 `packages/canvas-core/src/defectAttrs.ts` 는 이렇게 돼 있다:

```ts
// 폼에 노출되지 않고 어느 화면도 이 값을 바꾸지 않는다 — 이어받을 것이 없다 (J4)
surveyKind: false,
```

**이 근거가 이번 작업으로 사라진다.** 그대로 두면 결함을 찍을 때마다 `EXTERIOR` 로 되돌아가서,
상세조사 중인 사용자가 **매번 다시 눌러야 하고 한 번 잊으면 조용히 외관조사로 저장된다.**

→ **`surveyKind: true`(이어받음) 로 바꾼다.**

- D9(사용자 확정)의 표에는 `surveyKind` 가 **아예 없다.** `false` 는 D9 가 아니라 builder 가정 J4 다
  → **D9 를 뒤집는 것이 아니다.**
- D9 의 원칙("분류·판정은 이어받고 측정값·개별정보는 새로 받는다")에 그대로 대입하면
  조사구분은 명백히 **분류** 쪽이다.
- 함께 고칠 파일: `packages/canvas-core/test/s6.test.ts` 의 `FRESH_KEYS`(9개 → 8개) ·
  `CARRY_KEYS`(13개 → 14개) 와 `"D9 표 그대로다 — 이어받음 13 · 새로 받음 9"` 문구.
- `OptionsPanel.tsx` 머리 주석의 *"폼에 노출이 없어 지금은 전부 `EXTERIOR` 다"* 도 갱신한다.

---

### 2-8. 대표 외 사진 포함 (K7 해제)

#### 문제

K7 이 비활성으로 둔 이유는 *"부번이 생겨 번호체계가 깨진다"* 였다. 실제로 깨질 수 있는 경로는
하나뿐이다 — **`assignNumbers()` 가 사진마다 번호를 세기 시작하면** `ExportRun.mapping`
(`Record<defectId, {no, photoNo}>`)이 결함 1건 : 번호 1개 구조라 표현할 수 없게 되고,
재현성 스냅샷이 통째로 깨진다.

#### 확정 — `assignNumbers` 를 **건드리지 않는다**

```
대표사진      → 사진 12          (photoNo 그대로. 정수 카운터 유지)
2번째 사진    → 사진 12-1
3번째 사진    → 사진 12-2
```

- **`numbering.ts` · `ExportRun` 스키마 무변경.** 부번은 사진첩 배치 단계의 파생값이다.
- **손상결함표·결함리스트의 `사진번호` 열은 그대로 `12`**(대표만 가리킨다). 바꾸지 않는다 —
  발주처 표에서 한 칸에 `12, 12-1, 12-2` 가 들어가면 열 폭이 무너진다.
- 셀 순서: **대표 먼저, 그다음 나머지를 `sortOrder` 오름차순.**
  (`normalizePhotos` 는 sortOrder 순 정렬이라 대표가 중간에 있을 수 있다 — 명시적으로 앞으로 뺀다.)
- 부번은 대표를 제외하고 **1부터** 센다.

#### 코어 변경 (전부 추가·기본값 무해)

```ts
// photoBook.ts
export type PhotoBookCell = {
  /** React key · URL 맵 키. 결함 1건에 셀이 여러 개일 수 있다 */
  key: string;               // `${defectId}:${photoId}`
  defectId: string;
  photoNo: number;
  /** 대표 = null · 그 외 1,2,3… (대표 외 사진 포함일 때만) */
  subNo: number | null;
  renderBlobKey: string;
  edits: PhotoEdits;
  annotations: PhotoAnnotation[];   // 합성 렌더러가 쓴다
  lines: string[];
  caption: string;
};

export type PhotoBookInput = { …기존…; includeNonPrimary?: boolean };  // 기본 false = 지금과 동일
```

`photoCaptionLines({ photoNo, subNo, … })` 1행 = `subNo === null ? '사진 12' : '사진 12-1'`.

#### 배선

- `exportModel.ts::photoBookModel(src, plan, params)` — `params.doc.includeNonPrimaryPhotos` 를 넘긴다.
  (호출자: `PrintRoute.tsx` 1곳)
- `OptionsPanel.tsx` — 체크박스 활성 + 안내 문구 교체:
  `대표 외 사진 포함  (부번 12-1 · 12-2 로 나갑니다 · 사진첩 장수가 늘어납니다)`
  `xp-check--off` / `xp-soon` 제거.
- `PrintPhotoBook.tsx` — `key={c.key}`.

#### 재현성 판정 ⭐

- `ExportRun.mapping` 은 그대로다 → **`[같은 번호로 다시 받기]` 는 손대지 않아도 계속 정확하다.**
- 부번은 스냅샷에 없으므로, **출력 후에 사진 순서를 바꾸면 재출력 시 부번이 달라질 수 있다.**
  이는 새로 생긴 위험이 아니다 — 지금도 대표를 바꾸면 사진첩에 실리는 **사진 자체**가 바뀐다
  (`buildPhotoBook` 이 인쇄 시점에 `primaryOf()` 를 다시 부른다). 같은 급의 이미 수용된 성질이고,
  결함번호·사진번호(정수)는 어느 경우에도 흔들리지 않는다.
- 사용자 확인 체크리스트(§6)에 넣었다.

---

### 2-9. 손상결함표 인쇄 뷰

**기존 3종과 완전히 같은 재현성 규칙을 따른다** — 검토 결과 추가 조치가 필요 없다:

- `PrintRoute` 는 `#/…/export/print?run={runId}&kind=…` 로 열리고 **`ExportRun` 을 읽어**
  `planFromRun(source, run)` 으로 행을 만든다. `assignNumbers` 를 다시 부르지 않는다.
- 손상결함표 인쇄 뷰는 `damageTableModel(source, plan, run.params)` 을 쓴다 —
  **엑셀 산출물과 문자 그대로 같은 함수**다(`buildDamageTable`).
  → 같은 run 의 엑셀과 PDF 는 번호·셀 내용이 같을 수밖에 없다.
- `run.params.doc.headerLine2` 도 run 에서 나온다 → 머리말까지 재현된다.

**컴포넌트 설계 — 결함 리스트와 코드를 나눈다(두 벌로 쓰지 않는다)**

```
PrintDamageTable.tsx
  export function PrintDamageTable({ model, subtitle, groupHeader, legend })
     groupHeader=true  → thead 2행 (손상규모 4열을 colSpan 병합, 나머지는 rowSpan=2)
     legend=true       → 표 아래 `.pv-legend` 에 causeLegend `① 건조수축 ② …`

PrintDefectList.tsx  → 위 컴포넌트를 groupHeader={false} legend={false} 로 감싼 5줄 래퍼
```

⚠️ **`groupHeader` 를 무조건 켜면 안 된다.** `DEFECT_LIST_COLUMNS` 의 폭·길이·면적·개소도
`DAMAGE_COLUMNS` 에서 온 객체라 `group: '손상규모'` 를 **이미 갖고 있다** —
자동 판정으로 짜면 기존 결함 리스트 PDF 에 없던 병합 머리가 조용히 생긴다. 플래그로 명시한다.

**배선 4곳**

| 파일 | 변경 |
|---|---|
| `router.ts` | `PrintKind` 에 `'DAMAGE_TABLE'` 추가 · `PRINT_KINDS` 배열 · 기본값은 `DEFECT_LIST` 유지 |
| `PrintRoute.tsx` | `KIND_TO_ARTIFACT` · `pageRule` · `damageTableModel` 분기 |
| `RunHistory.tsx` | `PRINTABLE` 맨 앞에 `'DAMAGE_TABLE'` |
| `Export.tsx` | `KIND_HINT.DAMAGE_TABLE` 에 "PDF 는 아래 이력에서 [손상결함표 PDF]" 추가 |

**용지 방향: A4 가로(landscape).** 13열 · 열폭 합 128 문자. 세로 186mm 에 넣으면
`결함의 유형 및 형상`(18) 이 26mm 라 두 줄로 깨진다. 조사위치도가 이미 가로를 쓰므로
`pageRule()` 에 조건 하나 더 붙이는 것이 전부다(되돌리는 비용 1줄).

---

## 3. 작업 분해

builder 가 **위에서부터 순서대로** 커밋한다. 각 커밋은 타입검사 + 단위테스트가 통과해야 한다.

| # | 작업 | 산출물(파일) | 의존 | 난이도 |
|---|---|---|---|---|
| **R-1** | EXIF 파서 + 인입 배선 | `project-core/src/photoExif.ts`(신규) · `index.ts` · `test/photoExif.test.ts`(신규) · `web/src/data/photoIngest.ts` | — | 중 |
| **R-2** | 좌표 변환 + 사진 순수 setter | `project-core/src/photoTransform.ts`(신규) · `photo.ts`(setter 3개) · `index.ts` · `test/photoTransform.test.ts`(신규) | — | 중 |
| **R-3** | 합성 렌더러 + 저장 훅 | `web/src/data/photoCompose.ts`(신규) · `photoIngest.ts`(decodeImage export) · `web/src/data/usePhotos.ts` | R-2 | 중 |
| **R-4** | 캡션 + 촬영정보 표시 | `ui/photos/PhotoPreviewDialog.tsx` · `PhotoSection.tsx` · `routes/CanvasRoute.tsx` · `index.css` | R-1 R-3 | 하 |
| **R-5** | 자르기 UI | `ui/photos/PhotoCropEditor.tsx`(신규) · `PhotoPreviewDialog.tsx` · `index.css` | R-2 R-3 | **상** |
| **R-6** | 주석 UI | `ui/photos/PhotoAnnotateEditor.tsx`(신규) · `PhotoPreviewDialog.tsx` · `index.css` | R-5 | **상** |
| **R-7** | 조사구분 폼 노출 | `ui/defectForm/DefectInfoForm.tsx` · `canvas-core/src/defectAttrs.ts` · `canvas-core/test/s6.test.ts` · `routes/export/OptionsPanel.tsx`(주석) | — | 하 |
| **R-8** | 사진첩에 자르기·주석·대표외 반영 | `project-core/src/export/photoBook.ts` · `test/photoBook.test.ts` · `web/src/export/exportModel.ts` · `printView/PrintRoute.tsx` · `printView/PrintPhotoBook.tsx` · `routes/export/OptionsPanel.tsx` | R-3 | **상** |
| **R-9** | 손상결함표 인쇄 뷰 | `printView/PrintDamageTable.tsx`(신규) · `PrintDefectList.tsx` · `PrintRoute.tsx` · `printView/print.css` · `router.ts` · `routes/export/RunHistory.tsx` · `routes/Export.tsx` | — | 중 |

- 파일 수는 전부 10개 이하. **R-5 · R-6 · R-8 이 이 라운드의 위험 구간**이다.
- R-1 · R-2 · R-7 · R-9 는 서로 독립이라 순서를 바꿔도 된다. 병렬 착수 가능.
- **R-5 를 하고 R-8 을 안 하면 안 된다** (자른 사진이 보고서에 안 잘려 나간다). 두 개를 같은 PR 로 묶어라.

### 커밋 메시지 예

```
사진: EXIF 촬영시각·기기 파싱 (자체 파서, 의존성 0)
사진: 자르기·주석 좌표 변환 순수 함수 + 테스트
사진: 자르기 UI (8핸들 · 로컬 구현)
출력: 손상결함표 인쇄 뷰 추가 (A4 가로 · 병합 머리 · 원인 범례)
```

---

## 4. 지적 사항

| 유형 | 위치 | 내용 | 심각도 |
|---|---|---|---|
| **모호함** | `photo.ts` `crop`/`annotations` 주석 | *"원본 기준 0~1 정규화"* 가 **`edits.rotate` 적용 전/후**를 정하지 않았다. 잘못 잡으면 회전된 사진에서 자르기가 90° 틀어진다 | 🔴 높음 → §2-1 로 확정(렌더 프레임 = 회전 전) |
| **누락** | `PhotoAnnotation.width` | 단위(px / 정규화 비율)가 정의돼 있지 않다. px 로 두면 자른 뒤 선 굵기가 상대적으로 달라진다 | 🟠 중 → §2-1 로 확정(장변 대비 비율) |
| **누락** | `PrintPhotoBook.tsx` | `<img>` 에 CSS `rotate` 만 적용한다. **`crop`·`annotations` 를 전혀 반영하지 않는다** — 자르기만 만들면 보고서가 안 잘린 사진을 낸다 | 🔴 높음 → R-8 로 해소 |
| **버그(잠재)** | `PrintPhotoBook.tsx:37` | `key={c.defectId}` — 대표 외 사진을 켜는 순간 **React key 중복** | 🟠 중 → R-8 |
| **모순** | `canvas-core/src/defectAttrs.ts:59` | `surveyKind: false` 의 근거가 *"폼에 노출되지 않고"* 인데, 이번에 노출한다. 근거가 소멸하는데 값이 남으면 매번 `EXTERIOR` 로 리셋된다 | 🟠 중 → R-7 에서 `true` 로 (D9 위반 아님 — D9 표에 `surveyKind` 자체가 없다) |
| **미결정** | `ExportDocOptions.includeNonPrimaryPhotos` | *"부번이 생겨 번호체계가 깨진다"* 만 있고 부번 규칙이 없었다 | 🟡 → §2-8 로 확정(코어 번호부여 무변경) |
| **모호함** | `usePhotos.ts:126` `defectsWithPhoto` | `list.length > 0` 로 판정한다(대표 유무가 아니라). 정규화 목록에서는 결과가 같지만 **이름과 구현이 어긋난다.** `defectIdsWithPrimaryPhoto()` 라는 정식 경로가 `project-core` 에 따로 있다 | 🟢 낮음 — 이번 범위 아님. **고치지 말고 기록만** |
| **미결정** | 손상결함표 실물 서식 | 여전히 미확보. 인쇄 뷰도 표준 13열 기준으로 만든다. 서식이 오면 `DAMAGE_COLUMNS` 만 고치면 엑셀·PDF 가 함께 따라온다 | 🟢 낮음 — 구조상 안전 |

---

## 5. 사용자 확인 필요

**차단 질문 0건.** 이번 라운드는 사용자 확인 없이 끝까지 간다.

`_workspace/QUESTIONS.md` 에 **비차단 2건**을 기록했다 (되돌리는 비용이 낮은 순):

- **Q43** — 대표 외 사진의 부번 방식과 손상결함표 사진번호 열 (§2-8) · 비차단
- **Q44** — 조사구분을 직전 입력에서 이어받을 것인가 (§2-7 · D9 표 보강) · 비차단

`_workspace/ASSUMPTIONS.md` 의 **R1~R12** 에 이번 라운드 가정을 전부 적었다.

---

## 6. 직접 확인해주실 것 (builder 완료 후 사용자 체크리스트)

### 사진 편집
- [ ] 세로 사진(EXIF 90° 회전)에서 **자르기 사각형이 손가락을 따라오는가** — 90° 어긋나면 §2-1 변환 버그
- [ ] `⟳ 오른쪽 90°` 를 누른 **뒤에** 자르기를 열어도 사각형이 화면과 맞는가
- [ ] 자른 뒤 다시 자르기를 열면 **직전 사각형이 그대로 떠 있는가**
- [ ] 자른 사진을 회전해도 자른 영역이 유지되는가
- [ ] 주석 화살표를 그린 뒤 사진을 자르면 **잘려 나간 쪽 획이 사라지는가**
- [ ] 주석 편집 중 `Ctrl+Z` → **주석만 되돌아가고 도면 결함은 그대로인가** (가장 중요)
- [ ] 주석 편집 중 `Delete` 를 눌러도 캔버스 결함이 안 지워지는가
- [ ] `[취소]` 로 나가면 그린 것이 전부 사라지는가 / 새로고침해도 안 남는가
- [ ] 자르기·주석이 있는 사진 타일에 `✎` 배지가 뜨는가

### EXIF
- [ ] 휴대폰으로 찍은 JPG 를 올리면 미리보기에 **촬영시각·기기**가 뜨는가
- [ ] 카톡·메신저를 거친 사진(EXIF 제거됨)은 시각만 뜨고 기기가 비는가 — **오류가 아니라 정상**
- [ ] PNG 를 올려도 등록이 되는가 (기기 칸은 비어야 정상)

### 캡션·조사구분
- [ ] 캡션을 넣으면 **사진첩 3행만** 바뀌는가 (1행 `사진 12`, 2행 `위치 부재명` 은 그대로)
- [ ] 캡션을 지우면 자동 캡션(`수직균열 0.2×0.5×3ea`)으로 **되돌아가는가**
- [ ] 결함정보 폼에서 `상세조사` 를 고르고 **다음 결함을 찍으면 상세조사가 유지되는가** (Q44)
- [ ] 출력 화면 조사구분 필터 `상세조사` 로 뽑으면 **그 결함만** 나오는가

### 출력
- [ ] `대표 외 사진 포함` 을 켜면 사진첩에 `사진 12` `12-1` `12-2` 가 연달아 나오는가
- [ ] 그때 **손상결함표 사진번호 열은 `12` 하나만** 그대로인가
- [ ] 그때 **결함번호는 하나도 안 밀리는가**
- [ ] 자르기·주석이 **사진첩 PDF 에 그대로 인쇄되는가** (화면과 같은 모양)
- [ ] `[손상결함표 PDF]` 가 A4 **가로**로 열리고 `손상규모` 병합 머리가 4칸을 덮는가
- [ ] 그 PDF 아래에 `① 건조수축 ② …` 원인 범례가 나오는가
- [ ] **같은 이력에서 뽑은 엑셀과 PDF 의 번호가 완전히 같은가**
- [ ] 출력한 뒤 사진 순서를 바꾸고 `[같은 번호로 다시 받기]` → **결함번호·사진번호(정수)는 그대로**인가
      (부번 `-1`/`-2` 순서는 바뀔 수 있다 — 알려진 성질, §2-8)

---

## 7. 절대 어기면 안 되는 것 (이번 범위 한정 재확인)

1. **`crop`·`annotations` 좌표는 렌더 프레임 0~1 정규화.** 픽셀 금지 (불변식 #1 과 같은 이유)
2. **합성 순서 `주석 → 자르기 → 회전` 을 화면과 출력이 똑같이 쓴다.** 두 벌로 그리지 않는다
3. **`assignNumbers()` 를 건드리지 않는다.** 대표 외 사진은 파생 부번이다 (불변식 #2 · 재현성)
4. **`ExportRun` 스키마·`DB_VERSION` 무변경.** 마이그레이션 0건
5. **`ui/defectForm/*` 은 store·repo·캔버스를 import 하지 않는다.** 사진 편집기는 `ui/photos/` 에 둔다
6. **사진 편집기는 `canvas-core` 를 import 하지 않는다.** 포인터 처리는 로컬 구현
7. **주석 되돌리기는 캔버스 Undo 스택에 들어가지 않는다**
8. **`project-core` 에 `Blob`·`File`·`URL` 을 들이지 않는다.** EXIF 파서는 `Uint8Array` 만 받는다
9. **PDF 라이브러리를 넣지 않는다.** 손상결함표 인쇄 뷰도 `window.print()` + `@page`
10. **새 npm 의존성 0개.** EXIF 는 자체 파서

---

## 변경 이력

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-08-25 | 최초 작성 | NEXT.md "남은 것/못 한 것" 중 실물 서식 의존 항목을 제외한 7건 |
