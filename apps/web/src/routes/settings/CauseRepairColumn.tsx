/**
 * 컬럼 3 — 발생원인 + 보수방안 (S3-T7).
 *
 * 발생원인의 **코드번호는 마스터 고정값**이다 (§2-5-f · F6 / Q21).
 * 손상결함표 `발생원인 추정` 열이 이 숫자를 그대로 쓴다 — 같은 데이터면 항상 같은 숫자가 나온다.
 * 보고서마다 1..n 으로 다시 매기는 것은 **출력 파라미터**이고 Phase 4 다.
 */
import { useState } from 'react';
import {
  addCause,
  addRepair,
  causesOf,
  renameMaster,
  reorderCauses,
  reorderRepairs,
  repairsOf,
  setCauseCode,
  setDefaultCause,
  setDefaultRepair,
  unlinkCause,
  unlinkRepair,
  type DefectTypeOption,
} from '@onspect/project-core';
import { MoreMenu } from '../../ui/Menu';
import type { SettingsApi } from './api';
import {
  AddForm,
  circledNumber,
  ColumnEmpty,
  ColumnShell,
  InlineName,
  RowList,
  type CommitResult,
} from './parts';

export function CauseRepairColumn({
  api,
  defectType,
  memberName,
}: {
  api: SettingsApi;
  defectType: DefectTypeOption | null;
  memberName: string | null;
}) {
  if (!defectType) {
    return (
      <ColumnShell title="발생원인 · 보수방안" count={null}>
        <ColumnEmpty text="가운데에서 결함유형을 선택하세요" />
      </ColumnShell>
    );
  }
  return (
    <div className="set-col set-col--stack" aria-label={`${defectType.name}의 발생원인과 보수방안`}>
      <CauseList api={api} defectType={defectType} memberName={memberName} />
      <RepairList api={api} defectType={defectType} />
    </div>
  );
}

// ── 발생원인 ───────────────────────────────────────────────────────────────
function CauseList({
  api,
  defectType,
  memberName,
}: {
  api: SettingsApi;
  defectType: DefectTypeOption;
  memberName: string | null;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCodeId, setEditingCodeId] = useState<string | null>(null);
  const list = causesOf(api.settings, defectType.id);

  return (
    <ColumnShell
      title="발생원인"
      subject={defectType.name}
      count={list.length}
      addForm={
        <AddForm
          placeholder="새 발생원인"
          label="발생원인 추가"
          onAdd={(name) => {
            const r = addCause(api.settings, {
              defectTypeId: defectType.id,
              name,
              now: api.now(),
              newId: api.newId,
            });
            if (!r.ok) return r.message;
            api.apply(r.settings);
            if (r.linkedExisting) {
              api.notify(
                `'${r.name}' 은 이미 등록된 항목입니다. '${defectType.name}' 에 연결했습니다.`,
              );
            }
            return null;
          }}
        />
      }
    >
      {list.length === 0 ? (
        <ColumnEmpty text="아직 등록된 항목이 없습니다. 위 입력창에서 추가하세요." />
      ) : (
        <RowList
          ariaLabel={`${defectType.name}의 발생원인 목록`}
          items={list}
          onMove={(id, toIndex) =>
            api.apply(reorderCauses(api.settings, defectType.id, id, toIndex, api.now()))
          }
          renderRow={(c, index) => (
            <div className="set-row__line">
              {editingCodeId === c.id ? (
                <CodeInput
                  value={c.code}
                  onCancel={() => setEditingCodeId(null)}
                  onCommit={(next) => {
                    const r = setCauseCode(api.settings, c.id, next, api.now());
                    if (!r.ok) return r.message;
                    api.apply(r.settings);
                    setEditingCodeId(null);
                    return null;
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="set-code num"
                  title={`코드번호 ${c.code} — 손상결함표에 그대로 인쇄됩니다. 누르면 수정합니다`}
                  aria-label={`코드번호 ${c.code} 수정`}
                  onClick={() => setEditingCodeId(c.id)}
                >
                  {circledNumber(c.code)}
                </button>
              )}

              {editingId === c.id ? (
                <InlineName
                  value={c.name}
                  onCancel={() => setEditingId(null)}
                  onCommit={(next) => {
                    const r = renameMaster(api.settings, 'CAUSE', c.id, next, api.now());
                    if (!r.ok) return r.message;
                    api.apply(r.settings);
                    setEditingId(null);
                    return null;
                  }}
                />
              ) : (
                <>
                  <span className="set-row__label" title={c.name}>
                    {c.name}
                  </span>
                  {c.isDefault ? (
                    <span className="set-default" title="새 결함에 이 값이 미리 채워집니다">
                      기본값
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--tiny"
                      title={`'${c.name}' 을 이 결함유형의 기본값으로 지정합니다`}
                      onClick={() =>
                        api.apply(setDefaultCause(api.settings, defectType.id, c.id, api.now()))
                      }
                    >
                      기본값으로
                    </button>
                  )}
                  <button
                    type="button"
                    className="iconbtn iconbtn--small"
                    aria-label={`'${c.name}' 을 이 목록에서 빼기`}
                    title="이 목록에서 빼기 (마스터와 다른 연결은 그대로)"
                    onClick={() =>
                      api.apply(unlinkCause(api.settings, defectType.id, c.id, api.now()), {
                        message: `'${c.name}' 을 '${defectType.name}' 목록에서 뺐습니다`,
                      })
                    }
                  >
                    🗑
                  </button>
                  <MoreMenu
                    label={`${c.name} 추가 작업`}
                    className="iconbtn iconbtn--small"
                    items={[
                      { label: '이름 수정', onSelect: () => setEditingId(c.id) },
                      { label: '코드번호 수정', onSelect: () => setEditingCodeId(c.id) },
                      {
                        label: '위로',
                        disabled: index === 0,
                        onSelect: () =>
                          api.apply(
                            reorderCauses(api.settings, defectType.id, c.id, index - 1, api.now()),
                          ),
                      },
                      {
                        label: '아래로',
                        disabled: index === list.length - 1,
                        onSelect: () =>
                          api.apply(
                            reorderCauses(api.settings, defectType.id, c.id, index + 1, api.now()),
                          ),
                      },
                      {
                        label: '마스터에서 완전히 삭제',
                        danger: true,
                        separatorBefore: true,
                        title: memberName ? `'${memberName}' 뿐 아니라 모든 목록에서 사라집니다` : undefined,
                        onSelect: () => api.askDeleteMaster('CAUSE', c.id, c.name),
                      },
                    ]}
                  />
                </>
              )}
            </div>
          )}
        />
      )}
    </ColumnShell>
  );
}

// ── 보수방안 ───────────────────────────────────────────────────────────────
function RepairList({ api, defectType }: { api: SettingsApi; defectType: DefectTypeOption }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const list = repairsOf(api.settings, defectType.id);

  return (
    <ColumnShell
      title="보수방안"
      subject={defectType.name}
      count={list.length}
      addForm={
        <AddForm
          placeholder="새 보수방안"
          label="보수방안 추가"
          onAdd={(name) => {
            const r = addRepair(api.settings, {
              defectTypeId: defectType.id,
              name,
              now: api.now(),
              newId: api.newId,
            });
            if (!r.ok) return r.message;
            api.apply(r.settings);
            if (r.linkedExisting) {
              api.notify(
                `'${r.name}' 은 이미 등록된 항목입니다. '${defectType.name}' 에 연결했습니다.`,
              );
            }
            return null;
          }}
        />
      }
    >
      {list.length === 0 ? (
        <ColumnEmpty text="아직 등록된 항목이 없습니다. 위 입력창에서 추가하세요." />
      ) : (
        <RowList
          ariaLabel={`${defectType.name}의 보수방안 목록`}
          items={list}
          onMove={(id, toIndex) =>
            api.apply(reorderRepairs(api.settings, defectType.id, id, toIndex, api.now()))
          }
          renderRow={(r, index) => (
            <div className="set-row__line">
              {editingId === r.id ? (
                <InlineName
                  value={r.name}
                  onCancel={() => setEditingId(null)}
                  onCommit={(next) => {
                    const res = renameMaster(api.settings, 'REPAIR', r.id, next, api.now());
                    if (!res.ok) return res.message;
                    api.apply(res.settings);
                    setEditingId(null);
                    return null;
                  }}
                />
              ) : (
                <>
                  <span className="set-row__label" title={r.name}>
                    {r.name}
                  </span>
                  {r.isDefault ? (
                    <span className="set-default" title="새 결함에 이 값이 미리 채워집니다">
                      기본값
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--tiny"
                      title={`'${r.name}' 을 이 결함유형의 기본값으로 지정합니다`}
                      onClick={() =>
                        api.apply(setDefaultRepair(api.settings, defectType.id, r.id, api.now()))
                      }
                    >
                      기본값으로
                    </button>
                  )}
                  <button
                    type="button"
                    className="iconbtn iconbtn--small"
                    aria-label={`'${r.name}' 을 이 목록에서 빼기`}
                    title="이 목록에서 빼기 (마스터와 다른 연결은 그대로)"
                    onClick={() =>
                      api.apply(unlinkRepair(api.settings, defectType.id, r.id, api.now()), {
                        message: `'${r.name}' 을 '${defectType.name}' 목록에서 뺐습니다`,
                      })
                    }
                  >
                    🗑
                  </button>
                  <MoreMenu
                    label={`${r.name} 추가 작업`}
                    className="iconbtn iconbtn--small"
                    items={[
                      { label: '이름 수정', onSelect: () => setEditingId(r.id) },
                      {
                        label: '위로',
                        disabled: index === 0,
                        onSelect: () =>
                          api.apply(
                            reorderRepairs(api.settings, defectType.id, r.id, index - 1, api.now()),
                          ),
                      },
                      {
                        label: '아래로',
                        disabled: index === list.length - 1,
                        onSelect: () =>
                          api.apply(
                            reorderRepairs(api.settings, defectType.id, r.id, index + 1, api.now()),
                          ),
                      },
                      {
                        label: '마스터에서 완전히 삭제',
                        danger: true,
                        separatorBefore: true,
                        onSelect: () => api.askDeleteMaster('REPAIR', r.id, r.name),
                      },
                    ]}
                  />
                </>
              )}
            </div>
          )}
        />
      )}
    </ColumnShell>
  );
}

// ── 코드번호 입력 ──────────────────────────────────────────────────────────
function CodeInput({
  value,
  onCommit,
  onCancel,
}: {
  value: number;
  onCommit: (next: number) => CommitResult;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState<string | null>(null);

  const commit = () => {
    const n = Number(draft.trim());
    const err = onCommit(Number.isFinite(n) ? n : NaN);
    if (err !== null) setError(err);
  };

  return (
    <span className="set-inline set-inline--code">
      <input
        className="input input--small input--num num"
        type="number"
        min={1}
        max={999}
        step={1}
        autoFocus
        value={draft}
        aria-label="코드번호"
        aria-invalid={error !== null || undefined}
        onChange={(e) => {
          setDraft(e.target.value);
          if (error) setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }
        }}
      />
      <button type="button" className="btn btn--tiny btn--primary" onClick={commit}>
        확인
      </button>
      <button type="button" className="btn btn--tiny" onClick={onCancel}>
        취소
      </button>
      {error && (
        <span className="set-inline__error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
