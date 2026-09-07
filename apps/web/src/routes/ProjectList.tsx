/**
 * P1 용역 목록 — S1 스펙 §2-2 · §2-5 · §2-11 (T4).
 *
 * 앱 최초 진입은 항상 여기다. **마지막 용역으로 자동 진입하지 않는다** —
 * 다른 용역을 열려던 사용자를 방해한다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  formatBytes,
  formatDateTime,
  formatRelative,
  findProjectsWithSameIdentity,
  isoOf,
  matchesQuery,
  projectDisplayName,
  type ProjectSummary,
} from '@onspect/project-core';
import { useAppData } from '../data/appData';
import { estimateStorage } from '../data/idb/db';
import {
  exportProjectToZip,
  importParsedProject,
  readProjectZip,
  type ImportMode,
  type ParsedProjectZip,
} from '../data/projectTransfer';
import { seedSampleProject, SAMPLE_SUMMARY } from '../data/sampleProject';
import { readSyncState } from '../data/sync';
import { navigate } from '../router';
import { RemoteProjectsButton } from './RemoteProjects';
import { SyncButton } from './SyncButton';
import { BusyButton, EmptyState, Modal } from '../ui/Form';
import { MoreMenu } from '../ui/Menu';
import { ConfirmDialog } from '../ui/Overlays';
import { useToast } from '../ui/ToastHost';

/**
 * 여유가 이만큼도 안 남으면 경고색으로 바꾼다 (P5).
 * 사진 인입이 실제로 막히는 선은 8MB(`photoIngest.STORAGE_HEADROOM`)지만,
 * **막히고 나서 알려주면 늦다.** 사진 한 묶음(≈50장 × 렌더+썸네일+원본)이 들어갈 여유를 기준으로 잡았다.
 */
const LOW_STORAGE_BYTES = 500 * 1024 * 1024;

export function ProjectList() {
  const { storage, guard, reloadKey, reload } = useAppData();
  const toast = useToast();
  const [summaries, setSummaries] = useState<ProjectSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const [seeding, setSeeding] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  /** 기기 저장 여유 (P5). `null` = 브라우저가 알려주지 않음 — 그럴 땐 아무것도 표시하지 않는다 */
  const [space, setSpace] = useState<{ usage: number; quota: number } | null>(null);

  // 상대시간이 `방금` 에 멈춰 있으면 화면이 죽은 것처럼 보인다
  useEffect(() => {
    const h = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(h);
  }, []);

  useEffect(() => {
    if (storage.phase !== 'READY') return;
    let alive = true;
    storage.repo.listProjectSummaries().then((rows) => {
      if (alive) setSummaries(rows);
    });
    return () => {
      alive = false;
    };
  }, [storage, reloadKey]);

  // 저장 여유 (P5) — 목록을 다시 읽을 때마다 같이 갱신한다(삭제 직후 숫자가 안 맞으면 이상하다)
  useEffect(() => {
    let alive = true;
    void estimateStorage().then((e) => {
      if (alive) setSpace(e);
    });
    return () => {
      alive = false;
    };
  }, [reloadKey, summaries]);

  const filtered = useMemo(() => {
    if (!summaries) return null;
    return summaries.filter((s) => matchesQuery(query, s.project));
  }, [summaries, query]);

  const openProject = useCallback(
    (id: string) => {
      if (storage.phase === 'READY') void guard(() => storage.repo.touchProject(id, Date.now()));
      navigate({ name: 'SETUP', projectId: id });
    },
    [storage, guard],
  );

  /**
   * D43 — 동기화된 적 있는 용역은 **삭제가 다른 기기까지 전파된다.**
   * 로컬 전용 용역은 지금까지대로 즉시 삭제 + `되돌리기` 토스트(확인 창을 새로 끼워 넣지 않는다).
   */
  const [syncedDelete, setSyncedDelete] = useState<ProjectSummary | null>(null);

  const doRemoveProject = useCallback(
    async (s: ProjectSummary) => {
      if (storage.phase !== 'READY') return;
      const name = projectDisplayName(s.project);
      await guard(() => storage.repo.softDeleteProject(s.project.id, Date.now()));
      reload();
      toast(`'${name}'을 삭제했습니다`, {
        ttl: 10_000,
        action: {
          label: '되돌리기',
          run: () => {
            void guard(() => storage.repo.restoreProject(s.project.id)).then(reload);
          },
        },
      });
    },
    [storage, guard, reload, toast],
  );

  const removeProject = useCallback(
    async (s: ProjectSummary) => {
      if (storage.phase !== 'READY') return;
      // "동기화된 적 있음" 의 신호는 `meta` KV `sync:{projectId}` 의 존재다.
      // 성공(`writeSyncState`)이든 실패(`recordSyncFailure`)든 한 번이라도 동기화를 시도했으면
      // `lastSyncedAt` 이 찍힌다 — 실패한 회차도 그 전에 용역 행은 이미 서버에 올라갔을 수 있으므로
      // **넓게 잡는 쪽이 맞다.** 안내가 한 번 더 뜨는 것은 무해하고, 안 뜨는 것이 사고다.
      const state = await readSyncState(s.project.id);
      if (state.lastSyncedAt > 0) {
        setSyncedDelete(s);
        return;
      }
      await doRemoveProject(s);
    },
    [storage, doRemoveProject],
  );

  const makeSample = useCallback(async () => {
    if (storage.phase !== 'READY' || seeding) return;
    setSeeding(true);
    const r = await guard(() => seedSampleProject(storage.repo, storage.deviceId));
    setSeeding(false);
    if (!r) return;
    reload();
    toast(`샘플 용역을 만들었습니다 — ${SAMPLE_SUMMARY}`);
    navigate({ name: 'SETUP', projectId: r.project.id });
  }, [storage, seeding, guard, reload, toast]);

  // ── D38(Q74) — 로그인 없이 기기 간 이동: 파일로 내보내기/가져오기 ─────────────
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const exportProject = useCallback(
    async (s: ProjectSummary) => {
      if (storage.phase !== 'READY' || exportingId) return;
      const name = projectDisplayName(s.project);
      setExportingId(s.project.id);
      try {
        const { blob, fileName } = await exportProjectToZip(storage.repo, s.project.id);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        toast(`'${name}'을 파일로 내보냈습니다 — ${fileName}`);
      } catch (err) {
        toast(err instanceof Error ? err.message : '내보내기에 실패했습니다', { kind: 'warn' });
      } finally {
        setExportingId(null);
      }
    },
    [storage, exportingId, toast],
  );

  /**
   * D46(Q80) — 파일 안 용역이 **이름·연도·반기·종류 전부** 같은 기존 용역과 겹칠 때 뜨는 확인창.
   * 자동 덮어쓰기는 하지 않는다(이름은 고유 키가 아니다). 사용자가 매번 고른다.
   */
  const [dupPrompt, setDupPrompt] = useState<{
    parsed: ParsedProjectZip;
    candidates: ProjectSummary[];
  } | null>(null);

  /** 실제 심기 — 새로 만들기·덮어쓰기 두 경로가 이 하나를 공유한다 */
  const runImport = useCallback(
    async (parsed: ParsedProjectZip, mode: ImportMode) => {
      if (storage.phase !== 'READY') return;
      setImporting(true);
      try {
        const r = await importParsedProject(storage.repo, parsed, mode);
        reload();
        toast(
          mode.kind === 'OVERWRITE'
            ? `'${r.projectName}'을(를) 파일 내용으로 덮어썼습니다`
            : `'${r.projectName}'을(를) 새 용역으로 가져왔습니다`,
        );
        navigate({ name: 'SETUP', projectId: r.projectId });
      } catch (err) {
        toast(err instanceof Error ? err.message : '가져오기에 실패했습니다', { kind: 'warn' });
      } finally {
        setImporting(false);
      }
    },
    [storage, reload, toast],
  );

  const importFromFile = useCallback(
    async (file: File) => {
      if (storage.phase !== 'READY' || importing) return;
      setImporting(true);
      let parsed: ParsedProjectZip;
      try {
        // `guard()`(저장 실패 배너)를 안 쓴다 — "잘못된 파일"은 저장 실패가 아니라
        // 사용자가 파일을 잘못 골랐다는 뜻이라 토스트로 충분하다
        parsed = await readProjectZip(file);
      } catch (err) {
        toast(err instanceof Error ? err.message : '가져오기에 실패했습니다', { kind: 'warn' });
        setImporting(false);
        return;
      }
      // 휴지통에 든 용역은 후보에서 뺀다 — `listProjectSummaries` 가 이미 걸러 준다.
      // 지운 용역을 말없이 되살려 덮어쓰는 쪽이 더 놀랍다
      const candidates = findProjectsWithSameIdentity(
        summaries ?? [],
        parsed.project,
        (s) => s.project,
      );
      if (candidates.length === 0) {
        await runImport(parsed, { kind: 'NEW' });
        return;
      }
      setImporting(false);
      setDupPrompt({ parsed, candidates });
    },
    [storage, importing, summaries, runImport, toast],
  );

  if (storage.phase === 'LOADING' || filtered === null) {
    return (
      <div className="page">
        <div className="page__head">
          <h1 className="page__title">용역</h1>
        </div>
        <ul className="plist" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="plist__row plist__row--skeleton">
              <span className="skel skel--wide" />
              <span className="skel" />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const empty = summaries !== null && summaries.length === 0;

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="page__title">용역</h1>
        <div className="page__actions">
          <div className="search">
            <label className="visually-hidden" htmlFor="project-search">
              용역 검색
            </label>
            <input
              id="project-search"
              className="input search__input"
              type="search"
              placeholder="용역명 · 연도 · 점검구분으로 검색"
              value={query}
              disabled={empty}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query !== '' && (
              <button
                type="button"
                className="search__clear"
                aria-label="검색어 지우기"
                onClick={() => setQuery('')}
              >
                ✕
              </button>
            )}
          </div>
          <BusyButton
            busy={seeding}
            className="btn"
            title={`샘플 용역을 만들어 바로 확인합니다 — ${SAMPLE_SUMMARY}`}
            onClick={() => void makeSample()}
          >
            샘플 용역 만들기
          </BusyButton>
          {/* D38(Q74) — 로그인 없이 기기 간 이동. 항상 새 용역으로 들어온다(같은 파일 재수입 안전) */}
          <input
            ref={importInputRef}
            type="file"
            accept=".zip,application/zip"
            className="visually-hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ''; // 같은 파일을 연달아 골라도 change가 다시 뜨게
              if (file) void importFromFile(file);
            }}
          />
          <BusyButton
            busy={importing}
            className="btn"
            title="다른 기기에서 내보낸 OnSpect 백업 파일(.zip)을 새 용역으로 불러옵니다"
            onClick={() => importInputRef.current?.click()}
          >
            파일에서 가져오기
          </BusyButton>
          {/* D42 — 서버 id 그대로 받는다. 위 [파일에서 가져오기](새 id 발급)와 전혀 다른 경로다 */}
          <RemoteProjectsButton />
          <button type="button" className="btn btn--primary" onClick={() => navigate({ name: 'NEW' })}>
            용역 만들기
          </button>
        </div>
      </div>

      {empty ? (
        <EmptyState
          title="아직 등록된 용역이 없습니다"
          body="용역을 만들면 동 · 층을 구성하고 도면을 올릴 수 있습니다. 바로 확인해 보려면 샘플 용역을 만들어 보세요."
          action={
            <>
              <button type="button" className="btn btn--primary" onClick={() => navigate({ name: 'NEW' })}>
                용역 만들기
              </button>
              <BusyButton busy={seeding} className="btn" onClick={() => void makeSample()}>
                샘플 용역 만들기
              </BusyButton>
              {/* 새 기기의 첫 화면이 바로 여기다 — 서버에 있는 용역을 여기서 바로 받게 한다(D42) */}
              <RemoteProjectsButton />
            </>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="검색 결과가 없습니다"
          body={
            <>
              <b className="quote">{query}</b> 과(와) 일치하는 용역이 없습니다.
            </>
          }
          action={
            <button type="button" className="btn" onClick={() => setQuery('')}>
              검색어 지우기
            </button>
          }
        />
      ) : (
        <ul className="plist">
          {filtered.map((s) => {
            const name = projectDisplayName(s.project);
            return (
              <li key={s.project.id} className="plist__item">
                <button
                  type="button"
                  className="plist__row"
                  onClick={() => openProject(s.project.id)}
                  title={name}
                >
                  <span className="plist__name">{name}</span>
                  <span className="plist__meta">
                    <time
                      className="plist__time"
                      dateTime={isoOf(s.project.lastOpenedAt)}
                      title={`최근 접속 ${formatDateTime(s.project.lastOpenedAt)}`}
                    >
                      {formatRelative(now, s.project.lastOpenedAt)}
                    </time>
                    <span className="plist__stats">
                      도면 <span className="num">{s.drawingCount}</span>장 · 결함{' '}
                      <span className="num">{s.defectCount}</span>건
                      {s.byteSize > 0 && (
                        <>
                          {' '}
                          · 약 <span className="num">{formatBytes(s.byteSize)}</span>
                        </>
                      )}
                    </span>
                  </span>
                </button>

                {/* Phase 5 — 프로젝트별 수동 동기화. **누를 때만** 통신한다(§3-7 규칙 0) */}
                <SyncButton projectId={s.project.id} projectName={name} />

                <MoreMenu
                  label={`${name} 추가 작업`}
                  items={[
                    {
                      label: '이름 · 정보 수정',
                      onSelect: () => navigate({ name: 'EDIT', projectId: s.project.id }),
                    },
                    {
                      // D38(Q74) — 로그인 없이 기기 간 이동. 다른 기기의 [파일에서 가져오기]로 이어진다
                      label: exportingId === s.project.id ? '내보내는 중…' : '파일로 내보내기',
                      onSelect: () => void exportProject(s),
                    },
                    {
                      label: '삭제',
                      danger: true,
                      separatorBefore: true,
                      onSelect: () => void removeProject(s),
                    },
                  ]}
                />
              </li>
            );
          })}
        </ul>
      )}

      {/* 저장이 로컬 단일본이라는 사실을 계속 노출한다 (§2-9-f) */}
      <p className="page__note">
        데이터는 이 브라우저에만 저장됩니다. 브라우저 데이터를 지우면 함께 사라집니다.
      </p>

      <StorageNote space={space} />

      {/* D46 — 같은 용역이 이미 있다. 새로 만들지 덮어쓸지 **사용자가** 고른다 */}
      {dupPrompt && (
        <ImportDuplicateDialog
          incomingName={projectDisplayName(dupPrompt.parsed.project)}
          candidates={dupPrompt.candidates}
          onCancel={() => setDupPrompt(null)}
          onChoose={(mode) => {
            const { parsed } = dupPrompt;
            setDupPrompt(null);
            void runImport(parsed, mode);
          }}
        />
      )}

      {/* D43 — 동기화된 용역 삭제는 팀 전체에 전파된다. 지우기 전에 그 사실을 알린다 */}
      {syncedDelete && (
        <ConfirmDialog
          title="동기화된 용역입니다"
          body={
            <>
              <p>
                <b className="quote">{projectDisplayName(syncedDelete.project)}</b> 은(는) 서버와
                동기화된 용역입니다.
              </p>
              <p>
                지운 뒤 동기화하면 <b>다른 기기에서도 사라집니다.</b>
              </p>
              <p className="muted">
                이 기기에서는 삭제 직후 <b>되돌리기</b>로 복구할 수 있습니다.
              </p>
            </>
          }
          confirmLabel="삭제"
          onConfirm={() => {
            const s = syncedDelete;
            setSyncedDelete(null);
            void doRemoveProject(s);
          }}
          onCancel={() => setSyncedDelete(null)}
        />
      )}
    </div>
  );
}

/**
 * 기기 저장 여유 (P5) — 현장에 나가기 **전에** 보여야 의미가 있다.
 * 사진 수백 장이 들어가는 앱이라 "다 찍고 나서 용량 부족"이 최악이다.
 */
/**
 * D46(Q80) — 파일 안 용역이 이미 로컬에 있을 때 뜨는 선택창.
 *
 * ⚠️ **자동 덮어쓰기는 없다.** 이름은 고유 키가 아니라 이름·연도·반기·종류가 다 같아도
 *    서로 다른 용역일 수 있다 — 남의 용역을 통째로 날리는 사고를 막으려면 매번 물어야 한다.
 *
 * ⚠️ 후보가 **여러 개**일 수 있다(같은 이름의 용역을 두 개 만들 수 있으니까).
 *    그때는 어느 것을 덮어쓸지 고르게 한다. 기본값은 목록 맨 위(가장 최근 접속)다.
 *
 * 스크림 클릭으로는 닫히지 않는다(U32) — 여기서 잘못 눌리면 되돌릴 수 없는 삭제가 걸린다.
 */
function countsOf(s: ProjectSummary): string {
  return `동 ${s.buildingCount} · 층 ${s.floorCount} · 도면 ${s.drawingCount} · 결함 ${s.defectCount}`;
}

function ImportDuplicateDialog({
  incomingName,
  candidates,
  onCancel,
  onChoose,
}: {
  incomingName: string;
  candidates: readonly ProjectSummary[];
  onCancel: () => void;
  onChoose: (mode: ImportMode) => void;
}) {
  const [targetId, setTargetId] = useState(candidates[0]?.project.id ?? '');
  const target = candidates.find((c) => c.project.id === targetId) ?? candidates[0] ?? null;

  return (
    <Modal
      title="같은 용역이 이미 있습니다"
      subtitle={incomingName}
      autoFocusFirst={false}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel}>
            취소
          </button>
          <button
            type="button"
            className="btn btn--danger"
            disabled={target === null}
            onClick={() => {
              if (target) onChoose({ kind: 'OVERWRITE', projectId: target.project.id });
            }}
          >
            덮어쓰기
          </button>
          <button type="button" className="btn btn--primary" onClick={() => onChoose({ kind: 'NEW' })}>
            새로 만들기
          </button>
        </>
      }
    >
      <p className="impdup__lead">
        이름 · 연도 · 반기 · 점검종류가 <b>모두 같은</b> 용역이 이 기기에 이미 있습니다.
      </p>

      {candidates.length === 1 ? (
        <p className="impdup__one">
          기존 용역 <b className="quote">{projectDisplayName(candidates[0]!.project)}</b>
          <span className="impdup__counts">{countsOf(candidates[0]!)}</span>
        </p>
      ) : (
        <fieldset className="impdup__pick">
          <legend className="impdup__legend">덮어쓸 용역을 고르세요</legend>
          {candidates.map((c) => (
            <label key={c.project.id} className="impdup__opt">
              <input
                type="radio"
                name="import-overwrite-target"
                checked={targetId === c.project.id}
                onChange={() => setTargetId(c.project.id)}
              />
              <span>
                {projectDisplayName(c.project)}
                <span className="impdup__counts">{countsOf(c)}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <ul className="impdup__choices">
        <li>
          <b>새로 만들기</b> — 기존 용역은 그대로 두고 <b>별개의 새 용역</b>으로 들여옵니다.
        </li>
        <li>
          <b>덮어쓰기</b> — 기존 용역의 동 · 층 · 도면 · 결함 · 메모 · 사진 · 항목설정을{' '}
          <b>전부 지우고</b> 파일 내용으로 대체합니다. 용역 자체는 같은 용역으로 남아 서버 동기화가
          그대로 이어집니다.
        </li>
      </ul>
      <p className="notice notice--warn">
        덮어쓰기는 <b>되돌릴 수 없습니다.</b> 기존 내용이 필요하면 먼저 <b>[파일로 내보내기]</b>로
        받아 두세요.
      </p>
    </Modal>
  );
}

function StorageNote({ space }: { space: { usage: number; quota: number } | null }) {
  // 브라우저가 추정치를 안 주면(사생활 보호 모드 등) 침묵한다. 0GB 라고 거짓말하지 않는다
  if (!space || space.quota <= 0) return null;
  const free = Math.max(0, space.quota - space.usage);
  const low = free < LOW_STORAGE_BYTES;

  return (
    <p className="page__storage" data-low={low ? '1' : undefined} role="status">
      기기 여유 <b className="num">{formatBytes(free)}</b>
      <span className="muted">
        {' '}
        · 이 앱이 쓰는 중 <span className="num">{formatBytes(space.usage)}</span>
      </span>
      {low && (
        <b className="page__storageWarn">
          {' '}
          — 저장 공간이 얼마 남지 않았습니다. 다 쓴 용역을 지우고 현장에 나가세요.
        </b>
      )}
    </p>
  );
}
