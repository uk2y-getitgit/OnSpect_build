# TASKS — 사용자 수정사항 2파일 (팀 도구 폴백)

`TeamCreate`/`TaskCreate` 미가용 → `Agent` + `SendMessage` 폴백. 이 파일이 작업 목록을 대신한다.
갱신: 리더가 각 에이전트 완료/알림을 받을 때마다 상태를 갱신한다.

범위 문서: `_workspace/00_input/scope_UserFeedback0828.md`
확정 스펙: `_workspace/30_plan-reviewer_spec_UserFeedback0828.md`

## 상태 범례
⬜ 대기 · 🟦 진행중 · ✅ 완료 · 🟥 차단

## 배치 구성 (의존관계 + 위험도 순)

| 배치 | 작업 | 근거 |
|---|---|---|
| **1** | F-1(모달 포커스 버그) · F-2(자동인쇄 제거) · R-3커밋(합성렌더러 마무리) | 독립·저위험, 사용자가 지금 당장 못 쓰는 것부터 |
| **2** | R-4(캡션·촬영정보) · R-5+R-6+R-8+F-4(자르기·주석·사진첩반영·사진번호숨김, 한PR) · R-9(손상결함표 인쇄뷰) | PhotoPolish 라운드 완결. R-5는 R-8과 분리 금지(스펙 경고) |
| **3** | G-6(층접두번호+사진전체연속) · G-3(도곽·범례 프로젝트스코프+F-3문구) · G-2(상태범례, G-3의존) | 신규기능, canvas-core 미변경 |
| **4** | G-5(D9폐기→유사결함불러오기) · G-1(필기메모 히트/지우개) | canvas-core 변경 포함, 277개 테스트+Phase5 히트프로파일 최고위험 → 마지막 |

## 배치 1

| # | 작업 | 담당 | 의존 | 상태 |
|---|---|---|---|---|
| 1-B | F-1·F-2·R-3커밋 구현 | builder | - | ✅ `31_builder_log_Batch1.md` · 커밋 `634a6f7`·`82354d6`·`ac9b045` · 타입/테스트538/빌드 통과 |
| 1-R | 배치1 검수 | code-reviewer | 1-B | ✅ `32_code-reviewer_findings_Batch1.md` — 심각0·보통3·경미4, 배치1 승인 |
| 1-Fix | 배치1 지적사항 수정 (보통3) | builder | 1-R | ✅ 커밋 `f824bf8` · 타입/테스트261/빌드 통과 · 경미2(겹친다이얼로그 Esc이중닫힘) 미해결로 남음(이번범위 아님) |

## 배치 2

| # | 작업 | 담당 | 의존 | 상태 |
|---|---|---|---|---|
| 2-B | R-4·R-5+R-6+R-8+F-4·R-9 구현 | builder | 1-Fix | ✅ `33_builder_log_Batch2.md` · 커밋 `ad820c6`(R-4)·`7f6ef29`(R-9)·`62cbaff`(R-8핵심)·`4d44354`(R-5+R-6+R-8배선+F-4) · 타입/테스트547/빌드 통과 |
| 2-R | 배치2 검수 | code-reviewer | 2-B | ✅ `34_code-reviewer_findings_Batch2.md` — 심각0·보통3·경미6, 조건부 통과(보통3 고치면 무조건 통과) |
| 2-Fix | 배치2 지적사항 수정 (보통3 + 경미 일부) | builder | 2-R | ✅ 커밋 `194cef8` · 타입/테스트547/빌드 통과 |

## 배치 3

| # | 작업 | 담당 | 의존 | 상태 |
|---|---|---|---|---|
| 3-B | G-6·G-3·G-2 구현 | builder | 2-Fix | ✅ `35_builder_log_Batch3.md` · 커밋 `fc12efa`(G-6)·`efd9e00`(G-3)·`8770c42`(G-2) · 타입/테스트597/빌드 통과 · 가정 U17~U22 |
| 3-R | 배치3 검수 | code-reviewer | 3-B | ✅ `36_code-reviewer_findings_Batch3.md` — 심각2·보통3·경미4, 조건부통과. 심각1은 차단질문(Q54)→사용자 답변 D20(옵트인) |
| 3-Fix | 배치3 지적사항 수정 (심각2+보통3, D20 반영) | builder | 3-R | ✅ `37_builder_log_Batch3Fix.md` · 커밋 `2574787` · 타입/테스트616/빌드 통과 |

## 배치 4

| # | 작업 | 담당 | 의존 | 상태 |
|---|---|---|---|---|
| 4-B | G-5·G-1 구현 | builder | 3-Fix | ✅ `38_builder_log_Batch4.md` · 커밋 `f358ae1`(G-5)·`8e92157`(G-1)·`80a62f4`(로그) · 타입/테스트638/빌드 통과 · 가정 U23~U26 |
| 4-R | 배치4 검수 | code-reviewer | 4-B | ✅ `39_code-reviewer_findings_Batch4.md` — 심각1·보통2·경미5, 조건부통과 |
| 4-Fix | 배치4 지적사항 수정 (심각1+보통2) | builder | 4-R | ✅ `40_builder_log_Batch4Fix.md` · 심각1(MOVE_MEMO 델타)·보통1(재삽입 역순)·보통2(토스트)+경미2(지우개 선택해제) · 타입/테스트644/빌드 통과 · 가정 U27~U28 |

## 통합

| # | 작업 | 담당 | 의존 | 상태 |
|---|---|---|---|---|
| Z | 통합 판정 — 타입/테스트/빌드, 개발서버 기동, NEXT.md 갱신 | 리더 | 4-Fix | ✅ 타입0오류·테스트644통과·빌드통과·서버 `http://localhost:5173/` 기동 확인. `NEXT.md` 갱신 |

## 전체 완료 — 사용자 수정사항(0828) 4개 배치 전부 병합됨

## 배치는 순차 진행이 원칙이나, 앞 배치 검수 대기 중 다음 배치 스펙 선독은 허용

---

# 태블릿 실사용 피드백 (2026-09-01)

범위 문서: `_workspace/00_input/scope_TabletFeedback0901.md` (리더가 직접 원인 조사 완료 — plan-reviewer 생략)

| # | 작업 | 담당 | 의존 | 상태 |
|---|---|---|---|---|
| T1-B | T-3·T-4·T-5·T-6 구현 (apps/web 전용) | builder | - | ✅ `41_builder_log_Tablet1.md` · 커밋 `14302a7`·`4199492` · 타입/테스트644/빌드 통과 · 가정 U29~U32 |
| T1-R | T1 검수 | code-reviewer | T1-B | ✅ `43_code-reviewer_findings_Tablet1.md` — 심각0·보통2·경미3, 조건부통과 |
| T1-Fix | T1 지적사항 수정 (보통2) | builder | T1-R | ✅ `45_builder_log_Tablet1Fix.md` · 커밋 `28bf30b` · 타입/테스트657/빌드 통과 · 가정 U37~U39 |
| T2-B | T-1·T-2 구현 (canvas-core + pointerAdapter) | builder | - | ✅ `42_builder_log_Tablet2.md` · 커밋 `27c4b83`·`1499d61` · 타입/테스트657(canvas350+project307)/빌드 통과 · 가정 U33~U36 |
| T2-R | T2 검수 | code-reviewer | T2-B | ✅ `44_code-reviewer_findings_Tablet2.md` — 심각0·보통1·경미3, 조건부통과 |
| T2-Fix | T2 지적사항 수정 (보통1) | builder | T2-R | ✅ `46_builder_log_Tablet2Fix.md` · 커밋 `3cdf81a` · 타입/테스트657/빌드 통과 · 경미C-3 미수정(사용자 결정 대기) |
| T3-B | T-7(G-8) 구현 | builder | T1-R, T2-R | ✅ `47_builder_log_Tablet3.md` · 커밋 `d2f03ec`·`f8f2a71` · 타입/테스트667/빌드 통과 · 가정 U40~U44 |
| T3-R | T3 검수 | code-reviewer | T3-B | ✅ `48_code-reviewer_findings_Tablet3.md` — 심각0·보통1·경미4, 조건부통과 |
| T3-Fix | T3 지적사항 수정 (보통1+경미1,2) | builder | T3-R | ✅ `49_builder_log_Tablet3Fix.md` · 커밋 `4f953c4` · 타입/테스트667/빌드 통과 |
| TZ | 통합 판정 | 리더 | T3-R | ✅ 타입0오류·테스트667통과·빌드통과·서버 `--host 0.0.0.0`로 PC·태블릿 동시 접속 확인. `NEXT.md` 갱신 |

## 전체 완료 — 태블릿 실사용 피드백 7건 전부 반영됨

---

# Phase 5 착수 — 팀 동기화 서버·로그인 + 오프라인 설치형 태블릿 UI (2026-09-02)

범위 문서: `_workspace/00_input/scope_Phase5_TeamSync.md`

| # | 작업 | 담당 | 의존 | 상태 |
|---|---|---|---|---|
| P5-1 | 스펙 검토 — 팀·로그인·동기화(1) + PWA 태블릿 UI(2), 블로킹 질문 정리 | plan-reviewer | - | ✅ `50_plan-reviewer_spec_Phase5_TeamSync.md` — 착수불가(차단5·Q55~59), PWA껍데기만 바로착수가능, 비차단 Q60·Q61은 가정(V7·V8) |
| P5-2A | PWA 껍데기 P1~P6(manifest·SW·persist·버전배너·용량경고·촬영진입) — 차단 질문과 무관, 바로 착수 | builder | P5-1 | ✅ `51_builder_log_Phase5_PWAShell.md` · 커밋 `5750688`·`994b376` · 타입/테스트307/빌드 통과 · 가정 V9~V16 |
| P5-2B | T1-2 — `Defect` 병합필드(updatedAt·deviceId·createdBy) 신설, D23 반영 | builder | D23 | ✅ `52_builder_log_Phase5_DefectMergeFields.md` · 커밋 `64fc3fe`·`28548ca` · 타입/테스트686(canvas379+project307)/빌드 통과 · 가정 W1~W6 |
| P5-2B-R | T1-2 검수 (canvas-core 변경 — 고위험 영역) | code-reviewer | P5-2B | 🟦 |
| P5-2C | T2-2 — 정밀표기(조준 크로스헤어) 구현, D22 반영 | builder | D22 | ✅ `53_builder_log_Phase5_AimCrosshair.md` · 커밋 `d80477a`·`b541cc8` · 타입/테스트686/빌드 통과 · canvas-core 무변경 · 가정 X1~X6 |
| P5-2C-R | T2-2 검수 | code-reviewer | P5-2C | 🟦 |
