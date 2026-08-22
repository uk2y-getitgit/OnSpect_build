---
name: onspect-orchestrator
description: "OnSpect 안전진단 결함관리 앱 개발 팀(기획검토·구현·코드검수)을 조율하는 오케스트레이터. OnSpect 개발, 기능 만들기, Phase 착수, 구현해줘, 만들어줘, 개발 진행, 결함관리앱 작업 요청 시 반드시 이 스킬을 사용할 것. 후속 작업: 다시 실행, 재실행, 업데이트, 수정, 보완, 이어서 진행, 특정 Phase만 다시, 이전 결과 기반으로 개선, 지적사항 반영, 버그 수정 요청 시에도 반드시 이 스킬을 사용. 도면 캔버스·결함 입력폼·사진 관리·오프라인 동기화·손상결함표 출력·전회차 대조 등 OnSpect의 모든 개발 작업에 적용."
---

# OnSpect Orchestrator

기획검토 → 구현 → 코드검수를 하나의 팀으로 묶어 조율한다.
**실행 검증은 사용자가 한다. 에이전트는 브라우저를 띄우지 않는다.**

## 실행 모드: 에이전트 팀 (폴백 있음)

### ⚠️ 시작 전 반드시 확인할 두 가지

**1. 팀 도구 가용성**

`TeamCreate` / `TaskCreate` 는 빌드에 따라 없을 수 있다. 없으면 팀을 만들 수 없다.

| 상황 | 모드 |
|---|---|
| `TeamCreate` 사용 가능 | **팀 모드** — Phase 2 의 TeamCreate/TaskCreate 그대로 |
| **없음** | **폴백: Agent + SendMessage** — `Agent` 로 각 팀원을 `run_in_background: true` 로 띄우고, `SendMessage` 로 조율. 작업 목록은 `_workspace/TASKS.md` 파일로 대체 |

폴백에서도 **모듈 완성 직후 검수는 유지한다.** 리더가 중계하면 된다.

**2. 커스텀 에이전트 타입 등록 여부**

`.claude/agents/*.md` 를 **이번 세션에서 방금 만들었다면 아직 등록되지 않았다.**
`subagent_type: "builder"` 같은 호출이 실패한다.

| 상황 | 처리 |
|---|---|
| 세션 시작 시점에 이미 존재 | `subagent_type` 에 이름 그대로 사용 |
| **이번 세션에서 생성** | `subagent_type: "general-purpose"` + 프롬프트 첫 줄에 **"`.claude/agents/{name}.md` 와 `.claude/skills/{skill}/SKILL.md` 를 먼저 읽고 그 정의대로 행동하라"** 를 넣는다 |

두 번째 경우, 다음 세션부터는 정상 등록되므로 폴백이 필요 없다.

---

3명이 순차 파이프라인처럼 보이지만, 실제로는 실시간 조율이 필요하다.

- 검수는 전체 완성 후가 아니라 **모듈 완성 직후마다** 돌아야 한다 (경계면 버그 누적 방지)
- builder 는 작업 중 plan-reviewer 에게 스펙 해석을 물어야 한다

그래서 서브 에이전트가 아니라 팀이다.

## 에이전트 구성 — 3명 (2026-08-22 개편)

| 팀원 | 역할 | 스킬 | 산출물 |
|---|---|---|---|
| `plan-reviewer` | 스펙 검증·작업 분해 | `onspect-spec-review` | `NN_plan-reviewer_spec_*.md` |
| `builder` | 코드 작성 · **오류 수정** | `onspect-build` / `onspect-fix` | 소스 + `NN_builder_log_*.md` |
| `code-reviewer` | 정적 검수 · **경계면 교차 비교** | `onspect-code-review` | `NN_code-reviewer_findings_*.md` |

모든 `Agent`/`TeamCreate` 호출에 **`model: "opus"`** 를 명시한다.

### qa-inspector 는 폐지됐다

> 사용자 지시 (2026-08-22): *"직접 구현된 기능을 웹에서 실행하고 검증하는 과정이
> 너무 오래걸리고 예산을 너무 많이 사용되고 있어. qa-inspector.md는 너무 과한 작업인거 같아.
> UI와 직접 작업을 진행하는 건 내가 하고, 오류를 다시 알려주면
> 해당 오류에 대한 확인과 수정만 다시 진행해줘."*

- **실행 검증은 사용자가 한다.** 에이전트는 브라우저를 띄우지 않는다
- QA가 하던 것 중 **경계면 교차 비교만 `code-reviewer` 로 옮겼다** —
  브라우저가 필요 없는 코드 읽기인데 런타임 에러를 가장 많이 잡기 때문이다
- 시나리오 실행·스모크·화면 조작은 전부 없앴다

---

## ⭐ 질문 에스컬레이션 — 이 하네스의 핵심 규약

사용자가 명시적으로 요구했다: **"의문점이 생기면 임의로 처리하지 말고 나한테 다시 물어봐줘."**

서브 에이전트는 사용자에게 직접 질문할 수 없다. 리더가 창구다.

```
에이전트가 막힘
   ↓
_workspace/QUESTIONS.md 에 append + 리더에게 SendMessage
   ↓
[차단]  → 그 작업만 멈추고 다른 작업으로 이동
[비차단] → _workspace/ASSUMPTIONS.md 에 가정 기록 후 계속
   ↓
리더가 모아서 AskUserQuestion 으로 사용자에게 질문
   ↓
답변을 _workspace/DECISIONS.md 에 기록
   ↓
해당 에이전트에게 SendMessage 로 전달 → 작업 재개
```

### 리더의 질문 처리 규칙

| 상황 | 처리 |
|---|---|
| 차단 질문 발생 | **즉시** 사용자에게 묻는다. 쌓아두지 않는다 — 팀이 멈춰 있다 |
| 비차단 질문 발생 | 모아둔다. 차단 질문이 생기거나 Phase가 끝날 때 함께 묻는다 |
| 질문이 4개 초과 | 가장 결정적인 4개만 `AskUserQuestion` 으로 묻고 나머지는 다음 배치로 |
| 리더가 답을 아는 질문 | 문서·코드에서 확인 가능하면 리더가 답한다. 사용자를 부르지 않는다 |
| 취향 수준의 질문 | 반려한다. 에이전트에게 "정하고 진행하라" 고 회신 |

**리더가 대신 답해도 되는 것**: 문서에 이미 쓰여 있는 것, 코드에서 확인 가능한 것, 이름·구조 같은 내부 결정.
**반드시 사용자에게 가는 것**: 화면에 보이는 동작, 데이터 구조, 산출물 형태, 기획서와 어긋나는 판단, 범위 확대.

### ASSUMPTIONS.md 는 반드시 최종 보고에 포함한다

비차단 질문에 대해 에이전트가 세운 가정은 **사용자가 모른 채로 굳으면 안 된다.**
최종 보고 시 "이렇게 가정하고 만들었습니다" 로 전부 나열하고 확인받는다.

---

## 워크플로우

### Phase 0-A — 오류 수정 요청인가? (먼저 판별)

사용자가 **직접 써보다가 발견한 오류**를 알려온 경우, 아래 전체 워크플로우를 **타지 않는다.**

```
사용자 오류 신고
   ↓
builder 1명만 투입 (onspect-fix 스킬)
   ↓
코드에서 원인 특정 → 그 오류만 좁게 수정 → 타입·테스트·빌드
   ↓
사용자에게 "다시 확인해주세요" 절차와 함께 보고
```

- **plan-reviewer 를 부르지 않는다.** 스펙 변경이 아니다
- **code-reviewer 도 기본적으로 부르지 않는다.** 단 수정이 경계면을 건드렸으면 부른다
- 팀을 만들지 않는다. 에이전트 1명이면 된다
- 신고가 **스펙 자체의 결함**으로 드러나면 그때 정식 워크플로우로 승격한다

판별 기준: *"만들어달라"* 면 아래로, *"안 된다 / 이상하다 / 고쳐달라"* 면 여기로.

### Phase 0 — 컨텍스트 확인

1. `_workspace/` 존재 여부 확인
2. 실행 모드 결정:

| 상황 | 모드 | 동작 |
|---|---|---|
| `_workspace/` 없음 | **초기 실행** | 새로 만들고 Phase 1 |
| 있음 + 부분 수정 요청 | **부분 재실행** | 해당 에이전트만 재호출. 산출물은 덮어쓰기 |
| 있음 + 새 범위 요청 | **새 실행** | 기존을 `_workspace_{YYYYMMDD_HHMMSS}/` 로 이동 후 새로 생성 |

3. 부분 재실행이면 이전 산출물 경로를 에이전트 프롬프트에 포함해, 기존 결과를 읽고 개선하도록 지시한다

### Phase 1 — 준비

1. 작업 범위 확정. 지정되지 않았으면 `OnSpect_상세기획.md` 로드맵에서 🔵 Phase 를 대상으로 한다
2. `_workspace/` 생성:
```
_workspace/
  00_input/          범위 지정, 사용자 요청 원문
  QUESTIONS.md       에이전트 → 사용자 질문 적재
  DECISIONS.md       사용자 답변 기록
  ASSUMPTIONS.md     비차단 가정 기록
```
3. `QUESTIONS.md` / `DECISIONS.md` / `ASSUMPTIONS.md` 를 헤더만 넣어 미리 만든다 (에이전트가 append 할 수 있도록)

### Phase 2 — 팀 구성

```
TeamCreate(
  team_name: "onspect-team",
  members: [
    { name: "plan-reviewer",  agent_type: "plan-reviewer",  model: "opus",
      prompt: "onspect-spec-review 스킬을 따라 {범위}의 스펙을 검토하고 작업으로 분해하라.
               의문은 임의로 정하지 말고 QUESTIONS.md 에 적고 리더에게 알려라." },
    { name: "builder",        agent_type: "builder",        model: "opus",
      prompt: "onspect-build 스킬을 따라 구현하라. plan-reviewer 의 스펙 확정을 기다린 뒤 시작한다.
               모듈 하나가 끝날 때마다 code-reviewer 에게 알려라. 브라우저는 띄우지 마라." },
    { name: "code-reviewer",  agent_type: "code-reviewer",  model: "opus",
      prompt: "onspect-code-review 스킬을 따라 검수하라. builder 의 알림을 받으면 즉시 해당 모듈을 검수한다." },
  ]
)
```

작업 등록 — 팀원당 4~6개가 적정:

```
TaskCreate(tasks: [
  { title: "스펙 검토",        assignee: "plan-reviewer" },
  { title: "작업 분해",        assignee: "plan-reviewer", depends_on: ["스펙 검토"] },
  { title: "{모듈1} 구현",     assignee: "builder",       depends_on: ["작업 분해"] },
  { title: "{모듈1} 검수",     assignee: "code-reviewer", depends_on: ["{모듈1} 구현"] },
  { title: "{모듈2} 구현",     assignee: "builder",       depends_on: ["작업 분해"] },
  ...
])
```

> `{모듈N} 검수` 는 `{모듈N} 구현`에만 의존한다. 다음 모듈 구현과 병행될 수 있다.

### Phase 3 — 스펙 확정 (게이트)

`plan-reviewer` 가 먼저 돈다. **판정이 나오기 전에 builder 를 풀지 않는다.**

| 판정 | 리더의 조치 |
|---|---|
| 바로 착수 가능 | builder 시작 |
| 조건부 가능 | `ASSUMPTIONS.md` 를 사용자에게 알리고 builder 시작 |
| **착수 불가** | **builder 를 멈추고 사용자에게 차단 질문을 먼저 묻는다** |

이 게이트를 건너뛰면 잘못된 데이터 구조가 코드에 굳는다. 되돌리는 비용이 가장 큰 지점이다.

### Phase 4 — 구현 + 점진적 검수

```
builder ──모듈1 완성 알림──→ code-reviewer (정적 검수 + 경계면 교차 비교)
                                    │
                          지적 ←────┘
                                    ↓
builder 수정 → 재검수 → 다음 모듈
```

**통신 규칙**
- builder 는 모듈 완성 시 code-reviewer 에게 SendMessage
- builder 가 스펙 해석에 막히면 plan-reviewer 에게 직접 묻는다 (리더 경유 불필요)
- 누구든 사용자 결정이 필요하면 QUESTIONS.md + 리더에게 SendMessage
- **아무도 브라우저를 띄우지 않는다.** 런타임 확인은 사용자 몫이다

**리더 모니터링**
- 팀원 유휴 알림 수신 시 상태 확인
- 차단 질문이 올라오면 즉시 사용자에게 전달
- 진행률은 `TaskGet`

### Phase 5 — 통합 판정

1. 모든 작업 완료 대기 (`TaskGet`)
2. 산출물 3종을 Read 로 수집
3. 종합 판정:

| 조건 | 판정 |
|---|---|
| code-reviewer 심각 0 + 타입·테스트·빌드 통과 | **코드 완료** — 사용자 확인 대기 |
| 심각 1건 이상 또는 빌드 실패 | **미완료** — 수정 사이클 재진입 |

**"완료"라고 단정하지 않는다.** 런타임 확인이 남아 있다.
`코드 검증까지 통과했고, 실제 동작은 확인해주셔야 합니다` 로 보고한다.

### Phase 6 — 사용자 보고 ⭐

사용자가 명시적으로 요구했다: **"완성되면 결과물을 사용자에게 보고"**

보고에 반드시 포함:

```markdown
## 무엇을 만들었나
{동작 기준으로. "~파일을 만들었다"가 아니라 "~하면 ~가 된다"}

## 어떻게 확인하나
{실행 방법 — 사용자가 직접 눌러볼 수 있게}

## 검증 결과
| 시나리오 | 결과 |
{미검증은 미검증이라고 적는다. 통과로 포장하지 않는다}

## 이렇게 가정하고 만들었습니다  ← ASSUMPTIONS.md 전문
{사용자가 모른 채 굳으면 안 되는 것들. 하나씩 확인받는다}

## 남은 것 / 못 한 것
{이유와 함께}

## 다음에 결정이 필요한 것
```

**보고에서 하지 않는 것**: 통과하지 못한 것을 통과로 적기, 미검증을 검증으로 적기,
가정을 언급하지 않고 넘어가기.

### Phase 7 — 정리

1. 팀원에게 종료 요청 (SendMessage)
2. `TeamDelete`
3. `_workspace/` **보존** (삭제하지 않는다 — 사후 추적용)
4. 하네스 개선점이 있으면 사용자에게 제안

---

## 데이터 흐름

```
[리더] ── TeamCreate ──┐
                       │
  plan-reviewer ──01_spec.md──→ builder ──소스──┬──→ code-reviewer ──03_findings.md──┐
        ↑                          ↑            │                                    │
        └────── 스펙 해석 문의 ─────┘                                                │
                                                            ↑                        │
                                                            └──── 수정 요청 ──────────┘
                                                                     ↓
                                                                  builder

  누구든 ──→ QUESTIONS.md ──→ [리더] ──AskUserQuestion──→ 사용자
                                  ↓
                            DECISIONS.md ──→ 해당 에이전트
```

---

## 에러 핸들링

| 상황 | 전략 |
|---|---|
| 팀원 1명 실패/중지 | 리더가 SendMessage 로 상태 확인 → 재시작. 실패 시 작업 재할당 |
| 팀원 과반 실패 | 사용자에게 알리고 진행 여부 확인 |
| 타임아웃 | 수집된 부분 결과로 진행. 미완료 영역을 보고서에 **명시** |
| builder ↔ code-reviewer 판단 충돌 | 삭제하지 않고 양측 주장을 병기 → plan-reviewer 중재 → 안 되면 사용자 질문 |
| 차단 질문에 사용자 응답 없음 | 팀을 대기시키지 말고, 해당 작업만 보류하고 나머지 작업 진행 |
| 스펙 착수 불가인데 구현 요청 | **builder 를 풀지 않는다.** 차단 질문을 먼저 해소 |
| 같은 결함이 3회 재발 | 개별 수정을 멈추고 설계 문제로 격상 → plan-reviewer 재검토 |

---

## 테스트 시나리오

### 정상 흐름
1. 사용자가 "Phase 3 도면 캔버스 만들어줘" 요청
2. Phase 0 — `_workspace/` 없음 → 초기 실행
3. Phase 1 — 범위를 상세기획 Phase 3 으로 확정, 작업공간 생성
4. Phase 2 — 4명 팀 + 작업 등록
5. Phase 3 — plan-reviewer 가 `조건부 가능` 판정, 비차단 질문 2건을 ASSUMPTIONS 로 처리
6. Phase 4 — builder 가 마커 모듈 완성 → 즉시 code-reviewer/qa 검증 → 지적 3건 수정 → 다음 모듈
7. Phase 5 — 심각 0, 시나리오 S5 통과 → 완료
8. Phase 6 — 가정 2건을 포함해 사용자에게 보고
9. Phase 7 — 팀 정리, `_workspace/` 보존

### 에러 흐름 (차단 질문)
1. Phase 3 에서 plan-reviewer 가 `착수 불가` 판정 — "리더선 각도 스냅의 허용 오차가 스펙에 없음"
2. QUESTIONS.md 에 차단 질문 기록 + 리더에게 SendMessage
3. **리더는 builder 를 풀지 않는다**
4. 리더가 `AskUserQuestion` 으로 사용자에게 즉시 질문
5. 답변을 DECISIONS.md 에 기록 → plan-reviewer 에게 전달
6. plan-reviewer 재판정 `바로 착수 가능` → Phase 4 진행

### 에러 흐름 (팀원 중지)
1. Phase 4 에서 code-reviewer 가 에러로 중지
2. 리더가 유휴 알림 수신 → 상태 확인 → 재시작 실패
3. 검증 가능한 항목만 code-reviewer 에게 재할당
4. Phase 5 진행하되 판정은 `조건부 완료`
5. Phase 6 보고에 "S1 오프라인 동기화 미검증 — 실기기 환경 없음" 명시
