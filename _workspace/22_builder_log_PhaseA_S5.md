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
