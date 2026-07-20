import { useMemo, useState } from 'react';
import { loadZones } from '../lib/zones.js';
import {
  normalizedPower, hrZones, powerZones, powerCurve, powerBestEfforts, distanceBestEfforts,
} from '../lib/powerAnalysis.js';

// ---- shared formatters (used by the detail's render) ----
export function fmtDur(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s2 = sec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s2).padStart(2, '0')}`
    : `${m}:${String(s2).padStart(2, '0')}`;
}
export const pace = (secPerKm) => `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, '0')}`;
export const fmtEffortDur = (sec) => (sec < 60 ? `${sec}s` : sec % 60 === 0 ? `${sec / 60}m` : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`);
export const DIST_LABEL = { 1000: '1K', 5000: '5K', 10000: '10K', 16093: '10 mi', 20000: '20K', 30000: '30K', 40000: '40K', 50000: '50K' };
export const CURVE_LABEL = { 1: '1s', 5: '5s', 15: '15s', 30: '30s', 60: '1m', 300: '5m', 600: '10m', 1200: '20m', 3600: '1h', 7200: '2h' };

function haversine(la1, lo1, la2, lo2) {
  const R = 6371000, r = Math.PI / 180;
  const dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Per-`unit`-metre splits from the full track: GPS distance where available, else speed×dt.
function computeSplits(track, unit) {
  const pts = track.filter((p) => Number.isFinite(p.offsetSec));
  if (pts.length < 2) return [];
  const out = [];
  let prev = pts[0];
  let cum = 0, boundary = unit, segStart = pts[0].offsetSec ?? 0;
  let gain = 0, hrSum = 0, hrN = 0, pwSum = 0, pwN = 0;
  const flush = (endSec, meters, partial) => {
    out.push({
      index: out.length + 1, meters, sec: endSec - segStart,
      avgHr: hrN ? hrSum / hrN : null, avgPower: pwN ? pwSum / pwN : null, gain, partial,
    });
    segStart = endSec; gain = 0; hrSum = hrN = pwSum = pwN = 0;
  };
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    let d = 0;
    if (Number.isFinite(prev.lat) && Number.isFinite(p.lat)) d = haversine(prev.lat, prev.lon, p.lat, p.lon);
    else if (Number.isFinite(p.speedMps)) d = p.speedMps * Math.max(0, (p.offsetSec - prev.offsetSec));
    cum += d;
    if (Number.isFinite(prev.elevM) && Number.isFinite(p.elevM) && p.elevM > prev.elevM) gain += p.elevM - prev.elevM;
    if (Number.isFinite(p.heartRate)) { hrSum += p.heartRate; hrN++; }
    if (Number.isFinite(p.powerW)) { pwSum += p.powerW; pwN++; }
    while (cum >= boundary) { flush(p.offsetSec, unit, false); boundary += unit; }
    prev = p;
  }
  const tail = cum - (boundary - unit);
  if (tail > unit * 0.15) flush(pts[pts.length - 1].offsetSec, tail, true);
  return out;
}

// Total mechanical work (kJ) = ∫ power dt, guarding against recording gaps.
function totalWorkKJ(track) {
  let j = 0;
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1], b = track[i];
    if (!Number.isFinite(b.powerW) || !Number.isFinite(a.offsetSec) || !Number.isFinite(b.offsetSec)) continue;
    const dt = b.offsetSec - a.offsetSec;
    if (dt > 0 && dt < 30) j += b.powerW * dt;
  }
  return j / 1000;
}

// All the Strava-style analysis derived from the recorded FIT stream — splits, total work,
// Normalized Power / IF, power + HR zone time, power curve, best efforts, device laps.
export function useActivityAnalytics(track, laps, sport) {
  const [zones] = useState(() => loadZones()); // device FTP / max HR

  const splitUnit = sport === 'Swim' ? 100 : sport === 'Bike' ? 5000 : 1000;
  const splitUnitLabel = sport === 'Swim' ? 'per 100m' : sport === 'Bike' ? 'per 5km' : 'per km';
  const splits = useMemo(() => computeSplits(track || [], splitUnit), [track, splitUnit]);
  const workKJ = useMemo(() => totalWorkKJ(track || []), [track]);
  const np = useMemo(() => normalizedPower(track || []), [track]);
  const pwZones = useMemo(() => powerZones(track || [], zones.ftp), [track, zones.ftp]);
  const hZones = useMemo(() => hrZones(track || [], zones.maxHr), [track, zones.maxHr]);
  const curve = useMemo(() => powerCurve(track || []), [track]);
  const bestPower = useMemo(() => powerBestEfforts(track || []), [track]);
  const bestDist = useMemo(() => distanceBestEfforts(track || []), [track]);
  const ifactor = np && zones.ftp ? np / zones.ftp : null;
  const hasPower = curve.length > 0 || np != null;
  const hasHr = (track || []).some((p) => Number.isFinite(p.heartRate));

  const lapRows = useMemo(() => (laps || [])
    .map((l, i) => ({
      index: i + 1, meters: l.distanceMeters || 0, sec: l.durationSec || 0,
      avgHr: l.avgHeartRate ?? null, avgPower: l.avgPowerWatts ?? null, gain: l.elevGainMeters || 0,
    }))
    .filter((r) => r.meters > 0 && r.sec > 0), [laps]);
  const useLaps = lapRows.length >= 2;

  return {
    zones, splitUnit, splitUnitLabel, splits, workKJ, np, ifactor,
    pwZones, hZones, curve, bestPower, bestDist, hasPower, hasHr, lapRows, useLaps,
  };
}
