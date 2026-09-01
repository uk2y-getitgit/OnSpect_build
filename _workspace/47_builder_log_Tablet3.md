# 구현 로그 — 태블릿 배치3 · T-7 (G-8)

**범위:** `_workspace/00_input/scope_TabletFeedback0901.md` **T-7 만.** T-1~T-6 은 손대지 않았다.
**브랜치:** `feat/photo-polish`
**커밋:** `d2f03ec` — *T-7(G-8) 전차결함에 현회차 사진 추가 시 금차분(CURRENT) 전환*
(로그 파일 자체는 뒤따르는 커밋)

---

## 완료

| # | 작업 | 파일 | 상태 |
|---|---|---|---|
| 1 | 사진 추가만 `PREV_PENDING` 에 허용 — `canAddPhotos()` 신설 | `packages/canvas-core/src/defectGeom.ts` | ✅ |
| 1 | 추가 버튼을 전체 잠금에서 분리 — `addDisabled` prop | `apps/web/src/ui/photos/PhotoSection.tsx` | ✅ |
| 1 | 배선 `addDisabled={!canAddPhotos(selected)}` | `apps/web/src/routes/CanvasRoute.tsx` | ✅ |
| 2 | 상태 전이 커맨드 `SET_DEFECT_STATUS` (apply·invert·describe) | `packages/canvas-core/src/commands.ts` | ✅ |
| 2 | 스토어 액션 `SET_DEFECT_STATUS` + 허용 전이 화이트리스트 | `apps/web/src/store.ts` | ✅ |
| 2 | `addFiles` 반환형 `Promise<void>` → `Promise<number>` (등록 장수) | `apps/web/src/data/usePhotos.ts` | ✅ |
| 2 | 사진 추가 성공 시 전이 — `addPhotosTo()` | `apps/web/src/routes/CanvasRoute.tsx` | ✅ |
| 3 | 색상·범례·출력 포함여부 자동 반영 **확인** (아래 §점검) | — | ✅ 손댈 곳 없음 |
| 4 | `[전회차로 되돌리기]` 버튼 + 전회차 안내 문구 갈래 | `apps/web/src/ui/Inspector.tsx` | ✅ |
| 5 | Undo(Ctrl+Z) 포함 — 기존 커맨드와 동일 경로 | `commands.ts` · `store.ts` | ✅ |
| — | 단위 테스트 10개 | `packages/canvas-core/test/tabletT7.test.ts` | ✅ |
| — | 가정 U40~U44 기록 | `_workspace/ASSUMPTIONS.md` | ✅ |

**변경 파일 8개 · 신규 1개.** `packages/project-core/src/repo.ts` 는 **한 줄도 바뀌지 않았다**
(사진 승계 K13 은 범위 밖 — 지시대로 `copyStructure` 미접촉).

---

## 판단 근거 (왜 이렇게 만들었는가)

### 1. `isLocked` 를 고치지 않았다 — 문을 따로 냈다 (U40)

`isLocked` 는 여섯 경로가 공유하는 게이트다 (`interaction.ts` 437·785·800·819·1053·2132·2149,
`store.ts` `setDefectAttrs`). 여기를 넓히면 A8("전회차는 선택만")이 통째로 무너진다.

```ts
// defectGeom.ts — isLocked 는 그대로. 사진 추가 전용 판정만 추가
export function canAddPhotos(defect: Defect): boolean {
  return defect.status === 'CURRENT' || defect.status === 'PREV_PENDING';
}
```

`REPAIRED` 는 계속 막는다 — 스코프가 전환 대상으로 `PREV_PENDING` 만 지목했다.

`PhotoSection` 도 `disabled` 를 통째로 뚫지 않고 **`+ 사진 추가` 버튼 하나만** 분리했다.
대표지정·회전·교체·삭제·순서변경·미리보기 편집은 여전히 `disabled` 를 따른다.
(파일 드롭존은 원래 없다 — 이 컴포넌트의 drag/drop 은 썸네일 **순서 변경** 전용이다.)

### 2. 상태는 속성이 아니다 — 새 커맨드로 분리 (U41)

`SET_DEFECT_ATTRS` 에 얹지 않았다. 두 가지 이유:
- `DefectAttrs` 에 `status` 가 없다(폼은 상태를 모른다 — K15 경계)
- `setDefectAttrs` 는 `isLocked` 로 조기 반환한다 → **전회차에서는 영원히 안 먹는다**

```ts
| { k: 'SET_DEFECT_STATUS'; defectId: string; from: DefectStatus; to: DefectStatus }
```

`defectTargetOf` 의 기본 갈래(`return c.defectId`)에 걸리므로 저장 대기열(`recordWrite` →
`upsert`)과 Undo 스택에 **추가 배선 없이** 올라탄다. 병합은 하지 않는다 — 전이 한 번이 Undo 한 단계다.

### 3. 잠금 게이트 대신 허용 전이 화이트리스트 (U42)

이 커맨드는 잠금의 *근거*를 바꾸는 유일한 통로라 `isLocked` 로 막을 수 없다. 대신:

```ts
const allowed =
  (d.status === 'PREV_PENDING' && to === 'CURRENT') ||
  (d.status === 'CURRENT' && to === 'PREV_PENDING');
if (!allowed) return state;
```

`REPAIRED` 가 얽힌 전이는 조용히 무시된다. Undo/Redo 는 `applyCommand` 를 직접 타므로
이 화이트리스트에 걸리지 않는다(정상 — 이미 통과한 전이의 역방향이다).

### 4. "사진 추가가 성공하면" 을 실제로 판정했다 (U44)

`addFiles` 가 `Promise<void>` 라 호출자가 성공을 알 수 없었다. 반환형을 등록 장수로 바꿨다.

파일이 전부 거절되거나(형식·용량 초과) `registerPhotos` 가 실패했는데 색만 빨갛게 바뀌면
**사진 없는 금회차 결함**이 보고서로 나간다. 그래서 `added > 0` 일 때만 전이한다.

`await` 앞뒤로 상태가 바뀔 수 있으므로 **호출부에서 `selected.status` 를 읽어 분기하지 않는다.**
전이 가능 여부 판정은 최신 상태를 보는 리듀서가 한다(이미 `CURRENT` 면 조용히 무시 + 토스트도 안 뜸).

### 5. 되돌리기 버튼 — 문구·위치·표시 조건 (U43)

- **문구:** `전회차로 되돌리기`
- **위치:** Inspector 하단 액션줄, `번호 위치 초기화` 와 `결함 삭제` **사이**. 파괴적이지 않으므로
  `btn`(기본), 삭제(`btn--danger`) 앞
- **표시 조건:** `status === 'CURRENT'` **그리고** `prevDefectId !== null`
  → 이번 회차에 새로 그린 결함에는 뜨지 않는다. 있지도 않은 "전회차" 로 보내면
  `includePrevPending` 필터에서 **출력에서 통째로 빠진다**
- **사진 유무는 조건에 넣지 않았다** — 스코프 4번 *"사진 삭제 여부와 무관하게 항상 가능"*
- N8 그대로 **자동 되돌림은 없다.** 사진을 다 지워도 `CURRENT` 로 남는다

전회차 안내 문구도 갈랐다:
- `PREV_PENDING` → "값은 고칠 수 없지만, **이번 회차에 찍은 사진을 추가하면** 금회차 결함으로 전환됩니다"
- `REPAIRED` → "보수완료 표기입니다. 이 화면에서는 **선택만** 가능하며…" (기존 문구, 대상만 정정)

---

## 요구사항 3 — "손댈 곳이 있는지 점검" 결과

| 항목 | 어디서 status 를 읽는가 | 결론 |
|---|---|---|
| 마커 색 (보라 → 빨강) | `style.ts:61` `global.statusColor[defect.status]` — **매 렌더 파생**, 캐시 없음 | 손댈 곳 없음. 테스트로 고정 |
| 잠금 해제 | `defectGeom.ts` `isLocked(d) = d.status !== 'CURRENT'` | 자동 |
| 좌측 범례 카운트 | `Sidebar.tsx:52` `defects.filter(d => d.status === 'PREV_PENDING' \|\| 'REPAIRED')` | 자동 |
| 도면 범례 항목 | `legend.ts:109·113` — `defects.some(d => d.status === kind)` | 자동 |
| 출력 포함 여부 | `project-core/export/numbering.ts:216` `if (status === 'PREV_PENDING') return p.includePrevPending` | 자동 |
| 리스트/유사결함 배지 | `CanvasRoute.tsx:512` · `styles.css[data-status]` | 자동 |
| **영속화** | `store.ts` `recordWrite` 가 **결함 레코드 전체**를 upsert 대기열에 올린다 | 자동 (`defectTargetOf` 기본 갈래) |

**결론: 별도로 손댈 곳 없음.** 전이만 되면 전부 따라온다. 이것을 우연에 맡기지 않으려고
`tabletT7.test.ts` 에 색 전환(`STATUS_COLOR.PREV_PENDING → CURRENT`)과 저장 대기열 인식
(`defectTargetOf`)을 회귀 테스트로 못박았다.

---

## 미완료 / 막힌 것

없다. 질문(QUESTIONS.md)에 새로 올린 것도 없다 — 스코프가 T-7 을 비차단으로 확정했고
재량 항목(버튼 문구·위치)은 U43 에 기록했다.

---

## 검증한 것

| 검증 | 결과 |
|---|---|
| `npm run typecheck` (canvas-core · project-core · web) | ✅ 통과 |
| `npm test` | ✅ **667개 전부 통과** (canvas-core 360 · project-core 307). 신규 10개 포함 |
| `npm run build` (vite 프로덕션) | ✅ 통과, 239 모듈 |
| 신규 테스트 `tabletT7.test.ts` | 10개 — 잠금 예외 3 · 커맨드 7 |
| 회귀 확인 | 기존 357개 무변경 통과. `isLocked` 시맨틱을 안 바꿨으므로 A8 테스트가 그대로 산다 |

브라우저·개발서버는 띄우지 않았다 (규칙대로).

---

## 직접 확인해주실 것

전회차 결함이 필요하다 → 용역 생성 시 **전차 용역 선택 + "결함까지 가져오기" 체크**
(`ProjectForm`) 로 만든 용역에서 확인한다.

| # | 무엇을 | 어떻게 | 무엇이 보여야 정상 |
|---|---|---|---|
| 1 | 전회차 결함 선택 | 도면의 **보라색** 마커를 탭 | 우측 패널 안내가 *"값은 고칠 수 없지만, 이번 회차에 찍은 사진을 추가하면 금회차 결함으로 전환됩니다"*. 결함정보 폼은 여전히 회색(잠김) |
| 2 | **사진 추가 버튼이 살아 있는가** | 우측 패널 사진 섹션의 `+ 사진 추가` | **눌린다**(회색이 아님). 마우스를 올리면 전환 안내 툴팁 |
| 3 | ⭐ **전이** | 사진 1장 이상 고르기 | ① 마커가 **보라 → 빨강** ② 상단 배지 *전회차 미보수 → 현회차* ③ 잠김 안내가 사라지고 폼이 **편집 가능** ④ 토스트 *"이번 회차 사진이 붙어 금회차 결함으로 전환했습니다"* |
| 4 | 범례·카운트 | 좌측 사이드바 / 도면 범례 | 전회차 수 −1, 금회차 수 +1 |
| 5 | ⭐ **Undo** | 전환 직후 `Ctrl+Z` (또는 토스트의 `[되돌리기]`) | 다시 **보라색**·잠김으로 복귀. 되돌리기 안내에 *"금회차로 전환"* 이라고 뜬다. **사진은 그대로 남는다**(사진 추가는 별도 시스템 — 의도된 동작) |
| 6 | Redo | `Ctrl+Shift+Z` | 다시 빨강·금회차 |
| 7 | **되돌리기 버튼** | 전환된 결함의 우측 패널 하단 | `번호 위치 초기화` 와 `결함 삭제` 사이에 **`전회차로 되돌리기`** 가 있다. 누르면 보라·잠김 + 토스트 *"전회차 미보수로 되돌렸습니다"* |
| 8 | 버튼이 **안 떠야** 하는 곳 | 이번 회차에 **새로 그린** 결함을 선택 | `전회차로 되돌리기` 가 **없다** (전회차 출신이 아니므로) |
| 9 | 사진을 다시 지워보기 | 전환된 결함의 사진을 전부 삭제 | 상태는 **금회차(빨강) 그대로 유지**. 자동으로 보라로 안 돌아간다 (N8 — 의도된 동작) |
| 10 | 보수완료 결함 | 회색 마커 선택 | `+ 사진 추가` 가 **여전히 회색**(잠김). 툴팁 *"보수완료 표기에는 사진을 추가할 수 없습니다"* |
| 11 | 새로고침 후 유지 | 3번 직후 F5 | 빨강·금회차가 **그대로** (저장 대기열이 결함 레코드를 upsert 한다) |
| 12 | 출력 반영 | 출력 화면에서 `전회차 포함` 끄고 미리보기 | 전환된 결함이 **결함표·리스트에 나온다**(전환 전에는 빠졌었다) |
| 13 | 금회차 결함 회귀 | 평소처럼 결함 그리고 사진 추가 | 아무것도 안 바뀌었다. 토스트도 *"사진 N장을 추가했습니다"* 하나만 |

---

## 알려진 한계

1. **사진 승계(K13)는 여전히 없다.** 전회차 결함으로 승계되는 것은 **레코드뿐**이고 사진은
   복사되지 않는다(`repo.ts:590` 주석 그대로). 이번 범위가 아니라 **의도적으로** 안 만들었다.
   따라서 전회차 결함의 사진 섹션은 항상 0장에서 시작한다.
2. **사진 삭제는 Undo 대상이 아니다.** 3번 시나리오를 `Ctrl+Z` 하면 **상태만** 되돌아가고
   방금 붙인 사진은 남는다. 사진은 원래 커맨드 스택 밖(자체 10초 되돌리기 토스트)이라
   합치려면 사진 시스템 전체를 커맨드화해야 한다 — 범위를 크게 넘는다.
3. **`REPAIRED` → `CURRENT` 통로는 없다.** 보수완료 결함에 사진을 붙여 되살릴 수 없다.
   스코프가 `PREV_PENDING` 만 지목했다.
4. **전이 조건은 "사진 1장 이상"이지 "대표사진"이 아니다.** 현재 `normalizePhotos` 가
   첫 장을 자동 대표로 만들므로 실질 차이는 없다(불변식 8).

## 눈에 띄었지만 고치지 않은 것 (수정 여부는 사용자 결정)

- `PhotoSection` 빈 상태 문구 *"아직 사진이 없습니다. + 사진 추가 로…"* 는 `REPAIRED`
  결함에서도 그대로 뜬다(버튼은 잠겨 있는데 추가를 권한다). **기존 동작이고 T-7 범위 밖이라
  손대지 않았다.**
