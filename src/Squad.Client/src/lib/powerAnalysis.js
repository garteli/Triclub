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
// Denser set → a smooth mean-max curve on a log-time axis (Strava-style).
const DURATIONS = [1, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 900, 1200, 1800, 2400, 3600, 5400, 7200];
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

// Best-of envelope across several power curves (each [{sec,watts}]): the highest watts at
// every duration. Used for the "last 6 weeks" comparison on the Power Curve page.
export function curveEnvelope(curves) {
  const best = new Map();
  for (const c of curves || []) {
    for (const pt of c || []) {
      if (!best.has(pt.sec) || pt.watts > best.get(pt.sec)) best.set(pt.sec, pt.watts);
    }
  }
  return [...best.entries()].map(([sec, watts]) => ({ sec, watts })).sort((a, b) => a.sec - b.sec);
}

// The best average power sustained for `sec` in a curve (exact duration match), or null.
export function curveWattsAt(curve, sec) {
  const hit = (curve || []).find((c) => c.sec === sec);
  return hit ? hit.watts : null;
}

// Turn per-zone seconds into display rows: seconds, % of total, bar length (% of the busiest
// zone), and the zone's bpm/W bound (from `fracs`×`ref`). Null when there's no time or no ref.
// Shared by the activity Training Zones page. (fracs are the upper bounds; the last zone is open.)
export function zoneDistribution(seconds, fracs, ref) {
  const total = (seconds || []).reduce((a, b) => a + b, 0);
  if (total <= 0 || !ref) return null;
  const n = seconds.length, max = Math.max(...seconds);
  const bounds = fracs.map((f) => f * ref);
  const range = (i) => {
    const lo = i === 0 ? null : Math.round(bounds[i - 1]);
    const hi = i === n - 1 ? null : Math.round(bounds[i]) - 1;
    if (lo == null) return `< ${hi + 1}`;
    if (hi == null) return `> ${lo - 1}`;
    return `${lo}–${hi}`;
  };
  return seconds.map((sec, i) => ({
    i, z: `Z${i + 1}`, secs: sec,
    bar: max > 0 ? Math.round((sec / max) * 100) : 0,
    pct: Math.round((sec / total) * 100), range: range(i),
  }));
}

function haversine(la1, lo1, la2, lo2) {
  const R = 6371000, r = Math.PI / 180;
  const dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Best-effort durations (s) and distances (m) — the standard sets Strava lists.
export const EFFORT_DURATIONS = [5, 15, 30, 60, 120, 180, 300, 480, 600, 1200, 1800, 3600];
export const EFFORT_DISTANCES = [1000, 5000, 10000, 16093, 20000, 30000, 40000, 50000];

// Best average power sustained for each duration, plus the avg HR during that winning window.
export function powerBestEfforts(track, durations = EFFORT_DURATIONS) {
  if (!hasField(track, 'powerW')) return [];
  const p = resample1s(track, 'powerW', true);
  const hr = resample1s(track, 'heartRate', false);
  const out = [];
  for (const d of durations) {
    if (p.length < d) continue;
    let sum = 0, best = -1, bestEnd = -1;
    for (let i = 0; i < p.length; i++) {
      sum += p[i];
      if (i >= d) sum -= p[i - d];
      if (i >= d - 1 && sum / d > best) { best = sum / d; bestEnd = i; }
    }
    if (best <= 0) continue;
    let hs = 0, hn = 0;
    for (let k = bestEnd - d + 1; k <= bestEnd; k++) { if (hr[k] > 0) { hs += hr[k]; hn++; } }
    out.push({ sec: d, watts: Math.round(best), avgHr: hn ? Math.round(hs / hn) : null });
  }
  return out;
}

// Fastest time to cover each target distance (m), plus the avg HR over that stretch. GPS
// distance where available, else speed×dt; two-pointer over cumulative distance.
export function distanceBestEfforts(track, targets = EFFORT_DISTANCES) {
  const pts = track.filter((p) => Number.isFinite(p.offsetSec));
  if (pts.length < 2) return [];
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    let dd = 0;
    if (Number.isFinite(pts[i - 1].lat) && Number.isFinite(pts[i].lat)) dd = haversine(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
    else if (Number.isFinite(pts[i].speedMps)) dd = pts[i].speedMps * Math.max(0, pts[i].offsetSec - pts[i - 1].offsetSec);
    cum.push(cum[i - 1] + dd);
  }
  const total = cum[cum.length - 1];
  const out = [];
  for (const D of targets) {
    if (D > total) continue;
    let best = Infinity, bi = -1, bj = -1, j = 0;
    for (let i = 0; i < pts.length; i++) {
      while (j < i && cum[i] - cum[j] >= D) {
        const time = pts[i].offsetSec - pts[j].offsetSec;
        if (time > 0 && time < best) { best = time; bi = i; bj = j; }
        j++;
      }
    }
    if (best === Infinity) continue;
    let hs = 0, hn = 0;
    for (let k = bj; k <= bi; k++) { if (Number.isFinite(pts[k].heartRate)) { hs += pts[k].heartRate; hn++; } }
    out.push({ meters: D, sec: best, avgHr: hn ? Math.round(hs / hn) : null });
  }
  return out;
}
