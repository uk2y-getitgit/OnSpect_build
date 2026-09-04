/**
 * 출력 이력 · 재현성 — Phase 4 스펙 §3-3 · §4-1 하단.
 *
 * ⭐ **`[같은 번호로 다시 받기]` 는 번호를 다시 계산하지 않는다.**
 *    저장된 `mapping` 을 그대로 쓴다. 다시 계산하면 그 사이 결함이 하나만 늘어도
 *    **다른 보고서**가 나오고, 발주처에 이미 낸 문서와 어긋난다.
 *
 * ⭐ 그 사이 데이터가 바뀌었으면 **막지 않고 알린다** — `diffExportRun()` 이 재료다.
 *    `mapping` 에 없는 새 결함은 이번 재다운로드에서 빠지고,
 *    사라진 결함은 건너뛴다. 사용자는 `[지금 데이터로 새로 뽑기]` 로 갈아탈 수 있다.
 */
import {
  ARTIFACT_LABEL,
  diffExportRun,
  type ExportArtifactKind,
  type ExportRun,
} from '@onspect/project-core';

export type RunHistoryProps = {
  runs: readonly ExportRun[];
  /**
   * 방금 `[생성]`으로 막 만든 이력의 id. 2026-09-04 — 처음 만들 때는 자동 다운로드하지
   * 않으므로, 그 줄의 버튼만 "파일 받기"로 보여준다(다른 줄은 "같은 번호로 다시 받기").
   */
  lastRunId: string | null;
  /**
   * ⭐ **이력마다 따로 물어본다** — `지금 그 이력의 조건이면 대상이 되었을 결함 id`.
   *
   * `run.mapping` 에는 **그 출력의 필터를 통과한 결함만** 들어 있다. 비교 대상을
   * `bundle.defects` 전체로 잡으면 층 선택·상태 필터·조사구분으로 빠진 결함이 전부
   * `added` 로 세어져, **데이터를 하나도 안 건드려도 경고가 뜬다**(검수 보통 1).
   * 그러면 사용자가 이 경고를 무시하게 되고, **진짜 결함이 추가됐을 때도 못 본다.**
   */
  currentIdsFor: (run: ExportRun) => readonly string[];
  busyRunId: string | null;
  onRedownload: (run: ExportRun) => void;
  onPrint: (run: ExportRun, kind: ExportArtifactKind) => void;
  /** 이 이력의 파라미터를 화면에 되살린다 (그 뒤 사용자가 `[생성]` 을 누른다) */
  onReuseParams: (run: ExportRun) => void;
  onDelete: (run: ExportRun) => void;
};

/** 인쇄 뷰가 있는 산출물. 손상결함표는 PhotoPolish §2-9 로 추가됐다 (A4 가로) */
const PRINTABLE: readonly ExportArtifactKind[] = [
  'DAMAGE_TABLE',
  'DEFECT_LIST',
  'PHOTO_BOOK',
  'LOCATION_MAP',
];

export function RunHistory({
  runs,
  lastRunId,
  currentIdsFor,
  busyRunId,
  onRedownload,
  onPrint,
  onReuseParams,
  onDelete,
}: RunHistoryProps) {
  if (runs.length === 0) {
    return (
      <p className="xp-empty">
        아직 출력한 기록이 없습니다. <b>[생성]</b> 을 누르면 그때 매긴 번호가 여기 남고,
        나중에 <b>같은 번호로</b> 다시 받을 수 있습니다.
      </p>
    );
  }

  return (
    <ul className="xp-runs">
      {runs.map((run) => {
        // 그 이력의 파라미터로 다시 거른 현재 결함과 비교한다 — 필터로 빠진 결함이 섞이지 않는다
        const drift = diffExportRun(run, currentIdsFor(run));
        const changed = drift.added.length > 0 || drift.removed.length > 0;
        const busy = busyRunId === run.id;
        return (
          <li className="xp-run" key={run.id}>
            <div className="xp-run__main">
              <span className="xp-run__at">{formatStamp(run.createdAt)}</span>
              <span className="xp-run__meta">
                <span className="num">{run.defectCount}</span>건 ·{' '}
                {run.params.mode === 'PER_FLOOR' ? '층별 1번부터' : '전체 이어서'} ·{' '}
                {run.floorRanges.length}개 층
              </span>
              {run.artifacts.length > 0 && (
                <span className="xp-run__kinds">
                  {[...new Set(run.artifacts.map((a) => a.kind))]
                    .map((k) => ARTIFACT_LABEL[k])
                    .join(' · ')}
                </span>
              )}
            </div>

            {changed && (
              <p className="xp-run__drift" role="status">
                이 출력 이후 결함이{' '}
                {drift.added.length > 0 && (
                  <>
                    <b>{drift.added.length}건 추가</b>
                    {drift.removed.length > 0 && ' · '}
                  </>
                )}
                {drift.removed.length > 0 && <b>{drift.removed.length}건 삭제</b>}
                되었습니다 · <b>번호는 그때 그대로</b> 나갑니다
              </p>
            )}

            <div className="xp-run__actions">
              <button
                type="button"
                className="btn btn--small"
                disabled={busy}
                title="그때 매긴 번호를 그대로 써서 엑셀·PNG 를 내려받습니다 (재계산하지 않습니다)"
                onClick={() => onRedownload(run)}
              >
                {busy ? '만드는 중…' : run.id === lastRunId ? '파일 받기' : '같은 번호로 다시 받기'}
              </button>
              {PRINTABLE.map((k) => (
                <button
                  key={k}
                  type="button"
                  className="btn btn--small btn--ghost"
                  title={`${ARTIFACT_LABEL[k]} 인쇄 뷰를 새 탭으로 엽니다 — 인쇄 대화상자에서 "PDF로 저장"`}
                  onClick={() => onPrint(run, k)}
                >
                  {ARTIFACT_LABEL[k]} PDF
                </button>
              ))}
              <span className="xp-run__spacer" />
              <button
                type="button"
                className="btn btn--small btn--ghost"
                title="이 이력의 옵션을 화면에 되살립니다. 번호는 [생성] 할 때 지금 데이터로 새로 매겨집니다"
                onClick={() => onReuseParams(run)}
              >
                지금 데이터로 새로 뽑기
              </button>
              <button
                type="button"
                className="btn btn--small btn--ghost"
                title="이 이력을 지웁니다. 이미 내려받은 파일은 그대로 남습니다"
                onClick={() => onDelete(run)}
              >
                이력 삭제
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** `08-25 14:02` — 이력 목록의 표기 (§4-1) */
function formatStamp(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
