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
| P5-2B-R | T1-2 검수 (canvas-core 변경 — 고위험 영역) | code-reviewer | P5-2B | ✅ `54_code-reviewer_findings_Phase5_DefectMergeFields.md` — 통과, 경미1(writeRenormalize now고정) → 리더가 직접 수정 |
| P5-2C | T2-2 — 정밀표기(조준 크로스헤어) 구현, D22 반영 | builder | D22 | ✅ `53_builder_log_Phase5_AimCrosshair.md` · 커밋 `d80477a`·`b541cc8` · 타입/테스트686/빌드 통과 · canvas-core 무변경 · 가정 X1~X6 |
| P5-2C-R | T2-2 검수 | code-reviewer | P5-2C | ✅ `55_code-reviewer_findings_Phase5_AimCrosshair.md` — 통과, 지적사항 없음 |
| P5-Z1 | 중간 통합 판정 (P1~P6, T1-2, T2-2) | 리더 | P5-2B-R, P5-2C-R | ✅ 타입0오류·테스트686(canvas379+project307)통과·빌드통과(sw.js 산출 확인) |

## 다음 배치 (착수 대기)

| # | 작업 | 의존 | 비고 |
|---|---|---|---|
| P5-3 | T2-1·T2-3~T2-7 — 태블릿 셸(방향감지·좌측툴바)·층칩·미니맵·뷰포트영속·안전영역·폼터치프로파일 | T2-2 | 화면이 계속 나오는 트랙, 다음 착수 후보 1순위 |
| P5-4 | T1-3 — 삭제 전파(meta KV 로그, D25) | D25 | ✅ `68_builder_log_Phase5_DeleteLog.md` · 커밋 `af6354e` · 타입/테스트717/빌드 통과 · DB_VERSION 1 유지 · 하드삭제 9경로 전부 배선 |
| P5-4-R | T1-3 검수 (9개 삭제경로 누락 여부 중점) | code-reviewer | P5-4 | ✅ `69_code-reviewer_findings_Phase5_DeleteLog.md` — 통과, 지적사항 없음(기존 고아메모 이슈 별도 기록만) |
| P5-Z2 | T1-1~T1-3 통합 판정 | 리더 | P5-4-R | ✅ 타입0오류·테스트717(canvas392+project325)통과·빌드통과 |
| P5-7 | T1-4~T1-10 — 인증API·동기화API·로그인화면·팀관리화면 | Supabase service_role 키 필요 | ⬜ 대기 (사용자 키 제공 대기 중) |
| P5-5 | T1-1 — Supabase 프로젝트·스키마·RLS | 사용자 계정 연결 완료 | ✅ 스키마 적용 확인(`20260902154516_init.sql`, 커밋 `a8b9079`) · Storage 버킷은 이어서 진행 |
| P5-6 | T1-4~T1-10 — 인증API·동기화API·로그인화면·팀관리화면 | P5-5, Q59 | 서버 골격 이후, Q59 답변도 필요 |

---

# UI 정리 4건 (2026-09-02, 사용자 실사용 확인)

범위 문서: `_workspace/00_input/scope_UIPolish0902.md`

| # | 작업 | 담당 | 의존 | 상태 |
|---|---|---|---|---|
| U1-B | U-1 편집툴바 미구현버튼(표기종류변경·복제·추가) 제거 | builder | - | ✅ `56_builder_log_UI1_ToolbarButtons.md` · 커밋 `3baadcc`(+연장`d0bb816` 우클릭메뉴도) · 타입/빌드 통과 · legend.test.ts 9건 실패는 U3와 무관(U3 진행중 파일공유) |
| U1-B-R | U-1 검수 | code-reviewer | U2-B, U3-B (legend.test 안정화 후) | ⬜ |
| U2-B | U-2 캔버스 토스트 정리(성공확인류 제거, 삭제+경고는 유지) | builder | - | ✅ `57_builder_log_UI2_ToastCleanup.md` · 커밋 `58d35fd`(+연장`d411925` 색상·크기변경 토스트도) · 타입/테스트691(canvas383+project308)/빌드 통과 · toastPolicy.test.ts 신설 |
| U2-B-R | U-2 검수 (canvas-core 다수 변경) | code-reviewer | U2-B | ✅ `59_code-reviewer_findings_UI2_Toast.md` — 통과, 경미1(회귀테스트 커버리지 공백, 필수아님) |
| UZ | UI정리 4건 통합 판정 | 리더 | U1-B, U2-B-R, U3-B-R, U4 | ✅ 타입0오류·테스트691(canvas383+project308)통과·빌드통과 |

## 전체 완료 — UI 정리 4건(편집버튼·팝업·범례·PC태블릿구분배포) 전부 반영됨

---

# 태블릿 1차 화면 나머지 (T2-1·T2-3~T2-7)

범위: `_workspace/50_plan-reviewer_spec_Phase5_TeamSync.md` §6-2

| # | 작업 | 담당 | 의존 | 상태 |
|---|---|---|---|---|
| T2-1-B | 태블릿 셸 — 방향감지·터치프로파일 주입·좌측 세로 툴바 | builder | - | ✅ `61_builder_log_Phase5_TabletShell.md` · 커밋 `6c06141`·`c4ed288` · 타입/테스트700(canvas392+project308)/빌드 통과 |
| T2-5-B | 마지막 뷰포트 영속(`lastView:{projectId}`) | builder | - | ✅ `62_builder_log_Phase5_LastView.md` · 커밋 `9a34101` · 타입/테스트700/빌드 통과 · T2-1과 같은 파일 동시편집을 hunk 단위로 안전 분리 |
| T2-Z1 | 리더 재검증 (T2-1+T2-5 병합 상태) | 리더 | T2-1-B, T2-5-B | ✅ 타입0오류·테스트700(canvas392+project308)통과·빌드통과 — 공유트리 동시편집 후유증 없음 확인 |
| T2-1-R | T2-1+T2-5 검수 | code-reviewer | T2-Z1 | ✅ `63_code-reviewer_findings_*.md` — 통과, 지적사항 없음 |
| T2AB-B | T2-3(층칩)+T2-4(미니맵)+T2-6(안전영역) — 한 builder가 순차로, CanvasRoute.tsx 동시편집 위험 회피 | builder | T2-1-R | ✅ `64_builder_log_Phase5_ChipsMinimapInsets.md` · 커밋 `cc7d267` · 타입/테스트700/빌드 통과 · canvas-core 무변경 |
| T2AB-B-R | T2-3+T2-4+T2-6 검수 | code-reviewer | T2AB-B | ✅ `66_code-reviewer_findings_Phase5_ChipsMinimapInsets.md` — 조건부통과, 보통2·경미1 |
| T2AB-Fix | T2-4 미니맵 세로도면 좌표 어긋남 + T2-6 안전영역 높이 소스 불일치 수정 | builder | T2AB-B-R | ✅ `67_builder_log_Phase5_ChipsMinimapInsetsFix.md` · 커밋 `7efa192` · fitViewport 재사용(canvas-core무변경) + getBoundingClientRect 단일진실소스로 전환 · 타입/테스트700/빌드 통과 |
| T2-Z2 | 태블릿 1차(T2-1~T2-7) 전체 통합 판정 | 리더 | T2AB-B-R, T2-7-B | ✅ 타입0오류·테스트700(canvas392+project308)통과·빌드통과 |

## 전체 완료 — 태블릿 1차 화면 T2-1~T2-7 전부 반영됨 (T2-2는 Phase5 라운드에서 이미 완료)
| T2-7-B | T2-7 — 결함폼 터치프로파일(44pt·가로3열) | builder | T2-1-R | ✅ `65_builder_log_Phase5_DefectFormTouch.md` · 커밋 `b3a21b4` · CSS전용(tsx무변경) · 타입/테스트700/빌드 통과 |
| U3-B-R | U-3 검수 (canvas-core 변경 + DB호환 주장) | code-reviewer | U3-B | ✅ `60_code-reviewer_findings_UI3_Legend.md` — 통과, 지적사항 없음 |
| U3-B | U-3 결함유형범례 제거 + 상태범례 문구 축약(신규/결함/보수완료) | builder | - | ✅ `58_builder_log_UI3_Legend.md` · 커밋 `cea85b1` · 타입/테스트676(canvas368+project308)/빌드 통과 · DB_VERSION 1 유지 · 확인요청2건(라벨 확정, 다이얼로그 체크박스 문구 통일 여부) |
| U4 | PC/태블릿 구분 배포 — 리더 직접 처리 | 리더 | - | ⬜ |

---

# 라운드: UI·동작 개선 (2026-09-03) — 브랜치 `feat/ui-behavior-0903`

요청 원문: `_workspace/00_input/scope_UIBehavior0903.md` · 확정: D27~D30 · 질문: Q63~Q66(답변완료)

> 이 PC 에서는 **코드만** 고친다. 메인 PC 에서 이어받아 진행 예정.

| # | 작업 | 담당 | 상태 |
|---|---|---|---|
| R0 | 브랜치 생성 · 배포주소 기록 · 요청 원문 정리 | 리더 | ✅ 완료 |
| R1 | 차단질문 4건(Q63~Q66) 사용자 확정 → D27~D30 | 리더 | ✅ 완료 |
| R2 | 스펙 확정 · 16건 작업 분해 → `70_plan-reviewer_spec_UIBehavior0903.md` | plan-reviewer | ✅ 완료 |
| R3 | 차단질문 4건(Q68~Q72) 사용자 확정 → D31~D34 | 리더 | ✅ 완료 |
| B1 | C-1 화살표 축척 통일 → `71_builder_log_B1_ArrowScale.md` | builder | ✅ `6e5e420` |
| B2 | C-2 스타일 소스 통일(히트·스냅 어긋남 원인) → `72_...` | builder | ✅ `79e9e09` |
| B3 | P-1 도면 크기 · T-9 미니맵 · T-8 사이드바 리사이즈 → `72_...` | builder | ✅ `5e8a64f` |
| B4 | C-3 면적 · T-1·T-2·T-4·T-5·T-6 태블릿 폼 → `74_...` | 리더 직접 | ✅ `7733c3a` |
| B8 | C-5 말풍선 종류 선택 → `76_...` | 리더 직접 | ✅ `7fed6ef` |
| B9 | T-3 부재 태블릿 노출 플래그 → `77_...` | 리더 직접 | ✅ `5a20d6f` |
| B5 | T-7 사진 최상단 + 추가 타일 → `78_...` | 리더 직접 | ✅ `aed87fb` |
| B6 | P-2 번호풍선 격자 정렬 → `75_...` | 리더 직접 | ✅ `7229486` |
| B7 | C-4 영역선택 + 일괄 삭제·이동 → `79_...` | 리더 직접 | ✅ `069839e`·`a467d81` |
| — | **코드 검수(code-reviewer)** — main 병합 전, 브랜치 커밋 전부(18개) 대상 → `81_code-reviewer_findings_UIBehavior0903_Full.md` | code-reviewer | ✅ **조건부 통과** (심각 0 · 보통 1 · 경미 2) |
| Fix | 검수 지적 반영 — D37 반영 안 된 옛 주석 3곳 정정, 배치로그 B7-d 오기 정정 (죽은 상수는 이미 `@deprecated` 사유 명시돼 있어 그대로 둠) | 리더 직접 | ✅ |
| Z | 통합 판정 — 타입·테스트·빌드 재실행 후 `main` 병합 | 리더 | ✅ |

**16건 판정: 전부 구현 완료 + 실사용 2라운드 반영(D35~D37) + code-reviewer 검수 조건부 통과.**
타입검사 3워크스페이스 0오류 · 단위테스트 **823개 통과**(canvas-core 470 · project-core 353) · 프로덕션 빌드 통과.

---

# 라운드: Phase 5 트랙1 재착수 — 개인 로그인 + 동기화 (2026-09-04)

요청 원문: "로그인, 동기화 기능구현. 우선 실사용테스트를 위한 개인아이디만 구성하고
테스트 후 정식 서버 구현예정이야." 확정: D39·D40(Q75).

**범위:** 개인 계정 1개 로그인(이메일+비번, Supabase 표준) + 프로젝트 단위 [동기화] 버튼(push/pull).
**범위 밖(다음 "정식 서버" 라운드):** 팀원 발급 API, 팀 관리 화면, 합성 이메일(아이디 로그인).

| # | 작업 | 담당 | 상태 |
|---|---|---|---|
| L0 | 차단질문(로그인 방식·service_role 상태) 확정 → D39·D40 | 리더 | ✅ 완료 |
| L1 | Supabase 클라이언트 배선 — `@supabase/supabase-js` 추가, IndexedDB(meta KV) 기반 커스텀 세션 저장소, `autoRefreshToken:false`(오프라인 규칙 §3-4) | builder | ✅ 커밋 `8cc2f64` |
| L2 | 로그인 화면 + 오프라인 로그인 규칙(세션 있으면 건너뜀, 토큰 만료돼도 앱은 정상 동작) | builder | ✅ 커밋 `8cc2f64` — 게이트가 `meta` KV 직접 읽기(U74, getSession 우회) |
| L3 | 동기화 대상 정의 + push(로컬→서버) — Project/Building/Floor/Drawing/Defect/Memo/Photo, blob(render+thumb 전부, source는 정책대로) | builder | ✅ 커밋 `8cc2f64`·`0ed9428`·`02e03b6` |
| L4 | pull(서버→로컬) + LWW 병합(D23, updatedAt null=미동기화) | builder | ✅ 커밋 `8cc2f64`·`0ed9428`·`02e03b6` · `project-core/lww.ts` 정본화 |
| L5 | [동기화] 버튼 UI(프로젝트별) + 진행률·결과·충돌 안내 | builder | ✅ 커밋 `8cc2f64` · `[서버에서 받기]`(D42) 추가 — `0ed9428` |
| L6 | 코드 검수 — RLS 의존 코드·인증 흐름 경계면 집중 | code-reviewer | ✅ `72_code-reviewer_findings_Phase5_PersonalLoginSync.md` 조건부통과(심각4) → 수정(`0ed9428`) → 재검수 `74_...` 조건부통과(보통3) → 수정(`02e03b6`) |
| LZ | 통합 판정 — 타입·테스트·빌드 | 리더 | ✅ 타입0오류(3워크스페이스)·테스트377(canvas+project, lww 7건 포함)·빌드통과(`02e03b6`) |

**16건 판정: L1~L5 구현 완료 + code-reviewer 2라운드(심각4·보통3 전부 해결, D42·D43 반영) + 통합 판정 통과.**
실사용 검증(Supabase 계정 시딩·실제 로그인·두 기기 병합)은 사용자 몫 — `73_builder_log_...md`·
`02e03b6` 커밋 메시지의 확인 체크리스트 참고.

---

# 라운드: 실사용테스트 수정사항 2026-09-07 (6건)

요청 원문: `_workspace/00_input/scope_UserFeedback0907.md`. 확정: D44~D47(Q78·Q80·Q81).
onspect-fix(오류 3건) + 정식 워크플로우(기능요청 2건, D45)로 분리 처리.

| # | 작업 | 담당 | 상태 |
|---|---|---|---|
| F1 | #1 유사결함 도면(층) 필터 | builder(`af4be584d`) | ✅ 커밋 `2cf049b` |
| F2 | #2 캔버스 id UUID화(makeId→newId) | builder(`af4be584d`) | ✅ 커밋 `b78f278` |
| F3 | #3 도면배율 동기화 어긋남 — 원인: `sourceBlobKey` 미동기화 + 배율변경 시 래스터 재구성(rebake) 안 됨. 재구성 경로 신설 | builder(`af4be584d`) | ✅ 커밋 `d626d56` |
| Q78 | 서버 스키마 완화 마이그레이션(records.id uuid→text) — **사용자가 Supabase SQL Editor에서 직접 실행 필요** | builder(`af4be584d`) | ✅ 커밋 `493d96b` · ⬜ 사용자 실행 대기 |
| FZ1 | F1~F3·Q78 통합 판정 | 리더 | ✅ 타입/테스트854(canvas477+project377)/빌드 통과 · 로그 `82_builder_log_UserFeedback0907_Fixes.md` |
| D46 | #5 가져오기 시 같은 용역 감지 → 새로만들기/덮어쓰기 확인창(자동 덮어쓰기 아님) | builder(`a298c75c`) | ✅ 커밋 `e3055e9` |
| D47 | #6 전차 사진 참조조회(복제 없음, 읽기전용) | builder(`a298c75c`) | ✅ 커밋 `34594ec` |
| DZ2 | D46·D47 통합 판정 | 리더 | ✅ 타입3워크스페이스/테스트388(신규11)/빌드 통과 · 커밋 `e3055e9`·`34594ec`·`5f544bd` · 로그 `84_builder_log_UserFeedback0907_B2.md`(확인체크리스트 A1~A13·B1~B12) · 알려진한계 3건(항목설정 덮어쓰기 시 안지움/exportRun 잔존참조/objectURL 태깅) |
| P79 | #4 동별분리 — 스펙 검토·작업분해 → `83_plan-reviewer_spec_BuildingScope0908.md` | plan-reviewer(`a3e115a`) | ✅ 조건부 착수가능(차단없음), Q82~Q87 기록 |
| B79-1a | B-1(출력 기본순서 동그룹정렬)·A-1(도면배율 일괄적용을 이 동으로 좁힘) | builder(`a413c83`)→리더가 마무리 | ✅ 커밋 `6477f7c` · 타입3워크스페이스/테스트(project395+canvas477)/빌드 통과 — builder가 API 한도로 중단된 지점(`DrawingScaleDialog` 연결·테스트 타입오류 2건)을 리더가 직접 고쳐 완결 |
| B79-1b | B-3(조사위치도 동표기)·B-4(손상결함표 섹션제목 동표기)·B-2(층칩 동별그룹)·B-6(이력 동표기) | builder(`a413c83`, 재개) | ✅ 커밋 `cb2b8fd`·로그 `1664891` · 타입3워크스페이스/테스트(project399+canvas477)/빌드 통과 — 리더 재검증 완료 |
| B79-2 | B79-1 통합 판정 · 개발서버 기동(`localhost:5174`) · 종합보고 · 알림 | 리더 | ✅ |
| Z | 6건 전체 종합 보고 + rc(사용자 확인 대기) | 리더 | ✅ "rc"=Remote Control로 확인(미연결), 종합보고 완료 |
| D48/49 | Q83·Q85 — 사용자 "이어서 진행"으로 추천안(A/A) 확정 | 리더 | ✅ DECISIONS.md 기록 |
| B79-3 | B-5(사진첩 동별 섹션+머리말, photoBookHeaderText 주석 갱신)·B-7(층접두어 중복 경고) | builder | ✅ 커밋 `da0154a` |
| B79-4 | B79-3 통합 판정 + 최종 보고 | 리더 | ✅ 타입3워크스페이스/테스트883(project406+canvas477)/빌드 통과 · 개발서버 `localhost:5174` 살아있음 확인 |

**D45 최종: 9개 작업 중 8개 완료(B-1·A-1·B-2·B-3·B-4·B-5·B-6·B-7). B-8은 Q83=A로 범위 밖 확정, 닫힘.**
**2026-09-07 6건 라운드 전체 종료.** 남은 것: Q78 서버 마이그레이션 사용자 수동 실행,
전 항목 실사용 확인(각 로그의 체크리스트).

---

# 라운드: 다인 동기화 데이터 안전성 2026-09-08

요청: "각자 로그인하고 같은 용역, 다른 도면 작업할 경우 동기화시 데이터 유실이 없도록" — 계획수립 단계.

| # | 작업 | 담당 | 상태 |
|---|---|---|---|
| P80 | 현재 sync 설계 진단(`lww.ts`·`sync.ts`·`repo.ts` 직접 확인) + 스펙 작성 | 리더 직접(코드 근거 확보돼 있어 plan-reviewer 위임 생략) | ✅ `86_plan-reviewer_spec_SyncDataSafety0908.md`, Q88~Q90 기록 |
| — | Q88~Q90 답변 — "추천대로 진행해줘"(B/B/A) | 사용자 | ✅ D50·D51·D52 기록 |
| S-3 | 고아 결함 경고 배너 — `orphanDefect.ts::findOrphanDefects`(순수·테스트 6건) + `CanvasRoute.tsx` 로드 시 계산·배너 표시(지우지 않음) | 리더 직접(Agent 미사용 — "요청 없인 스폰하지 말라" 툴 지침) | ✅ 커밋 대기 |
| S-2 | `sync.ts::hasRemoteChanges` + `SyncButton.tsx` "서버에 새 변경 있음" 배지(읽기전용 1건, 규칙0 주석 갱신) | 리더 직접 | ✅ 커밋 대기 |
| S-1 | `relativeTime.ts::isStaleSync`(테스트 3건) + 마지막 동기화 1시간+ 색 강조(표시 자체는 기존 구현 재사용) | 리더 직접 | ✅ 커밋 대기 |
| SZ | S-1~S-3 통합 판정 | 리더 | ✅ 타입3워크스페이스/테스트892(project415+canvas477)/빌드 통과 |

---

# 라운드: 초대코드 가입(B안) 2026-09-08

요청: "우선 현재기준으로 두고 로그인(B초대코드방식)기능 구현 시작해줘." D39(가입 화면 없음)를
뒤집는 라운드 — 스펙·질문·구현을 리더가 직접 진행(Agent 미스폰 — 전 라운드와 같은 이유).

| # | 작업 | 담당 | 상태 |
|---|---|---|---|
| Q91/92 | 발급 방법(SQL수동 vs 앱UI)·재사용 정책(1회용 vs 다회용+만료) — AskUserQuestion | 사용자 | ✅ B(앱UI)·A(다회용+만료) → D54·D55 |
| M1 | 마이그레이션 `20260908000000_invite_codes.sql` — `invite_codes` 테이블·RLS(`is_team_owner()`)·`check_invite_code` RPC·`handle_new_user_invite` 트리거(auth.users, service role 불필요, D40 유지) | 리더 직접 | ✅ 커밋 대기 |
| M2 | `project-core/inviteCode.ts`(`generateInviteCode`·`normalizeInviteCode`, 테스트 5건) | 리더 직접 | ✅ |
| M3 | `session.tsx::signUp` — 사전검사(RPC)+가입+세션즉시반영/이메일확인분기, `describeSignUpError` | 리더 직접 | ✅ |
| M4 | `Login.tsx` — 로그인/가입 모드 토글 + 초대코드 입력란 | 리더 직접 | ✅ |
| M5 | `router.ts`(`TEAM`)·`TeamRoute.tsx`(발급/목록/취소, 팀장 전용 안내)·`App.tsx` 코너 링크 | 리더 직접 | ✅ |
| MZ | 통합 판정 | 리더 | ✅ 타입 3워크스페이스 통과 · 테스트 420(project-core, 신규5)+477(canvas-core) · 프로덕션 빌드 311모듈 통과 · **실 Supabase 프로젝트 연동은 미검증**(이 세션엔 대시보드 접근 없음 — 사용자 실행 필요) |

# 라운드: 로그아웃 기능 2026-09-08

요청: "메인화면에 로그아웃 기능이 없네. 구현이 필요해 로그아웃 생기면 앱 내부에서
회원가입부터 초대코드입력 테스트 진행할게" — D26 뒤집음(D57).

| # | 작업 | 담당 | 상태 |
|---|---|---|---|
| L1 | `supabaseClient.ts::removeSessionItem` export 전환 | 리더 직접 | ✅ |
| L2 | `session.tsx::signOut` — 로컬 세션만 지움, `sb.auth.signOut()` 미호출(오프라인 안전) | 리더 직접 | ✅ |
| L3 | `App.tsx` `.shell__corner` 에 로그아웃 버튼 + 토스트 | 리더 직접 | ✅ |
| L4 | 타입검사·단위테스트·빌드 | 리더 직접 | ✅ 통과(897 테스트) |

Agent 미스폰 — 좁은 변경("요청 없인 스폰하지 말라" 지침 계속 적용).
