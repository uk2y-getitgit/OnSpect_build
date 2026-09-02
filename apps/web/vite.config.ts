import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** SW 원본 — 번들러를 타지 않는다. 토큰 두 개만 치환해서 `dist/sw.js` 로 내보낸다 */
const SW_SRC = fileURLToPath(new URL('./src/sw/sw.js', import.meta.url));

/**
 * 앱 셸 프리캐시 목록을 서비스워커에 주입한다 (P2 · 가정 V2 — workbox 를 넣지 않는다).
 *
 * 왜 플러그인이 필요한가: 빌드 산출 파일명에 내용 해시가 붙는다(`index-A1b2C3.js`).
 * 그 목록을 손으로 적을 수 없다. 여기서 번들을 읽어 그대로 박는다.
 *
 * 부수효과 하나가 중요하다 — **자산이 하나라도 바뀌면 `sw.js` 의 바이트가 바뀐다.**
 * 브라우저는 그 차이로 새 버전을 발견하고, 앱은 배너를 띄운다(P4).
 */
function swPrecachePlugin(): Plugin {
  return {
    name: 'onspect-sw-precache',
    apply: 'build',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle)
        .filter((name) => name.endsWith('.js') || name.endsWith('.css'))
        .sort()
        .map((name) => `/${name}`);

      // public/ 은 번들에 안 들어온다 — 앱 셸에 꼭 필요한 것만 손으로 나열한다.
      // (public/fixtures 는 개발용 표본이라 일부러 뺀다. 캐시를 쓸데없이 늘리지 않는다)
      const shell = [
        '/index.html',
        '/manifest.webmanifest',
        '/icons/icon-192.png',
        '/icons/icon-512.png',
        '/icons/icon-maskable-512.png',
      ];

      const precache = [...shell, ...built];
      const version = createHash('sha256').update(precache.join('\n')).digest('hex').slice(0, 12);

      const raw = readFileSync(SW_SRC, 'utf8');
      // 치환에 실패한 채 배포되면 오프라인 부팅이 조용히 죽는다. 그 전에 빌드를 세운다
      for (const token of ['__BUILD_VERSION__', '__PRECACHE_MANIFEST__']) {
        const n = raw.split(token).length - 1;
        if (n !== 1) this.error(`sw.js 의 ${token} 자리표시자가 ${n}개입니다 (1개여야 합니다)`);
      }

      const source = raw
        .replace('__BUILD_VERSION__', JSON.stringify(version))
        .replace('__PRECACHE_MANIFEST__', JSON.stringify(precache, null, 2));

      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [react(), swPrecachePlugin()],
  resolve: {
    alias: {
      // 워크스페이스 코어는 TS 소스를 그대로 쓴다 (빌드 단계 없음)
      '@onspect/canvas-core': fileURLToPath(
        new URL('../../packages/canvas-core/src/index.ts', import.meta.url),
      ),
      '@onspect/project-core': fileURLToPath(
        new URL('../../packages/project-core/src/index.ts', import.meta.url),
      ),
    },
  },
  server: { open: false },
});
