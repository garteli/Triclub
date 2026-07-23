// Real terrain-elevation profile for a [[lat,lon],…] route, from the Open-Meteo elevation API
// (CORS-enabled, no key — the same provider the app uses for weather). Shared by the course
// drawer and the event page so every elevation chart reflects the actual terrain, never fake data.

import { haversineMeters } from './geo.js';

// Sample N points evenly ALONG the polyline (interpolating inside segments), each with its
// cumulative distance (m) — so the profile reflects the whole route, not just its vertices.
export function sampleAlong(pts, N) {
  const clean = (pts || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (clean.length < 2) return [];
  const seg = []; let total = 0;
  for (let i = 1; i < clean.length; i++) {
    const d = haversineMeters({ lat: clean[i - 1][0], lon: clean[i - 1][1] }, { lat: clean[i][0], lon: clean[i][1] });
    seg.push({ a: clean[i - 1], b: clean[i], d, start: total }); total += d;
  }
  if (total === 0) return [];
  const out = [];
  for (let k = 0; k < N; k++) {
    const target = (total * k) / (N - 1);
    const sg = seg.find((x) => target <= x.start + x.d) || seg[seg.length - 1];
    const f = sg.d ? (target - sg.start) / sg.d : 0;
    out.push({ lat: sg.a[0] + (sg.b[0] - sg.a[0]) * f, lon: sg.a[1] + (sg.b[1] - sg.a[1]) * f, dist: target });
  }
  return out;
}

// Terrain elevations (metres[]) for a set of {lat,lon} samples, aligned to the samples.
async function fetchElevations(samples, signal) {
  const lat = samples.map((s) => s.lat.toFixed(5)).join(',');
  const lon = samples.map((s) => s.lon.toFixed(5)).join(',');
  const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`, { signal });
  if (!res.ok) throw new Error('elevation');
  return (await res.json()).elevation || [];
}

// Build the elevation profile for a route: samples along it, reads the terrain, and returns
// { profile:[{dist,e}], ascent, min, max } — or null if it can't be built. Pass an AbortSignal.
export async function buildElevationProfile(pts, signal) {
  const samples = sampleAlong(pts, Math.min(90, Math.max(12, (pts?.length || 0) * 2)));
  if (samples.length < 2) return null;
  const els = await fetchElevations(samples, signal);
  if (els.length !== samples.length) throw new Error('mismatch');
  let ascent = 0;
  for (let i = 1; i < els.length; i++) { const d = els[i] - els[i - 1]; if (d > 0) ascent += d; }
  return {
    profile: samples.map((sm, i) => ({ dist: sm.dist, e: els[i] })),
    ascent: Math.round(ascent),
    min: Math.min(...els),
    max: Math.max(...els),
  };
}
