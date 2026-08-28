# 구현 로그 — 배치 1 (F-1 · F-2 · R-3 커밋)

기준 스펙: `_workspace/30_plan-reviewer_spec_UserFeedback0828.md` §2-1(B1) · §2-3(B3) ·
`_workspace/29_plan-reviewer_spec_PhotoPolish.md` §2-2(R-3)
브랜치 `feat/photo-polish`, 시작 `04210f6`.

## 완료

| 작업 | 파일 | 커밋 | 상태 |
|---|---|---|---|
| F-1 keyup 가드 | `apps/web/src/canvas/CanvasView.tsx` | `634a6f7` | ✅ |
| F-1 모달 초기포커스 마운트 1회 + `.modal__x` 제외 + `onClose` ref | `apps/web/src/ui/Form.tsx` | `634a6f7` | ✅ |
| F-1 사진 미리보기 keyup 구멍 | `apps/web/src/ui/photos/PhotoPreviewDialog.tsx` | `634a6f7` | ✅ |
| F-2 자동 인쇄 제거 + `ready` 게이트 | `apps/web/src/export/printView/PrintRoute.tsx` · `apps/web/src/router.ts`(주석) | `82354d6` | ✅ |
| R-3 합성 렌더러 커밋 | `apps/web/src/data/photoCompose.ts` · `usePhotoComposite.ts` | `ac9b045` | ✅ |

### F-1 — 무엇을 왜 이렇게 했나

스펙 §2-1 의 3단 연쇄 중 **B1-a·b·c 세 개를 전부** 고쳤다.

- **B1-a** `CanvasView.tsx` `onKeyUp` 에 `isTypingTarget` 가드 추가.
  `spaceRef.current = false` 는 **가드보다 앞**에 뒀다 — 스펙이 명시한 순서다.
  입력창에서 스페이스를 떼는 경로에서 조기 반환하면 팬 상태가 눌린 채 굳는다.
  `KEY_UP` 이벤트 자체를 안 보내도 대칭이 맞는다: 같은 조건에서 `onKeyDown` 도
  `KEY_DOWN` 을 안 보냈으므로 코어의 `keys.space` 가 켜진 적이 없다.
- **B1-b** `Modal` 의 포커스 이펙트를 **`[]`(마운트 1회)** 로 분리하고,
  대상을 `.modal__scroll` 본문 우선 → 없으면 모달 전체 순으로 바꿨다.
  셀렉터에서 `button:not([disabled]):not(.modal__x)` 로 헤더의 ✕ 를 제외했다
  (`MODAL_FOCUSABLE` 상수 1개로 두 질의가 같은 규칙을 쓴다).
- **B1-c** `onClose` 를 `onCloseRef` 에 담고 키 트랩 이펙트 의존을 `[]` 로 줄였다.
  스펙은 "키 트랩은 `[onClose]` 유지"라고 적었지만, ref 로 참조를 옮기면
  의존에 남길 이유가 사라진다(남기면 인라인 콜백 때문에 이벤트 리스너가
  매 렌더 재등록된다 — B1-c 가 없애려던 바로 그 낭비다). 동작은 동일하다.
- **PhotoPreviewDialog**: 판정을 `isCanvasShortcut(e)` 순수 함수로 뽑아
  `keydown` · `keyup` **두 핸들러가 같은 조건**을 쓰게 했다. 한쪽만 고치면 같은 구멍이 다시 생긴다.
  **스페이스는 이 집합에 없다** — 삼키면 캔버스 팬이 굳으므로 의도적으로 그대로 뒀다.

**스펙이 원인 ②로 지목한 `store.ts:350`(리듀서가 매번 새 state 반환)은 건드리지 않았다.**
§2-1 의 확정 수정표(B1-a/b/c)에 없다. ①과 ③이 막히면 증상은 사라진다.
리렌더 자체는 성능 문제이지 이 버그의 필요조건이 아니다 — 범위를 넓히지 않았다.

### F-2 — 무엇을 왜 이렇게 했나

- `useEffect` 안의 `requestAnimationFrame(() => window.print())` 를 제거하고,
  `printed` ref 를 `const [ready, setReady] = useState(false)` 로 교체했다.
- `waitForImages(root)` 는 **남겼다**. 스펙 §2-3 이 요구한 대로 그 결과를 `ready` 로 노출해
  디코드 전에는 `[PDF로 인쇄]` 를 `disabled` + `이미지 준비 중…` 으로 둔다.
  자동 인쇄를 없애면서 "빈 칸이 인쇄된다" 방어를 잃지 않는 유일한 경로다.
- 버튼 라벨 `PDF로 인쇄` 는 **유지**(K1·Q32 근거 그대로). 상단 안내 문구만
  `미리보기입니다 — [PDF로 인쇄] 를 누른 뒤 인쇄 대화상자에서 "PDF로 저장" 을 선택하세요` 로 바꿨다.
- `?autoprint=1` 류 옵션은 만들지 않았다(스펙이 명시적으로 금지).
- `router.ts` 의 `EXPORT_PRINT` 주석이 "렌더한 뒤 `window.print()` 를 부른다"라고
  거짓이 되므로 함께 고쳤다(주석 1곳, 코드 변경 없음).

### R-3 — 스펙 대조 결과

`29_..._PhotoPolish.md` §2-2 와 한 줄씩 대조했다. **어긋난 곳이 없어 코드를 고치지 않고 커밋만 했다.**

| 스펙 요구 | 구현 | 판정 |
|---|---|---|
| `needsCompose(Pick<Photo,'edits'\|'annotations'>): boolean` | `hasPhotoEdits()` 위임(crop 또는 annotation) | ✅ |
| `composePhoto(src, p) → {blob,width,height}` | 반환형 `... \| null` | ✅ (스펙이 "실패 시 null" 을 함께 요구) |
| 합성 순서 원본→주석→자르기→회전 | `composeFromDecoded` 한 곳에만 존재 | ✅ |
| `decodeImage` 재사용 · `createImageBitmap` 금지 | `photoIngest.decodeImage` import | ✅ (export 승격은 `04210f6` 에서 이미 완료) |
| objectURL 은 호출자 책임 | `composePhoto` 는 Blob 만 반환 | ✅ |
| JPEG 0.9 | `COMPOSE_QUALITY = 0.9` | ✅ |
| 실패 시 예외 없이 null → 호출자 원본 폴백 | 두 진입점 모두 try/catch → null | ✅ |
| 썸네일은 합성 안 함(R1) | 훅 주석에 명시, 그리드가 쓰지 않음 | ✅ |

**아직 어디에서도 import 하지 않는다.** 지시대로 UI 배선은 하지 않았다(배치 2 R-5+R-8 소관).
빌드는 tree-shaking 으로 번들에 들어가지 않고, `tsc` 는 파일을 검사하므로 타입 안전은 지금 보장된다.

## 미완료 / 막힌 것

없음. 배치 1 범위 3건 모두 완료.

## 가정 (비차단 · `ASSUMPTIONS.md` 반영 대상)

| # | 가정 | 근거 | 되돌리는 비용 |
|---|---|---|---|
| B1-1 | 키 트랩 이펙트 의존을 `[onClose]` 대신 `[]` 로 했다 | B1-c 가 `onClose` 를 ref 로 옮기라고 지시했으므로 의존에 남길 이유가 없다. 남기면 리스너가 매 렌더 재등록된다 | 낮음(한 줄) |
| B1-2 | `store.ts:350`(원인 ②)은 고치지 않았다 | 스펙 확정 수정표에 없다. ①③ 만으로 증상이 사라진다 | — |
| F2-1 | 인쇄 준비 전 버튼 라벨을 `이미지 준비 중…` 으로 했다(스펙 문구 그대로) | §2-3 명시 | 낮음 |
| R3-1 | 스펙이 지목한 `usePhotos.ts` 가 아니라 `usePhotoComposite.ts` 새 파일에 훅을 뒀다 | 파일 분해는 builder 재량. 훅 하나가 objectURL 수명을 통째로 책임진다 | 낮음 |

## 검증한 것

- `npm run typecheck` — canvas-core · project-core · web 3패키지 전부 통과 (커밋마다 실행)
- `npm test` — canvas-core 277 · project-core 261 = **538개 전부 통과**
- `npm run build` — 프로덕션 빌드 통과 (230 modules)
- **canvas-core 를 한 줄도 고치지 않았다** — 변경 파일 전부 `apps/web/src` 범위
- 새 npm 의존성 0개 · IndexedDB 스키마 무변경(`DB_VERSION` 미접촉)

## 직접 확인해주실 것

1. **도곽 설정창 타이핑** — 캔버스에서 `[도곽]` → `DRAWING NAME` 칸에 여러 글자 연타.
   → 정상: 커서가 칸에 머물고 글자가 그대로 들어간다. 포커스가 ✕ 로 튀지 않는다.
2. **모달 첫 포커스 위치** — 아무 모달이나 열었을 때
   → 정상: 본문 **첫 입력칸**에 커서가 잡힌다(헤더 ✕ 가 아니다).
3. **모달 Esc · Tab** — Esc 로 닫히는가, Tab 이 모달 밖으로 새지 않는가.
4. **캔버스 스페이스 팬** — 스페이스를 누른 채 드래그 → 떼기.
   → 정상: 뗀 뒤 커서가 손 모양으로 굳지 않는다. (입력칸에 포커스를 준 뒤 스페이스를 눌렀다 떼도 동일)
5. **사진 미리보기에서 Delete** — 사진 미리보기 창을 열고 `Delete` 키.
   → 정상: 뒤 캔버스에서 선택된 결함이 지워지지 않는다.
6. **인쇄 뷰** — 출력 이력에서 `[사진첩 PDF]`/`[결함리스트 PDF]`/`[조사위치도 PDF]`.
   → 정상: 인쇄 대화상자가 **자동으로 뜨지 않고** 미리보기 화면만 보인다.
     상단 버튼이 잠깐 `이미지 준비 중…`(비활성) 이었다가 `PDF로 인쇄` 로 바뀐다.
     그 버튼을 눌러야 인쇄 대화상자가 뜨고, 사진·도면 이미지가 빈 칸 없이 들어간다.

## 알려진 한계

- `Overlays.tsx`(ConfirmDialog) · `PhotoSection.tsx` · `Menu.tsx` 도 window keydown 을 건다.
  스펙 §2-1 이 "증상 없으면 손대지 않는다"고 했으므로 **확인만 하고 두었다.**
  ConfirmDialog·Menu 는 자체 입력칸이 없어 같은 증상이 나지 않는다.
- 인쇄 뷰의 `ready` 는 **첫 데이터 로드 기준**이다. 인쇄 대화상자를 닫고 다시 눌러도
  재계산하지 않는다(이미지가 이미 디코드돼 있으므로 필요 없다).
- R-3 코드는 호출자가 없어 **런타임 검증이 불가능하다.** 배치 2 에서 배선될 때 실제로 확인된다.

---

# 검수 반영 — 배치 1 (`32_code-reviewer_findings_Batch1.md` 보통 3건)

지시 범위: **보통 1·2·3 만.** 경미 1~4, `store.ts:350`, `interaction.ts:791`, `canvas-core` 는 미접촉.

## 완료
| # | 지적 | 파일 | 수정 내용 |
|---|---|---|---|
| 보통 1 | 비동기 본문 모달에서 초기 포커스가 footer `취소` 에 갇힘 | `apps/web/src/ui/Form.tsx` | 포커스 이펙트의 "1회 보장"을 의존성 `[]` → `focusedRef` 로 이관. 의존 배열을 제거해 **매 렌더 확인**하되 실제 `focus()` 는 성공한 1회뿐. 본문(`.modal__scroll`)에 매치가 없으면 **아무 데도 포커스하지 않고 다음 렌더에 재시도**. `el.querySelector` 폴백(footer 버튼을 잡던 경로) **삭제** |
| 보통 2 | `ready` 가 데이터 교체 경로에서 `true` 로 남아 빈 문서 인쇄 가능 | `apps/web/src/export/printView/PrintRoute.tsx` | ① `ready` 이펙트에서 `setReady(false)` 를 `if (!data) return;` **위로** 이동 → 교체 경로에서도 버튼이 닫힘. ② 로더 이펙트 진입부에 `setData(null); setError(null);` 추가 → `kind`/`runId`/`storage` 가 바뀌면 옛 `data` 를 먼저 버려 새 kind 브랜치가 옛 데이터로 렌더되지 않음 |
| 보통 3 | 합성 결과 `width/height` 소실 (경계면 계약 누락) | `apps/web/src/data/usePhotoComposite.ts` | `PhotoComposite` 에 `width: number \| null` · `height: number \| null` 추가. 내부 `made` 상태에 `w`·`h` 보관 후 반환. **소비자 규약을 타입 주석 + 파일 헤더에 명시**: `baked===true` → 이 `width/height` 사용, `baked===false` → 기존 `displaySize()` 사용 (`displaySize()` 는 rotate 만 스왑하고 crop 을 모른다) |

## 미완료 / 막힌 것
없음.

## 검증한 것
- `npm run typecheck` — canvas-core · project-core · web **3패키지 통과**
- `npm test` — canvas-core + project-core **261 tests / 14 files 통과** (이번 수정은 `apps/web` 전용이라 신규 단위테스트 없음)
- `npm run build` — vite 프로덕션 빌드 통과 (230 modules)
- 코드 점검: `PhotoComposite` 소비자 0건 확인(배치 2 배선 대상) → 필드 추가로 깨지는 호출부 없음

## 직접 확인해주실 것
1. **용역 정보 수정** 모달 — 좌측 목록에서 용역을 골라 `수정` 을 연다.
   → 정상: `불러오는 중…` 이 지나간 뒤 **본문 첫 입력칸(용역명)** 에 커서가 잡힌다. `취소` 버튼이 아니다.
2. **도면 올리기** 모달 — 도면 탭에서 `올리기`.
   → 정상: 로딩이 끝나면 본문 첫 입력칸/컨트롤에 커서가 잡힌다.
3. **로딩이 끝나기 전 클릭** — 위 두 모달에서 `불러오는 중…` 이 떠 있는 동안 아무 데나 클릭하거나 Tab 을 눌러본다.
   → 정상: 본문이 그려진 뒤에 커서가 **강제로 첫 칸으로 끌려가지 않는다**(이미 1회 포커스가 소진되지 않았다면 끌려갈 수 있다 — 그 경우도 정상 동작이다).
4. **인쇄 뷰 kind 교체** — 인쇄 탭 새 창에서 주소창 해시의 `kind` 를 다른 값으로 바꿔 재진입한다
   (예: `DEFECT_LIST` → `PHOTO_BOOK`).
   → 정상: 상단 버튼이 **다시 `이미지 준비 중…`(비활성)** 으로 돌아갔다가 새 문서가 다 그려진 뒤 `PDF로 인쇄` 가 된다.
     그 사이에 눌러 빈 문서가 인쇄되는 일이 없어야 한다.
5. **기존 4개 모달 회귀** — `도면 축척`·`도면 올리기`·`용역 정보`·`표제부` 를 각각 열어
   Esc 로 닫히는지, Tab 이 모달 밖으로 새지 않는지, 타이핑 중 포커스가 튀지 않는지 확인.

## 알려진 한계 (검수 반영분)
- 보통 1 수정으로 포커스 이펙트가 **매 렌더 실행**된다. 본문이 그려지기 전까지는 `querySelector` 2회가
  렌더마다 돌지만, 성공 즉시 `focusedRef` 로 조기반환된다(모달 1개 기준 무시 가능).
- 보통 1 은 **모달 인스턴스 수명 동안 1회**다. 같은 모달 안에서 탭을 바꿔 본문이 완전히 교체돼도
  포커스를 다시 잡지 않는다(현재 그런 모달은 없다).
- 보통 3 은 **타입·주석 계약만** 추가했다. 실제 배선(미리보기 다이얼로그가 이 크기를 쓰도록)은
  지시대로 **배치 2 몫**으로 남겼다 — 현재 이 훅의 소비자는 여전히 0건이다.
- 경미 1~4 는 지시에 따라 손대지 않았다. 특히 경미 2(겹친 다이얼로그 Esc 이중 닫힘)는
  **여전히 재현된다** — `ProjectForm` 중복확인 창 위에서 Esc 를 누르면 폼까지 닫힌다.
