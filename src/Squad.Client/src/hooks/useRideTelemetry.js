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

export function useRideTelemetry({ t, active, riders = [], recorder, sensors, me, course } = {}) {
  const startRef = useRef(null);
  const hist = useRef({ spd: [], hr: [], pwr: [], cad: [], elev: [], dist: [] });
  const gain = useRef(0);
  const drop = useRef(0);
  const maxElev = useRef(null);
  const prevElev = useRef(null);
  // Peloton lead accounting: how many samples each rider has spent at the front of the
  // pack (furthest up the road), plus the total sampled while the group had ≥2 riders.
  // A sample ≈ one tick ≈ one second, so leadCount/samples is a real "% of time in lead".
  const leadCount = useRef({});
  const leadSamples = useRef(0);
  // The effect also re-runs when `riders` changes (a peer position arrives) so the map/pack
  // refresh immediately, not just on the 1s tick. The per-second sampling (history buffers,
  // elevation + lead accounting) is gated to an actual new tick so those stay 1 sample/sec.
  const lastTick = useRef(-1);
  const [tel, setTel] = useState(null);

  useEffect(() => {
    if (!active) {
      startRef.current = null; hist.current = { spd: [], hr: [], pwr: [], cad: [], elev: [], dist: [] };
      gain.current = 0; drop.current = 0; maxElev.current = null; prevElev.current = null;
      leadCount.current = {}; leadSamples.current = 0; lastTick.current = -1; setTel(null);
      return;
    }
    if (startRef.current == null) startRef.current = Date.now();
    const newTick = t !== lastTick.current; // false when this run was triggered by a riders change
    if (newTick) lastTick.current = t;

    const fix = recorder?.lastFix || {};
    const m = sensors?.metrics || {};
    const spd = fix.speedKph ?? null;
    const hr = fix.heartRate ?? m.heartRate ?? null;
    const pwr = fix.powerW ?? m.powerW ?? null;
    const cad = m.cadence ?? null;
    const elev = fix.elevM ?? null;
    const dist = recorder?.distanceKm ?? null;

    // --- once-per-second sampling (only on a real tick, not on a riders-triggered re-run) ---
    if (newTick) {
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
    }

    // Gradient: rise over run across the rolling window (needs a few metres of travel
    // to be stable). Both elevation and distance must be present.
    const eBuf = hist.current.elev.filter((v) => v != null);
    const dBuf = hist.current.dist.filter((v) => v != null);
    let grade = null;
    if (eBuf.length >= 2 && dBuf.length >= 2) {
      const dRunM = (dBuf[dBuf.length - 1] - dBuf[0]) * 1000;
      if (dRunM > 5) grade = ((eBuf[eBuf.length - 1] - eBuf[0]) / dRunM) * 100;
    }

    // Prefer the recorder's own elapsed (it survives leaving/re-entering the display, and a
    // reload/resume) so the ride timer reflects how long recording has actually run, not how
    // long this display has been open. Fall back to the local ref for teammate-only viewing.
    const recElapsed = recorder?.elapsedSec;
    const elapsed = recorder?.recording && recElapsed != null
      ? recElapsed
      : Math.round((Date.now() - startRef.current) / 1000);
    const avgpwr = avg(hist.current.pwr);
    const recording = !!recorder?.recording;
    const now = new Date();

    // Put THIS device's own position on the map straight from the local GPS fix — don't wait for
    // the hub to echo it back. Without this a solo ride (no teammates streaming) shows "Waiting
    // for GPS…" forever even with a good fix. Full rider shape so the map + rider list all render.
    const hubYou = riders.find((r) => r.you) || null;
    const haveFix = fix.lat != null && fix.lon != null;
    const localYou = haveFix ? {
      athleteId: hubYou?.athleteId ?? 'you',
      you: true,
      // Use your real identity (from the hub echo, or your profile before it arrives) so your
      // marker doesn't flip from a placeholder to your initials once the echo lands.
      name: hubYou?.name ?? me?.name ?? 'You',
      initials: hubYou?.initials ?? me?.initials ?? '··',
      color: hubYou?.color ?? me?.avatarColor ?? 'var(--accent)',
      lat: fix.lat, lon: fix.lon,
      gapM: hubYou?.gapM ?? null,
      fused: hubYou?.fused ?? false,
      spd: (spd ?? 0).toFixed(1),
      hr: hr != null ? Math.round(hr) : 0,
      powerW: pwr ?? null,
      radar: fix.radar ?? hubYou?.radar ?? null,
      dist: (dist ?? 0).toFixed(1),
      hrPct: hr != null ? Math.min(100, Math.round(((hr - 110) / 70) * 100)) : 0,
      hrColor: hubYou?.hrColor ?? 'var(--good)',
      dropped: false,
      rowBg: 'background:var(--accent-dim);border:1px solid color-mix(in srgb,var(--accent) 40%,transparent)',
    } : null;
    const allRiders = localYou ? [localYou, ...riders.filter((r) => !r.you)] : riders;

    // Who's on the front this tick = whoever has covered the most distance (furthest up the
    // road). Only meaningful with a group, so lead time only accrues when ≥2 riders stream.
    let leaderId = null;
    if (allRiders.length > 1) {
      let best = -Infinity;
      for (const r of allRiders) {
        const d = parseFloat(r.dist) || 0;
        if (d > best) { best = d; leaderId = r.athleteId; }
      }
      // Accrue lead time once per second (a real tick), not on every position update.
      if (newTick) {
        leadSamples.current += 1;
        if (leaderId != null) leadCount.current[leaderId] = (leadCount.current[leaderId] || 0) + 1;
      }
    }
    const samples = leadSamples.current;
    const leadPctById = {};
    for (const id of Object.keys(leadCount.current)) leadPctById[id] = leadCount.current[id] / samples;
    const youId = (localYou ?? hubYou)?.athleteId ?? null;
    const peloton = {
      leaderId, samples, leadPctById,
      youLeadPct: youId != null && samples ? (leadCount.current[youId] || 0) / samples : null,
    };

    setTel({
      // "live" = we have a real feed: this device is recording, or teammates are streaming.
      live: recording || allRiders.length > 0,
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
      riders: allRiders,
      radar: groupRadar(allRiders),
      peloton,
      you: localYou ?? hubYou,
      // Your recorded breadcrumb so far, and the selected course route (each a [lat,lon] array).
      path: recorder?.getPath?.() ?? [],
      course: Array.isArray(course) ? course : (course?.points || null),
      // Pack-fusion spacing (from phone-to-phone BLE ranging, when active): your fused gap to
      // the nearest teammate, and whether any rider's position is BLE-refined this tick.
      gap: (localYou ?? hubYou)?.gapM ?? null,
      packFused: allRiders.some((r) => r.fused),
    });
  }, [t, active, riders]); // eslint-disable-line react-hooks/exhaustive-deps

  return tel;
}
