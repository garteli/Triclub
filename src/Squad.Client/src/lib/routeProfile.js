// Route intelligence — split a route's elevation profile into Grand-Tour-style sections (flats,
// climbs, descents), grade + colour-code each, and categorise the climbs (Cat 4 → HC). Pure and
// derived entirely from the real terrain profile the app already reads (see elevation.js), so it
// fabricates nothing. Feeds the event-page preview and the live climb screens. Band thresholds and
// the category scoring mirror the design handoff (Route Analysis / Climb Fields).

import { haversineMeters } from './geo.js';

// Steepness → colour + label. Negative = descent, then flat/rolling and the climb ramps.
export function gradientBand(gPct) {
  if (gPct < 0) return { color: '#37c0ff', label: 'Descent' };
  if (gPct < 2) return { color: '#6b7686', label: 'Flat' };
  if (gPct < 5) return { color: '#4fe08b', label: '2–5%' };
  if (gPct < 8) return { color: '#ffc24d', label: '5–8%' };
  if (gPct < 11) return { color: '#ff7a3c', label: '8–11%' };
  return { color: '#ff3b30', label: '11%+' };
}

// The legend used on the profile, in order.
export const PROFILE_LEGEND = [
  { c: '#6b7686', label: 'Flat' },
  { c: '#4fe08b', label: '2–5%' },
  { c: '#ffc24d', label: '5–8%' },
  { c: '#ff7a3c', label: '8–11%' },
  { c: '#ff3b30', label: '11%+' },
  { c: '#37c0ff', label: 'Descent' },
];

// Climb category → chip colours (fill, ink).
export function catStyle(cat) {
  const m = { HC: ['#14171d', '#fff'], 1: ['#ff3b30', '#fff'], 2: ['#ff7a3c', '#1a1005'], 3: ['#ffc24d', '#1a1400'], 4: ['#4fe08b', '#062012'] };
  const v = m[cat] || ['#6b7686', '#fff'];
  return { color: v[0], ink: v[1] };
}

// Categorise a climb from its total gain (m) and average gradient (%). Small rises stay
// uncategorised (null → shown as a plain "rolling" bump). Score = gain × avg-grade; thresholds are
// tunable — calibrated so e.g. a ~230 m @ 7% climb lands around Cat 3.
export function climbCategory(gainM, avgGradPct) {
  if (gainM < 30 || avgGradPct < 2.5) return null;
  const score = gainM * avgGradPct;
  if (score >= 12000) return 'HC';
  if (score >= 6000) return 1;
  if (score >= 3000) return 2;
  if (score >= 1200) return 3;
  return 4;
}

// The [lat,lon] at a cumulative distance (metres) along a route polyline — for naming a section
// (e.g. reverse-geocoding a climb's summit).
export function coordAtDistance(points, targetM) {
  const pts = (points || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (pts.length < 2) return null;
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = haversineMeters({ lat: pts[i - 1][0], lon: pts[i - 1][1] }, { lat: pts[i][0], lon: pts[i][1] });
    if (acc + seg >= targetM) {
      const t = seg ? (targetM - acc) / seg : 0;
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
    }
    acc += seg;
  }
  return pts[pts.length - 1];
}

const smooth = (arr, k) => arr.map((_, i) => {
  let s = 0, c = 0;
  for (let j = -k; j <= k; j++) { const m = i + j; if (m >= 0 && m < arr.length) { s += arr[m]; c += 1; } }
  return s / c;
});

// Resample a profile to evenly-spaced samples (metres apart), interpolating elevation. A raw/dense
// input (e.g. an off-road GPX with points every few metres, or a noisy terrain read) would otherwise
// spawn hundreds of ~metre-long "sections" with absurd gradients; a fixed grid bounds the work and
// smooths the noise before anything is measured.
function resampleEven(raw, stepM) {
  const totalM = raw[raw.length - 1].dist;
  if (!(totalM > 0)) return raw;
  const out = [];
  let j = 0;
  for (let dist = 0; dist < totalM; dist += stepM) {
    while (j < raw.length - 1 && raw[j + 1].dist < dist) j += 1;
    const a = raw[j];
    const b = raw[Math.min(j + 1, raw.length - 1)];
    const f = b.dist > a.dist ? (dist - a.dist) / (b.dist - a.dist) : 0;
    out.push({ dist, e: a.e + (b.e - a.e) * f });
  }
  out.push({ dist: totalM, e: raw[raw.length - 1].e });
  return out;
}

// Steepest ~200 m ramp inside a sample window [a,b) → gradient %.
const maxRamp = (d, e, a, b) => {
  let mx = 0;
  for (let i = a; i < b; i++) {
    let j = i; while (j < b && d[j] - d[i] < 200) j += 1;
    if (j > i) { const g = (e[j] - e[i]) / ((d[j] - d[i]) || 1) * 100; if (g > mx) mx = g; }
  }
  return mx;
};

// Analyse an elevation profile ([{dist(m), e(m)}, …] from buildElevationProfile) into sections.
// Returns null if there isn't enough to work with. Section kinds: 'climb' | 'descent' | 'flat'.
export function analyzeProfile(profile) {
  const raw = (profile || []).filter((p) => Number.isFinite(p?.dist) && Number.isFinite(p?.e));
  if (raw.length < 4) return null;
  // Resample to an even grid (≥120 m spacing, ≤~500 samples) so section detection is driven by real
  // terrain, not raw point density — then smooth. Without this a dense GPX yields hundreds of
  // metre-long "climbs" at impossible gradients (e.g. +581%) and a wildly inflated total ascent.
  const totalLen = raw[raw.length - 1].dist || 1;
  const step = Math.max(120, totalLen / 500);
  const grid = resampleEven(raw, step);
  const d = grid.map((p) => p.dist);
  const e = smooth(grid.map((p) => p.e), 2);
  const totalM = d[d.length - 1] || 1;
  const span = Math.max(1, Math.max(...e) - Math.min(...e));
  const MIN_LEN = Math.max(250, totalM * 0.03);   // ignore sections shorter than this…
  const MIN_PROM = Math.max(12, span * 0.06);      // …or with less elevation change than this

  // 1) initial runs by slope sign (2% dead-band so noise doesn't create sections)
  const type = [];
  for (let i = 0; i < d.length - 1; i++) {
    const g = (e[i + 1] - e[i]) / ((d[i + 1] - d[i]) || 1);
    type.push(g > 0.02 ? 1 : g < -0.02 ? -1 : 0);
  }
  const runs = []; let s = 0;
  for (let i = 1; i < type.length; i++) { if (type[i] !== type[s]) { runs.push({ a: s, b: i }); s = i; } }
  runs.push({ a: s, b: type.length });

  // 2) greedily merge insignificant sections into the neighbour with the closest gradient
  const mk = (a, b) => { const lenM = d[b] - d[a]; const gainM = e[b] - e[a]; return { a, b, lenM, gainM, grad: gainM / (lenM || 1) * 100 }; };
  let secs = runs.map((r) => mk(r.a, r.b));
  // "Weak" = a noise fragment: BOTH short AND low-prominence. A long gentle stretch is a real flat
  // (long, so not weak); a short steep wall is a real climb (high prominence, so not weak).
  const weak = (x) => x.lenM < MIN_LEN && Math.abs(x.gainM) < MIN_PROM;
  let guard = 0;
  while (secs.length > 1 && guard++ < 4000) {
    let idx = -1, best = Infinity;
    for (let i = 0; i < secs.length; i++) { if (weak(secs[i]) && Math.abs(secs[i].gainM) < best) { best = Math.abs(secs[i].gainM); idx = i; } }
    if (idx < 0) break;
    const left = idx > 0 ? secs[idx - 1] : null;
    const right = idx < secs.length - 1 ? secs[idx + 1] : null;
    let into;
    if (left && right) into = Math.abs(left.grad - secs[idx].grad) <= Math.abs(right.grad - secs[idx].grad) ? idx - 1 : idx + 1;
    else into = left ? idx - 1 : idx + 1;
    const lo = Math.min(into, idx), hi = Math.max(into, idx);
    secs.splice(lo, 2, mk(secs[lo].a, secs[hi].b));
  }

  // 3) classify + enrich
  const sections = secs.map((r, i) => {
    const kind = r.grad >= 1.5 ? 'climb' : r.grad <= -1.5 ? 'descent' : 'flat';
    const cat = kind === 'climb' ? climbCategory(r.gainM, r.grad) : null;
    const color = kind === 'descent' ? '#37c0ff' : kind === 'flat' ? '#6b7686' : gradientBand(r.grad).color;
    return {
      index: i + 1, kind, cat, color,
      aIdx: r.a, bIdx: r.b,
      startM: d[r.a], endM: d[r.b], lenM: r.lenM,
      gainM: Math.round(r.gainM), avgGradPct: r.grad,
      maxGradPct: kind === 'climb' ? maxRamp(d, e, r.a, r.b) : 0,
      summitM: kind === 'climb' ? d[r.b] : (d[r.a] + d[r.b]) / 2,
    };
  });

  const climbs = sections.filter((x) => x.kind === 'climb');
  return {
    totalKm: totalM / 1000,
    totalGainM: sections.reduce((a, x) => a + Math.max(0, x.gainM), 0),
    climbCount: climbs.length,
    minE: Math.round(Math.min(...e)), maxE: Math.round(Math.max(...e)),
    startE: Math.round(e[0]), finishE: Math.round(e[e.length - 1]),
    maxGradPct: climbs.reduce((a, x) => Math.max(a, x.maxGradPct), 0),
    // The resampled+smoothed profile the section aIdx/bIdx index into — the drawer must use THIS
    // (not the raw input) so the ridge segments and summit chips line up with the sections.
    profile: d.map((dist, i) => ({ dist, e: e[i] })),
    sections,
  };
}

// A short kind label for a section row.
export const sectionKindLabel = (sec) =>
  sec.kind === 'climb' ? (sec.cat ? `Cat ${sec.cat} climb` : 'Climb')
    : sec.kind === 'descent' ? 'Descent'
      : Math.abs(sec.avgGradPct) < 1 ? 'Flat' : 'Rolling';
