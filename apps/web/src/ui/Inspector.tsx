/**
 * 우측 결함정보 패널 — 표기를 선택하면 뜬다 (§2-5).
 *
 * ⚠️ Phase 3 범위는 **도면 캔버스**다. 결함 속성 입력 폼(부재·결함유형 선택 등)은
 * Phase 2 조사입력의 영역이므로 여기서는 **읽기 전용 표시 + 캔버스 관련 조작**만 둔다.
 * (Q9 — 비차단으로 질문해 두었고 ASSUMPTIONS 에 기록했다)
 */
import { forwardRef } from 'react';
import { describeMissing, isIncomplete, isLocked, type Defect } from '@onspect/canvas-core';

const STATUS_LABEL: Record<Defect['status'], string> = {
  CURRENT: '현회차',
  PREV_PENDING: '전회차 미보수',
  REPAIRED: '보수완료',
};

export type InspectorProps = {
  defect: Defect | null;
  onResetLabel: () => void;
  onDelete: () => void;
};

export const Inspector = forwardRef<HTMLDivElement, InspectorProps>(function Inspector(
  { defect, onResetLabel, onDelete },
  ref,
) {
  if (!defect) {
    return (
      <aside className="inspector" aria-label="결함 정보">
        <div className="empty empty--center">
          <p className="empty__title">선택된 표기가 없습니다</p>
          <p className="empty__body">
            도면에서 번호 풍선이나 점을 클릭하면 이 자리에 결함 정보가 표시됩니다.
          </p>
        </div>
      </aside>
    );
  }

  const locked = isLocked(defect);
  const incomplete = isIncomplete(defect);

  return (
    <aside className="inspector" aria-label="결함 정보">
      <div className="inspector__head" tabIndex={-1} ref={ref}>
        <span className="inspector__seq num" data-status={defect.status}>
          {defect.seq}
        </span>
        <div className="inspector__titles">
          <h2 className="inspector__title">{defect.memberName ?? '부재 미입력'}</h2>
          <p className="inspector__sub">{defect.defectTypeName ?? '결함유형 미입력'}</p>
        </div>
        <span className="chip chip--status" data-status={defect.status}>
          {STATUS_LABEL[defect.status]}
        </span>
      </div>

      {incomplete && (
        <p className="notice notice--warn" role="status">
          미완성 결함입니다 — {describeMissing(defect)}
        </p>
      )}
      {locked && (
        <p className="notice" role="status">
          전회차 표기입니다. 이 화면에서는 <b>선택만</b> 가능하며 이동·삭제할 수 없습니다.
        </p>
      )}

      <dl className="kv">
        <div className="kv__row">
          <dt>폭</dt>
          <dd className="num">{fmt(defect.widthMm, 'mm')}</dd>
        </div>
        <div className="kv__row">
          <dt>길이</dt>
          <dd className="num">{fmt(defect.lengthMm, 'mm')}</dd>
        </div>
        <div className="kv__row">
          <dt>면적</dt>
          <dd className="num">{fmt(defect.areaM2, '㎡')}</dd>
        </div>
        <div className="kv__row">
          <dt>개소</dt>
          <dd className="num">{fmt(defect.countEa, 'EA')}</dd>
        </div>
      </dl>

      {defect.memo && (
        <>
          <h3 className="inspector__section">메모</h3>
          <p className="memo">{defect.memo}</p>
        </>
      )}

      <div className="inspector__actions">
        <button
          type="button"
          className="btn"
          onClick={onResetLabel}
          disabled={locked || !defect.label.placed}
          title={
            locked
              ? '전회차 표기는 변경할 수 없습니다'
              : defect.label.placed
                ? '번호 풍선을 자동 배치 위치로 되돌립니다'
                : '이미 자동 배치 상태입니다'
          }
        >
          번호 위치 초기화
        </button>
        <button
          type="button"
          className="btn btn--danger"
          onClick={onDelete}
          disabled={locked}
          title={locked ? '전회차 표기는 삭제할 수 없습니다' : '이 결함을 삭제합니다 (Delete)'}
        >
          결함 삭제
        </button>
      </div>
    </aside>
  );
});

function fmt(v: number | null, unit: string): string {
  if (v === null || v === undefined) return '—';
  return `${v} ${unit}`;
}
