// Ties the route-breakdown analysis (routeProfile.analyzeProfile) to a recorded activity: builds the
// elevation profile from the *recorded* track (real recorded elevation, not a terrain read) and maps
// each detected section (flat / climb / descent) back onto the frames that fall inside its distance
// band — so a section-by-section card can show the avg/max power, avg/max speed and time actually ridden
// over that stretch. Everything is derived from the frames (see activityFrames.js); nothing is fabricated.

import { haversineMeters } from './geo.js';
import { analyzeProfile } from './routeProfile.js';

const finite = (arr) => arr.filter((v) => v != null && Number.isFinite(v));
const avg = (arr) => { const f = finite(arr); return f.length ? f.reduce((a, b) => a + b, 0) / f.length : null; };
const max = (arr) => { const f = finite(arr); return f.length ? Math.max(...f) : null; };
const round = (v) => (v == null ? null : Math.round(v));
const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

// Per-frame cumulative distance (metres) along the carried-forward GPS track — the same haversine sum
// the elevation profile is built from, so a section's [startM,endM] band selects the right frames.
export function frameDistances(frames) {
  const d = new Array(frames.length).fill(0);
  let acc = 0;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1], b = frames[i];
    if (a.mLat != null && b.mLat != null) acc += haversineMeters({ lat: a.mLat, lon: a.mLon }, { lat: b.mLat, lon: b.mLon });
    d[i] = acc;
  }
  return d;
}

// The recorded elevation-vs-distance profile ([{dist(m), e(m)}]) — real recorded altitude, keyed to the
// cumulative GPS distance. Returns null when there isn't a usable GPS + elevation stream (indoor rides).
export function activityElevation(frames) {
  const dist = frameDistances(frames);
  const profile = [];
  for (let i = 0; i < frames.length; i++) {
    if (Number.isFinite(frames[i].elev)) profile.push({ dist: dist[i], e: frames[i].elev });
  }
  return profile.length >= 4 && profile[profile.length - 1].dist > 0 ? { profile } : null;
}

// For each analysed section, the power / speed / time actually ridden over its distance band. Keyed by
// section.index so it lines up with analyzeProfile(elev.profile) run anywhere else on the same profile.
export function sectionStats(frames, sections) {
  const dist = frameDistances(frames);
  const stats = {};
  for (const sec of sections) {
    const idx = [];
    for (let i = 0; i < frames.length; i++) if (dist[i] >= sec.startM && dist[i] <= sec.endM) idx.push(i);
    if (!idx.length) continue;
    const offs = finite(idx.map((i) => frames[i].offsetSec));
    stats[sec.index] = {
      avgPower: round(avg(idx.map((i) => frames[i].power))),
      maxPower: round(max(idx.map((i) => frames[i].power))),
      avgSpeed: round1(avg(idx.map((i) => frames[i].speed))),
      maxSpeed: round1(max(idx.map((i) => frames[i].speed))),
      avgHr: round(avg(idx.map((i) => frames[i].hr))),
      maxHr: round(max(idx.map((i) => frames[i].hr))),
      durationSec: offs.length >= 2 ? Math.round(offs[offs.length - 1] - offs[0]) : null,
    };
  }
  return stats;
}

// One call for the detail view: the recorded profile ({profile}) + per-section stats, or null when the
// activity has no usable GPS + elevation to break down.
export function activitySectionBreakdown(frames) {
  const elev = activityElevation(frames);
  if (!elev) return null;
  const analysis = analyzeProfile(elev.profile);
  if (!analysis) return null;
  return { elev, stats: sectionStats(frames, analysis.sections) };
}
