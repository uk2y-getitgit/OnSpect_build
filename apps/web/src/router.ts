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
  | { name: 'CANVAS'; projectId: string; floorId: string | null }; // #/p/:pid/f/:fid

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
