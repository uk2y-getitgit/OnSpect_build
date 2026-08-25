/**
 * 인쇄 뷰 라우트 `#/p/:pid/export/print?run={runId}&kind={...}` — Phase 4 스펙 §4-9.
 *
 * ⭐ **PDF 라이브러리를 넣지 않는다** (K1 · Q32). `window.print()` + CSS `@page` 로 낸다.
 *    사용자는 인쇄 대화상자에서 `PDF로 저장` 을 고른다. 그래서 버튼 라벨이
 *    `[PDF 다운로드]` 가 아니라 **`[PDF로 인쇄]`** 이고, 안내 문구를 상시 노출한다.
 *
 * ⭐ **번호를 다시 계산하지 않는다.** `ExportRun.mapping` 을 그대로 쓴다 —
 *    같은 `run` 으로 연 손상결함표·사진첩·조사위치도의 번호가 어긋날 수 없다(K20).
 *
 * ⭐ **모든 `<img>` 의 `decode()` 를 기다린 뒤 인쇄한다.** 안 기다리면 빈 칸이 인쇄된다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ARTIFACT_LABEL, type ExportRun, type ItemSettings } from '@onspect/project-core';
import { useAppData } from '../../data/appData';
import type { PrintKind } from '../../router';
import { defectListModel, photoBookModel, planFromRun, type ExportSource } from '../exportModel';
import { releaseLocationMaps, renderLocationMaps, type LocationMapPage } from '../locationMap';
import { PrintDefectList } from './PrintDefectList';
import { PrintLocationMap } from './PrintLocationMap';
import { PrintPhotoBook } from './PrintPhotoBook';
import './print.css';

const KIND_TO_ARTIFACT: Record<PrintKind, keyof typeof ARTIFACT_LABEL> = {
  DEFECT_LIST: 'DEFECT_LIST',
  PHOTO_BOOK: 'PHOTO_BOOK',
  LOCATION_MAP: 'LOCATION_MAP',
};

/** 조사위치도만 가로. 나머지는 세로 (§4-9) */
function pageRule(kind: PrintKind): string {
  const orientation = kind === 'LOCATION_MAP' ? 'landscape' : 'portrait';
  return `@page { size: A4 ${orientation}; margin: 12mm; }`;
}

type Loaded = {
  source: ExportSource;
  run: ExportRun;
  photoUrls: Record<string, string>;
  maps: LocationMapPage[];
};

export function PrintRoute({
  projectId,
  runId,
  kind,
}: {
  projectId: string;
  runId: string;
  kind: PrintKind;
}) {
  const { storage } = useAppData();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const printed = useRef(false);

  // `@page` 는 산출물마다 방향이 달라 런타임에 주입한다 — 전역 CSS 에 두면
  // 다른 화면에서 Ctrl+P 를 눌렀을 때도 A4 가 강제된다
  useEffect(() => {
    const el = document.createElement('style');
    el.textContent = pageRule(kind);
    document.head.appendChild(el);
    document.body.dataset.printView = '1';
    return () => {
      el.remove();
      delete document.body.dataset.printView;
    };
  }, [kind]);

  useEffect(() => {
    if (storage.phase !== 'READY') return;
    const repo = storage.repo;
    let alive = true;
    let created: LocationMapPage[] = [];

    void (async () => {
      try {
        const [bundle, settings, run] = await Promise.all([
          repo.loadBundle(projectId),
          repo.ensureProjectSettings(projectId),
          repo.getExportRun(runId),
        ]);
        if (!alive) return;
        if (!bundle) throw new Error('용역을 찾지 못했습니다');
        if (!run) throw new Error('출력 이력을 찾지 못했습니다 — 창을 닫고 다시 생성해 주세요');

        const source: ExportSource = { bundle, settings: settings as ItemSettings };
        const plan = planFromRun(source, run);

        let photoUrls: Record<string, string> = {};
        let maps: LocationMapPage[] = [];

        if (kind === 'PHOTO_BOOK') {
          photoUrls = await loadPhotoUrls(repo, projectId, source, plan.rows);
        } else if (kind === 'LOCATION_MAP') {
          const r = await renderLocationMaps({
            project: bundle.project,
            drawings: bundle.drawings,
            defects: bundle.defects,
            memos: bundle.memos,
            floors: bundle.floors,
            floorIds: run.params.floorIds,
            displayNumbers: displayNumbersOf(run),
            includedDefectIds: new Set(plan.rows.map((r2) => r2.defectId)),
            params: run.params,
            objectUrl: (key) => repo.objectUrl(key, projectId),
            readBlob: (key) => repo.readBlob(key),
          });
          maps = r.pages;
          created = r.pages;
        }

        if (!alive) {
          releaseLocationMaps(created);
          return;
        }
        setData({ source, run, photoUrls, maps });
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      alive = false;
      // 조사위치도 PNG 의 objectURL 만 우리가 만들었다. 사진·도면 URL 은 repo 캐시 소유다
      releaseLocationMaps(created);
    };
  }, [storage, projectId, runId, kind]);

  const listModel = useMemo(() => {
    if (!data || kind !== 'DEFECT_LIST') return null;
    return defectListModel(data.source, planFromRun(data.source, data.run), data.run.params);
  }, [data, kind]);

  const bookPages = useMemo(() => {
    if (!data || kind !== 'PHOTO_BOOK') return null;
    return photoBookModel(data.source, planFromRun(data.source, data.run));
  }, [data, kind]);

  // 렌더가 끝나고 **모든 이미지가 디코드된 뒤** 인쇄한다
  useEffect(() => {
    if (!data || printed.current) return;
    const root = rootRef.current;
    if (!root) return;
    printed.current = true;
    let cancelled = false;
    void (async () => {
      await waitForImages(root);
      if (cancelled) return;
      // 레이아웃이 한 프레임 안정된 뒤에 연다
      requestAnimationFrame(() => {
        if (!cancelled) window.print();
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [data]);

  const label = ARTIFACT_LABEL[KIND_TO_ARTIFACT[kind]];

  return (
    <div className="pv-root" ref={rootRef}>
      <div className="pv-bar">
        <span className="pv-bar__title">{label}</span>
        <span className="pv-bar__hint">
          인쇄 대화상자에서 <b>&quot;PDF로 저장&quot;</b>을 선택하세요
        </span>
        <span className="pv-bar__spacer" />
        <button type="button" className="btn btn--primary" onClick={() => window.print()}>
          PDF로 인쇄
        </button>
        <button type="button" className="btn" onClick={() => window.close()}>
          닫기
        </button>
      </div>

      {error && <p className="pv-status pv-status--error">{error}</p>}
      {!error && !data && <p className="pv-status">문서를 만드는 중…</p>}

      {data && kind === 'DEFECT_LIST' && listModel && <PrintDefectList model={listModel} />}
      {data && kind === 'PHOTO_BOOK' && bookPages && (
        <PrintPhotoBook pages={bookPages} urls={data.photoUrls} />
      )}
      {data && kind === 'LOCATION_MAP' && <PrintLocationMap pages={data.maps} />}
    </div>
  );
}

// ── 보조 ───────────────────────────────────────────────────────────────────
function displayNumbersOf(run: ExportRun): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, m] of Object.entries(run.mapping)) out[id] = String(m.no);
  return out;
}

async function loadPhotoUrls(
  repo: { objectUrl: (key: string, projectId: string) => Promise<string | null> },
  projectId: string,
  source: ExportSource,
  rows: readonly { defectId: string }[],
): Promise<Record<string, string>> {
  const wanted = new Set(rows.map((r) => r.defectId));
  const keys = new Set<string>();
  for (const p of source.bundle.photos) {
    if (p.isPrimary && wanted.has(p.defectId)) keys.add(p.renderBlobKey);
  }
  const out: Record<string, string> = {};
  for (const key of keys) {
    const u = await repo.objectUrl(key, projectId);
    if (u) out[key] = u;
  }
  return out;
}

/**
 * 모든 `<img>` 가 디코드될 때까지 기다린다 (§4-9).
 * 하나가 실패해도 나머지는 인쇄한다 — 빈 칸이 낫지, 인쇄가 아예 안 되면 안 된다.
 */
async function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(
    imgs.map(async (im) => {
      try {
        if (!im.complete) {
          await new Promise<void>((resolve) => {
            im.addEventListener('load', () => resolve(), { once: true });
            im.addEventListener('error', () => resolve(), { once: true });
          });
        }
        await im.decode();
      } catch {
        /* 실패한 이미지는 건너뛴다 */
      }
    }),
  );
}
