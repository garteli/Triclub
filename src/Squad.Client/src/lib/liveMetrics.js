// Live-ride telemetry for the unified page system. React port of the prototype's
// renderVals() live block (mv / metricCatalog / liveChartsView / liveRadarView /
// gearComponents / spread column). Everything derives from the 1s tick `t` so the
// numbers match the design handoff 1:1. In production these swap for real
// useLiveRide / useSensors / useRideRecorder feeds (identical field shapes).

// Label + unit for every selectable metric token.
export const metricCatalog = {
  spd: { label: 'Speed', unit: 'kph' }, avgspd: { label: 'Avg Speed', unit: 'kph' }, maxspd: { label: 'Max Speed', unit: 'kph' },
  dist: { label: 'Distance', unit: 'km' }, time: { label: 'Timer', unit: '' }, laptime: { label: 'Lap Time', unit: '' },
  hr: { label: 'Heart Rate', unit: 'bpm' }, avghr: { label: 'Avg HR', unit: 'bpm' },
  pwr: { label: 'Power', unit: 'W' }, avgpwr: { label: 'Avg Power', unit: 'W' }, np: { label: 'Norm Power', unit: 'W' },
  cad: { label: 'Cadence', unit: 'rpm' }, grad: { label: 'Gradient', unit: '%' }, elev: { label: 'Elevation', unit: 'm' },
  elevgain: { label: 'Elev Gain', unit: 'm' }, kcal: { label: 'Calories', unit: 'kcal' }, temp: { label: 'Temp', unit: '°C' },
  gap: { label: 'Gap to last', unit: 'm' },
  gear: { label: 'Gear', unit: '' }, gearratio: { label: 'Gear Ratio', unit: '' }, di2: { label: 'Di2 Battery', unit: '%' },
};

// Regroup gap (metres), oscillating so the "dropped rider" cue feels live.
const gapM = (t) => Math.round(180 + 30 * Math.abs(Math.sin(t / 4)));

// Instant metric values keyed by token — { v, color? }.
export function liveMetricValues(t) {
  const hrv = Math.round(158 + 7 * Math.sin(t / 3.4));
  const hrCol = hrv > 168 ? 'var(--bad)' : hrv > 158 ? 'var(--warn)' : 'var(--good)';
  const mmss = (e) => String(Math.floor(e / 60)).padStart(2, '0') + ':' + String(e % 60).padStart(2, '0');
  const mv = {
    spd: { v: (34 + 2.4 * Math.sin(t / 2.6)).toFixed(1) }, avgspd: { v: '33.8' }, maxspd: { v: '41.2' },
    dist: { v: (24.6 + t * 0.009).toFixed(1) }, time: { v: mmss(t % 5999) },
    laptime: { v: (() => { const e = t % 600; return String(Math.floor(e / 60)) + ':' + String(e % 60).padStart(2, '0'); })() },
    hr: { v: hrv + '', color: hrCol }, avghr: { v: '148' },
    pwr: { v: Math.round(243 + 30 * Math.sin(t / 1.8)) + '' }, avgpwr: { v: '236' }, np: { v: '251' },
    cad: { v: Math.round(89 + 5 * Math.sin(t / 2)) + '' }, grad: { v: (4.5 + 3 * Math.sin(t / 5)).toFixed(1) },
    elev: { v: Math.round(312 + 40 * Math.sin(t / 7)) + '' }, elevgain: { v: '480' }, kcal: { v: (612 + t) + '' }, temp: { v: '24' },
    gap: { v: Math.round(180 + 30 * Math.abs(Math.sin(t / 4))) + '', color: 'var(--behind)' },
  };
  const cog = [11, 12, 13, 15, 17, 19, 21][Math.floor(t / 3) % 7];
  const ring = (t % 20 < 10) ? 34 : 50;
  mv.gear = { v: ring + '×' + cog };
  mv.gearratio = { v: (ring / cog).toFixed(2) };
  mv.di2 = { v: '72', color: 'var(--good)' };
  return mv;
}

// Rolling sparkline series for the chart fields.
export function liveChartsView(t) {
  const N = 44, W = 300, H = 64;
  const build = (fn, color, unit, label) => {
    const vals = [];
    for (let i = N - 1; i >= 0; i--) vals.push(fn(t - i));
    const mn = Math.min(...vals), mx = Math.max(...vals), rng = (mx - mn) || 1;
    const pts = vals.map((v, i) => (i / (N - 1) * W).toFixed(1) + ',' + (H - ((v - mn) / rng) * (H - 8) - 4).toFixed(1)).join(' ');
    const area = pts + ' ' + W + ',' + H + ' 0,' + H;
    const cur = vals[vals.length - 1], avg = vals.reduce((a, b) => a + b, 0) / N;
    return { pts, area, color, unit, label, cur: Math.round(cur) + '', avg: Math.round(avg) + '', max: Math.round(mx) + '' };
  };
  return {
    'chart:spd': build((x) => 34 + 2.4 * Math.sin(x / 2.6) + 0.6 * Math.sin(x / 0.8), 'var(--accent)', 'kph', 'Speed'),
    'chart:hr': build((x) => 158 + 7 * Math.sin(x / 3.4) + 2 * Math.sin(x / 1.1), 'var(--run)', 'bpm', 'Heart rate'),
    'chart:power': build((x) => 243 + 30 * Math.sin(x / 1.8) + 12 * Math.sin(x / 0.6), 'var(--bike)', 'W', 'Power'),
  };
}

// Rear-radar rollup for the Group side column (clear → approaching → fast, 22s loop).
export function liveRadarView(t) {
  const rc = t % 22;
  const level = rc < 3 ? 2 : rc < 8 ? 1 : 0;
  const closest = level >= 2 ? 30 + rc * 4 : level ? 120 - (rc - 3) * 10 : null;
  const hi = level >= 2;
  return {
    level, hi,
    label: level >= 2 ? 'Vehicle approaching fast' : level ? 'Vehicle approaching' : 'Road clear',
    color: level ? (hi ? 'var(--bad)' : 'var(--warn)') : 'var(--good)',
    closest: closest != null ? closest + '' : '—',
    hasVehicle: level > 0,
  };
}

// Connected bike components with live battery bars (lobby "Bike & gear" panel).
const battCol = (b) => (b > 50 ? 'var(--good)' : b > 20 ? 'var(--warn)' : 'var(--bad)');
export const gearComponents = [
  { name: 'Di2 shifting', sub: 'Synchro shift', batt: 72 },
  { name: 'Power meter', sub: 'Dual-sided', batt: 64 },
  { name: 'HR strap', sub: 'Chest', batt: 88 },
  { name: 'Varia radar', sub: 'Rear', batt: 45 },
  { name: 'Head unit', sub: 'Edge 840', batt: 91 },
].map((c) => ({ ...c, battLabel: c.batt + '%', battColor: battCol(c.batt), battW: c.batt + '%' }));

// Teammates stacked front→back along the Group column rail (YOU ring-highlighted,
// dropped rider tagged with the live gap).
const spreadRoster = [
  ['DL', '#d6ff3f', true, false], ['NR', '#ff9a4c', false, false], ['TV', '#5a86ff', false, false],
  ['RG', '#4fe08b', false, false], ['AB', '#37c0ff', false, false], ['MK', '#c68bff', false, false],
  ['YS', '#ff6f61', false, true],
];
export function spreadRiders(t) {
  const gap = gapM(t);
  return spreadRoster.map((r, i) => ({
    initials: r[0], color: r[1], you: r[2], dropped: r[3],
    top: (5 + i * 13) + '%',
    ringStyle: r[2] ? 'box-shadow:0 0 0 2px var(--accent)' : '',
    gapLabel: r[3] ? '+' + gap + 'm' : '',
  }));
}
