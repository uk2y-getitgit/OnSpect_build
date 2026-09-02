# 구현 로그 — T2-7 결함정보 입력 폼 터치 프로파일 (44pt · 프리셋 가로 3열)

범위: `_workspace/50_plan-reviewer_spec_Phase5_TeamSync.md` §6-2 표의 **T2-7 만.**
방식: 리더 지시대로 **CSS 전용** — `ui/defectForm/*` 컴포넌트 파일은 전혀 수정하지 않았다.

## 완료

| 작업 | 파일 | 상태 |
|---|---|---|
| `.idf` 스코프 태블릿 터치 프로파일 — 버튼·입력요소 44pt | `apps/web/src/styles.css` (파일 끝에 신규 절 추가) | 완료 |
| NumberField 프리셋 그리드(`.idf-presetgrid`) 가로 3열 고정 | 〃 | 완료 |

### 구현 방식

`.app[data-shell^='tablet'] .idf { --btn-h: 44px; }` 로 `--btn-h` 변수를 `.idf`
(DefectInfoForm 루트) 안에서만 재선언 — 기존 `U-4`·`T2-1` 절이 쓴 것과 같은 수법이다.
`.btn`·`.iconbtn`·`.input` **기본** 규칙은 이 변수를 그대로 참조하므로 자동으로 44px 가 된다.

다만 `--small`/`--tiny`/`--num` 류 변형은 고정 높이를 하드코딩해 변수를 안 타므로
`.idf` 로 스코프해 개별로 덮어썼다:

| 대상 | PC 값 | 태블릿 값 | 쓰이는 곳 |
|---|---|---|---|
| `.idf .btn--small`, `.idf .btn--tiny` | 26px / 22px | 44px | ChoiceGrid `변경/선택`·`더보기 N`, `가로×세로로 계산` 토글 |
| `.idf .iconbtn--small` | 24×24 | 44×44 | NumberField 스테퍼 −/+ |
| `.idf .input--small` | 26px | 44px | 위치보조 입력, 스테퍼 숫자입력 |
| `.idf .segmented__item` | 26px | 44px | 조사구분·구조유형·구조체여부·진행여부·누수여부·규모모드 |
| `.idf .idf-choice` | min 32px | min 44px | ChoiceGrid 옵션(부재·결함유형·발생원인·보수방안) |
| `.idf .idf-preset` | 28px | 44px | NumberField 프리셋(폭·길이·개소·면적·가로·세로) |
| `.idf .idf-presetgrid` | `repeat(auto-fill, minmax(56px,1fr))`(패널에서는 48px) | `repeat(3, 1fr)` 고정 | 위와 동일 |

`유사결함 불러오기`(`.btn.btn--full`)·메모 `textarea`(`.idf-memo`, 별도 modifier 없이
`.input` 기본을 그대로 씀)는 `--btn-h` 재선언만으로 44px 가 됐다 — 별도 규칙 불필요.

**스코프 안전장치:**
- 전부 `.idf` 조상 아래에만 걸었다. `.segmented__item`·`.btn--small`·`.idf-choice` 같은
  클래스는 설정 화면 등 다른 곳도 쓰므로, `.idf` 없이 걸었으면 그쪽까지 커졌을 것이다.
- `.app[data-shell^='tablet']` 이 안 찍히면(PC, 또는 강제전환 스크립트가 실패한 실기기)
  이 절 전체가 매칭되지 않는다 — PC 는 완전히 불변이다.
- `.idf .idf-presetgrid` 는 새 선택자 특이도(속성 1 + 클래스 3)가 기존
  `.inspector .idf-presetgrid`(클래스 2)보다 높아, 파일 내 위치(끝부분)와 무관하게
  항상 이긴다 — 우측 인스펙터 패널의 좁은-폭 대응 규칙과 절대 충돌하지 않는다.
- `.idf-preset--over`(`0.5 초과 → 직접입력`)의 `grid-column: span 2` 는 그대로 둬 3열
  안에서도 유효하다 — 별도 처리 불필요.

## 미완료 / 막힌 것

없음. 스펙 T2-7 요구사항(44pt 터치 타깃 · 프리셋 가로 3열, CSS 전용) 전부 반영했다.

## 검증한 것

- `npm run typecheck` — 3개 패키지(canvas-core·project-core·web) 전부 통과
- `npm test` — canvas-core 392개 · project-core 308개, 총 700개 전부 통과 (CSS 전용
  변경이라 새 단위 테스트는 추가하지 않았다 — 대상 로직이 없다)
- `npm run build -w @onspect/web` — 프로덕션 빌드 성공 (기존에도 있던 청크 크기 경고
  1건은 이번 변경과 무관)
- 코드 점검: `ui/defectForm/*.tsx` 5개 파일 **전혀 수정하지 않음**을 diff로 확인 —
  store·repo·캔버스 import 경계 규칙을 어길 여지가 구조적으로 없다
- 선택자 특이도 계산으로 `.inspector .idf-presetgrid`(좁은 패널 대응, 기존)와
  충돌하지 않음을 확인 (본문 "구현 방식" 절 참조)
- `.app[data-shell^='tablet']` 게이트가 없으면 이번 절이 전혀 매칭되지 않음을 선택자
  구조로 확인 — PC 레이아웃 불변

## 직접 확인해주실 것

- [ ] 태블릿(가로: 우측 사이드시트 / 세로: 바텀시트) 에서 결함정보 폼을 열고, `변경`·
      `더보기`·부재/결함유형 버튼·스테퍼 −/+·세그먼트 버튼을 눌러 손가락으로 정확히
      짚히는지 (44pt 확보 체감)
- [ ] 폭·길이·개소·면적(가로×세로 보조 포함) 프리셋 버튼이 **가로 3열**로 나오는지,
      `0.5 초과 → 직접입력`(2칸 폭) 버튼이 3열 안에서 자연스럽게 배치되는지
- [ ] PC 화면에서 결함정보 폼이 기존과 완전히 동일하게 보이는지 (버튼 크기·그리드
      열 수 변화 없음)
- [ ] 태블릿 세로(바텀시트) HALF/PEEK 스냅에서도 44pt 버튼들이 시트 안에서 잘리지
      않고 스크롤로 접근되는지

## 알려진 한계

- `.btn--tiny`(ChoiceGrid `더보기 N`)도 44px 로 키웠다 — 스펙 문구("버튼·입력요소를
  …최소 44pt 터치 타겟으로")를 문자 그대로 따른 것이다. 다만 이 버튼은 목록을
  펼치는 보조 버튼이라 44pt 로 커지면 시각적으로 다소 크게 느껴질 수 있다.
  작아도 된다는 지시가 있으면 `.idf .btn--tiny` 규칙 한 줄만 빼면 된다.
- ChoiceGrid 옵션 그리드(`.idf-grid` — 부재·결함유형 등 텍스트 버튼)는 열 수를
  건드리지 않았다 — 스펙이 "프리셋 버튼류(균열폭 등 **단일값** 버튼)"로 대상을
  한정했다고 판단해서다(NumberField 의 `.idf-presetgrid` 만 해당). 텍스트 버튼도
  3열로 고정해야 한다면 별도 지시 바란다.
