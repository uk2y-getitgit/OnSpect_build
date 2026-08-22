/**
 * P1 용역 목록 — S1 스펙 §2-2 · §2-5 · §2-11 (T4).
 *
 * 앱 최초 진입은 항상 여기다. **마지막 용역으로 자동 진입하지 않는다** —
 * 다른 용역을 열려던 사용자를 방해한다.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { seedSampleProject, SAMPLE_SUMMARY } from '../data/sampleProject';
import { navigate } from '../router';
import { BusyButton, EmptyState } from '../ui/Form';
import { MoreMenu } from '../ui/Menu';
import { useToast } from '../ui/ToastHost';

export function ProjectList() {
  const { storage, guard, reloadKey, reload } = useAppData();
  const toast = useToast();
  const [summaries, setSummaries] = useState<ProjectSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const [seeding, setSeeding] = useState(false);
  const [now, setNow] = useState(() => Date.now());

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
    </div>
  );
}
