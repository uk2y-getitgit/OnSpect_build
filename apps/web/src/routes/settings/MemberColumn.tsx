/**
 * 컬럼 1 — 부재 (S3-T5).
 *
 * 이 컬럼의 선택이 컬럼 2 를 결정한다. 그래서 선택 상태가 **hover 와 확실히 달라야 하고**,
 * 선택된 행은 오른쪽으로 이어진다는 표시(▸)를 함께 둔다.
 */
import { useState } from 'react';
import {
  addMember,
  membersOf,
  countOf,
  renameMaster,
  reorderMembers,
  setMemberStructural,
  STRUCTURAL_LABEL,
  toggleMemberFavorite,
  unlinkMember,
  type StructureType,
} from '@onspect/project-core';
import { MoreMenu } from '../../ui/Menu';
import type { SettingsApi } from './api';
import { AddForm, ColumnEmpty, ColumnShell, InlineName, RowList, StarButton } from './parts';

export function MemberColumn({
  api,
  structureType,
  selectedId,
  onSelect,
  onReloadSeed,
}: {
  api: SettingsApi;
  structureType: StructureType;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReloadSeed: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const list = membersOf(api.settings, structureType);
  const { total, favorite } = countOf(list);

  return (
    <ColumnShell
      title="부재"
      count={total}
      favorite={favorite}
      addForm={
        <AddForm
          placeholder="새 부재"
          label="부재 추가"
          onAdd={(name) => {
            const r = addMember(api.settings, {
              structureType,
              name,
              now: api.now(),
              newId: api.newId,
            });
            if (!r.ok) return r.message;
            api.apply(r.settings);
            if (r.linkedExisting) {
              api.notify(`'${r.name}' 은 이미 등록된 항목입니다. 이 구조유형에 연결했습니다.`);
            }
            onSelect(r.id);
            return null;
          }}
        />
      }
    >
      {list.length === 0 ? (
        <ColumnEmpty
          text="아직 등록된 항목이 없습니다. 위 입력창에서 추가하세요."
          action={{ label: '기본 항목 세트 불러오기', run: onReloadSeed }}
        />
      ) : (
        <RowList
          ariaLabel={`${structureType} 부재 목록`}
          items={list}
          onMove={(id, toIndex) =>
            api.apply(reorderMembers(api.settings, structureType, id, toIndex, api.now()))
          }
          renderRow={(m, index) => {
            const selected = m.id === selectedId;
            return editingId === m.id ? (
              <InlineName
                value={m.name}
                onCancel={() => setEditingId(null)}
                onCommit={(next) => {
                  const r = renameMaster(api.settings, 'MEMBER', m.id, next, api.now());
                  if (!r.ok) return r.message;
                  api.apply(r.settings);
                  setEditingId(null);
                  return null;
                }}
              />
            ) : (
              <>
                <StarButton
                  on={m.favorite}
                  onToggle={() =>
                    api.apply(toggleMemberFavorite(api.settings, structureType, m.id, api.now()))
                  }
                />
                <button
                  type="button"
                  className="set-row__name"
                  aria-pressed={selected}
                  title={m.name}
                  onClick={() => onSelect(m.id)}
                >
                  {m.name}
                </button>
                <span
                  className="set-tag"
                  data-kind={m.structural === 'STRUCTURAL' ? 'structural' : 'non'}
                  title="손상결함표 '구조체 유형' 열에 나가는 값입니다"
                >
                  {STRUCTURAL_LABEL[m.structural]}
                </span>
                <span className="set-row__arrow" aria-hidden="true">
                  ▸
                </span>
                <MoreMenu
                  label={`${m.name} 추가 작업`}
                  className="iconbtn iconbtn--small"
                  items={[
                    { label: '이름 수정', onSelect: () => setEditingId(m.id) },
                    {
                      label:
                        m.structural === 'STRUCTURAL' ? '비구조체로 바꾸기' : '구조체로 바꾸기',
                      onSelect: () =>
                        api.apply(
                          setMemberStructural(
                            api.settings,
                            m.id,
                            m.structural === 'STRUCTURAL' ? 'NON_STRUCTURAL' : 'STRUCTURAL',
                            api.now(),
                          ),
                        ),
                    },
                    {
                      label: '위로',
                      disabled: index === 0,
                      onSelect: () =>
                        api.apply(
                          reorderMembers(api.settings, structureType, m.id, index - 1, api.now()),
                        ),
                    },
                    {
                      label: '아래로',
                      disabled: index === list.length - 1,
                      onSelect: () =>
                        api.apply(
                          reorderMembers(api.settings, structureType, m.id, index + 1, api.now()),
                        ),
                    },
                    {
                      label: `${structureType} 목록에서 빼기`,
                      separatorBefore: true,
                      title: '다른 구조유형과 마스터 항목은 그대로 남습니다',
                      onSelect: () =>
                        api.apply(
                          unlinkMember(api.settings, structureType, m.id, api.now()),
                          { message: `'${m.name}' 을 ${structureType} 목록에서 뺐습니다` },
                        ),
                    },
                    {
                      label: '마스터에서 완전히 삭제',
                      danger: true,
                      onSelect: () => api.askDeleteMaster('MEMBER', m.id, m.name),
                    },
                  ]}
                />
              </>
            );
          }}
        />
      )}
    </ColumnShell>
  );
}
