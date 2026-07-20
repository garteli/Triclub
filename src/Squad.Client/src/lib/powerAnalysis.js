// Pure power/HR analysis derived from an activity's recorded track (the points served by
// GET /api/activities/{id}/track). No per-athlete server data needed: Normalized Power and
// the power curve come from the power stream alone; zones + Intensity Factor use the viewer's
// FTP / max-HR (device-local, see lib/zones.js). All functions tolerate missing fields.

// Seconds a sample covers = gap to the next point, clamped so a recording pause doesn't
// count as hours in a zone. Falls back to 1 s.
function dtOf(track, i) {
  if (i + 1 >= track.length) return 1;
  const dt = (track[i + 1].offsetSec ?? 0) - (track[i].offsetSec ?? 0);
  return dt > 0 && dt < 30 ? dt : 1;
}

// Resample a field onto a 1 Hz grid (0..maxOffset seconds), forward-filling gaps. Power gaps
// fill with 0 (coasting); other fields hold the last value.
function resample1s(track, field, zeroFill) {
  const pts = track.filter((p) => Number.isFinite(p.offsetSec));
  if (!pts.length) return [];
  const maxSec = Math.round(pts[pts.length - 1].offsetSec);
  if (maxSec <= 0 || maxSec > 200000) return []; // guard absurd offsets
  const out = new Array(maxSec + 1).fill(null);
  for (const p of pts) {
    const sec = Math.round(p.offsetSec);
    if (sec >= 0 && sec <= maxSec && Number.isFinite(p[field])) out[sec] = p[field];
  }
  let last = zeroFill ? 0 : null;
  for (let i = 0; i < out.length; i++) {
    if (out[i] == null) out[i] = last;
    else last = out[i];
  }
  return out.map((v) => (v == null ? 0 : v));
}

const hasField = (track, field) => track.some((p) => Number.isFinite(p[field]) && p[field] > 0);

// Normalized Power: 4th-root of the mean of the 4th powers of a 30 s rolling-average power.
export function normalizedPower(track) {
  if (!hasField(track, 'powerW')) return null;
  const p = resample1s(track, 'powerW', true);
  if (p.length < 30) return null;
  let sum = 0;
  const roll = [];
  for (let i = 0; i < p.length; i++) {
    sum += p[i];
    if (i >= 30) sum -= p[i - 30];
    if (i >= 29) roll.push(sum / 30);
  }
  if (!roll.length) return null;
  const mean4 = roll.reduce((a, v) => a + v ** 4, 0) / roll.length;
  return Math.round(mean4 ** 0.25);
}

// Zone thresholds + names — one source for both the compute below and the detail-view table.
// HR: 5 zones, upper fraction of max HR (Z1 <60, Z2 60–70, Z3 70–80, Z4 80–90, Z5 ≥90%).
export const HR_ZONE_FRACS = [0.6, 0.7, 0.8, 0.9];
export const HR_ZONE_NAMES = ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'Anaerobic'];
export function hrZones(track, maxHr) {
  if (!maxHr || !hasField(track, 'heartRate')) return null;
  const secs = [0, 0, 0, 0, 0];
  for (let i = 0; i < track.length; i++) {
    const hr = track[i].heartRate;
    if (!Number.isFinite(hr)) continue;
    const frac = hr / maxHr;
    let z = HR_ZONE_FRACS.findIndex((u) => frac < u);
    if (z < 0) z = 4;
    secs[z] += dtOf(track, i);
  }
  return secs;
}

// Power zones (7, Coggan fractions of FTP): upper bounds 55/75/90/105/120/150%, then Z7.
export const PWR_ZONE_FRACS = [0.55, 0.75, 0.9, 1.05, 1.2, 1.5];
export const PWR_ZONE_NAMES = ['Recovery', 'Endurance', 'Tempo', 'Threshold', 'VO₂ max', 'Anaerobic', 'Neuromuscular'];
export function powerZones(track, ftp) {
  if (!ftp || !hasField(track, 'powerW')) return null;
  const secs = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < track.length; i++) {
    const pw = track[i].powerW;
    if (!Number.isFinite(pw)) continue;
    let z = PWR_ZONE_FRACS.findIndex((u) => pw / ftp < u);
    if (z < 0) z = 6;
    secs[z] += dtOf(track, i);
  }
  return secs;
}

// Best average power sustained for each standard duration (the mean-max power curve).
const DURATIONS = [5, 15, 30, 60, 300, 600, 1200, 3600];
export function powerCurve(track) {
  if (!hasField(track, 'powerW')) return [];
  const p = resample1s(track, 'powerW', true);
  const out = [];
  for (const d of DURATIONS) {
    if (p.length < d) continue;
    let sum = 0, best = 0;
    for (let i = 0; i < p.length; i++) {
      sum += p[i];
      if (i >= d) sum -= p[i - d];
      if (i >= d - 1) best = Math.max(best, sum / d);
    }
    if (best > 0) out.push({ sec: d, watts: Math.round(best) });
  }
  return out;
}
