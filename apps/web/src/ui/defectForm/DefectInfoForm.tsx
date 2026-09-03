/**
 * 결함정보 입력 폼 전체 — S4 스펙 §4-2 · §3-1. **캔버스·store·repo 를 import 하지 않는다.**
 *
 * `Defect` 를 통째로 받지 않고 `DefectAttrs` 만 받는다 — marks·label·style 을 넘기면
 * 폼이 캔버스에 묶여 RN 이 재사용할 수 없다. `onChange` 는 패치가 아니라 **다음 값 전체**를
 * 올린다 — 연동 규칙(§3-6)이 한 필드 변경으로 3~4 필드를 함께 바꾸기 때문이다.
 *
 * 연동 계산은 전부 `@onspect/project-core` 의 `items/apply.ts` 순수 함수가 한다.
 * 이 컴포넌트는 그 결과를 그리기만 한다.
 *
 * `DefectAttrs` 는 타입으로만 쓴다(`import type`) — canvas-core 의 렌더·store·repo 는
 * 전혀 참조하지 않는다.
 *
 * **T-1·T-4·T-6 (D29)** — 태블릿(현장)에서는 필드 일부를 감춘다. 감추는 것은 **화면뿐이고
 * 값은 손대지 않는다** — 전회차에서 넘어온 값도, PC 에서 채운 값도 그대로 살아 있고
 * PC 에서 열면 다시 보인다. 그래서 `profile` 은 렌더 분기일 뿐 `onChange` 를 부르지 않는다.
 *
 * 판정은 이 컴포넌트가 하지 않는다 — `useUiMode` 같은 DOM 훅을 여기서 부르면
 * RN 재사용 경계가 깨진다. 호출자가 `profile` 로 알려준다.
 */
import { useId, useMemo } from 'react';
import type { DefectAttrs } from '@onspect/canvas-core';
import {
  causesOf,
  defectTypesOf,
  isTabletVisible,
  membersOf,
  repairsOf,
  setDefectType,
  setMember,
  setSizeMode,
  setStructureType,
  STRUCTURE_TYPE_LABEL,
  STRUCTURE_TYPE_TABS,
  type ItemSettings,
} from '@onspect/project-core';
import { ChoiceGrid } from './ChoiceGrid';
import { SegmentField } from './SegmentField';
import { SizeBlock } from './SizeBlock';

export type DefectInfoFormProps = {
  value: DefectAttrs;
  settings: ItemSettings;
  /** 부분 변경만 올린다. 연동 규칙(§3-6)은 폼 안이 아니라 items/apply.ts 순수 함수가 계산한다 */
  onChange: (next: DefectAttrs) => void;
  /** 전회차 표기 등 잠긴 결함 */
  disabled?: boolean;
  /**
   * D18 — `[유사결함 불러오기]` 를 눌렀을 때. 없으면 버튼을 아예 그리지 않는다
   * (설정 미리보기처럼 결함 목록이 없는 자리).
   *
   * ⚠️ 다이얼로그는 **여기서 띄우지 않는다.** 후보 목록은 store 에 있고
   * `ui/defectForm/*` 은 store·repo·캔버스를 import 하지 않는다(경계 규칙) —
   * 목록을 아는 호출자(`CanvasRoute`)가 띄운다.
   */
  onLoadSimilar?: () => void;
  /** D18 — 불러올 수 있는 다른 결함의 수. 0 이면 버튼을 눌러도 볼 게 없어 `disabled` */
  similarCount?: number;
  /**
   * 표시 프로파일 (D29).
   * - `full` — 전체 필드 (PC. 기본값)
   * - `field` — 현장(태블릿) 단순화. 조사구분 · 구조체여부 · 발생원인 · 보수보강방안 ·
   *   위치보조 · 메모를 **화면에서만** 감춘다
   */
  profile?: 'full' | 'field';
};

export function DefectInfoForm({
  value,
  settings,
  onChange,
  disabled = false,
  onLoadSimilar,
  similarCount = 0,
  profile = 'full',
}: DefectInfoFormProps) {
  // 현장 프로파일에서 감출 것. 값은 그대로 두고 렌더만 건너뛴다
  const full = profile === 'full';
  // 폼이 한 화면에 두 벌 있어도(미리보기 + 우측 패널) label-for 가 어긋나지 않게 한다
  const uid = useId();
  // T-3 (D34) — 현장에서는 `태블릿 노출` 이 켜진 부재만 고를 수 있다.
  // 이름을 코드에 박지 않는다(D30) — 플래그만 본다. 플래그가 없는 옛 용역은 전부 켜진 것으로 읽혀
  // 예전과 똑같이 보인다. ⚠️ 지금 선택돼 있는 부재는 꺼져 있어도 목록에 남긴다 —
  // 안 그러면 PC 에서 고른 부재가 태블릿에서 열자마자 사라진 것처럼 보인다
  const allMembers = useMemo(
    () => (value.structureType ? membersOf(settings, value.structureType) : []),
    [settings, value.structureType],
  );
  const members = useMemo(
    () =>
      full ? allMembers : allMembers.filter((m) => isTabletVisible(m) || m.id === value.memberId),
    [allMembers, full, value.memberId],
  );
  const defectTypes = useMemo(
    () => (value.memberId ? defectTypesOf(settings, value.memberId) : []),
    [settings, value.memberId],
  );
  const causes = useMemo(
    () => (value.defectTypeId ? causesOf(settings, value.defectTypeId) : []),
    [settings, value.defectTypeId],
  );
  const repairs = useMemo(
    () => (value.defectTypeId ? repairsOf(settings, value.defectTypeId) : []),
    [settings, value.defectTypeId],
  );

  const currentMemberStructural = members.find((m) => m.id === value.memberId)?.structural ?? null;

  return (
    <div className="idf" aria-disabled={disabled || undefined}>
      {/* D18 — 유사결함 불러오기. **폼 맨 위**에 둔다. 값을 채우기 *전에* 누르는 버튼이라
          아래에 있으면 이미 다 입력한 뒤에야 눈에 띈다.
          가져오는 것은 분류·판정 14필드뿐이고 규모·개소·메모는 그대로 남는다
          (`DEFECT_CARRY_FIELDS`) */}
      {onLoadSimilar && (
        <div className="idf-field idf-field--action">
          <button
            type="button"
            className="btn btn--full"
            disabled={disabled || similarCount === 0}
            onClick={onLoadSimilar}
            title={
              disabled
                ? '전회차 표기는 값을 고칠 수 없습니다'
                : similarCount === 0
                  ? '이 용역에 불러올 다른 결함이 아직 없습니다'
                  : '다른 결함의 부재 · 결함유형 · 원인 · 보수방안을 이 결함으로 가져옵니다'
            }
          >
            유사결함 불러오기
          </button>
          <p className="idf-field__hint">
            분류 · 판정만 가져옵니다. 규모 · 개소 · 메모는 직접 입력하세요.
          </p>
        </div>
      )}

      {/* 조사구분 — "이 결함이 어떤 조사에서 나왔는가" 라는 틀이다.
          연동 규칙이 없다 — 다른 필드를 건드리지 않는다 (PhotoPolish §2-7)

          T-1: 현장에서는 감춘다. 새 결함의 기본값이 이미 `EXTERIOR`(외관조사)이므로
          (`canvas-core/defectAttrs.ts` `EMPTY_DEFECT_ATTRS`) 감추기만 해도 외관조사로 저장된다.
          PC 에서 상세조사로 지정해 둔 결함의 값은 건드리지 않는다 */}
      {full && (
      <SegmentField
        label="조사구분"
        value={value.surveyKind}
        options={
          [
            { value: 'EXTERIOR', label: '외관조사' },
            { value: 'DETAIL', label: '상세조사' },
          ] as const
        }
        disabled={disabled}
        onChange={(v) => onChange({ ...value, surveyKind: v })}
      />
      )}

      {/* 구조유형 */}
      <div className="idf-field">
        <div className="idf-field__head">
          <span className="idf-field__label">구조 유형</span>
        </div>
        <div className="segmented" role="group" aria-label="구조 유형">
          {STRUCTURE_TYPE_TABS.map((st) => (
            <button
              key={st}
              type="button"
              className="segmented__item"
              data-selected={value.structureType === st}
              disabled={disabled}
              onClick={() => onChange(setStructureType(value, settings, st))}
            >
              {STRUCTURE_TYPE_LABEL[st]}
            </button>
          ))}
        </div>
      </div>

      {/* 부재 */}
      <ChoiceGrid
        label="부재"
        emptyPlaceholder={value.structureType ? '부재를 선택하세요' : '먼저 구조유형을 고르세요'}
        options={members}
        valueId={value.memberId}
        valueName={value.memberName}
        disabled={disabled || !value.structureType}
        onSelect={(id) => onChange(setMember(value, settings, id))}
      />

      {/* 구조체 여부 — null 이면 부재 기본값을 그대로 보여준다(수동 지정 전).
          T-4: 현장에서는 감춘다(값 유지) */}
      {full && (
      <SegmentField
        label="구조체 여부"
        hint={value.structural === null ? '부재 기본값' : '직접 지정'}
        value={value.structural ?? currentMemberStructural ?? 'STRUCTURAL'}
        options={
          [
            { value: 'NON_STRUCTURAL', label: '비구조체' },
            { value: 'STRUCTURAL', label: '구조체' },
          ] as const
        }
        disabled={disabled || !value.memberId}
        onChange={(v) => onChange({ ...value, structural: v })}
      />
      )}

      {/* 결함유형 */}
      <ChoiceGrid
        label="결함 유형"
        emptyPlaceholder={value.memberId ? '결함유형을 선택하세요' : '먼저 부재를 고르세요'}
        options={defectTypes}
        valueId={value.defectTypeId}
        valueName={value.defectTypeName}
        disabled={disabled || !value.memberId}
        onSelect={(id) => onChange(setDefectType(value, settings, id))}
      />

      {/* 진행 여부 */}
      <SegmentField
        label="진행 여부"
        value={value.progress}
        options={
          [
            { value: 'NONE', label: '진행 없음' },
            { value: 'ONGOING', label: '진행 중' },
          ] as const
        }
        disabled={disabled}
        onChange={(v) => onChange({ ...value, progress: v })}
      />

      {/* 규모 — 폭×길이 ↔ 면적 */}
      <SizeBlock
        value={value}
        disabled={disabled}
        onModeChange={(mode) => onChange(setSizeMode(value, mode))}
        onFieldsChange={(patch) => onChange({ ...value, ...patch })}
      />

      {/* 누수 여부 */}
      <SegmentField
        label="누수 여부"
        value={value.leak ? 'O' : 'X'}
        options={
          [
            { value: 'X', label: 'X' },
            { value: 'O', label: 'O' },
          ] as const
        }
        disabled={disabled}
        onChange={(v) => onChange({ ...value, leak: v === 'O' })}
      />

      {/* T-6: 발생원인 · 보수보강방안 · 위치보조 · 메모 — 현장에서는 감춘다(값 유지).
          손상결함표의 발생원인 · 보수방안 열은 PC 에서 채운다(D29) */}
      {full && (
        <>
      {/* 발생원인 */}
      <ChoiceGrid
        label="발생 원인"
        emptyPlaceholder={value.defectTypeId ? '발생원인을 선택하세요' : '먼저 결함유형을 고르세요'}
        options={causes}
        valueId={value.causeId}
        valueName={value.causeName}
        disabled={disabled || !value.defectTypeId}
        onSelect={(id) => {
          const c = causes.find((x) => x.id === id);
          onChange({ ...value, causeId: id, causeName: c?.name ?? value.causeName });
        }}
      />

      {/* 보수보강방안 */}
      <ChoiceGrid
        label="보수 보강 방안"
        emptyPlaceholder={value.defectTypeId ? '보수방안을 선택하세요' : '먼저 결함유형을 고르세요'}
        options={repairs}
        valueId={value.repairId}
        valueName={value.repairName}
        disabled={disabled || !value.defectTypeId}
        onSelect={(id) => {
          const r = repairs.find((x) => x.id === id);
          onChange({ ...value, repairId: id, repairName: r?.name ?? value.repairName });
        }}
      />

      {/* 위치보조 */}
      <div className="idf-field">
        <div className="idf-field__head">
          <label className="idf-field__label" htmlFor={`${uid}-location`}>
            위치 보조
          </label>
        </div>
        <input
          id={`${uid}-location`}
          className="input input--small"
          type="text"
          placeholder="거실 · 복도 · 계단실"
          value={value.locationNote ?? ''}
          disabled={disabled}
          onChange={(e) =>
            onChange({ ...value, locationNote: e.target.value === '' ? null : e.target.value })
          }
        />
      </div>

      {/* 메모 */}
      <div className="idf-field">
        <div className="idf-field__head">
          <label className="idf-field__label" htmlFor={`${uid}-memo`}>
            메모
          </label>
        </div>
        <textarea
          id={`${uid}-memo`}
          className="input idf-memo"
          rows={2}
          value={value.memo ?? ''}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, memo: e.target.value === '' ? null : e.target.value })}
        />
      </div>
        </>
      )}

    </div>
  );
}
