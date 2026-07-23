import { useEffect, useState } from 'react';

// Detect when a newer build has been deployed while this session stays open (the classic SPA trap:
// a running app never re-fetches index.html, so it keeps showing the loaded bundle). We compare the
// build id baked into this bundle (__BUILD_ID__) against the freshly-fetched wwwroot/version.json,
// checking on load, whenever the app returns to the foreground, and every 15 min. Returns true once
// a newer build is live — the caller offers a Refresh (a full reload then pulls the new bundle).

const CURRENT = typeof __BUILD_ID__ === 'undefined' ? null : __BUILD_ID__; // eslint-disable-line no-undef

export function useAppUpdate() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (!CURRENT) return undefined;
    let stopped = false;

    const check = async () => {
      if (stopped || updateReady) return;
      try {
        const res = await fetch(`/version.json?ts=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const { build } = await res.json();
        if (build && String(build) !== String(CURRENT)) setUpdateReady(true);
      } catch { /* offline / not found — ignore, try again later */ }
    };

    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    const iv = setInterval(check, 15 * 60 * 1000);
    check();

    return () => { stopped = true; clearInterval(iv); document.removeEventListener('visibilitychange', onVisible); };
  }, [updateReady]);

  return updateReady;
}
