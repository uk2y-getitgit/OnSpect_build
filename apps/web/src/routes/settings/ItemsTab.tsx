/**
 * 항목 편집 — 구조유형 탭 + 3컬럼 (S3-T5·T6·T7).
 *
 * 선택 규칙 (§2-5-b):
 *   · 컬럼1 선택 → 컬럼2 갱신, 컬럼2 선택 → 컬럼3 갱신
 *   · **탭을 바꾸면 컬럼1 선택은 그 탭의 첫 항목으로 초기화**
 *   · 선택한 항목이 사라지면(삭제·목록에서 빼기) 첫 항목으로 조용히 내려앉는다
 */
import { useEffect, useState } from 'react';
import {
  defectTypesOf,
  membersOf,
  STRUCTURE_TYPE_TABS,
  type StructureType,
} from '@onspect/project-core';
import type { SettingsApi } from './api';
import { CauseRepairColumn } from './CauseRepairColumn';
import { DefectTypeColumn } from './DefectTypeColumn';
import { MemberColumn } from './MemberColumn';

export function ItemsTab({
  api,
  structureType,
  onStructureType,
  onReloadSeed,
}: {
  api: SettingsApi;
  structureType: StructureType;
  onStructureType: (st: StructureType) => void;
  onReloadSeed: () => void;
}) {
  const [memberId, setMemberId] = useState<string | null>(null);
  const [defectTypeId, setDefectTypeId] = useState<string | null>(null);

  // 탭을 바꾸면 컬럼1 선택을 그 탭의 첫 항목으로 되돌린다
  useEffect(() => {
    setMemberId(null);
  }, [structureType]);

  const members = membersOf(api.settings, structureType);
  const member = members.find((m) => m.id === memberId) ?? members[0] ?? null;
  const types = member ? defectTypesOf(api.settings, member.id) : [];
  const defectType = types.find((t) => t.id === defectTypeId) ?? types[0] ?? null;

  const onTabKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const i = STRUCTURE_TYPE_TABS.indexOf(structureType);
    const next = STRUCTURE_TYPE_TABS[(i + step + STRUCTURE_TYPE_TABS.length) % STRUCTURE_TYPE_TABS.length]!;
    onStructureType(next);
    window.requestAnimationFrame(() => document.getElementById(`set-tab-${next}`)?.focus());
  };

  return (
    <div className="set-items">
      <div className="set-tabs">
        {/*
          roving tabindex — 선택된 탭만 Tab 으로 들어오고, 탭 사이는 ←/→ 로 옮긴다.
          화살표 처리를 빼면 키보드 사용자는 다른 구조유형으로 **영영 갈 수 없다**
        */}
        <div className="set-tabs__list" role="tablist" aria-label="구조유형" onKeyDown={onTabKey}>
          {STRUCTURE_TYPE_TABS.map((st) => (
            <button
              key={st}
              id={`set-tab-${st}`}
              type="button"
              role="tab"
              aria-controls="set-tabpanel"
              className="set-tab"
              aria-selected={st === structureType}
              tabIndex={st === structureType ? 0 : -1}
              title={`${st} 구조의 부재 목록`}
              onClick={() => onStructureType(st)}
            >
              {st}
            </button>
          ))}
        </div>
        <p className="set-tabs__hint">
          부재 목록은 구조유형마다 따로 관리됩니다. 결함유형부터는 부재를 따라갑니다.
        </p>
      </div>

      <div className="set-grid" role="tabpanel" id="set-tabpanel" aria-labelledby={`set-tab-${structureType}`}>
        <MemberColumn
          api={api}
          structureType={structureType}
          selectedId={member?.id ?? null}
          onSelect={(id) => {
            setMemberId(id);
            setDefectTypeId(null);
          }}
          onReloadSeed={onReloadSeed}
        />
        <DefectTypeColumn
          api={api}
          member={member}
          selectedId={defectType?.id ?? null}
          onSelect={setDefectTypeId}
        />
        <CauseRepairColumn api={api} defectType={defectType} memberName={member?.name ?? null} />
      </div>
    </div>
  );
}
