import { useEffect, useRef, useState } from 'react';
import { groupRadar } from '../lib/radar.js';

// Turns the raw ride sources (GPS recorder + BLE sensors + hub riders) into the
// `telemetry` object the Garmin-style pages read. Everything here is REAL: a field
// with no source (no sensor paired, no GPS fix) is null → the page shows "—".
// Sampled once per tick so charts/averages accumulate a real rolling history.
const WINDOW = 44; // chart / rolling-average window (seconds)

const avg = (arr) => { const n = arr.filter((v) => v != null); return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null; };
const max = (arr) => { const n = arr.filter((v) => v != null); return n.length ? Math.max(...n) : null; };

export function useRideTelemetry({ t, active, riders = [], recorder, sensors }) {
  const startRef = useRef(null);
  const hist = useRef({ spd: [], hr: [], pwr: [] });
  const gain = useRef(0);
  const prevElev = useRef(null);
  const [tel, setTel] = useState(null);

  useEffect(() => {
    if (!active) {
      startRef.current = null; hist.current = { spd: [], hr: [], pwr: [] };
      gain.current = 0; prevElev.current = null; setTel(null);
      return;
    }
    if (startRef.current == null) startRef.current = Date.now();

    const fix = recorder?.lastFix || {};
    const m = sensors?.metrics || {};
    const spd = fix.speedKph ?? null;
    const hr = fix.heartRate ?? m.heartRate ?? null;
    const pwr = fix.powerW ?? m.powerW ?? null;
    const cad = m.cadence ?? null;
    const elev = fix.elevM ?? null;
    const dist = recorder?.distanceKm ?? null;

    if (elev != null) {
      if (prevElev.current != null && elev > prevElev.current) gain.current += elev - prevElev.current;
      prevElev.current = elev;
    }

    const push = (arr, v) => { arr.push(v); if (arr.length > WINDOW) arr.shift(); };
    push(hist.current.spd, spd); push(hist.current.hr, hr); push(hist.current.pwr, pwr);

    const elapsed = Math.round((Date.now() - startRef.current) / 1000);
    const avgpwr = avg(hist.current.pwr);
    const recording = !!recorder?.recording;

    setTel({
      // "live" = we have a real feed: this device is recording, or teammates are streaming.
      live: recording || riders.length > 0,
      recording,
      elapsed,
      spd, hr, pwr, cad, dist, elev,
      avgspd: avg(hist.current.spd), maxspd: max(hist.current.spd),
      avghr: avg(hist.current.hr), avgpwr,
      elevGainM: gain.current ? Math.round(gain.current) : null,
      kcal: avgpwr != null ? Math.round((avgpwr * elapsed) / 1000 * 1.02) : null, // kJ≈kcal for cycling
      hist: { spd: [...hist.current.spd], hr: [...hist.current.hr], pwr: [...hist.current.pwr] },
      riders,
      radar: groupRadar(riders),
      you: riders.find((r) => r.you) || null,
      // Pack-fusion spacing (from phone-to-phone BLE ranging, when active): your fused gap to
      // the nearest teammate, and whether any rider's position is BLE-refined this tick.
      gap: riders.find((r) => r.you)?.gapM ?? null,
      packFused: riders.some((r) => r.fused),
    });
  }, [t, active]); // eslint-disable-line react-hooks/exhaustive-deps

  return tel;
}
