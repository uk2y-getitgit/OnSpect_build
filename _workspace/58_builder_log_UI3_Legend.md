# 구현 로그 — U-3 범례 정리 (결함유형 범례 제거 + 상태범례 문구 축약)

스코프: `_workspace/00_input/scope_UIPolish0902.md` §U-3
날짜: 2026-09-02 · builder

---

## 완료

| 작업 | 파일 | 상태 |
|---|---|---|
| `STATUS_LEGEND_LABEL` 문구 교체 (신규 · 결함 · 보수완료) | `packages/canvas-core/src/legend.ts` | ✅ |
| `LegendRow` 타입 · `LegendConfig.rows` · `DEFAULT_LEGEND.rows` 삭제 | `packages/canvas-core/src/legend.ts` | ✅ |
| `legendSymbol()` 삭제 (결함유형 문자 기호 생성기) | `packages/canvas-core/src/legend.ts` | ✅ |
| `legendLayout` — `typeCount` 필드 삭제, 폭·높이 계산을 상태 행만으로 축소 | `packages/canvas-core/src/legend.ts` | ✅ |
| `legendOps` — 결함유형 행 렌더 루프 삭제, 상태 행이 `L.y` 부터 시작 | `packages/canvas-core/src/legend.ts` | ✅ |
| `LG_GROUP_RULE_MUL` 및 블록 경계 굵은 선 삭제 (블록이 하나뿐이라 경계가 없다) | `packages/canvas-core/src/legend.ts` | ✅ |
| `ProjectLegend.showTypes` 필드 삭제 + `projectLegendOf` 정규화에서 제외 | `packages/project-core/src/types.ts` | ✅ |
| `legendRowsFor()` 삭제, `legendConfigFor` 를 상태 행만 만들도록 축소 | `apps/web/src/canvas/pageDecor.ts` | ✅ |
| `showTypes` 체크박스 삭제 + 범례 설명 문구를 "색 \| 설명 2열" 로 정정 | `apps/web/src/routes/TitleBlockDialog.tsx` | ✅ |
| `legendTypes` prop · 결함유형 행 미리보기 문단 삭제 | `apps/web/src/routes/TitleBlockDialog.tsx` | ✅ |
| 호출부 정리 — `legendTypeNames` memo 삭제, `legendSig` 를 상태 집합만으로 축소 | `apps/web/src/routes/CanvasRoute.tsx` | ✅ |
| 호출부 정리 — `legendTypesOf()` 헬퍼 삭제 | `apps/web/src/routes/ProjectSetup.tsx` | ✅ |
| 테스트 개편 — 결함유형 행 케이스 제거, 상태 전용 범례 케이스로 재작성 | `packages/canvas-core/test/legend.test.ts` | ✅ |
| 테스트 — `showTypes` 단정 제거 + "옛 레코드의 showTypes 는 읽는 순간 사라진다" 신설 | `packages/project-core/test/projectDecor.test.ts` | ✅ |

**손대지 않은 것 (지시대로):**
`apps/web/src/routes/settings/DefectTypeColumn.tsx` — 결함유형 설정의 기호 입력칸. 한 글자도 안 바꿨다.
Sidebar · Inspector · 출력 옵션 패널의 상태 문구도 그대로 두었다.

---

## `DB_VERSION` 판단 — 필드를 지우되 마이그레이션은 0건

지시대로 **`DB_VERSION` 은 1 그대로**다. 확인한 근거:

`ProjectLegend` 는 `Project.legend` 안에 통째로 들어가는 **값 객체**이지 IndexedDB 스토어·인덱스가
아니다. 그래서 필드 삭제가 스키마를 건드리지 않는다. 유일한 진입로가
`projectLegendOf(project.legend)` 하나뿐이라(호출부 3곳: `pageDecor.legendConfigFor` ·
`TitleBlockDialog` 초기 state · `projectDecor.promoteProjectDecor`), 옛 레코드에 `showTypes: true`
가 남아 있어도 **읽는 순간 결과 객체에서 떨어진다.** 저장 레코드는 손대지 않고, 사용자가 다음에
[저장] 을 누르는 시점에 자연히 없는 채로 덮어써진다.

→ "필드는 남기고 무시" 대신 **"타입에서는 지우고 읽기 시점에 흘려버린다"** 를 골랐다.
타입에 남겨두면 아무도 안 읽는 필드를 체크박스 없이 유지하게 되어, 다음 사람이
"이건 왜 있지" 를 다시 묻는다. 회귀 테스트로 못을 박아 뒀다
(`projectDecor.test.ts` — "옛 레코드에 남은 showTypes 는 읽는 순간 사라진다").

---

## 미완료 / 막힌 것

없음.

---

## 검증한 것

| 항목 | 결과 |
|---|---|
| `npm run typecheck` (canvas-core · project-core · web) | ✅ 통과. 세 패키지 모두 `noUnusedLocals: true` 라 **삭제 후 남은 죽은 import·지역변수가 0** 임이 같이 증명된다 |
| `npm test` | ✅ canvas-core **368** 통과 (21 파일) · project-core **308** 통과 (15 파일). 실패 0 |
| `npm run build` (vite 프로덕션) | ✅ 12.57s, 243 모듈. 청크 500kB 경고는 이번 변경 이전부터 있던 것 |
| 잔여 참조 전수 검색 | ✅ `showTypes` · `legendSymbol` · `LegendRow` · `legendRowsFor` · `legendTypes` · `typeCount` · `LG_GROUP_RULE_MUL` — 소스에 남은 참조 없음 (`projectDecor.test.ts` 의 회귀 테스트 1건 제외) |
| CSS 영향 | ✅ `.tbset__checks` 는 `display:flex; flex-wrap:wrap` — 체크박스 4개→3개에 CSS 수정 불필요 |

**미검증(코드로 확인 불가):** 실제 캔버스에 그려진 범례의 시각적 결과.

---

## 직접 확인해주실 것

1. **범례 문구** → 도면 화면에서 [도곽·범례 설정] 을 열고 상태 3종을 모두 켠 뒤,
   해당 상태의 결함이 있는 도면을 본다 → 범례 행이 `● 신규` / `● 결함` / `● 보수완료`
   세 줄로만 나와야 정상. **"균" "박" 같은 문자 기호 행이 하나도 없어야 한다.**
2. **다이얼로그** → [도곽·범례 설정] 안에 **"결함유형" 체크박스가 없어야** 하고,
   맨 아래 "지금 표시될 행 N개: …" 문단도 사라져 있어야 정상.
3. **빈 범례** → 상태 3종을 전부 끄면 (또는 그 상태의 결함이 도면에 없으면)
   **빈 상자가 남지 않고 범례 자체가 안 그려져야** 정상.
4. **기존 용역 열기** → 예전에 결함유형 범례를 켜 두고 저장했던 용역을 연다 →
   오류 없이 열리고, 결함유형 행 없이 상태 행만 나와야 정상 (DB 재설치 불필요).
5. **조사위치도 출력** → 출력 옵션에서 범례 ON 으로 조사위치도를 뽑는다 →
   화면에서 본 것과 같은 상태 행만 인쇄돼야 정상.

---

## 사용자 재확인이 필요한 결정 (스코프 문서가 "최종 보고에 다시 확인받을 것" 이라 명시)

**색 ↔ 문구 매핑을 리더가 정한 표 그대로 넣었다:**

| 상태 | 색 | 범례 문구 |
|---|---|---|
| `CURRENT` | 빨강 | **신규** |
| `PREV_PENDING` | 보라 | **결함** |
| `REPAIRED` | 회색 | **보수완료** |

`PREV_PENDING` 을 **"결함"** 이라고 부르는 것이 의도한 표현이 맞는지 확인 부탁드립니다.
(내부값은 "전회차 미보수" 이고, 다른 화면들은 여전히 "미보수(전회차)" 라고 부릅니다.)

---

## 알려진 한계 · 보고만 하고 고치지 않은 것

1. **범례와 다른 화면의 문구가 갈라졌다.** 범례는 "신규 / 결함 / 보수완료", 상태 셀렉터·사이드바·
   출력 옵션은 여전히 "신규(현회차) / 미보수(전회차) / 보수완료" 다.
   지시 4번(범례 한정)에 따라 **의도적으로 두었다.** `legend.ts` 의 `STATUS_LEGEND_LABEL` 주석에
   "일부러 다르다" 는 이유를 적어 뒀다 — 나중에 누가 "동기화가 깨졌다" 며 되돌리지 않도록.
2. **`TitleBlockDialog` 의 상태 체크박스 라벨은 그대로 "신규(현회차)"** 다.
   범례 설정 화면이므로 함께 줄일지 애매했으나, 스코프 문서가 그 다이얼로그에서 지목한 대상은
   `showTypes` 체크박스 하나뿐이라 **손대지 않았다.** 줄이길 원하시면 알려주세요 (1줄 수정).
3. **결함유형의 "기호" 설정값이 죽은 코드가 되었다.** 지시 3번대로 `DefectTypeColumn.tsx` 는
   그대로 두었다. 이제 그 값을 읽는 곳이 없다 — 나중에 다시 쓸 수 있게 남겨 둔 상태다.
4. **옛 저장 레코드의 `showTypes` 키는 물리적으로 남아 있다.** 읽기 시점에 무시되므로 동작에
   영향은 없고, 다음 저장 때 자연 소멸한다. 일괄 정리는 하지 않았다(마이그레이션 0건 유지).
