import { rideBase } from '../data/squadData.js';

// Derive live rider telemetry for tick `t` — matches the prototype's
// rideRiders map (speed/HR oscillate sinusoidally, distance creeps up).
export function deriveRideRiders(t) {
  return rideBase.map((r, i) => {
    const ph = i * 1.7;
    const spd = (r.bk + 2.4 * Math.sin((t + ph) / 2.6)).toFixed(1);
    const hr = Math.round(r.bh + 7 * Math.sin((t + ph) / 3.4));
    const dist = (24.6 - i * 0.4 + t * 0.009).toFixed(1);
    const hrPct = Math.min(100, Math.round(((hr - 110) / 70) * 100));
    const hrColor = hr > 168 ? 'var(--bad)' : hr > 158 ? 'var(--warn)' : 'var(--good)';
    const rowBg = r.you
      ? 'background:var(--accent-dim);border:1px solid color-mix(in srgb,var(--accent) 40%,transparent)'
      : r.dropped
      ? 'background:var(--bg2);border:1px solid color-mix(in srgb,var(--behind) 35%,transparent)'
      : 'background:var(--bg2);border:1px solid var(--line)';
    return { ...r, spd, hr, dist, hrPct, hrColor, rowBg };
  });
}

// mm:ss elapsed timer, wrapping just under 100 minutes like the prototype.
export function formatTimer(t) {
  const elapsed = t % 5999;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

// Regroup gap (metres) — oscillates so the "dropped rider" indicator feels live.
export function gapMeters(t) {
  return Math.round(180 + 30 * Math.abs(Math.sin(t / 4)));
}
