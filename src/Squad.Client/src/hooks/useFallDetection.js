import { useCallback, useEffect, useRef, useState } from 'react';

// Best-effort fall detection over the phone's accelerometer (DeviceMotion). Foreground-only and
// heuristic — it is a helper, NOT a safety-certified system: it can miss real crashes and can
// false-alarm, which is why the UI always confirms with an "Are you OK?" countdown you can cancel.
//
// Heuristic: a hard impact (total acceleration well above 1 g) immediately followed by the phone
// going still for a few seconds → the rider is likely down. A pothole jolt fails the stillness test
// (the rider keeps moving) and is ignored.
//
// iOS Safari (and the iOS webview) gate DeviceMotion behind a permission prompt that must be
// requested from a user gesture — call requestPermission() from the arm toggle's onClick.

const G = 9.80665;            // 1 g
const SETTLE_MS = 600;        // ignore the ring-out right after the impact
const STILL_WINDOW_MS = 3500; // watch this long after impact for stillness
const STILL_DEV_MS2 = 3.0;    // max deviation from 1 g during the window to count as "not moving"

// Impact-magnitude threshold (m/s², total incl. gravity) per sensitivity level. Lower = more
// sensitive (triggers on a lighter hit, more false alarms); higher = needs a harder crash.
export const FALL_IMPACT_MS2 = { high: 22, medium: 30, low: 40 };
const DEFAULT_IMPACT_MS2 = FALL_IMPACT_MS2.medium;

export function useFallDetection({ active = false, onFall, impactMs2 = DEFAULT_IMPACT_MS2 } = {}) {
  const supported = typeof window !== 'undefined' && typeof window.DeviceMotionEvent !== 'undefined';
  const needsPermission = supported && typeof window.DeviceMotionEvent.requestPermission === 'function';
  const [permission, setPermission] = useState(
    supported ? (needsPermission ? 'prompt' : 'granted') : 'unsupported');

  // Keep the latest onFall + threshold without re-attaching the listener each render.
  const onFallRef = useRef(onFall);
  onFallRef.current = onFall;
  const impactRef = useRef(impactMs2);
  impactRef.current = impactMs2;
  // Impact→stillness state machine, in a ref so re-renders don't reset it.
  const sm = useRef({ phase: 'idle', tImpact: 0, maxDev: 0 });

  const requestPermission = useCallback(async () => {
    if (!supported) { setPermission('unsupported'); return false; }
    if (!needsPermission) { setPermission('granted'); return true; }
    try {
      const res = await window.DeviceMotionEvent.requestPermission();
      const ok = res === 'granted';
      setPermission(ok ? 'granted' : 'denied');
      return ok;
    } catch { setPermission('denied'); return false; }
  }, [supported, needsPermission]);

  useEffect(() => {
    if (!active || !supported || permission !== 'granted') return undefined;
    sm.current = { phase: 'idle', tImpact: 0, maxDev: 0 };

    const onMotion = (e) => {
      const a = e.accelerationIncludingGravity || e.acceleration;
      if (!a || a.x == null || a.y == null || a.z == null) return;
      const mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
      const now = Date.now();
      const st = sm.current;

      if (st.phase === 'idle') {
        if (mag >= impactRef.current) { st.phase = 'watching'; st.tImpact = now; st.maxDev = 0; }
        return;
      }
      // watching: after the impact settles, track how much the phone still moves.
      const dt = now - st.tImpact;
      if (dt < SETTLE_MS) return;
      st.maxDev = Math.max(st.maxDev, Math.abs(mag - G));
      if (dt >= STILL_WINDOW_MS) {
        const fell = st.maxDev < STILL_DEV_MS2; // stayed still after a hard hit → likely a fall
        st.phase = 'idle'; st.tImpact = 0; st.maxDev = 0;
        if (fell) { try { onFallRef.current?.(); } catch { /* ignore */ } }
      }
    };

    window.addEventListener('devicemotion', onMotion);
    return () => window.removeEventListener('devicemotion', onMotion);
  }, [active, supported, permission]);

  return { supported, permission, requestPermission };
}
