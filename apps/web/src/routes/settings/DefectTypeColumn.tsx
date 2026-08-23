/**
 * 컬럼 2 — 결함유형 + 규모모드 라디오 (S3-T6).
 *
 * ⚠️ 라디오는 **링크(부재, 결함유형)를 바꾼다.** 마스터의 기본값이 아니다 (§2-2 · §7 지적).
 *    `망상균열` 을 `기둥` 에서 면적으로 바꿔도 `보` 의 `망상균열` 은 그대로다.
 */
import { useState } from 'react';
import {
  addDefectType,
  countOf,
  defectTypesOf,
  renameMaster,
  reorderDefectTypes,
  setLinkSizeMode,
  toggleDefectTypeFavorite,
  unlinkDefectType,
  type MemberOption,
} from '@onspect/project-core';
import { MoreMenu } from '../../ui/Menu';
import type { SettingsApi } from './api';
import { AddForm, ColumnEmpty, ColumnShell, InlineName, RowList, StarButton } from './parts';

export function DefectTypeColumn({
  api,
  member,
  selectedId,
  onSelect,
}: {
  api: SettingsApi;
  member: MemberOption | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const list = member ? defectTypesOf(api.settings, member.id) : [];
  const { total, favorite } = countOf(list);

  if (!member) {
    return (
      <ColumnShell title="결함유형" count={null}>
        <ColumnEmpty text="왼쪽에서 부재를 선택하세요" />
      </ColumnShell>
    );
  }

  return (
    <ColumnShell
      title="결함유형"
      subject={member.name}
      count={total}
      favorite={favorite}
      addForm={
        <AddForm
          placeholder="새 결함유형"
          label="결함유형 추가"
          onAdd={(name) => {
            const r = addDefectType(api.settings, {
              memberId: member.id,
              name,
              now: api.now(),
              newId: api.newId,
            });
            if (!r.ok) return r.message;
            api.apply(r.settings);
            if (r.linkedExisting) {
              api.notify(`'${r.name}' 은 이미 등록된 항목입니다. '${member.name}' 에 연결했습니다.`);
            }
            onSelect(r.id);
            return null;
          }}
        />
      }
    >
      {list.length === 0 ? (
        <ColumnEmpty text="아직 등록된 항목이 없습니다. 위 입력창에서 추가하세요." />
      ) : (
        <RowList
          ariaLabel={`${member.name}의 결함유형 목록`}
          items={list}
          onMove={(id, toIndex) =>
            api.apply(reorderDefectTypes(api.settings, member.id, id, toIndex, api.now()))
          }
          renderRow={(d, index) => {
            const selected = d.id === selectedId;
            const radioName = `size-${member.id}-${d.id}`;
            return (
              <div className="set-row__stack">
                <div className="set-row__line">
                  {editingId === d.id ? (
                    <InlineName
                      value={d.name}
                      onCancel={() => setEditingId(null)}
                      onCommit={(next) => {
                        const r = renameMaster(api.settings, 'DEFECT_TYPE', d.id, next, api.now());
                        if (!r.ok) return r.message;
                        api.apply(r.settings);
                        setEditingId(null);
                        return null;
                      }}
                    />
                  ) : (
                    <>
                      <StarButton
                        on={d.favorite}
                        onToggle={() =>
                          api.apply(
                            toggleDefectTypeFavorite(api.settings, member.id, d.id, api.now()),
                          )
                        }
                      />
                      <button
                        type="button"
                        className="set-row__name"
                        aria-pressed={selected}
                        title={d.name}
                        onClick={() => onSelect(d.id)}
                      >
                        {d.name}
                      </button>
                      <span className="set-row__arrow" aria-hidden="true">
                        ▸
                      </span>
                      <MoreMenu
                        label={`${d.name} 추가 작업`}
                        className="iconbtn iconbtn--small"
                        items={[
                          { label: '이름 수정', onSelect: () => setEditingId(d.id) },
                          {
                            label: '위로',
                            disabled: index === 0,
                            onSelect: () =>
                              api.apply(
                                reorderDefectTypes(
                                  api.settings,
                                  member.id,
                                  d.id,
                                  index - 1,
                                  api.now(),
                                ),
                              ),
                          },
                          {
                            label: '아래로',
                            disabled: index === list.length - 1,
                            onSelect: () =>
                              api.apply(
                                reorderDefectTypes(
                                  api.settings,
                                  member.id,
                                  d.id,
                                  index + 1,
                                  api.now(),
                                ),
                              ),
                          },
                          {
                            label: `'${member.name}' 목록에서 빼기`,
                            separatorBefore: true,
                            title: '다른 부재와 마스터 항목은 그대로 남습니다',
                            onSelect: () =>
                              api.apply(
                                unlinkDefectType(api.settings, member.id, d.id, api.now()),
                                {
                                  message: `'${d.name}' 을 '${member.name}' 목록에서 뺐습니다`,
                                },
                              ),
                          },
                          {
                            label: '마스터에서 완전히 삭제',
                            danger: true,
                            onSelect: () => api.askDeleteMaster('DEFECT_TYPE', d.id, d.name),
                          },
                        ]}
                      />
                    </>
                  )}
                </div>
                <div
                  className="set-size"
                  role="radiogroup"
                  aria-label={`${d.name}의 규모 입력 방식`}
                >
                  <label className="set-size__opt">
                    <input
                      type="radio"
                      name={radioName}
                      checked={d.sizeMode === 'WL'}
                      onChange={() =>
                        api.apply(setLinkSizeMode(api.settings, member.id, d.id, 'WL', api.now()))
                      }
                    />
                    <span>폭×길이</span>
                  </label>
                  <label className="set-size__opt">
                    <input
                      type="radio"
                      name={radioName}
                      checked={d.sizeMode === 'AREA'}
                      onChange={() =>
                        api.apply(setLinkSizeMode(api.settings, member.id, d.id, 'AREA', api.now()))
                      }
                    />
                    <span>면적</span>
                  </label>
                </div>
              </div>
            );
          }}
        />
      )}
    </ColumnShell>
  );
}
