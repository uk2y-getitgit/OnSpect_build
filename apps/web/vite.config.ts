import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
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
