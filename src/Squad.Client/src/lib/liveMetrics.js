// Live-ride telemetry for the unified page system. Every value is derived from a
// REAL `telemetry` object (built by useRideTelemetry from the GPS recorder + BLE
// sensors + hub riders). A field with no source shows "—" rather than a fake number.

const DASH = '—';
const f1 = (v) => (v == null ? DASH : v.toFixed(1));
const r0 = (v) => (v == null ? DASH : String(Math.round(v)));
const mmss = (s) => {
  if (s == null) return DASH;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  // Roll into hours past 60 min (h:mm:ss) so the Timer tile matches the elapsed header
  // instead of showing e.g. 157:18 for a 2h37m ride.
  return (h > 0 ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(ss).padStart(2, '0');
};

// Selectable data fields, modelled on the Garmin data-field catalogue and grouped by
// the same categories a Garmin Edge/watch uses. Each entry: { label, unit, cat }.
// A field with a real telemetry source shows a live value (see liveMetricValues); the
// rest render "—" until their sensor/route source exists — same contract as the device.
export const metricCatalog = {
  // Timers
  time: { label: 'Timer', unit: '', cat: 'Timers' },
  tod: { label: 'Time of Day', unit: '', cat: 'Timers' },
  movingtime: { label: 'Moving Time', unit: '', cat: 'Timers' },
  laptime: { label: 'Lap Time', unit: '', cat: 'Timers' },
  lastlaptime: { label: 'Last Lap Time', unit: '', cat: 'Timers' },
  // Distance
  dist: { label: 'Distance', unit: 'km', cat: 'Distance' },
  lapdist: { label: 'Lap Distance', unit: 'km', cat: 'Distance' },
  lastlapdist: { label: 'Last Lap Dist', unit: 'km', cat: 'Distance' },
  // Speed
  spd: { label: 'Speed', unit: 'kph', cat: 'Speed' },
  avgspd: { label: 'Avg Speed', unit: 'kph', cat: 'Speed' },
  maxspd: { label: 'Max Speed', unit: 'kph', cat: 'Speed' },
  movspd: { label: 'Avg Moving Speed', unit: 'kph', cat: 'Speed' },
  vspd: { label: 'Vertical Speed', unit: 'm/h', cat: 'Speed' },
  // Cadence
  cad: { label: 'Cadence', unit: 'rpm', cat: 'Cadence' },
  avgcad: { label: 'Avg Cadence', unit: 'rpm', cat: 'Cadence' },
  maxcad: { label: 'Max Cadence', unit: 'rpm', cat: 'Cadence' },
  lapcad: { label: 'Lap Cadence', unit: 'rpm', cat: 'Cadence' },
  // Heart Rate
  hr: { label: 'Heart Rate', unit: 'bpm', cat: 'Heart Rate' },
  avghr: { label: 'Avg HR', unit: 'bpm', cat: 'Heart Rate' },
  maxhr: { label: 'Max HR', unit: 'bpm', cat: 'Heart Rate' },
  hrpct: { label: '% Max HR', unit: '%', cat: 'Heart Rate' },
  hrzone: { label: 'HR Zone', unit: '', cat: 'Heart Rate' },
  laphr: { label: 'Lap HR', unit: 'bpm', cat: 'Heart Rate' },
  // Power
  pwr: { label: 'Power', unit: 'W', cat: 'Power' },
  avgpwr: { label: 'Avg Power', unit: 'W', cat: 'Power' },
  maxpwr: { label: 'Max Power', unit: 'W', cat: 'Power' },
  pwr3s: { label: '3s Power', unit: 'W', cat: 'Power' },
  np: { label: 'Norm Power', unit: 'W', cat: 'Power' },
  work: { label: 'Work', unit: 'kJ', cat: 'Power' },
  pwrwkg: { label: 'Power/Weight', unit: 'W/kg', cat: 'Power' },
  iff: { label: 'Intensity Factor', unit: '', cat: 'Power' },
  tss: { label: 'Training Stress', unit: '', cat: 'Power' },
  balance: { label: 'Balance L/R', unit: '', cat: 'Power' },
  pwrzone: { label: 'Power Zone', unit: '', cat: 'Power' },
  // Elevation
  elev: { label: 'Elevation', unit: 'm', cat: 'Elevation' },
  gpselev: { label: 'GPS Elevation', unit: 'm', cat: 'Elevation' },
  maxelev: { label: 'Max Elevation', unit: 'm', cat: 'Elevation' },
  grad: { label: 'Gradient', unit: '%', cat: 'Elevation' },
  elevgain: { label: 'Total Ascent', unit: 'm', cat: 'Elevation' },
  descent: { label: 'Total Descent', unit: 'm', cat: 'Elevation' },
  // Navigation
  heading: { label: 'Heading', unit: '°', cat: 'Navigation' },
  bearing: { label: 'Bearing', unit: '°', cat: 'Navigation' },
  dist2dest: { label: 'Dist Remaining', unit: 'km', cat: 'Navigation' },
  eta: { label: 'ETA', unit: '', cat: 'Navigation' },
  // Gears
  gear: { label: 'Gear', unit: '', cat: 'Gears' },
  gearratio: { label: 'Gear Ratio', unit: '', cat: 'Gears' },
  di2: { label: 'Di2 Battery', unit: '%', cat: 'Gears' },
  // Other
  kcal: { label: 'Calories', unit: 'kcal', cat: 'Other' },
  temp: { label: 'Temperature', unit: '°C', cat: 'Other' },
  gap: { label: 'Pack gap', unit: 'm', cat: 'Other' },
  leadpct: { label: 'Time in Lead', unit: '%', cat: 'Other' },
  resp: { label: 'Respiration', unit: 'brpm', cat: 'Other' },
  battery: { label: 'Battery', unit: '%', cat: 'Other' },
};

// Category order for the field picker (mirrors the Garmin data-field grouping).
export const metricGroups = ['Timers', 'Distance', 'Speed', 'Cadence', 'Heart Rate', 'Power', 'Elevation', 'Navigation', 'Gears', 'Other']
  .map((cat) => [cat, Object.keys(metricCatalog).filter((tok) => metricCatalog[tok].cat === cat)]);

// Instant metric values keyed by token — { v, color? }. Fields backed by a real
// telemetry source resolve to a live number; everything else stays "—".
export function liveMetricValues(tel) {
  const hr = tel?.hr;
  const hrCol = hr == null ? undefined : (hr > 168 ? 'var(--bad)' : hr > 158 ? 'var(--warn)' : 'var(--good)');
  return {
    // Timers
    time: { v: mmss(tel?.elapsed) }, tod: { v: tel?.clock ?? DASH },
    movingtime: { v: DASH }, laptime: { v: DASH }, lastlaptime: { v: DASH },
    // Distance
    dist: { v: f1(tel?.dist) }, lapdist: { v: DASH }, lastlapdist: { v: DASH },
    // Speed
    spd: { v: f1(tel?.spd) }, avgspd: { v: f1(tel?.avgspd) }, maxspd: { v: f1(tel?.maxspd) },
    movspd: { v: DASH }, vspd: { v: DASH },
    // Cadence
    cad: { v: r0(tel?.cad) }, avgcad: { v: r0(tel?.avgcad) }, maxcad: { v: r0(tel?.maxcad) }, lapcad: { v: DASH },
    // Heart Rate
    hr: { v: r0(tel?.hr), color: hrCol }, avghr: { v: r0(tel?.avghr) }, maxhr: { v: r0(tel?.maxhr) },
    hrpct: { v: DASH }, hrzone: { v: DASH }, laphr: { v: DASH },
    // Power
    pwr: { v: r0(tel?.pwr) }, avgpwr: { v: r0(tel?.avgpwr) }, maxpwr: { v: r0(tel?.maxpwr) },
    pwr3s: { v: r0(tel?.pwr3s) }, np: { v: r0(tel?.np) }, work: { v: r0(tel?.workKj) },
    pwrwkg: { v: DASH }, iff: { v: DASH }, tss: { v: DASH }, balance: { v: DASH }, pwrzone: { v: DASH },
    // Elevation
    elev: { v: r0(tel?.elev) }, gpselev: { v: r0(tel?.elev) }, maxelev: { v: r0(tel?.maxElevM) },
    grad: { v: f1(tel?.grade) }, elevgain: { v: r0(tel?.elevGainM) }, descent: { v: r0(tel?.descentM) },
    // Navigation — no route/destination source yet.
    heading: { v: DASH }, bearing: { v: DASH }, dist2dest: { v: DASH }, eta: { v: DASH },
    // Gears — no gearing/Di2 sensor source yet.
    gear: { v: DASH }, gearratio: { v: DASH }, di2: { v: DASH },
    // Other
    kcal: { v: r0(tel?.kcal) }, temp: { v: DASH },
    // Fused metres to the nearest teammate (phone-to-phone BLE ranging). "—" until ranged.
    gap: { v: r0(tel?.gap), color: tel?.gap == null ? 'var(--behind)' : 'var(--good)' },
    // Share of ride time you've spent on the front of the pack (needs ≥2 riders streaming).
    leadpct: { v: tel?.peloton?.youLeadPct == null ? DASH : String(Math.round(tel.peloton.youLeadPct * 100)) },
    resp: { v: DASH }, battery: { v: DASH },
  };
}

// Rolling sparkline series for the chart fields, built from the real history buffers.
export function liveChartsView(tel) {
  const W = 300, H = 64;
  const build = (vals, color, unit, label) => {
    const arr = vals || [];
    const nums = arr.filter((v) => v != null);
    if (!nums.length) return { pts: '', area: '', color, unit, label, cur: DASH, avg: DASH, max: DASH };
    const mn = Math.min(...nums), mx = Math.max(...nums), rng = (mx - mn) || 1;
    const N = arr.length;
    const xy = arr
      .map((v, i) => (v == null ? null : `${(i / Math.max(1, N - 1) * W).toFixed(1)},${(H - ((v - mn) / rng) * (H - 8) - 4).toFixed(1)}`))
      .filter(Boolean);
    const pts = xy.join(' ');
    const area = pts ? `${pts} ${W},${H} 0,${H}` : '';
    const cur = nums[nums.length - 1];
    const avgv = nums.reduce((a, b) => a + b, 0) / nums.length;
    return { pts, area, color, unit, label, cur: String(Math.round(cur)), avg: String(Math.round(avgv)), max: String(Math.round(mx)) };
  };
  return {
    'chart:spd': build(tel?.hist?.spd, 'var(--accent)', 'kph', 'Speed'),
    'chart:hr': build(tel?.hist?.hr, 'var(--run)', 'bpm', 'Heart rate'),
    'chart:power': build(tel?.hist?.pwr, 'var(--bike)', 'W', 'Power'),
  };
}

// Rear-radar rollup for the Group side column, from the aggregated hub radar.
export function liveRadarView(tel) {
  const gr = tel?.radar || { level: 0, closestM: null };
  const level = gr.level || 0;
  const hi = level >= 2;
  return {
    level, hi, dist: gr.closestM ?? null,
    label: level >= 2 ? 'Vehicle approaching fast' : level ? 'Vehicle approaching' : 'Road clear',
    color: level ? (hi ? 'var(--bad)' : 'var(--warn)') : 'var(--good)',
    closest: gr.closestM != null ? String(gr.closestM) : DASH,
    hasVehicle: level > 0,
  };
}

// Teammates stacked front→back along the Group column rail (from real hub riders),
// sorted by distance; the leader sits at the top, anyone off the back tagged with a gap.
export function spreadRiders(tel) {
  const riders = (tel?.riders || []).slice();
  if (!riders.length) return [];
  riders.sort((a, b) => (parseFloat(b.dist) || 0) - (parseFloat(a.dist) || 0));
  const leadDist = parseFloat(riders[0]?.dist) || 0;
  const n = riders.length;
  return riders.map((r, i) => {
    const gap = Math.round((leadDist - (parseFloat(r.dist) || 0)) * 1000);
    return {
      initials: r.initials, color: r.color, you: !!r.you, dropped: !!r.dropped,
      top: (5 + (n > 1 ? (i / (n - 1)) * 88 : 0)) + '%',
      ringStyle: r.you ? 'box-shadow:0 0 0 2px var(--accent)' : '',
      gapLabel: r.dropped && gap > 0 ? '+' + gap + 'm' : '',
    };
  });
}

// 2D peloton spread for the Peloton field. Fore-aft (y) comes from distance-covered — the
// rider furthest up the road sits at the front; lateral (x) is the real GPS cross-track
// offset (perpendicular to the pack's line of travel), so it's only shown when ≥2 riders
// have a fix and there's a fore-aft baseline to orient from. All plotted coords are
// normalized 0..1 for layout; the metre readouts (length/width/gap) are the real values.
export function pelotonView(tel) {
  const riders = (tel?.riders || []).slice();
  if (!riders.length) return { empty: true, plot: [], board: [], lengthM: null, widthM: null, hasLateral: false, samples: 0 };

  const distOf = (r) => parseFloat(r.dist) || 0;
  const pct = tel?.peloton?.leadPctById || {};
  const leaderId = tel?.peloton?.leaderId ?? null;
  const samples = tel?.peloton?.samples || 0;

  const dists = riders.map(distOf);
  const leadDist = Math.max(...dists);
  const tailDist = Math.min(...dists);
  const span = leadDist - tailDist;                 // km front-to-back
  const lengthM = Math.round(span * 1000);

  // Lateral (cross-track) offset in metres, + to the right of the travel direction.
  const gps = riders.filter((r) => r.lat != null && r.lon != null);
  const cross = {};
  let widthM = null, hasLateral = false;
  if (gps.length >= 2) {
    const lat0 = gps.reduce((a, r) => a + r.lat, 0) / gps.length;
    const lon0 = gps.reduce((a, r) => a + r.lon, 0) / gps.length;
    const mPerLat = 110540, mPerLon = 111320 * Math.cos((lat0 * Math.PI) / 180);
    const pos = gps.map((r) => ({ id: r.athleteId, e: (r.lon - lon0) * mPerLon, n: (r.lat - lat0) * mPerLat, d: distOf(r) }));
    // Travel direction = from the back GPS rider to the front GPS rider.
    let lead = pos[0], tail = pos[0];
    for (const p of pos) { if (p.d > lead.d) lead = p; if (p.d < tail.d) tail = p; }
    let de = lead.e - tail.e, dn = lead.n - tail.n;
    const mag = Math.hypot(de, dn);
    if (mag >= 1) {                                  // need a real baseline to define "sideways"
      de /= mag; dn /= mag;
      const pe = -dn, pn = de;                       // unit perpendicular
      let maxAbs = 0;
      for (const p of pos) { const c = p.e * pe + p.n * pn; cross[p.id] = c; if (Math.abs(c) > maxAbs) maxAbs = Math.abs(c); }
      widthM = Math.round(maxAbs * 2 * 10) / 10;
      hasLateral = maxAbs > 0.3;                      // sub-0.3m is GPS noise, not a real echelon
    }
  }
  const maxAbsCross = Math.max(0.5, ...Object.values(cross).map((c) => Math.abs(c)));

  // Front (leader) at the top, back at the bottom; keep a 6% margin all round.
  const n = riders.length;
  const sorted = riders.slice().sort((a, b) => distOf(b) - distOf(a));
  const plot = sorted.map((r, i) => {
    const d = distOf(r);
    const yRaw = span > 0.0005 ? (leadDist - d) / span : (n > 1 ? i / (n - 1) : 0.5);
    let x = 0.5;
    if (hasLateral && cross[r.athleteId] != null) x = 0.5 + (cross[r.athleteId] / (2 * maxAbsCross)) * 0.88;
    return {
      id: r.athleteId, initials: r.initials, color: r.color, you: !!r.you, dropped: !!r.dropped,
      isLeader: r.athleteId === leaderId,
      x: Math.max(0.07, Math.min(0.93, x)),
      y: Math.max(0.07, Math.min(0.93, 0.07 + yRaw * 0.86)),
      gapM: Math.round((leadDist - d) * 1000),
      leadPct: Math.round((pct[r.athleteId] || 0) * 100),
    };
  });

  // "% time in lead" board — highest first; falls back to pack order before any lead accrues.
  const board = plot.slice().sort((a, b) => b.leadPct - a.leadPct || a.gapM - b.gapM);
  return { empty: false, plot, board, lengthM, widthM, hasLateral, samples };
}

// Connected bike components (lobby "Bike & gear" panel) — battery levels come from the
// paired BLE sensors when available; empty until sensors are connected.
export function gearComponentsFromSensors(sensors) {
  const paired = sensors?.paired || {};
  const battCol = (b) => (b == null ? 'var(--text3)' : b > 50 ? 'var(--good)' : b > 20 ? 'var(--warn)' : 'var(--bad)');
  const names = { hr: ['HR strap', 'Chest'], power: ['Power meter', 'Crank/pedal'], csc: ['Speed/cadence', 'Sensor'], radar: ['Radar', 'Rear'], trainer: ['Trainer', 'Smart'] };
  return Object.keys(paired).map((kind) => {
    const b = sensors?.metrics?.[kind + 'Battery'] ?? null;
    const [name, sub] = names[kind] || [kind, ''];
    return { name: paired[kind]?.name || name, sub, batt: b, battLabel: b == null ? '—' : b + '%', battColor: battCol(b), battW: (b ?? 0) + '%' };
  });
}
// Back-compat export (empty until sensors are paired).
export const gearComponents = [];
