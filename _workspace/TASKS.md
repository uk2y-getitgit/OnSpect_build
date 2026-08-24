# TASKS — S5 + Phase4 (팀 도구 폴백)

`TeamCreate`/`TaskCreate` 미가용 → `Agent` + `SendMessage` 폴백. 이 파일이 작업 목록을 대신한다.
갱신: 리더가 각 에이전트 완료/알림을 받을 때마다 상태를 갱신한다.

범위 문서: `_workspace/00_input/scope_S5_Phase4.md`

## 상태 범례
⬜ 대기 · 🟦 진행중 · ✅ 완료 · 🟥 차단

| # | 작업 | 담당 | 의존 | 상태 |
|---|---|---|---|---|
| 1 | 스펙 검토 + 작업 분해 (S5 + Phase4 4종 + 공통 번호부여) | plan-reviewer | - | ✅ `21_plan-reviewer_spec_S5_Phase4.md` |
| A | Phase A 빌드 — T1~T8 (공통기반: 번호부여·ExportRun + S5 사진 전체) 2커밋 | builder | 1 | ✅ `22_builder_log_PhaseA_S5.md` · 브랜치 `feat/s5-phase4-a` 2커밋 |
| A-R | Phase A 검수 | code-reviewer | A | ✅ `23_code-reviewer_findings_PhaseA.md` — 심각 1 · 보통 2 · 경미 4 |
| A-Fix | Phase A 지적사항 수정 (심각1+보통2) | builder | A-R | ✅ 커밋 3 — 22_builder_log 하단 `검수 반영` 절 |
| B | Phase B 빌드 — T9~T16 (출력화면 P6 + 엑셀어댑터 + 4종 산출물 + 출력이력) 5커밋 | builder | A-Fix | ⬜ |
| B-R | Phase B 검수 | code-reviewer | B | ⬜ |
| C | 통합 판정 — 타입/테스트/빌드, 개발서버 기동, NEXT.md 갱신 | 리더 | A-R,B-R | ⬜ |

세부 작업 T1~T16 정의: `_workspace/21_plan-reviewer_spec_S5_Phase4.md` §5

## 커밋 단위 (항목마다 커밋·푸시)
S5 완료 / 공통 번호부여 완료 / 손상결함표 완료 / 결함리스트 완료 / 사진첩 완료 / 조사위치도 완료
