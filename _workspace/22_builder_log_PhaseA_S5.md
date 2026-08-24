# 구현 로그 — Phase A (T1~T8): 공통 번호부여 · ExportRun · S5 사진

작성: builder · 2026-08-25
스펙: `_workspace/21_plan-reviewer_spec_S5_Phase4.md` §2 · §3-1~3-3 · §5-A/5-B · §6
기준 결정: `DECISIONS.md` D1~D9 · `ASSUMPTIONS.md` K1~K21 (뒤집은 것 없음)
브랜치: **`feat/s5-phase4-a`** (main 이 아니다 — 리더가 병합해야 한다)

---

## 완료

### 커밋 1 — `공통 번호부여 + ExportRun 스냅샷 기반` (T1~T3)

| 작업 | 파일 | 상태 |
|---|---|---|
| T1 번호부여 순수 함수 | `packages/project-core/src/export/numbering.ts` | ✅ |
| T1 단위테스트 20개 | `packages/project-core/test/numbering.test.ts` | ✅ |
| T2 출력 파라미터·`ExportRun` 타입 | `packages/project-core/src/export/params.ts` · `export/index.ts` · `index.ts` 재노출 | ✅ |
| T3 `ExportRun` 저장소(meta KV) | `apps/web/src/data/idb/exportRuns.ts` | ✅ |
| T3 다운로드 헬퍼 | `apps/web/src/export/download.ts` | ✅ |

### 커밋 2 — `S5 사진 추가 완료` (T4~T8)

| 작업 | 파일 | 상태 |
|---|---|---|
| T4 `Photo` 타입 + 불변식 순수 함수 | `packages/project-core/src/photo.ts` | ✅ |
| T4 단위테스트 21개 | `packages/project-core/test/photo.test.ts` | ✅ |
| T5 repo 인터페이스 확장 | `packages/project-core/src/repo.ts` (`ProjectRepo<TDefect, TMemo, TPhoto>`) | ✅ |
| T5 IDB 사진 CRUD · Blob 3종 | `apps/web/src/data/idb/photos.ts` · `idb/repo.ts` | ✅ |
| T5 **결함 삭제 시 사진 연쇄삭제** (지적사항 §6) | `idb/repo.ts::deleteDefects` · `purgeFloorIn` · `deleteBuilding` | ✅ |
| T6 파일 인입 파이프라인 | `apps/web/src/data/photoIngest.ts` | ✅ |
| T7 사진 상태·조작 훅 | `apps/web/src/data/usePhotos.ts` | ✅ |
| T7 사진 섹션 UI | `apps/web/src/ui/photos/PhotoSection.tsx` · `Inspector.tsx` · `CanvasRoute.tsx` · `styles.css` | ✅ |
| T8 미리보기 다이얼로그 | `apps/web/src/ui/photos/PhotoPreviewDialog.tsx` | ✅ |

---

## 핵심 설계 확인

**불변식 위반 없음.**

| # | 불변식 | 이번 라운드의 지킴 지점 |
|---|---|---|
| 1 | 좌표 0~1 정규화 | `PhotoEdits.crop` 을 픽셀이 아니라 정규화 사각형으로 선언 |
| 2 | 출력번호·사진번호 저장 안 함 | `assignNumbers()` 가 매번 계산. 저장되는 것은 `ExportRun.mapping`(그 출력 한 번의 스냅샷)뿐 |
| 3 | 로컬 DB 우선 | `usePhotos` 가 메모리를 먼저 바꾸고 저장은 뒤따라간다. UI 가 기다리지 않는다 |
| 8 | 결함당 대표 정확히 1장 | `normalizePhotos()` **읽기 정규화**(K16). `listPhotos`·`listPhotosOfDefect`·`loadBundle` 이 전부 통과시킨다 |

**DB 마이그레이션 0.** `DB_VERSION` 은 1 그대로다.
- `photos` 스토어와 `by_project`/`by_defect` 인덱스는 v1 에 이미 있었다
- `ExportRun` 은 `meta` KV 를 `exportRun:{id}` 키로 재사용한다 (K2)

**경계 유지.**
- `numbering.ts` 는 `canvas-core` 를 import 하지 않는다 — 로컬 최소 타입 `NumberingDefect`(구조적 타이핑)
- `photo.ts` 는 `Blob`·`File`·`URL` 을 참조하지 않는다. `blobKey: string` 뿐
- 사진 UI 는 `ui/photos/` 에 뒀다. `ui/defectForm/*` 에 넣지 않았다 (K15)
- `Inspector` 는 사진을 **슬롯(`photoSlot: ReactNode`)** 으로 받는다 — `data/*` 를 import 하지 않는다

---

## Phase B(T9~)가 알아야 할 것 — 실제 export 이름·경로

스펙 문서와 **다르게** 정해진 것만 적는다. 나머지는 스펙 그대로다.

| 스펙 표기 | 실제 | 이유 |
|---|---|---|
| `numbering.test.ts` (src 옆) | `packages/project-core/test/numbering.test.ts` | 기존 프로젝트 관행(테스트는 전부 `test/`). `photo.test.ts` 도 같다 |
| `assignNumbers(defects, params, ctx)` 의 `ctx` **필수** | `ctx?: Partial<NumberingContext>` — **선택** | 사진이 아직 없을 때도 부를 수 있어야 한다. 빠진 집합은 빈 Set 으로 본다 |
| `DEFAULT_EXPORT_PARAMS: (floorIds) => ExportParams` | 같음. 단 **함수 선언**이라 값처럼 import 한다 | — |
| `putExportRun(run)` 등 | 전부 **첫 인자가 `db: IDBDatabase`** — `putExportRun(db, run)` · `listExportRuns(db, projectId)` · `getExportRun(db, id)` · `pruneExportRuns(db, projectId, keep?)` | `IdbProjectRepo` 의 메서드가 아니라 모듈 함수다. `useAppData().storage` 에는 `repo` 만 있고 `db` 가 없으므로 **Phase B 는 `openDb()` 로 `db` 를 얻거나 `repo` 에 위임 메서드를 추가해야 한다** ⚠️ |
| — | `appendArtifact(db, runId, artifact)` · `deleteExportRun` · `deleteExportRunsOfProject` 추가 | 이력 화면(T16)이 쓴다 |
| — | `diffExportRun(run, currentDefectIds)` → `{ added, removed }` | §3-3 "그 사이 결함이 추가/삭제됨" 경고의 재료 |
| — | `formatFloorRange(r)` → `'1–12'` / `'—'` | 층 칩 표기(T9) |
| — | `defaultNumberingParams(floorIds?)` | `ExportParams` 없이 번호만 미리 볼 때 |
| `download.ts` | `downloadBlob` · `downloadSequential` · `buildFileName` · `sanitizeFileName` · `stampFor` · `csvBlob` | `csvBlob` 은 §4-8 CSV 폴백용으로 미리 넣어 뒀다 |
| — | `project-core` 의 `defectIdsWithPrimaryPhoto(photos)` | `assignNumbers(…, { hasPhoto })` 에 그대로 넣는 재료 |
| — | `usePhotos().defectsWithPhoto` | 출력 화면이 쓸 수 있게 이미 노출돼 있다 (지금은 미사용) |
| — | `ProjectBundle` 에 **`photos: Photo[]` 가 추가**됐다 | 사진첩(T15)이 결함마다 저장소를 두드리지 않아도 된다. 이미 읽기 정규화를 통과한 상태다 |

**사진첩(T15) 이 쓸 것:** `primaryOf(photos)` · `groupPhotosByDefect(photos)` · `displaySize(photo)` ·
`photo.renderBlobKey`(장변 2048 JPEG) · `photo.edits.rotate`. `crop` 은 항상 null 이고 `annotations` 는 항상 빈 배열이다.

---

## 검증한 것

| 항목 | 결과 |
|---|---|
| 타입 검사 (`npm run typecheck` — canvas-core · project-core · web) | ✅ 통과 |
| 단위 테스트 (`npm test`) | ✅ **181개 통과** (기존 140 + 신규 41: numbering 20 · photo 21) |
| 프로덕션 빌드 (`npm run build`) | ✅ 통과 — `430KB / gzip 129KB`, CSS `55KB / gzip 9.9KB` |
| ui-quality §7-1 코드 점검 | 삭제=되돌리기 토스트 10초 ✅ · 비활성 버튼에 `title` 사유 ✅ · 빈 상태 문구 ✅ · `aria-label`·`role="menu"`·Esc 닫기 ✅ · 예약색 미사용(사진 UI 는 `--accent` 계열만) ✅ |
| 브라우저 실행 | ❌ **미검증** — 규칙대로 서버를 띄우지 않았다 |

---

## 직접 확인해주실 것

캔버스에서 결함을 하나 고르면 우측 패널 맨 아래에 `사진 0장 [+ 사진 추가]` 가 보인다.

- [ ] `+ 사진 추가` → 파일 여러 장 선택 → **썸네일이 뜨고 첫 장에 `대표` 배지**가 붙는가
- [ ] **새로고침 후에도** 사진이 그대로 있고 썸네일이 뜨는가
- [ ] **세로로 찍은 사진이 눕지 않고 세로로** 뜨는가 (EXIF 방향 — K5)
- [ ] 썸네일을 **드래그**해 순서를 바꾸면 그대로 유지되는가 (새로고침 후에도)
- [ ] 썸네일 **우클릭** / `⋯` → 메뉴 5개(`대표로 지정`·`왼쪽 90°`·`오른쪽 90°`·`교체…`·`삭제`)가 뜨는가
- [ ] ⭐ **대표사진을 삭제하면 다음 장이 자동으로 대표**가 되는가
- [ ] 삭제 뒤 **10초 안에 `[되돌리기]`** 를 누르면 사진이 되살아나는가
- [ ] 되돌리지 않고 10초를 넘긴 뒤 **새로고침하면 정말 사라져 있는가**
- [ ] 썸네일 클릭 → 큰 미리보기. **← → 키**로 좌우 이동, **Esc** 로 닫히는가
- [ ] 미리보기의 `자르기` · `주석` 버튼이 **비활성 + `준비 중`** 으로 보이는가 (Q33 대로 미구현)
- [ ] 90° 회전이 **썸네일과 큰 미리보기 양쪽에** 반영되는가
- [ ] `교체…` 로 다른 파일을 고르면 **순서와 대표 지정이 그대로 유지**되는가
- [ ] HEIC 파일을 올려 보면 **`HEIC 미지원` 인라인 경고**가 뜨고 나머지 사진은 등록되는가
- [ ] 30MB 넘는 사진을 섞어 올리면 그것만 거절되고 **나머지는 등록**되는가 (부분 성공)
- [ ] ⭐ **사진이 붙은 결함을 삭제한 뒤** 새로고침 → 사진이 남아 있지 않은가 (연쇄삭제 · 지적사항 §6)
- [ ] 전회차(보라) 결함을 고르면 사진 섹션이 **전부 비활성**인가

---

## 알려진 한계 · 남은 것

| # | 내용 | 판단 |
|---|---|---|
| 1 | **`자르기`·`주석` 미구현.** 버튼만 `준비 중`. `edits.crop`·`annotations` 필드는 예약됨 | K3 · Q33 그대로 |
| 2 | **EXIF 촬영시각·기기 미파싱.** `takenAt = file.lastModified`, `device = null` | K5 그대로. 방향은 `<img>` 디코드로 공짜 해결 |
| 3 | **캡션 수동 입력 UI 없음.** `photo.caption` 은 항상 null → 사진첩이 파생 캡션을 쓴다 | 스펙 §2-1 "1차는 UI 없이 예약만" |
| 4 | **사진 되돌리기 10초 안에 브라우저를 강제 종료**하면 삭제가 확정되지 않고 사진이 되살아난다 | `beforeunload` 로 확정을 시도하지만 강제 종료·크래시는 못 막는다. 데이터가 **남는** 쪽이라 안전한 실패 |
| 5 | **`exportRuns.ts` 는 `db: IDBDatabase` 를 직접 받는다.** `useAppData()` 는 `repo` 만 준다 | Phase B 가 `openDb()` 를 부르거나 `IdbProjectRepo` 에 위임 메서드 4개를 추가해야 한다. 위 표에 ⚠️ 로 표시 |
| 6 | **`apps/web` 에는 테스트 러너가 없다** (J5 와 같은 상황) | 사진 UI·인입·훅은 타입 검사 + 사용자 확인으로 덮는다. 위험한 로직(불변식 #8·번호부여)은 전부 `project-core` 로 빼서 그 자리에서 검증했다 |
| 7 | 사진 `sortOrder` 재부여는 **한 결함 안에서만** 일어난다 | 결함 간 이동은 스펙에 없다 |
| 8 | T9~T16(출력 화면·엑셀·4종 산출물)은 손대지 않았다 | 지시대로 Phase B 소관 |

---

## 이번 라운드에서 새로 세운 가정

`ASSUMPTIONS.md` **L 계열**에 기록했다 (L1~L7). 전부 비차단이고 K 계열을 뒤집지 않는다.
새로 남긴 질문은 없다 — 스펙 §7 이 이미 Q32~Q35 로 정리해 뒀고, 구현 중 그 밖의 모순을 만나지 않았다.

---

# 검수 반영 (커밋 3) — 2026-08-25

검수: `_workspace/23_code-reviewer_findings_PhaseA.md` (조건부 통과 — 심각 1 · 보통 2 · 경미 4)

## 심각 1 — 결함 삭제 되돌리기가 사진을 잃던 문제 ⭐

**무엇이 틀렸나.** 지적사항 §6("결함을 지울 때 사진이 남는다")만 보고 `deleteDefects` 안에
즉시 연쇄삭제를 넣었는데, **이 프로젝트에서 결함 삭제는 Ctrl+Z 로 되돌릴 수 있는 조작**이다.
화면도 `되돌리기로 되살릴 수 있습니다` 라고 약속한다. 결과:
250ms 뒤 flush → 사진 레코드·Blob 영구 삭제 → Ctrl+Z → **결함만 돌아온다.**
메모리 목록은 그대로라 화면에는 사진이 남아 보이고, 사라진 것은 새로고침해야 안다.

**고친 방식 — 고아의 수명을 한 세션으로 묶는다.**

| 파일 | 변경 |
|---|---|
| `apps/web/src/data/idb/repo.ts` `deleteDefects` | 사진 연쇄삭제 **제거**. 트랜잭션도 `[defects]` 단독으로 되돌림 |
| `apps/web/src/data/idb/repo.ts` (신규) | **`purgeOrphanPhotos(projectId): Promise<number>`** — `by_project` 로 사진을 훑어 `defectId` 의 결함이 없는 것만 레코드+Blob 정리. 결함 조회는 `Map` 캐시(같은 결함 사진 N장) |
| `apps/web/src/routes/CanvasRoute.tsx` 묶음 로드 | `setLoadedPhotos(...)` **바로 뒤**에 `void guard(() => storage.repo.purgeOrphanPhotos(projectId))`. 결과를 기다리지 않는다 — 실패해도 캔버스는 뜬다 |
| `packages/project-core/src/repo.ts` | `ProjectRepo` 사진 섹션 주석을 개정 내용으로 교체 (다음 사람이 옛 주석을 믿고 또 넣지 않게) |
| `_workspace/ASSUMPTIONS.md` K13 | **개정** — 되돌릴 수 있는 삭제/없는 삭제를 나눈다 |

**`deleteFloor` · `deleteBuilding` 은 손대지 않았다.** 확인 대화상자만 있고 되돌리기가 없는
조작이므로 즉시 연쇄삭제가 맞다. `purgePhotosOfDefectsIn` 도 그대로 남아 두 경로가 계속 쓴다.

**§6 의 목적은 그대로 달성된다** — 새로고침하면 되돌리기 스택도 함께 죽으므로,
용역을 여는 시점에 지우는 사진은 **아무도 되살릴 수 없는 것**뿐이다.

## 보통 2 — Firefox 에서 썸네일 드래그가 시작되지 않던 문제

`PhotoSection.tsx` — `onDragStart` 에 `effectAllowed = 'move'` + `setData('text/plain', p.id)` 추가,
`onDragOver` 에 `dropEffect = 'move'` 추가. 같은 저장소의 기존 드래그 정렬
(`ProjectSetup.tsx:1318` · `settings/parts.tsx:270`)과 같은 모양으로 맞췄다.
`setData` 가 없으면 Firefox 는 드래그를 시작조차 하지 않고, Chrome 은 커서가 `copy`(＋)로 뜬다.

## 보통 3 — 미리보기가 떠 있어도 `Delete` 가 캔버스 결함을 지우던 문제

`PhotoPreviewDialog.tsx` — capture 단계 keydown 에서 `Escape` 만 막던 것을 넓혔다.
`ArrowLeft/Right` 도 `stopPropagation` 하고, `CANVAS_SHORTCUT_KEYS`
(`Delete`·`Backspace`·`0`·`+`·`=`·`-`·`_`)와 `Ctrl/⌘+Z/Y` 는 `stopPropagation` + `preventDefault`.

하단에 빨간 `[삭제]` 버튼이 있어 `Delete` 를 누르는 것이 자연스러운 화면인데,
그 키가 캔버스로 새면 **사진이 아니라 선택된 결함이 지워졌다.**
`Delete` 를 사진 삭제에 연결하지는 않았다(오조작 위험) — **막기만** 했다.

## 경미 — 이번에 한 것 / 안 한 것

| # | 내용 | 처리 |
|---|---|---|
| 4 | `Photo.mime`·`byteSize` 는 원본 기준, `width`/`height` 는 렌더본 기준 | **필드 주석만 추가**(동작 변경 0). 렌더본은 원본이 PNG 여도 항상 JPEG 이라 T15 가 `mime` 으로 분기하면 조용히 틀린다 |
| 5 | 삭제 대기 10초 중 DB 에 대표가 2장인 순간 | 코드 변경 없음(읽기 정규화가 덮는다). **`ASSUMPTIONS.md` L4 문구를 사실에 맞게 정정** |
| 6 | `exportRuns.ts` 가 `db` 를 직접 받음 | 이번 범위 밖. **Phase B 는 `openDb()` 를 화면에서 부르지 말고 `IdbProjectRepo` 에 위임 메서드 5개를 얹어야 한다** — 연결이 두 개가 되면 `deleteDatabase`·버전 업그레이드가 막힌다 |
| 7 | `deleteExportRunsOfProject` 미사용 | 용역 삭제가 소프트 삭제뿐이라 지금은 새는 곳이 없다. 하드 삭제가 생기면 연결 |

## 재검증

| 항목 | 결과 |
|---|---|
| 타입 검사 | ✅ 통과 |
| 단위 테스트 | ✅ **181개 통과** (신규 테스트 없음 — 고친 3건은 전부 웹 어댑터·UI 라 `apps/web` 에 러너가 없다. 한계 #6 그대로) |
| 프로덕션 빌드 | ✅ 통과 · `430.82KB / gzip 129.62KB` |

## 체크리스트 추가 항목

앞의 `## 직접 확인해주실 것` 에 아래 3개를 더한다.

- [ ] ⭐ **사진이 붙은 결함을 삭제 → 곧바로 `Ctrl+Z`** → 결함이 돌아오고, **새로고침해도 사진이 그대로** 있는가
- [ ] 결함을 삭제하고 **되돌리지 않은 채 새로고침** → 그 사진이 사라져 있는가 (고아 청소)
- [ ] 사진 미리보기를 열고 **`Delete` 키** → 아무 일도 일어나지 않는가 (뒤에서 결함이 지워지면 안 된다)
- [ ] (Firefox 를 쓴다면) 썸네일 **드래그 정렬**이 되는가
