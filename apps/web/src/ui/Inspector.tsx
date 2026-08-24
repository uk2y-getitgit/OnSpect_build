/**
 * 우측 결함정보 패널 — 표기를 선택하면 뜬다 (§2-5).
 *
 * **S2b**: 읽기 전용 표시였던 자리에 `DefectInfoForm` 을 끼웠다.
 * 이제 캔버스에서 결함을 고르면 그 자리에서 부재·결함유형·규모·원인·보수방안을 입력한다.
 *
 * 경계(스펙 §2-6 · §4-2)는 그대로다 — 폼에는 **`DefectAttrs` 만** 넘긴다.
 * `marks`·`label`·`style` 은 폼이 볼 수 없고, 저장·커맨드는 이 컴포넌트가 아니라
 * 호출자(`CanvasRoute` → `store`)가 한다. 이 패널은 값을 받아 올릴 뿐이다.
 */
import { forwardRef, type ReactNode } from 'react';
import {
  attrsOf,
  describeMissing,
  isIncomplete,
  isLocked,
  type Defect,
  type DefectAttrs,
} from '@onspect/canvas-core';
import type { ItemSettings } from '@onspect/project-core';
import { DefectInfoForm } from './defectForm/DefectInfoForm';

const STATUS_LABEL: Record<Defect['status'], string> = {
  CURRENT: '현회차',
  PREV_PENDING: '전회차 미보수',
  REPAIRED: '보수완료',
};

export type InspectorProps = {
  defect: Defect | null;
  /**
   * **이 용역의 설정 스냅샷** (D6). 전역(ORG) 설정이 아니다.
   * 아직 못 읽었거나(로딩) 저장소를 못 쓰면 null — 그때는 읽기 전용으로 물러난다.
   */
  settings: ItemSettings | null;
  /** 저장 대기 중인 변경이 있는가. 패널 하단 저장 표시에 쓴다 */
  saving: boolean;
  /**
   * S5 사진 섹션 (`ui/photos/PhotoSection`).
   *
   * ⚠️ 여기서 직접 렌더하지 않고 **호출자가 만든 노드를 받는다.**
   * 사진은 Blob·objectURL·저장소를 다뤄야 하는데 `Inspector` 는 폼 경계 쪽에 가깝다(K15).
   * 슬롯으로 두면 이 파일이 `data/*` 를 import 하지 않아도 된다.
   */
  photoSlot?: ReactNode;
  onAttrsChange: (attrs: DefectAttrs) => void;
  onResetLabel: () => void;
  onDelete: () => void;
};

export const Inspector = forwardRef<HTMLDivElement, InspectorProps>(function Inspector(
  { defect, settings, saving, photoSlot, onAttrsChange, onResetLabel, onDelete },
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
          전회차 표기입니다. 이 화면에서는 <b>선택만</b> 가능하며 값을 고칠 수 없습니다.
        </p>
      )}

      <div className="inspector__form">
        {settings ? (
          <DefectInfoForm
            // 결함이 바뀌면 폼 내부의 접힘·펼침 상태를 처음부터 다시 시작한다.
            // 남겨 두면 앞 결함에서 펼쳐 둔 그리드가 다음 결함에서도 열려 있어 혼란스럽다
            key={defect.id}
            value={attrsOf(defect)}
            settings={settings}
            disabled={locked}
            onChange={onAttrsChange}
          />
        ) : (
          <>
            <p className="notice notice--warn" role="status">
              항목 설정을 불러오지 못해 값만 표시합니다.
            </p>
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
          </>
        )}
        {/* S5 — 결함정보 폼 **아래**에 사진 섹션이 온다 (§2-5) */}
        {photoSlot}
      </div>

      <div className="inspector__actions">
        {/* 저장은 로컬 우선이고 UI 는 기다리지 않는다(불변식 #3).
            그래서 "저장했다"가 아니라 "저장 대기 중 / 저장됨"을 조용히 알린다 */}
        <p className="inspector__save" data-state={saving ? 'PENDING' : 'SAVED'} aria-live="polite">
          {saving ? '저장 중…' : '이 기기에 저장됨'}
        </p>
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
