/**
 * 해시 라우터 — S1 스펙 §2-2 (ASSUMPTIONS S1·D12).
 *
 * **react-router 를 추가하지 않는다.** 필요한 것은 뒤로가기 · 새로고침 복원 · 딥링크뿐이고,
 * 그것만 하는 데 새 의존성으로 번들과 개념을 늘릴 이유가 없다.
 *
 * `location.hash` 만 쓴다. `history.pushState` 를 쓰지 않으므로 서버 라우팅 설정도 필요 없다.
 */
import { useEffect, useState } from 'react';

export type Route =
  | { name: 'LIST' } //                       #/
  | { name: 'NEW' } //                        #/new
  | { name: 'EDIT'; projectId: string } //    #/p/:pid/edit
  | { name: 'SETUP'; projectId: string } //   #/p/:pid
  | { name: 'UPLOAD'; projectId: string; floorId: string | null } // #/p/:pid/upload
  | { name: 'CANVAS'; projectId: string; floorId: string | null } // #/p/:pid/f/:fid
  /** #/p/:pid/settings?from=f/{floorId} — 캔버스에서 왔으면 그 층으로 되돌아간다 (F25) */
  | { name: 'SETTINGS'; projectId: string; fromFloorId: string | null }
  /** #/p/:pid/export — 산출물 출력 P6 (Phase 4 §4-1) */
  | { name: 'EXPORT'; projectId: string }
  /**
   * #/p/:pid/export/print?run={runId}&kind={...} — **인쇄 전용 뷰** (§4-9).
   * 새 탭으로 열고 문서를 **미리보기**로 렌더한다. 인쇄는 상단 `[PDF로 인쇄]` 를
   * 눌렀을 때만 열린다 — 자동으로 `window.print()` 를 부르지 않는다 (F-2).
   * PDF 라이브러리를 넣지 않는다 — 한글 폰트 임베딩 문제가 통째로 사라진다(K1 · Q32).
   */
  | { name: 'EXPORT_PRINT'; projectId: string; runId: string; kind: PrintKind };

/** 인쇄 뷰가 낼 수 있는 산출물. 손상결함표는 엑셀 전용이라 여기 없다 */
export type PrintKind = 'DEFECT_LIST' | 'PHOTO_BOOK' | 'LOCATION_MAP';

const PRINT_KINDS: readonly PrintKind[] = ['DEFECT_LIST', 'PHOTO_BOOK', 'LOCATION_MAP'];

function parsePrintKind(v: string | null): PrintKind {
  return PRINT_KINDS.includes(v as PrintKind) ? (v as PrintKind) : 'DEFECT_LIST';
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  const [path = '', query = ''] = raw.split('?');
  const seg = path.split('/').filter((s) => s !== '');

  if (seg.length === 0) return { name: 'LIST' };
  if (seg[0] === 'new') return { name: 'NEW' };

  if (seg[0] === 'p' && seg[1]) {
    const projectId = decodeURIComponent(seg[1]);
    if (seg[2] === 'edit') return { name: 'EDIT', projectId };
    if (seg[2] === 'upload') {
      const floorId = new URLSearchParams(query).get('floor');
      return { name: 'UPLOAD', projectId, floorId: floorId ? decodeURIComponent(floorId) : null };
    }
    if (seg[2] === 'settings') {
      const from = new URLSearchParams(query).get('from');
      const m = from ? /^f\/(.+)$/.exec(from) : null;
      // `URLSearchParams` 가 이미 디코드한 값이다. 여기서 또 디코드하지 않는다
      return { name: 'SETTINGS', projectId, fromFloorId: m?.[1] ?? null };
    }
    if (seg[2] === 'export') {
      if (seg[3] === 'print') {
        const q = new URLSearchParams(query);
        return {
          name: 'EXPORT_PRINT',
          projectId,
          runId: q.get('run') ?? '',
          kind: parsePrintKind(q.get('kind')),
        };
      }
      return { name: 'EXPORT', projectId };
    }
    if (seg[2] === 'f') {
      return { name: 'CANVAS', projectId, floorId: seg[3] ? decodeURIComponent(seg[3]) : null };
    }
    return { name: 'SETUP', projectId };
  }
  return { name: 'LIST' };
}

export function hrefOf(route: Route): string {
  switch (route.name) {
    case 'LIST':
      return '#/';
    case 'NEW':
      return '#/new';
    case 'EDIT':
      return `#/p/${encodeURIComponent(route.projectId)}/edit`;
    case 'SETUP':
      return `#/p/${encodeURIComponent(route.projectId)}`;
    case 'UPLOAD':
      return route.floorId
        ? `#/p/${encodeURIComponent(route.projectId)}/upload?floor=${encodeURIComponent(route.floorId)}`
        : `#/p/${encodeURIComponent(route.projectId)}/upload`;
    case 'SETTINGS':
      return route.fromFloorId
        ? `#/p/${encodeURIComponent(route.projectId)}/settings?from=f/${encodeURIComponent(route.fromFloorId)}`
        : `#/p/${encodeURIComponent(route.projectId)}/settings`;
    case 'EXPORT':
      return `#/p/${encodeURIComponent(route.projectId)}/export`;
    case 'EXPORT_PRINT':
      return `#/p/${encodeURIComponent(route.projectId)}/export/print?run=${encodeURIComponent(route.runId)}&kind=${route.kind}`;
    case 'CANVAS':
      return route.floorId
        ? `#/p/${encodeURIComponent(route.projectId)}/f/${encodeURIComponent(route.floorId)}`
        : `#/p/${encodeURIComponent(route.projectId)}/f`;
  }
}

/** 히스토리에 항목을 남기며 이동 (뒤로가기로 돌아올 수 있다) */
export function navigate(route: Route): void {
  const next = hrefOf(route);
  if (window.location.hash === next) return;
  window.location.hash = next;
}

/**
 * 히스토리를 남기지 않고 주소만 바꾼다.
 * 층 전환은 화면 전이가 아니라 **URL 갱신**이다 (§2-3) — 뒤로가기가 층 이력으로 채워지면 안 된다.
 */
export function replace(route: Route): void {
  const next = hrefOf(route);
  if (window.location.hash === next) return;
  const url = `${window.location.pathname}${window.location.search}${next}`;
  window.history.replaceState(null, '', url);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
