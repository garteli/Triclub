import { useEffect, useRef, useState } from 'react';
import { groupRadar } from '../lib/radar.js';

// Turns the raw ride sources (GPS recorder + BLE sensors + hub riders) into the
// `telemetry` object the Garmin-style pages read. Everything here is REAL: a field
// with no source (no sensor paired, no GPS fix) is null → the page shows "—".
// Sampled once per tick so charts/averages accumulate a real rolling history.
const WINDOW = 44; // chart / rolling-average window (seconds)

const avg = (arr) => { const n = arr.filter((v) => v != null); return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null; };
const max = (arr) => { const n = arr.filter((v) => v != null); return n.length ? Math.max(...n) : null; };

// Normalized Power: 30-sample rolling average of power, 4th-power mean, 4th root.
// Derived from the real power buffer; null until there's enough signal to be meaningful.
function normPower(arr) {
  const p = arr.filter((v) => v != null);
  if (p.length < 10) return null;
  const win = 30, roll = [];
  for (let i = 0; i < p.length; i++) {
    const seg = p.slice(Math.max(0, i - win + 1), i + 1);
    roll.push(seg.reduce((a, b) => a + b, 0) / seg.length);
  }
  const mean4 = roll.reduce((a, b) => a + b ** 4, 0) / roll.length;
  return Math.round(mean4 ** 0.25);
}

// 3-second rolling power (Garmin "3s Power") from the tail of the buffer.
function power3s(arr) {
  const p = arr.slice(-3).filter((v) => v != null);
  return p.length ? Math.round(p.reduce((a, b) => a + b, 0) / p.length) : null;
}

export function useRideTelemetry({ t, active, riders = [], recorder, sensors }) {
  const startRef = useRef(null);
  const hist = useRef({ spd: [], hr: [], pwr: [], cad: [], elev: [], dist: [] });
  const gain = useRef(0);
  const drop = useRef(0);
  const maxElev = useRef(null);
  const prevElev = useRef(null);
  const [tel, setTel] = useState(null);

  useEffect(() => {
    if (!active) {
      startRef.current = null; hist.current = { spd: [], hr: [], pwr: [], cad: [], elev: [], dist: [] };
      gain.current = 0; drop.current = 0; maxElev.current = null; prevElev.current = null; setTel(null);
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
      if (prevElev.current != null) {
        if (elev > prevElev.current) gain.current += elev - prevElev.current;
        else if (elev < prevElev.current) drop.current += prevElev.current - elev;
      }
      prevElev.current = elev;
      if (maxElev.current == null || elev > maxElev.current) maxElev.current = elev;
    }

    const push = (arr, v) => { arr.push(v); if (arr.length > WINDOW) arr.shift(); };
    push(hist.current.spd, spd); push(hist.current.hr, hr); push(hist.current.pwr, pwr);
    push(hist.current.cad, cad); push(hist.current.elev, elev); push(hist.current.dist, dist);

    // Gradient: rise over run across the rolling window (needs a few metres of travel
    // to be stable). Both elevation and distance must be present.
    const eBuf = hist.current.elev.filter((v) => v != null);
    const dBuf = hist.current.dist.filter((v) => v != null);
    let grade = null;
    if (eBuf.length >= 2 && dBuf.length >= 2) {
      const dRunM = (dBuf[dBuf.length - 1] - dBuf[0]) * 1000;
      if (dRunM > 5) grade = ((eBuf[eBuf.length - 1] - eBuf[0]) / dRunM) * 100;
    }

    const elapsed = Math.round((Date.now() - startRef.current) / 1000);
    const avgpwr = avg(hist.current.pwr);
    const recording = !!recorder?.recording;
    const now = new Date();

    setTel({
      // "live" = we have a real feed: this device is recording, or teammates are streaming.
      live: recording || riders.length > 0,
      recording,
      elapsed,
      clock: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      spd, hr, pwr, cad, dist, elev, grade,
      avgspd: avg(hist.current.spd), maxspd: max(hist.current.spd),
      avghr: avg(hist.current.hr), maxhr: max(hist.current.hr),
      avgcad: avg(hist.current.cad), maxcad: max(hist.current.cad),
      avgpwr, maxpwr: max(hist.current.pwr), np: normPower(hist.current.pwr), pwr3s: power3s(hist.current.pwr),
      workKj: avgpwr != null ? Math.round((avgpwr * elapsed) / 1000) : null,
      elevGainM: gain.current ? Math.round(gain.current) : null,
      descentM: drop.current ? Math.round(drop.current) : null,
      maxElevM: maxElev.current != null ? Math.round(maxElev.current) : null,
      kcal: avgpwr != null ? Math.round((avgpwr * elapsed) / 1000 * 1.02) : null, // kJ≈kcal for cycling
      hist: { spd: [...hist.current.spd], hr: [...hist.current.hr], pwr: [...hist.current.pwr] },
      riders,
      radar: groupRadar(riders),
      you: riders.find((r) => r.you) || null,
    });
  }, [t, active]); // eslint-disable-line react-hooks/exhaustive-deps

  return tel;
}
