// Live-ride telemetry for the unified page system. Every value is derived from a
// REAL `telemetry` object (built by useRideTelemetry from the GPS recorder + BLE
// sensors + hub riders). A field with no source shows "—" rather than a fake number.

const DASH = '—';
const f1 = (v) => (v == null ? DASH : v.toFixed(1));
const r0 = (v) => (v == null ? DASH : String(Math.round(v)));
const mmss = (s) => {
  if (s == null) return DASH;
  const m = Math.floor(s / 60), ss = s % 60;
  return String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
};

// Label + unit for every selectable metric token.
export const metricCatalog = {
  spd: { label: 'Speed', unit: 'kph' }, avgspd: { label: 'Avg Speed', unit: 'kph' }, maxspd: { label: 'Max Speed', unit: 'kph' },
  dist: { label: 'Distance', unit: 'km' }, time: { label: 'Timer', unit: '' }, laptime: { label: 'Lap Time', unit: '' },
  hr: { label: 'Heart Rate', unit: 'bpm' }, avghr: { label: 'Avg HR', unit: 'bpm' },
  pwr: { label: 'Power', unit: 'W' }, avgpwr: { label: 'Avg Power', unit: 'W' }, np: { label: 'Norm Power', unit: 'W' },
  cad: { label: 'Cadence', unit: 'rpm' }, grad: { label: 'Gradient', unit: '%' }, elev: { label: 'Elevation', unit: 'm' },
  elevgain: { label: 'Elev Gain', unit: 'm' }, kcal: { label: 'Calories', unit: 'kcal' }, temp: { label: 'Temp', unit: '°C' },
  gap: { label: 'Pack gap', unit: 'm' },
  gear: { label: 'Gear', unit: '' }, gearratio: { label: 'Gear Ratio', unit: '' }, di2: { label: 'Di2 Battery', unit: '%' },
};

// Instant metric values keyed by token — { v, color? }. Missing sources → "—".
export function liveMetricValues(tel) {
  const hr = tel?.hr;
  const hrCol = hr == null ? undefined : (hr > 168 ? 'var(--bad)' : hr > 158 ? 'var(--warn)' : 'var(--good)');
  return {
    spd: { v: f1(tel?.spd) }, avgspd: { v: f1(tel?.avgspd) }, maxspd: { v: f1(tel?.maxspd) },
    dist: { v: f1(tel?.dist) }, time: { v: mmss(tel?.elapsed) }, laptime: { v: DASH },
    hr: { v: r0(tel?.hr), color: hrCol }, avghr: { v: r0(tel?.avghr) },
    pwr: { v: r0(tel?.pwr) }, avgpwr: { v: r0(tel?.avgpwr) }, np: { v: DASH },
    cad: { v: r0(tel?.cad) }, grad: { v: DASH }, elev: { v: r0(tel?.elev) }, elevgain: { v: r0(tel?.elevGainM) },
    kcal: { v: r0(tel?.kcal) }, temp: { v: DASH },
    // Fused metres to the nearest teammate (phone-to-phone BLE ranging). "—" until ranged.
    gap: { v: r0(tel?.gap), color: tel?.gap == null ? 'var(--behind)' : 'var(--good)' },
    // No gearing/Di2 sensor source yet.
    gear: { v: DASH }, gearratio: { v: DASH }, di2: { v: DASH },
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
