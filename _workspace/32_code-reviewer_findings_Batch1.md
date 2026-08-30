# 검수 결과 — 배치 1 (F-1 `634a6f7` · F-2 `82354d6` · R-3 `ac9b045`)

기준: `30_plan-reviewer_spec_UserFeedback0828.md` §2-1(B1) · §2-3(B3) ·
`29_plan-reviewer_spec_PhotoPolish.md` §2-2(R-3) · builder 로그 `31_builder_log_Batch1.md`

## 판정

**통과 — 배치 1 완료 승인.** 심각 0 · 보통 3 · 경미 4.
보통 3건은 전부 한두 줄짜리이고 두 건(보통1·2)은 builder 가 낸 사용자 체크리스트를
그대로 실패시키는 종류라 **배치 2 착수 전에 먼저 반영**할 것을 권한다.

## builder 가 밝힌 스펙 이탈 4건 — 판정

| # | 이탈 | 판정 | 근거 |
|---|---|---|---|
| 1 | 키 트랩 이펙트 의존 `[onClose]` → `[]` | **승인** | 이펙트가 쓰는 값은 `ref.current`(불변 DOM 노드)와 `onCloseRef` 뿐이다. 재구독 이유가 없다. 모달 재개봉은 **새 인스턴스 마운트**라 `onCloseRef` 가 새 `onClose` 로 초기화된다. 겹친 모달 동작도 변하지 않는다(뒤 경미 2 참조 — 원래부터 같은 노드 리스너라 `stopPropagation` 이 무효였다) |
| 2 | `store.ts:350`(원인 ②) 미수정 | **승인** | ①②③ 중 **증상의 필요조건은 ③ 뿐**이고 그게 마운트 1회로 고정됐다. 리렌더가 몇 번 돌든 포커스가 안 움직인다. 더구나 ②는 store 한 층 문제가 아니다 — `packages/canvas-core/src/interaction.ts:791` 의 `KEY_UP` 도 `{ ...state, keys }` 로 **항상 새 객체**를 만든다. `store.ts:350` 만 고쳐도 리렌더는 안 사라진다. 남은 것은 성능뿐. 잠재 재발 경로(인라인 콜백 의존 + 포커스 이펙트)를 가진 컴포넌트는 현재 코드에 없다(`Overlays`·`Menu`·`PhotoSection` 은 Escape 만, `PhotoPreviewDialog` 포커스 이펙트는 `[]`) |
| 3 | `isCanvasShortcut(e)` 도입 | **승인**(경미 1 동반) | 스페이스가 집합에 없음을 확인 — `keyup` 이 통과하므로 팬이 굳지 않는다. 등록/해제 대칭 확인(`addEventListener(..., true)` / `removeEventListener(..., true)` 두 쌍 모두). 다만 **keydown 이 삼키는 집합이 keyup 보다 크다**(경미 1) |
| 4 | `usePhotos.ts` 대신 `usePhotoComposite.ts` 신설 | **파일 분해는 승인 · 인터페이스는 보통 3 수정 후 배선** | 죽은 코드 맞다 — `grep photoCompose\|usePhotoComposite` 결과 자기 자신·주석 1줄 외 참조 0건. 다만 합성 결과 `width/height` 를 버려 배치 2 가 그대로는 이어받을 수 없다 |

## 지적 사항

### [보통 1] 본문이 비동기로 그려지는 모달에서 초기 포커스가 본문에 안 간다
- 파일: `apps/web/src/ui/Form.tsx:118-126`
- 문제: 포커스 이펙트가 **마운트 1회**인데, 마운트 시점에 `.modal__scroll` 안이 로딩 문구뿐인 모달이 있다.
  `MODAL_FOCUSABLE` 매치가 0 → 폴백 `el.querySelector(...)` → **footer 의 `취소` 버튼**에 포커스가 잡히고,
  본문이 그려져도 이펙트가 다시 안 돌아 **영원히 입력칸으로 안 간다.**
- 재현:
  - `ProjectForm.tsx:62` `useState(!editing)` → **용역 정보 수정**은 `loaded=false` 로 마운트, `:241` 이 `불러오는 중…` 만 렌더
  - `DrawingUpload.tsx:67` `useState(false)` → **도면 올리기**도 동일(`:434`)
  → builder 체크리스트 2번("아무 모달이나 열면 본문 첫 입력칸에 커서")이 4개 중 2개에서 실패한다.
  (회귀는 아니다. 이전에도 ✕ 로 갔다 — 스펙 B1-b 의 목표 미달이다.)
- 수정: "마운트 1회"를 **의존성이 아니라 ref 로** 보장한다. 매 렌더 확인하되 실제 포커스는 딱 1번.
  ```tsx
  const focusedRef = useRef(false);
  useEffect(() => {
    if (focusedRef.current) return;
    const el = ref.current; if (!el) return;
    const scope = el.querySelector<HTMLElement>('.modal__scroll') ?? el;
    const first = scope.querySelector<HTMLElement>(MODAL_FOCUSABLE);
    if (!first) return;              // 본문이 아직 없다 — 다음 렌더에 다시 본다
    focusedRef.current = true;
    first.focus();
  });                                // 의존 없음. focusedRef 가 재실행을 막으므로 B1 은 재발하지 않는다
  ```
  (폴백 `el.querySelector` 는 지운다 — footer 버튼을 잡느니 아무 데도 안 잡는 편이 낫다.)

### [보통 2] `PrintRoute` 의 `ready` 가 데이터 교체 경로에서 `true` 로 남는다
- 파일: `apps/web/src/export/printView/PrintRoute.tsx:160-175`
- 문제: `if (!data) setReady(false)` 만 있다. `data` 가 A→B 로 **교체**되는 경로에서는 `ready` 가 내려가지 않는다.
  로더 이펙트(`:83-147`)는 `kind`/`runId`/`storage` 가 바뀌어도 **`setData(null)` 을 하지 않으므로**,
  `kind` 만 먼저 바뀌고 `data` 는 옛 값이 남는다 → 새 kind 브랜치가 **옛 data 로 렌더**된다
  (예: `DEFECT_LIST`→`PHOTO_BOOK` 이면 `bookPages=[]`·`photoUrls={}`). 이때 버튼은 계속 활성이라
  누르면 **빈 문서가 인쇄된다.** F-2 가 지키려던 "빈 칸 방어"가 이 경로에서만 뚫린다.
- 재현: 인쇄 탭에서 해시의 `kind` 를 바꿔 재진입 / `storage` 컨텍스트가 재생성돼 로더가 재실행되는 경우.
- 수정(1줄): 이펙트 첫 줄을 `setReady(false);` 로 올리고 `if (!data) return;` 로 바꾼다.
  권장 추가: 로더 이펙트 진입부에서 `setData(null); setError(null);`.

### [보통 3] `usePhotoComposite` 가 합성 결과 크기를 버려 배치 2 가 이어받을 수 없다
- 파일: `apps/web/src/data/usePhotoComposite.ts:50-51` (`r.width`·`r.height` 미사용)
- 문제: `baked:true` 인 URL 은 **crop 이 적용된** 래스터다. 그런데 소비자가 칸 크기를 잡을 때 쓰는
  `displaySize()`(`packages/project-core/src/photo.ts:260-268`)는 **rotate 만 스왑하고 crop 을 모른다.**
  자른 사진에서 종횡비가 어긋나 늘어나거나 레터박스가 생긴다. `PhotoComposite` 만 봐서는
  소비자가 이 함정을 알 방법이 없다(= 경계면 계약 누락).
- 수정: `PhotoComposite` 에 `width: number | null; height: number | null` 을 추가하고
  `setMade({ signature, url: created, w: r.width, h: r.height })` 로 함께 보관한다.
  주석에 "**`baked` 면 `displaySize()` 대신 이 크기를 쓴다**" 를 명시한다.

### [경미 1] `PhotoPreviewDialog` — keydown 이 삼키는 키 집합이 keyup 보다 크다
- 파일: `apps/web/src/ui/photos/PhotoPreviewDialog.tsx:67-101`
- keydown 은 `Escape`·`ArrowLeft`·`ArrowRight` 도 조기반환 + `stopPropagation` 하는데
  `isCanvasShortcut` 에는 이 셋이 없어 **keyup 은 통과**한다 → `CanvasView.tsx:294` 가 `KEY_UP` 을 보내고
  `store.ts:350` → 새 `AppState` → 캔버스 라우트 리렌더. **화살표로 사진을 넘길 때마다** 발생.
- 증상은 없다(이 다이얼로그는 `Modal` 이 아니고 포커스 이펙트가 `[]`). 낭비만 남는다 → 경미.
- 수정(선택): keyup 핸들러에서 `Escape`/`Arrow*` 도 함께 `stopPropagation` 한다(preventDefault 는 하지 않는다).

### [경미 2] 겹친 다이얼로그에서 Esc 가 두 겹을 동시에 닫는다 — **기존 문제, 이번 배치 무관**
- `Form.tsx:154`(Modal)·`Overlays.tsx:103`(ConfirmDialog) 둘 다 **window capture** 에 붙는다.
  같은 노드의 리스너는 `stopPropagation` 으로 막히지 않는다(`stopImmediatePropagation` 이어야 한다).
  `ProjectForm` 의 중복확인 창 위에서 Esc → 확인창과 폼이 함께 닫혀 입력이 날아간다.
- **회귀가 아니다**(변경 전에도 동일). 이번 범위에서 손대지 말고 별건으로 남긴다.

### [경미 3] 인쇄 진입 문구가 아직 "한 번 더 눌러야 한다"를 말하지 않는다
- `apps/web/src/routes/export/RunHistory.tsx:112` · `apps/web/src/routes/Export.tsx:449`
- 틀린 말은 아니지만 F-2 이후 흐름이 한 단계 늘었다. "새 탭에서 `[PDF로 인쇄]` 를 누르면" 한 구절 추가면 완결.

### [경미 4] 스펙에 없는 추가 export 4개
- `photoCompose.ts` 의 `composeSignature`·`composePhotoFromUrl`·`drawAnnotations`·`COMPOSE_QUALITY`.
  전부 근거 있고 해롭지 않다. 다만 **스펙이 지목한 `composePhoto`(Blob 경로)는 현재 호출자가 0** 이다 —
  배치 2 에서 인쇄 뷰가 Blob 경로를 안 쓰면 죽은 export 로 남는다. 배치 2 종료 시 재확인.

## 규칙 위반 여부

| 항목 | 결과 | 근거 |
|---|---|---|
| `packages/canvas-core` 미변경 | ✅ | `git diff --stat 04210f6 ac9b045` 변경 7파일 전부 `apps/web/src` |
| 새 npm 의존성 0 | ✅ | `git diff --name-only 04210f6 ac9b045 -- package.json apps/web/package.json packages/` → 0건 |
| IndexedDB 스키마 무변경 | ✅ | `apps/web/src/data/idb` diff 0건 · `DB_VERSION` 미접촉 |
| 타입 검사 | ✅ | `npm run typecheck` 3패키지 통과 (검수자가 직접 재실행) |

## 경계면 교차 비교

| 경계 | 결과 |
|---|---|
| `Form.Modal` ↔ 소비자 4곳(`DrawingScaleDialog:38`·`DrawingUpload:392`·`ProjectForm:219`·`TitleBlockDialog:54`) | 2곳 정상 · 2곳 **보통 1**(비동기 본문). Tab 트랩·Esc 는 4곳 모두 영향 없음 |
| `Modal` 초기 포커스 ↔ `CanvasView` 스페이스 preventDefault | 안전. 캔버스 라우트의 두 모달은 첫 포커스가 `checkbox`/`range` = `INPUT` → `isTypingTarget` 가드에 걸려 `preventDefault` 경로에 안 들어간다 |
| `PrintRoute` `ready` ↔ 4종 kind | 상단 바가 kind 무관 단일 경로다. **특정 kind 만 빠진 곳 없음.** `window.print()` 는 코드 전체에 `:192` 한 곳뿐(자동 호출 0건) |
| `CanvasView.onKeyDown` ↔ `onKeyUp` 대칭 | 같은 `isTypingTarget` 가드. `spaceRef` 해제가 가드보다 앞이라 스페이스 팬은 안 굳는다. 잔여 엣지: keydown 과 keyup 사이에 **포커스가 입력칸으로 옮겨간 경우** 코어에 `KEY_UP` 이 안 가는데, `window blur` 핸들러(`:296-299`)와 `spaceRef=false` 가 실사용 경로를 덮는다 — 문제 없다고 판단 |
| `photoCompose` ↔ `usePhotoComposite` | 반환 shape 일치. **`width/height` 소실**만 문제(보통 3) |
| `photoCompose` ↔ `project-core` | `hasPhotoEdits`(`photo.ts:306`)가 crop·annotations 만 보고 rotate 를 제외 — `needsCompose` 주석과 일치 ✅. `strokePx`(`photoTransform.ts:199`)를 crop **전** 프레임 W·H 로 호출 = §2-1 "렌더 프레임 장변 대비 비율" 과 일치 ✅ |
| 합성 순서 §2-1 | `composeFromDecoded:111-141` — 렌더본 → 주석 → 자르기 → 회전. **한 곳에만 존재** ✅. 90/270 에서 `ow/oh` 스왑·중심 회전 수식 정확 ✅ |
| objectURL 수명 | `composePhotoFromUrl` 은 URL 을 안 만들고 안 지운다. 훅의 정리 함수가 자기 실행이 만든 URL 만 revoke, `alive=false` 면 생성 전에 반환 → **누수·이중 해제 없음** ✅ |

## 불변식 검수표

| # | 불변식 | 결과 | 근거 |
|---|---|---|---|
| 1 | 좌표는 정규화 저장 | ✅ | `photoCompose:120-123,174-184` 픽셀 환산은 **렌더 시점**에만. 저장 경로 없음 |
| 2 | `defectNo`/`photoNo` 컬럼 없음 | ✅ | 이번 배치에 스키마·타입 변경 0. `PrintRoute` 는 `ExportRun.mapping` 그대로 사용(`:101 planFromRun`, `:122 displayNumbersOf`) — 재계산 경로 없음 |
| 3 | 로컬 우선 쓰기 | 해당 없음 | 쓰기 경로 미접촉 |
| 4 | 면적 계산 | 해당 없음 | 미접촉 |
| 5 | 층 정렬 `sortOrder` | 해당 없음 | 미접촉 |
| 6 | 원인·보수방안 FK | 해당 없음 | 미접촉 |
| 7 | 과업 설정 복사 | 해당 없음 | 미접촉 |
| 8 | `isPrimary` 정확히 1장 | ✅ | `PrintRoute:107-113` 이 `photoBookModel` 이 고른 키만 로드(직접 `find(isPrimary)` 안 함) — 기존 규칙 유지, 이번 변경이 안 건드림 |

## 확인하지 못한 것

- **R-3 는 런타임 검증이 불가능하다.** 호출자가 0건이라 캔버스 합성 결과(색·굵기·화살촉 모양)를 눈으로 못 본다.
  배치 2 배선 후 재검수 대상 — 특히 `drawAnnotations` 의 화살촉이 화면 SVG 와 **같게 보이는지**는
  두 구현을 나란히 띄워야만 판단된다.
- `waitForImages` 내부는 이번에 읽지 않았다(이번 변경이 호출부만 건드림). `decode()` 실패 이미지에서
  영원히 `이미지 준비 중…` 에 갇히는지는 확인하지 않았다.
- 인쇄 대화상자 실제 동작(자동으로 안 뜨는지)은 **사용자 실행 검증 몫**이다.
