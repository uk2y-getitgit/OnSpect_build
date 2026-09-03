/**
 * 밝은/어두운 테마 선택 (2026-09-03 사용자 요청) — 태블릿에서만 노출한다.
 * PC 는 지금까지 그대로 밝은 테마 하나뿐이다(`App.tsx` 가 `useUiMode().tablet` 으로 가른다).
 *
 * `index.html` 부트스트랩이 body 렌더 전에 `<html data-theme>` 를 먼저 찍어 깜빡임을 막는다
 * (U-4 의 `data-ui-mode` 와 같은 패턴, `useUiMode.ts` 참고). 여기서는 그 값을 읽고,
 * 바꾸면 속성 + localStorage 양쪽에 반영한다. 시스템 설정(`prefers-color-scheme`)은
 * 따르지 않는다 — 사용자가 직접 고른 값만 쓴다.
 */
import { useCallback, useState } from 'react';

export type ThemeMode = 'light' | 'dark';

const KEY = 'onspect:theme';

function readTheme(): ThemeMode {
  const attr = typeof document !== 'undefined' ? document.documentElement.dataset.theme : null;
  return attr === 'dark' ? 'dark' : 'light';
}

export function useTheme(): { theme: ThemeMode; setTheme: (next: ThemeMode) => void } {
  const [theme, setThemeState] = useState<ThemeMode>(readTheme);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* 사생활 모드 등 — 저장은 안 되지만 이번 세션 동안은 그대로 적용된다 */
    }
  }, []);

  return { theme, setTheme };
}
