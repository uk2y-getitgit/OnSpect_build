# 범위 — S6: 직전 입력 기억

**요청:** 2026-08-24, 사용자 승인 완료. 세부 스펙은 `_workspace/DECISIONS.md` **D9**에 확정.

## 한 줄 요약

`state.defectSeed` (세션 상태, IndexedDB 미저장)를 `SET_DEFECT_ATTRS` 커밋마다 갱신해,
다음에 찍는 새 결함이 직전 값을 이어받게 한다.

## D9 요약 (전문은 DECISIONS.md 참조)

- **이어받는 필드:** `structureType` · `memberId`/`memberName` · `structural` ·
  `defectTypeId`/`defectTypeName` · `sizeMode` · `progress` · `leak` ·
  `causeId`/`causeName` · `repairId`/`repairName`
- **새로 받는 필드(매번 초기화):** `locationNote` · `widthMm` · `lengthMm` · `areaM2` ·
  `areaWMm` · `areaHMm` · `countEa` · `memo`
- **갱신 시점:** `SET_DEFECT_ATTRS` 커맨드 커밋마다 즉시 (완성 여부 무관)
- **리셋 범위:** 용역을 여는 동안 유지, 층 전환에도 유지. 새로고침·용역 나가기(라우트 언마운트)에서만 리셋

## 구현 지점 (이미 확인됨 — 새로 탐색할 필요 없음)

- `apps/web/src/store.ts` — `case 'SET_DEFECT_ATTRS'` (182행 부근): 문서 갱신과 같은 자리에서
  `state.defectSeed` 도 위 "이어받는 필드"만 골라 갱신
- `packages/canvas-core/src/interaction.ts` — 결함 생성 4곳(1441·1499·1567·1714행 부근,
  `...(ctx.defectSeed ?? {})`)은 **변경 없음**, 이미 defectSeed 를 새 결함에 얹는 구조
- `apps/web/src/routes/CanvasRoute.tsx` — 최초 `LOAD` 시 `defectSeed: seedAttrs(s, b.project)` 유지.
  그 뒤 `SET_DEFECT_ATTRS` 가 이를 덮어써 나간다

## plan-reviewer 에게

스펙은 이미 확정됐다. **재검토가 아니라 작업 분해와 함정 확인**이 목적이다. 확인할 것:

1. `state.defectSeed` 타입이 `Partial<DefectAttrs>` 인데, "이어받는 필드"만 골라 갱신할 때
   나머지(새로 받는 필드)를 `undefined`로 지워야 하는지, 아니면 `defectSeed` 자체를
   "이어받는 필드 전용 partial"로 재정의해야 하는지 — 구현 방식의 함정이 있는지 확인
2. Undo/Redo 시 `defectSeed` 도 되돌아가야 하는가, 아니면 세션 진행 방향으로만 앞서가는가
   (Undo 로 결함 값을 되돌려도 "다음 결함"의 시작값은 그대로 최신을 유지하는 것이 자연스러워 보이나
   스펙 D9 는 이 경우를 명시하지 않았다 — 답을 정하고 넘어갈지 질문할지 판단해 달라)
3. 작업을 1~2개 커밋 단위로 쪼갠다 (store.ts 갱신 + 단위테스트)

**차단 여부 판단 기준:** D9 를 뒤집는 질문이면 차단(사용자에게 확인), D9 안에서의 구현 디테일이면
비차단으로 정하고 ASSUMPTIONS.md 에 기록 후 진행.
