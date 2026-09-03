# 구현 로그 — 배치 B1 · C-1 화살표 축척 통일 (2026-09-03)

브랜치 `feat/ui-behavior-0903`. 스펙 `70_plan-reviewer_spec_UIBehavior0903.md` §C-1.
Q67 은 **B안**(전체 길이 50% 상한 + `shapes.ts` 클램프는 안전장치로 존치)으로 진행 — U48 대로다.

## 무엇이 원인이었나

`arrowHeadPolygon` / `arrowShaftEnd` 는 넘겨받은 `from→to` **한 구간**만 보고
`Math.min(head, len*0.5)` 로 촉을 깎는다. 화살표는 `points[0]`=촉 · `points[1]`=다음 꺾임점이라
호출부(`renderModel.arrowOps`)가 `from=next, to=tip` 으로 넘긴다 →
**그 한 구간이 곧 "머리쪽 첫 지시선"** 이다. 첫 구간이 `22 × zoom × 2` px 보다 짧으면 촉이 반토막 났다.
촉 길이 자체(`arrowHead 22 이미지 px × zoom`)는 원래부터 축척 고정이었다.

## 완료

| 작업 | 파일 | 상태 |
|---|---|---|
| `ARROW_HEAD_MAX_RATIO = 0.5` 신설 | `packages/canvas-core/src/constants.ts` | 완료 |
| `polylineLength()` — 폴리라인 전 구간 길이 합(스크린 px) | `packages/canvas-core/src/shapes.ts` | 완료 |
| `resolveArrowHead(points, head, ratio?)` — 전체 길이 상한 + 첫 구간 클램프를 무력화하는 기준점(`ref`) | `packages/canvas-core/src/shapes.ts` | 완료 |
| `arrowOps` 가 `resolveArrowHead` 로 촉을 확정하고 `from=ref` 로 넘김 | `packages/canvas-core/src/renderModel.ts` | 완료 |
| 촉이 첫 구간을 덮을 때 몸통 첫 선 생략(U54) | `packages/canvas-core/src/renderModel.ts` | 완료 |
| 회귀 테스트 8개 | `packages/canvas-core/test/arrowHeadScale.test.ts` | 완료 |

`shapes.ts` 의 `Math.min(head, len*0.5)` 는 **두 곳 다 그대로 두었다**(U48). 다른 호출부의 안전장치다.
`interaction.ts` 는 **건드리지 않았다** — 이유는 U53.

## 왜 "전체 길이 상한"만으로는 부족했나 (설계 메모)

상한만 `total × 0.5` 로 낮춰도, 그 뒤 `shapes.ts` 안에서 다시 `첫 구간 × 0.5` 로 깎이므로
증상이 그대로 남는다. 그래서 `resolveArrowHead` 가 **방향은 같고 거리만 `head × 2` 이상으로 뒤로 물린
가상 기준점 `ref`** 를 함께 돌려준다. `arrowHeadPolygon`/`arrowShaftEnd` 는 `from` 을 방향과 길이에만
쓰므로, `ref` 를 주면 내부 클램프가 **물지 않는 상태로 통과**한다. 함수는 한 글자도 안 바뀌었다.

## 미완료 / 막힌 것

없음.

## 검증한 것

- `npm run typecheck -w @onspect/canvas-core` — 통과
- `npm run test -w @onspect/canvas-core` — **24 파일 400 테스트 통과** (신규 8 포함, 기존 392 무회귀)
- `canvas-core` 금지 참조(`window`/`document`/`Image`/rAF/React) 없음 — 순수 함수만 추가
- 기하 판정은 전부 스크린 px. 테스트 도면도 1000×1000 정사각으로 두어 종횡비 왜곡을 배제
- **미검증:** 실제 화면 렌더(브라우저를 띄우지 않았다), PDF/조사위치도 출력 렌더의 육안 결과

## 직접 확인해주실 것

1. **꺾은 화살표 — 첫 지시선을 아주 짧게 잡고 꺾어 그린다**
   → 촉 크기가 길게 그린 화살표와 **똑같아야** 정상. (예전엔 작아졌다)
2. **드래그 중 vs 손을 뗀 뒤** — 그리는 도중 미리보기의 촉 크기와, 손을 뗀 뒤 확정된 촉 크기가
   **같아야** 정상. ("그릴 땐 컸는데 놓으니 작아진다" 가 없어야 한다)
3. **줌 인/아웃** — 촉이 도면과 같은 비율로 커지고 작아져야 정상(화면 고정 크기가 아니다).
4. **아주 짧은 화살표**(전체 길이가 촉의 2배 미만) — 촉이 몸통 절반까지만 줄어드는 건 **의도**다(Q67 B).
5. **조사위치도 출력** — 캔버스에서 본 화살촉 크기가 출력물에서도 같아야 정상(같은 렌더 경로를 쓴다).

## 알려진 한계

- 전체 길이가 촉의 2배 미만인 아주 짧은 화살표에서는 여전히 촉이 줄어든다 — Q67 B안의 의도다.
  Q67 답이 **A** 로 오면 `shapes.ts` 의 클램프 두 줄을 지우면 된다(비용 0).
- 이번 수정은 촉 **길이**만 다룬다. 촉 **각도**(`half = h × 0.38`)는 손대지 않았다.

## 범위 밖에서 눈에 띈 것 (고치지 않았다)

- `interaction.ts:326` 의 고스트 `head` 는 결국 `arrowOps` 로 다시 들어가는데,
  거기서 `Math.max(6, st.arrowHead * zoom)` 을 한 번 더 적용한다(zoom=1이라 값은 같다).
  즉 고스트 경로는 "이미 스크린 px 인 값을 다시 스타일처럼 취급"하는 우회 배선이다. 동작은 맞다.
- ASSUMPTIONS.md 에 이미 적힌 ③ `labelScale` 이 `arrowHead` 에 안 걸리는 문제는 그대로다(범위 밖).
