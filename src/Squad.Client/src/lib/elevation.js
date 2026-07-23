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
// Chunked to ≤100 coordinates per request (Open-Meteo's per-call limit) so a dense route
// still resolves in a few calls.
async function fetchElevations(samples, signal) {
  const out = [];
  for (let i = 0; i < samples.length; i += 100) {
    const batch = samples.slice(i, i + 100);
    const lat = batch.map((s) => s.lat.toFixed(5)).join(',');
    const lon = batch.map((s) => s.lon.toFixed(5)).join(',');
    const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`, { signal });
    if (!res.ok) throw new Error('elevation');
    out.push(...((await res.json()).elevation || []));
  }
  return out;
}

// Build the profile straight from a route that already carries per-point elevation (a 3rd value:
// [lat,lon,ele], e.g. an imported off-road.io GPX). Returns the same { profile,ascent,min,max } shape
// — real source elevation, no terrain API, no rate limit. Null when the route has no usable elevation.
export function profileFromRoute(points) {
  const pts = (points || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  const withEle = pts.filter((p) => Number.isFinite(p[2]));
  // Need elevation on most points to trust it (a stray value isn't a profile).
  if (withEle.length < 2 || withEle.length < pts.length * 0.5) return null;
  const profile = [{ dist: 0, e: Number.isFinite(pts[0][2]) ? pts[0][2] : withEle[0][2] }];
  let dist = 0;
  for (let i = 1; i < pts.length; i++) {
    dist += haversineMeters({ lat: pts[i - 1][0], lon: pts[i - 1][1] }, { lat: pts[i][0], lon: pts[i][1] });
    const e = Number.isFinite(pts[i][2]) ? pts[i][2] : profile[profile.length - 1].e; // carry last if a point lacks ele
    profile.push({ dist, e });
  }
  if (dist <= 0) return null;
  let ascent = 0;
  for (let i = 1; i < profile.length; i++) { const d = profile[i].e - profile[i - 1].e; if (d > 0) ascent += d; }
  const es = profile.map((p) => p.e);
  return { profile, ascent: Math.round(ascent), min: Math.min(...es), max: Math.max(...es) };
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

// Denser terrain profile for climb detection: samples the route at ~fixed spacing (capped so the
// terrain read stays a few API calls) and returns { profile:[{dist,e}], ascent, min, max, spacingM }.
// Coarser buildElevationProfile is fine for a sparkline; climb detection wants tighter spacing.
export async function buildDenseProfile(pts, signal, { maxSamples = 300, minSpacingM = 80 } = {}) {
  const clean = (pts || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (clean.length < 2) return null;
  let total = 0;
  for (let i = 1; i < clean.length; i++) total += haversineMeters({ lat: clean[i - 1][0], lon: clean[i - 1][1] }, { lat: clean[i][0], lon: clean[i][1] });
  if (total === 0) return null;
  const N = Math.max(4, Math.min(maxSamples, Math.floor(total / minSpacingM) + 1));
  const samples = sampleAlong(clean, N);
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
    spacingM: total / (N - 1),
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
