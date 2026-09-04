# 검수 결과 — U-2 캔버스 토스트 정리 (58d35fd + d411925)

## 판정
**통과**

## 검수 방법
- `git show 58d35fd -- packages/canvas-core/src/interaction.ts` 전체 diff 대조
- `git show d411925 -- packages/canvas-core/src/interaction.ts` 전체 diff 대조
- 현재 `interaction.ts` 전체에서 `k: 'TOAST'` 잔존 지점 16곳을 전부 읽어 `scope_UIPolish0902.md` U-2 표
  (삭제+되돌리기/경고·안내 = 유지, 성공확인 = 제거)와 1:1 대조
- 제거된 16곳(58d35fd 14곳 + d411925 2곳) 전부에서 원래 같이 나가던 `Command`가 `ok()` 호출에
  그대로 남아있는지 코드로 직접 확인 (`SET_MEMO_TEXT`·`SET_STYLE`·`MOVE_MEMO`·`SET_MARK_GEOMETRY`·
  `MOVE_SKETCH`·`MOVE_LABEL`·`MOVE_MARK`·`CREATE_DEFECT`(+`REVEAL_DEFECT`)·`CREATE_MEMO`·`RESET_LABEL`)
- `pushHistory(h, c: Command)` (`commands.ts:572`) 를 확인해 Undo 스택이 커맨드 기반이고 `Effect`(TOAST 포함)와
  무관함을 코드로 검증 — builder 주장과 일치
- `toastPolicy.test.ts` 15케이스 전체를 읽고 실제 assertion(커맨드 종류·개수, 토스트 0개, `REVEAL_DEFECT` 잔존)이
  구체적인지 확인
- 저장소 전체에서 제거된 16개 옛 토스트 문구 리터럴을 검색해 정리 안 된 테스트 잔재가 있는지 확인
- 독립적으로 재실행: `npm run typecheck`(0 오류) · `npm test`(canvas-core 22파일/383개 + project-core 15파일/308개,
  총 691개 통과) · `npm run build`(성공) — 전부 builder 주장과 일치

## 지적 사항
없음 (심각/보통 0건).

### [경미] toastPolicy.test.ts 가 16곳 중 5곳(MOVE_MEMO·MOVE_SKETCH·MOVE_MARK·SET_MARK_COLOR·RESIZE_SHAPE)의
"토스트 0 + 커맨드 그대로"를 전용 케이스로 고정하지 않는다
- 파일: `packages/canvas-core/test/toastPolicy.test.ts`
- 문제: 15케이스는 메모저장·영역스타일·초기화·번호초기화·점/영역 생성·필기메모·그리기완료·그리기취소·번호풍선이동만
  다룬다. 도형이동(`MOVE_MARK`)·스케치이동(`MOVE_SKETCH`)·메모이동(`MOVE_MEMO`)·색변경(`SET_MARK_COLOR`)·
  크기변경(`RESIZE_SHAPE`)은 이 파일에 없다 — 다른 기존 테스트 파일(`interaction.test.ts`·`s2a.test.ts`·
  `phase5TrackA.test.ts` 등)이 해당 커맨드 발생 자체는 검증하지만, "토스트가 사라졌는데도 커맨드는 여전히
  나가는가"를 U-2 관점에서 명시적으로 고정하지는 않는다
- 재현: 코드 직접 대조로는 이 5곳 전부 커맨드가 정상 유지됨을 확인했다(현재 버그 아님). 다만 향후 누군가
  실수로 이 5곳 중 하나에서 커맨드까지 같이 지워도 `toastPolicy.test.ts`는 잡아내지 못한다(회귀 방지망 공백)
- 수정: 필수는 아니나, `MOVE_MARK`/`MOVE_SKETCH`/`MOVE_MEMO`/`SET_MARK_COLOR`/`RESIZE_SHAPE` 각각에 대해
  "토스트 0개 + 커맨드 kind 그대로" 케이스를 `toastPolicy.test.ts`에 추가하면 회귀 방지망이 완전해진다

## 커맨드 누락 여부 — 20곳 개별 대조표

| 조작 | 제거된 토스트 | 남은 Command | 코드 확인 |
|---|---|---|---|
| 메모 글 저장 | 메모가 저장되었습니다 | `SET_MEMO_TEXT` | O (`interaction.ts:780`) |
| 영역 모양·채움 | 영역 모양을 바꿨습니다 | `SET_STYLE` | O (`:793`) |
| 색상 변경 (Q62/d411925) | 색을 바꿨습니다 / 색을 상태 기본값으로 되돌렸습니다 | `SET_STYLE` | O (`:800`) |
| 스타일 초기화 | 전체 설정으로 되돌렸습니다 | `SET_STYLE` | O (`:809`) |
| 〃(이미 기본값) | 이미 전체 설정을 따르고 있습니다 | (원래도 없음) | O — 원래도 커맨드 없었음 |
| 그리기 취소(버튼) | 그리기를 취소했습니다 | (원래도 없음) | O |
| 그리기 취소(Escape) | 그리기를 취소했습니다 | (원래도 없음) | O (`:2171`) |
| 메모 이동 | 메모를 옮겼습니다 | `MOVE_MEMO` | O (`:1614`) |
| 도형 이동 | 표기 위치가 변경되었습니다 | `SET_MARK_GEOMETRY` | O (`:1636~1651`) |
| 도형 크기변경 (Q62/d411925) | 표기 크기가 변경되었습니다 | `SET_MARK_GEOMETRY` | O (같은 반환문, 배열만 `[]`로) |
| 그리기 획 이동 | 그리기를 옮겼습니다 | `MOVE_SKETCH` | O (`:1663`) |
| 번호 풍선 이동 | 번호 위치가 변경되었습니다 | `MOVE_LABEL` | O (`:1679`) |
| 점 표기 이동 | 표기 위치가 변경되었습니다 | `MOVE_MARK` | O (`:1697`) |
| 점 표기 생성 | 표기가 추가되었습니다 | `CREATE_DEFECT`+`REVEAL_DEFECT` | O (`:1747~1752`) |
| 영역·방향 생성 | 표기가 추가되었습니다 | `CREATE_DEFECT`+`REVEAL_DEFECT` | O (`:1828~1834`) |
| 그리기 완료→새 결함 | 그리기로 새 결함을 만들었습니다 | `CREATE_DEFECT`+`REVEAL_DEFECT` | O (`:1926~1934`) |
| 필기 메모 생성 | 메모를 추가했습니다 | `CREATE_MEMO` | O (`:1990`) |
| 번호 위치 초기화 | 번호 위치를 초기화했습니다 | `RESET_LABEL` | O (`:2062~2070`) |
| 〃(이미 자동배치) | 이미 자동 배치 상태입니다 | (원래도 없음) | O |

20곳 전부 확인 — 커맨드가 함께 빠진 곳 **0건**.

## 유지되어야 할 토스트 대조 — 전부 남아 있음

`interaction.ts` 현재 코드에서 `k: 'TOAST'` 로 검색되는 16개 발생 지점을 전부 스코프 표와 대조:

- **삭제+되돌리기**(6): 빈 메모를 지웠습니다(`:776`) · 결함이 삭제되었습니다(`:868`) ·
  필기를 지웠습니다/필기 N획을 지웠습니다(`:1590`) · 메모가 삭제되었습니다(`:2086`) ·
  그리기가 삭제되었습니다(`:2108`) · 표기가 삭제되었습니다(`:2144`) — 전부 `undoable: true` 그대로
- **경고/안내**(9): 필기 메모입니다…(`:706`) · 도면 안쪽에서 시작해 주세요×2(`:1146`,`:1169`) ·
  도면 안쪽을 클릭해 주세요(`:1715`) · 끌어서 방향을 정해 주세요(`:1778`) · 끌어서 크기를 지정해 주세요(`:1788`) ·
  너무 작아 적용하지 않았습니다(`:1638`) · 끌어서 선을 그려 주세요(`:1853`) · 끌어서 메모를 써 주세요(`:1958`) ·
  전회차 표기는 삭제할 수 없습니다×2(`:2097`,`:2114`)
- **대기 상태 안내**(1, Q62로 유지 확정): 그리기 1획.../그리기 N획 대기 중(`:1872`)

스코프 표·builder log 의 "유지" 목록과 완전 일치. 실수로 같이 지워진 것 없음.

## toastPolicy.test.ts 15케이스 — 껍데기 여부

전부 실제 assertion 존재. 확인한 패턴:
- `kinds(r.commands)).toEqual([...])` 로 커맨드 **종류와 개수**를 정확히 고정 (단순 `toHaveLength`보다 강함)
- `toasts(r.effects)).toHaveLength(0)` 으로 토스트 부재를 고정
- 생성 3케이스는 `REVEAL_DEFECT` 잔존까지 별도 단언 (`r.effects.some(...)`)
- "이미 기본값"/"이미 자동배치" 2케이스는 커맨드·토스트 둘 다 0임을 확인해 조용한 조기 리턴 회귀도 잡는다
- 두 번째 `describe` 3케이스는 반대로 "유지" 분류가 여전히 뜨는지(개수 1 또는 `some(warn)`)를 확인

빈 케이스나 assertion 없는 `it` 없음.

## Undo(Ctrl+Z) 가 토스트와 무관하다는 주장 검증

- `interaction.ts:2185` `Ctrl+Z` → `{ k: 'UNDO' }` **Effect** 방출 (Command 아님)
- `commands.ts:572 pushHistory(h, c: Command)` — Undo 스택(`history.undo`)은 `reduceCore`가 반환한
  `commands` 배열만으로 쌓인다. `Effect`(TOAST 포함)는 이 함수의 인자에 들어가지 않는다
- 즉 토스트를 없애도 `commands` 배열이 그대로면 Undo 스택도 그대로 — builder 주장이 코드로 확인됨

## 재실행 검증 (독립 재현)

| 항목 | 결과 |
|---|---|
| `npm run typecheck` | 0 오류 (canvas-core·project-core·web) |
| `npm test` (canvas-core) | 22 파일 / 383 테스트 통과 (toastPolicy.test.ts 15건 포함) |
| `npm test` (project-core) | 15 파일 / 308 테스트 통과 |
| `npm run build` | 성공 |
| 제거된 16개 옛 토스트 문구를 저장소 전체에서 검색 | `toastPolicy.test.ts` 자기 자신 외 0건 — 정리 누락 없음 |

## 불변식 검수표

이 diff 는 도면 좌표·번호계산·DB 스키마·오프라인 동기화·사진 대표지정과 무관한 UI 이펙트 정리라
8개 불변식 대부분이 해당 없음. 관련 가능성이 있는 항목만 표기.

| # | 불변식 | 결과 | 근거 |
|---|---|---|---|
| 3 | 로컬 우선 쓰기 / 서버 await 없음 | 해당없음 | 이 diff 는 리듀서의 Effect(TOAST) 제거뿐, 쓰기 경로 변경 없음 |
| 그 외 1,2,4~8 | — | 해당없음 | 이 diff 범위 밖 |

## 확인하지 못한 것

- **실제 화면에서 토스트가 안 뜨는지** 눈으로 확인하지 않았다(스킬 규칙상 브라우저·개발서버 미실행).
  코드상 `k: 'TOAST'` effect 가 만들어지지 않으면 `Toasts` 컴포넌트가 아무것도 렌더링하지 않는다는
  것까지만 정적으로 확인했다.
- `CanvasRoute.tsx`/`ui/Overlays.tsx` 의 `Toasts` 렌더 로직 자체는 이번 diff 에서 변경되지 않았으므로
  깊게 재검토하지 않았다(범위 밖 — U-2 는 `interaction.ts`의 이펙트 발생부만 건드림).
