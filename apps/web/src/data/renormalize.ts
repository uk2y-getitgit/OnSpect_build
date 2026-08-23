/**
 * F1 — `[A4로 맞추기]` 배선. **두 코어를 잇는 자리**(D13).
 *
 * 계수 뽑기는 `project-core/a4.ts::a4Transform`(A4 배치를 아는 쪽),
 * 좌표 적용은 `canvas-core/renormalize.ts`(결함·메모 모양을 아는 쪽)가 한다.
 * 이 파일은 둘을 잇고 "이 도면에 속한 것만" 골라내는 일만 한다.
 *
 * ⚠️ 실사용자 데이터의 좌표를 바꾸는 조작이라 호출부(ProjectSetup)가
 * (1) 건수 확인 다이얼로그 (2) 되돌리기 스냅샷 (3) 이미 A4 면 아무것도 하지 않기
 * 를 반드시 지킨다.
 */
import { transformDefect, transformMemo, type Defect, type Memo } from '@onspect/canvas-core';
import { a4Transform, type ImgLayout } from '@onspect/project-core';

export type RenormalizeCounts = { defects: number; marks: number; sketches: number; memos: number };

/** 이 도면에서 바뀔 것들의 건수 — 확인 다이얼로그가 그대로 보여준다 */
export function countRenormalizeTargets(
  drawingId: string,
  defects: readonly Defect[],
  memos: readonly Memo[],
): RenormalizeCounts {
  const ds = defects.filter((d) => d.drawingId === drawingId);
  return {
    defects: ds.length,
    marks: ds.reduce((n, d) => n + d.marks.length, 0),
    sketches: ds.reduce((n, d) => n + (d.sketch?.length ?? 0), 0),
    memos: memos.filter((m) => m.drawingId === drawingId).length,
  };
}

export type RenormalizeResult = { defects: Defect[]; memos: Memo[] };

/** 그 도면에 속한 결함·메모만 골라 한꺼번에 변환한다 */
export function renormalizeAll(
  drawingId: string,
  layout: ImgLayout,
  defects: readonly Defect[],
  memos: readonly Memo[],
): RenormalizeResult {
  const t = a4Transform(layout);
  return {
    defects: defects.filter((d) => d.drawingId === drawingId).map((d) => transformDefect(d, t)),
    memos: memos.filter((m) => m.drawingId === drawingId).map((m) => transformMemo(m, t)),
  };
}
