import { useEffect, useRef } from 'react';

// Keeps the screen from dimming/locking while `active` is true — used on the live-ride
// display so the numbers stay visible for the whole ride, recording or just watching.
//
// Two mechanisms, best-effort both:
//   • Native (Capacitor iOS): the SquadKeepAwake plugin flips UIApplication.isIdleTimerDisabled.
//     This is the reliable path — the web Screen Wake Lock API is flaky inside WKWebView.
//   • Web: the Screen Wake Lock API (Android Chrome, iOS 16.4+ Safari). Auto-released when the
//     tab is hidden, so we re-acquire on return. A no-op where unavailable.
export function useWakeLock(active) {
  const lockRef = useRef(null);

  // Native idle-timer (the dependable path in the packaged app).
  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    let enabled = false;

    let keepAwake = null;
    (async () => {
      try {
        const { registerPlugin, Capacitor } = await import('@capacitor/core');
        if (!Capacitor?.isNativePlatform?.()) return;
        keepAwake = registerPlugin('SquadKeepAwake');
        await keepAwake.enable();
        if (cancelled) { keepAwake.disable?.(); return; }
        enabled = true;
      } catch { /* plugin missing / older build — fall back to the web API below */ }
    })();

    return () => {
      cancelled = true;
      if (enabled) { try { keepAwake?.disable?.(); } catch { /* ignore */ } }
    };
  }, [active]);

  // Web Screen Wake Lock (Android/desktop; a bonus on iOS Safari where it works).
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
