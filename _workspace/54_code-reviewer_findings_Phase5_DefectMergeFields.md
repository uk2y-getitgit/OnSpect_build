# 검수 결과 — Phase 5 T1-2 `Defect` 병합 재료 3필드 (`updatedAt`·`deviceId`·`createdBy`)

검수 대상: 커밋 `64fc3fe`(구현) · `28548ca`(가정 기록 W1~W6)
스펙: `_workspace/50_plan-reviewer_spec_Phase5_TeamSync.md` §2 · §6-1 T1-2
결정: `_workspace/DECISIONS.md` D23
로그: `_workspace/52_builder_log_Phase5_DefectMergeFields.md`

`git show 64fc3fe` 전체 diff(9파일)를 열어 읽었다. `packages/canvas-core/src/{types.ts,defectBase.ts,
interaction.ts,index.ts}`, `apps/web/src/data/idb/repo.ts`, `apps/web/src/data/sampleProject.ts`,
`packages/canvas-core/test/{helpers.ts,defectBase.test.ts}` 를 대상으로 검수했다.
`npm test -w @onspect/canvas-core`(379/379) · `npm run typecheck`(canvas-core·project-core·web 3개 전부)
를 직접 재실행해 확인했다(빌드는 로그에 이미 기록돼 있고 이번 diff가 타입만 건드리므로 재실행 생략).

## 판정
**통과**

## 지시받은 7개 항목 확인 결과

### 1. 옛 결함 읽기 시 `updatedAt` 이 정말 `null` 로 유지되는가 — ✅ 확인됨, 반례 없음
`normalizeDefectBase`(`defectBase.ts:70~78`) 를 직접 추적했다.

```ts
updatedAt: raw.updatedAt ?? null,
deviceId: missingDeviceId(raw.deviceId) ? deviceId : (raw.deviceId as string),
createdBy: raw.createdBy ?? null,
```

전부 `??` 만 쓴다. `||` 는 한 번도 안 쓰였다 — `updatedAt` 이 실사용 범위에서 `0`이 될 일이 없어서
(생성은 `Date.now()` 아니면 `null`) `??`/`||` 차이가 문제될 여지 자체가 없지만, 코드도 정직하게 `??`다.
가드절(`raw.updatedAt !== undefined && raw.createdBy !== undefined && !missingDeviceId(...)`)도
`null` 을 "이미 정규화됨"으로 올바르게 취급해 멱등성을 지킨다(테스트로 확인됨 — "이미 null 로 정규화된
레코드를 다시 읽어도 null 그대로다"). `Date.now()` 호출은 파일 전체에 주석에만 등장하고 실제 호출은
없음을 grep 으로 확인했다.

### 2. `DefectAttrs` 와 섞이지 않았는가 — ✅ 확인됨
`types.ts` 에서 `DefectBase` 는 별도 타입으로 정의되고 `Defect = {...} & DefectAttrs & DefectBase` 로만
교차한다(`DefectAttrs` 자체는 안 건드림). `defectAttrs.ts` 를 열어 `DEFECT_ATTR_KEYS =
Object.keys(EMPTY_DEFECT_ATTRS)`, `pickCarryAttrs`/`attrsOf`/`changedAttrKeys` 가 전부
`DEFECT_ATTR_KEYS` 순회로만 동작함을 확인했다 — `EMPTY_DEFECT_ATTRS` 에 세 필드가 없으므로 오염 경로가
구조적으로 없다. `[유사결함 불러오기]` 호출부(`CanvasRoute.tsx:1041`)도
`{ ...attrsOf(selected), ...pickCarryAttrs(attrsOf(src)) }` 로 `attrsOf`를 통해 이미 한 번 걸러진
값만 다루므로 `updatedAt`/`deviceId`/`createdBy` 가 옮겨질 경로가 없다.

### 3. 쓰기 경로 4곳 + 빠진 5번째 경로 없는지 — ✅ 확인됨, 5번째 없음
`repo.ts` 전체에서 `STORE.defects` 를 여는 모든 지점을 grep 하여 전수 대조했다.

| 지점 | 종류 | 스탬프 필요? | 실제 |
|---|---|---|---|
| `listProjectSummaries`(137) | 읽기(count) | – | – |
| `loadBundle`(228) | 읽기 | – | `normalizeDefect(d, this.deviceId)` 로 정규화 |
| `deleteBuilding`→`purgeFloorIn`(313,334) | 삭제만 | 불필요 | `xs.delete` |
| `deleteFloor`→`purgeFloorIn` | 삭제만 | 불필요 | 〃 |
| `registerDrawings`(392,402) | 쓰기 | 필요 | `stampDefect` ✅ |
| `listDefects`(429) | 읽기 | – | 정규화 안 탐(§6 참조) |
| `upsertDefects`(446) | 쓰기 | 필요 | `stampDefect` ✅ |
| `deleteDefects`(465~468) | 삭제만 | 불필요 | `store.delete` |
| `purgeOrphanPhotos`(521,528) | 읽기(`xs.get`) | – | – |
| `writeRenormalize`(591) | 쓰기 | 필요 | `stampDefect` ✅ |
| `duplicateStructure`(688) | 쓰기(신규) | 필요 | `newDefectBase` ✅ |

쓰기(값이 바뀌어 저장되는) 경로는 정확히 4곳이고 전부 스탬프가 걸려 있다. 삭제 전용 경로(3곳)는
스탬프가 필요 없다(레코드 값이 안 바뀌고 사라질 뿐). 5번째 쓰기 경로는 없다.

### 4. 생성 3곳 스프레드 순서 — ✅ 확인됨, 전부 올바른 순서
세 지점(`createDefectAt` 1782행, `commitCreateShape` 1863행, `pendingSketchToNewDefect` 1962행)
모두 `...EMPTY_DEFECT_ATTRS, ...newDefectBase(...), ...(ctx.defaultAttrs ?? {})` 순서로 동일하다.
`ctx.defaultAttrs` 는 타입이 `Partial<DefectAttrs>`(interaction.ts:111)로 제한돼 있어 설령 순서가
바뀌어도 `DefectBase` 필드를 덮어쓸 방법 자체가 타입상 없다 — 그래도 실제 순서도 요구대로 스탬프가
나중에 온다. 반대 순서인 곳은 없다.

### 5. Undo/Redo 왕복 — ✅ 확인됨, 훼손 없음(의도된 재스탬프)
`store.ts` `UNDO`/`REDO` → `recordCommandWrites` → `defectTargetOf(c)` 로 **되돌려진 커맨드가 원래
건드렸던 결함 하나만** `writes.upsert` 에 올라간다. 캔버스 코어는 편집 시점에 `updatedAt` 을 갱신하지
않는 설계(스탬프는 오직 `repo.ts` 쓰기 시점에만 찍힌다)이므로, Undo로 되돌아간 결함 객체가 다시
저장될 때 `stampDefect` 가 `updatedAt`=현재시각·`deviceId`=현재기기로 새로 찍는다. 이는 "이 기기가
지금 로컬 상태를 이렇게 확정했다"는 LWW 관점에서 올바른 동작이다(Undo도 로컬의 실제 쓰기다).
`stampDefect` 는 `{...d, updatedAt, deviceId}` 만 갈아 끼우고 `createdBy` 는 절대 건드리지 않으므로
작성자 정보는 Undo/Redo 를 거쳐도 원본 그대로 보존된다(테스트 "원본을 변형하지 않는다"·
"이미 값이 있는 결함은 건드리지 않는다"로 간접 확인됨). 훼손 없음.

### 6. `W5`(`repo.listDefects()` 미정규화)의 안전성 — ✅ 확인됨, 이번 배치 범위에서 안전
`grep -rn "listDefects("` 결과 호출처는 `apps/web/src/routes/Settings.tsx:112` 단 하나다. 그 값
(`ds`)은 `setDefects(ds)` 로만 쓰이고, 이어서 `countDefectsUsing(defects, ...)` (읽기 전용 카운트)에만
소비된다 — 어디서도 다시 저장(`upsertDefects` 등)되지 않는다. builder 의 주장과 일치한다.
ASSUMPTIONS W5 가 "동기화(T1-7/T1-8)가 이 함수를 재사용하면 그때 정규화를 붙여야 한다"고
못 박아둔 것도 적절하다 — 지금 당장 고칠 이유는 없다.

### 7. canvas-core 경계 규칙(window/document/React 미참조) — ✅ 확인됨
`defectBase.ts`·`interaction.ts` 변경분에서 `Date.now()`/`window.`/`document.` 실제 호출은 0건
(주석에만 등장). `defectBase.ts` 는 `./types.js` 외 다른 임포트가 없고 순수 함수만 export 한다.
`packages/canvas-core/package.json` 에 새 의존성도 추가되지 않았다(`git show 64fc3fe --stat` 로 확인,
`package.json` 변경분 없음).

## 지적 사항

### [경미] `writeRenormalize` 배치 내 `stampDefect` 타임스탬프가 결함마다 미세하게 다르다
- 파일: `apps/web/src/data/idb/repo.ts:591`
- 문제: `for (const d of defects) ds.put(this.stampDefect(d));` — `stampDefect(d, now = Date.now())`
  의 기본 매개변수가 **호출마다** 평가되므로, 같은 트랜잭션에서 재정규화되는 결함들이 서로 몇 ms씩
  다른 `updatedAt` 을 받는다. `upsertDefects`(446행)와 `duplicateStructure`(630행)는 루프 밖에서
  `const now = Date.now()` 를 한 번만 잡아 배치 전체에 동일하게 쓰는 것과 대조된다.
- 재현: 한 도면 재정규화로 결함 50건이 동시에 좌표 이동 → 50개의 `updatedAt` 이 모두 미세하게 다름.
  LWW 판정 자체는 깨지지 않는다(모두 "지금 이 기기가 방금 처리함"이라는 사실은 맞다) — 다만 "같은
  작업으로 묶인 변경"이라는 의미가 값에서는 안 드러난다.
- 영향: 도메인 불변식 위반 아님. 병합 정확성에도 영향 없음(모두 유효한 "방금" 값). 낮은 우선순위.
- 수정(선택): `writeRenormalize` 시작부에서도 `const now = Date.now()` 를 한 번 잡아
  `this.stampDefect(d, now)` 로 명시 전달하면 다른 두 경로와 통일된다.

## 불변식 검수표

| # | 불변식 | 결과 | 근거 |
|---|---|---|---|
| 2 | 출력번호(`defectNo`/`photoNo`) 미저장 | 영향 없음(범위 밖) | 이번 diff 는 `DefectBase` 3필드만 추가. `types.ts` diff 에 출력번호 필드 신설 없음 |
| — | LWW 병합 기준값 존재 | ✅ 충족 | `DefectBase.updatedAt` 신설, §2 가 지적한 결함 해소 |
| — | 옛 레코드 안전 정규화(DB_VERSION 불변) | ✅ 충족 | `normalizeDefectBase` 가 optional 필드 + 읽기 정규화 패턴. `db.ts` 미수정 확인(diff에 없음) |
| — | 감사 추적(`createdBy`) 재료 존재 | ✅ 충족(값은 로그인 전까지 `null`, D23 대로) | `newDefectBase` 세 번째 인자, 현재 전부 미호출 → `null` |

## 확인하지 못한 것

- IndexedDB 실제 왕복(브라우저 실행) — builder 로그도 동일하게 명시. 이 배치는 화면 변화가 없는
  데이터 필드 추가라 사용자의 "직접 확인해주실 것" 체크리스트(7항목)로 위임하는 것이 타당하다.
- `db.ts`(DB_VERSION 정의)를 직접 열어 값이 실제로 그대로인지는 이번 diff 범위 밖이라 재확인하지
  않았다 — `git show 64fc3fe --stat` 에 `db.ts` 가 아예 없는 것으로 "안 건드렸다"는 주장은 충분히
  검증됨.
- T1-3(삭제 전파)·T1-7/8(서버·동기화 실행기)은 이번 커밋 범위가 아니므로 검수하지 않았다(스코프대로).
