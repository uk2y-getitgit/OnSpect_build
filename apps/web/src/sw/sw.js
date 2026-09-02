/* eslint-disable no-restricted-globals */
/**
 * OnSpect 서비스워커 — **앱 셸 프리캐시만** (P2 · 스펙 §4-1, 가정 V2).
 *
 * 이 파일은 번들러를 타지 않는다. `vite.config.ts` 의 `swPrecachePlugin` 이 아래 두 자리표시자
 * (VERSION · PRECACHE 초기값)를 빌드 산출 파일 목록으로 치환해 `dist/sw.js` 로 내보낸다.
 * (그래서 여기에 `import` 를 쓰면 안 된다. 순수 클래식 워커 문법만 쓴다.)
 *
 * ⚠️ 자리표시자 토큰은 **이 파일에 정확히 한 번씩만** 나와야 한다 — 주석에도 적지 마라.
 *
 * 설계 근거 —
 *  · **데이터는 캐시하지 않는다.** 용역·도면·사진은 전부 IndexedDB 에 있고 네트워크를 타지 않는다.
 *    그래서 workbox 의 런타임 전략 엔진이 할 일이 없다(가정 V2).
 *  · **라우팅이 URL 기반이 아니다**(react-router 미사용, 해시 라우터). 그래서 네비게이션은
 *    경로가 무엇이든 언제나 `/index.html` 하나로 돌려주면 된다. 리라이트 규칙이 필요 없다.
 *  · **`skipWaiting()` 을 install 에서 부르지 않는다**(가정 V3). 현장 작업 중 앱이 저절로
 *    리로드되면 입력 중이던 값이 날아간다. 사용자가 배너의 [지금 새로고침] 을 누른 순간에만
 *    `SKIP_WAITING` 메시지를 받아 교대한다.
 */

const VERSION = __BUILD_VERSION__;
const CACHE_NAME = 'onspect-shell-' + VERSION;
const CACHE_PREFIX = 'onspect-shell-';

/** 빌드가 주입한다. 앱 셸(HTML·JS·CSS·매니페스트·아이콘)만 들어온다 */
const PRECACHE = __PRECACHE_MANIFEST__;

/** 네비게이션이 오면 언제나 이걸 돌려준다 */
const SHELL_URL = '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // `cache.addAll` 은 하나만 실패해도 통째로 실패한다 —
      // 앱 셸은 전부 있어야 오프라인 부팅이 되므로 그 성질이 맞다.
      await cache.addAll(PRECACHE);
    })(),
  );
  // self.skipWaiting() 을 **부르지 않는다** (가정 V3)
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith(CACHE_PREFIX) && n !== CACHE_NAME)
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

/** 배너의 [지금 새로고침] 만이 교대를 허락한다 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // GET 이 아닌 것 · 다른 오리진은 손대지 않는다 (Supabase 등 나중에 붙을 API 를 가로채면 안 된다)
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // ① 네비게이션 — 캐시 우선. **이게 "오프라인에서 앱이 뜬다"의 전부다**
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const hit = await cache.match(SHELL_URL);
        if (hit) return hit;
        try {
          return await fetch(req);
        } catch {
          return new Response(
            '<!doctype html><meta charset="utf-8"><title>OnSpect</title>' +
              '<p style="font:16px system-ui;padding:24px">오프라인이고 앱 셸이 아직 저장되지 않았습니다. ' +
              '온라인 상태에서 한 번 열어 주세요.</p>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
          );
        }
      })(),
    );
    return;
  }

  // ② 프리캐시된 앱 셸 자원 — 캐시 우선. 파일명에 해시가 붙어 있어 낡을 수 없다
  const path = url.pathname;
  if (PRECACHE.indexOf(path) === -1) return; // 그 밖은 브라우저에 맡긴다 (캐시를 늘리지 않는다)

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(path);
      if (hit) return hit;
      const res = await fetch(req);
      // 프리캐시 대상인데 캐시에 없다 = install 이후 지워진 것. 조용히 되채운다
      if (res && res.ok && res.type === 'basic') cache.put(path, res.clone());
      return res;
    })(),
  );
});
