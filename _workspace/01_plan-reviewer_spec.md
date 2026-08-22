# 스펙 검토 결과 — Phase 3 도면 캔버스 (코어 + PC 정리 기능)

작성 2026-08-22 · plan-reviewer
기준: `OnSpect_상세기획.md` · `_workspace/DECISIONS.md` (D1·D2) · `docs/benchmark/젠트릭스_분석.md` · `벤치마킹 스크린샷/` 14장
범위: `_workspace/00_input/scope.md`

> **상세기획 문서에 Phase 3 본문이 없다.** 이 문서가 그 자리를 채우는 초안이며,
> 상세기획 본문 편입 여부는 사용자가 결정한다. **이 문서는 상세기획을 수정하지 않았다.**

---

## 1. 구현 가능 판정

### 판정: **조건부 가능**

| | 내용 |
|---|---|
| **차단 질문** | **1건 — Q1** (점 마커를 찍는 순간 결함이 저장되는가 / 미완성 결함 허용 여부) |
| **차단 범위** | **T11 (점 마커 생성) 한정.** T1~T10·T12~T13 은 답 없이 착수해도 구조가 굳지 않는다 |
| **비차단 질문** | 7건 (Q2~Q8) — 전부 기본값을 이 문서에 확정해 두었고 `ASSUMPTIONS.md` 에 기록했다 |

**왜 "착수 불가"가 아닌가**
Q2(마크 N개일 때 리더선 앵커)는 원래 데이터 구조를 굳히는 차단 질문이었으나,
`Label.anchorMarkId: uuid | null` 필드를 **답과 무관하게 성립하도록** 설계해 비차단으로 내렸다.
(대표마크 지정 → id 저장 / 마크 집합 중심 → null. 어느 답이 와도 마이그레이션이 없다.)

**왜 "바로 착수 가능"이 아닌가**
Q1은 "점을 찍는 순간 좌측 리스트에 결함 1건이 늘어나는가"라는 **사용자가 즉시 보는 동작**이고,
상세기획 §2.5 G7이 `⬜ 확인 필요`로 명시적으로 미결 상태다. builder가 추측하면
`DRAFT` 상태값의 존재 여부가 데이터 모델에 굳는다. T11만 세워두고 나머지를 먼저 진행한다.

---

## 2. 확정 스펙

### 2-0. 이번 범위의 경계

| 포함 | 제외 (데이터 구조만 예약) |
|---|---|
| 도면 렌더 · 줌 · 팬 · Fit | PDF→이미지 변환 (Phase 2.5 G2 과업 셋업) |
| `POINT` 마커 생성 / 이동 / 삭제 | `ARROW` · `AREA_RECT` · `AREA_ELLIPSE` · 자유그리기 · 메모 |
| 리더선 + 번호 풍선 렌더, 라벨 개별 이동 | 스타일 편집 UI (모양·채우기·색상·슬라이더 3종) |
| 스마트 정렬 가이드 | 간격 균등 배분(distribution) 가이드 |
| 리더선 각도 스냅 | 다중 선택 · 박스 선택 · 그룹 이동 |
| Undo / Redo | 미니맵 · 최근 위치 점프 (§2.5 G6) |
| 선택 · 컨텍스트 플로팅 툴바 | 병합 · 동기화 (Phase 5) |

제외 항목은 **렌더러와 데이터 모델이 확장 가능해야 한다**(D2 단서).
구체적으로: `Mark.type` 은 4종 전부 받는 유니온으로 정의하고, 렌더 모델은
알 수 없는 type 을 만나면 **무시하고 건너뛴다**(throw 금지). 스타일은 이미 `resolveStyle()` 를 통과한다.

---

### 2-1. 데이터 모델 — 상세기획 §3-3·3-4 의 미정의분 확정

상세기획은 `marks: Mark[]`, `label: Label` 이라고만 쓰고 **필드를 정의하지 않았다(누락).**
Phase 3은 이것 없이는 한 줄도 못 쓴다. 아래로 확정한다.

```ts
// 도면 정규화 좌표. 0~1 이 기준이지만 클램프하지 않는다 (§2-1-a)
type NPoint = { x: number; y: number };

type Mark = {
  id: string;                  // uuid
  defectId: string;
  type: 'POINT' | 'ARROW' | 'AREA_RECT' | 'AREA_ELLIPSE';
  geometry:
    | { k: 'POINT';        x: number; y: number }                      // 이번 범위
    | { k: 'ARROW';        x1: number; y1: number; x2: number; y2: number }   // 예약
    | { k: 'AREA_RECT';    x: number; y: number; w: number; h: number }       // 예약
    | { k: 'AREA_ELLIPSE'; cx: number; cy: number; rx: number; ry: number };  // 예약
  sortOrder: number;           // Defect 내 마크 순서. marks[0] 이 기본 앵커
};

type Label = {
  defectId: string;            // Defect : Label = 1 : 1 (상세기획 §3-3)
  x: number; y: number;        // 번호 풍선의 **중심**, 정규화 좌표
  anchorMarkId: string | null; // 리더선이 붙는 마크. null = 마크 집합의 중심(centroid)
  placed: boolean;             // false = 자동 배치 상태, true = 사용자가 한 번이라도 옮김
};
```

#### 2-1-a. 라벨 좌표는 0~1 을 벗어날 수 있다 ⚠️

젠트릭스 실측(스크린샷 `_00` 의 26·34번, `_03` 의 37번)에서 **번호 풍선이 도면 이미지 바깥으로
끌려나가고 리더선이 그만큼 길어진다.** 이번 제품도 같은 조작을 허용한다.

- **저장 규칙은 유지**: 좌표계는 도면 정규화 그대로다. 값만 `x < 0` 또는 `x > 1` 이 될 수 있다.
- **마크(`Mark.geometry`)는 `[0,1]` 로 클램프한다.** 결함의 실제 위치이므로 도면 밖은 무의미하다.
- **라벨은 클램프하지 않는다.** 대신 `[-0.5, 1.5]` 범위로 소프트 리밋(그 밖으로는 드래그 불가).
- 출력물(Phase 4 조사위치도)에서 도면 밖 라벨을 어떻게 담을지는 **Phase 4의 문제**다. 여기서 결정하지 않는다.

#### 2-1-b. 도면 위 번호는 `seq` 다. 출력번호가 아니다 ⚠️ (함정 #1)

| | |
|---|---|
| 캔버스가 그리는 숫자 | `Defect.seq` — 층 내 입력순번 (상세기획 §4) |
| 캔버스가 그려선 안 되는 숫자 | 출력 결함번호 `NO`, 사진번호 — **출력 시점 계산값** |
| **`Label` 에 번호 필드를 두지 않는다** | 렌더 시 주입한다 |

**캔버스 코어는 표시 문자열을 `displayNumber: string` 으로 주입받는다.**
코어는 그 문자열이 `seq` 인지 출력번호인지 모른다. 이렇게 하면
Phase 4의 조사위치도 출력이 **같은 렌더 모델에 출력번호를 넣어** 재사용된다(§2-9).

#### 2-1-c. 라벨 위치는 `StyleOverride` 가 아니다 ⚠️ (함정 #5)

상세기획 §3-5 상속 규칙은 "개별 스타일 변경 시 전역 상속이 끊긴다"이다.
**라벨을 드래그해 옮기는 것은 스타일 변경이 아니라 geometry 변경이다.**
드래그가 `defect.style` 을 `null` 에서 객체로 바꿔버리면, PC에서 위치를 정리한 결함이
전부 전역 스타일 상속에서 이탈한다. → **위치 이동은 `defect.style` 을 절대 건드리지 않는다.**

---

### 2-2. 좌표계와 변환

세 좌표계를 쓴다. **셋을 섞으면 각도·정렬이 전부 틀어진다.**

| 기호 | 이름 | 단위 | 용도 |
|---|---|---|---|
| **N** | 정규화 | 0~1 | **저장 형식.** DB·동기화·출력에 나가는 유일한 형식 |
| **I** | 이미지 픽셀 | 도면 렌더이미지 px | N↔S 중계. `i = (n.x·W, n.y·H)` |
| **S** | 스크린 | 캔버스 CSS px | **모든 기하 판정(히트·거리·각도·스냅)의 기준** |

```
Viewport = { zoom: number, tx: number, ty: number }   // 등방 스케일, 회전 없음

toScreen(n) = { x: n.x * W * zoom + tx,  y: n.y * H * zoom + ty }
toNorm(s)   = { x: (s.x - tx) / zoom / W, y: (s.y - ty) / zoom / H }
```

#### 2-2-a. 각도와 거리는 정규화 좌표에서 계산하면 안 된다 ⚠️ (함정 #2 확장)

도면이 `4000 × 2000` 이면 정규화 공간은 **가로로 2배 눌린 공간**이다.
그 공간에서 잰 45°는 화면에서 63.4°다. **리더선 각도 스냅을 정규화 좌표로 계산하면
사용자 눈에는 직교가 아닌 선이 "직교화됐다"고 표시된다.**

**규칙**: 각도·거리·정렬 판정은 전부 **S(스크린)** 에서 한다. 저장 직전에만 `toNorm()` 한다.
`zoom` 이 x/y 동일(등방)이므로 S의 각도 = I의 각도다. 이 등방성은 불변식이다 — 깨지 않는다.

#### 2-2-b. 저장 정밀도

정규화 좌표는 **소수 6자리 반올림**하여 저장한다(`NORM_PRECISION = 6`).
10,000px 도면에서 0.01px 정밀도이고, 동기화 시 부동소수 잡음으로 인한 무의미한 diff를 막는다.

---

### 2-3. 캔버스 상태 모델

```ts
type CanvasState = {
  drawing: { id: string; imageWidth: number; imageHeight: number };  // 코어는 이미지 객체를 모른다
  viewport: { zoom: number; tx: number; ty: number };

  tool: 'SELECT' | 'POINT';                    // 방향/영역/그리기는 팔레트에 비활성 표시

  selection: {
    defectId: string | null;
    part: 'MARK' | 'LABEL' | 'LEADER' | null;  // 어느 부위를 잡았는가
    markId: string | null;                     // part === 'MARK' 일 때만
  };

  hover: { defectId: string; part: Part; markId: string | null } | null;

  drag: null | {
    kind: 'PAN' | 'MOVE_MARK' | 'MOVE_LABEL';
    pointerId: number;
    startScreen: SPoint;
    startViewport?: Viewport;                  // kind === 'PAN'
    grabOffsetScreen: SPoint;                  // (요소 중심 − 포인터). 잡은 지점 유지용
    originNorm: NPoint;                        // Esc 취소 시 복귀 지점
    snapState: {                               // 히스테리시스 유지용
      x: AlignHit | null;
      y: AlignHit | null;
      angle: AngleHit | null;
    };
    moved: boolean;                            // CLICK_SLOP_PX 초과 여부. 클릭/드래그 구분
  };

  guides: Guide[];        // 드래그 중에만 채워지는 파생값. 저장하지 않는다
  keys: { space: boolean; alt: boolean; shift: boolean };
};
```

규칙:
- **단일 선택만.** 다중 선택은 이번 범위 밖.
- `guides` 는 렌더 전용 파생값이다. undo 스택·저장 어디에도 들어가지 않는다.
- `viewport` 는 **도면(층)마다 따로 기억한다** — `Map<drawingId, Viewport>`.
  층을 전환했다 돌아오면 보던 자리가 유지된다(§2.5 G6 "마지막 작업 위치로 복귀"의 최소 형태).
- **`viewport` 변경은 undo 대상이 아니다.** Ctrl+Z 가 화면 스크롤을 되돌리면 사용자가 혼란스럽다.

---

### 2-4. 히트 테스트 규칙

포인터 좌표 `p`(스크린)에 대해 **위에서부터 순서대로** 검사하고, 처음 맞는 것에서 멈춘다.

| 순위 | 대상 | 판정 |
|---|---|---|
| 0 | **현재 선택된 결함의 부위** | 아래 판정에서 동률이면 무조건 이것을 집는다 |
| 1 | **번호 풍선(라벨)** | `dist(p, labelCenter) ≤ max(balloonRadius + HIT_PAD_PX, HIT_MIN_LABEL_PX)` |
| 2 | **마크** | POINT: `dist(p, markPoint) ≤ max(markRadius + HIT_PAD_PX, HIT_MIN_MARK_PX)` |
| 3 | **리더선** | 선분-점 거리 `≤ HIT_LEADER_PX` |
| 4 | **빈 도면** | 위 전부 실패 |

**같은 순위 안에서 여러 개가 맞으면 z-순서 역순** — 즉 가장 나중에 그려진(위에 있는) 것.
z-순서 = `Defect.seq` 오름차순 렌더이므로 **`seq` 가 큰 결함이 위**다. 동률 시 `defectId` 사전순.

**왜 라벨이 마크보다 위인가 (설계 근거)**
마크는 결함의 **실제 위치**이고 라벨은 **보기 좋으라고 옮기는 것**이다.
겹친 상태에서 실수로 마크를 끌면 보고서 데이터가 틀린다. 실수의 비용이 싼 쪽을 앞에 둔다.

**리더선을 집으면**: 그 결함을 **선택만** 한다. 리더선은 드래그 대상이 아니다
(리더선의 형상은 앵커와 라벨이 결정하는 파생값이므로 직접 편집할 대상이 없다).

**전회차 표기의 히트**: `PREV_PENDING` / `REPAIRED` 결함도 히트 테스트에 참여한다.
다만 이번 범위에서 **드래그·삭제는 막고 선택만 허용**한다 (→ Q8).

---

### 2-5. 상호작용 명세

도구는 `SELECT`(기본)와 `POINT` 둘뿐이다. 우측 세로 팔레트에 `점 / 방향 / 영역 / 그리기` 4개를
젠트릭스와 같은 배치로 두되 **점만 활성**, 나머지 3개는 비활성 + 툴팁 `준비 중`.

| 입력 | 대상 | 동작 |
|---|---|---|
| 좌클릭(이동 < `CLICK_SLOP_PX`) | 빈 도면, SELECT | 선택 해제 |
| 좌클릭 | 라벨 / 마크 / 리더선 | 해당 Defect 선택 → 우측 결함정보 패널 표시 + 컨텍스트 플로팅 툴바 표시 |
| 좌클릭 | 도면, POINT 도구 | 그 지점에 마크 생성 (**Q1 답 대기**) |
| 좌드래그 | **라벨** | 라벨 이동 — **정렬 스냅 + 각도 스냅 적용** |
| 좌드래그 | **마크** | 마크 이동 — **스냅 미적용**. 라벨 동반 여부는 §2-8-c |
| 좌드래그 | 빈 도면, SELECT | **팬** (박스 선택 아님 — 다중 선택이 범위 밖이므로) |
| 중클릭 드래그 | 어디서나 | 팬 |
| `Space` 누른 채 좌드래그 | 어디서나 | 팬. 커서 `grab` / `grabbing` |
| 휠 | 캔버스 | **커서 아래 지점을 고정한 채** 줌. 1노치 = `× ZOOM_WHEEL_STEP` |
| `Ctrl` + 휠 | 캔버스 | 동일 줌. **`preventDefault()` 로 브라우저 페이지 확대를 반드시 막는다** |
| 더블클릭 | 빈 도면 | Fit (전체 맞춤) |
| 더블클릭 | 라벨 / 마크 | 그 결함 선택 + 우측 패널로 포커스 이동 |
| 우클릭 | 라벨 / 마크 | 기본 컨텍스트 메뉴 차단 → 그 결함 선택 + 컨텍스트 메뉴 `[복제] [마크 추가] [삭제]` |
| 우클릭 | 빈 도면 | 기본 컨텍스트 메뉴 차단. 그 외 동작 없음 |
| `Esc` | — | 드래그 중이면 **`originNorm` 으로 복귀 후 취소**. 아니면 선택 해제 |
| `Delete` / `Backspace` | 선택 있음 | 삭제 (§2-8-d) |
| `Alt` 누른 채 드래그 | 라벨 | **스냅·가이드 전부 일시 해제** |
| `Shift` 누른 채 드래그 | 라벨 / 마크 | 드래그 시작점 기준 **수평 또는 수직으로 축 고정** (Δ가 큰 축을 채택) |
| `Ctrl+Z` / `Ctrl+Shift+Z`·`Ctrl+Y` | — | Undo / Redo (뷰포트 제외) |
| `Ctrl+0` / `0` | — | Fit |
| `+` / `-` | — | 뷰포트 중심 기준 줌 |

**`Alt` 를 스냅 해제 키로 쓰는 대가**: 캔버스에서 **`Alt`+드래그 복제는 제공하지 않는다.**
복제는 컨텍스트 툴바의 `[복제]` 버튼으로만 한다. 두 기능이 같은 키를 다투지 않게 못박는다.

**줌·팬 한계**

| | 값 |
|---|---|
| 최소 배율 | `fitZoom × ZOOM_MIN_FACTOR` |
| 최대 배율 | `ZOOM_MAX` |
| 팬 한계 | 도면 bbox의 **최소 `PAN_KEEP_VISIBLE` 비율이 항상 뷰포트 안에 남도록** 클램프 |
| 최초 진입 | 도면 전체 Fit + 여백 2% |

---

### 2-6. 스마트 정렬 가이드

> **문제 정의**: 번호 풍선을 옮길 때 주변 풍선과 줄이 맞아야 한다. PowerPoint 정렬 가이드선과 같은 체감.

#### 2-6-a. 결정 사항

| 질문 | 결정 | 근거 |
|---|---|---|
| **무엇에 정렬하나** | **다른 라벨(번호 풍선)의 중심 x, 중심 y** | 풍선은 원이라 "가장자리"가 의미 없다. 풍선 크기가 개별로 다를 수 있으므로(스타일 슬라이더) 중심이 유일하게 안정적인 기준이다 |
| **마크에도 정렬하나** | **아니다** | 마크는 결함의 실제 위치라 줄이 맞을 이유가 없다. 마크와의 관계는 각도 스냅(§2-7)이 담당한다 |
| **판정 공간** | **스크린 px** | 줌 배율과 무관하게 손끝 체감이 일정해야 한다. 줌인하면 도면 좌표 기준으로는 더 정밀하게 붙는데, 이게 올바른 동작이다(Figma·PowerPoint 동일) |
| **진입 임계** | `ALIGN_ENTER_PX = 6` | 6px = 일반 마우스로 의도적으로 넘기 어렵지 않으면서 우연히 걸리지 않는 폭 |
| **이탈 임계** | `ALIGN_RELEASE_PX = 10` | **히스테리시스.** 6에서 걸리고 10에서 풀린다. 같은 값이면 경계에서 붙었다 떨어졌다 떨린다 |
| **동시 다중 스냅** | **x축·y축을 독립 판정한다.** 둘 다 걸리면 둘 다 적용(교차점 스냅) | 축이 다르면 서로 모순되지 않는다 |
| **같은 축 다중 후보** | `\|Δ\|` 가 **최소인 것 하나.** 동률이면 `defectId` 사전순 | 결정론적이어야 재현 테스트가 가능하다 |
| **후보 범위** | 같은 도면(층)의 **모든** 라벨. 뷰포트 밖도 포함 | 뷰포트로 제한하면 스크롤 위치에 따라 스냅 결과가 달라져 재현성이 깨진다 |
| **간격 균등 배분** | **이번 범위 제외** | 복잡도 대비 효용이 낮고 D2에 없다 |
| **해제** | `Alt` 유지 중 완전 비활성 | |

#### 2-6-b. 가이드선 렌더

- 스냅이 걸린 축마다 **1개**. x 스냅 → 세로선, y 스냅 → 가로선.
- 선의 길이: 그 좌표를 공유하는 **모든 라벨**(허용오차 0.5px)과 드래그 중인 라벨을 모아,
  최소~최대 좌표 범위에 `GUIDE_OVERSHOOT_PX` 만큼 양끝을 더 뻗는다.
  → "이 3개가 지금 한 줄에 있다"가 눈에 보인다.
- 색: `GUIDE_COLOR = #00B8D9` (시안). **빨강·보라를 피한다** — 도면 표기가 현회차 빨강 / 전회차 보라라
  같은 계열을 쓰면 가이드선이 결함 표기로 오독된다.
- 굵기 1px(디바이스 픽셀 기준 hairline), 실선.
- **드래그 중에만 보인다.** 드롭 즉시 사라진다.

#### 2-6-c. 알고리즘 (의사코드)

```
onLabelDragStart(label):
  cands = allLabels(currentDrawing).filter(l => l.defectId !== label.defectId)
  # 드래그 시작 시 1회만 스크린 좌표로 스냅샷. 드래그 중 뷰포트는 변하지 않으므로 유효
  snapX = cands.map(l => ({ v: toScreen(l).x, id: l.defectId })).sortBy(v)
  snapY = cands.map(l => ({ v: toScreen(l).y, id: l.defectId })).sortBy(v)
  drag.snapState = { x: null, y: null, angle: null }

findAlignSnap(v, sorted, held):
  # held = 직전 프레임에 이 축에서 걸려 있던 후보 (히스테리시스)
  if held != null and abs(v - held.v) <= ALIGN_RELEASE_PX:
      return held                                   # 유지
  best = null
  for c in nearestNeighbors(sorted, v):             # 정렬돼 있으므로 이진탐색 후 좌우 스캔
      d = abs(v - c.v)
      if d > ALIGN_ENTER_PX: break
      if best == null or d < best.d or (d == best.d and c.id < best.id):
          best = { v: c.v, id: c.id, d: d }
  return best

onLabelDragMove(pointerS, keys):
  raw = pointerS + drag.grabOffsetScreen            # 라벨 중심의 자유 위치 (스크린)

  if keys.alt:
      commit(raw); guides = []; drag.snapState = {x:null,y:null,angle:null}; return

  if keys.shift:
      raw = lockAxis(raw, drag.startScreen)         # Δ가 큰 축만 살린다

  ax  = findAlignSnap(raw.x, snapX, drag.snapState.x)
  ay  = findAlignSnap(raw.y, snapY, drag.snapState.y)
  ang = computeAngleSnap(anchorS, raw, drag.snapState.angle, keys)   # §2-7

  { pos, appliedGuides } = resolveSnaps(raw, ax, ay, ang)            # §2-8
  drag.snapState = { x: ax, y: ay, angle: ang }
  guides = appliedGuides
  commit(pos)

commit(posScreen):
  label.x, label.y = round(toNorm(posScreen), NORM_PRECISION)
  label.placed = true
```

**성능**: 층당 결함 수는 실측 37건, 최악을 500건으로 잡아도 드래그 시작 시 정렬 1회 + 프레임당
이진탐색 2회다. 최적화가 필요 없다. 500건을 넘어가면 그때 구간 버킷을 도입한다.

---

### 2-7. 리더선 각도 스냅

> **문제 정의**: 리더선 각도가 직교에 가까우면 자동으로 정확한 직교로 맞춘다.
> 젠트릭스 실측 화면(`_00` 의 26·34번, `_05` 의 12번)에서 리더선 다수가 정확한 수평·수직이다.
> **사람이 손으로 맞추고 있다는 증거**이므로 자동화 가치가 확실하다.

#### 2-7-a. 결정 사항

| 질문 | 결정 | 근거 |
|---|---|---|
| **무엇이 움직이나** | **라벨(번호 풍선)만.** 앵커(마크)는 절대 안 움직인다 | 마크는 결함의 실제 위치다. 보기 좋게 하려고 실제 위치를 옮기면 보고서가 틀린다 |
| **각도는 어디서 재나** | 앵커 → 라벨 중심 벡터. **스크린 좌표** | §2-2-a. 정규화 좌표에서 재면 종횡비 때문에 화면상 직교가 아니다 |
| **스냅 각도 집합** | **기본 `{0, 90, 180, 270}` 4방향.** 45도 배수는 상수 `ANGLE_SNAP_45 = false` 로 꺼둔다 | 상세기획·기획서 원문은 "90도 근처"만 말한다. 게다가 실측 화면의 리더선 대부분이 임의 사선이다 — 45도를 켜면 그 사선들이 전부 45도로 끌려가 오히려 방해가 된다 (→ Q5) |
| **진입 임계** | `ANGLE_ENTER_DEG = 5` | |
| **이탈 임계** | `ANGLE_RELEASE_DEG = 8` | 히스테리시스 |
| **추가 상한** ⭐ | **`r · sin(Δθ) ≤ ANGLE_MAX_SHIFT_PX(12)` 일 때만 스냅** | 각도 임계만 쓰면 **리더선이 길수록 스냅으로 인한 실제 이동거리가 커진다.** r=400px 에서 5°는 35px 점프다 — 라벨이 손에서 튀어나간 느낌이 든다. 각도와 픽셀을 **동시에** 만족할 때만 스냅한다 |
| **최소 길이** | `r < LEADER_MIN_PX(24)` 이면 각도 스냅 비활성 | 라벨이 마크에 붙어 있으면 각도가 요동쳐서 스냅이 마구 튄다 |
| **거리 보존** | **`r` 은 유지하고 각도만 바꾼다** | "직교화"의 정확한 의미. 거리까지 바꾸면 라벨이 멀리 날아간다 |
| **해제** | `Alt` 유지 중 비활성 (정렬 가이드와 동일 키) | 두 스냅이 같은 조작(라벨 드래그)에 걸리므로 해제 키가 하나여야 한다 |

#### 2-7-b. 앵커점의 정의

```
anchor(defect) =
   label.anchorMarkId != null  →  centerOf(marks[anchorMarkId])
   label.anchorMarkId == null  →  centroid(marks.map(centerOf))
centerOf(POINT)        = (x, y)
centerOf(AREA_RECT)    = (x + w/2, y + h/2)      // 예약
centerOf(AREA_ELLIPSE) = (cx, cy)                // 예약
centerOf(ARROW)        = (x2, y2)   // 화살촉 끝     // 예약
```

이번 범위에서 `anchorMarkId` 의 기본값은 **`marks[0].id`** 다 (→ Q2).

#### 2-7-c. 리더선의 실제 그리기 형상

- **단일 직선 1개.** 꺾인선(elbow)은 이번 범위에 없다. (젠트릭스 실측 전부 직선)
- 시작점: `anchor`
- 끝점: `labelCenter − unit(labelCenter − anchor) × balloonRadius`
  → 선이 풍선 **테두리에서 멈춘다.** 풍선 안으로 파고들지 않는다.
- `r ≤ balloonRadius` 이면 리더선을 **그리지 않는다** (라벨이 마크를 덮은 상태).

#### 2-7-d. 스냅 중 시각 피드백

1. 리더선을 `GUIDE_COLOR` 로 바꿔 그린다 (평소 색 → 시안).
2. 앵커 반대쪽으로 `GUIDE_OVERSHOOT_PX` 만큼 얇은 연장선을 그려 **어느 축에 걸렸는지** 보여준다.
3. 앵커점에 한 변 8px의 작은 직각 표식(`⌐`)을 그린다. 90/270 은 세로, 0/180 은 가로 방향.

#### 2-7-e. 알고리즘 (의사코드)

```
angularDistance(a, b):            # 0~180 로 정규화된 최소 각차
  d = abs(((a - b) mod 360 + 540) mod 360 - 180)
  return d

computeAngleSnap(anchorS, rawS, held, keys):
  if keys.alt: return null

  v = rawS - anchorS
  r = length(v)
  if r < LEADER_MIN_PX: return null

  theta = degrees(atan2(v.y, v.x))                    # 스크린 좌표계: y는 아래로 증가
  set   = ANGLE_SNAP_45 ? [0,45,90,135,180,225,270,315] : [0,90,180,270]

  target = argmin(set, s => angularDistance(theta, s))
  delta  = angularDistance(theta, target)

  limit  = (held != null and held.angle == target) ? ANGLE_RELEASE_DEG : ANGLE_ENTER_DEG
  if delta > limit: return null

  shift = r * sin(radians(delta))                     # 스냅으로 라벨이 튈 거리
  if shift > ANGLE_MAX_SHIFT_PX: return null          # ⭐ 긴 리더선 과잉 스냅 방지

  snapped = anchorS + r * (cos(radians(target)), sin(radians(target)))
  return { angle: target, point: snapped, r: r }
```

---

### 2-8. 두 스냅의 병합 규칙 ⭐

**이것이 이번 범위에서 가장 사고가 나기 쉬운 지점이다.** 같은 드래그 한 번에 두 스냅이 동시에 걸린다.

#### 2-8-a. 핵심 관찰 — 대부분의 경우 둘은 싸우지 않는다

각도 스냅이 4방향일 때, 각도 스냅은 **한 축만 고정한다.**

| 스냅 각도 | 고정되는 축 | 자유로운 축 |
|---|---|---|
| 90° 또는 270° (수직) | `x = anchor.x` | **y 는 자유** — y가 바뀌어도 각도는 여전히 정확히 90°다 |
| 0° 또는 180° (수평) | `y = anchor.y` | **x 는 자유** |
| 45° 계열 (`ANGLE_SNAP_45=true` 일 때만) | x·y 가 함께 묶임 | 없음 |

→ **자유로운 축에는 정렬 스냅을 그대로 적용해도 모순이 없다.**
리더선이 정확히 수직이면서 동시에 번호가 옆 번호와 가로 줄이 맞는다 — 이게 사용자가 원하는 결과다.

#### 2-8-b. 충돌 시 우선순위

같은 축을 둘 다 고정하려 할 때만 충돌이다. 이때는 **`SNAP_PRIORITY = 'ANGLE_FIRST'`** (기본값).

**근거**: 리더선이 89°인 것은 도면에서 눈에 확 띄지만, 번호 하나가 2px 어긋난 것은 티가 덜 난다.
어긋남이 더 크게 보이는 쪽을 지킨다. 반대 취향도 가능하므로 상수로 뺀다 (→ Q6).

```
resolveSnaps(raw, ax, ay, ang):
  if ang == null:
     pos = { x: ax ? ax.v : raw.x, y: ay ? ay.v : raw.y }
     return { pos, guides: [alignGuide(ax), alignGuide(ay)].filter(exists) }

  lock = (ang.angle == 90 or ang.angle == 270) ? 'X'
       : (ang.angle == 0  or ang.angle == 180) ? 'Y'
       : 'BOTH'

  if SNAP_PRIORITY == 'ALIGN_FIRST':
     conflict = (lock == 'BOTH' and (ax or ay))
             or (lock == 'X' and ax) or (lock == 'Y' and ay)
     if conflict:
        # 각도를 유지할 수 없다 → 각도 스냅을 통째로 버린다
        pos = { x: ax ? ax.v : raw.x, y: ay ? ay.v : raw.y }
        return { pos, guides: alignGuidesOf(ax, ay) }

  # ANGLE_FIRST (기본) 또는 ALIGN_FIRST 인데 충돌이 없는 경우
  if lock == 'BOTH':
     return { pos: ang.point, guides: [angleGuide(ang)] }        # 정렬 스냅 무시

  pos = {
     x: lock == 'X' ? ang.point.x : (ax ? ax.v : raw.x),
     y: lock == 'Y' ? ang.point.y : (ay ? ay.v : raw.y),
  }
  # 고정된 축의 정렬 스냅은 무시하고 **가이드선도 그리지 않는다**
  freeAlign = (lock == 'X') ? ay : ax
  return { pos, guides: [angleGuide(ang)] + (freeAlign ? [alignGuide(freeAlign)] : []) }
```

#### 2-8-c. 적용되지 않은 스냅의 가이드선은 절대 그리지 않는다 ⚠️

무시된 정렬 스냅의 가이드선을 그대로 그리면, **선은 보이는데 라벨은 그 선에 붙어 있지 않다.**
사용자는 "정렬 기능이 고장났다"고 인식한다. **화면에 그려진 가이드는 전부 실제로 적용된 것이어야 한다.**

#### 2-8-d. 마크를 옮길 때 라벨은?

**기본 규칙: 마크를 드래그하면 라벨이 같은 델타만큼 따라 움직인다** (리더선 길이·각도 보존).

근거: PC 정리 단계에서 라벨 위치는 공들여 맞춰둔 결과물이다. 마크만 미세 조정했다고
정리한 각도·줄맞춤이 전부 깨지면 정리 작업이 무의미해진다.
`placed === false` (자동 배치 상태)면 어차피 재계산되므로 결과가 같다. (→ Q3)

**마크 드래그에는 스냅을 적용하지 않는다.** 마크는 결함의 실제 위치이므로 보기 좋게 끌려가면 안 된다.

#### 2-8-e. 삭제 규칙

| 삭제 대상 | 동작 |
|---|---|
| 마크 1개 (해당 Defect의 마크가 2개 이상) | 그 마크만 삭제. `anchorMarkId` 가 그것이었으면 `marks[0]` 으로 재지정 |
| 마크 1개 (마지막 남은 마크) | **확인 다이얼로그 → 결함 전체 삭제** (→ Q7) |
| 라벨 | **삭제 불가.** Defect : Label = 1:1 이므로 라벨만 지울 수 없다. `[초기화]` 로 자동 배치 위치로 되돌린다 |
| 전회차(`PREV_PENDING`/`REPAIRED`) | 이번 범위에서 **삭제 불가** (→ Q8) |

모든 삭제는 **Undo 가능**하다.

---

### 2-9. 렌더 모델과 그리기 순서

#### 2-9-a. 코어는 그리지 않는다 — DisplayList 를 만든다

```ts
type DrawOp =
  | { k: 'image';  src: 'drawing'; at: SPoint; w: number; h: number }
  | { k: 'line';   a: SPoint; b: SPoint; color: string; width: number; dash?: number[] }
  | { k: 'circle'; c: SPoint; r: number; fill?: string; stroke?: string; width?: number }
  | { k: 'text';   at: SPoint; text: string; size: number; color: string; align: 'center' }
  | { k: 'rect'  | 'ellipse' | 'hatchRect' | 'polyline'; ... }   // 예약
```

좌표는 **이미 스크린 CSS px 로 변환된 상태**로 나온다. 어댑터는 그대로 그리기만 한다.

**이 구조를 쓰는 진짜 이유** ⚠️ (출력 재현성)
Phase 4의 **조사위치도 출력**은 캔버스와 **픽셀 단위로 같은 그림**이어야 한다.
같은 `buildDisplayList()` 에 `viewport = 출력 해상도 기준` + `displayNumber = 출력 결함번호` 를
넣으면 출력 렌더가 공짜로 나온다. 렌더 로직을 두 벌 쓰면 반드시 어긋난다.

#### 2-9-b. 그리기 순서 (z-order)

```
1. 도면 이미지
2. 영역 마크 (AREA_*)              ← 예약. 면적이 크므로 아래에 깐다
3. 리더선
4. 점 마크 (POINT) / 화살표 마크
5. 번호 풍선(원)
6. 번호 텍스트
7. 선택 하이라이트 (풍선 주위 글로우 + 마크 주위 얇은 사각 박스)
8. 스냅 가이드선  ← 항상 최상단
```

같은 레이어 안에서는 `Defect.seq` 오름차순 (§2-4의 z-순서와 일치해야 한다).

#### 2-9-c. 상태별 색상 (함정 #8)

| status | 표기 색 | 비고 |
|---|---|---|
| `CURRENT` | 빨강 (기본 팔레트 1번) | 상세기획 §2-D |
| `PREV_PENDING` | 보라 | |
| `REPAIRED` | 회색 + **불투명도 40%** | 도면 위 표현이 상세기획에 없다(누락). 리스트의 "취소선"에 대응하는 도면 표현으로 이렇게 정한다 |

**색상은 `resolveStyle(defect.style, globalStyle)` 이 반환한 값이 우선**이고,
status 색은 style 이 색을 지정하지 않았을 때의 기본값이다.
`resolveStyle` 은 **부수효과 없는 순수 함수**이며, 캔버스는 이것을 읽기만 한다 (§2-1-c).

#### 2-9-d. 2레이어 캔버스 (성능)

| 레이어 | 다시 그리는 시점 |
|---|---|
| **배경** — 도면 이미지 | 뷰포트 변경 시에만 |
| **오버레이** — 표기 전부 + 가이드 | 매 프레임 |

드래그 중 도면 이미지를 매 프레임 다시 그리면 대형 도면에서 프레임이 떨어진다.
오버레이 그리기 전에 **뷰 컬링**: 요소의 바운딩 박스가 뷰포트와 교차하지 않으면 건너뛴다.
단 **드래그 중인 요소와 스냅 가이드는 컬링 대상에서 제외**한다.

#### 2-9-e. 번호 풍선의 크기

**기본 규칙: 도면 좌표에 고정 (줌하면 함께 커진다, WYSIWYG).**
출력물의 풍선 크기가 도면 기준이므로, 화면과 출력이 같아 보이려면 이래야 한다.

**단, 히트 영역은 스크린 기준 최소값을 보장한다** — `HIT_MIN_LABEL_PX(12)`.
줌아웃 상태에서 풍선이 3px로 보여도 12px 반경으로 집힌다. (→ Q4)

---

### 2-10. 튜닝 상수 (전부 `constants.ts` 한 파일에)

| 상수 | 기본값 | 의미 |
|---|---|---|
| `ZOOM_MIN_FACTOR` | `0.5` | fit 배율 대비 최소 |
| `ZOOM_MAX` | `8.0` | 최대 배율 |
| `ZOOM_WHEEL_STEP` | `1.1` | 휠 1노치 배율 |
| `PAN_KEEP_VISIBLE` | `0.2` | 도면이 뷰포트에 남아야 하는 최소 비율 |
| `CLICK_SLOP_PX` | `4` | 클릭/드래그 구분 |
| `HIT_PAD_PX` | `4` | 히트 여유 |
| `HIT_MIN_LABEL_PX` | `12` | 라벨 최소 히트 반경 |
| `HIT_MIN_MARK_PX` | `10` | 마크 최소 히트 반경 |
| `HIT_LEADER_PX` | `6` | 리더선 히트 허용 거리 |
| `ALIGN_ENTER_PX` | `6` | 정렬 스냅 진입 |
| `ALIGN_RELEASE_PX` | `10` | 정렬 스냅 이탈 (히스테리시스) |
| `GUIDE_OVERSHOOT_PX` | `12` | 가이드선 양끝 연장 |
| `GUIDE_COLOR` | `#00B8D9` | 가이드 색 (빨강·보라 회피) |
| `ANGLE_SNAP_45` | `false` | 45도 배수 포함 여부 |
| `ANGLE_ENTER_DEG` | `5` | 각도 스냅 진입 |
| `ANGLE_RELEASE_DEG` | `8` | 각도 스냅 이탈 |
| `ANGLE_MAX_SHIFT_PX` | `12` | 각도 스냅으로 인한 최대 이동거리 |
| `LEADER_MIN_PX` | `24` | 이보다 짧으면 각도 스냅 비활성 |
| `SNAP_PRIORITY` | `'ANGLE_FIRST'` | 충돌 시 우선순위 |
| `LABEL_AUTO_DIST_FACTOR` | `3.0` | 자동 배치 거리 = 풍선반지름 × 이 값 |
| `LABEL_AUTO_ANGLE_DEG` | `-45` | 자동 배치 방향(우상단) |
| `NORM_PRECISION` | `6` | 정규화 좌표 저장 소수 자리 |

**builder 지시**: 이 값들을 코드 곳곳에 매직넘버로 흩뿌리지 않는다. 전부 이 파일에서만 읽는다.
사용자가 "스냅이 너무 세다"고 하면 **한 파일에서 숫자 하나만 고쳐서** 대응할 수 있어야 한다.

---

### 2-11. 모듈 경계 — 플랫폼 독립 코어 vs 웹 어댑터 (D1 대응)

```
packages/canvas-core/          ← 순수 TypeScript. RN 이 그대로 재사용한다
  constants.ts                 모든 튜닝 상수
  geometry.ts                  Vec2, toScreen/toNorm, 거리, 각도, 선분-점 거리
  viewport.ts                  zoomAt(cursor), fit(), clampPan()
  hitTest.ts                   §2-4 우선순위 히트 테스트
  snapAlign.ts                 §2-6
  snapAngle.ts                 §2-7
  snapResolve.ts               §2-8 병합
  interaction.ts               상태 머신. (state, InputEvent) → (state', Command[])
  commands.ts                  MoveLabel / MoveMark / CreateMark / DeleteDefect + undo 스택
  renderModel.ts               Defect[] → DrawOp[]  (§2-9)
  style.ts                     resolveStyle(defect.style, globalStyle)
  types.ts

apps/web/canvas/               ← 웹 전용. RN 에서는 이 층만 새로 쓴다
  CanvasView.tsx               <canvas> 2장, DPR, ResizeObserver
  renderCanvas2d.ts            DrawOp[] → CanvasRenderingContext2D
  pointerAdapter.ts            PointerEvent/WheelEvent/KeyboardEvent → InputEvent
  imageLoader.ts               도면 이미지 로드·캐시
  ToolPalette.tsx              우측 세로 팔레트 (점/방향/영역/그리기)
  ContextToolbar.tsx           선택 시 플로팅 툴바
```

#### 경계 규칙 — 어기면 RN 재사용이 깨진다

| # | 규칙 |
|---|---|
| 1 | **코어는 `window` · `document` · `Image` · `requestAnimationFrame` · `performance` 를 참조하지 않는다.** 시간이 필요하면 인자로 받는다 |
| 2 | **코어는 실제 그리기를 하지 않는다.** 직렬화 가능한 `DrawOp[]` 만 만든다 |
| 3 | **코어는 이미지 객체를 모른다.** `imageWidth`, `imageHeight` 숫자만 받는다. 디코딩은 어댑터 책임 |
| 4 | **코어는 React 를 import 하지 않는다.** 상태는 평범한 객체 + 리듀서 |
| 5 | **어댑터는 코어 상태를 직접 mutate 하지 않는다.** 반드시 코어가 노출한 리듀서/커맨드를 통한다 |
| 6 | 입력 이벤트는 어댑터가 **정규화된 `InputEvent`**(`{kind, pointerId, screen, buttons, keys}`)로 바꿔 넘긴다. 코어는 브라우저 이벤트 타입을 모른다 |
| 7 | 코어의 모든 좌표 인자는 **스크린 CSS px**. DPR 곱셈은 어댑터에서만 한다 |

**RN 전환 시 새로 쓰는 것**: `pointerAdapter`(제스처 핸들러), `renderCanvas2d`(Skia), `imageLoader`, UI 컴포넌트.
**그대로 쓰는 것**: `canvas-core` 전부. 이것이 D1 "코어는 플랫폼 독립"의 구체적 의미다.

---

## 3. 작업 분해

| # | 작업 | 산출물 | 완료 확인 (실행해서 보이는 것) | 의존 | 난이도 |
|---|---|---|---|---|---|
| **T1** | 코어 기하 + 뷰포트 | `geometry.ts` `viewport.ts` `constants.ts` + 단위테스트 | `toNorm(toScreen(n)) === n` 통과. `zoomAt(cursor)` 후 커서 아래 정규화 좌표가 불변 | — | 중 |
| **T2** | 웹 셸 + 도면 렌더 | `CanvasView.tsx` `imageLoader.ts` | 도면 이미지가 Fit 상태로 뜬다. 창 크기를 바꿔도 안 깨진다. DPR 2 화면에서 선명 | T1 | 하 |
| **T3** | 줌 · 팬 | `pointerAdapter.ts` + `interaction.ts`(PAN) | 휠 줌이 커서 기준. Space·중클릭 드래그 팬. Ctrl+휠에 브라우저가 확대되지 않음. 도면을 화면 밖으로 완전히 밀어낼 수 없음 | T2 | 중 |
| **T4** | 렌더 모델 + 표기 그리기 | `renderModel.ts` `style.ts` `renderCanvas2d.ts` | **고정 픽스처 결함 5건**이 점 + 리더선 + 번호 풍선으로 보인다. 줌해도 관계가 유지된다. 2레이어 분리 확인 | T3 | 중 |
| **T5** | 히트 테스트 + 선택 | `hitTest.ts` + 선택 상태 | 라벨/마크/리더선 클릭이 §2-4 우선순위대로 동작. **겹친 상태에서 라벨이 먼저 잡힌다** | T4 | 중 |
| **T6** | 드래그 이동 (스냅 없음) | `interaction.ts`(MOVE_*) `commands.ts` | 라벨·마크를 끌어 옮기면 정규화 좌표로 저장된다. Esc로 원위치 복귀. 4px 미만 이동은 클릭으로 처리 | T5 | 중 |
| **T7** | Undo / Redo | `commands.ts` undo 스택 | Ctrl+Z 로 이동·삭제가 되돌아간다. **뷰포트는 되돌아가지 않는다** | T6 | 중 |
| **T8** | 스마트 정렬 가이드 | `snapAlign.ts` + 가이드 렌더 | 라벨을 옆 라벨 6px 안으로 끌면 붙고 시안 세로/가로선이 뜬다. 10px 넘겨야 풀린다. Alt로 해제 | T6 | **상** |
| **T9** | 리더선 각도 스냅 | `snapAngle.ts` | 리더 각도가 90도 ±5도면 정확히 직교화되고 **리더 길이는 유지**. 리더선이 길면(shift>12px) 스냅 안 됨. Alt로 해제 | T6 | **상** |
| **T10** | 스냅 병합 | `snapResolve.ts` | 수직 스냅 중에도 y축 줄맞춤이 동시에 걸린다. 같은 축 충돌 시 각도가 이기고 **정렬 가이드선이 사라진다** | T8, T9 | **상** |
| **T11** | 점 마커 생성 · 삭제 | 툴 팔레트 + CreateMark/DeleteDefect | 점 도구로 클릭하면 마커 + 번호 풍선이 생긴다. Delete로 지워지고 Ctrl+Z로 살아난다 | T7, **Q1** | 중 |
| **T12** | 컨텍스트 플로팅 툴바 | `ContextToolbar.tsx` | 표기를 선택하면 아래에 `[점 ▾] 색상 / 복제 / 추가 / 삭제` 툴바가 뜬다 (이번 범위에서 색상·복제·추가는 비활성) | T11 | 하 |
| **T13** | 좌측 리스트 ↔ 캔버스 연동 | 선택 브릿지 | 좌측 리스트 행을 누르면 해당 표기로 팬 + 하이라이트. 캔버스에서 선택하면 리스트 행이 스크롤되어 강조 | T11 | 중 |

**의존 그래프**: `T1 → T2 → T3 → T4 → T5 → T6 → { T7, T8, T9 } → T10`, `T7 → T11 → { T12, T13 }`

**T1~T10 은 Q1 답 없이 지금 착수 가능하다.** T11 만 대기.
T4의 "고정 픽스처 결함 5건"이 그 우회로다 — 결함 생성 UI 없이도 렌더·선택·이동·스냅을 전부 검증할 수 있다.

**qa-inspector 를 위한 경계 조건** (T8~T10)
- 라벨이 마크 위에 겹친 상태(`r < 24px`)에서 각도 스냅이 발동하지 않는가
- 리더선이 아주 긴 상태(`r ≈ 400px`)에서 4.9도일 때 스냅이 발동하지 **않는가** (`shift > 12px`)
- 정렬 후보가 6px과 6.1px에 각각 있을 때 6px 쪽만 잡는가
- 같은 거리 후보 2개일 때 항상 같은 쪽을 잡는가(재현성)
- 줌 배율 0.2배와 8배에서 스냅 체감 폭이 동일한가(스크린 px 기준이므로 같아야 함)
- 종횡비가 극단적인 도면(`4000×800`)에서 90도 스냅이 **화면상** 정확히 수직인가 ⚠️

---

## 4. 지적 사항

| 유형 | 위치 | 내용 | 심각도 |
|---|---|---|---|
| **누락** | 상세기획 §3-3 `label: Label` | **`Label` 의 필드 정의가 전혀 없다.** 좌표계·앵커·자동배치 여부 전부 미정. Phase 3은 이것 없이 시작할 수 없다 → §2-1 에서 확정 제안 | 🔴 치명 |
| **누락** | 상세기획 §3-4 `Mark.geometry` | "도면 정규화 좌표"라고만 쓰여 있고 **type 별 형상 정의가 없다**. POINT가 `{x,y}` 인지 `{x,y,r}` 인지 미정 → §2-1 에서 확정 제안 | 🔴 치명 |
| **누락** | 상세기획 전반 | **Undo/Redo 의 범위가 정의되어 있지 않다.** 하단 글로벌 툴바에 버튼만 있다. 커맨드 패턴을 나중에 얹으면 캔버스 전체를 다시 써야 한다 → §2-3·T7 에서 확정 제안 (뷰포트 제외) | 🔴 치명 |
| **누락** | 상세기획 §2-D 상태 3종 | `REPAIRED` 의 **도면 위 표현**이 없다. 리스트는 "취소선"인데 도면은? → §2-9-c 에서 회색 40% 로 제안 | 🟡 중 |
| **모호** | 상세기획 §3-3 `marks: Mark[]` + `label: Label` | 마크가 N개인데 라벨이 1개일 때 **리더선이 몇 개이고 어디에 붙는지** 두 가지 이상으로 읽힌다 → Q2. `anchorMarkId` 필드로 답 무관하게 설계 | 🟡 중 |
| **모호** | 상세기획 §3-4 "정규화 좌표(0~1)" | 라벨이 **도면 밖으로 나갈 수 있는지** 불명. 젠트릭스는 나간다. "0~1"을 강한 제약으로 읽으면 그 조작이 막힌다 → §2-1-a 에서 마크는 클램프 / 라벨은 비클램프로 분리 제안 | 🟡 중 |
| **미결정** | 상세기획 §2.5 **G7** (`⬜ 확인 필요`) | 미완성 결함(`DRAFT`) 허용 여부. **Phase 3에서 "점을 찍는다"는 순간 반드시 걸린다** → **Q1 (차단)** | 🔴 치명 |
| **미결정** | 상세기획 §7 미결 **Q6** | "도면 확대 상태 정밀 표기(핀치줌·크로스헤어·롱프레스)" — **모바일 전용 사안**이다. D1이 PC 웹 우선이므로 이번 범위에서는 **보류**한다. 질문하지 않음 | ⚪ 보류 |
| **미결정** | 상세기획 §2.5 **G6** | 미니맵·최근 위치 점프. D2 1차 범위에 없다 → **보류**. 다만 층별 뷰포트 기억(§2-3)은 비용이 거의 없어 포함했다 | ⚪ 보류 |
| **함정 #1** | — | 도면에 그리는 번호가 출력번호로 오인될 위험. **`Label` 에 번호 필드를 두지 않고 `displayNumber` 를 주입**하도록 못박음 (§2-1-b) | ✅ 대응함 |
| **함정 #2** | — | 좌표 정규화는 지켜져 있으나, **정규화 공간에서 각도를 재면 종횡비 때문에 틀린다**는 함정이 문서 어디에도 없다 (§2-2-a) | ✅ 대응함 |
| **함정 #5** | — | **라벨 위치 이동이 `style` 을 건드리면 전역 스타일 상속이 통째로 끊긴다.** 매우 빠지기 쉬운 함정 (§2-1-c) | ✅ 대응함 |
| **함정 #3** | — | 캔버스 편집은 전부 로컬 상태에 즉시 반영하고 서버 응답을 기다리지 않는다. 도면 이미지도 로컬 캐시 우선 | ✅ 대응함 |
| **출력 재현성** | — | 조사위치도 출력과 화면이 어긋나지 않으려면 **렌더 모델을 공유**해야 한다. 코어에 `renderModel.ts` 를 두는 근거 (§2-9-a) | ✅ 대응함 |

---

## 5. 사용자 확인 필요

`_workspace/QUESTIONS.md` 에 **Q1~Q8** 을 기록했다.

| # | 요지 | 차단 | 영향 작업 |
|---|---|---|---|
| **Q1** | 점을 찍는 순간 결함이 저장되는가 / 미완성 결함 허용 | **차단** (T11 한정) | T11 |
| Q2 | 마크 N개일 때 리더선 앵커 규칙 | 비차단 | T4, T9 |
| Q3 | 마크를 옮기면 라벨이 따라오는가 | 비차단 | T6 |
| Q4 | 번호 풍선 크기 — 줌 연동(WYSIWYG) vs 화면 고정 | 비차단 | T4 |
| Q5 | 각도 스냅에 45도 배수 포함 여부 | 비차단 | T9 |
| Q6 | 정렬 스냅 vs 각도 스냅 충돌 시 우선순위 | 비차단 | T10 |
| Q7 | 마지막 마크를 지우면 결함 전체가 삭제되는가 | 비차단 | T11 |
| Q8 | 전회차 표기를 PC 정리 화면에서 이동·삭제할 수 있는가 | 비차단 | T5, T6 |

비차단 8건의 가정은 전부 `_workspace/ASSUMPTIONS.md` 에 기록했다.
**모든 가정은 이 문서에서 확정값을 가지므로 builder가 추측할 지점이 없다.**

---

## 변경 이력

| 날짜 | 변경 | 사유 |
|---|---|---|
| 2026-08-22 | 최초 작성 (Phase 3 스펙 신규 수립) | 상세기획에 Phase 3 본문이 없어 이 문서가 그 자리를 채움 |
