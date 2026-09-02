/**
 * 서비스워커 등록 + 새 버전 감지 (P2 등록 · P4 배너).
 *
 * ⭐ 규칙 (가정 V3): **새 버전을 저절로 적용하지 않는다.**
 *   서비스워커는 install 에서 `skipWaiting()` 을 부르지 않는다 — 현장에서 작업 중에 앱이
 *   저절로 리로드되면 입력 중이던 값이 날아간다. 새 버전은 `waiting` 상태로 대기만 하고,
 *   **사용자가 배너의 [지금 새로고침] 을 누른 순간에만** `SKIP_WAITING` 메시지로 교대한다.
 *   (메시지를 보내지 않고 `location.reload()` 만 하면 대기 중인 워커가 활성화되지 않아
 *    배너가 영원히 다시 뜬다 — 눌러도 아무 일이 없는 버튼이 된다.)
 *
 * 개발 서버에서는 등록하지 않는다. `dist/sw.js` 는 빌드에서만 만들어지고,
 * SW 가 붙어 있으면 HMR 이 캐시된 앱 셸에 가려 죽는다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const SW_URL = '/sw.js';

/** 등록은 앱 전체에서 1회. StrictMode 이중 마운트에도 두 번 부르지 않는다 */
let registerStarted = false;
let cachedReg: ServiceWorkerRegistration | null = null;

function supported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    window.isSecureContext
  );
}

export type ServiceWorkerUpdate = {
  /** 새 버전이 설치를 마치고 교대를 기다리는 중 */
  updateAvailable: boolean;
  /** [지금 새로고침] 을 눌러 교대·리로드가 진행 중 */
  applying: boolean;
  applyUpdate: () => void;
};

export function useServiceWorker(): ServiceWorkerUpdate {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [applying, setApplying] = useState(false);
  /** 사용자가 누른 교대인지 — 최초 설치의 `clients.claim()` 으로는 리로드하지 않는다 */
  const applyingRef = useRef(false);
  const reloadedRef = useRef(false);

  useEffect(() => {
    if (!supported()) return;

    // 개발 중에는 오히려 걷어낸다 —
    // `vite preview`(프로덕션 빌드)와 `vite dev` 가 **같은 오리진·같은 포트**라,
    // 프리뷰에서 붙은 SW 가 남아 있으면 개발 서버가 캐시된 옛 셸을 받아 조용히 깨진다.
    if (!import.meta.env.PROD) {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const r of regs) void r.unregister();
      });
      return;
    }

    let alive = true;

    const watch = (reg: ServiceWorkerRegistration) => {
      cachedReg = reg;
      // 이미 대기 중인 새 버전이 있다 (다른 탭이 설치해 뒀거나, 배너를 닫고 새로고침한 경우)
      if (reg.waiting && navigator.serviceWorker.controller && alive) setWaiting(reg.waiting);

      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          // `controller` 가 있어야 **갱신**이다. 최초 설치에는 배너를 띄우지 않는다
          if (sw.state === 'installed' && navigator.serviceWorker.controller && alive) {
            setWaiting(sw);
          }
        });
      });
    };

    if (cachedReg) {
      watch(cachedReg);
    } else if (!registerStarted) {
      registerStarted = true;
      // 등록 자체가 브라우저의 갱신 확인을 한 번 트리거한다.
      // **주기적 폴링은 하지 않는다** — 현장에서 배터리와 네트워크를 태우지 않는다
      navigator.serviceWorker.register(SW_URL, { scope: '/' }).then(
        (reg) => {
          if (alive) watch(reg);
        },
        (e) => {
          registerStarted = false;
          // 등록 실패는 앱을 막지 않는다. 오프라인 부팅만 안 될 뿐이다
          console.warn('[sw] 등록 실패 — 오프라인 부팅이 안 됩니다', e);
        },
      );
    }

    const onControllerChange = () => {
      if (!applyingRef.current || reloadedRef.current) return;
      reloadedRef.current = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    return () => {
      alive = false;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    if (!waiting || applyingRef.current) return;
    applyingRef.current = true;
    setApplying(true);
    waiting.postMessage({ type: 'SKIP_WAITING' });
    // 안전망 — 교대 신호가 안 오면 그냥 새로고침한다. 버튼이 먹통으로 남는 것이 더 나쁘다
    window.setTimeout(() => {
      if (reloadedRef.current) return;
      reloadedRef.current = true;
      window.location.reload();
    }, 3000);
  }, [waiting]);

  return { updateAvailable: waiting !== null, applying, applyUpdate };
}
