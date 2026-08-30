# 구현 로그 — 배치4 검수 반영 (39_code-reviewer_findings_Batch4.md §8)

대상: 심각1 · 보통1 · 보통2 + 여유분 경미2. 기준 문서 `39_code-reviewer_findings_Batch4.md`.
**새 기능을 만들지 않았다.** 지적된 네 지점만 고치고 회귀 테스트로 못 박았다.

## 완료

| # | 작업 | 파일 | 상태 |
|---|---|---|---|
| 1 | [심각1] `MOVE_MEMO` 를 상자가 아니라 `memo.pos` 기준 **순수 델타**로 (권장안 B) | `packages/canvas-core/src/interaction.ts` (POINTER_DOWN · MEMO 분기) | 완료 |
| 1b | 같은 이유로 **미리보기 렌더**도 델타 기준으로 | `packages/canvas-core/src/memoGeom.ts` (`memoScreens`) | 완료 |
| 2 | [보통1] `RESTORE_MEMO_PATH` 재삽입을 index 오름차순 → **시간 역순** | `packages/canvas-core/src/commands.ts` (`applyMemoCommand`) | 완료 |
| 3 | [보통2] `[유사결함 불러오기]` 토스트에 "규모 입력 방식도 함께 바뀝니다" 보강 | `apps/web/src/routes/CanvasRoute.tsx` | 완료 |
| 4 | [경미2] ERASER pointerdown 에서 `selection` 비우기 | `packages/canvas-core/src/interaction.ts` | 완료 |
| 5 | 회귀 테스트 6건 추가 (`D14-e` 4건 + `D14-d` 선택해제 1건 + 미리보기 1건) | `packages/canvas-core/test/eraser.test.ts` | 완료 |

### 1 · [심각1] 메모가 엉뚱한 곳으로 튀는 문제

근본 원인은 **기준점 불일치** 하나였다.

- 커밋은 원래부터 `from: memo.pos → to: previewNorm` **델타**로 나간다(`commands.ts` `MOVE_MEMO`).
- 그런데 드래그 시작 시 `grabOffsetScreen` 을 `MemoScreen.box`(남은 획의 bbox − `MEMO_BOX_PAD`)에서 잡았다.
- 따라서 `previewNorm` 은 "상자가 갈 자리" 인데 델타는 `pos` 에서 뺀다 → **`pos` 와 상자가 어긋난 만큼이
  이동량에 그대로 더해진다.** 지우개가 왼쪽 획을 지우면 `pos`(앵커)는 그대로인데 bbox 만 오른쪽으로
  밀려, 남은 글씨를 조금만 끌어도 멀리 튀었다.

**고친 방식 (검수자 권장안 B):**

```ts
const anchor = toScreen(memo.pos, next0.viewport, iw, ih);
grabOffsetScreen: { x: anchor.x - ev.screen.x, y: anchor.y - ev.screen.y }
```

이러면 `previewNorm = pos + Δ` 가 되어 **순수 델타**가 된다. `pos` 가 실제 bbox 와 달라도(지우개 뒤
staleness) 무해하다 — `applyMemoCommand` 는 이미 델타만 쓴다. 대안 A(커맨드에 이전 `pos` 를 실어
`RESTORE_MEMO_PATH` 가 복원)는 시도하지 않았다. B 로 충분했고 payload 를 또 늘릴 이유가 없다.

**함께 고친 것 — 미리보기(`memoGeom.memoScreens`).** `preview.pos` 의 의미가 "상자 좌상단" 에서
"`memo.pos` 의 미리보기 위치" 로 바뀌었으므로, 상자를 `preview.pos` 에 **놓는** 대신
`Δ = preview.pos − toScreen(m.pos)` 로 상자·획을 함께 **민다.** 이걸 같이 안 고치면 드래그 중 그림이
튀고 손을 뗀 뒤 제자리로 돌아오는 더 나쁜 증상이 된다.

부수 효과로 **지우개를 쓰지 않아도 있던 `MEMO_BOX_PAD`(6 이미지 px) 오차도 사라졌다.**
텍스트 메모는 `box.x == toScreen(pos).x` 라 동작이 **완전히 동일**하다(기존 테스트 그대로 통과).

### 2 · [보통1] Undo 가 획 순서를 뒤바꾸던 문제

`index` 는 **지운 그 시점의 배열** 기준으로 기록된다. 연속 삭제의 올바른 역연산은 index 오름차순이
아니라 **역-시간순**이다. `mergeEraseCommand` 가 `[...prev.items, ...next.items]` 로 시간순을 보존하므로
`.sort()` 를 빼고 `.reverse()` 로 순회한다. `Math.min` 클램프는 방어용으로 유지.

검수자가 손으로 검산한 두 케이스를 **그대로 테스트로 고정**했다(실제 드래그를 재현해서 만든다).

### 3 · [보통2] `sizeMode` 만 복사되는 문제 → 추천 A(토스트 문구 보강)

`…의 분류·판정을 불러왔습니다. **규모 입력 방식(폭×길이/면적)도 함께 바뀌니** 규모·개소·메모는
다시 입력하세요` 로 바꿨다. 동작은 스펙 §5-4(a) 그대로 유지(14필드 표가 단일 진실).

### 4 · [경미2] 지우개 모드의 `Delete` 오삭제 방지

ERASER pointerdown 에서 `selection: { ...NO_SELECTION }`. 도구와 선택이 독립이라는 기존 규칙을
**지우개에서만** 깬다 — D14 의 "다른 것은 절대 안 지운다" 를 지키기 위해서다.

## 미완료 / 막힌 것

없다. 지적된 항목은 전부 처리했다.
검수 [경미1](파일 위치)·[경미3](지우개 세그먼트 판정)·[경미4](1점 획 방어)·[경미5](미사용 상수)는
검수자가 수정을 요구하지 않았고 이번 수정 범위 밖이라 **손대지 않았다.**

## 검증한 것

- **타입 검사 3워크스페이스 0 오류** — `npm run typecheck` (canvas-core · project-core · web)
- **단위 테스트 644건 통과** — canvas-core 337(+6) · project-core 307
- **프로덕션 빌드 통과** — `npm run build` (239 modules, 3.82s)
- **회귀 테스트가 실제로 버그를 잡는지 역검증** — 수정을 일시적으로 되돌린 뒤 돌려서
  새 테스트 3건이 정확히 실패하는 것을 확인하고 다시 복구했다:
  - `expected 0.06 to be close to 0.0625` (pad 6px 오차)
  - `expected [ 'p1', 'p3', 'p2' ] to deeply equal [ 'p1', 'p2', 'p3' ]` (재삽입 순서)
  - 지우개 뒤 이동 델타 불일치
- 경계 규칙 — `canvas-core` 에 `window`/`document`/React 추가 참조 0, `ui/defectForm/*` 미변경,
  기하 판정은 스크린 px 유지, `DB_VERSION` 1 유지(마이그레이션 0건)

## 직접 확인해주실 것

검수자의 보강 제안 #17·#18 이 이번 수정의 핵심 확인 항목이다.

1. **획 3개 이상인 필기 메모에서 왼쪽 끝 획을 지운다 → 남은 글씨를 잡고 오른쪽으로 조금 끈다**
   → 글씨가 **손가락을 따라오고, 끈 거리만큼만** 움직여야 한다. 멀리 튀면 실패.
2. **필기 메모를 (지우개를 쓰지 않고) 그냥 조금 끌어 본다**
   → 손을 뗀 순간 글씨가 **미세하게도 움찔하지 않아야** 한다(예전 6px 오차 제거 확인).
3. **획 3개 메모에서 한 드래그로 1번째와 3번째만 지운다(가운데는 건너뜀) → Ctrl+Z**
   → 세 획이 다 돌아오고, **겹친 자리에서 위아래(그려지는 순서)가 안 뒤바뀌어야** 한다.
4. **결함을 하나 선택 → 팔레트에서 `지우개` → `Delete` 키**
   → 그 결함이 **지워지지 않아야** 한다(선택 테두리도 이미 풀려 있어야 한다).
5. **`[유사결함 불러오기]` 로 규모 방식이 다른 결함(면적↔폭×길이)을 불러온다**
   → 토스트에 "규모 입력 방식(폭×길이/면적)도 함께 바뀌니…" 안내가 보이고,
   폼의 규모 탭이 바뀐 채 비어 있어야 한다(의도된 동작 — 값을 다시 입력).
6. **텍스트 메모(옛 노란 상자)를 끌어 본다** → 예전과 똑같이 움직여야 한다(회귀 없음 확인).

## 알려진 한계

- **지우개는 여전히 포인터 샘플 지점만 검사한다**(검수 [경미3]). 아주 빠르게 문지르면 획을 건너뛸 수
  있다. 스펙 밖이라 이번에 손대지 않았다 — 올리려면 이전 샘플과 현재 샘플을 **선분**으로 이어 판정해야 한다.
- `MEMO_BOX_ALPHA` 는 여전히 미사용 공개 상수다([경미5], 범위 밖).
- `apps/web` 에는 테스트 러너가 없어 토스트 문구 변경은 **타입 검사로만** 검증됐다(문자열이라 위험 낮음).

## 가정

`_workspace/ASSUMPTIONS.md` 에 **U27**(`MOVE_MEMO` 기준점 변경 + `preview.pos` 의미 변경)·
**U28**(지우개 pointerdown 선택 해제) 로 기록했다. 둘 다 비차단이고 되돌리는 비용 0.
