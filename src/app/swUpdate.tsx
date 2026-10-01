import { useEffect, type ReactElement } from 'react';

export const SW_CHECK_KEY = 'mp-sw-check-at';
export const SW_CHECK_INTERVAL = 24 * 3600 * 1000;
const APPLY_TIMEOUT = 8000;

const readTime = (key: string): number => {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
};

/** True when no check ran within the interval — pure for tests. */
export const shouldCheckUpdate = (lastAt: number, now = Date.now()): boolean =>
  !(lastAt > 0) || now - lastAt >= SW_CHECK_INTERVAL;

const stampCheck = (): void => {
  try {
    localStorage.setItem(SW_CHECK_KEY, String(Date.now()));
  } catch {
    /* private mode; next launch retries */
  }
};

/** Silent background updater. Renders nothing and toasts nothing. */
export function useSwUpdate(): void {
  useEffect(() => {
    let live = true;
    let hourly: ReturnType<typeof setInterval> | null = null;

    const applyUpdate = (updateSW: (reload?: boolean) => Promise<void>): void => {
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('update timeout')), APPLY_TIMEOUT));
      Promise.race([updateSW(true), timeout])
        .then(() => {
          window.location.reload();
        })
        .catch(() => {
          /* silent; next launch retries */
        });
    };

    (async () => {
      try {
        const mod = await import('virtual:pwa-register');
        if (!live) return;
        let updateSW: ((reload?: boolean) => Promise<void>) | undefined;
        updateSW = mod.registerSW({
          immediate: false,
          onNeedRefresh() {
            if (live) applyUpdate((r) => updateSW?.(r) ?? Promise.resolve());
          },
          onRegisteredSW(_url: string, reg?: ServiceWorkerRegistration) {
            if (!live) return;
            if (reg?.waiting) {
              applyUpdate((r) => updateSW?.(r) ?? Promise.resolve());
              return;
            }
            if (shouldCheckUpdate(readTime(SW_CHECK_KEY))) {
              stampCheck();
              reg?.update().catch(() => {});
            }
            try {
              hourly = setInterval(() => {
                if (shouldCheckUpdate(readTime(SW_CHECK_KEY))) {
                  stampCheck();
                  reg?.update().catch(() => {});
                }
              }, 3600000);
            } catch {
              /* ignore */
            }
          },
          // Offline / registration failure: stay silent, app works cached.
          onRegisterError() {},
        });
      } catch {
        // Dev / test / no-SW builds: nothing to do, stay silent.
      }
    })();

    return () => {
      live = false;
      if (hourly) clearInterval(hourly);
    };
  }, []);
}

export default function SwUpdater(): ReactElement | null {
  useSwUpdate();
  return null;
}
