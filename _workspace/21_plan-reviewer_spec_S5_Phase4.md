# 스펙 검토 결과 — S5(사진) + Phase 4(산출물 4종)

작성: plan-reviewer · 2026-08-25
범위 문서: `_workspace/00_input/scope_S5_Phase4.md`
기준: `OnSpect_상세기획.md` §2-C · §4 · §5 · §6 / `안전진단_결함관리앱_기획서.md` §6
전제 결정: `DECISIONS.md` D1~D9 · `ASSUMPTIONS.md` F4·F6·F17·B1·B16·D3(사용자)·H2·H3

---

## 1. 구현 가능 판정

| # | 항목 | 판정 | 근거 |
|---|---|---|---|
| 0 | **공통 번호부여 `numbering.ts`** | **바로 가능** | §4-3 알고리즘이 이미 확정. 입력은 전부 기존 필드(`floorId`·`seq`·`status`·`surveyKind`) |
| 0 | **`ExportRun` 스냅샷 저장** | **바로 가능** | `meta` 스토어(범용 KV, keyPath `key`)를 재사용해 **DB 버전 1을 유지**한다. §3-3 참조 |
| 1 | **S5 사진 추가** | **바로 가능** | `photos` 스토어 + `by_project`/`by_defect` 인덱스가 v1 에 이미 있다(`db.ts` 153~155행). Blob 3종 파이프라인은 `DrawingUpload` 를 그대로 복제 |
| 2-a | **손상결함표(엑셀)** | **조건부 가능** | 실물 서식 미확보는 이미 §7-Q1 에서 "표준 13열로 진행" 확정 → 차단 아님. 조건은 **엑셀 라이브러리 1개 도입**뿐이며, 실패 시 폴백(§4-8)이 정의돼 있어 착수를 막지 않는다 |
| 2-b | **결함 리스트(A4 세로)** | **바로 가능** | 손상결함표와 같은 행 생성기를 공유. PDF 는 브라우저 인쇄(§4-9) |
| 2-c | **사진첩(6장/페이지)** | **조건부 가능** | **S5 완료가 선행 조건.** 그 외 미결 없음 |
| 2-d | **조사위치도** | **바로 가능** | `buildBackground`+`buildScreens`+`buildOverlay`(DrawOp[]) 와 `renderOps` 가 이미 있어 오프스크린 캔버스에 그대로 재생하면 된다(B16 의 설계 목적이 바로 이것) |

**착수 불가 항목 없음. 차단 질문 없음.**

---

## 2. 확정 스펙 — S5 사진

### 2-1. 데이터 모델 (신규 · `packages/project-core/src/photo.ts`)

```ts
/** 비파괴 보정. 원본 Blob 은 손대지 않는다 (§2-C "원본 보존") */
export type PhotoEdits = {
  /** 원본 기준 **0~1 정규화** 사각형. null = 자르지 않음. ⚠ 픽셀이 아니다(함정 #2 와 같은 이유) */
  crop: { x: number; y: number; w: number; h: number } | null;
  /** 시계방향. EXIF 방향 보정 **이후**에 추가로 적용된다 */
  rotate: 0 | 90 | 180 | 270;
};

/** 주석 벡터. 좌표는 **원본 기준 0~1 정규화** */
export type PhotoAnnotation =
  | { k: 'STROKE'; id: string; points: { x: number; y: number }[]; color: string; width: number }
  | { k: 'ARROW'; id: string; from: { x: number; y: number }; to: { x: number; y: number }; color: string; width: number };

export type Photo = RecordBase & {
  id: string;
  projectId: string;
  defectId: string;
  /** 결함당 정확히 1장 (불변식 #8) */
  isPrimary: boolean;
  /** 10 격자. 드래그 재정렬 시 목록 전체 재부여 (G6 와 같은 규칙) */
  sortOrder: number;

  /** 원본 파일 Blob. 필수 — 도면의 sourceBlobKey 와 같은 규칙(D5 ④) */
  sourceBlobKey: string;
  /** 렌더·출력용 장변 2048 JPEG. 원본이 이미 작으면 sourceBlobKey 와 같은 키 */
  renderBlobKey: string;
  /** 장변 320 썸네일 */
  thumbBlobKey: string;
  /** Phase 5 예약. 지금은 항상 null */
  remoteUrl: string | null;

  fileName: string;
  mime: string;
  byteSize: number;
  /** 렌더 래스터 픽셀 (EXIF 방향 적용 후) */
  width: number;
  height: number;

  /** 촬영시각. EXIF 미파싱이므로 `file.lastModified` (K5) */
  takenAt: number | null;
  /** 촬영기기. 1차는 항상 null (K5) */
  device: string | null;

  edits: PhotoEdits;
  annotations: PhotoAnnotation[];
  /** 사진첩 캡션 **수동 덮어쓰기**. null = 파생 캡션을 쓴다 (§4-6). 1차는 UI 없이 예약만 */
  caption: string | null;
};

export const EMPTY_PHOTO_EDITS: PhotoEdits = { crop: null, rotate: 0 };
```

- `Photo` 는 **`project-core`** 에 둔다. 캔버스와 무관하고 `RecordBase` 를 쓰며 repo 인터페이스가 이 타입을 필요로 한다. `canvas-core` 는 사진을 모른다(경계 유지).
- Blob 은 repo 인터페이스에 등장하지 않는다(경계 규칙 9). 등록은 어댑터 전용 `PhotoUpload` 타입으로 받는다 — `DrawingUpload` 와 같은 모양.

### 2-2. 불변식 함수 (순수, 단위테스트 대상)

`packages/project-core/src/photo.ts`

| 함수 | 계약 |
|---|---|
| `normalizePhotos(list: Photo[]): Photo[]` | `sortOrder` 오름차순 정렬 + **대표 정확히 1장 보장**. 대표가 0장이면 첫 장, 2장 이상이면 `sortOrder` 가 가장 작은 것만 남긴다. 옛 레코드 정규화도 겸한다(E11 과 같은 방식 — DB 버전 안 올린다) |
| `setPrimary(list, photoId): Photo[]` | 지정한 1장만 `isPrimary=true` |
| `removePhoto(list, photoId): Photo[]` | 지운 뒤 `normalizePhotos` 를 다시 통과시킨다 → **대표를 지우면 다음 장이 자동 승계** |
| `reorderPhotos(list, ids): Photo[]` | 목록 전체에 `sortOrder = i*10` 재부여 |
| `primaryOf(list): Photo \| null` | 사진번호·사진첩이 쓰는 유일한 조회 경로 |

> ⚠️ **불변식 #8 은 저장 시점이 아니라 읽기 정규화로 강제한다.** 쓰기 경로가 여러 개(업로드·삭제·대표지정·Undo)라 저장 쪽에서만 막으면 반드시 새는 경로가 생긴다.

### 2-3. 저장소 (`apps/web/src/data/idb/photos.ts`) + repo 인터페이스 확장

```ts
// project-core/src/repo.ts 에 추가
listPhotos(projectId: string): Promise<TPhoto[]>;
listPhotosOfDefect(defectId: string): Promise<TPhoto[]>;
upsertPhotos(items: readonly TPhoto[]): Promise<void>;
deletePhotos(ids: readonly string[]): Promise<void>;
```

- `ProjectRepo<TDefect, TMemo>` → `ProjectRepo<TDefect, TMemo, TPhoto = unknown>` 로 타입 인자를 하나 늘린다.
- Blob 등록은 어댑터 전용 메서드 `registerPhotos(uploads: readonly PhotoUpload[])` — `registerDrawings` 를 그대로 본뜬다(Blob 3종 + 레코드가 **한 트랜잭션**에서 커밋).
- 삭제 시 `releaseBlobIn` 으로 refCount 를 낮춘다. 같은 파일을 두 번 올리면 키가 달라지므로 dedupe 는 하지 않는다(도면과 동일).
- **결함 삭제 시 그 결함의 사진도 함께 지운다.** `deleteDefects` 안에서 `by_defect` 인덱스로 찾아 Blob 까지 정리한다. 지금 안 넣으면 고아 사진과 고아 Blob 이 조용히 쌓인다.
- `deleteFloor` / `deleteBuilding` / `copyStructure` 도 같은 원칙 — **삭제는 사진까지, 복사는 사진을 복사하지 않는다**(전회차 승계는 Phase 2-D 소관).

### 2-4. 인입 파이프라인 (`apps/web/src/data/photoIngest.ts`)

```
File[] (input[type=file][multiple][accept=image/*])
  → 용량 사전 확인 (estimateStorage — 도면과 같은 규칙, 처리 다 하고 마지막에 실패하지 않는다)
  → <img> 디코드            ← EXIF 방향이 브라우저에서 자동 적용된다 (K4)
  → 장변 2048 캔버스 리사이즈 → JPEG q0.85  = renderBlob
  → 장변 320  캔버스 리사이즈 → JPEG q0.8   = thumbBlob
  → sourceBlob = 원본 File 그대로
  → PhotoUpload[]
```

- 허용 형식: `image/jpeg` · `image/png` · `image/webp`. HEIC 는 브라우저가 디코드 못 하므로 **명시적으로 거절**하고 안내한다(D1 의 PDF 거절과 같은 방식).
- 장당 상한 30MB, 1회 선택 상한 50장. 초과분은 거절 목록으로 보여준다.
- 실패한 파일이 있어도 **성공한 파일은 등록한다**(부분 성공). 실패 목록을 토스트가 아니라 섹션 안 인라인 경고로 남긴다.

### 2-5. 화면 — 결함 우측 패널 사진 섹션 (`ui/photos/PhotoSection.tsx`)

`Inspector.tsx` 의 `DefectInfoForm` **아래**에 붙인다. `InspectorProps` 에 `photos: Photo[]` 와 콜백을 추가한다.

```
사진  3장                                   [+ 사진 추가]
┌────────┐ ┌────────┐ ┌────────┐
│  대표  │ │        │ │        │      ← 96px 정사각 썸네일, 대표에 배지
│        │ │        │ │        │
└────────┘ └────────┘ └────────┘
드래그로 순서 변경 · 우클릭(또는 ⋯)으로 메뉴
```

- 썸네일 우클릭 / `⋯` 메뉴: `[대표로 지정] [왼쪽 90° 회전] [오른쪽 90° 회전] [교체] [삭제]`
  (PC 웹이므로 롱프레스 대신 우클릭 — 기획서 §2-C 가 명시적으로 허용)
- 클릭 → **미리보기 다이얼로그**(`PhotoPreviewDialog.tsx`): 큰 이미지 + 좌우 이동 + 같은 액션 버튼 + `[자르기](준비 중)` `[주석](준비 중)`
- 삭제는 **되돌리기 토스트 10초**(D10 과 같은 규칙). Blob 실삭제는 되돌리기 창이 닫힌 뒤에 한다.
- 저장 피드백은 패널 하단 상시 표시(I4)를 그대로 쓴다.

> **경계:** `ui/defectForm/*` 은 store·repo·캔버스를 import 하지 않는다는 규칙이 있다.
> `PhotoSection` 은 `ui/defectForm/` 이 **아니라** `ui/photos/` 에 둔다. 사진은 Blob·objectURL 을 다루므로
> 순수 폼 경계 안에 들어갈 수 없다. RN 재사용 경계를 깨지 않기 위해 자리를 분리한다.

### 2-6. S5 1차 범위 축소 — "만들어졌다"의 기준 (K3)

| 기능 | 1차 | 근거 |
|---|---|---|
| 폴더/파일 다중 선택 등록 | ✅ | |
| 썸네일 목록 · 드래그 정렬 | ✅ | |
| 대표 지정 · 자동 승계(불변식 #8) | ✅ | **사진번호가 여기에 걸린다.** 빠지면 Phase 4 가 성립 안 함 |
| 교체 · 삭제(되돌리기) | ✅ | |
| **90° 회전** | ✅ | 세로 사진이 눕는 것은 출력물 품질 문제다. `edits.rotate` 한 필드 |
| 미리보기 다이얼로그 | ✅ | |
| **자르기(crop)** | ⬜ **준비 중** | 드래그 사각형 + 확대·비율고정·되돌리기까지 갖춰야 쓸 만한데, 반쪽으로 내면 사용자가 잘못 자른 사진을 복구하지 못한다. `edits.crop` **필드는 예약**돼 있어 나중 추가 비용이 0 |
| **주석(그리기·화살표)** | ⬜ **준비 중** | 사실상 두 번째 캔버스 앱이다. `annotations` **필드 예약**. 렌더 경로만 뚫어 두고 UI 는 비활성 |
| EXIF 촬영시각·기기 파싱 | ⬜ | 파서 의존성 추가. `file.lastModified` 로 대체(K5) |

**S5 완료 판정 = 파일 선택으로 N장 등록 → 대표 1장 보장 → 순서·회전·교체·삭제 → 새로고침 후 유지 → 사진첩이 대표사진을 뽑아 쓸 수 있다.**

---

## 3. 확정 스펙 — 공통 기반

### 3-1. 번호부여 모듈 `packages/project-core/src/export/numbering.ts`

**4개 산출물이 이 함수 하나만 부른다. 각자 세지 않는다.**

```ts
export type NumberMode = 'PER_FLOOR' | 'CONTINUOUS';

/** canvas-core 를 import 하지 않기 위한 로컬 최소 타입. 실제 Defect 를 그대로 넘겨도 구조적 타이핑으로 맞는다(size.ts::SizeInput 과 같은 수법) */
export type NumberingDefect = {
  id: string;
  floorId: string;
  drawingId: string;
  seq: number;
  status: 'CURRENT' | 'PREV_PENDING' | 'REPAIRED';
  surveyKind: 'EXTERIOR' | 'DETAIL';
};

export type NumberingParams = {
  /** **클릭한 순서 그대로.** 이 배열이 곧 출력 순서다 (§4-4 젠트릭스 방식) */
  floorIds: string[];
  mode: NumberMode;
  /** null = 전체 */
  surveyKinds: readonly ('EXTERIOR' | 'DETAIL')[] | null;
  /** REPAIRED 포함 여부. 기본 false */
  includeRepaired: boolean;
  /** PREV_PENDING 포함 여부. 기본 true */
  includePrevPending: boolean;
  /** 미완성 결함 포함 여부. **기본 true** (D3 — 자동 제외 금지) */
  includeIncomplete: boolean;
};

export type NumberingRow = {
  defectId: string;
  floorId: string;
  /** 출력 결함번호 ② */
  no: number;
  /** 출력 사진번호 ③. 대표사진이 없으면 null → 표에는 '—' */
  photoNo: number | null;
};

export type FloorRange = {
  floorId: string;
  count: number;
  /** 이 층에 배정된 NO 구간. count 0 이면 null */
  from: number | null;
  to: number | null;
};

export type NumberingResult = {
  /** 출력 순서 그대로 */
  rows: NumberingRow[];
  byDefect: Record<string, { no: number; photoNo: number | null }>;
  /** 층 칩에 `①–③` 을 실시간 표시하는 재료 (§4-4) */
  floorRanges: FloorRange[];
  /** 필터로 빠진 결함 — 화면 경고용 */
  excluded: { defectId: string; reason: 'STATUS' | 'SURVEY_KIND' | 'FLOOR_NOT_SELECTED' | 'INCOMPLETE' }[];
  /** 포함됐지만 손봐야 하는 것 — 출력 경고 (D3) */
  warnings: {
    incomplete: string[];   // 부재·결함유형이 빈 결함 id
    noPhoto: string[];      // 대표사진 없는 결함 id
  };
};

export function assignNumbers(
  defects: readonly NumberingDefect[],
  params: NumberingParams,
  ctx: {
    /** 대표사진이 있는 결함 id 집합. 어댑터가 photos 에서 만든다 */
    hasPhoto: ReadonlySet<string>;
    /** 미완성 결함 id 집합. canvas-core::isIncomplete 결과를 어댑터가 넘긴다 */
    incomplete: ReadonlySet<string>;
  },
): NumberingResult;
```

**알고리즘 (§4-3 그대로, 결정론적):**

1. `params.floorIds` 순서로 층을 순회한다. 목록에 없는 층의 결함은 전부 제외.
2. 층 안에서는 `seq` 오름차순 → 동률이면 `drawingId` → 동률이면 `id` 사전순. **완전 결정론.**
3. 상태 필터: `CURRENT` 항상 포함 / `PREV_PENDING` 은 `includePrevPending` / `REPAIRED` 는 `includeRepaired`.
4. 조사구분 필터: `surveyKinds === null` 이면 통과.
5. `mode === 'PER_FLOOR'` 면 층이 바뀔 때마다 NO 를 1로 초기화, `'CONTINUOUS'` 면 끝까지 증가.
6. **사진번호는 별도 카운터.** `hasPhoto.has(id)` 인 결함에서만 증가하고, 아니면 `null`.
   **사진번호 카운터의 리셋 규칙은 `mode` 를 그대로 따른다** — 층별리셋이면 사진번호도 층마다 1부터 (K6).
7. 순수 함수. 시간·난수·DOM 을 참조하지 않는다.

**단위테스트 필수 (project-core vitest):**
- §4-2 실측 재현: 사진 없는 결함이 중간에 끼면 NO 는 93·94·96, 사진번호는 92·93·`—` 로 어긋난다
- 층 순서를 바꾸면 번호가 바뀌고, **같은 파라미터면 항상 같은 결과**
- 층별리셋 / 전체연속 각각의 `floorRanges`
- 필터 4종 각각
- 빈 층(결함 0건)이 선택돼 있어도 터지지 않고 `from/to = null`

### 3-2. 출력 파라미터 전체 (`packages/project-core/src/export/params.ts`)

```ts
export type ExportRenderOptions = {
  /** 조사위치도에 자유그리기를 그릴지 (기획서 §2 "출력 시 ON/OFF") */
  sketch: boolean;      // 기본 true
  /** 메모 레이어 */
  memo: boolean;        // 기본 false — 메모는 내부 메모다
  /** 도곽(F5-1) */
  titleBlock: boolean;  // 기본 true
  /** 범례(F5-2) */
  legend: boolean;      // 기본 true
  /** 조사위치도 출력 배율 (1 = 도면 원본 픽셀) */
  mapScale: number;     // 기본 2
};

export type ExportDocOptions = {
  /** 손상결함표 머리말 2행. 보고서마다 장 번호가 다르므로 **문자열 입력**이다 */
  headerLine2: string;  // 기본 '제2장 현장조사'
  /** 대표 외 사진 포함 (§2-C). 1차는 항상 false + UI 비활성 (K7) */
  includeNonPrimaryPhotos: boolean;
};

export type ExportParams = NumberingParams & {
  render: ExportRenderOptions;
  doc: ExportDocOptions;
};

export const DEFAULT_EXPORT_PARAMS: (floorIds: string[]) => ExportParams;
```

### 3-3. `ExportRun` — DB 마이그레이션 금지와 어떻게 양립하는가 ⭐

**결론: 새 오브젝트 스토어를 만들지 않는다. `meta` 스토어를 KV 로 재사용한다. DB_VERSION 은 1 그대로.**

근거:
- `meta` 는 `keyPath: 'key'` 인 **범용 키-값 스토어**다(`db.ts` 143행). 현재 `deviceId`·`schemaVersion`·`appVersion` 3건만 들어 있고 인덱스가 없다.
- 레코드를 추가하는 것은 **데이터 추가**이지 스키마 변경이 아니다. `onupgradeneeded` 가 돌지 않는다.
- ExportRun 은 프로젝트당 수십 건이므로 인덱스 없이 `getAll()` + prefix 필터로 충분하다(도면 Blob 처럼 무거운 대상이 아니다).
- `ASSUMPTIONS S1` 의 보류 사유("출력 파라미터 형태가 미확정이라 지금 인덱스를 잡으면 잘못 굳는다")를 **그대로 존중한다** — 지금도 인덱스를 잡지 않는다. Phase 5 에서 DB 버전을 올릴 일이 생기면 그때 전용 스토어로 승격하고, 그때 `meta` → `exportRuns` 이관 마이그레이션 1개만 쓰면 된다.

```ts
// packages/project-core/src/export/params.ts
export type ExportArtifactKind = 'DAMAGE_TABLE' | 'DEFECT_LIST' | 'PHOTO_BOOK' | 'LOCATION_MAP';

export type ExportRun = {
  id: string;
  projectId: string;
  createdAt: number;
  deviceId: string;
  params: ExportParams;
  /** ⭐ 번호 매핑 스냅샷 — 재다운로드 재현성의 근거 (§4-3 4단계) */
  mapping: Record<string, { no: number; photoNo: number | null }>;
  /** 출력 순서 */
  order: string[];
  floorRanges: FloorRange[];
  /** 스냅샷 시점의 대상 결함 수. 이후 데이터 변경 감지에 쓴다 */
  defectCount: number;
  artifacts: { kind: ExportArtifactKind; fileName: string; at: number }[];
};
```

```ts
// apps/web/src/data/idb/exportRuns.ts   ← meta 스토어 KV 어댑터
const PREFIX = 'exportRun:';
putExportRun(run)              // meta.put({ key: `exportRun:${run.id}`, value: run })
listExportRuns(projectId)      // meta.getAll() → prefix 필터 → createdAt DESC
getExportRun(id)
pruneExportRuns(projectId, keep = 20)   // 오래된 것부터 삭제. 무한히 쌓이지 않게
```

**재현성 규칙 (이 규칙이 없으면 재다운로드가 다른 보고서를 만든다):**

| 경로 | 동작 |
|---|---|
| `[생성]` (새 출력) | `assignNumbers()` 로 **새로 계산**하고 `ExportRun` 을 남긴다 |
| 이력에서 `[같은 번호로 다시 받기]` | **`mapping` 을 그대로 쓴다.** 다시 계산하지 않는다 |
| 재다운로드인데 그 사이 결함이 추가/삭제됨 | `mapping` 에 없는 결함은 **출력에서 제외**하고, `mapping` 에 있으나 사라진 결함은 건너뛴다. 화면에 `이 출력 이후 결함 3건이 추가되었습니다 · 번호는 그때 그대로 나갑니다  [지금 데이터로 새로 뽑기]` 를 띄운다 |
| 한 번의 `[생성]` 으로 4종을 함께 뽑기 | **같은 `ExportRun` 을 공유한다** → 손상결함표·사진첩·위치도의 번호가 어긋날 수 없다 |

> 이것이 이번 라운드에서 가장 중요한 구조적 결정이다. 4개 출력물이 각자 번호를 세면
> 사진첩의 `사진 92` 와 손상결함표의 `92` 가 다른 결함을 가리키게 되고, 그건 **조용히 틀린다.**

### 3-4. 공유 행 생성기 (`packages/project-core/src/export/damageTable.ts`)

**열 정의를 한 배열에 모은다. 실물 서식이 오면 여기만 고친다.**

```ts
export type DamageColumnKey =
  | 'no' | 'location' | 'member' | 'structural' | 'defectType'
  | 'widthMm' | 'lengthMm' | 'areaM2' | 'countEa'
  | 'progress' | 'leak' | 'cause' | 'photoNo';

export type DamageColumn = {
  key: DamageColumnKey;
  header: string;
  /** '손상규모' 병합 헤더에 묶이는 열 */
  group: string | null;
  /** 엑셀 열 너비(문자 단위) · 인쇄 폭 비율의 재료 */
  width: number;
  align: 'left' | 'center' | 'right';
  /** 숫자 열의 표시 소수 자리. null = 문자열 */
  decimals: number | null;
};

export const DAMAGE_COLUMNS: readonly DamageColumn[] = [
  { key:'no',         header:'NO',              group:null,     width: 6,  align:'center', decimals:0 },
  { key:'location',   header:'위치',            group:null,     width:14,  align:'left',   decimals:null },
  { key:'member',     header:'부재명',          group:null,     width:12,  align:'left',   decimals:null },
  { key:'structural', header:'구조체 유형',     group:null,     width:10,  align:'center', decimals:null },
  { key:'defectType', header:'결함의 유형 및 형상', group:null, width:18,  align:'left',   decimals:null },
  { key:'widthMm',    header:'폭(mm)',          group:'손상규모', width: 8, align:'right',  decimals:1 },
  { key:'lengthMm',   header:'길이(mm)',        group:'손상규모', width: 9, align:'right',  decimals:0 },
  { key:'areaM2',     header:'면적(㎡)',        group:'손상규모', width: 9, align:'right',  decimals:4 },
  { key:'countEa',    header:'개소(EA)',        group:'손상규모', width: 8, align:'center', decimals:0 },
  { key:'progress',   header:'진행상황',        group:null,     width: 8,  align:'center', decimals:null },
  { key:'leak',       header:'누수여부',        group:null,     width: 8,  align:'center', decimals:null },
  { key:'cause',      header:'발생원인 추정',   group:null,     width:10,  align:'center', decimals:null },
  { key:'photoNo',    header:'사진번호',        group:null,     width: 8,  align:'center', decimals:0 },
];
```

**셀 값 규칙 (전부 순수 함수 `damageRow()`):**

| 열 | 값 |
|---|---|
| `no` | `NumberingRow.no` — **저장 안 함, 계산값** |
| `location` | 용역에 동이 2개 이상이면 `{동이름} {층이름}`, 1개면 `{층이름}`. `locationNote` 가 있으면 뒤에 공백 + 붙임 (F7 필드 재사용) |
| `member` | `memberName ?? ''` |
| `structural` | `defect.structural ?? 부재 마스터의 structural` → `구조체` / `비구조체` (F16 의 해석 순서 그대로) |
| `defectType` | `defectTypeName ?? ''` |
| `widthMm`·`lengthMm`·`areaM2`·`countEa` | **`items/size.ts::outputSize()` 를 그대로 호출한다.** 새로 계산하지 않는다 (F4 · F17 · 불변식 4). AREA 모드면 폭·길이는 `0` |
| `progress` | `ONGOING` → `O` / `NONE` → `X` |
| `leak` | `true` → `O` / `false` → `X` |
| `cause` | `causeId` 로 `ItemSettings.causes` 에서 `code`(숫자) 조회 → 그대로 인쇄 (**F6 — 재부여하지 않는다**). 조회 실패 시 `causeName`, 그것도 없으면 `''` |
| `photoNo` | `NumberingRow.photoNo ?? '—'` (§4-2 실측의 `—`) |

**표 구조 (§5):**
- 머리말 3행: `{project.name}` / `params.doc.headerLine2` / `<계 속>`
- 4행: 병합 헤더 — `NO·위치·…` 는 4~5행 세로 병합, `손상규모` 는 `폭·길이·면적·개소` 4열 가로 병합
- 5행: `손상규모` 하위 4열 이름
- 이후 **층이 바뀔 때마다 `■ {층이름}` 섹션 행**(전체 열 병합)
- 엑셀 인쇄 반복 행 = 1~5행 (`<계 속>` 이 페이지마다 반복된다)
- 발생원인 범례는 **표 끝에 별도 블록**: `1. 건조수축  2. …` — `ItemSettings.causes` 중 **이 출력에 실제로 등장한 코드만**, code 오름차순

### 3-5. 결함 리스트 (A4 세로)

기획서 §6: *"전체 결함 표 형태 나열, PDF/엑셀 내보내기, A4 세로 규격"*.

**손상결함표와 같은 `damageRow()` 를 쓰되 열을 줄인다.** A4 세로(가용 폭 ≈ 180mm)에 13열은 들어가지 않는다.

```ts
export const DEFECT_LIST_COLUMNS: readonly DamageColumnKey[] = [
  'no','location','member','defectType','widthMm','lengthMm','areaM2','countEa','photoNo',
];
```
- 뺀 열: `structural` · `progress` · `leak` · `cause` — 손상결함표에서 확인하는 항목이고, 리스트는 **현장 대조·검수용 빠른 목록**이다.
- 엑셀 출력은 손상결함표와 같은 파이프라인에 `columns` 만 갈아 끼운다.
- PDF 는 인쇄 뷰(§4-9). 페이지당 행 수는 CSS 가 정한다 — 자바스크립트로 페이지네이션을 계산하지 않는다(계산하면 폰트·확대율이 바뀔 때마다 어긋난다). 층 섹션 헤더는 `break-inside: avoid` + `break-after: avoid`.

### 3-6. 사진첩 (6장/페이지)

`packages/project-core/src/export/photoBook.ts` (순수)

```ts
export type PhotoBookCell = {
  defectId: string;
  photoNo: number;
  /** 렌더 Blob 키 — 어댑터가 objectURL 로 바꾼다 */
  renderBlobKey: string;
  edits: PhotoEdits;
  caption: string;
};
export type PhotoBookPage = { index: number; cells: PhotoBookCell[] };  // cells.length ≤ 6

export function buildPhotoBook(rows, photosByDefect, ctx): PhotoBookPage[];
```

- **대표사진 기준**(§2-C 규칙). `primaryOf()` 로 뽑는다. 대표사진이 없는 결함은 **건너뛴다** — `photoNo` 가 `null` 인 결함이 그것이다.
- 순서 = `NumberingResult.rows` 순서 그대로 → **사진번호 오름차순이 자동으로 보장된다.**
- 2열 × 3행 그리드, A4 세로. 페이지가 6으로 안 나눠떨어지면 마지막 페이지는 빈 칸을 남긴다(칸 크기 유지 — 사진만 커지면 보고서가 들쭉날쭉해진다).
- **캡션 (기획서 §6 예시 `"수직균열 0.2×0.5×3ea"` 을 그대로 따른다):**
  ```
  1행: 사진 {photoNo}
  2행: {위치}  {부재명}
  3행: {결함유형} {폭}×{길이m}×{개소}ea      ← WL 모드
       {결함유형} {면적}㎡×{개소}ea          ← AREA 모드
  ```
  - **길이는 m 로 환산해 적는다** (`lengthMm/1000`). 기획서 예시의 `0.5` 가 m 다 — mm 로 적으면 `0.2×2000×2ea` 가 되어 예시와 어긋난다.
  - `photo.caption` 이 있으면 3행 대신 그것을 쓴다(1차는 항상 null).
- 회전(`edits.rotate`)은 렌더 시 적용한다. `crop` 은 값이 있으면 적용하되 1차에는 항상 null.

### 3-7. 조사위치도

**캔버스 코어를 그대로 재사용한다 — 이것이 B16 의 존재 이유다.**

```
층 1개 = 페이지 1장
  1. Drawing 로드: needsCompose(d) 면 compositeUrl(), 아니면 renderBlobKey  ← 화면과 같은 경로
  2. 출력용 defects 사본:
       - render.sketch === false 면  { ...d, sketch: [] }        ← 문서는 건드리지 않는다
       - 필터·층 선택에서 빠진 결함은 배열에서 제외
  3. displayNumbers = ExportRun.mapping 의 no 를 문자열로       ← ⭐ seq 가 아니다 (B1 주입 지점)
  4. viewport = { zoom: mapScale, tx: pad, ty: pad }
  5. ops = buildBackground(input) + buildOverlay(input, buildScreens(input))
       - render.titleBlock === false → input.titleBlock = null
       - render.legend     === false → input.legend = null
       - render.memo       === false → input.memos = undefined
       - selection/hover/guides/preview/ghost/pending 은 전부 비운다   ← 선택 하이라이트가 출력에 새면 안 된다
  6. 오프스크린 <canvas> 에 prepare(dpr=1) + renderOps(ctx, ops, loaded)
  7. canvas.toBlob('image/png')  → 다운로드 / 인쇄 뷰의 <img>
```

**여백 규칙 (Phase 3 에서 "Phase 4 의 문제"로 보류했던 항목의 답):**
- **도곽이 켜져 있으면 여백을 추가하지 않는다.** A4 지면이 곧 페이지이므로 여백을 붙이면 도곽 밖에 흰 띠가 생긴다. 도면 밖으로 나간 라벨은 잘리고, **경고 목록으로 알린다**(`번호 3개가 도면 밖에 있습니다 — 위치를 옮겨 주세요`).
- **도곽이 꺼져 있으면** `buildScreens` 로 전체 바운딩 박스를 재서 **도면 밖으로 나간 만큼 자동 여백**을 준다. 상한은 도면 장변의 10%. 그래도 넘치면 클램프 + 경고.

- 출력 형식: **PNG 직접 다운로드**(주 경로) · **PDF 는 인쇄 뷰**(§4-9)에서 1페이지 1장.
- 파일명: `{용역표시명}_조사위치도_{층이름}.png`

---

## 4. 확정 스펙 — 화면 · 파일 형식

### 4-1. 출력 화면 P6 (`#/p/:pid/export`)

`router.ts` 에 `{ name: 'EXPORT'; projectId: string }` 을 추가한다. 진입점은 **용역 구성(P3) 상단 `[산출물 출력]` 버튼**과 캔버스 상단바 `[출력]`.

```
┌ 산출물 출력 ─────────────────────────────────────────────────┐
│ 1. 층 선택  — 누른 순서가 곧 번호 순서입니다                  │
│   [지하2층 ①–12] [지하1층 ⑬–31] [지상1층 ㉜–48] [옥탑]        │
│   [전체 선택] [지하→지상] [지상→지하] [해제]                  │
│                                                              │
│ 2. 번호 부여   ( ) 층별 1번부터   (•) 전체 이어서             │
│ 3. 포함 범위   [x] 전회차 미보수  [ ] 보수완료  [x] 미완성    │
│    조사구분    (•) 전체  ( ) 외관조사  ( ) 상세조사           │
│ 4. 도면 표시   [x] 자유그리기  [ ] 메모  [x] 도곽  [x] 범례   │
│                                                              │
│ ⚠ 미완성 결함 4건이 포함됩니다  [목록 보기]                   │
│ ⚠ 대표사진이 없는 결함 12건 — 사진첩에서 빠집니다 [목록 보기] │
│                                                              │
│ 5. 산출물   [x] 손상결함표(엑셀)  [x] 결함 리스트             │
│             [x] 사진첩            [x] 조사위치도              │
│                          대상 48건 · 사진 36장                │
│                                    [ 생성 ]                  │
├ 최근 출력 ──────────────────────────────────────────────────┤
│ 08-25 14:02 · 48건 · 전체연속   [같은 번호로 다시 받기]       │
└──────────────────────────────────────────────────────────────┘
```

- 층 칩의 `①–12` 는 `assignNumbers()` 를 **파라미터가 바뀔 때마다 다시 돌려** 실시간 갱신한다. 순수 함수라 비용이 없다.
- 칩을 다시 누르면 선택 해제되고, 뒤 칩들의 번호 구간이 즉시 밀린다.
- `[지하→지상]` / `[지상→지하]` 는 층 `sortOrder` 기준 일괄 선택 **보조 버튼**이지 모드가 아니다(§4-4 — 라디오 2개로는 실무를 못 푼다).
- 경고는 **막지 않는다.** D3 원문: "출력에서 자동 제외는 채택하지 않음 — 사용자가 모르고 누락시킬 위험".

### 4-2. 파일 이름 규칙

`{용역표시명}_{산출물}_{YYYYMMDD-HHmm}.{ext}` — 용역표시명은 `displayName.ts` 파생값(D6). 파일명 금지문자는 `_` 로 치환한다.

### 4-3. 다운로드 (`apps/web/src/export/download.ts`)

`URL.createObjectURL(blob)` → `<a download>` 클릭 → `revokeObjectURL`. 새 의존성 없음.
4종을 함께 뽑을 때는 파일을 **하나씩 순차 다운로드**한다. (ZIP 은 새 의존성이라 1차 제외 — 브라우저가 "여러 파일 다운로드 허용" 을 한 번 묻는 것으로 끝난다.)

### 4-8. 엑셀 생성 — 라이브러리 선정 규칙

필요 기능: **셀 병합**(손상규모 4열 · 층 섹션 행) · 테두리 · 열 너비 · 정렬 · 인쇄 반복 행 · 한글.

builder 는 아래 순서로 **설치해 보고 되는 첫 번째를 쓴다.** 고른 이유와 번들 크기를 `ASSUMPTIONS.md` 에 남긴다.

| 순위 | 후보 | 판단 근거 |
|---|---|---|
| 1 | **`write-excel-file`** (MIT) | 브라우저 우선 설계. 병합(`span`/`rowSpan`)·테두리·정렬·열 너비를 전부 지원하고 Node 폴리필이 필요 없다. 가장 가볍다 |
| 2 | `exceljs` (MIT) | 기능은 가장 넓다(인쇄 반복 행까지). 다만 Vite 에서 `buffer`/`stream` 폴리필이 필요할 수 있어 2순위 |
| 3 | `xlsx`(SheetJS 커뮤니티) | 병합은 되지만 **스타일이 유료판 전용**이라 테두리 없는 표가 나온다. 최후 수단 |
| — | **폴백: CSV(UTF-8 BOM)** | 위 셋이 전부 막히면 CSV 로 낸다. 병합 헤더는 2행 텍스트로 펼치고, 화면에 `엑셀 서식 없이 CSV 로 저장됩니다` 를 명시한다. **착수를 막지 않기 위한 안전장치다** |

**모든 라이브러리 호출은 `apps/web/src/export/xlsx.ts` 한 파일 안에서만 한다.**
```ts
export type SheetCell = { v: string | number | null; span?: number; rowSpan?: number;
                          align?: 'left'|'center'|'right'; bold?: boolean; border?: boolean;
                          numFmt?: string };
export async function writeXlsx(sheets: { name: string; cols: number[]; rows: SheetCell[][] }[]): Promise<Blob>;
```
행 데이터를 만드는 쪽(`project-core/export/*`)은 라이브러리를 전혀 모른다. 서식이 바뀌거나 라이브러리를 갈아치워도 고칠 곳이 한 곳이다.
**라이브러리는 `await import()` 로 동적 로드한다** — 출력 화면에 들어가기 전까지 번들에 실리지 않는다.

### 4-9. PDF 생성 — **브라우저 인쇄를 쓴다. PDF 라이브러리를 넣지 않는다** ⭐

| 방식 | 판단 |
|---|---|
| `jspdf` · `pdf-lib` | **채택 안 함.** 한글을 찍으려면 TTF 를 임베드해야 하고, 서브셋 없이 Noto Sans KR 을 넣으면 **4~8MB** 가 번들에 붙는다. 서브셋 툴체인을 빌드에 넣는 것은 이번 범위를 훨씬 넘는다 |
| **`window.print()` + CSS `@page`** | **채택.** 한글 폰트 문제가 **없다**(시스템 폰트). 페이지네이션을 CSS(`break-inside: avoid`)가 해 준다. 의존성 0. 사용자는 인쇄 대화상자에서 `PDF로 저장` 을 고른다 |

구현:
- 전용 인쇄 라우트 `#/p/:pid/export/print?run={runId}&kind={...}` 를 새 탭으로 연다. 화면 UI 없이 문서만 렌더하고 `onload` 뒤 `window.print()`.
- `print.css`: `@page { size: A4 portrait; margin: 12mm; }`, 조사위치도만 `landscape`.
- 버튼 라벨은 `[PDF 다운로드]` 가 아니라 **`[PDF로 인쇄]`** 로 하고, 옆에 `인쇄 대화상자에서 "PDF로 저장"을 선택하세요` 를 상시 표기한다. 사용자가 보게 될 동작이 기획서 문구와 다르므로 **Q32 로 남긴다(비차단)**.
- 인쇄 뷰가 쓰는 이미지(사진·조사위치도)는 전부 objectURL 이다. `print()` 전에 모든 `<img>` 의 `decode()` 를 기다린다 — 안 기다리면 빈 칸이 인쇄된다.

---

## 5. 작업 분해

**커밋 단위 = 표의 한 행.** `→` 는 선행 의존.

### 5-A. 공통 기반 (가장 먼저. 여기가 흔들리면 뒤가 전부 어긋난다)

| # | 작업 | 산출물 | 의존 | 난이도 |
|---|---|---|---|---|
| **T1** | 번호부여 순수 함수 + 단위테스트 | `project-core/src/export/numbering.ts`, `numbering.test.ts` | — | 중 |
| **T2** | 출력 파라미터·`ExportRun` 타입 | `project-core/src/export/params.ts`, `export/index.ts`, `index.ts` 재노출 | T1 | 하 |
| **T3** | `ExportRun` 저장소(meta KV) + 다운로드 헬퍼 | `apps/web/src/data/idb/exportRuns.ts`, `export/download.ts` | T2 | 하 |

> **커밋 1: `공통 번호부여 + ExportRun 스냅샷 기반`**

### 5-B. S5 — 사진 (사진첩의 선행)

| # | 작업 | 산출물 | 의존 | 난이도 |
|---|---|---|---|---|
| **T4** | `Photo` 타입 + 불변식 순수 함수 + 테스트 | `project-core/src/photo.ts`, `photo.test.ts` | — | 하 |
| **T5** | repo 인터페이스 확장 + IDB 사진 CRUD + Blob 3종 · **결함 삭제 시 연쇄 삭제** | `project-core/src/repo.ts`, `apps/web/src/data/idb/photos.ts`, `repo.ts` 수정 | T4 | 중 |
| **T6** | 파일 인입(디코드·리사이즈·썸네일·거절 규칙) | `apps/web/src/data/photoIngest.ts` | T5 | 중 |
| **T7** | 사진 섹션 UI(썸네일·정렬·대표·회전·교체·삭제+되돌리기) | `apps/web/src/ui/photos/PhotoSection.tsx`, `Inspector.tsx` 수정, CSS | T6 | 중 |
| **T8** | 미리보기 다이얼로그(확대·좌우 이동·액션·`준비 중` 자리) | `apps/web/src/ui/photos/PhotoPreviewDialog.tsx` | T7 | 하 |

> **커밋 2: `S5 사진 추가 완료`** — 여기서 커밋·푸시하고 넘어간다.

### 5-C. Phase 4 — 출력 (T1~T3 뒤에는 **서로 병렬 가능**)

| # | 작업 | 산출물 | 의존 | 병렬 | 난이도 |
|---|---|---|---|---|---|
| **T9** | 출력 화면 P6 — 층 칩(순서·번호구간 실시간)·옵션·경고·대상 집계 | `routes/Export.tsx`, `routes/export/FloorChips.tsx`, `OptionsPanel.tsx`, `router.ts` 수정 | T3 | 기준 | 중 |
| **T10** | 엑셀 어댑터(라이브러리 경계 1곳 + 동적 import + CSV 폴백) | `apps/web/src/export/xlsx.ts` | T3 | ✅ | 중 |
| **T11** | **손상결함표** — 열 정의·행 생성·층 섹션·머리말·원인 범례 | `project-core/src/export/damageTable.ts` + `.test.ts`, `apps/web/src/export/damageTableFile.ts` | T10, T9 | ✅ | 중 |
| **T12** | 인쇄 뷰 기반(라우트·`print.css`·이미지 decode 대기) | `apps/web/src/export/printView/*`, `router.ts` 수정 | T9 | ✅ | 중 |
| **T13** | **결함 리스트** — 축약 열 · 엑셀 + 인쇄 뷰 | `project-core/src/export/defectList.ts`, `printView/PrintDefectList.tsx` | T11, T12 | ✅ | 하 |
| **T14** | **조사위치도** — 오프스크린 렌더·여백·PNG·인쇄 뷰 | `apps/web/src/export/locationMap.ts`, `printView/PrintLocationMap.tsx` | T9, T12 | ✅ | 중 |
| **T15** | **사진첩** — 페이지 배치·캡션·6장 그리드 인쇄 뷰 | `project-core/src/export/photoBook.ts` + `.test.ts`, `printView/PrintPhotoBook.tsx` | **T8**, T12 | ⛔ S5 필요 | 중 |
| **T16** | 출력 이력 · `[같은 번호로 다시 받기]` · 데이터 변경 경고 | `routes/export/RunHistory.tsx` | T11·T13·T14·T15 중 1개 이상 | — | 하 |

> **커밋 3~7:** `손상결함표 완료` / `결함리스트 완료` / `조사위치도 완료` / `사진첩 완료` / `출력 이력·재현성 완료`

### 5-D. 의존 그래프 요약

```
T1 → T2 → T3 ─┬─→ T9 ─┬─→ T11 ─┬─→ T13
              │        ├─→ T12 ─┤
              └─→ T10 ─┘        ├─→ T14
                                └─→ T16
T4 → T5 → T6 → T7 → T8 ────────→ T15 ─→ T16
```
**S5(T4~T8) 와 공통기반(T1~T3) 은 서로 독립이다** — 어느 쪽을 먼저 해도 된다.
**사진첩(T15) 만이 S5 에 종속된다.** 손상결함표·결함리스트·조사위치도는 사진 없이도 완성된다
(사진번호 열은 전부 `—` 로 나오고, 사진이 들어오면 그대로 채워진다).

---

## 6. 지적 사항

| 유형 | 위치 | 내용 | 심각도 | 처리 |
|---|---|---|---|---|
| **누락** | §4-3 4단계 | `ExportRun` 을 "저장한다"고만 하고 **어디에** 저장하는지가 없다. S1 은 스토어를 안 만들었고 DB 버전 인상은 금지다 | 높음 | §3-3 에서 `meta` KV 재사용으로 해결. **차단 아님** |
| **누락** | §4-3 3단계 | 번호모드가 `층별리셋` 일 때 **사진번호도 리셋되는가**가 정의돼 있지 않다 | 중 | K6 — 모드를 그대로 따른다 |
| **누락** | §6 | 결함 리스트가 손상결함표와 **무엇이 다른지** 정의가 없다. 13열은 A4 세로에 안 들어간다 | 중 | §3-5 — 9열 축약 확정 |
| **누락** | §5 | `제2장 현장조사` 가 하드코딩이면 다른 보고서에서 틀린다 | 중 | `doc.headerLine2` 입력 필드로 노출 |
| **누락** | §5 | 동이 여러 개일 때 `위치` 열이 층 이름만으로는 구분 안 된다 | 중 | 동 2개 이상이면 `{동} {층}` |
| **누락** | §2-C | 사진 파일 용량·해상도 정책이 없다. 원본 그대로 500장이면 IndexedDB 할당량을 넘긴다 | 중 | K2 — 원본 보관 + 2048 렌더본 + 320 썸네일 3종 |
| **누락** | 전역 | **결함을 지울 때 사진이 남는다.** `deleteDefects` 에 연쇄 삭제가 없으면 고아 Blob 이 조용히 쌓인다 | 높음 | T5 에 포함 |
| **모호함** | §6 사진첩 | `"수직균열 0.2×0.5×3ea"` 의 `0.5` 가 mm 인지 m 인지 | 낮음 | **m** 으로 읽는다. 0.5mm 길이 균열은 실무에 없다 |
| **모호함** | §5 | 발생원인이 "숫자 코드 **또는** 텍스트" | 낮음 | F6 이 이미 코드 고정으로 확정. 코드 조회 실패 시에만 텍스트 |
| **모순** | 기획서 §6 vs 상세기획 §4-4 | 기획서는 `정렬 순서: 지하→지상 / 지상→지하` 라디오, 상세기획은 층 칩 순서 | 낮음 | 상세기획 우선(CLAUDE.md 규칙). 라디오는 **보조 버튼**으로 흡수 |
| **미결정** | §7-Q1 | 손상결함표 실물 서식 미확보 | 중 | 이미 "표준 13열로 진행" 확정. 열 정의를 `DAMAGE_COLUMNS` 한 배열에 모아 서식이 오면 그것만 고친다 |
| **미결정** | §2-C | 조사구분(`surveyKind`) 필터 — 폼에 노출이 없어 **모든 결함이 `EXTERIOR`** 다 | 낮음 | K8 — 필터 UI 는 두되 기본 `전체`. 실제로 걸리는 결함이 없어도 동작은 정상 |
| **함정 확인** | — | 번호 3종 분리 ✅ / 정규화 좌표 ✅ / 로컬 우선 ✅ / 마스터+연결 ✅ / 스타일 상속 ✅ / 면적 절사 `outputSize()` 재사용 ✅ / 층 sortOrder ✅ / 상태 3종 ✅ | — | 위반 없음 |

---

## 7. 사용자 확인 필요

**차단 질문 없음. 이번 범위는 리더 승인 없이 전부 착수 가능하다.**

`QUESTIONS.md` 에 기록한 **비차단** 질문: **Q32 · Q33 · Q34 · Q35**
`ASSUMPTIONS.md` 의 **K 계열(K1~K9)** 에 가정과 되돌리는 비용을 전부 남겼다.

| # | 요지 | 지금 정한 값 | 뒤집는 비용 |
|---|---|---|---|
| Q32 | PDF 를 라이브러리로 만들지 않고 **브라우저 인쇄**로 낸다 | `[PDF로 인쇄]` + 안내 문구 | 중 — PDF 라이브러리 + 한글 폰트 임베딩이 새 과제가 된다 |
| Q33 | 사진 **자르기·주석을 1차에서 뺀다** | 회전만 구현, 필드는 예약 | 낮음 — 필드가 이미 있어 UI 만 붙이면 된다 |
| Q34 | 층별리셋일 때 **사진번호도 층마다 리셋** | 번호모드를 따라간다 | 낮음 — `numbering.ts` 상수 1개 |
| Q35 | 손상결함표에서 뺀 4열로 **결함 리스트**를 구성 | 9열 축약 | 낮음 — `DEFECT_LIST_COLUMNS` 배열 1개 |

---

## 8. 직접 확인해주실 것 (구현 후 사용자 체크리스트)

- [ ] 사진 여러 장을 올린 뒤 **대표를 지웠을 때** 다음 장이 자동으로 대표가 되는가
- [ ] 새로고침 후 사진이 그대로 남고 썸네일이 뜨는가
- [ ] 세로로 찍은 사진이 **눕지 않고** 세로로 뜨는가 (EXIF 방향)
- [ ] 층 칩을 `지하1층 → 지상2층 → 지상1층` 순으로 눌렀을 때 번호가 그 순서로 매겨지는가
- [ ] 층별리셋으로 바꾸면 각 칩의 번호 구간이 전부 `①–` 로 바뀌는가
- [ ] 사진 없는 결함이 중간에 있을 때 **손상결함표 사진번호 열이 `—`** 이고, 그 뒤 사진번호가 하나 밀리지 않는가
- [ ] 4종을 함께 뽑았을 때 **손상결함표 사진번호 = 사진첩 사진번호 = 조사위치도 번호** 가 서로 맞는가
- [ ] `[같은 번호로 다시 받기]` 로 받은 파일이 처음 파일과 **번호가 완전히 같은가**
- [ ] 결함을 1건 추가한 뒤 재다운로드하면 경고가 뜨고, 번호는 그대로인가
- [ ] `자유그리기 끄기` / `메모 끄기` / `도곽 끄기` 가 조사위치도에 실제로 반영되는가
- [ ] 조사위치도에 **선택 하이라이트(파란 테두리)가 새어 나오지 않는가**
- [ ] 미완성 결함이 출력에 **포함되고 경고가 뜨는가** (자동 제외되면 D3 위반이다)
- [ ] 엑셀을 열었을 때 `손상규모` 병합 헤더와 `■ 층이름` 섹션이 제대로 보이는가
- [ ] `[PDF로 인쇄]` → 인쇄 미리보기에서 **한글이 깨지지 않고** A4 1페이지에 사진 6장이 들어가는가

---

## 변경 이력

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-08-25 | 최초 작성 | S5 + Phase 4 범위 검토 |
