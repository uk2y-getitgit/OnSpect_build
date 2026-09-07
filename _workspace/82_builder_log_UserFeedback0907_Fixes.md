# 구현 로그 — 사용자 피드백 2026-09-07 수정 3건 + 서버 스키마 완화

입력: `_workspace/00_input/scope_UserFeedback0907.md` · `DECISIONS.md` D44 · `QUESTIONS.md` Q78
모드: `onspect-fix` (신고 오류만 좁게 수정 · 브라우저 실행 없음 · Serena 미연결로 Grep/Read 사용)

## 완료

| # | 작업 | 파일 | 커밋 | 상태 |
|---|---|---|---|---|
| 1 | 유사결함 후보를 현재 도면(층)으로 제한 | `apps/web/src/routes/CanvasRoute.tsx` · `ui/SimilarDefectPicker.tsx` · `ui/defectForm/DefectInfoForm.tsx` | `유사결함 불러오기 후보를…` | 완료 |
| 2 | 캔버스 표기 id 를 UUID 로 | `apps/web/src/store.ts` · `data/idb/db.ts` | `캔버스 표기 id 를 UUID 로…` | 완료 |
| 3 | 동기화 후 도면 배율/좌표 어긋남 | `apps/web/src/data/drawingScale.ts` · `data/idb/repo.ts` · `routes/CanvasRoute.tsx` · `routes/ProjectSetup.tsx` | `동기화 후 도면 배율과…` | 완료 (원인 확정) |
| 4 | 서버 `records.id` uuid → text | `supabase/migrations/20260907000000_records_id_text.sql` | `서버 마이그레이션 추가…` | 완료 (**사용자가 직접 실행 필요**) |

---

## 수정 1 — 유사결함 불러오기: 현재 도면(층)만

**무엇이 문제였나**
후보 목록을 `state.defects` 전체(용역 전체 층)에서 만들고 있었다 — 비차단 가정 U26.
사용자 요청은 "지금 열려 있는 도면과 같은 층"이다.

**어디를 고쳤나**
`CanvasRoute.tsx::similarItems` — `resolvedFloor?.id` 를 `currentFloorId` 로 뽑아
`d.floorId === currentFloorId && d.id !== selected?.id` 로 거른다.
`seq` 내림차순 정렬·자기 자신 제외는 그대로.
층이 아직 안 정해졌으면(`null`) 빈 목록.

**"같은 층" 판정 근거** — `floorId` 동일.
이 프로젝트는 **층 1개 = 도면 1장**이다(`drawingByFloor` 맵, `registerDrawings` 의 "S1 은 층당 1장").
그래서 `floorId` 와 `drawingId` 필터는 실질적으로 같은 집합이고, 화면·URL·`FloorChips` 가
모두 층 단위로 도는 것과 일관된 `floorId` 를 골랐다.

**곁다리(같은 문장이라 함께 고침)** — 후보가 0건일 때의 안내 문구를
"이 **용역**에 불러올 다른 결함이 아직 없습니다" → "이 **도면**에…" 로 바꿨다
(`SimilarDefectPicker` 본문 · `DefectInfoForm` 버튼 title). 문구를 그대로 두면 거짓말이 된다.

---

## 수정 2 — 캔버스 표기 id 를 UUID 로

**무엇이 문제였나**
`store.ts::runInput()` 의 `ctx.makeId` 가 `n{seed}-{rand}` 형태(`n10-29up`)를 만들었다.
이 id 는 동기화 때 서버 `records.id uuid` 로 그대로 올라가므로
`invalid input syntax for type uuid`(22P02)로 거절된다. upsert 가 chunk 단위라
**한 건이 정상 레코드까지 함께 떨어뜨린다**(`sync.ts:815` — `res.error` 면 `throw`).

**어디를 고쳤나**
- `store.ts` — `makeId: () => newId()`. `data/idb/db.ts` 의 `newId()`(crypto.randomUUID)를
  재사용한다. Building·Floor·Drawing·Project 가 이미 쓰는 것과 **같은 생성기 한 벌**.
- `store.ts` — 더 이상 쓰이지 않는 카운터 `AppState.idSeed` 제거.
  참조를 전수 확인했다: `store.ts` 안(타입 선언 · `initialState` · `runInput`)이 전부였고,
  `packages/canvas-core/test/eraser.test.ts` 의 `idSeed` 는 그 파일 안의 지역 변수라 무관하다.
- `data/idb/db.ts::newId()` — **폴백도 UUID v4 형식**으로 고쳤다.
  `crypto.randomUUID` 는 보안 컨텍스트(https·localhost)에서만 존재한다. 현장 태블릿이
  LAN IP(http)로 붙으면 예전 폴백(`id-lx8k-a91f`)이 나와 같은 오류가 다시 난다.
  `crypto.getRandomValues`(없으면 `Math.random`) → RFC4122 v4 문자열.

**범위 밖(손대지 않음)** — 이미 로컬 IndexedDB 에 옛 포맷으로 저장된 결함 id 재발급.
Q78 → **D44 B안 채택**으로 서버 쪽을 완화하는 것으로 결론(아래 수정 4). 로컬 데이터 무손상.

---

## 수정 3 — 동기화 후 도면 배율과 결함 좌표 어긋남

### 원인을 찾았다 (확정)

**`sync.ts::syncedBlobKeys()` (269줄) 가 `sourceBlobKey` 를 동기화 대상에서 뺀다(Q60).
그런데 배율이 1이 아닌 도면의 화면 그림은 오직 그 원본에서만 만들어진다.**

추적 경로:

1. `canvas/drawingComposite.ts::needsCompose()` — `imgScale ≠ 1` 이거나 `renormalizedAt` 이 있으면
   **저장된 렌더 래스터를 쓰지 않고** 원본을 A4 로 다시 합성한다.
2. `CanvasRoute.tsx:442~460` — `needsCompose` 면 `repo.readBlob(dw.sourceBlobKey)` 로 원본을 읽어
   `compositeUrl()` 로 합성한다. **읽지 못하면 조용히 `useStored()`**(저장된 `renderBlobKey`)로 폴백한다.
3. 저장된 `renderBlobKey` 래스터는 **업로드 당시(100%) 합성본**이다 —
   배율을 바꿔도 아무도 다시 굽지 않는다(`drawingComposite.ts` 머리주석: "합성 결과는 런타임 캐시에만",
   `repo.writeRenormalize` 주석: "Blob 을 건드리지 않는다").
4. `sync.ts:269~276` · `2-c`(728줄) — 올라가는 Blob 은 `renderBlobKey` + `thumbBlobKey` 뿐.
   **원본은 절대 오가지 않는다.**

→ 다른 기기에는 합성할 재료가 없어 **100% 래스터**가 뜨고,
   결함 좌표는 `applyDrawingScale`+`transformAll` 로 **125% 배치**로 옮겨진 채 동기화된다.
   도면과 표기가 서로 다른 배율 기준이 된다. 신고 문장과 정확히 일치한다.

**배제한 후보** (리더가 지목한 셋 — 셋 다 원인이 아니다)
- *push 부분 실패* — kind 별로 돌지만 실패하면 `throw SyncError` 라 조용히 한쪽만 성공하지 않는다.
  DRAWING 만 가고 DEFECT 가 빠지는 시나리오는 코드상 만들어지지 않는다.
- *pull 적용 순서* — 도면·결함 어느 쪽이 먼저 적용돼도 최종 상태는 같다. 순서 의존이 없다.
- *`releaseComposite` 캐시 무효화* — 합성 캐시는 `(drawingId, scale)` 로 검사하므로
  (`cachedCompositeUrl`) 배율이 바뀌면 자동으로 미스가 난다. pull 이후에도 안전하다.
- *저장 커밋 시점* — `applyScale` 은 화면 상태와 repo 저장을 모두 하고,
  ProjectSetup 쪽은 `writeRenormalize` 로 도면+결함+메모를 **한 트랜잭션**에 쓴다. 누락 없음.

### 어디를 고쳤나

**배율을 적용할 때 저장 래스터 자체를 새 배율로 다시 굽는다.**

- `data/drawingScale.ts::rebakeScaledRender(store, dw)` (신설) —
  원본을 읽어 `composeA4(source, imgScale)` 로 다시 굽고 저장소에 갈아 끼운다.
  원본이 없으면 `null` 을 돌려주고 조용히 넘어간다.
- `data/idb/repo.ts::IdbProjectRepo.replaceRenderBlob(drawing, blob)` (신설) —
  **새 Blob 키**로 넣고 도면 레코드와 **한 트랜잭션**에서 커밋한 뒤 옛 키를 release 한다.
  - 새 키를 쓰는 이유: 같은 키에 내용만 바꾸면 sync 가 `readUploadedBlobKeys` 로
    "이미 올린 키"라 보고 **재업로드를 건너뛴다** — 다른 기기는 영영 옛 그림을 본다.
  - 옛 키가 `sourceBlobKey`·`thumbBlobKey` 와 같을 때(무손실 통과 업로드)는 release 하지 않는다.
    줄이면 원본이 지워져 다시는 합성할 수 없다.
- 진입점 두 곳 모두 같은 헬퍼를 탄다:
  `CanvasRoute.tsx::applyScale`(캔버스 상단바) · `ProjectSetup.tsx::applyScale`(도면관리).
- ProjectSetup 에서는 rebake 성공 시 그 도면의 **`[A4로 맞추기] 되돌리기` 배너를 지운다** —
  스냅샷이 방금 지워진 옛 래스터 키를 들고 있어, 되돌리면 그림이 빈 도면이 된다.

**100% 로 되돌릴 때도 반드시 다시 굽는다.** 그때는 `needsCompose` 가 false 라
저장 래스터가 **그대로 화면에 나오기** 때문이다 — 안 구우면 반대 방향으로 어긋난다.

**하지 않은 것 (의도적)**
- `sourceBlobKey` 를 동기화 대상에 넣지 않았다 — Q60 사용자 결정을 뒤집는 일이고 전송량이 크다.
- 도면 크기 조절 기능 전체를 리팩터하지 않았다. `applyDrawingScale`·`transformAll`·좌표 계산은 그대로다.

---

## 수정 4 — 서버 `records.id` uuid → text (D44 · B안)

**파일:** `supabase/migrations/20260907000000_records_id_text.sql` (신규. `init.sql` 은 손대지 않음)

```sql
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='records'
               and column_name='id' and data_type='uuid') then
    alter table public.records alter column id type text using id::text;
  end if;
end $$;
```

**확인한 것**
- `records.id` 를 참조하는 **외래키 없음**. `records_pull_cursor_idx` 는 `(project_id, server_seq)` 라 무관.
- PK `(project_id, kind, id)` 인덱스는 `ALTER TYPE` 이 자동으로 재생성한다.
- uuid → text 는 값 손실 없는 넓히기 — 이미 올라간 진짜 uuid 행은 정규 소문자 문자열로 그대로 남는다.
- `project_id` 는 uuid 유지(용역 id 는 언제나 `newId()` 산출물).
- **클라이언트에 "id 가 uuid 형식이어야 한다"는 검증 로직은 없다** —
  `apps/web/src` 전체에서 `uuid` 문자열은 주석에만 나온다. 제거할 코드 없음.
- 다시 실행해도 안전(idempotent).

> ⚠️ **사용자가 직접 실행해야 할 SQL 이다.**
> Supabase 대시보드 → SQL Editor 에 위 파일 내용을 붙여넣고 실행.
> 이걸 실행해야 옛 포맷 id 를 가진 기존 결함들의 동기화가 뚫린다.

---

## 검증한 것

| 검증 | 결과 |
|---|---|
| 타입 검사 3 워크스페이스 (`npm run typecheck`) | ✅ canvas-core · project-core · web 전부 통과 |
| 단위 테스트 (`npm test`) | ✅ canvas-core 30파일 477건 · project-core 21파일 377건 = **854건 전부 통과** |
| 프로덕션 빌드 (`npm run build`) | ✅ `built in 10.23s` (기존 chunk 크기 경고만, 이번 수정과 무관) |

**회귀 테스트는 추가하지 않았다** — 이번 3건은 계산 로직이 아니라
(1) React `useMemo` 필터 (2) id 생성기 위임 (3) IndexedDB Blob 트랜잭션 + Canvas 합성이라
모두 브라우저 API 에 붙어 있어 현재 노드 테스트 환경(`canvas-core`/`project-core` 순수 로직)에서
의미 있는 고정이 어렵다. 좌표 변환 계산 자체(`layoutTransform`)는 손대지 않았고
기존 `a4Scale.test.ts` 6건이 그대로 지킨다.

---

## 직접 확인해주실 것

**A. 유사결함 후보 (수정 1)**
1. 결함이 있는 층 두 개(예: 1F·2F)를 준비하고 1F 를 연다 → 결함 하나 선택
2. `[유사결함 불러오기]` → **1F 결함만** 보이는가. 2F 결함이 섞이지 않는가
3. 목록이 `seq` 큰 것부터인가, 지금 고른 결함 자신은 빠져 있는가
4. 결함이 1개뿐인 층에서 버튼이 비활성이고 툴팁이 "이 **도면**에 불러올 다른 결함이 아직 없습니다" 인가

**B. 새 결함 id (수정 2)** — ※ **수정 4 SQL 을 먼저 실행한 뒤** 확인
1. 결함을 **새로** 하나 찍는다 → `[동기화]`
2. "invalid input syntax for type uuid" 오류 없이 끝나는가
3. (SQL 실행 후) 예전에 만든 옛 결함들도 함께 올라가는가 — 이게 D44 의 목적이다

**C. 도면 배율 (수정 3)** — 기기 2대 또는 브라우저 프로필 2개 필요
1. 기기 A: 도면을 **125%** 로 키우고 `[적용]` → 결함이 도면을 잘 따라오는지 확인
2. 기기 A: `[동기화]` (도면 파일이 다시 올라가느라 이전보다 조금 더 걸릴 수 있다)
3. 기기 B: `[서버에서 받기]`/`[동기화]` → 같은 층을 연다
4. **도면 그림과 결함 표기가 같은 배율로 맞는가** (도면 100% + 결함 125% 로 어긋나지 않는가)
5. 기기 A 에서 다시 **100%** 로 되돌리고 동기화 → 기기 B 에서도 100% 로 맞는가
6. 도면관리(용역 설정) 화면의 배율 진입점으로도 1~5 를 한 번 더

**D. 회귀 확인(범위 밖이지만 이번 수정이 지나간 자리)**
- 도면 크기 조절 다이얼로그에서 슬라이더를 움직이는 **미리보기**는 여전히 즉각적인가
  (미리보기는 저장하지 않으므로 다시 굽지 않는다 — 느려지면 안 된다)
- `[적용]` 직후 캔버스 그림이 깜빡이거나 사라지지 않는가
- 도면을 삭제했다 다시 올려도 정상인가 (Blob 참조수를 건드렸다)

---

## 알려진 한계 · 고치지 않은 것

1. **원본이 없는 기기에서 배율을 바꾸면 여전히 어긋난다.**
   동기화로 받기만 한 도면은 그 기기에 원본(`sourceBlobKey`)이 없다. 그 기기에서 배율을 바꾸면
   래스터를 다시 구울 방법이 없어 `rebakeScaledRender` 가 `null` 을 돌려주고 넘어간다
   (좌표만 옮겨진다). 근본 해결은 원본도 동기화하는 것 — **Q60 결정을 뒤집는 일이라 묻지 않고
   하지 않았다.** 필요하면 별도 결정 필요.
2. **`[A4로 맞추기]`(`renormalizedAt`)도 같은 병을 앓는다.** 이번 수정은 배율 경로만 고쳤다.
   A4 정규화 후 동기화하면 다른 기기에는 옛 비율 래스터가 간다. 신고 범위 밖이라 손대지 않았다.
   고치려면 `doRenormalize` 에도 `rebakeScaledRender` 를 태우면 되지만,
   되돌리기 스냅샷과의 상호작용을 함께 설계해야 한다.
3. **썸네일(`thumbBlobKey`)은 옛 배율 그대로다.** 목록 미리보기라 기능 영향 없음.
4. **옛 렌더 Blob 이 서버·다른 기기에 고아로 남는다.** 배율을 바꾼 도면의 이전 래스터는
   서버 Storage/`blobs` 행과 다른 기기 IndexedDB 에 남는다(참조하는 레코드는 없다).
   현재 서버측 GC 가 없어서 그렇다. 용량 누수는 도면 1장당 A4 PNG 1개 수준.
5. **비보안 컨텍스트에서 만들어진 옛 `Project.id`** 는 `id-…` 형태일 수 있고,
   `projects.id` 는 여전히 uuid 컬럼이라 그런 용역은 동기화되지 않는다.
   `newId()` 폴백을 UUID v4 로 고쳐 **앞으로는** 생기지 않는다. 기존 데이터에 실제로 있는지는
   확인하지 않았다(사용자 환경 접근 불가). 증상은 "용역 자체가 안 올라감" 이다.
6. 빌드 경고 `chunk > 500kB` 는 이번 수정 이전부터 있던 것이다.
