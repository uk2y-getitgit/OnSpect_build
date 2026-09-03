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
  canSetStatus,
  describeMissing,
  isIncomplete,
  isLocked,
  type Defect,
  type DefectAttrs,
  type DefectStatus,
} from '@onspect/canvas-core';
import type { ItemSettings } from '@onspect/project-core';
import { useUiMode } from '../shell/useUiMode';
import { DefectInfoForm } from './defectForm/DefectInfoForm';

/** 2026-09-03 — 4종 재정의. 범례·종류선택과 **같은 말**을 쓴다 */
const STATUS_LABEL: Record<Defect['status'], string> = {
  CURRENT: '결함',
  NEW: '신규',
  PREV_PENDING: '전차',
  REPAIRED: '보수완료',
};

/**
 * C-5 — 종류 선택 버튼에 쓰는 짧은 라벨. **범례와 같은 말을 쓴다**(U-3 확정) —
 * 도면 위 범례가 `신규 · 결함 · 보수완료` 인데 여기서 다른 말을 쓰면 색을 못 잇는다.
 */
const STATUS_PICK: ReadonlyArray<{ value: DefectStatus; label: string; hint: string }> = [
  { value: 'CURRENT', label: '결함', hint: '이번 회차에서 확인한 결함 (빨강 · 기본값)' },
  { value: 'NEW', label: '신규', hint: '이번 회차에 새로 생긴 결함 (보라)' },
  { value: 'PREV_PENDING', label: '전차', hint: '전회차에서 넘어온 결함 (남색) — 값 편집이 잠깁니다' },
  { value: 'REPAIRED', label: '보수완료', hint: '보수가 끝난 결함 (파랑)' },
];

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
  /** D18 — `[유사결함 불러오기]`. 다이얼로그는 호출자가 띄운다 */
  onLoadSimilar?: () => void;
  /** D18 — 불러올 수 있는 다른 결함의 수 */
  similarCount?: number;
  onResetLabel: () => void;
  onDelete: () => void;
  /**
   * C-5 (D33) — 표기 종류(status) 변경. 색은 `statusColor[status]` 를 타고 자동으로 따라온다.
   * 주지 않으면 종류 선택 줄 자체가 뜨지 않는다.
   */
  onStatusChange?: (to: DefectStatus) => void;
};

export const Inspector = forwardRef<HTMLDivElement, InspectorProps>(function Inspector(
  {
    defect,
    settings,
    saving,
    photoSlot,
    onAttrsChange,
    onLoadSimilar,
    similarCount = 0,
    onResetLabel,
    onDelete,
    onStatusChange,
  },
  ref,
) {
  // ⚠️ 아래 `if (!defect)` 조기 반환보다 **먼저** 불러야 한다 (훅 규칙)
  const { tablet } = useUiMode();

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

      {/* C-5 (D33) — 표기 종류 선택. 바꾸면 색은 `statusColor[status]` 를 타고 자동으로 따라온다.
          ⚠️ **`locked` 로 막지 않는다.** 이 줄은 잠금의 근거(status)를 바꾸는 자리라,
          잠금으로 막으면 한 번 「결함」·「보수완료」로 바꾼 결함을 영영 되돌릴 수 없다.
          이 줄이 G-8 의 옛 `[전회차로 되돌리기]` 버튼을 대신한다 — 같은 일을 하는 문이 둘이면 헷갈린다 */}
      {onStatusChange && (
        <div className="idf-field">
          <div className="idf-field__head">
            <span className="idf-field__label">표기 종류</span>
          </div>
          <div className="segmented" role="group" aria-label="표기 종류">
            {STATUS_PICK.map((opt) => {
              const isCurrent = defect.status === opt.value;
              const allowed = isCurrent || canSetStatus(defect, opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  className="segmented__item"
                  data-selected={isCurrent}
                  disabled={!allowed}
                  title={
                    allowed
                      ? opt.hint
                      : '전회차에서 넘어온 결함이 아니어서 「결함」으로 바꿀 수 없습니다 — 보수완료 미포함으로 뽑은 출력에서 이 결함이 사라집니다'
                  }
                  onClick={() => !isCurrent && onStatusChange(opt.value)}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p className="idf-field__hint">
            종류를 바꾸면 도면 위 색도 함께 바뀝니다. 「전차」 만 값 편집이 잠깁니다.
          </p>
        </div>
      )}

      {incomplete && (
        <p className="notice notice--warn" role="status">
          미완성 결함입니다 — {describeMissing(defect)}
        </p>
      )}
      {locked &&
        (defect.status === 'PREV_PENDING' ? (
          // G-8 — 값은 여전히 잠겨 있지만 사진 한 가지만 열려 있다. 그 사실을 여기서 말해 준다
          <p className="notice" role="status">
            전차 표기입니다. 값은 고칠 수 없지만, <b>이번 회차에 찍은 사진을 추가하면</b>{' '}
            이번 회차 결함으로 전환됩니다. 위 <b>표기 종류</b> 에서 직접 바꿔도 됩니다.
          </p>
        ) : null)}

      {/* T-7 — 현장(태블릿)에서는 사진이 **폼보다 위**다. 결함을 찍으면 사진부터 붙이는
          순서라, 아래 있으면 매번 스크롤해야 한다. PC 는 §2-5 대로 폼 아래 그대로 */}
      {tablet && photoSlot}

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
            onLoadSimilar={onLoadSimilar}
            similarCount={similarCount}
            // D29 — 현장(태블릿)에서는 조사구분·구조체여부·발생원인·보수보강방안·
            // 위치보조·메모를 감춘다. **화면만** 감추고 값은 그대로 둔다.
            // 폼은 DOM 훅을 못 부르므로(RN 재사용 경계) 여기서 알려준다
            profile={tablet ? 'field' : 'full'}
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
        {/* S5 — 결함정보 폼 **아래**에 사진 섹션이 온다 (§2-5).
            태블릿에서는 이미 위에 그렸으므로 여기서는 그리지 않는다 (T-7) */}
        {!tablet && photoSlot}
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
