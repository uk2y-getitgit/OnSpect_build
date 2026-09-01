# 검수 결과 — 태블릿 배치3 · T-7 (G-8) 전회차 결함 → 금회차 전환

**대상 커밋:** `d2f03ec` (구현) · `f8f2a71` (로그)
**기준:** `_workspace/00_input/scope_TabletFeedback0901.md` §T-7 · `_workspace/47_builder_log_Tablet3.md`
**검수일:** 2026-09-02

## 판정

**조건부 통과** — 심각 0 · 보통 1 · 경미 4.

전이 로직 자체(커맨드·리듀서·잠금 분리·성공 판정·Undo)는 정확하다. 요구사항 3("자동 반영")의
builder 주장도 코드에서 전부 확인됐다. 다만 되돌리기 버튼의 표시 조건이 **샘플 프로젝트의
전회차 결함에서는 성립하지 않아** 전환이 편도가 되는 갈래가 하나 있다(보통 1).

---

## 요청받은 7개 확인 항목 — 결과

| # | 확인 항목 | 결과 | 근거 |
|---|---|---|---|
| 1 | `repo.ts`(copyStructure·사진 승계) 미접촉 | ✅ | `git show --stat d2f03ec f8f2a71` — 변경 파일 9개(로그 포함 10개)에 `packages/project-core/src/repo.ts` · `apps/web/src/data/idb/repo.ts` 없음. 워킹트리도 소스 변경 0 (`git status --porcelain`) |
| 2 | `isLocked` vs `canAddPhotos` 분리 | ✅ | 아래 §전수 grep |
| 3 | `SET_DEFECT_STATUS` Undo·화이트리스트 | ✅ (경미 1건) | `commands.ts:517-521` invert · `store.ts:517-521` 화이트리스트 |
| 4 | 사진 추가 성공 시에만 전환 | ✅ | `usePhotos.ts:208-244` 반환 0 경로 4개 · `CanvasRoute.tsx:543-544` `added <= 0` 조기 반환 |
| 5 | 되돌리기 버튼 노출 조건 | ⚠️ 보통 1 | `Inspector.tsx:98` — 조건은 지켜지나 샘플 데이터에서 역효과 |
| 6 | 번호·색·범례·출력 자동반영 주장 | ✅ | 아래 §요구사항 3 재검증 (memo 배선까지 확인) |
| 7 | canvas-core 경계 규칙 | ✅ | 신규 코드에 `window`/`document`/React 참조 없음. `SET_DEFECT_STATUS` 는 `at`(시각) 조차 받지 않아 경계 규칙 1을 더 엄격히 지킨다 |

### 2 — 잠금 경로 전수 확인 (grep)

`isLocked` 호출부는 **9곳 전부 그대로**다. `interaction.ts` 는 이번 커밋에서 한 줄도 바뀌지 않았다.

```
interaction.ts:437, 785, 800, 819, 1053, 2132, 2149   ← 커서·이동·리사이즈·스타일·컨텍스트
store.ts:477                                          ← setDefectAttrs 마지막 관문
CanvasRoute.tsx:613(컨텍스트메뉴) · 867(ContextToolbar) · 928(PhotoSection disabled)
Inspector.tsx:93                                      ← 폼 잠금
```

`PhotoSection` 안에서도 `addDisabled` 를 쓰는 곳은 **추가 버튼 1개(161행)뿐**이고,
드래그 순서변경(207) · 우클릭 메뉴(231) · 타일 액션(265) · 하단 액션(322) 은 전부 `disabled` 를 그대로 본다.
`PhotoSection` 소비자는 `CanvasRoute` 하나뿐이며 `addFiles` 호출부도 `addPhotosTo` 하나뿐이다
(다른 화면에서 몰래 사진을 붙이는 경로 없음).

### 6 — "자동 반영" 주장 재검증 (builder 주장을 믿지 않고 직접 확인)

| 항목 | 확인한 코드 | 결과 |
|---|---|---|
| 마커 색 | `style.ts:61` `global.statusColor[defect.status]` + `CanvasView.tsx:220-228` `renderInput` deps 에 `defects` 포함 → 220행 memo 무효화 → 254-271행 오버레이 재그리기 | 자동 ✅ |
| **도면 범례** | `pageDecor.ts:103` `statusRows(lg, mine)` — **memo 키가 도면 id 만이었으면 죽었을 자리**인데 `CanvasRoute.tsx:405` `legendSig` 가 `[...new Set(mine.map(d=>d.status))]` 를 문자열로 넣어 둬서 상태가 바뀌면 키가 바뀐다 | 자동 ✅ (위험 지점이었으나 이미 방어돼 있음) |
| 사이드바 카운트 | `Sidebar.tsx:52-53` — 파생 계산, memo 없음 | 자동 ✅ |
| 출력 포함 여부 | `numbering.ts:213-218` `statusAllowed` — **번호 부여 루프(179행) 이전**인 145행 필터 단계에서 적용 | 자동 ✅ |
| 사진번호 | `numbering.ts:191-197` — `hasPhoto.has(d.id)` 일 때만 `photoNo += 1`. 전환된 결함은 사진이 있으므로 정상 채번, 없는 결함은 카운터 안 올라감 | 자동 ✅ |
| 영속화 | `commands.ts:430-431` `defectTargetOf` 기본 갈래 → `store.ts:327-335` `recordWrite` 가 **적용 후 상태의 결함 레코드 전체**를 upsert 큐에 넣는다. 출력 화면 이동 전 `CanvasRoute.tsx:674` `flush()` | 자동 ✅ |

**결론: builder 주장 사실. 별도 배선 필요 없음.**

---

## 지적 사항

### [보통] 샘플 프로젝트의 전회차 결함은 전환하면 되돌릴 수 없다 (되돌리기 버튼이 안 뜬다)

- 파일: `apps/web/src/ui/Inspector.tsx:98` · `apps/web/src/data/sampleProject.ts:224`
- 문제: 노출 조건이 `status === 'CURRENT' && prevDefectId !== null` 인데,
  **샘플 데이터의 결함은 status 와 무관하게 `prevDefectId: null` 로 고정**돼 있다
  (`sampleProject.ts:224` — SEEDS 8건 전부 이 팩토리를 탄다. `dfx-005` 는 `PREV_PENDING`,
  `dfx-004` 는 `REPAIRED`).
- 재현:
  1. 샘플 용역을 열고 보라색 마커(`dfx-005`, 지하3층 seq 5)를 선택
  2. `+ 사진 추가` 로 사진 1장 추가 → 정상적으로 빨강·`CURRENT` 로 전환된다
  3. 우측 패널 하단에 **`전회차로 되돌리기` 가 없다** (`prevDefectId === null` 이므로)
  4. 토스트가 사라지거나 다른 편집을 하나라도 하면 Ctrl+Z 로도 못 되돌린다 → **편도**
- 영향: 데이터 손실은 없다(사진·속성 그대로). 다만 스코프 4번 *"명시적 되돌리기 버튼을 제공한다"*
  가 이 갈래에서 성립하지 않는다. 그리고 **builder 체크리스트 7번("되돌리기 버튼이 보인다")이
  샘플로 검증하면 반드시 실패**하므로, 사용자가 버그로 신고할 가능성이 높다.
- 판단: `prevDefectId` 가드 자체는 옳다(없는 전회차로 보내면 `includePrevPending=false` 에서
  출력에서 통째로 빠진다 — builder 근거 타당). **가드를 풀지 말고 데이터를 고칠 것.**
- 수정(택1, 1번 권장):
  1. `sampleProject.ts:224` 를 `prevDefectId: s.status === 'CURRENT' ? null : \`prev-${s.id}\`` 로.
     (`prevDefectId` 는 조회 키로만 쓰이고 FK 제약이 없다 — `repo.ts` 어디에서도 역참조 조회를 하지 않는다.
     실제 참조가 필요하면 `null` 대신 존재하지 않는 id 를 넣는 것이 위험한지 확인 필요 → §확인 요청 1)
  2. 그게 꺼려지면 `47_builder_log` 체크리스트 7번에 *"샘플 용역에서는 뜨지 않는 것이 정상,
     전차 승계 용역으로 확인할 것"* 을 명시.

### [경미] 리듀서 화이트리스트에 `prevDefectId` 조건이 없다 — 방어선이 뷰 한 곳뿐

- 파일: `apps/web/src/store.ts:517-521`
- 문제: `CURRENT → PREV_PENDING` 허용 조건이 status 만 본다. 바로 위 `setDefectAttrs` 는
  *"폼도 disabled 지만 **마지막 관문을 여기 둔다**"*(`store.ts:465`)라고 스스로 원칙을 적어 뒀는데,
  이 커맨드만 최종 관문이 `Inspector.tsx:98` 의 렌더 조건 하나다.
- 현재 도달 불가: `onRevertToPrev` 를 주는 곳은 `CanvasRoute.tsx:967` 뿐이고 그 대상은
  Inspector 가 받은 `defect` 와 **같은 객체**(`defect={selected}` 917행)라 조건이 어긋날 수 없다.
  그래서 경미로 둔다.
- 수정: `store.ts:519-520` 을
  `(d.status === 'CURRENT' && to === 'PREV_PENDING' && d.prevDefectId !== null)` 로 좁힌다.
  (위 [보통] 을 1번 방식으로 고친 뒤에 적용해야 샘플에서도 동작한다.)

### [경미] `addDisabled` 툴팁 문구가 "보수완료" 로 하드코딩돼 있다

- 파일: `apps/web/src/ui/photos/PhotoSection.tsx:162-169`
- 문제: `addDisabled` 의 기본값이 `disabled`(68행)인데, 문구는 `addDisabled` 면 무조건
  *"보수완료 표기에는 사진을 추가할 수 없습니다"* 다. 현재 유일한 소비자가 항상
  `addDisabled={!canAddPhotos(selected)}` 를 주므로 문구는 맞지만(REPAIRED 일 때만 true),
  `addDisabled` 를 생략한 소비자가 하나라도 생기면 전회차 결함에 "보수완료" 라고 표시된다.
- 수정: 기본값 폴백을 없애고 `addDisabled` 를 필수 prop 으로 만들거나, 문구를
  `disabled ? '이 표기에는 …' : '보수완료 표기에는 …'` 로 갈래를 맞춘다.

### [경미] web 계층 신규 로직에 테스트가 없다

- 파일: `apps/web/src/store.ts:511-528` · `apps/web/src/routes/CanvasRoute.tsx:541-553`
- 문제: 신규 테스트 10개는 전부 `packages/canvas-core/test/tabletT7.test.ts` 다.
  정작 이번 배치의 **판정 로직**(허용 전이 화이트리스트 · `added > 0` 게이트 · `revertable` 조건)은
  `apps/web` 에 있는데 이 워크스페이스에는 테스트 스위트 자체가 없다(667 = canvas-core 360 + project-core 307,
  내가 직접 `npm test` 로 재확인).
- 영향: `REPAIRED → CURRENT` 차단, 전량 거절 시 미전환 같은 핵심 규칙이 회귀 테스트로 안 잡힌다.
- 수정: 범위를 넘으므로 이번엔 지적만 한다. 화이트리스트를 순수 함수
  (`canTransition(from, to, prevDefectId)`)로 canvas-core 에 올리면 기존 스위트에서 바로 덮인다.

### [경미] Undo 후 "전회차 결함이 이번 회차 사진을 보유" 하는 상태가 남는다

- 파일: `apps/web/src/routes/CanvasRoute.tsx:541-553` (구조적 한계, builder 로그 §알려진 한계 2)
- 문제: 전환을 Ctrl+Z 하면 status 만 `PREV_PENDING` 으로 돌아가고 사진은 남는다.
  `includePrevPending` 기본값이 true 이므로(`numbering.ts:49`) 이 결함은
  **전회차 신분으로 사진번호를 받고 사진첩에 실린다**(`numbering.ts:191-196`).
  T-7 이전에는 전회차 결함이 사진을 가질 수 없었으므로 이건 새로 생긴 조합이다.
- 판단: 수치가 틀리는 것은 아니다(번호 체계는 일관). 보고서 의미상 옳은지는 **도메인 판단**이라
  §확인 요청 2 로 넘긴다. `되돌리기` 버튼 경로도 같은 조합을 만든다(스코프 4번이 *"사진 삭제 여부와
  무관하게 항상 가능"* 이라고 못박았으므로 구현 자체는 스펙대로다).

---

## 정확성 확인 — 통과한 것들 (반례를 찾아본 결과)

| 시도한 반례 | 결과 |
|---|---|
| `REPAIRED` 결함에 사진 붙여 되살리기 | 막힘. `canAddPhotos`(defectGeom.ts:406)가 버튼을 잠그고, 뚫려도 `store.ts:519` 화이트리스트가 두 번째로 막는다 |
| 파일 전량 거절(형식·용량) 후 전환 | 안 됨. `usePhotos.ts:226` `ready.length === 0 → 0` |
| 저장 실패(`registerPhotos` 실패) 후 전환 | 안 됨. `usePhotos.ts:236` `ok === null → 0` |
| 저장소 미준비 상태 | 안 됨. `usePhotos.ts:212-215` `phase !== 'READY' → 0` |
| 파일 0개 선택 | 안 됨. `usePhotos.ts:211` (게다가 `PhotoSection.tsx:111` 이 0개면 `onAdd` 자체를 안 부른다) |
| 이미 `CURRENT` 인 결함에 사진 추가 → "전환했습니다" 거짓 토스트 | 안 뜸. `store.ts:518` `d.status === to` 조기 반환이 토스트보다 앞이다 |
| Undo/Redo 왕복이 `seq`·`prevDefectId`·`marks`·`style` 을 훼손 | 안 함. `commands.ts:300` 이 `status` 한 필드만 갈아끼운다. 테스트 `tabletT7.test.ts:67` 이 고정 |
| 전이 커맨드가 저장 큐에 안 올라가 새로고침에 날아감 | 안 날아감. `defectTargetOf` 기본 갈래(`commands.ts:430`) + `recordWrite` 가 결함 레코드 전체 upsert |
| 히스토리 병합으로 전이가 다른 커맨드와 합쳐짐 | 안 합쳐짐. `mergeAttrCommand`(546행)는 `SET_DEFECT_ATTRS` 만, `mergeEraseCommand`(563행)는 `DELETE_MEMO_PATH` 만 |
| `SET_DEFECT_ATTRS`(유사결함 불러오기)가 `prevDefectId` 를 복사해 신규 결함에 심음 | 불가능. `prevDefectId` 는 `DefectAttrs` 멤버가 아니다(`EMPTY_DEFECT_ATTRS`, defectAttrs.ts:14-42) → `attrsOf`·`DEFECT_CARRY_FIELDS` 어디에도 없다 |
| 옛 레코드의 `prevDefectId: undefined` 가 `!== null` 을 통과해 버튼이 뜸 | 불가능. `repo.ts:789 normalizeDefect` → `normalizeDefectAttrs`(defectAttrs.ts:154)가 읽는 시점에 `?? null` 로 채운다 |
| Inspector 의 판정 대상과 dispatch 대상이 다른 결함 | 동일 객체. `CanvasRoute.tsx:917 defect={selected}` · `967 defectId: selected.id` |

**직접 실행한 검증:** `npm run typecheck` 3패키지 통과 · `npm test` 667개 통과
(canvas-core 360 / project-core 307) — builder 주장과 일치.

---

## 불변식 검수표

| # | 불변식 | 결과 | 근거 |
|---|---|---|---|
| 1 | 좌표 0~1 정규화 | ✅ 무관·유지 | `commands.ts:300` 이 `status` 만 교체. `marks`·`label` 미접촉, 테스트 `tabletT7.test.ts:73-74` 가 고정 |
| 2 | 출력번호 미저장 | ✅ | 신규 필드 없음. `Command` 에 추가된 것은 `from`/`to`(DefectStatus)뿐 |
| 3 | 로컬 우선 쓰기 | ✅ | `store.ts:530 applyAndPush` 가 동기 상태 갱신 → `recordWrite` 큐. 서버 `await` 없음. 사진도 `s.repo.registerPhotos`(IDB) 성공 후 로컬 반영 |
| 4 | 면적 계산 | ✅ 미접촉 | 이번 커밋에 산식 변경 없음 |
| 5 | 층 정렬 `sortOrder` | ✅ 미접촉 | `numbering.ts compareForOutput`·`Sidebar sortByOrder` 그대로 |
| 6 | 마스터+연결 | ✅ 미접촉 | — |
| 7 | 설정 스냅샷 | ✅ 미접촉 | `copyStructure` 미변경(요구사항 1) |
| 8 | `isPrimary` 정확히 1장 | ✅ | 사진 추가 경로는 반환형만 바뀌었다. `groupPhotosByDefect`(photo.ts:225-233)가 `normalizePhotos` 로 첫 장을 대표로 만들므로 "1장 이상 = 대표 있음" 이 성립 → 전이 조건(1장 이상)과 `hasPhoto`(대표 기준, photo.ts:236-241)가 어긋나지 않는다. builder 한계 4의 주장 사실 |

## 번호 계산 함수 정밀 검수 (변경 없음 — 영향만 확인)

- 순수성·결정성: `numbering.ts` 미변경 ✅
- 필터가 번호 부여 **전**: `statusAllowed` 는 145행 분류 루프, 채번은 179행 ✅
- 사진 없는 결함에서 사진번호 미증가: 191-197행, 전환된 결함은 반드시 사진이 있으므로 안전 ✅
- `ExportRun` 스냅샷: 전환 전에 뽑아 둔 산출물은 그대로 재현된다(스냅샷 경로 미변경). 전환 후 다시 뽑으면
  결함이 새로 들어오면서 **뒤 번호가 밀린다** — 스펙상 정상이지만 사용자에게는 놀랄 수 있는 동작 → §확인 요청 3

---

## 확인 요청 (코드로 판단할 수 없는 것)

1. **샘플 데이터의 `prevDefectId`** — 존재하지 않는 id(`prev-dfx-005`)를 넣어도 되는가?
   현재 코드에서 `prevDefectId` 를 역참조 조회하는 곳은 없다(grep 결과 전부 대입·비교뿐).
   "전회차 번호 조회" 용도가 앞으로 생길 예정이면 다른 방식이 필요하다.
2. **Undo/되돌리기로 만들어지는 "사진 가진 전회차 결함"** 이 보고서상 허용되는 조합인가?
   (현재는 사진첩에 실린다. 제외하려면 `hasPhoto` 또는 되돌리기 시점에 정책이 필요하다)
3. 전환 후 재출력 시 뒤 결함 번호가 밀리는 것은 의도된 동작인가? (스펙상 번호는 미저장 파생값이므로
   정상으로 판단했으나, 이미 배포한 보고서와 번호가 달라지는 실무 이슈일 수 있음)

## 확인하지 못한 것

- **실행 검증 전부** — 규칙대로 브라우저·개발서버를 띄우지 않았다. 마커 색 전환·토스트·버튼 위치 등
  화면 확인은 builder 로그의 13항목 체크리스트가 담당한다.
- `PhotoSection` 의 미리보기 편집기(크롭·주석) 내부 — 이번 커밋이 건드리지 않았고
  `disabled` 를 그대로 쓰는 것만 확인(322행). 내부 동작은 배치2 검수 범위였다.
- `flush()` 디바운스와 IDB 트랜잭션 실패 시 전이 유실 여부 — 이번 변경으로 달라지는 부분이 없어
  기존 동작으로 간주했다(전이는 다른 결함 편집과 완전히 같은 저장 경로를 탄다).
- `apps/web` 에는 테스트 스위트가 없어 web 계층 로직은 **정적 읽기로만** 검증했다.
