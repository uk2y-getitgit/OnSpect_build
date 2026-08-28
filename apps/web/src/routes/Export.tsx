/**
 * P6 산출물 출력 — `#/p/:pid/export` (Phase 4 스펙 §4-1).
 *
 * ⭐ **번호는 저장되지 않는다.** 층 칩의 구간(`1–12`)은 파라미터가 바뀔 때마다
 *    `assignNumbers()` 를 다시 돌려 실시간으로 갱신한다. 순수 함수라 비용이 없다.
 *
 * ⭐ **경고는 막지 않는다** (D3 원문: *"출력에서 자동 제외는 채택하지 않음 —
 *    사용자가 모르고 누락시킬 위험"*). 미완성 결함도 대표사진 없는 결함도 **포함하고 알린다**.
 *
 * ⭐ **한 번의 `[생성]` 은 하나의 `ExportRun` 을 공유한다** (K20) —
 *    4종의 번호가 어긋날 수 없다.
 *
 * ⭐ **`openDb()` 를 부르지 않는다.** 출력 이력은 전부 `storage.repo` 위임 메서드로 오간다
 *    (검수 경미 6 — 연결이 두 개가 되면 `deleteDatabase`·버전 업그레이드가 막힌다).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ARTIFACT_LABEL,
  DEFAULT_EXPORT_PARAMS,
  projectDisplayName,
  type ExportArtifactKind,
  type ExportParams,
  type ExportRun,
  type ItemSettings,
} from '@onspect/project-core';
import { useAppData } from '../data/appData';
import { newId } from '../data/idb/db';
import type { ProjectBundle } from '../data/idb/repo';
import { downloadSequential } from '../export/download';
import {
  describeDefect,
  exportFloors,
  floorNameMap,
  planExport,
  planFromRun,
  type ExportSource,
} from '../export/exportModel';
import { DAMAGE_REPEAT_ROWS } from '../export/damageTableFile';
import { FILE_ARTIFACTS, produceArtifacts } from '../export/produce';
import { CSV_FALLBACK_NOTICE } from '../export/xlsx';
import { hrefOf, navigate, type PrintKind } from '../router';
import { useToast } from '../ui/ToastHost';
import { FloorChips } from './export/FloorChips';
import { OptionsPanel } from './export/OptionsPanel';
import { RunHistory } from './export/RunHistory';

const ALL_KINDS: readonly ExportArtifactKind[] = [
  'DAMAGE_TABLE',
  'DEFECT_LIST',
  'PHOTO_BOOK',
  'LOCATION_MAP',
];

/**
 * 엑셀 인쇄 반복 행 안내 (M2 · Q36).
 *
 * 채택한 `write-excel-file` 은 `printTitles` 를 노출하지 않아 **머리말 5행이 첫 페이지에만**
 * 나온다. 실측 보고서는 NO 96 까지 가므로 손상결함표는 대개 여러 페이지다 —
 * `<계 속>` 이라는 문구 자체가 페이지마다 반복된다는 전제 위에서 뜻이 통한다.
 * 라이브러리를 바꾸는 대신 **사용자에게 한 줄로 알린다.** `$1:$5` 는 상수에서 만든다.
 */
const REPEAT_ROW_RANGE = `$1:$${DAMAGE_REPEAT_ROWS}`;
const REPEAT_ROW_NOTICE =
  `손상결함표가 여러 페이지로 나뉘면 엑셀에서 [페이지 레이아웃 → 인쇄 제목 → 반복할 행]에 ` +
  `${REPEAT_ROW_RANGE} 를 한 번 지정해 주세요 — 머리말이 페이지마다 반복됩니다.`;

/** 산출물별 안내 — 무엇이 파일로 나오고 무엇이 인쇄 뷰인지 (M3 · K1) */
const KIND_HINT: Record<ExportArtifactKind, string> = {
  DAMAGE_TABLE:
    `엑셀 파일로 내려받습니다 (13열 · 층 섹션 · 원인 범례). ` +
    `PDF 는 아래 이력에서 [손상결함표 PDF] (A4 가로). ${REPEAT_ROW_NOTICE}`,
  DEFECT_LIST: '엑셀 파일로 내려받습니다 (9열 축약). PDF 는 아래 이력에서 [PDF로 인쇄]',
  PHOTO_BOOK: '파일이 아니라 인쇄 뷰로 냅니다 — 생성 후 [사진첩 PDF] 를 누르세요',
  LOCATION_MAP: '층마다 PNG 1장을 내려받습니다',
};

type ListDialog = { title: string; items: string[] } | null;

export function Export({ projectId }: { projectId: string }) {
  const { storage, guard } = useAppData();
  const toast = useToast();

  const [bundle, setBundle] = useState<ProjectBundle | null>(null);
  const [settings, setSettings] = useState<ItemSettings | null>(null);
  const [runs, setRuns] = useState<ExportRun[]>([]);
  const [params, setParams] = useState<ExportParams>(() => DEFAULT_EXPORT_PARAMS([]));
  const [kinds, setKinds] = useState<ExportArtifactKind[]>([...ALL_KINDS]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<ListDialog>(null);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const initialized = useRef(false);

  // ── 로드 ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (storage.phase !== 'READY') return;
    const repo = storage.repo;
    let alive = true;
    setLoading(true);
    void (async () => {
      const b = await repo.loadBundle(projectId);
      if (!alive) return;
      if (!b) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const [s, list] = await Promise.all([
        repo.ensureProjectSettings(projectId),
        repo.listExportRuns(projectId),
      ]);
      if (!alive) return;
      setBundle(b);
      setSettings(s);
      setRuns(list);
      if (!initialized.current) {
        initialized.current = true;
        // 처음 열 때는 **지하→지상** 순서로 전부 선택해 둔다.
        // 누른 순서가 출력 순서라는 규칙(§4-4)은 그대로다 — 이건 그 시작값일 뿐이다
        setParams(DEFAULT_EXPORT_PARAMS(defaultFloorOrder(b)));
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [storage, projectId]);

  const source = useMemo<ExportSource | null>(
    () => (bundle && settings ? { bundle, settings } : null),
    [bundle, settings],
  );

  const floors = useMemo(() => (bundle ? exportFloors(bundle) : []), [bundle]);

  // ⭐ 파라미터가 바뀔 때마다 다시 계산한다 — 순수 함수라 비용이 없다
  const plan = useMemo(
    () => (source ? planExport(source, params) : null),
    [source, params],
  );

  const floorNames = useMemo(() => (bundle ? floorNameMap(bundle) : new Map()), [bundle]);
  const displayName = bundle ? projectDisplayName(bundle.project) : '';
  const kindSet = useMemo(() => new Set(kinds), [kinds]);

  const reloadRuns = useCallback(async () => {
    if (storage.phase !== 'READY') return;
    setRuns(await storage.repo.listExportRuns(projectId));
  }, [storage, projectId]);

  /**
   * 이력의 데이터 변경 경고가 볼 **비교 대상** — 지금 데이터를 **그 이력의 파라미터로** 다시 거른 것.
   *
   * `run.mapping` 은 그 출력의 필터를 통과한 결함만 담는다. 여기에 `bundle.defects` 전체를
   * 맞대면 층 선택·`includeRepaired: false` 로 빠진 결함이 전부 "추가됨"으로 세어져
   * **아무것도 안 바꿔도 경고가 뜬다**(검수 보통 1).
   *
   * `planExport` 를 재사용하므로 "번호는 한 곳에서만 센다"는 규칙을 깨지 않는다 —
   * 결과에서 **id 목록만** 쓰고 번호는 버린다. 출력에는 관여하지 않는다.
   */
  const currentIdsFor = useCallback(
    (r: ExportRun): string[] =>
      source ? planExport(source, r.params).rows.map((x) => x.defectId) : [],
    [source],
  );

  // ── 생성 ────────────────────────────────────────────────────────────────
  const run = useCallback(
    async (
      label: string,
      opts: {
        /** 새로 계산할지, 기존 이력의 mapping 을 그대로 쓸지 (§3-3) */
        existing: ExportRun | null;
      },
    ) => {
      if (!source || storage.phase !== 'READY' || !plan) return;
      const repo = storage.repo;
      const at = Date.now();

      const useParams = opts.existing ? opts.existing.params : params;
      const usePlan = opts.existing ? planFromRun(source, opts.existing) : plan;
      const useKinds = opts.existing
        ? new Set(
            (opts.existing.artifacts.length > 0
              ? [...new Set(opts.existing.artifacts.map((a) => a.kind))]
              : FILE_ARTIFACTS
            ).filter((k) => FILE_ARTIFACTS.includes(k)),
          )
        : new Set([...kindSet].filter((k) => FILE_ARTIFACTS.includes(k)));

      if (useKinds.size === 0 && !opts.existing) {
        // 사진첩만 골랐다 — 파일이 없으므로 이력만 남기고 인쇄 뷰로 안내한다
        if (!kindSet.has('PHOTO_BOOK')) {
          toast('출력할 산출물을 하나 이상 선택해 주세요', { kind: 'warn' });
          return;
        }
      }

      setBusy(label);
      try {
        const record: ExportRun = opts.existing ?? {
          id: newId(),
          projectId,
          createdAt: at,
          deviceId: storage.deviceId,
          params: useParams,
          mapping: Object.fromEntries(
            usePlan.rows.map((r) => [r.defectId, { no: r.no, photoNo: r.photoNo }]),
          ),
          order: usePlan.rows.map((r) => r.defectId),
          floorRanges: usePlan.floorRanges,
          defectCount: usePlan.rows.length,
          artifacts: [],
        };

        // ⭐ 이력을 **먼저** 남긴다. 다운로드가 중간에 막혀도 번호 스냅샷은 살아 있어야
        //    `[같은 번호로 다시 받기]` 가 성립한다
        if (!opts.existing) {
          await guard(() => repo.putExportRun(record));
          setLastRunId(record.id);
        }

        const out = await produceArtifacts({
          source,
          plan: usePlan,
          params: useParams,
          kinds: useKinds,
          displayName,
          at,
          repo,
          projectId,
        });

        if (out.items.length > 0) await downloadSequential(out.items);

        for (const a of out.artifacts) {
          await guard(() => repo.appendExportArtifact(record.id, a));
        }
        await guard(() => repo.pruneExportRuns(projectId));
        await reloadRuns();

        const parts: string[] = [];
        if (out.items.length > 0) parts.push(`파일 ${out.items.length}개를 내려받았습니다`);
        if (out.csvFallback.length > 0) parts.push(CSV_FALLBACK_NOTICE);
        for (const w of out.mapWarnings) parts.push(w.detail);
        if (kindSet.has('PHOTO_BOOK') && !opts.existing) {
          parts.push('사진첩은 아래 이력의 [사진첩 PDF] 로 인쇄하세요');
        }
        toast(parts.join(' · ') || '출력할 것이 없습니다', {
          kind: out.mapWarnings.length > 0 || out.csvFallback.length > 0 ? 'warn' : 'info',
          ttl: 12000,
        });
      } catch (e) {
        toast(`출력에 실패했습니다 — ${e instanceof Error ? e.message : String(e)}`, {
          kind: 'warn',
          ttl: 12000,
        });
      } finally {
        setBusy(null);
      }
    },
    [source, storage, plan, params, kindSet, projectId, displayName, guard, reloadRuns, toast],
  );

  const openPrint = useCallback(
    (runId: string, kind: PrintKind) => {
      window.open(
        `${window.location.pathname}${window.location.search}${hrefOf({
          name: 'EXPORT_PRINT',
          projectId,
          runId,
          kind,
        })}`,
        '_blank',
        'noopener',
      );
    },
    [projectId],
  );

  // ── 화면 ────────────────────────────────────────────────────────────────
  if (storage.phase === 'UNAVAILABLE') {
    return (
      <div className="page page--export">
        <div className="empty empty--center">
          <p>이 브라우저에 데이터를 저장할 수 없어 출력 화면을 열 수 없습니다.</p>
          <button type="button" className="btn" onClick={() => navigate({ name: 'LIST' })}>
            용역 목록으로
          </button>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="page page--export">
        <div className="empty empty--center">
          <p>용역을 찾지 못했습니다.</p>
          <button type="button" className="btn" onClick={() => navigate({ name: 'LIST' })}>
            용역 목록으로
          </button>
        </div>
      </div>
    );
  }

  if (loading || !bundle || !plan) {
    return (
      <div className="page page--export">
        <div className="page__head">
          <h1 className="page__title">출력 준비 중…</h1>
        </div>
        <div className="set-skel" aria-hidden="true">
          <span className="skel skel--wide" />
          <span className="skel skel--wide" />
        </div>
      </div>
    );
  }

  const incomplete = plan.warnings.incomplete;
  const noPhoto = plan.warnings.noPhoto;
  const canGenerate = plan.rows.length > 0 && kinds.length > 0 && busy === null;

  return (
    <div className="page page--export">
      <div className="page__head">
        <div className="page__headMain">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => navigate({ name: 'SETUP', projectId })}
          >
            ← 용역 구성
          </button>
          <h1 className="page__title">산출물 출력</h1>
          <span className="set-scope" title={displayName}>
            {displayName}
          </span>
        </div>
      </div>

      <div className="xp">
        <section className="panel xp-section">
          <h2 className="panel__title">
            1. 층 선택
            <span className="panel__meta">누른 순서가 곧 번호 순서입니다</span>
          </h2>
          <FloorChips
            floors={floors}
            selected={params.floorIds}
            ranges={plan.floorRanges}
            onChange={(next) => setParams((p) => ({ ...p, floorIds: next }))}
          />
        </section>

        <section className="panel xp-section">
          <h2 className="panel__title">2. 출력 옵션</h2>
          <OptionsPanel
            params={params}
            onChange={setParams}
            mapEnabled={kindSet.has('LOCATION_MAP')}
          />
        </section>

        {(incomplete.length > 0 || noPhoto.length > 0) && (
          <section className="panel xp-section xp-warnings">
            {incomplete.length > 0 && (
              <p className="notice notice--warn">
                미완성 결함 <b>{incomplete.length}건</b>이 포함됩니다 — 부재나 결함유형이
                비어 있습니다.
                <button
                  type="button"
                  className="btn btn--small btn--ghost"
                  onClick={() =>
                    setDialog({
                      title: `미완성 결함 ${incomplete.length}건`,
                      items: describeIds(bundle, floorNames, incomplete),
                    })
                  }
                >
                  목록 보기
                </button>
              </p>
            )}
            {noPhoto.length > 0 && (
              <p className="notice notice--warn">
                대표사진이 없는 결함 <b>{noPhoto.length}건</b> — 사진첩에서 빠지고 사진번호가{' '}
                <b>—</b> 로 나옵니다.
                <button
                  type="button"
                  className="btn btn--small btn--ghost"
                  onClick={() =>
                    setDialog({
                      title: `대표사진 없는 결함 ${noPhoto.length}건`,
                      items: describeIds(bundle, floorNames, noPhoto),
                    })
                  }
                >
                  목록 보기
                </button>
              </p>
            )}
          </section>
        )}

        <section className="panel xp-section">
          <h2 className="panel__title">3. 산출물</h2>
          <div className="xp-kinds">
            {ALL_KINDS.map((k) => (
              <label className="xp-check" key={k} title={KIND_HINT[k]}>
                <input
                  type="checkbox"
                  checked={kindSet.has(k)}
                  onChange={(e) =>
                    setKinds((cur) =>
                      e.target.checked ? [...cur, k] : cur.filter((x) => x !== k),
                    )
                  }
                />
                <span>{ARTIFACT_LABEL[k]}</span>
              </label>
            ))}
          </div>

          <div className="xp-summary">
            <span>
              대상 <b className="num">{plan.rows.length}</b>건 · 사진{' '}
              <b className="num">{plan.photoCount}</b>장
            </span>
            <span className="xp-summary__spacer" />
            <button
              type="button"
              className="btn btn--primary"
              disabled={!canGenerate}
              title={
                plan.rows.length === 0
                  ? '선택한 층에 출력할 결함이 없습니다'
                  : kinds.length === 0
                    ? '산출물을 하나 이상 선택해 주세요'
                    : '지금 데이터로 번호를 매기고 파일을 내려받습니다'
              }
              onClick={() => void run('생성', { existing: null })}
            >
              {busy === '생성' ? '만드는 중…' : '생성'}
            </button>
          </div>
          <p className="xp-hint">
            PDF 는 <b>인쇄 대화상자에서 &quot;PDF로 저장&quot;</b> 을 고르는 방식입니다 —
            앱이 PDF 파일을 직접 만들지 않습니다.
          </p>
          {/*
            M2 · Q36 — `title` 속성은 마우스를 올려야 보인다. 이건 파일을 열어 본 뒤에야
            알아차리는 종류의 제약이라 **상시 노출**한다 (검수 보통 3).
          */}
          {kindSet.has('DAMAGE_TABLE') && <p className="xp-hint">{REPEAT_ROW_NOTICE}</p>}
        </section>

        <section className="panel xp-section">
          <h2 className="panel__title">
            최근 출력
            <span className="panel__meta">번호를 그대로 다시 받을 수 있습니다</span>
          </h2>
          {lastRunId && (
            <p className="notice">
              방금 만든 출력으로 인쇄하려면 아래 첫 줄의 <b>[… PDF]</b> 버튼을 누르세요.
            </p>
          )}
          <RunHistory
            runs={runs}
            currentIdsFor={currentIdsFor}
            busyRunId={busy && busy !== '생성' ? busy : null}
            onRedownload={(r) => void run(r.id, { existing: r })}
            onPrint={(r, kind) => openPrint(r.id, kind as PrintKind)}
            onReuseParams={(r) => {
              setParams(r.params);
              window.scrollTo({ top: 0 });
              toast('이 출력의 옵션을 되살렸습니다 — [생성] 을 누르면 지금 데이터로 새로 매깁니다');
            }}
            onDelete={(r) => {
              setRuns((cur) => cur.filter((x) => x.id !== r.id));
              void guard(async () => {
                if (storage.phase !== 'READY') return;
                await storage.repo.deleteExportRun(r.id);
              });
            }}
          />
        </section>
      </div>

      {dialog && <DefectListDialog dialog={dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}

/** 경고 `[목록 보기]` — Esc 로 닫힌다 (ui-quality §7-1) */
function DefectListDialog({
  dialog,
  onClose,
}: {
  dialog: NonNullable<ListDialog>;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-scrim" onPointerDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={dialog.title}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <h2 className="modal__title">{dialog.title}</h2>
        <div className="modal__body">
          <ul className="xp-list">
            {dialog.items.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
          {dialog.items.length >= 200 && (
            <p className="muted">앞의 200건만 보여줍니다.</p>
          )}
        </div>
        <div className="modal__actions">
          <button type="button" className="btn" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 보조 ───────────────────────────────────────────────────────────────────
/** 처음 열 때의 층 순서 — 지하→지상 (불변식 #5 의 sortOrder 오름차순) */
function defaultFloorOrder(b: ProjectBundle): string[] {
  return [...b.floors].sort((x, y) => x.sortOrder - y.sortOrder).map((f) => f.id);
}

function describeIds(
  bundle: ProjectBundle,
  floorNames: Map<string, string>,
  ids: readonly string[],
): string[] {
  const byId = new Map(bundle.defects.map((d) => [d.id, d]));
  return ids
    .map((id) => {
      const d = byId.get(id);
      return d ? describeDefect(d, floorNames.get(d.floorId) ?? '') : id;
    })
    .slice(0, 200);
}
