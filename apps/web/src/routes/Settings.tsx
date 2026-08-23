/**
 * P6 용역 설정 — `#/p/:pid/settings` (S3-T4).
 *
 * **이 화면이 편집하는 것은 "이 용역의 설정" 하나뿐이다** (D6 · F1).
 * 전역(ORG) 문서는 새 용역의 초기값 역할만 하고 `[이 설정을 기본값으로 저장]` 으로만 갱신된다.
 * 근거: *작년 보고서를 다시 뽑으면 옛 이름이 나와야 한다.* 발주처 제출본과 달라지면 안 된다.
 * → 그래서 헤더와 안내문에 **어느 용역의 설정을 고치는 중인지**를 계속 띄운다.
 *
 * 저장 (§2-5-b): 조작 확정 즉시 메모리 반영 → 250ms 디바운스 후 `put` 1회.
 * **UI 는 저장을 기다리지 않는다** (불변식 #3).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Defect } from '@onspect/canvas-core';
import {
  describeMergeResult,
  ITEM_KIND_LABEL,
  masterUsage,
  mergeSeedInto,
  projectDisplayName,
  promoteToOrg,
  deleteMaster,
  type ItemKind,
  type ItemSettings,
  type Project,
  type StructureType,
} from '@onspect/project-core';
import { useAppData } from '../data/appData';
import { newId } from '../data/idb/db';
import { navigate } from '../router';
import { ConfirmDialog } from '../ui/Overlays';
import { useToast } from '../ui/ToastHost';
import { ItemsTab } from './settings/ItemsTab';
import { MiscTab } from './settings/MiscTab';
import type { SettingsApi } from './settings/api';

type TabId = 'ITEMS' | 'MISC';

type NavEntry = {
  id: TabId | null;
  label: string;
  /** 비활성 사유 — 자리를 지금 잡아 두면 나중에 레이아웃이 안 흔들린다 (F26) */
  soon?: string;
  indent?: boolean;
};

const NAV: { group: string; entries: NavEntry[] }[] = [
  {
    group: '입력 항목',
    entries: [
      { id: 'ITEMS', label: '항목 편집', indent: true },
      { id: null, label: '입력 미리보기', soon: '결함 입력 폼(S4)과 함께 열립니다', indent: true },
      { id: null, label: '프리셋', soon: '준비 중', indent: true },
    ],
  },
  {
    group: '기타',
    entries: [
      { id: null, label: '표시 스타일', soon: '준비 중' },
      { id: null, label: '시설물 사진 분류', soon: '준비 중' },
      { id: 'MISC', label: '기타' },
    ],
  },
];

type Confirming =
  | { kind: 'DELETE_MASTER'; itemKind: ItemKind; id: string; name: string }
  | { kind: 'PROMOTE' }
  | null;

/** 저장 디바운스 — 조작 확정 즉시 화면에 반영하고, 쓰기는 뒤따라간다 */
const SAVE_DEBOUNCE_MS = 250;

export function Settings({
  projectId,
  fromFloorId,
}: {
  projectId: string;
  fromFloorId: string | null;
}) {
  const { storage, guard } = useAppData();
  const toast = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [settings, setSettings] = useState<ItemSettings | null>(null);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<TabId>('ITEMS');
  const [structureType, setStructureType] = useState<StructureType>('RC');
  const [confirming, setConfirming] = useState<Confirming>(null);

  const settingsRef = useRef<ItemSettings | null>(null);
  const pending = useRef<ItemSettings | null>(null);
  const timer = useRef<number | null>(null);

  // ── 로드 ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (storage.phase !== 'READY') return;
    let alive = true;
    setLoading(true);
    void (async () => {
      const p = await storage.repo.getProject(projectId);
      if (!alive) return;
      if (!p || p.deletedAt !== null) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      // 지연 스냅샷 — 이미 만들어진 용역도 여기서 자기 설정을 갖는다 (§2-4)
      const s = await storage.repo.ensureProjectSettings(projectId);
      const ds = await storage.repo.listDefects(projectId);
      if (!alive) return;
      setProject(p);
      setStructureType(p.defaultStructureType ?? 'RC');
      settingsRef.current = s;
      setSettings(s);
      setDefects(ds);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [storage, projectId]);

  // ── 저장 ────────────────────────────────────────────────────────────────
  const flush = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const next = pending.current;
    pending.current = null;
    if (!next || storage.phase !== 'READY') return;
    void guard(() => storage.repo.putItemSettings(next));
  }, [guard, storage]);

  const schedule = useCallback(
    (next: ItemSettings) => {
      pending.current = next;
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  // 화면을 떠나거나 탭을 닫을 때 남은 변경을 흘려보내지 않는다
  useEffect(() => {
    const onLeave = () => flush();
    window.addEventListener('beforeunload', onLeave);
    return () => {
      window.removeEventListener('beforeunload', onLeave);
      flush();
    };
  }, [flush]);

  const applyNow = useCallback(
    (next: ItemSettings) => {
      settingsRef.current = next;
      setSettings(next);
      schedule(next);
    },
    [schedule],
  );

  const api = useMemo<SettingsApi | null>(() => {
    if (!settings) return null;
    return {
      settings,
      apply: (next, undo) => {
        const prev = settingsRef.current;
        applyNow(next);
        if (undo && prev) {
          // ui-quality §4 — 삭제는 확인 팝업 대신 되돌리기 토스트
          toast(undo.message, {
            action: { label: '되돌리기', run: () => applyNow(prev) },
          });
        }
      },
      notify: (text, kind) => toast(text, kind ? { kind } : undefined),
      askDeleteMaster: (itemKind, id, name) =>
        setConfirming({ kind: 'DELETE_MASTER', itemKind, id, name }),
      newId,
      now: () => Date.now(),
    };
  }, [settings, applyNow, toast]);

  const displayName = project ? projectDisplayName(project) : '';

  const close = () => {
    flush();
    if (fromFloorId) navigate({ name: 'CANVAS', projectId, floorId: fromFloorId });
    else navigate({ name: 'SETUP', projectId });
  };

  const reloadSeed = () => {
    const cur = settingsRef.current;
    if (!cur) return;
    const r = mergeSeedInto(cur, Date.now());
    applyNow(r.settings);
    toast(describeMergeResult(r.added));
  };

  const changeDefaultStructureType = (v: StructureType | null) => {
    if (!project || storage.phase !== 'READY') return;
    const next = { ...project, defaultStructureType: v };
    setProject(next);
    void guard(() => storage.repo.putProject(next));
  };

  // ── 화면 ────────────────────────────────────────────────────────────────
  if (storage.phase === 'UNAVAILABLE') {
    return (
      <div className="page page--settings">
        <div className="empty empty--center">
          <p>이 브라우저에 데이터를 저장할 수 없어 설정을 열 수 없습니다.</p>
          <p className="muted">
            사생활 보호 모드이거나 저장이 차단되어 있습니다. 상단 배너의 안내를 확인해 주세요.
          </p>
          <button type="button" className="btn" onClick={() => navigate({ name: 'LIST' })}>
            용역 목록으로
          </button>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="page page--settings">
        <div className="empty empty--center">
          <p>용역을 찾지 못했습니다.</p>
          <button type="button" className="btn" onClick={() => navigate({ name: 'LIST' })}>
            용역 목록으로
          </button>
        </div>
      </div>
    );
  }

  if (loading || !project || !settings || !api) {
    return (
      <div className="page page--settings">
        <div className="page__head">
          <h1 className="page__title">설정을 불러오는 중…</h1>
        </div>
        <div className="set-skel" aria-hidden="true">
          <span className="skel skel--wide" />
          <span className="skel skel--wide" />
          <span className="skel skel--wide" />
        </div>
      </div>
    );
  }

  return (
    <div className="page page--settings">
      <div className="page__head">
        <div className="page__headMain">
          <h1 className="page__title">설정</h1>
          {/* D6 의 유일한 위험 지점 — 지금 어느 용역의 설정을 고치는 중인지 항상 보인다 */}
          <span className="set-scope" title={displayName}>
            {displayName}
          </span>
        </div>
        <div className="page__actions">
          <button
            type="button"
            className="btn"
            onClick={close}
            title={fromFloorId ? '들어온 층으로 돌아갑니다' : '용역 구성으로 돌아갑니다'}
          >
            닫기
          </button>
        </div>
      </div>

      <p className="set-lead">결함 입력 창에 표시되는 선택지의 내용과 순서를 구성합니다.</p>
      <p className="notice notice--scope">
        이 설정은 <b>{displayName}</b> 에만 적용됩니다. 다른 용역의 설정은 바뀌지 않습니다.
      </p>

      <div className="set-shell">
        <nav className="set-nav" aria-label="설정 메뉴">
          {NAV.map((group) => (
            <div className="set-nav__group" key={group.group}>
              <p className="set-nav__title">{group.group}</p>
              {group.entries.map((e) => (
                <button
                  key={e.label}
                  type="button"
                  className="set-nav__item"
                  data-indent={e.indent || undefined}
                  aria-pressed={e.id !== null && e.id === tab}
                  disabled={e.id === null}
                  title={e.soon ?? e.label}
                  onClick={() => e.id && setTab(e.id)}
                >
                  <span className="set-nav__label">{e.label}</span>
                  {e.soon && <span className="set-nav__soon">준비 중</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="set-main">
          {tab === 'ITEMS' && (
            <ItemsTab
              api={api}
              structureType={structureType}
              onStructureType={setStructureType}
              onReloadSeed={reloadSeed}
            />
          )}
          {tab === 'MISC' && (
            <MiscTab
              project={project}
              promotedAt={settings.snapshotFrom}
              onDefaultStructureType={changeDefaultStructureType}
              onReloadSeed={reloadSeed}
              onPromote={() => setConfirming({ kind: 'PROMOTE' })}
            />
          )}
        </div>
      </div>

      {confirming?.kind === 'DELETE_MASTER' && (
        <DeleteMasterDialog
          settings={settings}
          defects={defects}
          itemKind={confirming.itemKind}
          id={confirming.id}
          name={confirming.name}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const cur = settingsRef.current;
            setConfirming(null);
            if (!cur) return;
            applyNow(deleteMaster(cur, confirming.itemKind, confirming.id, Date.now()));
            toast(`'${confirming.name}' 을 완전히 삭제했습니다`, {
              action: { label: '되돌리기', run: () => applyNow(cur) },
            });
          }}
        />
      )}

      {confirming?.kind === 'PROMOTE' && (
        <ConfirmDialog
          title="이 설정을 기본값으로 저장할까요?"
          danger={false}
          confirmLabel="기본값으로 저장"
          body={
            <>
              <p>
                지금 <b>{displayName}</b> 의 항목 구성이 <b>새로 만드는 용역</b>의 초기값이 됩니다.
              </p>
              <p className="muted">
                이미 만들어진 다른 용역의 설정은 바뀌지 않습니다. 그 용역들은 자기 설정을 그대로
                유지합니다.
              </p>
            </>
          }
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            setConfirming(null);
            const cur = settingsRef.current;
            if (!cur || storage.phase !== 'READY') return;
            void guard(async () => {
              const org = await storage.repo.ensureOrgSettings();
              await storage.repo.putItemSettings(
                promoteToOrg(cur, org, { deviceId: storage.deviceId, now: Date.now() }),
              );
              toast('이 설정을 기본값으로 저장했습니다. 다음에 만드는 용역부터 적용됩니다.');
            });
          }}
        />
      )}
    </div>
  );
}

// ── 마스터 완전 삭제 확인 (§2-5-d) ─────────────────────────────────────────
/**
 * **실측 건수를 넣는다.** 마지막 줄이 이 설계의 안전장치다 —
 * 결함은 `id` 와 `name` 을 둘 다 저장하므로 설정을 지워도 보고서 데이터가 깨지지 않는다.
 */
function DeleteMasterDialog({
  settings,
  defects,
  itemKind,
  id,
  name,
  onConfirm,
  onCancel,
}: {
  settings: ItemSettings;
  defects: readonly Defect[];
  itemKind: ItemKind;
  id: string;
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const usage = masterUsage(settings, itemKind, id);
  const used = countDefectsUsing(defects, itemKind, id, name);

  const where: Record<ItemKind, string> = {
    MEMBER: `구조유형 ${usage.owners}개의 부재 목록에서 사라집니다.`,
    DEFECT_TYPE: `부재 ${usage.owners}개의 결함유형 목록에서 사라집니다.`,
    CAUSE: `결함유형 ${usage.owners}개의 발생원인 목록에서 사라집니다.`,
    REPAIR: `결함유형 ${usage.owners}개의 보수방안 목록에서 사라집니다.`,
  };

  return (
    <ConfirmDialog
      title={`'${name}' 을 완전히 삭제할까요?`}
      confirmLabel="완전히 삭제"
      onConfirm={onConfirm}
      onCancel={onCancel}
      body={
        <>
          <p>
            {ITEM_KIND_LABEL[itemKind]} <b>{name}</b> 을 마스터에서 지웁니다.
          </p>
          <p>{where[itemKind]}</p>
          <p className="muted">
            {used > 0
              ? `이미 입력된 결함 ${used}건은 그대로 유지됩니다 (기록된 이름이 남습니다).`
              : '이 항목으로 입력된 결함은 없습니다.'}
          </p>
        </>
      }
    />
  );
}

/** 이 마스터로 입력된 결함 건수. `id` 가 없던 옛 결함은 **이름으로도** 센다 */
function countDefectsUsing(
  defects: readonly Defect[],
  kind: ItemKind,
  id: string,
  name: string,
): number {
  let n = 0;
  for (const d of defects) {
    const hit =
      kind === 'MEMBER'
        ? d.memberId === id || (d.memberId === null && d.memberName === name)
        : kind === 'DEFECT_TYPE'
          ? d.defectTypeId === id || (d.defectTypeId === null && d.defectTypeName === name)
          : kind === 'CAUSE'
            ? d.causeId === id || (d.causeId === null && d.causeName === name)
            : d.repairId === id || (d.repairId === null && d.repairName === name);
    if (hit) n += 1;
  }
  return n;
}
