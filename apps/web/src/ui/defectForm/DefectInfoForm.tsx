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
 */
import { useMemo } from 'react';
import type { DefectAttrs } from '@onspect/canvas-core';
import {
  causesOf,
  defectTypesOf,
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
};

export function DefectInfoForm({ value, settings, onChange, disabled = false }: DefectInfoFormProps) {
  const members = useMemo(
    () => (value.structureType ? membersOf(settings, value.structureType) : []),
    [settings, value.structureType],
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

      {/* 구조체 여부 — null 이면 부재 기본값을 그대로 보여준다(수동 지정 전) */}
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
          <label className="idf-field__label" htmlFor="idf-location">
            위치 보조
          </label>
        </div>
        <input
          id="idf-location"
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
          <label className="idf-field__label" htmlFor="idf-memo">
            메모
          </label>
        </div>
        <textarea
          id="idf-memo"
          className="input idf-memo"
          rows={2}
          value={value.memo ?? ''}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, memo: e.target.value === '' ? null : e.target.value })}
        />
      </div>
    </div>
  );
}
