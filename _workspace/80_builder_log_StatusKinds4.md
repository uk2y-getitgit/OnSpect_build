# 표기 종류 3종 → 4종 재정의 (실사용 신고 #3)

작업자: 리더 직접 · 브랜치 `feat/ui-behavior-0903` · 근거: **D35** (D27 을 뒤집는다)

---

## 무엇이 달라지나

| 화면 이름 | 내부값 | 색 | 잠금 |
|---|---|---|---|
| **결함** (기본값) | `CURRENT` | `#e5342a` 빨강 | 편집 가능 |
| **신규** ⭐신설 | `NEW` | `#7c4dff` 보라 | 편집 가능 |
| **전차** | `PREV_PENDING` | `#16266e` 남색 | **잠김** |
| **보수완료** | `REPAIRED` | `#1e88e5` 파랑 | 편집 가능 |

- 보수완료의 **회색 + 불투명도 40% 를 없앴다.** 네 종류 모두 불투명하다
- 우측 패널 `표기 종류` 줄이 4칸이 됐다
- 범례도 4행이 될 수 있다(도곽 설정에 `신규` 체크박스 추가)

## 저장 데이터는 안 건드렸다

`CURRENT`·`PREV_PENDING`·`REPAIRED` 의 **뜻이 그대로다** — 이름과 색만 바뀌었다.
`NEW` 만 새로 생기므로 옛 레코드에는 아예 나타나지 않는다.
→ **`DB_VERSION` 1 유지, 마이그레이션 0건.**

범례 저장 필드도 이름을 안 바꿨다(바꾸면 마이그레이션이 필요하다).
그래서 **필드 이름과 화면 이름이 어긋난다** — 헷갈리기 쉬운 지점이라 타입 주석에 표로 박아 뒀다:

| 저장 필드 | 상태값 | 화면 이름 |
|---|---|---|
| `statusNew` | `CURRENT` | 결함 |
| `statusNewFound` (신설) | `NEW` | 신규 |
| `statusPending` | `PREV_PENDING` | 전차 |
| `statusRepaired` | `REPAIRED` | 보수완료 |

옛 프로젝트에는 `statusNewFound` 가 없어 **신규 행이 안 뜬다** — 기존 출력물이 한 글자도 안 바뀐다.

## 잠금이 뒤집혔다 — 여기가 가장 넓게 퍼진 변경

```
before:  isLocked = status !== 'CURRENT'      (전차 · 보수완료 둘 다 잠김)
after :  isLocked = status === 'PREV_PENDING' (전차만 잠김)
```

파생 효과:
- **보수완료 결함의 값을 고칠 수 있다** — 실무에서 필요했던 것
- **네 종류 모두 사진을 붙일 수 있다.** `canAddPhotos` 가 사실상 항상 true 다.
  전차는 원래 G-8 예외로 열려 있었고(사진 → 이번 회차 전환), 보수완료는 이제 편집 가능한 종류다
- 편집 툴바 · 삭제 · 이동 · 영역선택 일괄삭제의 "잠긴 것 제외" 판정이 전부 이 함수 하나를 본다 —
  고칠 곳이 한 군데였던 이유다

## 색 충돌 검증

예약색과 겹치면 도면에서 무슨 색인지 못 읽는다. 테스트로 고정했다:
- 선택 `#2d6cdf` · 가이드선 `#00b8d4` 와 겹치지 않는다
- 네 상태색이 서로 전부 다르다
- `styles.css` 의 `--defect-*` 변수와 `canvas-core` 의 `STATUS_COLOR` 가 **같은 값**이어야 한다
  (갈라지면 도면 위 풍선과 목록 배지가 서로 다른 말을 한다 — 주석으로 박아 뒀다)

---

## 변경 파일

| 파일 | 내용 |
|---|---|
| `canvas-core/src/types.ts` | `DefectStatus` 에 `NEW` 추가 + 4종 표 |
| `canvas-core/src/constants.ts` | `STATUS_COLOR`·`STATUS_OPACITY` 4종, 불투명도 전부 1 |
| `canvas-core/src/legend.ts` | `LegendStatusKind` 4종 · 라벨 · `statusNewFound` 토글 |
| `canvas-core/src/defectGeom.ts` | `isLocked` 재정의 · `canAddPhotos` 개방 |
| `canvas-core/src/commands.ts` | 전이 설명 4종 |
| `project-core/src/types.ts` | `ProjectLegend.statusNewFound` + 정규화 |
| `project-core/src/export/numbering.ts` | `NumberingStatus` 4종 (`NEW` 는 항상 포함) |
| `canvas-core/test/statusKinds.test.ts` | 신규 — 16건 |
| `canvas-core/test/{interaction,legend,tabletT7,marquee}.test.ts` | 옛 스펙을 고정하던 7건 갱신 |
| `apps/web` — `Inspector` · `Sidebar` · `SimilarDefectPicker` · `CanvasRoute` · `TitleBlockDialog` · `PhotoSection` · `styles.css` | 라벨 · 색 · 범례 체크박스 · 문구 |

---

## 검증

| 항목 | 결과 |
|---|---|
| `npm run typecheck` (3 워크스페이스) | 통과 |
| `npm test` | **813개 전부 통과** (canvas-core 466 · project-core 347, 신규 16) |
| `npm run build` | 통과 |
| `DB_VERSION` | 1 유지 |

---

## 세운 가정

| # | 가정 | 되돌리는 비용 |
|---|---|---|
| S-a | `전차` 는 사용자가 **직접 고를 수도 있다**(전회차 자료가 있을 때). 자동으로만 붙는 종류로 좁히지 않았다 | `canSetStatus` 한 줄 |
| S-b | 보수완료도 **사진 추가 가능**으로 열었다. 편집 가능한 종류라 막을 이유가 없다고 봤다 | `canAddPhotos` 복원 |
| S-c | 범례 저장 필드 이름은 **안 바꿨다**(마이그레이션 회피). 코드에서 이름이 어긋나 보인다 | 이름 변경 + 마이그레이션 |
| S-d | 남색 `#16266e` · 파랑 `#1e88e5` 는 리더가 골랐다. 예약색과 안 겹치는 선에서 정한 값이라 **원하는 색이 있으면 두 상수만 바꾸면 된다** | 상수 2개 |

---

## 다시 확인해주세요

1. 결함 선택 → `표기 종류` 가 **결함 · 신규 · 전차 · 보수완료** 4칸
2. 새로 찍은 결함이 **결함(빨강)** 으로 들어간다
3. **신규 → 보라**, **전차 → 남색**, **보수완료 → 파랑**. 보수완료가 **안 흐리다**
4. **보수완료 결함의 부재·규모를 고칠 수 있다** (예전에는 잠겼다)
5. **전차만 잠긴다** — 값 편집이 막히고 "전차 표기입니다" 안내가 뜬다
6. 전차에서 종류를 **결함**으로 바꾸면 잠금이 풀린다
7. 이번 회차에 새로 그린 결함은 **전차 버튼이 비활성** (전회차 자료가 없다)
8. 도곽 설정 → 범례에 **신규** 체크박스가 생겼다. 켜면 도면 범례에 한 줄 늘어난다
9. 좌측 결함 목록 · 유사결함 불러오기의 배지 색도 같이 바뀌었다
10. **옛 프로젝트를 열어도 색만 바뀌고 결함의 의미는 그대로** (빨강이 여전히 이번 회차)
