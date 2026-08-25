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
| B | Phase B 빌드 — T9~T16 (출력화면 P6 + 엑셀어댑터 + 4종 산출물 + 출력이력) | builder | A-Fix | ✅ `24_builder_log_PhaseB_Export.md` · 브랜치 `feat/s5-phase4-a` 커밋 4~6 (`33859d9` · `d00a97f` · `f7452a0`) · 타입 ✅ / 테스트 212 ✅ / 빌드 ✅ · 신규 가정 M1~M12 · 비차단 질문 Q36 · Q37 |
| B-R | Phase B 검수 | code-reviewer | B | ⬜ |
| C | 통합 판정 — 타입/테스트/빌드, 개발서버 기동, NEXT.md 갱신 | 리더 | A-R,B-R | ⬜ |

세부 작업 T1~T16 정의: `_workspace/21_plan-reviewer_spec_S5_Phase4.md` §5

## 커밋 단위 (항목마다 커밋·푸시)
S5 완료 / 공통 번호부여 완료 / 손상결함표 완료 / 결함리스트 완료 / 사진첩 완료 / 조사위치도 완료

**Phase B 실제 커밋 (3개).** 산출물별로 5개로 쪼개면 **중간 커밋이 컴파일되지 않는다** —
`Export.tsx → produce.ts → {damageTableFile, locationMap, xlsx}` 가 한 덩어리다.
"각 커밋에서 타입검사·테스트·빌드가 깨지지 않는다"를 우선했고 커밋 메시지에 T 번호를 전부 적었다.

| 커밋 | 내용 | T |
|---|---|---|
| `33859d9` | 손상결함표·결함리스트·사진첩 공유 모델 + 엑셀 어댑터 | T10 · T11 · T13 · T15 코어 |
| `d00a97f` | 조사위치도 오프스크린 렌더 + 산출물 생성 파이프라인 | T14 · repo 위임(검수 경미 6) |
| `f7452a0` | 출력 화면 P6 + 인쇄 뷰 + 출력 이력 | T9 · T12 · T16 · 인쇄 뷰 3종 |
