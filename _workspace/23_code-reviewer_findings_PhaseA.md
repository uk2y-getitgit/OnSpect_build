# 검수 결과 — Phase A (T1~T8) · 브랜치 `feat/s5-phase4-a`

검수: code-reviewer · 2026-08-25
대상: `git diff main...feat/s5-phase4-a` (커밋 2개 · 25파일 · +4171)
기준: `_workspace/21_plan-reviewer_spec_S5_Phase4.md` §2 · §3-1~3-3 · §5-A/5-B · §6 ·
`DECISIONS.md` D1~D9 · `ASSUMPTIONS.md` K1~K21 · L1~L7 · `CLAUDE.md` 불변식·경계 규칙

## 판정

**조건부 통과** — 심각 **1건**을 고치면 통과. 나머지는 병합 후 처리해도 된다.

번호부여(T1~T3)와 사진 도메인 코어(T4)는 **그대로 통과**다. 지적은 전부 웹 어댑터·UI 쪽이다.

---

## 먼저 확인한 것 (지시 1·7)

| 확인 항목 | 결과 | 근거 |
|---|---|---|
| **DB_VERSION 유지 · 마이그레이션 0** | ✅ | `db.ts:15` `DB_VERSION = 1` 그대로. `photos` 스토어와 `by_project`/`by_defect` 인덱스는 v1 스키마(`db.ts:153~155`)에 **이미 있었다**. `createObjectStore`/`createIndex` 추가 0건. `ExportRun` 은 `meta` KV 를 `exportRun:{id}` 키로 재사용 — 레코드 추가지 스키마 변경이 아니다 (K2 그대로) |
| 타입 검사 | ✅ 재실행 통과 | canvas-core · project-core · web 전부 |
| 단위 테스트 | ✅ 재실행 통과 | **181개** (10파일). `numbering.test.ts` 20 · `photo.test.ts` 21 — builder 보고와 일치 |
| 프로덕션 빌드 | ✅ 재실행 통과 | `430.07KB / gzip 129.42KB`, CSS `55.01KB / gzip 9.86KB` — 보고와 일치 |
| 경계 (canvas-core `window`/`document` 금지) | ✅ | 신규 코어 파일 3개(`numbering.ts`·`params.ts`·`photo.ts`)에 DOM·`Blob`·`File`·`URL`·시간·난수 참조 0. `numbering.ts` 는 `canvas-core` 를 import 하지 않고 로컬 `NumberingDefect` 로 구조적 타이핑 (K14 그대로) |
| 경계 (`ui/defectForm` import 금지) | ✅ | 사진 UI 는 `ui/photos/` 에 있고, `Inspector` 는 `photoSlot: ReactNode` 슬롯으로만 받는다 — `data/*` 를 import 하지 않는다 (L3) |

---

## 지적 사항

### [심각] 1. 결함 삭제 연쇄삭제가 **되돌리기(Ctrl+Z)를 데이터 손실로 만든다**

- 파일: `apps/web/src/data/idb/repo.ts:421-428`
  · `apps/web/src/routes/CanvasRoute.tsx:279` · `apps/web/src/store.ts:209-233`
  · `apps/web/src/routes/CanvasRoute.tsx:848-849`

**문제**

지적사항 §6 대로 `deleteDefects` 에 사진 연쇄삭제가 들어갔다(`repo.ts:426`). 구현 자체는 맞다 —
`purgePhotosOfDefectsIn` 이 `by_defect` 로 찾아 레코드와 Blob refCount 를 같은 트랜잭션에서 정리한다.

그런데 이 프로젝트에서 **결함 삭제는 되돌릴 수 있는 조작**이다. 그리고 그것을 화면이 사용자에게
명시적으로 약속하고 있다:

```
CanvasRoute.tsx:848-849
'마지막 남은 표기입니다. 지우면 결함 1건이 함께 삭제됩니다. 되돌리기로 되살릴 수 있습니다.'
'결함 1건이 삭제됩니다. 되돌리기로 되살릴 수 있습니다.'
```

경계면이 어긋난 지점은 이렇다.

| | 생산자 | 소비자 |
|---|---|---|
| 결함 | `store.ts:209 UNDO` → 같은 `id` 로 되살아나고 `recordCommandWrites` 가 **upsert** 로 다시 쓴다 | 복구됨 ✅ |
| 사진 | `CanvasRoute.tsx:279` → 250ms 뒤 `deleteDefects` → `repo.ts:426` **레코드·Blob 영구 삭제** | 복구 경로 **없음** ❌ |

**재현**

1. 사진 3장이 붙은 결함을 선택하고 삭제한다
2. 250ms 뒤 `flush` 가 `deleteDefects` 를 부른다 → 사진 3장 레코드 + Blob 9개(원본·렌더·썸네일)가 **영구 삭제**된다.
   `purgePhotoRecordsIn` 이 `revokeUrl(k)` 까지 부르므로 objectURL 도 끊긴다
3. `Ctrl+Z` — 화면이 `되돌렸습니다` 를 띄우고 결함이 돌아온다
4. **화면에는 사진 3장이 그대로 보인다** — `usePhotos` 의 메모리 목록은 손대지 않았기 때문이다.
   썸네일은 revoke 된 URL 이라 깨져 보이거나(브라우저에 따라) 캐시로 잠시 멀쩡해 보인다
5. 새로고침 → 사진 3장이 **사라져 있다.** 원본 파일까지 없어서 복구 불가

**최악은 3~4단계다.** 사용자가 "복구됐다"고 믿는 시점과 실제로 잃은 시점이 달라서,
잃은 것을 알아차리는 것이 며칠 뒤 보고서를 뽑을 때다.

`deleteFloor` / `deleteBuilding` 은 Ctrl+Z 경로가 아니므로(확인 대화상자 + 되돌리기 없음) 그대로 둬도 된다.
문제는 **`deleteDefects` 하나뿐**이다.

**수정 (권장안 — orphan sweep)**

§6 의 목적("고아 사진·고아 Blob 이 조용히 쌓이지 않게")을 그대로 지키면서 되돌리기를 살린다.
고아의 수명을 **한 세션**으로 묶는다 — 새로고침하면 되돌리기 스택도 같이 죽으므로,
그 시점 이후로는 아무도 그 사진을 되살릴 수 없다.

1. `apps/web/src/data/idb/repo.ts:421-428` — `deleteDefects` 를 원래대로 되돌린다.

```ts
  /**
   * ⚠️ **여기서 사진을 지우지 않는다.** 결함 삭제는 Ctrl+Z 로 되돌릴 수 있고(`store.ts::UNDO`),
   *    사진 Blob 을 지우면 결함만 돌아오고 사진은 영원히 못 돌아온다.
   *    고아 사진은 `purgeOrphanPhotos()` 가 용역을 열 때 쓸어 담는다 —
   *    새로고침하면 되돌리기 스택도 같이 죽으므로 그때는 되살릴 사람이 없다.
   */
  async deleteDefects(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const tx = this.db.transaction(STORE.defects, 'readwrite');
    const store = tx.objectStore(STORE.defects);
    for (const id of ids) store.delete(id);
    await txDone(tx);
  }
```

2. 같은 파일 사진 섹션에 고아 청소 메서드를 추가한다. `purgePhotoRecordsIn` 을 그대로 쓴다.

```ts
  /**
   * 주인 없는 사진을 쓸어 담는다 — 결함이 지워졌는데 Ctrl+Z 로 안 돌아온 것들.
   * 용역을 **열 때 한 번** 부른다. 그 시점엔 되돌리기 스택이 이미 비어 있다.
   */
  async purgeOrphanPhotos(projectId: string): Promise<number> {
    const tx = this.db.transaction([STORE.photos, STORE.defects, STORE.blobs], 'readwrite');
    const rows = await getAllByIndex<Photo>(tx.objectStore(STORE.photos), 'by_project', projectId);
    const xs = tx.objectStore(STORE.defects);
    const orphans: Photo[] = [];
    const seen = new Map<string, boolean>();
    for (const p of rows) {
      let alive = seen.get(p.defectId);
      if (alive === undefined) {
        alive = (await reqAsPromise<Defect | undefined>(xs.get(p.defectId))) !== undefined;
        seen.set(p.defectId, alive);
      }
      if (!alive) orphans.push(p);
    }
    await purgePhotoRecordsIn(tx, orphans);
    await txDone(tx);
    return orphans.length;
  }
```

`purgePhotoRecordsIn` 은 `idb/photos.ts` 에서 이미 export 돼 있다. import 에 추가만 하면 된다.
`purgePhotosOfDefectsIn` 은 `purgeFloorIn`·`deleteBuilding` 이 계속 쓰므로 **지우지 않는다.**

3. `apps/web/src/routes/CanvasRoute.tsx:136` 부근 — 묶음 로드 직후 한 번 부른다.
   실패해도 화면이 멈추면 안 되므로 결과를 기다리지 않는다.

```ts
      setLoadedPhotos(b.photos.length > 0 ? b.photos : EMPTY_PHOTOS);
      // 지난 세션에 결함과 함께 지워졌어야 할 고아 사진을 이때 쓸어 담는다 (되돌리기 스택은 이미 비었다)
      void guard(() => storage.repo.purgeOrphanPhotos(projectId));
```

> ⚠️ 3번은 `b.photos` 를 화면에 넘긴 **뒤에** 돌아야 한다. `loadBundle` 이 이미
> 고아 사진까지 읽어 오지만(주인 없는 `defectId` 로 묶여 있을 뿐) 어느 결함에도 안 붙으므로 화면에는 안 보인다.

4. `packages/project-core/src/repo.ts` 의 `ProjectRepo` 주석(현재 "⚠️ 결함을 지우면 그 결함의 사진도
   함께 지워진다 (`deleteDefects` · K13)")을 위 내용으로 고친다. 지금 그대로 두면 다음 사람이
   인터페이스 주석을 믿고 또 넣는다.

5. `ASSUMPTIONS.md` **K13 을 갱신**한다 — "`deleteDefects` 는 Ctrl+Z 되돌리기 대상이라 즉시 연쇄삭제하지
   않고 용역 열 때 고아 청소로 처리한다. `deleteFloor`·`deleteBuilding` 은 되돌리기가 없으므로 즉시 연쇄삭제."

**대안(비권장)**: 연쇄삭제를 그대로 두고 `CanvasRoute.tsx:848-849` 의 문구를
`사진 N장도 함께 삭제되며 되돌리기로 복구되지 않습니다` 로 바꾸는 것.
거짓말은 없어지지만 **데이터는 여전히 잃는다.** 채택하려면 사용자 확인이 필요하다.

---

### [보통] 2. 썸네일 드래그 정렬이 Firefox 에서 시작조차 안 된다 — 이 프로젝트의 기존 패턴과도 어긋난다

- 파일: `apps/web/src/ui/photos/PhotoSection.tsx:178`, `183-187`

**문제**

`onDragStart={() => setDragId(p.id)}` 가 `e.dataTransfer` 를 전혀 만지지 않는다.
HTML5 DnD 는 `dragstart` 에서 `dataTransfer.setData()` 가 호출되지 않으면 **Firefox 가 드래그를 시작하지 않는다.**

같은 저장소의 기존 드래그 정렬 두 곳은 **둘 다 제대로 하고 있다** — 이번 구현만 빠졌다:

```
apps/web/src/routes/ProjectSetup.tsx:1318-1320   effectAllowed = 'move' + setData('text/plain', item.id)
apps/web/src/routes/settings/parts.tsx:270-272   동일
apps/web/src/routes/settings/parts.tsx:255       onDragOver 에서 dropEffect = 'move'
```

**재현**: Firefox 에서 썸네일을 잡아 끈다 → 아무 일도 일어나지 않는다.
Chrome 에서도 `dropEffect` 를 안 세워 드래그 커서가 `move` 가 아니라 `copy`(＋)로 뜬다.

**수정** — 기존 두 곳과 같은 모양으로 맞춘다.

```tsx
  onDragStart={(e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', p.id); // 없으면 Firefox 가 드래그를 시작하지 않는다
    setDragId(p.id);
  }}
  onDragOver={(e) => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverId(p.id);
  }}
```

---

### [보통] 3. 미리보기 다이얼로그가 열려 있어도 캔버스 단축키가 살아 있다 — `Delete` 가 결함을 지운다

- 파일: `apps/web/src/ui/photos/PhotoPreviewDialog.tsx:58-70` ↔ `apps/web/src/canvas/CanvasView.tsx:269-285`

**문제**

`CanvasView` 는 `window` 에 keydown 을 걸고 `Delete`·`Backspace`·`Ctrl+Z`·`0`·`+`·`-` 를 처리한다.
차단 조건은 `isTypingTarget(e.target)` 하나뿐이다(`CanvasView.tsx:271`).

`PhotoPreviewDialog` 는 capture 단계로 듣지만 `Escape` 만 `stopPropagation()` 하고
(`PhotoPreviewDialog.tsx:60-63`) 나머지는 그대로 흘려보낸다. 열릴 때 포커스는 `닫기` 버튼이라
`isTypingTarget` 에도 안 걸린다.

**재현**: 사진 미리보기를 열고 `Delete` 를 누른다 → 사진이 아니라 **캔버스에서 선택된 결함이 삭제된다.**
다이얼로그 하단에 빨간 `삭제` 버튼이 있으므로 `Delete` 키를 누르는 것은 자연스러운 조작이다.
지적 1을 고치기 전이라면 이 한 번으로 그 결함의 사진 전부가 함께 사라진다.

`Ctrl+Z`(캔버스 되돌리기가 뒤에서 돈다), `+`/`-`/`0`(도면 확대·축소가 뒤에서 돈다)도 같다.

> 참고: `ui/Overlays.tsx:97-105` 의 확인 대화상자도 같은 구조라 **이 브랜치가 새로 만든 결함은 아니다.**
> 다만 사진 다이얼로그는 `Delete` 를 유도하는 화면이라 실제로 밟을 확률이 훨씬 높다.

**수정** — 다이얼로그가 열려 있는 동안 캔버스로 갈 키를 모두 막는다.

```tsx
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key === 'ArrowLeft')  { e.stopPropagation(); onPrev(); return; }
      if (e.key === 'ArrowRight') { e.stopPropagation(); onNext(); return; }
      // 모달이 떠 있는 동안 캔버스 단축키가 뒤에서 도는 것을 막는다.
      // 특히 Delete — 사진이 아니라 결함이 지워진다
      if (['Delete', 'Backspace', '0', '+', '=', '-', '_'].includes(e.key) ||
          ((e.ctrlKey || e.metaKey) && 'zZyY'.includes(e.key))) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
```

`Delete` 를 사진 삭제에 연결할지는 별개 판단이다(오조작 위험). 지금은 **막기만** 하면 된다.

---

### [경미] 4. `Photo.mime` · `byteSize` 는 원본 기준인데 `width`/`height` 는 렌더본 기준이다

- 파일: `apps/web/src/data/photoIngest.ts:189-193`

`width`/`height` 는 `renderFit`(장변 2048 이하)이고 `mime`/`byteSize` 는 원본 파일 값이다.
스펙 §2-1 이 `width`/`height` 만 "렌더 래스터 픽셀"로 못박아 뒀으므로 **스펙 위반은 아니다.**
다만 사진첩(T15)이 `byteSize` 로 페이지 무게를 가늠하거나 `mime` 으로 분기하면 조용히 틀린다
(렌더본은 원본이 PNG 여도 항상 JPEG 다). 필드 주석에 "원본 기준"이라고 한 줄 남기면 충분하다.

### [경미] 5. 사진 삭제 대기(10초) 중 저장소에 대표가 2장이 되는 순간이 있다

- 파일: `apps/web/src/data/usePhotos.ts:295-330`

대표 A 를 지우면 `applyList` 가 승계된 B 를 `isPrimary=true` 로 **즉시 저장**하지만(`usePhotos.ts:179`)
A 의 레코드는 10초 동안 그대로 남는다 → 그 사이 DB 에는 대표가 2장이다.

읽기 정규화(K16)가 있으므로 **화면·출력이 보는 목록은 언제나 정확히 1장**이고 불변식 #8 은 지켜진다.
실제 손상은 없다. 다만 L4 의 "되돌리기가 저장소를 다시 쓰지 않는다"는 서술은 정확하지 않다 —
승계된 B 는 즉시 쓰이고, 되돌릴 때 A 도 `upsertPhotos` 로 다시 쓰인다.
`ASSUMPTIONS.md` L4 문구만 사실에 맞게 다듬으면 된다.

### [경미] 6. `exportRuns.ts` 가 `db: IDBDatabase` 를 직접 받는 것 (L1·builder 한계 #5)

- 파일: `apps/web/src/data/idb/exportRuns.ts` 전역

**repo 캡슐화 경계를 깨지 않는다.** 같은 폴더의 `blobs.ts`·`photos.ts` 가 이미 같은 모양이고
(`putBlobIn(store, …)` · `purgePhotosOfDefectsIn(tx, …)`), 이들은 전부 **`idb/` 내부 모듈**이다.
경계는 `apps/web/src/data/idb/` 밖에서 `IDBDatabase` 를 잡을 때 깨진다.

Phase B 가 쓰기 편한 형태냐가 남는데, `useAppData().storage` 에는 `repo` 만 있고 `db` 가 없다.
Phase B 가 `openDb()` 를 따로 부르면 **연결이 두 개가 되고, 그 순간 `deleteDatabase`·버전 업그레이드가
막힌다.** 지금 고칠 필요는 없지만, Phase B 착수 시 반드시 **`IdbProjectRepo` 에 위임 메서드 4개**
(`putExportRun` · `listExportRuns` · `getExportRun` · `pruneExportRuns` · `appendArtifact`)를 얹는 쪽으로 가고,
`openDb()` 를 화면에서 직접 부르지 않는다. — Phase B 스펙에 못박아 둘 것.

### [경미] 7. `deleteExportRunsOfProject` 를 아무도 부르지 않는다

- 파일: `apps/web/src/data/idb/exportRuns.ts:101`

용역 삭제가 소프트 삭제(`repo.ts:167-174`)뿐이라 지금은 새는 곳이 없다.
하드 삭제가 생기면 그때 연결한다. 지금 지적할 것은 없고 기록만 남긴다.

---

## builder 가 스펙과 다르게 정한 것 (L1~L7) — 판정

| # | 내용 | 판정 | 근거 |
|---|---|---|---|
| **L1** | `assignNumbers` 의 `ctx` 를 선택 인자로 | ✅ **정당** | 사진 0장 상태에서 층 칩 `①–12` 를 실시간으로 그려야 한다(§4-4). 필수로 두면 호출부마다 `new Set()` 을 만든다. `EMPTY_SET` 상수 하나로 처리했고 재계산·재할당이 없다 |
| **L2** | `ProjectBundle` 에 `photos: Photo[]` 추가 | ✅ **정당** | Blob 이 아니라 키만 담기므로 메모리 비용이 작다. 결함 선택마다 저장소를 두드리면 불변식 #3(로컬 우선 즉시성)이 깨진다. `loadBundle` 이 이미 `groupPhotosByDefect` 로 읽기 정규화를 통과시킨다(`repo.ts:211-220`) |
| **L3** | `Inspector` 가 `photoSlot: ReactNode` 슬롯 | ✅ **정당** | 이게 없으면 `Inspector` 가 `data/usePhotos` 를 import 한다. K15 와 정확히 맞고 배선은 `CanvasRoute` 한 곳뿐이다 |
| **L4** | 사진 삭제 10초 뒤 실삭제 · `beforeunload` 최선 | ✅ **정당** (문구만 부정확 — 경미 5) | **안전한 실패로 귀결된다.** `deletePhotos` 는 `[photos, blobs]` 단일 IDB 트랜잭션이고(`repo.ts:461-465`) IDB 는 전부 커밋 아니면 전부 중단이다. 강제 종료의 최악은 **"삭제 안 됨"**(레코드·Blob 온전히 남음)이지 "부분 손상"이 될 수 없다. 대표가 2장이 되는 경우도 읽기 정규화가 덮는다 |
| **L5** | 교체에는 되돌리기 없음 | ⚠️ **조건부** | 판단 자체는 타당하다. 다만 `registerPhotos` → `deletePhotos` 가 **트랜잭션 2개**라(`usePhotos.ts:253-258`) 중간에 실패하면 옛 사진과 새 사진이 둘 다 남는다. 읽기 정규화 덕에 대표는 1장이고 사용자는 중복 1장을 눈으로 보고 지울 수 있으므로 **데이터 손실은 아니다.** 그대로 둬도 된다 |
| **L6** | 용량 사전 확인은 묶음 단위 1회 | ✅ **정당** | 도면과 같은 규칙. `× 1.6` + 여유 8MB 는 실측(원본 4MB → 렌더 ~0.6MB + 썸네일 ~20KB ≈ 1.15배)보다 보수적이라 안전한 방향으로 틀린다 |
| **L7** | 테스트를 `test/` 에 | ✅ **정당** | 기존 8개가 전부 `test/` 다. 두 자리가 공존하는 것이 더 나쁘다 |

---

## 특별 정밀 검수 — 번호 계산 함수 (`export/numbering.ts`)

| 체크 | 결과 | 근거 |
|---|---|---|
| 순수 함수인가 (DB·전역·시간·난수 없음) | ✅ | import 는 없고 모듈 상수는 `EMPTY_SET` 뿐. `Date`·`Math.random`·DOM 참조 0 |
| 같은 입력 → 같은 출력 | ✅ | 층 안 정렬이 `seq → drawingId → id` 3단 전순서(`numbering.ts:232-237`)라 **입력 배열 순서에 기대지 않는다.** 저장소가 순서를 바꿔도 번호가 안 바뀐다. 테스트로 고정돼 있다 (`numbering.test.ts:51`, `:137`) |
| 층 순서 = **사용자가 고른 순서** | ✅ | `params.floorIds` 를 클릭 순서 그대로 순회(`:131-135`, `:173`). 정렬 방향 라디오가 아니다. 중복 클릭은 첫 자리를 쓴다. 테스트 `:129`, `:142` |
| `PER_FLOOR` / `CONTINUOUS` 둘 다 정확 | ✅ | `:176-181`. 테스트 `:93`, `:102` |
| **사진 없는 결함에서 사진번호 카운터가 안 는다** ⭐ | ✅ | `:190-196` — `hasPhoto.has(d.id)` 일 때만 `photoNo += 1`. 아니면 `null` 이고 카운터는 그대로. §4-2 실측(NO 93·94·96 / 사진 92·93·—)이 테스트 `:66` 으로 고정돼 있다 |
| 필터가 번호 부여 **전에** 적용 | ✅ | 층·상태·조사구분·미완성 4종이 전부 버킷에 넣기 **전**(`:142-161`)이고 번호는 그 뒤(`:173-207`). 필터로 빠진 결함은 번호를 소비하지 않는다 |
| 결과가 `ExportRun` 에 스냅샷 저장되어 재현 | ✅ (기반만) | `ExportRun.mapping`·`order`·`floorRanges` 필드가 있고(`params.ts:92-106`) `appendArtifact` 는 `mapping` 을 건드리지 않는다(`exportRuns.ts:68-76`). `diffExportRun` 도 있다. **실제 쓰기는 Phase B(T9~) 소관이라 이 라운드에서는 판정 불가** |
| `PER_FLOOR` 일 때 사진번호도 리셋 (K6) | ✅ | `:180`. 테스트 `:111`, `:118` |

**결론: 번호부여는 통과다.** 지적할 것을 찾지 못했다.

---

## 불변식 검수표

| # | 불변식 | 결과 | 근거 |
|---|---|---|---|
| 1 | 마커 좌표 0~1 정규화 | ✅ | `PhotoEdits.crop` 이 픽셀이 아니라 정규화 사각형으로 선언됨(`photo.ts:26`). 이번 라운드에 도면 좌표 경로를 건드린 곳 없음 |
| 2 | 출력번호·사진번호를 **저장하지 않는다** | ✅ | `Photo`·`Defect` 어디에도 `defectNo`/`photoNo` 컬럼 없음. `assignNumbers` 가 매번 계산하고, 저장되는 것은 `ExportRun.mapping`(그 출력 1회의 스냅샷)뿐. `listProjectSummaries` 의 `defectCount` 도 인덱스 count 라 출력번호와 무관 |
| 3 | 로컬 DB 우선 (서버 `await` 후 로컬 쓰기 금지) | ✅ | 서버 호출 경로 자체가 없다. `usePhotos` 는 메모리를 먼저 바꾸고(`setPhotos`) 저장은 `void guard(...)` 로 뒤따라간다(`usePhotos.ts:162-183`). UI 가 저장 완료를 안 기다린다 |
| 4 | 면적 계산 | — | 이번 diff 에 면적 계산 변경 없음 |
| 5 | 층 정렬은 `sortOrder` 정수 비교 | ✅ | `numbering.ts` 는 층을 정렬하지 않고 **사용자가 준 배열 순서**를 그대로 쓴다. 문자열 비교 없음 |
| 6 | 원인·보수방안에 `defectTypeId` FK 직결 금지 | — | 이번 diff 에 해당 테이블 변경 없음 |
| 7 | 과업 생성 시 설정 복사(스냅샷) | — | 이번 diff 에 해당 경로 변경 없음. `copyStructure` 는 사진을 복사하지 않는다(K13, 의도대로) |
| 8 | **결함당 `isPrimary` 정확히 1장** | ✅ | **모든 읽기 경로가 정규화를 통과한다** — `loadBundle`(`repo.ts:211-220`) · `listPhotos`(`:437-443`) · `listPhotosOfDefect`(`:445-448`) · `usePhotos.photosOf`(`byDefect` = `groupPhotosByDefect`). 쓰기 경로 5개(추가·삭제·대표지정·순서변경·교체·되돌리기)를 전부 추적해 **0장 또는 2장으로 화면·출력에 나가는 경로를 찾지 못했다.** 아래 표 참조 |

### 불변식 #8 — 쓰기 경로별 추적

| 경로 | 코드 | 결과 |
|---|---|---|
| 추가 (첫 장) | `photoIngest.ts:295` `isPrimary: noneYet && i === 0` | 1장 ✅ |
| 추가 (이미 있는 결함에) | 새 장은 전부 `false`, 기존 대표 유지 | 1장 ✅ |
| 추가 (기존 대표가 0장인 옛 레코드에) | 읽기 정규화가 첫 장을 대표로 | 1장 ✅ |
| 대표 지정 | `setPrimary` → `normalizePhotos`(`photo.ts:163-167`). 목록에 없는 id 면 기존 대표 유지 | 1장 ✅ |
| **대표 삭제** ⭐ | `removePhoto` → 필터 후 재정규화 → 다음 장 자동 승계(`photo.ts:173-175`) | 1장 ✅ 테스트 `photo.test.ts:114` |
| 마지막 1장 삭제 | 빈 목록 → `primaryOf` = `null` | 0장(정상) ✅ |
| 순서 변경 | `reorderPhotos` → 재정규화. 맨 앞이 자동으로 대표가 되지 **않는다** | 1장 ✅ 테스트 `:147` |
| 교체 | 새 레코드가 `old.isPrimary` 를 승계(`usePhotos.ts:247-252`) | 1장 ✅ |
| 삭제 되돌리기 | `normalizePhotos([...now, target])` — 되살아난 A(`sortOrder` 최소, `isPrimary` 유지)가 다시 대표 | 1장 ✅ |
| 10초 대기 중 강제종료 | DB 에 일시적으로 2장 → 재기동 시 읽기 정규화가 `sortOrder` 최소 1장만 남김 | 화면·출력 1장 ✅ (경미 5) |

---

## 신규 테스트 41개 — 껍데기인가

**아니다. 실질 검증이다.**

- `photo.test.ts` (21개) — 불변식 #8 의 **경계 조건**을 직접 친다: 대표 0장 / 대표 2장 / 빈 목록 /
  대표 삭제 승계 / 마지막 1장 삭제 / 순서 바꿔도 대표 유지 / `ids` 누락분이 조용히 사라지지 않음 /
  옛 레코드 `edits`·`annotations` 누락 채움(`@ts-expect-error` 로 실제 옛 형식을 흉내낸다, `:86-95`) /
  참조 동일성(`toBe`, `:81`). 회전 누적(`-90 → 270`, `360 → 0`)과 `displaySize` 축 교환도 있다
- `numbering.test.ts` (20개) — §4-2 **실측 재현**(사진 없는 결함이 중간에 끼는 케이스), 결정론
  (입력 배열 순서를 바꿔도 같은 결과), 층 클릭 순서 반영, 중복 클릭, 빈 층(`from/to === null`),
  필터 4종 각각, 순수성(입력 배열 불변)

`toBeDefined()` 류의 무의미한 단언이 없고, 각 테스트가 하나의 실패 모드에 대응한다.

---

## Blob 3종 저장 구조 — 용량 판단

**합리적이다.** 원본 4MB(12MP JPEG) 기준 렌더본(2048 q0.85) ≈ 0.6MB, 썸네일(320 q0.8) ≈ 20KB →
**약 1.15배**. 원본을 버리면 사용자가 PC 에서 파일을 지운 뒤 복구 불가라는 K4 의 근거가 유효하다.
업로드 **전에** `estimateStorage` 로 막고(`photoIngest.ts:135-143`), 여유 8MB 를 남긴다.

다만 두 가지를 기록해 둔다(지금 고칠 것 아님):

- `toPhotoUploads` 는 항상 **키 3개를 새로 만든다**(`photoIngest.ts:297-299`). 그래서
  `photos.ts:29` 의 "`sourceBlobKey === renderBlobKey` 일 수 있다" dedupe 는 실제로는 절대 안 탄다.
  원본이 이미 2048 이하일 때 원본 키를 재사용하면 장당 한 벌을 아낀다. **경미**
- 결함 500건 × 3장 × 5MB ≈ 7.5GB 는 브라우저 quota 를 넘길 수 있다. 사전 확인이 막아 주지만
  **"막힌 뒤에 사용자가 할 수 있는 일"**(어떤 용역이 얼마를 쓰는지 보고 지우기)이 아직 없다.
  거절 문구는 "다른 용역을 정리한 뒤" 라고 안내하는데 정리 화면에 사진 용량이 안 나온다
  (`listProjectSummaries.byteSize` 는 **도면 Blob 만** 센다 — `repo.ts:123-134`). Phase B/5 과제로 남긴다

---

## 확인하지 못한 것

| 영역 | 이유 |
|---|---|
| 화면 실제 동작 전부 | 규칙대로 브라우저를 띄우지 않았다. builder 로그의 `## 직접 확인해주실 것` 16항목이 그대로 유효하다 |
| EXIF 방향 자동 보정이 실제로 먹는지 | `<img>` 디코드 + `naturalWidth/Height` 경로는 최신 Chrome/Edge 에서 맞는 접근이지만, **세로 사진을 실제로 올려 봐야 안다.** 체크리스트 3번 항목 |
| 드래그 정렬 · 우클릭 메뉴 · 미리보기 키보드 | 코드상 결선은 확인했다. 브라우저 동작은 사용자 확인 |
| `styles.css` +306행의 시각 결과 | 예약색(`--defect-current/prev/repaired`) 미사용은 확인했다(`#fdecea`·`#8a201a` 는 `menu__item--danger` 가 이미 쓰던 값). 실제 레이아웃·96px 그리드 정렬은 눈으로 봐야 안다 |
| 회전 90°/270° 일 때 썸네일 타일이 안 잘리는지 | CSS `transform: rotate()` 는 레이아웃 박스를 안 바꾼다. 정사각 타일 + `object-fit` 이면 대체로 괜찮지만 **눈으로 봐야 안다.** `PhotoSection.tsx:210` · `PhotoPreviewDialog.tsx:112` |
| `ExportRun` 의 재다운로드 재현성 | 저장·조회·prune·diff 함수는 읽고 확인했으나 **부르는 쪽이 아직 없다.** Phase B 검수 대상 |
| T9~T16 | 이 브랜치 범위 밖 |

---

## 요약

- **심각 1건** — 지적 1(결함 삭제 연쇄삭제 ↔ Ctrl+Z 되돌리기 충돌, 데이터 손실). 구체 수정 지시 첨부
- **보통 2건** — 지적 2(Firefox 드래그), 지적 3(모달이 떠 있어도 캔버스 단축키 관통)
- **경미 4건**
- 번호부여·사진 도메인 코어·불변식 #8·DB 버전 유지·타입/테스트/빌드는 **전부 통과**
- builder 의 L1~L7 은 L5 하나가 조건부(그대로 둬도 무방)이고 나머지 6개는 정당
