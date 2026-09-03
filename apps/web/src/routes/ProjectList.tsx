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
  isoOf,
  matchesQuery,
  projectDisplayName,
  type ProjectSummary,
} from '@onspect/project-core';
import { useAppData } from '../data/appData';
import { estimateStorage } from '../data/idb/db';
import { exportProjectToZip, importProjectFromZip } from '../data/projectTransfer';
import { seedSampleProject, SAMPLE_SUMMARY } from '../data/sampleProject';
import { navigate } from '../router';
import { BusyButton, EmptyState } from '../ui/Form';
import { MoreMenu } from '../ui/Menu';
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

  const removeProject = useCallback(
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

  const importFromFile = useCallback(
    async (file: File) => {
      if (storage.phase !== 'READY' || importing) return;
      setImporting(true);
      try {
        // `guard()`(저장 실패 배너)를 안 쓴다 — "잘못된 파일"은 저장 실패가 아니라
        // 사용자가 파일을 잘못 골랐다는 뜻이라 토스트로 충분하다
        const r = await importProjectFromZip(storage.repo, file);
        reload();
        toast(`'${r.projectName}'을(를) 새 용역으로 가져왔습니다`);
        navigate({ name: 'SETUP', projectId: r.projectId });
      } catch (err) {
        toast(err instanceof Error ? err.message : '가져오기에 실패했습니다', { kind: 'warn' });
      } finally {
        setImporting(false);
      }
    },
    [storage, importing, reload, toast],
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
    </div>
  );
}

/**
 * 기기 저장 여유 (P5) — 현장에 나가기 **전에** 보여야 의미가 있다.
 * 사진 수백 장이 들어가는 앱이라 "다 찍고 나서 용량 부족"이 최악이다.
 */
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
