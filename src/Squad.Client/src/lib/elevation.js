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

// Cumulative distance (m) of a position projected onto a [[lat,lon],…] route, or null with no
// fix / route. Walks each segment, keeping the projection with the smallest perpendicular distance
// — used to place the "you are here" marker on an elevation profile.
export function progressMeters(route, you) {
  const pts = (route || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (!you || !Number.isFinite(you[0]) || !Number.isFinite(you[1]) || pts.length < 2) return null;
  const refLat = pts[0][0];
  const kx = 111320 * Math.cos((refLat * Math.PI) / 180);
  const ky = 111320;
  const P = { x: you[1] * kx, y: you[0] * ky };
  let acc = 0, best = { d2: Infinity, dist: 0 };
  for (let i = 1; i < pts.length; i++) {
    const A = { x: pts[i - 1][1] * kx, y: pts[i - 1][0] * ky };
    const B = { x: pts[i][1] * kx, y: pts[i][0] * ky };
    const abx = B.x - A.x, aby = B.y - A.y;
    const len2 = abx * abx + aby * aby;
    const t = len2 ? Math.max(0, Math.min(1, ((P.x - A.x) * abx + (P.y - A.y) * aby) / len2)) : 0;
    const px = A.x + t * abx, py = A.y + t * aby;
    const d2 = (P.x - px) ** 2 + (P.y - py) ** 2;
    const segLen = haversineMeters({ lat: pts[i - 1][0], lon: pts[i - 1][1] }, { lat: pts[i][0], lon: pts[i][1] });
    if (d2 < best.d2) best = { d2, dist: acc + t * segLen };
    acc += segLen;
  }
  return best.dist;
}

// Elevation (m) interpolated at a cumulative distance along a sampled profile ([{dist,e}]).
export function elevAt(profile, dist) {
  if (!profile || !profile.length) return null;
  if (dist <= profile[0].dist) return profile[0].e;
  const last = profile[profile.length - 1];
  if (dist >= last.dist) return last.e;
  for (let i = 1; i < profile.length; i++) {
    if (dist <= profile[i].dist) {
      const a = profile[i - 1], b = profile[i];
      const f = b.dist === a.dist ? 0 : (dist - a.dist) / (b.dist - a.dist);
      return a.e + (b.e - a.e) * f;
    }
  }
  return last.e;
}
