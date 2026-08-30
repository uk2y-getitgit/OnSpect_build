# 스펙 검토 결과 — 사용자 수정사항 2파일 (2026-08-28)

검토: plan-reviewer · 입력 `Onspect 수정사항1.txt`(7항목) · `Onspect 수정사항2.txt`(6항목) = **13항목**
기준 브랜치 `feat/photo-polish` @ `04210f6`. 코드는 쓰지 않았다.

> **이 문서의 목적은 "무엇이 진짜 버그인가"를 코드로 가려내는 것이다.**
> 사용자가 "출력안됨 / 불가능"이라 적은 5건 중 **3건은 실제 코드 결함**이고,
> **1건은 설계된 동작을 버그로 오인한 것**, **1건은 코드에서 원인을 못 찾았다**.

---

## 0. 13항목 분류·판정 요약

> **⚠️ 2026-08-28 2차 갱신 — 사용자가 Q45~Q50 에 답했다 (D14~D19).**
> 아래 표의 판정은 **답변 반영 후**다. 1차 판정과 코드 조사 근거는 §2~§4 에 그대로 남아 있다.
> 갱신 내역은 문서 하단 `## 변경 이력 — 2026-08-28 사용자 답변 반영` 참조.

| # | 원문 | 분류 | 코드 조사 | 판정(2차) |
|---|---|---|---|---|
| **1-①** | 필기 + 지우개 / 필기 시 영역표시 X / 선택도구로 구간선택 이동 | 기능요청 | 지우개 **코드에 존재하지 않음**(전 리포지터리 0건). 점선상자·마퀴선택 관련 사실 확인됨 | ✅ **바로 착수** — **D14** 확정 |
| **1-②** | 사진첩 6장/셀테두리/**출력안됨**/양식수정 | 혼재 | 6장·테두리는 **이미 구현**. "출력안됨" = `[생성]`이 사진첩 파일을 안 낸다(**설계된 동작** M3·Q37) | **조건부** — Q51·Q52 미답 |
| **1-③** | 결함조사망도 도곽·번호 **출력안됨** | 버그(도곽) / 미확인(번호) | 도곽: **근본원인 확정**(`factory.ts:124`+`pageDecor.ts:28`). 번호: 주입 경로 정상, 원인 못 찾음 | 도곽 ✅ **바로 착수**(D16 승인) / 번호 **조건부** — Q51 |
| **1-④** | 도곽 크기가 모든 도면에 연동 + 스케일 실시간 미리보기 | 기능요청 | 도곽은 현재 **도면 단위** 스코프(`Drawing.titleBlock`) | ✅ **바로 착수** — **D16** 확정 |
| **1-⑤** | 범례 On/off — 결함·보수·신규 | 기능요청 | 현재 범례는 **결함유형 목록** 1종뿐(D8). 상태 범례 없음 | ✅ **바로 착수** — **D15** 확정 |
| **1-⑥** | Excel/PDF 버튼 분리 + 미리보기 후 별도 출력버튼 | 기능요청 | **주장 사실**: `PrintRoute.tsx:151-168`이 자동 `window.print()` | 뒷부분 ✅ **바로 착수** / 앞부분 **조건부** — Q52 |
| **1-⑦** | 필기메모 지우개는 필기만 지워야 함 | 기능요청 | 지우개 없음. 현재는 `Delete` 키가 선택 대상(메모 전체/획/결함)을 지운다 | ✅ **바로 착수** — **D14** 확정 |
| **2-①** | 도곽 설정 타이핑 시 닫기버튼으로 포커스 이동 | **버그** | **근본원인 확정 3단계** (아래 §2-1) | ✅ **바로 착수** ⭐ |
| **2-②** | 누수·마감파손 등 발생원에 보수·보강방안 설정 추가 | 기능요청 | `linkCauseRepair` **존재하지 않음**. 씨앗 보수방안 5종 전부 균열계열 | ⏸️ **보류** — **D17**(사용자가 실무표 줄 때까지 착수 안 함) |
| **2-③** | 비슷한 유형 결함 불러오기 별도 버튼 (지금은 직전 입력 자동선택) | 기능요청 | "자동선택"은 D9의 정상 동작이었다 | ✅ **바로 착수** — **D18** (D9 **폐기**) |
| **2-④** | 전차결함 → 사진선택 → 금차 자동전환 (지금은 수정·사진선택 불가) | 기능요청 | **주장 사실**: `isLocked = status !== 'CURRENT'`(A8). 상태 전이 코드 **0건** | **조건부** — 기존 Q42 미답 |
| **2-⑤** | 층별선택 시 `1F-01`·`RF-01`·`W-01` 표기 / 사진번호는 전체연속 | 기능요청 | 층 약어 필드 **없음**. 사진번호 전체연속은 **Q34/K6를 뒤집는 요청** | ✅ **바로 착수** — **D19** (세부 1건은 Q53 비차단) |
| **2-⑥** | 사진첩 사진번호 숨기기 | 기능요청 | `photoCaptionLines` 1행 생성 지점 1곳. 옵션 추가만 | ✅ **바로 착수** |

**정리(2차):** 바로 착수 **9건** · 조건부(질문 미답) **3건** · 보류 **1건**.
**남은 미답 질문은 Q42 · Q51 · Q52 세 개뿐이고, 셋 다 이번 착수를 막지 않는다.**

---

## 1. 구현 가능 판정 — 총평

### ✅ **바로 착수 가능.** 13항목 중 9항목이 확정됐다. (2026-08-28 2차)

사용자가 Q45~Q50 에 답해(D14~D19) 막혀 있던 7항목 중 **6항목이 풀렸고 1항목은 보류**로 정리됐다.
남은 미답 질문 3건(Q42 · Q51 · Q52)은 전부 **이번 착수 범위를 막지 않는다** —
Q51 은 진단 확인이고, Q52 는 그 선행 작업(R-9)이 어차피 필요하며, Q42 는 파일2-④ 하나만 잡고 있다.

**이번 라운드에서 뒤집히는 기존 결정이 둘이다. 둘 다 사용자가 직접 뒤집었다:**

| 폐기 | 대체 | 근거 |
|---|---|---|
| **D9** (직전 입력 자동 이어받기) | **D18** — `[유사결함 불러오기]` 버튼 · 결함번호 선택식 | 사용자 답변(Q49) |
| **Q34 / K6** (사진번호도 층별리셋을 따른다) | **D19** — 사진번호는 **항상 전체 연속** | 사용자 답변(Q50) · Q34 는 에이전트 가정이었다 |

**D8(범례 색)은 뒤집히지 않았다** — D15 의 상태 범례는 *결함유형별* 색이 아니라 *상태* 색이라
D8 이 막으려던 것과 다른 대상이다. 사용자도 같은 근거를 D15 에 적었다.

**버그 3건은 여전히 최우선이다.** 원인이 코드에서 정확히 특정됐고 질문이 필요 없다.

---

## 2. 확정 스펙 — 버그 3건 (질문 없이 착수)

### 2-1. 【버그 B1 · 최우선】 도곽 설정 다이얼로그에서 문자 입력 불가 (파일2-①)

**증상 재현 조건 (코드로 도출):** 캔버스 화면(`#/p/:pid/f/:fid`)에서 `[도곽]` 버튼으로 연 경우에만
발생한다. **용역 구성 화면(P2)에서 연 같은 다이얼로그는 정상일 것이다** — 이것이 원인 진단의 검증 포인트다.

**근본원인 — 3단계 연쇄. 세 곳이 각각은 무해한데 겹치면 입력이 불가능해진다.**

```
① apps/web/src/canvas/CanvasView.tsx:286-289
   const onKeyUp = (e: KeyboardEvent) => {
     if (e.key === ' ') spaceRef.current = false;
     send({ k: 'KEY_UP', key: e.key, keys: keysFrom(e, spaceRef.current) });   // ← 무조건 보낸다
   };
   ⚠️ 바로 위 onKeyDown(:271) 에는 `if (isTypingTarget(e.target)) return;` 가드가 있는데
      onKeyUp 에는 **없다.** 모달 입력창에서 친 글자의 keyup 이 그대로 캔버스로 들어간다.

② apps/web/src/store.ts:350  (runInput)
   let next: AppState = { ...state, canvas: r.state, idSeed: seed };
   ⚠️ **무조건 새 객체**를 만든다. KEY_UP 이 아무 일도 안 해도 useReducer 가 리렌더한다.
      → CanvasRoute 리렌더

③ apps/web/src/ui/Form.tsx:99-131  (Modal)
   useEffect(() => {
     const first = el?.querySelector('input:not([disabled]), select…, textarea…, button:not([disabled])');
     first?.focus();          // ← 이펙트가 다시 돌 때마다 포커스를 옮긴다
     …
   }, [onClose]);             // ← onClose 는 CanvasRoute.tsx:884 의 **인라인 화살표 함수**
   ⚠️ querySelector 는 **문서 순서 첫 매치**를 준다. Form.tsx:148 의 ✕ 닫기 버튼이
      <header> 안에 있어 modal__scroll 의 입력창보다 **앞선다** → 포커스가 닫기 버튼으로 간다.
```

즉 **글자 하나 칠 때마다 keyup → 리렌더 → onClose 신 참조 → 포커스 이펙트 재실행 → ✕ 버튼으로 이동**.
사용자 표현("타이핑과 동시에 닫기버튼으로 인식 이동")과 정확히 일치한다.

**확정 수정 — 3개 전부 고친다. 하나만 고치면 다른 다이얼로그에서 같은 사고가 반복된다.**

| # | 파일 | 수정 | 성격 |
|---|---|---|---|
| B1-a | `CanvasView.tsx:286` | `onKeyUp` 첫 줄에 `if (isTypingTarget(e.target)) return;` 추가. 단 **`spaceRef.current = false` 는 가드보다 먼저** 실행해야 한다(스페이스 팬 상태가 눌린 채 남으면 커서가 손 모양으로 굳는다) | 정확한 원인 제거 |
| B1-b | `Form.tsx:99-104` | 초기 포커스를 **마운트 1회로 고정**한다 — 이펙트를 둘로 쪼개 포커스는 `useEffect(..., [])`, 키 트랩은 `[onClose]` 유지. 추가로 `querySelector` 대상에서 `.modal__x` 를 제외하고 `el.querySelector('.modal__scroll input:not([disabled]), …')` 로 **본문 우선**으로 바꾼다 | 재발 방지(모든 모달) |
| B1-c | `Form.tsx:106` | `onClose` 를 `useRef` 에 담아 이펙트 의존에서 뺀다 (인라인 콜백이 이펙트를 매 렌더 재실행하지 않게) | 재발 방지 |

**같은 결함을 공유하는 다른 화면 (이번에 함께 확인만 하고, 증상 없으면 손대지 않는다):**
`Overlays.tsx:103`(ConfirmDialog) · `PhotoSection.tsx:342` · `Menu.tsx:97` 도 `window` keydown 을 건다.
`PhotoPreviewDialog.tsx:78-88` 은 **이미 이 문제를 알고 keydown 을 막아 뒀지만 keyup 은 안 막았다** —
같은 구멍이 열려 있다. B1-a 로 한 번에 닫힌다.

---

### 2-2. 【버그 B2】 도곽·범례가 화면에도 출력물에도 안 나온다 (파일1-③ 앞부분)

**근본원인 — 기본값 불일치. 세 문서가 서로 다른 말을 한다.**

```
apps/web/src/data/factory.ts:124-125
    titleBlock: null,   // F5-1 — 도곽은 사용자가 켜기 전까지 없다
    legend: null,

apps/web/src/canvas/pageDecor.ts:28
    if (!drawing || !tb || !tb.enabled) return null;      // null 이면 안 그린다

packages/project-core/src/types.ts:237-238
    export const DEFAULT_DRAWING_TITLE_BLOCK = { enabled: true, … }   // ← 기본은 켜짐

apps/web/src/routes/TitleBlockDialog.tsx:43-45
    useState(drawing.titleBlock ?? DEFAULT_DRAWING_TITLE_BLOCK)       // ← 체크박스가 ☑ 로 보인다
```

**결과:** 도면을 올리면 `titleBlock === null` 이다. 도곽 설정을 열면 `도곽 표시` 가 **체크된 채로 보이는데**
실제로는 아무것도 안 그려진다. `[저장]` 을 눌러야 비로소 레코드가 생겨 도곽이 나타난다.
**도면마다 이 짓을 반복해야 한다** — 파일1-④("모든 도면에 연동")가 나온 진짜 이유다.

**두 번째 원인 — 다이얼로그 문구가 거짓말을 한다.**

```
TitleBlockDialog.tsx:87-89
  "화면(캔버스) 표시 여부입니다. 출력물에 넣을지는 출력 단계에서 따로 고릅니다."
```
사실이 아니다. `locationMap.ts:164` 는
`render.titleBlock ? titleBlockConfigFor(drawing, project) : null` 이므로
**출력 옵션 ☑ 와 도면별 `enabled` ☑ 가 둘 다 켜져야** 도곽이 나간다.
출력 옵션은 기본 `true`(`params.ts:46`)이므로, 사용자가 보는 증상은 정확히
"출력 화면에서 도곽을 켰는데 안 나온다"다. **범례도 완전히 같은 구조**(`pageDecor.ts:74`, `params.ts:47`).

**확정 수정 (파일1-④ 결정 전에도 안전한 것만):**

| # | 파일 | 수정 |
|---|---|---|
| B2-a | `pageDecor.ts:27-28` | `const tb = drawing?.titleBlock ?? DEFAULT_DRAWING_TITLE_BLOCK;` — **null 을 "설정 안 함"이 아니라 "기본값"으로 읽는다.** 저장 레코드는 안 건드린다(마이그레이션 0건, 읽기 시점 정규화 = `isInkMemo` 와 같은 수법) |
| B2-b | `pageDecor.ts:73-74` | 범례도 동일. 단 `rows.length === 0` 이면 여전히 `null`(D8 유지) |
| B2-c | `TitleBlockDialog.tsx:87-89` | 문구를 사실과 맞춘다: "화면과 출력물 **양쪽**의 표시 여부입니다. 출력 화면에서 한 번 더 끌 수 있습니다." |

> ⚠️ **B2-a 는 사용자가 보는 동작을 바꾼다** — 지금까지 도곽이 없던 도면에 도곽이 갑자기 나타난다.
> 이것이 사용자가 원하는 방향이라고 **판단하지 않았다**. 사용자가 도곽을 켜려고 계속 시도한 정황
> (파일1-③·④, 파일2-①이 전부 도곽 이야기)이 근거지만, 확정은 Q47에서 함께 받는다.
> **Q47 답변 전에는 B2-c(문구)만 먼저 고쳐도 된다** — 되돌리는 비용 0.

---

### 2-3. 【버그 B3】 인쇄 뷰가 열리자마자 인쇄 대화상자를 띄운다 (파일1-⑥ 뒷부분)

**주장 사실 확인:**
```
apps/web/src/export/printView/PrintRoute.tsx:151-168
  useEffect(() => {
    if (!data || printed.current) return;
    …
    await waitForImages(root);
    requestAnimationFrame(() => { if (!cancelled) window.print(); });   // ← 자동 실행
  }, [data]);
```
데이터가 준비되면 **무조건** `window.print()` 가 실행된다. 사용자 표현("지금은 바로 미리보기 +
프린터출력 나옴")과 정확히 일치한다. 상단 바에는 이미 `[PDF로 인쇄]` 버튼이 있다(`:180`).

**확정 수정:** `useEffect` 의 자동 `window.print()` 를 **제거**한다.
`waitForImages(root)` 는 남기고 그 결과를 `ready` 상태로 노출해, 이미지 디코드가 끝나기 전에는
`[PDF로 인쇄]` 버튼을 `disabled` + `이미지 준비 중…` 으로 둔다.
(자동 인쇄를 없애면서 "빈 칸이 인쇄된다"는 원래 방어를 잃지 않는 유일한 방법이다.)

- 되돌리는 비용: 낮음. `router.ts` 에 `?autoprint=1` 같은 것을 붙이지 **않는다** — 옵션이 늘면
  "어떤 경로로 열었느냐"에 따라 동작이 달라져 다시 혼란이 생긴다.
- 파일1-⑥ 앞부분(Excel/PDF 버튼 분리)은 **Q52 답변 후**다. B3만 따로 해도 사용자 체감이 즉시 개선된다.

---

### 2-4. 【바로 착수】 사진첩 사진번호 숨기기 (파일2-⑥)

`ExportDocOptions` 에 `hidePhotoNumber: boolean`(기본 `false`) 추가 → `photoBookModel` → `photoCaptionLines` 1행.

- **`assignNumbers()`·`ExportRun.mapping` 을 건드리지 않는다.** 숨기는 것은 **표시**뿐이다(불변식 #2 유지).
  손상결함표·결함리스트의 `사진번호` 열은 **그대로 둔다** — 그 열은 사진첩과 대조하는 열이 아니라 본표의 열이다.
- 1행이 통째로 비면 캡션 블록이 위로 밀려 칸 높이가 흔들린다 → **1행을 지우지 않고 2행을 1행으로 올린다**
  (`lines` 배열에서 제거). 가정 U8 참조.
- `DEFAULT_DOC_OPTIONS` 기본 `false` 이므로 기존 출력물은 한 글자도 안 바뀐다.

---

## 3. 진단 결과 — 버그가 아닌 것 (사용자에게 그대로 설명해야 한다)

### 3-1. 파일1-② "사진첩 출력안됨" → **설계된 동작이다. 버튼 위치를 모르셨을 가능성이 높다.**

```
apps/web/src/export/produce.ts:27-32
  /** `[생성]` 이 실제로 **파일**을 내는 산출물. 사진첩은 인쇄 뷰 전용이다 (M3) */
  export const FILE_ARTIFACTS = ['DAMAGE_TABLE', 'DEFECT_LIST', 'LOCATION_MAP'];   // 사진첩 없음

apps/web/src/routes/Export.tsx:71
  PHOTO_BOOK: '파일이 아니라 인쇄 뷰로 냅니다 — 생성 후 [사진첩 PDF] 를 누르세요'
```
사진첩을 체크하고 `[생성]` 을 눌러도 **파일이 안 내려온다.** 아래 **출력 이력**에서
`[사진첩 PDF]` 를 눌러야 열린다. 이것이 Q37/M3 으로 이미 기록된 알려진 성질이다.

**그리고 "1장에 6장"과 "셀 테두리"는 이미 되어 있다:**
```
print.css:150-154   .pv-photos { display:grid; grid-template-columns: repeat(2,1fr); }   → 2열
print.css:157-163   .pv-cell   { height: 84mm; }                                          → 3행 = 6장
print.css:165-174   .pv-cell__frame { border: 0.3mm solid #666; }                         → 테두리 있음
```
→ **사용자가 사진첩 인쇄 뷰를 한 번도 못 본 것으로 판단된다.** 이 진단이 맞으면 파일1-②는
"출력안됨" 버그가 아니라 **파일1-⑥(버튼 분리)이 해결할 UX 문제**로 흡수된다. Q51 로 확인.

### 3-2. 파일2-③ "직전 입력이 자동선택" → **D9 그대로다. 사용자가 직접 확정한 동작이다.**

```
apps/web/src/store.ts:386-389
  // ⚠️ 씨앗 갱신은 조기 반환 두 개를 통과한 뒤여야 한다 (D9 §2)
  return { ...committed, defectSeed: pickDefectSeed(to) };
```
`_workspace/DECISIONS.md` D9 (2026-08-24, 사용자 확정):
*"분류·판정은 이어받고 측정값·개별정보는 매번 새로 받는다. 갱신 시점 — 필드가 바뀔 때마다 즉시."*

사용자가 이번에 요청한 "별도 버튼으로 결함리스트를 띄워 고른다"는 **D9와 배타적이지 않다.**
그러나 원문 *"(지금은 직전 입력된 결함정보가 자동선택)"* 이 **불만의 서술**인지 **현황의 서술**인지가
갈린다. 전자면 D9를 끄자는 뜻이고, 후자면 D9 위에 버튼을 얹자는 뜻이다.
**D9는 사용자 기결정이므로 추측으로 뒤집지 않는다.** → Q49

### 3-3. 파일2-④ "전차결함 수정·사진선택 불가" → **사실이며, 의도된 1차 제약(A8)이다.**

```
packages/canvas-core/src/defectGeom.ts:330-333
  /** 전회차 표기는 1차 범위에서 선택만 가능 (A8) */
  export function isLocked(defect: Defect): boolean { return defect.status !== 'CURRENT'; }

apps/web/src/store.ts:365
  · **잠긴 결함(전회차)은 거부한다** — 폼도 disabled 지만 마지막 관문을 여기 둔다
```
전회차 결함을 `CURRENT` 로 바꾸는 코드는 **저장소 전체에 한 줄도 없다**
(`SET_STATUS` 류 커맨드 0건). 가져오기 자체는 구현돼 있다 —
`ProjectForm.tsx:383-394` `이전 용역의 결함도 함께 가져오기` → `copyStructure(…, {includeDefects:true})`
→ `status = PREV_PENDING`. 사진 승계는 명시적으로 제외돼 있다(`repo.ts:590-592`, Phase 2-D 소관).

즉 파일2-④는 **NEXT.md 가 이미 알고 있던 미구현 항목**이며, 상세기획 §2-D
*"촬영하는 순간 status=CURRENT, 보라 → 빨강"* 그대로다. **미답 질문 Q42** 가 이 항목의
유일한 미결 지점(사진을 지우면 되돌아가는가)을 이미 담고 있다 → **새 질문을 만들지 않고 Q42를 재상신**한다.

---

## 4. 미확인 — 코드에서 원인을 못 찾은 것

### 4-1. 파일1-③ 뒷부분 "결함번호(넘버링) 출력안됨" — **누락 경로 없음. 재현 조건 질문 필요.**

번호 주입 경로는 3곳 모두 정상이다:
```
apps/web/src/export/produce.ts:113          displayNumbers: displayNumbersOf(input.plan)
apps/web/src/export/printView/PrintRoute.tsx:117  displayNumbers: displayNumbersOf(run)   // run.mapping 사용
apps/web/src/export/locationMap.ts:196-197  // ⭐ seq 가 아니라 출력 결함번호를 주입한다
                                            displayNumbers: input.displayNumbers
```

**대신 "안 보인다"로 이어질 수 있는 구조적 성질을 하나 찾았다 (버그는 아니지만 원인일 수 있다):**
```
packages/canvas-core/src/renderModel.ts:736   // balloonR = style.balloonRadius * zoom
packages/canvas-core/src/constants.ts:159     balloonRadius: 34
```
풍선 반지름은 **도면 이미지 px 기준 34로 고정**이고 `mapScale` 을 올려도 **상대 크기가 안 커진다.**
장변 6000px짜리 스캔 도면이면 A4 가로 인쇄 시 번호 지름이 약 **1.7mm** — 사실상 안 보인다.
보정 수단은 이미 있다(도면별 `labelScale`, F6 — `locationMap.ts:288-292`).

→ 세 갈래 중 무엇인지 사용자만 안다: (a) 번호가 아예 없다 (b) 너무 작다 (c) 도면 밖으로 잘렸다
(`clippedDefects` 경고가 떴는지가 (c)의 지표다). **Q51** 로 묻는다.

---

## 5. 확정 스펙 — D14~D19 반영 (2026-08-28 2차 · **builder 착수 기준값**)

여기부터는 **설계 방향이 아니라 확정 명세**다. builder 는 이 절을 그대로 구현한다.

---

### 5-1. 【D14】 필기메모 — 점선상자 숨김 · 획 히트 · 지우개 (파일1-①⑦)

**대상은 `MEMO`(필기메모)뿐이다. `SKETCH`(자유그리기)는 건드리지 않는다.**
`SKETCH` 는 결함에 붙은 표기이고, 그것을 지우개 대상으로 삼으면 사용자가 못 박은
*"다른 점·화살표·번호가 지워지면 안 됨"* 과 정면으로 충돌한다.

#### (a) 점선 상자를 상시 표시하지 않는다

`packages/canvas-core/src/renderModel.ts` 의 메모 렌더에서, **필기 메모(`paths !== null`)**의
`box` 는 **선택 또는 hover 일 때만** 그린다.

```
그린다:  selection.part === 'MEMO' && selection.memoId === m.memoId
      || hover.part === 'MEMO'     && hover.memoId    === m.memoId
안 그린다: 그 외
```
- **텍스트 메모(`paths === null`)의 노란 상자는 그대로 둔다** — 그 상자가 메모 본체다.
- 출력(`locationMap.ts`)은 `selection`·`hover` 를 전부 비우므로(`:199-208`)
  **조사위치도에서는 자동으로 점선 상자가 사라진다.** 별도 조치 불필요.

#### (b) 히트 판정을 상자에서 **획 근처**로 바꾼다

`packages/canvas-core/src/hitTest.ts` — 필기 메모는 상자 안(inRect)이 아니라
**획까지의 거리**로 판정한다.

```
필기 메모:  min over paths, segments:  distPointSeg(p, a, b) <= max(path.width / 2, HIT_MEMO_INK_PX)
텍스트 메모: 지금 그대로 (box 안)
HIT_MEMO_INK_PX = 12   // 스크린 px. ⚠️ 기하 판정은 스크린 px (프로젝트 규칙 · 정규화 공간 금지)
```
- **`ReduceContext.hitProfile`(트랙 A 터치용, optional)에서 값을 뽑는다** — 태블릿에서 손가락으로
  잡으려면 12px 로는 부족하다. 프로파일이 없으면 12.
- **획 사이의 빈 공간은 이제 안 잡힌다.** 이것이 이 변경의 목적이다(글씨 사이로 도면이 보인다).

#### (c) 이동 — **코드 변경 없음**

`interaction.ts:874-887` 의 `MOVE_MEMO` 는 `memo.pos`(획 좌상단 앵커, `inkAnchor`)를 기준으로
델타를 계산하고 `memoScreens` 가 획을 같은 델타로 옮긴다(`memoGeom.ts:198-209`).
**획을 잡아 끌어도 동작이 같다.** `interaction.ts:876` 의 `const box = memos.find(...)` 는
미리보기 델타에 계속 필요하므로 유지한다.

#### (d) 지우개 도구 신설

| 항목 | 확정 |
|---|---|
| 도구 | `Tool` 에 `'ERASER'` 추가. 팔레트 `필기메모` **바로 다음** 슬롯(`ToolPalette.tsx` ITEMS 7번째) |
| 대상 | **필기 메모의 획만.** 점·화살표·영역·자유그리기·번호 풍선·리더선은 **절대 안 지운다** |
| 단위 | **획 1개 통째로.** 획의 일부를 지우는 지우개가 아니다(벡터 배열이라 부분 삭제는 자료구조가 다르다 — 사진 주석 지우개와 같은 판단, PhotoPolish §2-4) |
| 판정 | 커서 중심에서 **스크린 12px**(= (b)와 같은 상수) 안에 들어온 획 |
| 드래그 | pointerdown → move 하는 동안 지나간 획을 계속 지운다. 한 번의 드래그 = **Undo 1스텝** |
| 마지막 획 | 메모의 획이 0개가 되면 **메모 레코드도 삭제**한다(빈 메모를 남기지 않는다) |
| 커맨드 | 신규 `DELETE_MEMO_PATH { memoId, path, index }` + 기존 `DELETE_MEMO` 재사용 |
| 잠금 | 메모는 결함이 아니라 `status` 가 없다 → `isLocked` 검사 **하지 않는다** |
| 커서 | `ERASER: 'crosshair'`(`interaction.ts:333` CURSOR 표에 추가). 원형 커서 링은 만들지 않는다 |

**마퀴(드래그 사각형) 다중선택은 이번 범위에 넣지 않는다** (D14 명시).
`selectedIds` 다중선택 모델을 만들지 않으므로 `NO_SELECTION` 구조도 그대로다.

---

### 5-2. 【D15】 상태 범례 신설 (파일1-⑤)

기존 결함유형 범례(D8: 회색 한 색 + 문자 기호)는 **그대로 두고**, 그 아래에 **별개 블록**을 추가한다.

#### 데이터 (프로젝트 스코프 — §5-3 과 함께 옮겨간다)

```ts
// project-core/src/types.ts — DrawingLegend 를 대체하는 프로젝트 스코프 타입
export type ProjectLegend = {
  /** 범례 블록 전체 마스터 스위치 */
  enabled: boolean;
  lgScale: number;
  /** 결함유형 행(D8) 표시. 기본 true — 기존 동작 보존 */
  showTypes: boolean;
  /** D15 상태 범례 3행. 기본 전부 false — 기존 출력물이 한 글자도 안 바뀌게 */
  statusNew: boolean;       // ● 신규(현회차)   빨강 STATUS_COLOR.CURRENT
  statusPending: boolean;   // ● 미보수(전회차) 보라 STATUS_COLOR.PREV_PENDING
  statusRepaired: boolean;  // ● 보수완료      회색 STATUS_COLOR.REPAIRED
};
```

#### 렌더 (canvas-core)

```ts
// legend.ts — 기존 rows 렌더 코드를 건드리지 않기 위해 별도 배열로 넣는다
export type LegendConfig = {
  enabled: boolean;
  lgScale: number;
  rows: LegendRow[];                                // 기존 (D8)
  statusRows: { color: string; desc: string }[];    // 신설. 빈 배열이면 블록을 안 그린다
};
```
- 기호열에 **그 색으로 채운 원(`●`)** 을 그린다. 설명열은 `신규(현회차)` 등 고정 문구.
- 결함유형 범례와 상태 범례 사이에 **가로 구분선 1개**.

#### ⭐ 켜져 있어도 **그 도면에 없는 상태는 그리지 않는다**

```
statusNew      && defects.some(d => d.status === 'CURRENT')
statusPending  && defects.some(d => d.status === 'PREV_PENDING')
statusRepaired && defects.some(d => d.status === 'REPAIRED')
```
근거: 범례는 *"이 도면의 이 색이 무슨 뜻인가"* 를 설명하는 표다. 도면에 없는 색을 설명하면
**거짓말이 된다.** 결함유형 범례가 `rows.length === 0` 이면 안 그리는 것(`pageDecor.ts:76`)과 같은 정신.

`enabled === false` 면 전체를 안 그린다. `enabled` 이고 `rows`·`statusRows` 가 **둘 다 비면** `null`.

---

### 5-3. 【D16】 도곽·범례를 필드별 스코프로 분리 (파일1-④ + 버그 B2)

#### (a) 실제 필드 매핑 — 타입을 다시 확인해 확정했다

`DrawingTitleBlock`(`project-core/src/types.ts:111-126`) 은 9개 필드다.
사용자가 말한 "도곽크기"는 **`tbScale`** 이다 — 근거 둘:
1. 설정 다이얼로그가 이 슬라이더에 **`도곽 크기`** 라는 라벨을 직접 붙이고 있다 (`TitleBlockDialog.tsx:134`)
2. 타입 주석이 *"도곽 전체 비례 배율"* 이고, 렌더러(`canvas-core/src/titleBlock.ts:216`)에서
   `const s = cfg.tbScale;` 가 여백(`TB_MARGIN`)·표제란 높이(`TB_BLOCK_H`)·선 굵기·글꼴에 **전부 곱해진다.**

**"가로/세로 mm" 도 "용지 프리셋" 도 아니다.** 지면 크기 자체는 A4 고정이고
(`Drawing.imgLayout` = `A4_LANDSCAPE` 1754×1240), 도곽은 그 지면 안에서 **비례 배율**만 갖는다.

| 필드 | 다이얼로그 라벨 | D16 지시 | **확정 스코프** |
|---|---|---|---|
| `projectTitle` | PROJECT TITLE | 용역명 → 공유 | **프로젝트** |
| `scale` | SCALE | 스케일 → 공유 | **프로젝트** |
| `tbScale` | **도곽 크기** | 도곽크기 → 공유 | **프로젝트** |
| `drawingName` | DRAWING NAME | 도면명 → 도면별 | **도면** |
| `enabled` | 도곽 표시 | (미언급) | **프로젝트** — 아래 근거 |
| `col0` `col1` | 열 비율 2종 | (미언급) | **프로젝트** — 아래 근거 |
| `labelFontSz` `valueFontSz` | (UI 없음) | (미언급) | **프로젝트** — 아래 근거 |

**미언급 5필드를 프로젝트로 올린 근거** (구현 세부라 질문하지 않고 확정했다):
- `col0`·`col1`·`labelFontSz`·`valueFontSz` 는 **도곽의 생김새**다. `tbScale` 과 성격이 정확히 같고,
  도면마다 다르면 보고서가 들쭉날쭉해진다 — D16 이 `tbScale` 을 공유시킨 취지 그대로다.
- `enabled` 를 도면별로 두면 **사용자는 여전히 도면마다 도곽을 켜야 한다.** 그게 파일1-③
  "도곽 출력안됨"의 원인이었다(§2-2). 여기서 안 고치면 같은 신고가 다시 온다.
- 결과적으로 **`Drawing` 에 남는 도곽 필드는 `drawingName` 하나뿐**이라 모델이 깨끗해진다.
- 되돌리는 비용: 필드 하나를 다시 내리면 된다(낮음).

**범례(`DrawingLegend`)도 통째로 프로젝트로 올린다** — 같은 다이얼로그·같은 문제·같은 성격이다.
단 **범례 *행*은 여전히 도면별 파생**이다(D8 유지, `legendRowsFor(그 도면의 결함)`).

#### (b) 데이터 모델 변경 — **저장 레코드를 한 건도 고치지 않는다**

```ts
// project-core/src/types.ts — 신설
export type ProjectTitleBlock = Omit<DrawingTitleBlock, 'drawingName'>;   // 8필드
export const DEFAULT_PROJECT_TITLE_BLOCK: ProjectTitleBlock = { …DEFAULT_DRAWING_TITLE_BLOCK 에서 drawingName 제외… };
export const DEFAULT_PROJECT_LEGEND: ProjectLegend =
  { enabled: true, lgScale: 1, showTypes: true, statusNew: false, statusPending: false, statusRepaired: false };

export type Project = RecordBase & {
  …기존…
  /** D16 — 도곽 공유 설정. null = 아직 승격 안 됨(읽을 때 기본값) */
  titleBlock: ProjectTitleBlock | null;
  /** D16 — 범례 공유 설정. null = 아직 승격 안 됨 */
  legend: ProjectLegend | null;
};
```

- **`Drawing.titleBlock` / `Drawing.legend` 타입은 그대로 둔다.** 삭제하지 않는다.
  읽기 규칙만 바꿔 `drawingName` **한 필드만** 읽고 나머지 8개는 조용히 무시한다.
- **`DB_VERSION` 1 유지 · 마이그레이션 0건.** `Project` 에 optional 필드 2개가 느는 것은
  IndexedDB 에서 스키마 변경이 아니다(옛 레코드는 `undefined` → `?? null`).

```ts
// apps/web/src/canvas/pageDecor.ts — 새 읽기 규칙
export function titleBlockConfigFor(drawing, project): TitleBlockConfig | null {
  const p = project?.titleBlock ?? DEFAULT_PROJECT_TITLE_BLOCK;   // ⭐ null → 기본값 (버그 B2 해소)
  if (!drawing || !p.enabled) return null;
  const name = drawing.titleBlock?.drawingName ?? null;           // 도면에서 읽는 유일한 값
  return {
    enabled: true,
    projectTitle: (p.projectTitle ?? '').trim() || project?.name || '',
    drawingName:  (name ?? '').trim()          || drawing.name   || '',
    scale: p.scale || DEFAULT_TITLE_BLOCK.scale,
    tbScale: p.tbScale, col0: p.col0, col1: p.col1,
    labelFontSz: p.labelFontSz, valueFontSz: p.valueFontSz,
  };
}
```
**이 한 줄(`?? DEFAULT_PROJECT_TITLE_BLOCK`)이 버그 B2 를 해소한다** — D16 이 명시적으로 승인했다.

#### (c) ⭐ 승격 규칙 — 이미 도곽을 설정해 둔 도면의 값을 잃지 않는다

`Project.titleBlock === null` 인 용역을 **처음 열 때 한 번만** 승격한다.

```
대표 도면 = 그 용역의 도면 중 titleBlock !== null 인 것을
            [ 층 sortOrder 오름차순(지하 음수 먼저) → 도면 sortOrder → 도면 id 사전순 ]
            으로 정렬해 첫 번째
없으면      DEFAULT_PROJECT_TITLE_BLOCK
승격 내용   대표 도면의 titleBlock 에서 drawingName 만 빼고 그대로 Project.titleBlock 에 복사
쓰기        Project 레코드 1건 upsert. 도면 레코드는 건드리지 않는다
```
- **정렬 기준이 결정론적이어야 한다.** `Drawing.sortOrder` 는 `factory.ts:121` 이 전부 `0` 으로
  만들므로 실질 기준은 **층 순서**다. 이 순서는 출력 순서와 같아 사용자에게 설명하기도 쉽다
  ("맨 아래층 도면의 설정을 용역 전체 기본값으로 삼았습니다").
- 승격 시점: **번들 로드 직후 1회**, `project.titleBlock === null` 일 때만.
  `CanvasRoute.tsx:122-127` 의 `ensureProjectSettings`(지연 스냅샷)와 **같은 관용구**를 쓴다.
  진입점 2곳(`CanvasRoute` · `ProjectSetup`) 모두에 건다.
- 범례도 같은 규칙으로 같은 대표 도면에서 승격한다.

#### (d) 다이얼로그 UI — 두 섹션으로 나눈다

```
도곽 · 범례 설정                                        [✕]
─────────────────────────────────────────────────────────
▸ 이 도면
    DRAWING NAME  [___________]   비우면 도면 이름을 씁니다

▸ 용역 전체         ⓘ 이 용역의 모든 도면에 함께 적용됩니다
    ☑ 도곽 표시
    PROJECT TITLE [___________]
    SCALE         [___________]
    도곽 크기     ├──●──┤ 100%          ← tbScale (실시간 미리보기 대상)
    PROJECT TITLE 열 / DRAWING NAME 열
    ─────────
    ☑ 범례 표시   ☑ 결함유형        ← showTypes
    ☐ 신규(현회차) ☐ 미보수(전회차) ☐ 보수완료   ← D15
    범례 크기     ├──●──┤ 100%
```
- `onApply(projectTb, projectLg, drawingName)` 로 시그니처 변경. 저장은 `Project` 1건 + `Drawing` 1건.
- **파일1-④의 "도곽스케일 실시간 미리보기"**: 슬라이더를 끄는 동안 캔버스가 즉시 반영되게 한다.
  `TitleBlockDialog` 은 이미 로컬 `useState` 로 값을 들고 있으므로, 그 값을 **저장 전에도**
  캔버스로 흘려보내는 콜백 `onPreview(tb)` 하나를 추가하면 된다(부모가 임시 오버라이드로 렌더).
  `[취소]` 하면 오버라이드를 버린다. **저장소를 안 때린다.**
- ⚠️ 다이얼로그가 캔버스를 가리면 미리보기가 안 보인다 → 모달을 **우측으로 붙이거나**
  도곽 설정일 때만 스크림을 투명하게 한다. 이건 builder 재량(UI 세부).

---

### 5-4. 【D18】 D9 폐기 → `[유사결함 불러오기]` (파일2-③)

#### (a) 불러오는 필드 범위 — **D9 표를 그대로 재사용한다** (plan-reviewer 확정)

D18 이 미확정으로 남긴 부분이다. **전체 복사가 아니라 D9 표의 "이어받음" 필드만** 복사한다.

근거 셋:
1. 사용자 표현이 *"비슷한 **유형** 결함 불러오기"* 다. 유형 = 분류·판정이다.
2. **전체 복사하면 폭·길이·개소·메모·위치보조가 함께 온다.** 새 결함의 실측치는 반드시 다르므로
   **전부 지우고 다시 입력해야 한다 — 손이 더 간다.** 불러오기의 목적과 반대 방향이다.
3. D9 표는 *"무엇이 반복되고 무엇이 매번 다른가"* 를 사용자가 직접 판정한 표다.
   D18 이 뒤집은 것은 **트리거(자동 → 수동)** 이지 이 판정이 아니다. 판정은 그대로 유효하다.

```
복사한다 (14):  surveyKind · structureType · memberId/memberName · structural
                defectTypeId/defectTypeName · sizeMode · progress · leak
                causeId/causeName · repairId/repairName
복사 안 한다 (8): locationNote · widthMm · lengthMm · areaM2 · areaWMm · areaHMm · countEa · memo
```
= 지금 `DEFECT_SEED_CARRY`(`defectAttrs.ts:58`) **표 그대로**. **표를 바꾸지 않는다.**
`DEFECT_SEED_CARRY` → **`DEFECT_CARRY_FIELDS`**, `pickDefectSeed` → **`pickCarryAttrs`** 로 **이름만** 바꾼다
(`Record<keyof DefectAttrs, boolean>` 구조는 J3 근거대로 유지 — 필드가 늘면 타입 검사가 깨져야 한다).

불러온 뒤 토스트로 **무엇이 안 왔는지 명시**한다:
`○○(2번)의 분류·판정을 불러왔습니다. 규모·개소·메모는 직접 입력하세요` (되돌리기 가능)

#### (b) 동작 — **다음 결함이 아니라 지금 선택된 결함에 즉시 적용한다**

```
1. 결함을 찍는다                  → 빈 폼 (자동 이어받기 없음. D9 폐기)
2. 우측 폼의 [유사결함 불러오기]   → 다이얼로그: 이 용역의 결함 목록
                                    (출력 결함번호가 아니라 입력순번 seq · 부재 · 결함유형 · 층 · 상태)
                                    상단에 검색창(부재·결함유형 이름)
3. 하나 고르면                    → 현재 선택된 결함에 (a)의 14필드를 SET_DEFECT_ATTRS 로 적용
4. Ctrl+Z                        → 1스텝으로 되돌아간다 (기존 커맨드 경로라 공짜)
```
- **`defectSeed` 인프라를 완전히 제거한다.** 상태를 들고 있을 이유가 사라졌다.
- ⚠️ **다이얼로그가 보여주는 번호는 `seq`(입력순번)다. 출력 결함번호가 아니다.**
  출력번호는 출력 시점에만 존재한다(불변식 #2). 사용자가 "2번 결함"이라 부르는 것은
  좌측 리스트와 도면 위 풍선에 보이는 그 번호이고, 그것이 `seq` 다(`store.ts:170-174`).
- ⚠️ **잠긴 결함(전회차)에는 적용하지 않는다** — `setDefectAttrs` 가 이미 `isLocked` 로 거부한다
  (`store.ts:372`). 버튼도 `disabled`.
- **`ui/defectForm/*` 은 store·repo·캔버스를 import 하지 않는다**(경계 규칙) →
  버튼은 `defectForm` 안에 두되 **후보 목록은 props 로 받고** 다이얼로그는 `CanvasRoute` 가 띄운다.

#### (c) ⭐ D9 폐기에 따라 갱신해야 하는 곳 — **전부 찾았다**

`defectSeed|DEFECT_SEED_CARRY|pickDefectSeed|seedAttrs` grep = **51곳 / 10파일**.

| 파일 | 할 일 |
|---|---|
| `packages/canvas-core/src/defectAttrs.ts` | `DEFECT_SEED_CARRY` → `DEFECT_CARRY_FIELDS`, `pickDefectSeed` → `pickCarryAttrs`. **머리 주석의 D9 근거를 D18 로 교체**(표 자체는 유지) |
| `packages/canvas-core/src/interaction.ts` | `ReduceContext.defectSeed` 제거 + 결함 생성 4곳의 `...(ctx.defectSeed ?? {})` 제거 → `{ ...EMPTY_DEFECT_ATTRS }`. **단 프로젝트 기본 구조유형은 살려야 한다** — (d) 참조 |
| `apps/web/src/store.ts` | `AppState.defectSeed` · `initialAppState:148` · `case 'LOAD':187` · `runInput:345` · `setDefectAttrs:386-389` 의 씨앗 갱신 제거. **주석 `· 커밋된 값이 다음 결함의 씨앗이 된다 (S6 · D9)`(`:368`) 삭제** |
| `apps/web/src/routes/CanvasRoute.tsx` | `LOAD` 시 `defectSeed: seedAttrs(...)` 제거 → (d) 로 대체 |
| `packages/canvas-core/test/s6.test.ts` | `DEFECT_SEED_CARRY`·`pickDefectSeed` 임포트명 교체. **테스트 문구 `'D9 표 그대로다 — 이어받음 14 · 새로 받음 8'` → `'D18 불러오기 표 — 복사 14 · 새로 받음 8'`.** 씨앗 자동갱신을 검증하던 케이스는 **삭제**하고, 대신 `pickCarryAttrs` 순수 검증만 남긴다 |
| `packages/canvas-core/test/s2b.test.ts` | `defectSeed` 를 넘기던 `ReduceContext` 픽스처 정리 |
| `apps/web/src/ui/defectForm/DefectInfoForm.tsx` | `[유사결함 불러오기]` 버튼 추가 |
| `apps/web/src/routes/settings/PreviewTab.tsx` · `packages/project-core/src/items/apply.ts` · `test/apply.test.ts` | **`seedAttrs`(항목설정 씨앗)는 이름만 비슷한 다른 것이다. 손대지 마라** — grep 결과에 섞여 나오므로 명시해 둔다 |
| 문서 | `DECISIONS.md` D9 에 `⚠️ D18 로 폐기됨(2026-08-28)` 한 줄 추가 · `NEXT.md` · `ASSUMPTIONS.md` J 계열 · `QUESTIONS.md` Q44 · `29_..._PhotoPolish.md` §2-7 |

#### (d) ⭐ 함께 없애면 안 되는 것 — 프로젝트 기본 구조유형

`CanvasRoute.tsx` 의 최초 `LOAD` 시 `seedAttrs(s, b.project)` 는 **"이 용역의 기본 구조유형(RC 등)"**
이지 D9 의 직전 입력 기억이 아니다. **빈 폼에도 구조유형은 채워져 있어야 한다.**
→ `defectSeed` 를 없애되, 이 값은 `ReduceContext.defaultAttrs`(프로젝트 고정, 절대 갱신되지 않음)로
**이름을 바꿔 남긴다.** 이걸 같이 지우면 결함을 찍을 때마다 구조유형을 다시 고르게 된다.

---

### 5-5. 【D19】 층 접두 번호 + 사진번호 전체연속 (파일2-⑤)

#### (a) `Floor.code` 신설 — 선택 입력

```ts
// project-core/src/types.ts
export type Floor = RecordBase & {
  …기존…
  /** D19 — 출력 접두어(`1F`·`B1F`·`RF`·`W`). null/'' = 이름에서 자동 파생 */
  code: string | null;
};
```
optional 필드 추가 → **마이그레이션 0건**(옛 레코드는 `undefined` → `?? null`).
정규화: 공백 제거 · 대문자 · **최대 6자**. 용역 구성 화면(P2) 층 행에 작은 입력칸 하나.

#### (b) `parseFloorName` 에 `EXTERIOR` 추가 — "외부"를 자동으로 `W` 로 읽는다

```ts
// floorOrder.ts
export type FloorParse =
  | … 기존 6종 …
  | { kind: 'EXTERIOR'; sortOrder: number };      // 신설

// types.ts — 옥탑(9000)보다 뒤 = 층 목록 맨 아래 = 출력 순서 마지막
export const SORT_EXTERIOR = 9500;
```
`parseFloorName` 삽입 위치 — **PIT 검사 바로 다음, ROOFTOP 검사 앞**:
```ts
if (s.includes('외부') || s.includes('외곽') || s.includes('옥외') ||
    s.includes('외벽') || s === 'EXT' || s === 'EXTERIOR') {
  return { kind: 'EXTERIOR', sortOrder: SORT_EXTERIOR };
}
```
**충돌 검사(직접 확인함):** `norm()` 은 공백제거+대문자만 한다.
`외부`·`외곽`·`옥외`·`외벽` 은 기존 패턴(`PIT`/`피트`, `옥탑`, `PH`, `R`, `RF`, `옥상`, `지붕`,
`지하n층`/`Bn`, `지상n층`/`n층`/`nF`/`Fn`) 중 어느 것과도 겹치지 않는다.
`옥외` 에는 `옥상`도 `지붕`도 들어 있지 않으므로 ROOF 로 오인되지 않는다.
⚠️ **`W` 자체는 패턴에 넣지 않는다** — `W` 는 *출력 코드*이지 층 *이름*이 아니다.
사용자는 "외부"라고 입력하고, 코드가 `W` 로 나간다.

⚠️ `renumber()`(`floorOrder.ts:131-142`)는 드래그 후 재번호에서 EXTERIOR 의 9500 을 잃는다.
**이건 ROOFTOP·ROOF 도 이미 똑같이 잃는 기존 동작이다. 손대지 않는다** — 드래그가 최종 권한(§2-7-b).

#### (c) 접두어 파생 함수 (신설, `project-core`)

```ts
export function floorCodeOf(floor: { name: string; code?: string | null }): string | null {
  const manual = (floor.code ?? '').trim();
  if (manual !== '') return manual.toUpperCase();
  const p = parseFloorName(floor.name);
  switch (p.kind) {
    case 'ABOVE':    return `${p.n}F`;    // 지상1층 → 1F
    case 'BELOW':    return `B${p.n}F`;   // 지하1층 → B1F
    case 'ROOF':     return 'RF';         // 옥상   → RF
    case 'ROOFTOP':  return 'PH';         // 옥탑   → PH
    case 'PIT':      return 'PIT';
    case 'EXTERIOR': return 'W';          // 외부   → W
    default:         return null;         // 파싱 실패 → 접두어 없음
  }
}
```
⚠️ **`ROOF → 'RF'` / `ROOFTOP → 'PH'` 로 매핑한 이유:** 사용자 예시가 `RF-01` 이었는데,
파서는 문자열 `'RF'` 를 **옥탑**으로 읽는다(`floorOrder.ts:58`). 국제 관례(RF = Roof Floor,
PH = Penthouse)와 사용자 예시를 동시에 만족시키려면 이 매핑이 맞다.

#### (d) 표기 포매터 (신설, `numbering.ts`)

```ts
/** D19 — 출력 결함번호 표기. 접두어가 있으면 `1F-01`, 없으면 `1` */
export function formatDefectNo(no: number, floorCode: string | null): string {
  if (floorCode === null || floorCode === '') return String(no);
  return `${floorCode}-${String(no).padStart(2, '0')}`;   // 2자리 0채움. 100 이상은 자연 확장
}
```
**자릿수 2자리 0채움 — D19 (나) 이견 없음으로 확정.** `1F-100` 은 3자리로 그대로 늘어난다.

#### (e) 사진번호 전체연속 — **Q34/K6 폐기**

```ts
// numbering.ts:176-181
if (params.mode === 'PER_FLOOR') {
  no = 0;
  // photoNo = 0;   ← ⭐ 삭제한다 (D19). 사진번호는 층이 바뀌어도 이어진다
}
```
사용자 예시(`1F-01 = 1번사진`, `2F-01 = 13번사진`)가 정확히 이 동작이다.
`packages/project-core/test/numbering.test.ts` 의 K6 케이스를 **뒤집어 다시 고정**한다.

#### (f) ⭐ 재현성 — `ExportParams` 에 층 코드 스냅샷을 넣는다

접두어가 출력 시점 파생값이므로, **층 이름이나 `code` 를 나중에 고치면 재출력 시 접두어가 바뀐다.**
이건 *"같은 옵션으로 다시 뽑으면 같은 번호가 나와야 한다"* 를 깬다.

```ts
export type ExportParams = NumberingParams & {
  render: ExportRenderOptions;
  doc: ExportDocOptions;
  /** D19 — 출력 당시의 층 접두어 스냅샷. 없으면(옛 run) 현재 층에서 파생 */
  floorCodes?: Record<string, string | null>;
};
```
- `ExportParams` 는 `meta` KV 에 JSON 으로 들어간다 → **필드 추가에 마이그레이션이 없다.**
- `ExportRun.mapping` 은 **`{no: number, photoNo}` 그대로다.** 접두어는 표기일 뿐 저장 번호가 아니다
  (불변식 #2 유지).
- `[같은 번호로 다시 받기]` 는 `run.params.floorCodes` 를 그대로 쓴다 → **접두어까지 재현된다.**

#### (g) ⚠️ 미해결 세부 → **Q53 (비차단)**

D19 의 *"접두어를 입력하면 그 층은 층별 번호부여가 활성화된다"* 를 **층별 혼합**으로 읽으면 모순이 난다:

```
층A(접두어 1F) → 1F-01, 1F-02, 1F-03
층B(접두어 없음) → 04, 05      ← 이 "04" 는 무엇의 04인가?
```
앞 층이 `1F-01~03` 으로 표기됐으므로 사용자는 `04` 를 보고 앞에 3건이 있었음을 알 수 없다.
**번호가 자기 설명적이지 않게 된다.**

→ **모순 없는 해석으로 진행한다(가정 U13):**
**접두어가 하나라도 있으면 출력 번호모드를 `PER_FLOOR` 로 자동 전환**하고,
접두어가 없는 층은 접두어 없이 `01, 02`(그 층 안에서 리셋)로 나간다.
- `numbering.ts` 의 `assignNumbers` 는 **한 줄도 안 바꾼다**(포매터와 모드 결정만 바깥에서 한다).
- 사용자가 출력 화면에서 모드를 다시 바꿀 수 있다(자동 전환은 **기본값 제안**이지 강제가 아니다).
- 되돌리는 비용 낮음(`Export.tsx` 모드 초기값 계산 1곳 + 포매터).

---

### 5-6. 【D17】 파일2-② 발생원인 ↔ 보수·보강방안 — ⏸️ **보류. 이번 라운드에서 뺀다**

사용자가 **실무 표(어느 결함유형에 어느 발생원인·보수방안이 맞는지)를 나중에 정리해서 주기로** 했다.
그때까지 **씨앗 데이터도 연결 구조도 착수하지 않는다.**

조사해 둔 사실은 남겨 둔다 — 표가 오면 바로 판단할 수 있게:
- `items/types.ts:52-64` 에 `linkDefectTypeCause` · `linkDefectTypeRepair` 만 있고 `linkCauseRepair` 는 없다
- `items/seed.ts:68-82` 발생원인 4종 · 보수방안 5종이 **전부 균열 계열**이고,
  `:175-182` 이 결함유형 13종에 **전조합**으로 붙인다 → 누수흔적에도 "에폭시 주입공법"만 뜬다
- 표가 오면 **씨앗 데이터만 늘리는 쪽(A)이 코드 변경 0** 이고, 새 링크(B)로 가는 길도 막히지 않는다

---

## 6. 작업 분해

### 6-A. 지금 착수 가능 (질문 불필요) — 4작업

| # | 작업 | 산출물(파일) | 의존 | 난이도 |
|---|---|---|---|---|
| **F-1** | 모달 포커스 도둑 수정 (파일2-①) | `canvas/CanvasView.tsx` · `ui/Form.tsx` | — | **중** |
| **F-2** | 인쇄 뷰 자동 인쇄 제거 + 준비완료 버튼 (파일1-⑥ 뒷부분) | `export/printView/PrintRoute.tsx` · `printView/print.css` | — | 하 |
| **F-3** | 도곽·범례 다이얼로그 문구 정정 (B2-c) | `routes/TitleBlockDialog.tsx` | — | 하 |
| **F-4** | 사진첩 사진번호 숨기기 (파일2-⑥) | `project-core/src/export/photoBook.ts` · `export/params.ts` · `test/photoBook.test.ts` · `web/src/export/exportModel.ts` · `printView/PrintRoute.tsx` · `routes/export/OptionsPanel.tsx` | R-8 권장 | 하 |

> **F-4 는 R-8(사진첩 반영)과 같은 파일을 만진다.** R-8 을 먼저 하거나 같은 PR 로 묶어라 —
> 따로 하면 `photoBook.ts` 에서 충돌한다.

### 6-B. 진행 중인 PhotoPolish 완결 (이번 메모와 별개로 반드시 끝낸다)

| # | 상태 | 비고 |
|---|---|---|
| R-1 EXIF · R-2 좌표변환 · R-7 조사구분 | ✅ 커밋됨 (`04210f6`) | — |
| **R-3 합성 렌더러** | 🟡 **파일 2개 작성됐으나 미커밋** (`data/photoCompose.ts` · `data/usePhotoComposite.ts`) | 타입검사·빌드 확인 후 커밋만 남았다 |
| R-4 캡션 · R-5 자르기 · R-6 주석 | ⬜ 미착수 | R-5→R-8 은 **반드시 같은 PR** (스펙 §3 경고) |
| **R-8 사진첩 반영** | ⬜ 미착수 | **F-4(파일2-⑥) 와 같은 파일** |
| **R-9 손상결함표 인쇄 뷰** | ⬜ 미착수 | **파일1-⑥(Excel/PDF 버튼 분리)의 선행 조건** — 손상결함표 PDF 버튼을 만들려면 인쇄 뷰가 있어야 한다 |

### 6-C. D14~D19 확정 작업 — ✅ **착수 가능** (2026-08-28 2차)

| # | 작업 | 산출물(파일) | 의존 | 난이도 |
|---|---|---|---|---|
| **G-6** | **층 접두 번호 + 사진번호 전체연속** (D19 · §5-5) | `project-core/src/floorOrder.ts`(EXTERIOR) · `types.ts`(`Floor.code` · `SORT_EXTERIOR`) · `export/numbering.ts`(`formatDefectNo` · photoNo 리셋 제거) · `export/params.ts`(`floorCodes`) · `export/damageTable.ts` · `export/defectList.ts` · `export/photoBook.ts` · `test/floorOrder.test.ts` · `test/numbering.test.ts` · `web/src/export/produce.ts` · `printView/PrintRoute.tsx` · `routes/ProjectSetup.tsx`(code 입력) · `routes/Export.tsx`(모드 자동전환) | — | **중** |
| **G-3** | **도곽·범례 프로젝트 스코프 + 실시간 미리보기 + B2 버그** (D16 · §5-3) | `project-core/src/types.ts`(`ProjectTitleBlock`·`ProjectLegend`·기본값) · `web/src/canvas/pageDecor.ts` · `routes/TitleBlockDialog.tsx` · `routes/CanvasRoute.tsx` · `routes/ProjectSetup.tsx`(승격) · `data/factory.ts` | — | **중~상** |
| **G-2** | **상태 범례 신설** (D15 · §5-2) | `canvas-core/src/legend.ts`(`statusRows`) · `canvas-core/test/legend.test.ts` · `web/src/canvas/pageDecor.ts` · `routes/TitleBlockDialog.tsx` | **G-3** | 중 |
| **G-5** | **D9 폐기 → `[유사결함 불러오기]`** (D18 · §5-4) | `canvas-core/src/defectAttrs.ts`(이름변경) · `interaction.ts`(`defectSeed`→`defaultAttrs`) · `canvas-core/test/s6.test.ts` · `test/s2b.test.ts` · `web/src/store.ts` · `routes/CanvasRoute.tsx` · `ui/defectForm/DefectInfoForm.tsx` · 신규 `ui/defectForm/SimilarDefectPicker.tsx` | — | **중~상** |
| **G-1** | **필기메모 점선상자 숨김 · 획 히트 · 지우개** (D14 · §5-1) | `canvas-core/src/types.ts`(`Tool` 에 `ERASER`) · `hitTest.ts` · `renderModel.ts` · `interaction.ts` · `commands.ts`(`DELETE_MEMO_PATH`) · `constants.ts` · `canvas-core/test/s2a.test.ts` · `test/hitTest.test.ts` · `web/src/canvas/ToolPalette.tsx` · `web/src/store.ts`(커맨드 적용·역적용) | — | **상** |

**보류:** G-4(발생원인↔보수방안) — **D17 로 이번 범위에서 제외.** 사용자가 실무표를 줄 때까지 착수 안 함.

### 6-D. 아직 질문이 막고 있는 작업 (2건)

| # | 작업 | 선행 | 난이도 |
|---|---|---|---|
| G-7 | Excel/PDF 버튼 매트릭스 (파일1-⑥ 앞부분) | **Q52** + R-9 | 중 |
| G-8 | 전차 → 금차 자동전환 (파일2-④) | **Q42** | **상** |

---

## 7. 지적 사항

| 유형 | 위치 | 내용 | 심각도 |
|---|---|---|---|
| **버그** | `canvas/CanvasView.tsx:286-289` | `onKeyUp` 에 `isTypingTarget` 가드 없음. 모든 텍스트 입력의 keyup 이 캔버스 리듀서를 돌린다 | 🔴 높음 |
| **버그** | `ui/Form.tsx:99-131` | 포커스 이펙트가 `[onClose]` 에 걸려 있고, 두 호출자(`CanvasRoute.tsx:884` · `ProjectSetup.tsx:1189`) 모두 인라인 함수를 넘긴다 → 부모가 리렌더할 때마다 포커스 강탈 | 🔴 높음 |
| **버그** | `ui/Form.tsx:101-104` | `querySelector` 가 문서 순서 첫 요소를 잡는데 `.modal__x`(닫기)가 본문보다 앞이다. **모달을 열면 항상 닫기 버튼에 포커스가 간다** — 접근성 관점에서도 틀렸다 | 🟠 중 |
| **모순** | `TitleBlockDialog.tsx:87-89` ↔ `pageDecor.ts:28` + `locationMap.ts:164` | 문구는 "화면 표시 여부"라는데 실제로는 **출력도 이 값에 걸린다.** 사용자를 직접 오도한 문장 | 🔴 높음 |
| **누락** | `pageDecor.ts:27-28` | `titleBlock === null` 을 `DEFAULT_DRAWING_TITLE_BLOCK`(`enabled:true`)로 폴백하지 않는다. `TitleBlockDialog.tsx:43-45` 는 폴백한다 → **체크박스는 켜져 보이는데 안 그려진다** | 🔴 높음 |
| **미결정** | `PrintRoute.tsx:151-168` | 자동 `window.print()`. 미리보기와 인쇄를 분리할지 정해진 적이 없다 | 🟠 중 → F-2 |
| **모호함** | 파일1-① "필기" | 툴 팔레트에 **`그리기(SKETCH)` 와 `필기메모(MEMO)` 두 개**가 있다(`ToolPalette.tsx:77-98`). 어느 쪽인지 정해지지 않으면 지우개의 대상이 안 정해진다 | 🔴 높음 → Q45 |
| **모호함** | 파일1-① "영역표시 x" | 필기메모는 **획을 감싸는 점선 상자**를 그린다(`memoGeom.ts:105·136-156`). 이것을 없애라는 뜻으로 읽히나, 그 상자가 **히트 영역이자 이동 손잡이**다(`interaction.ts:874-887`) — 없애면 선택·이동 방법이 함께 사라진다 | 🔴 높음 → Q45 |
| **누락** | 마퀴(영역) 선택 | `packages/` 전체에 `marquee`·`selectedIds`·다중선택 **0건**. 파일1-①의 "선택도구로 구간 영역 선택"은 신규 기능이다 | 🟠 중 → Q45 |
| **모순** | 파일2-⑤ ↔ `numbering.ts:176-181`(K6·Q34) | 사용자 예시(`2F-01 = 13번사진`)는 사진번호를 **리셋하지 말라**는 뜻인데 현재 코드는 리셋한다 | 🟠 중 → Q50 |
| **누락** | `types.ts:85-93` `Floor` | 층 약어(`1F`·`W`) 필드 없음. `parseFloorName` 으로 `W` 는 파생 불가(`UNKNOWN`) | 🟠 중 → Q50 |
| **누락** | `items/types.ts:52-64` | `linkCauseRepair` 없음. 발생원인별 보수방안이라는 개념 자체가 데이터에 없다 | 🟠 중 → Q48 |
| **미결정** | 씨앗 데이터 (`items/seed.ts:68-82`) | 발생원인 4종·보수방안 5종이 **전부 균열 계열**. 누수흔적·마감박리·백태에도 이 5개만 붙는다(전조합, `:175-182`) — 실무에서 못 쓴다 | 🟠 중 → Q48 |
| **성질(버그 아님)** | `constants.ts:159` + `renderModel.ts:736` | 번호 풍선이 **도면 이미지 px 34 고정**. 대형 도면에서 인쇄 시 사실상 안 보인다. `labelScale`(F6)로 보정 가능하나 사용자가 그 존재를 모를 수 있다 | 🟡 → Q51 |
| **성질(버그 아님)** | `produce.ts:27-32` · `Export.tsx:71` | 사진첩은 `[생성]` 으로 파일이 안 나온다(M3·Q37). **사용자가 "출력안됨"으로 신고했다** — 설계가 옳아도 전달에 실패했다 | 🟠 중 → Q52 로 해소 |
| **정보** | `locationMap.ts:260-266` `groupDrawingsByFloor` | 층에 도면이 2장 이상이면 `sortOrder` 최소를 쓰는데 `factory.ts:121` 이 **전부 `sortOrder: 0`** 으로 만든다 → 어느 도면이 뽑힐지 사실상 불확정. 이번 범위 아님. **고치지 말고 기록만** | 🟢 낮음 |
| **정보** | `usePhotos.ts:126` `defectsWithPhoto` | R 라운드에서 이미 기록된 이름/구현 불일치. 여전히 남아 있다. **이번에도 고치지 않는다** | 🟢 낮음 |

---

## 8. 사용자 확인 필요

`_workspace/QUESTIONS.md` 에 **Q45~Q53 (9건)** 을 기록했다. 재상신 1건(Q42).

| 질문 | 주제 | 상태 |
|---|---|---|
| ~~Q45~~ | 파일1-①⑦ — "필기"가 어느 도구이며, 점선상자를 없애면 선택·이동을 무엇으로 하는가 | ✅ **확정 D14** (추천안 A) |
| ~~Q46~~ | 파일1-⑤ — 범례 `결함 / 보수 / 신규` 가 무엇인가 | ✅ **확정 D15** (추천안 A) |
| ~~Q47~~ | 파일1-④ — 도곽 스코프 (+ B2-a 동반 승인) | ✅ **확정 D16** (필드별 스코프 · 추천안보다 정밀) |
| ~~Q48~~ | 파일2-② — 발생원인↔보수방안 | ⏸️ **보류 D17** (실무표 대기) |
| ~~Q49~~ | 파일2-③ — D9 를 유지하는가 끄는가 | ✅ **확정 D18** (D9 **폐기**) |
| ~~Q50~~ | 파일2-⑤ — 층 접두어 · 자릿수 · 사진번호 전체연속 | ✅ **확정 D19** (세부 1건 → Q53) |
| **Q51** | 파일1-②③ — "출력안됨" 2건의 실제 증상 확인 (진단 검증) | 🟡 미답 · **비차단** |
| **Q52** | 파일1-⑥ — Excel/PDF 버튼 매트릭스 | 🔴 미답 · G-7 만 차단 |
| **Q53** | 파일2-⑤ — 접두어가 **일부 층에만** 있을 때 나머지 층의 번호는? | 🟡 신규 · **비차단**(U13 로 진행) |
| **Q42** | 파일2-④ — 사진을 지우면 전회차로 되돌아가는가 | 🟡 미답 · G-8 만 차단 |

`_workspace/ASSUMPTIONS.md` 의 **U1~U8**(1차) · **U9~U15**(2차, D 반영분) 에 가정을 기록했다.

---

## 9. 우선순위 제안 — 이 순서로 간다

**판단 기준: ① 사용자가 지금 못 쓰는 것 → ② 이미 벌여 놓은 일의 완결 → ③ 답이 온 신규 기능.**

### 1️⃣ 지금 — 버그 3건 (F-1 · F-2 · F-3)

**근거:** 파일2-①은 도곽 설정 화면을 **아예 못 쓰게 만든다.** 파일1-③④와 파일2-①이 전부 도곽 이야기인 것은
우연이 아니다 — 사용자는 도곽을 쓰려다 세 번 막혔다. F-1·F-3 을 먼저 풀어야 나머지 도곽 논의(Q47)를
**실제 화면을 보면서** 할 수 있다. F-2 는 코드 3줄 수준인데 사용자 체감이 가장 크다.
**세 건 모두 질문이 필요 없고 되돌리는 비용이 낮다.**

### 2️⃣ 그다음 — PhotoPolish 완결 (R-3 커밋 → R-4 → R-5+R-6+R-8+F-4 → R-9)

**근거:** R-3 은 **파일 2개가 이미 작성돼 커밋만 남았다** — 여기서 멈추면 미커밋 코드가 썩는다.
R-9(손상결함표 인쇄 뷰)는 **파일1-⑥(Excel/PDF 버튼)의 선행 조건**이라 어차피 필요하다.
F-4(파일2-⑥)는 R-8 과 같은 파일이므로 **여기 끼워 넣는 것이 가장 싸다.**
⚠️ R-5(자르기)를 하면 R-8 을 반드시 함께 한다 — 안 하면 자른 사진이 보고서에 안 잘린 채 나간다.

### 3️⃣ 병행 — 사용자에게 Q45~Q52 브리핑

**근거:** 위 두 단계는 며칠 걸린다. 그 사이에 답이 오면 대기 시간이 0이 된다.
**Q47(도곽 스코프)과 Q52(버튼 매트릭스)를 먼저 받아라** — 각각 1️⃣·2️⃣ 의 결과물과 직접 이어진다.

### 4️⃣ 그다음 — D14~D19 확정 기능 (2026-08-28 2차 확정 순서)

**착수 순서: `G-6 → G-3 → G-2 → G-5 → G-1`**

| 순서 | 왜 여기인가 |
|---|---|
| **G-6**(층 번호) | **다른 작업과 파일이 하나도 안 겹친다**(`numbering.ts`·`floorOrder.ts` 계열). 단위테스트가 이미 촘촘해 검증이 싸다. **출력 4종이 전부 이 결과를 쓰므로 먼저 고정해야 뒤가 안 흔들린다** |
| **G-3**(도곽 스코프) | **G-2 가 같은 파일(`pageDecor.ts`·`TitleBlockDialog.tsx`)을 만진다.** 스코프 이동을 먼저 끝내고 그 위에 범례를 얹는다. 반대로 하면 두 번 고친다. 버그 B2 도 여기서 함께 해소된다 |
| **G-2**(상태 범례) | G-3 이 만든 `ProjectLegend` 위에 3필드를 얹는 작업이라 G-3 없이는 둘 곳이 없다 |
| **G-5**(D9 폐기·불러오기) | 파일이 넓지만(10곳) **논리는 단순**하고, `canvas-core` 의 위험 구간(히트·렌더)을 안 건드린다. G-1 앞에 둬서 캔버스 테스트를 한 번에 두 번 흔들지 않는다 |
| **G-1**(필기·지우개) | **마지막.** `canvas-core` 의 **히트테스트·렌더모델·툴 집합·커맨드**를 동시에 건드리는 유일한 작업이다. 277개 캔버스 테스트가 걸려 있고, Phase 5 태블릿 터치(트랙 A)가 **같은 `hitProfile` 코드**를 쓴다. 다른 것을 전부 안정화한 뒤에 손대야 한다 |

### 5️⃣ 마지막 — 질문이 풀리면

- **G-7**(Excel/PDF 버튼) — Q52 답변 + R-9 완료 후
- **G-8**(전차→금차) — Q42 답변 후. 상태 전이 + 사진 승계 + 번호·색 동기화가 한 덩어리이고
  `repo.ts:590` 이 명시한 대로 **Phase 2-D** 소관이다. 반쪽으로 만들면 갈아엎는다
- **G-4**(발생원인↔보수방안) — **D17 보류.** 사용자가 실무표를 줄 때까지 착수하지 않는다

---

## 10. 절대 어기면 안 되는 것 (이번 범위 재확인)

1. **출력 번호를 저장하지 않는다.** 파일2-⑤ `1F-01` 은 `(floorId, no)` 파생 문자열이다 —
   `ExportRun.mapping` 스키마를 바꾸지 않는다 (불변식 #2 · 재현성)
2. **`DB_VERSION` 1 유지 · 마이그레이션 0건.** `pageDecor.ts` 폴백은 **읽기 시점 정규화**로 한다
   (`isInkMemo` 와 같은 수법). 저장된 `titleBlock: null` 을 일괄로 채우지 않는다
3. **D9(직전 입력 이어받기)를 사용자 답변 없이 끄지 않는다** — 파일2-③은 D9와 배타적이지 않다
4. **`assignNumbers()` 는 파일2-⑥(번호 숨기기)에서 손대지 않는다.** 숨기는 것은 표시뿐이다
5. **PDF 라이브러리를 넣지 않는다** — 파일1-⑥ 버튼 분리도 `window.print()` + `@page` 위에서 한다
6. **`canvas-core` 는 `window`/`document`/React 를 참조하지 않는다** — G-1 지우개도 코어에는 순수 로직만
7. **색 예약을 깨지 않는다** — 파일1-⑤ 범례가 상태 범례라면 빨강/보라/회색을 그대로 쓴다(D8 유지)
8. **`ui/defectForm/*` 은 store·repo·캔버스를 import 하지 않는다** — 파일2-③ 불러오기 버튼은 이 경계를 지킨다

---

## 변경 이력

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-08-28 | 최초 작성 | 사용자 수정사항 2파일(13항목) 검토. 버그 3건 근본원인 확정, 질문 8건 상신 |
| 2026-08-28 | **2차 — 사용자 답변(D14~D19) 반영** | 아래 |

## 변경 이력 — 2026-08-28 사용자 답변 반영

사용자가 Q45~Q50 에 답했다(`DECISIONS.md` D14~D19). **1차 문서를 다시 쓰지 않고 확정된 절만 갱신했다.**
§2~§4(버그 근본원인·코드 조사 결과)는 **한 글자도 고치지 않았다** — 그 조사는 답변과 무관하게 유효하다.

| 절 | 변경 | 사유 |
|---|---|---|
| §0 요약표 | 판정 열을 2차 판정으로 교체. 착수 불가 7 → **바로 착수 9 · 조건부 3 · 보류 1** | D14~D19 |
| §1 총평 | "조건부 가능" → **"바로 착수 가능"**. 폐기되는 기존 결정 2건(D9 · Q34/K6)을 표로 명시 | D18 · D19 |
| **§5 전체** | "질문이 풀리면 이렇게 간다(설계 방향만)" → **"확정 스펙 — builder 착수 기준값"**. 5-1~5-6 으로 재작성 | 6개 결정 확정 |
| §6-C | "질문 답변 후 착수(금지)" → **"확정 작업 · 착수 가능"**. 파일 목록·의존·난이도 구체화 | 동상 |
| §6-D | 신설 — 아직 질문이 막고 있는 2건(G-7 · G-8)만 분리 | Q52 · Q42 미답 |
| §8 | 질문 표에 확정 상태 반영. **Q53 신규 추가** | D19 세부 미결 |
| §9 | 4️⃣ 착수 순서를 `G-6 → G-3 → G-2 → G-5 → G-1` 로 확정하고 각 순서의 근거를 명시. 5️⃣ 신설 | 파일 충돌·위험도 기준 재정렬 |

### 이번 갱신에서 **plan-reviewer 가 직접 확정한 것** (질문하지 않은 구현 세부)

| 항목 | 확정 | 근거 |
|---|---|---|
| "도곽크기" = 어느 필드인가 | **`tbScale`**(도곽 전체 비례 배율). 가로/세로 mm 도 용지 프리셋도 아니다 | 다이얼로그가 이 슬라이더에 `도곽 크기` 라벨을 직접 붙였고(`TitleBlockDialog.tsx:134`), 렌더러가 `const s = cfg.tbScale` 를 여백·표제란 높이·글꼴에 전부 곱한다(`titleBlock.ts:216`) |
| D16 미언급 5필드 | `col0`·`col1`·`labelFontSz`·`valueFontSz`·`enabled` **전부 프로젝트 스코프** | 앞 4개는 `tbScale` 과 성격이 같은 "도곽 생김새". `enabled` 을 도면별로 두면 **파일1-③ 신고가 그대로 재발**한다 |
| 기존 값 승격 대표 | **층 sortOrder → 도면 sortOrder → id** 순 첫 번째 `titleBlock !== null` 도면 | `Drawing.sortOrder` 가 전부 0 이라(`factory.ts:121`) 실질 기준은 층 순서고, 그건 출력 순서와 같아 설명하기 쉽다 |
| 승격 시점 | 번들 로드 직후 1회 · `project.titleBlock === null` 일 때만 | `ensureProjectSettings`(지연 스냅샷, `CanvasRoute.tsx:122-127`)와 같은 관용구 |
| D18 불러오기 범위 | **D9 표 그대로**(복사 14 · 새로 받음 8). 전체 복사 아님 | 사용자 표현이 "비슷한 **유형**". 전체 복사하면 폭·길이·개소가 따라와 **지우는 손이 더 든다**. D18 이 뒤집은 건 트리거지 이 판정이 아니다 |
| 프로젝트 기본 구조유형 | `defectSeed` 제거하되 `ReduceContext.defaultAttrs` 로 **이름만 바꿔 남긴다** | `seedAttrs(s, b.project)` 는 D9 가 아니라 "이 용역의 기본 구조유형". 같이 지우면 결함마다 구조유형을 다시 고르게 된다 |
| `ROOF`/`ROOFTOP` 코드 | **`ROOF → RF`, `ROOFTOP → PH`** | 사용자 예시가 `RF-01` 인데 파서는 문자열 `'RF'` 를 **옥탑**으로 읽는다(`floorOrder.ts:58`). 국제 관례(RF=Roof Floor, PH=Penthouse)와 사용자 예시를 동시에 만족 |
| `EXTERIOR` 패턴 | `외부`·`외곽`·`옥외`·`외벽`·`EXT`·`EXTERIOR`. **`W` 는 넣지 않는다** | `W` 는 *출력 코드*이지 층 *이름*이 아니다. 기존 패턴과 충돌 없음을 `norm()` 기준으로 직접 검사함 |
| `SORT_EXTERIOR` | **9500**(옥탑 9000 보다 뒤 = 목록 맨 아래 = 출력 마지막) | 실무에서 외부는 보고서 맨 뒤. 드래그가 최종 권한이라 되돌릴 수 있다 |
| `ExportParams.floorCodes` | **스냅샷을 넣는다** | 접두어가 파생값이라 층 이름·code 를 고치면 재출력 결과가 달라진다. **"같은 옵션이면 같은 번호"를 접두어까지 확장** |
