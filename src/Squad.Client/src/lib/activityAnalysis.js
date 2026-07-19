// Deterministic per-activity analysis charts. Seeded by the activity id (no
// Math.random) so every activity gets a distinct-but-stable HR/elevation trace,
// split profile, HR-zone split, power curve and lap table — and they don't
// flicker as the shared tick re-runs the view-model. In production these come
// from the parsed FIT stream; this keeps the prototype's charts believable.

function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ZONES = [
  { z: 'Z1', label: 'Recovery',  color: '#8b93a0' },
  { z: 'Z2', label: 'Endurance', color: 'var(--good)' },
  { z: 'Z3', label: 'Tempo',     color: 'var(--bike)' },
  { z: 'Z4', label: 'Threshold', color: 'var(--behind)' },
  { z: 'Z5', label: 'VO2 max',   color: 'var(--bad)' },
];

const fmtTime = (sec) => { const s = Math.round(sec); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const scaleTo = (arr, lo, hi) => {
  const mn = Math.min(...arr), mx = Math.max(...arr), r = (mx - mn) || 1;
  return arr.map((v) => hi - ((v - mn) / r) * (hi - lo));
};

export function activityAnalysis(a) {
  const rand = mulberry32(hashStr(a.id));
  const intensity = Math.max(0, Math.min(1, ((a.avgHr - 115) / 60) * 0.7 + (a.load / 160) * 0.3));

  // ---- HR + elevation trace (chart viewBox 320 x 90) ----
  const N = 13, W = 320, H = 90;
  let elev = 0;
  const elevRaw = [], hrRaw = [];
  for (let i = 0; i < N; i++) {
    elev += (rand() - 0.45) * 3;
    elevRaw.push(elev);
    hrRaw.push(a.avgHr + Math.sin(i / 1.7 + rand()) * (6 + intensity * 10) + (rand() - 0.5) * 4);
  }
  const elevY = scaleTo(elevRaw, 30, 80), hrY = scaleTo(hrRaw, 20, 66);
  const px = (i) => ((i / (N - 1)) * W).toFixed(1);
  const hrPoints = hrRaw.map((_, i) => px(i) + ',' + hrY[i].toFixed(1)).join(' ');
  const elevArea = elevRaw.map((_, i) => px(i) + ',' + elevY[i].toFixed(1)).join(' ') + ` ${W},${H} 0,${H}`;

  // ---- HR-zone distribution (weighted by intensity) ----
  let zw = [12 * (1 - intensity) + 3, 42 * (1 - intensity) + 8, 22 + rand() * 6, 8 + 34 * intensity, 2 + 20 * intensity];
  zw = zw.map((w) => w * (0.85 + rand() * 0.3));
  const zsum = zw.reduce((x, y) => x + y, 0);
  const zpct = zw.map((w) => Math.round((w / zsum) * 100));
  zpct[1] += 100 - zpct.reduce((x, y) => x + y, 0); // absorb rounding into Z2
  const zones = ZONES.map((z, i) => ({ ...z, pct: Math.max(0, zpct[i]) }));

  // ---- splits (bike/run) ----
  const distKm = parseFloat(String(a.dist).replace(/,/g, '')) / (a.distU === 'm' ? 1000 : 1);
  const nSplits = Math.max(4, Math.min(12, Math.round(distKm || 6)));
  const splitVals = Array.from({ length: nSplits }, () => 0.5 + rand());
  const smn = Math.min(...splitVals), smx = Math.max(...splitVals), best = splitVals.indexOf(smx);
  const splitColor = a.sport === 'Run' ? 'var(--run)' : 'var(--bike)';
  const splitBars = splitVals.map((v, i) => ({
    km: i + 1,
    h: Math.round(((v - smn) / ((smx - smn) || 1)) * 52 + 22),
    barColor: i === best ? 'var(--accent)' : splitColor,
    op: i === best ? '1' : '.55',
  }));

  // ---- peak power curve (bike) ----
  const baseCurve = [842, 612, 498, 341, 288, 262];
  const labels = ['5s', '30s', '1m', '5m', '20m', '60m'];
  const pf = 0.8 + (a.load / 160) * 0.4 + rand() * 0.12;
  const watts = baseCurve.map((w) => Math.round(w * pf));
  const pmax = Math.max(...watts);
  const powerCurve = watts.map((w, i) => ({ t: labels[i], w, h: Math.round((w / pmax) * 84 + 8) }));

  // ---- laps (bike) ----
  const nLaps = 4 + Math.floor(rand() * 3);
  const lapDist = Math.max(5, (distKm || 40) / nLaps);
  let bestLap = 0, bestTime = Infinity;
  const lapsRaw = Array.from({ length: nLaps }, () => {
    const spd = 24 + (rand() - 0.4) * 8;
    const time = (lapDist / spd) * 3600;
    return { dist: lapDist.toFixed(1), spd, time, pw: Math.round(220 + rand() * 60) };
  });
  lapsRaw.forEach((l, i) => { if (l.time < bestTime) { bestTime = l.time; bestLap = i; } });
  const laps = lapsRaw.map((l, i) => ({
    n: i + 1, dist: l.dist, time: fmtTime(l.time), speed: l.spd.toFixed(1), pw: l.pw,
    best: i === bestLap,
    rowBg: i === bestLap ? 'background:var(--accent-dim)' : 'background:transparent',
    bestColor: i === bestLap ? 'var(--accent)' : 'var(--text)',
  }));

  return { hrPoints, elevArea, zones, splitBars, powerCurve, laps };
}
