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
 * ⭐ **자동으로 인쇄하지 않는다** (F-2 · 스펙 §2-3). 이 화면은 미리보기이고,
 *    `window.print()` 는 사용자가 `[PDF로 인쇄]` 를 눌렀을 때만 열린다.
 *
 * ⭐ **모든 `<img>` 의 `decode()` 를 기다린 뒤에야 인쇄 버튼이 열린다.**
 *    안 기다리고 인쇄하면 빈 칸이 인쇄된다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ARTIFACT_LABEL,
  type ExportRun,
  type ItemSettings,
  type PhotoBookPage,
} from '@onspect/project-core';
import { useAppData } from '../../data/appData';
import type { PrintKind } from '../../router';
import {
  damageTableModel,
  defectListModel,
  photoBookModel,
  planFromRun,
  type ExportSource,
} from '../exportModel';
import { releaseLocationMaps, renderLocationMaps, type LocationMapPage } from '../locationMap';
import { PrintDamageTable } from './PrintDamageTable';
import { PrintDefectList } from './PrintDefectList';
import { PrintLocationMap } from './PrintLocationMap';
import { PrintPhotoBook } from './PrintPhotoBook';
import './print.css';

const KIND_TO_ARTIFACT: Record<PrintKind, keyof typeof ARTIFACT_LABEL> = {
  DAMAGE_TABLE: 'DAMAGE_TABLE',
  DEFECT_LIST: 'DEFECT_LIST',
  PHOTO_BOOK: 'PHOTO_BOOK',
  LOCATION_MAP: 'LOCATION_MAP',
};

/**
 * 조사위치도와 **손상결함표**만 가로. 나머지는 세로 (§4-9 · PhotoPolish §2-9).
 *
 * 손상결함표는 13열이고 열폭 합이 128 문자다. 세로 186mm 에 넣으면
 * `결함의 유형 및 형상`(18) 이 26mm 라 두 줄로 깨진다.
 */
function pageRule(kind: PrintKind): string {
  const landscape = kind === 'LOCATION_MAP' || kind === 'DAMAGE_TABLE';
  return `@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 12mm; }`;
}

type Loaded = {
  source: ExportSource;
  run: ExportRun;
  photoUrls: Record<string, string>;
  maps: LocationMapPage[];
  /** 사진첩 페이지 — `photoUrls` 와 **같은 계산 결과**여야 한다(검수 보통 2). 여기서 한 번만 만든다 */
  bookPages: PhotoBookPage[];
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
  /** 모든 `<img>` 디코드 완료 — 그전에는 [PDF로 인쇄] 를 막는다 (F-2) */
  const [ready, setReady] = useState(false);

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

    // ⭐ 새 kind/run 을 부르기 전에 **옛 data 를 먼저 버린다.** 안 그러면 `kind` 만 먼저 바뀌고
    //    `data` 는 옛 값이 남아 새 kind 브랜치가 옛 데이터로 렌더된다
    //    (예: DEFECT_LIST→PHOTO_BOOK 이면 `bookPages=[]`). 아래 `ready` 이펙트가 이 `null` 을 받아
    //    인쇄 버튼을 닫으므로 빈 문서 인쇄가 막힌다.
    setData(null);
    setError(null);

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
        let bookPages: PhotoBookPage[] = [];

        if (kind === 'PHOTO_BOOK') {
          // ⭐ **사진첩 셀이 고른 키만 로드한다.** `isPrimary` 를 직접 훑지 않는다 —
          //    `primaryOf()`(읽기 정규화)는 대표가 0장인 저장 상태에서 **첫 장을 대표로 선출**하는데,
          //    원본 플래그를 그대로 필터하면 그 칸의 URL 이 없어 빈 칸이 인쇄된다(검수 보통 2).
          //    `photo.ts` 가 "각자 find(isPrimary) 하지 않는다"고 못박은 바로 그 규칙이다.
          bookPages = photoBookModel(source, plan);
          photoUrls = await loadPhotoUrls(repo, projectId, bookPages);
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
        setData({ source, run, photoUrls, maps, bookPages });
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

  /**
   * 손상결함표 — **엑셀과 문자 그대로 같은 함수**(`buildDamageTable`)를 쓴다.
   * `run.params.doc.headerLine2` 도 run 에서 나오므로 머리말까지 재현된다 (§2-9).
   */
  const tableModel = useMemo(() => {
    if (!data || kind !== 'DAMAGE_TABLE') return null;
    return damageTableModel(data.source, planFromRun(data.source, data.run), data.run.params);
  }, [data, kind]);


  // 렌더가 끝나고 **모든 이미지가 디코드되면** 인쇄 버튼을 연다.
  // ⭐ 여기서 `window.print()` 를 부르지 않는다 (F-2 · 스펙 §2-3) — 이 화면은 **미리보기**다.
  //    인쇄는 사용자가 [PDF로 인쇄] 를 눌렀을 때만 열린다.
  //    단 `waitForImages` 는 남긴다: 원래 방어("빈 칸이 인쇄된다")를 잃지 않으려면
  //    디코드가 끝나기 전에는 버튼을 disabled 로 둬야 한다.
  useEffect(() => {
    // ⭐ `setReady(false)` 는 가드보다 **위**에 있어야 한다. `data` 가 A→B 로 교체되는 경로에서도
    //    버튼을 다시 닫아야 새 데이터의 이미지 디코드 전에 인쇄가 열리지 않는다.
    setReady(false);
    if (!data) return;
    const root = rootRef.current;
    if (!root) return;
    let cancelled = false;
    void (async () => {
      await waitForImages(root);
      if (!cancelled) setReady(true);
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
          미리보기입니다 — <b>[PDF로 인쇄]</b> 를 누른 뒤 인쇄 대화상자에서{' '}
          <b>&quot;PDF로 저장&quot;</b>을 선택하세요
        </span>
        <span className="pv-bar__spacer" />
        <button
          type="button"
          className="btn btn--primary"
          disabled={!ready}
          onClick={() => window.print()}
        >
          {ready ? 'PDF로 인쇄' : '이미지 준비 중…'}
        </button>
        <button type="button" className="btn" onClick={() => window.close()}>
          닫기
        </button>
      </div>

      {error && <p className="pv-status pv-status--error">{error}</p>}
      {!error && !data && <p className="pv-status">문서를 만드는 중…</p>}

      {data && kind === 'DAMAGE_TABLE' && tableModel && (
        // ⚠️ `groupHeader`·`legend` 는 **여기서만 켠다** — 결함 리스트에 조용히 새면 안 된다
        <PrintDamageTable model={tableModel} subtitle="손상결함표" groupHeader legend />
      )}
      {data && kind === 'DEFECT_LIST' && listModel && <PrintDefectList model={listModel} />}
      {data && kind === 'PHOTO_BOOK' && (
        <PrintPhotoBook pages={data.bookPages} urls={data.photoUrls} />
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

/**
 * 사진첩이 **실제로 그릴 칸**의 Blob 키만 objectURL 로 바꾼다.
 *
 * ⚠️ `photos` 를 다시 훑어 `isPrimary` 를 필터하지 않는다 — `buildPhotoBook` 은
 * `primaryOf()`(읽기 정규화)를 쓰므로 대표가 0장인 저장 상태에서 **첫 장을 대표로 선출**한다.
 * 두 경로가 갈리면 그 칸만 조용히 빈 채로 인쇄된다(검수 보통 2 · `photo.ts` 의 금지 조항).
 */
async function loadPhotoUrls(
  repo: { objectUrl: (key: string, projectId: string) => Promise<string | null> },
  projectId: string,
  pages: readonly PhotoBookPage[],
): Promise<Record<string, string>> {
  const keys = new Set<string>();
  for (const p of pages) for (const c of p.cells) keys.add(c.renderBlobKey);
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
