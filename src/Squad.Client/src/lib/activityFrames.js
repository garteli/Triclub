// Turns a recorded activity track (GET /api/activities/{id}/track) into the shared
// frame model the detail view's replay uses: one downsampled array whose index space is
// shared by the hero-map marker, the progressive route, and every chart cursor. Map
// coordinates carry forward through GPS gaps (and back-fill at the head) so a dropout
// doesn't strand the marker; metric fields keep nulls so chart gaps still read as gaps.

// Evenly downsample to at most `max` points (keeps first & last) so a multi-thousand-point
// ride doesn't render thousands of SVG nodes.
export function sample(arr, max) {
  if (arr.length <= max) return arr;
  const step = (arr.length - 1) / (max - 1);
  const out = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.round(i * step)]);
  return out;
}

export function buildFrames(track) {
  const t = sample(track || [], 600);
  const fr = t.map((p) => ({
    lat: Number.isFinite(p.lat) ? p.lat : null,
    lon: Number.isFinite(p.lon) ? p.lon : null,
    offsetSec: Number.isFinite(p.offsetSec) ? p.offsetSec : null,
    hr: p.heartRate ?? null,
    power: p.powerW ?? null,
    speed: p.speedMps != null ? p.speedMps * 3.6 : null, // m/s → km/h
    cadence: p.cadence ?? null,
    elev: p.elevM ?? null,
  }));
  let lat = null, lon = null;
  for (const f of fr) {
    if (f.lat != null && f.lon != null) { lat = f.lat; lon = f.lon; }
    f.mLat = lat; f.mLon = lon;
  }
  const first = fr.find((f) => f.mLat != null);
  if (first) for (const f of fr) { if (f.mLat == null) { f.mLat = first.mLat; f.mLon = first.mLon; } }
  return fr;
}

// The map polyline: every frame's carried-forward coordinate (so the line is continuous).
export function frameRoute(frames) {
  return frames.filter((f) => f.mLat != null && f.mLon != null).map((f) => [f.mLat, f.mLon]);
}

export function gpsFrameCount(frames) {
  return frames.reduce((n, f) => n + (f.lat != null ? 1 : 0), 0);
}

// The per-point traces, filtered to those the recording actually carries (≥2 samples).
const TRACE_DEFS = [
  { key: 'hr', title: 'Heart rate', unit: 'bpm', stroke: 'var(--bad)', fill: 'var(--bad)', get: (f) => f.hr },
  { key: 'power', title: 'Power', unit: 'W', stroke: 'var(--accent)', fill: 'var(--accent)', get: (f) => f.power },
  { key: 'speed', title: 'Speed', unit: 'km/h', stroke: 'var(--bike)', fill: 'var(--bike)', fmt: (x) => x.toFixed(1), get: (f) => f.speed },
  { key: 'cadence', title: 'Cadence', unit: 'rpm', stroke: 'var(--warn)', fill: 'var(--warn)', get: (f) => f.cadence },
  { key: 'elev', title: 'Elevation', unit: 'm', stroke: 'var(--good)', fill: 'var(--good)', get: (f) => f.elev },
];

export function buildTraces(frames) {
  return TRACE_DEFS
    .map((d) => ({ key: d.key, title: d.title, unit: d.unit, stroke: d.stroke, fill: d.fill, fmt: d.fmt, values: frames.map(d.get) }))
    .filter((t) => t.values.filter((v) => v != null && Number.isFinite(v)).length >= 2);
}
