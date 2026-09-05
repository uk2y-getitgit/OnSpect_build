# OnSpect

안전진단 결함관리 앱. 현장(모바일)에서 도면 위에 결함을 기록하고, 사무실(PC)에서 정리해
보고서 부록 산출물(손상결함표·결함리스트·사진첩·조사위치도)을 뽑는다.

> **새 세션은 `NEXT.md` 를 먼저 읽어라.** 현재 상태·다음 작업·미답변 질문이 거기 있다.

## 기준 문서

| 문서 | 역할 |
|---|---|
| `NEXT.md` | **이어받기 문서.** 현재 상태 · 다음 작업 · 미답변 질문 |
| `OnSpect_상세기획.md` | **1차 기준.** 데이터 모델·번호체계·Phase별 설계 |
| `안전진단_결함관리앱_기획서.md` | 상위 방향. 상세기획과 충돌하면 상세기획이 우선 |
| `docs/benchmark/젠트릭스_분석.md` | 경쟁 제품(젠트릭스) 실측 |
| `벤치마킹 스크린샷/` | 경쟁 제품 실제 화면 14장 |

---

## 하네스: OnSpect 개발

**목표:** 기획 검토 → 구현 → 검수 → 실행 검증을 한 팀으로 묶어, 추측 없이 만들고 실행해서 확인한다.

**트리거:** OnSpect 개발 작업(기능 구현, Phase 착수, 코드 작성·검수·테스트, 수정·재실행) 요청 시
`onspect-orchestrator` 스킬을 사용하라. 단순 질문·문서 열람은 직접 응답 가능.

**절대 규칙:** 의문이 생기면 임의로 처리하지 않는다.
`_workspace/QUESTIONS.md` 에 적고 사용자에게 묻는다.
비차단 가정은 `_workspace/ASSUMPTIONS.md` 에 남기고 **최종 보고에 반드시 포함한다.**

**코드 탐색은 Serena로:** 이 폴더는 Serena 프로젝트 `OnSpect` 로 등록돼 있다.
코드를 찾고 읽을 때 **파일 전체를 읽지 말고** 심볼 단위로 접근하라 —
`get_symbols_overview` 로 훑고, `find_symbol` 로 필요한 것만, `find_referencing_symbols` 로 영향 범위를,
`search_for_pattern` 으로 후보를 먼저 좁힌다.
편집도 `replace_symbol_body` / `replace_content`(정규식) / `replace_in_files` 를 쓴다.
**이유: 이 프로젝트는 이미 사용한도 초과로 작업이 한 번 중단됐다.**
전체 파일 읽기·쓰기가 예산을 가장 빨리 태운다. 이미 읽은 파일을 심볼 도구로 다시 분석하지도 마라.

**검증 분담 — 에이전트는 브라우저를 띄우지 않는다.**
에이전트: 계획 검토 → 코드 작성 → 코드 오류 검토. 타입·단위테스트·빌드·경계면 교차 비교까지.
**사용자: 웹에서 직접 실행하고 조작하며 오류를 발견해 알려준다.**
개발 서버 실행·화면 조작·스모크 확인을 하지 마라 — 예산의 가장 큰 낭비다.
클릭해봐야 아는 것은 `## 직접 확인해주실 것` 체크리스트로 넘긴다.

**완료 시 절차 (리더가 한다):**
1. 타입 검사 · 단위 테스트 · 프로덕션 빌드
2. **개발 서버를 띄우고 URL 을 사용자에게 제시한다** — 뜨는 것까지가 코드 실행 검증이다
3. `## 직접 확인해주실 것` 체크리스트를 함께 준다
4. **알림을 보낸다** (PushNotification)

**화면을 하나하나 클릭하며 확인하지 마라.** 서버가 뜨는 것만 확인하고 넘긴다 — 시간·토큰 절약.
에이전트(builder·code-reviewer)는 서버조차 띄우지 않는다. 위 1~4는 리더 몫이다.

**오류 신고가 오면** `onspect-fix` 로 **그 오류 하나만** 좁게 고친다.
plan-reviewer 를 부르지 않고, 팀도 만들지 않는다. builder 1명이면 된다.
주변을 정리하거나 리팩터하지 않는다 — 눈에 띈 다른 문제는 고치지 말고 보고에 적는다.

---

## 메타스킬: task-observer (전역 설치, OnSpect 전용 아님)

`task-observer`("One Skill to Rule Them All")는 `~/.claude/skills/task-observer/` 에 **전역 설치**돼
모든 프로젝트에서 공통으로 동작한다. 세션 중 반복되는 작업 패턴·사용자의 수정/지적·기존 스킬의
공백을 관찰해 스킬 개선안을 쌓아가는 메타스킬 — OnSpect 고유 하네스가 아니다.

**활성화:** 세션의 첫 툴콜 전, 그리고 계획을 세우기 전에 `task-observer` 스킬을 불러
Session Start Protocol(저장소 확인 · 관찰 로그 frontmatter 스캔 · 리뷰 트리거)까지 실행한다.
스킬 파일만 로드하고 프로토콜을 안 돌리면 활성화된 게 아니다.
작업을 마칠 때마다 이번 세션에 기록된 관찰(observation)을 한 줄로 보고한다
("id·제목 목록" 또는 "기록 없음 — 이유").

**작업공간(전역 고정, 프로젝트별로 새로 만들지 않는다):**
```
C:/Users/samsung/.claude/skill-observations/observation-log/       (관찰 로그)
C:/Users/samsung/.claude/skill-observations/cross-cutting-principles.md
C:/Users/samsung/.claude/skill-updates/                             (검토 대기 스테이징)
C:/Users/samsung/.claude/skill-updates/PENDING.md
```
전역 설치된 스킬이므로 로그는 프로젝트마다 새로 만들지 말고 위 경로 하나로만 고정한다.
현재 `cwd` 나 OnSpect 프로젝트 폴더 하위로 경로를 다시 계산하지 않는다.

> **주의(비차단 가정):** 이 스킬은 "모든 세션·모든 툴콜 전에 트리거"되도록 설계돼 있어,
> 위 하네스의 "단순 질문·문서 열람은 직접 응답 가능" 규칙과 매 세션 겹쳐서 발동할 수 있다.
> 실제로 과도하게 자주 끼어들면 조정이 필요 — 그런 경우 `_workspace/ASSUMPTIONS.md` 에 기록.

**변경 이력:**

| 날짜 | 변경 내용 | 대상 | 사유 |
|---|---|---|---|
| 2026-08-22 | 초기 구성 — 에이전트 4 + 스킬 5 | 전체 | 개발 착수 전 하네스 구축 요청 |
| 2026-08-22 | 팀 도구 폴백 경로 추가 | skills/onspect-orchestrator | `TeamCreate`/`TaskCreate` 부재, 커스텀 에이전트 타입 미등록 |
| 2026-08-22 | UI 품질 기준 신설 | skills/onspect-build/references/ui-quality.md | "UI 하나하나 신경써서" 사용자 요구 |
| 2026-08-22 | 검증 분담 규칙 — 에이전트 코드검증 / 사용자 사용검증 | ui-quality.md · onspect-qa · CLAUDE.md | 사용한도 초과로 작업 중단. 브라우저 조작에 예산 소모 방지 |
| 2026-08-22 | Serena 프로젝트 등록 · 심볼 단위 탐색 규칙 | CLAUDE.md | 전체 파일 읽기가 예산을 가장 빨리 소모. 심볼 단위 접근으로 전환 |
| 2026-08-22 | **qa-inspector 폐지** (4명 → 3명), 경계면 교차 비교를 code-reviewer로 이관 | agents/ · skills/onspect-qa 삭제 · onspect-code-review | 웹 실행 검증이 과도하게 느리고 비쌈. 실행 검증은 사용자가 담당 |
| 2026-08-22 | `onspect-fix` 신설 — 사용자 신고 오류만 좁게 수정 | skills/onspect-fix · builder.md · orchestrator Phase 0-A | 오류 신고 시 전체 워크플로우를 타지 않고 1명으로 처리 |
| 2026-09-05 | `task-observer` 메타스킬 전역 설치 + 활성화 문구 추가 | `~/.claude/skills/task-observer/` · CLAUDE.md | 사용자 요청 — 세션 전반의 스킬 개선 관찰을 상시화 |
