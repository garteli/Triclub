import { useEffect, useRef } from 'react';

// Keeps the screen from dimming/locking while `active` is true — used on the live-ride
// display so the numbers stay visible for the whole ride, recording or just watching.
// Uses the Screen Wake Lock API (Android Chrome, iOS 16.4+ Safari/WKWebView). The lock is
// auto-released whenever the tab is hidden, so we re-acquire on return. Where the API is
// unavailable it's a no-op — the device falls back to its normal auto-lock.
export function useWakeLock(active) {
  const lockRef = useRef(null);

  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return undefined;
    let cancelled = false;

    const acquire = async () => {
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) { lock.release?.(); return; }
        lockRef.current = lock;
      } catch { /* denied or not visible — non-fatal */ }
    };
    const onVisibility = () => { if (!document.hidden && !cancelled) acquire(); };

    acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      try { lockRef.current?.release?.(); } catch { /* ignore */ }
      lockRef.current = null;
    };
  }, [active]);
}
