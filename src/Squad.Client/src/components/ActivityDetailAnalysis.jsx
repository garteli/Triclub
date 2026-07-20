import { useMemo } from 'react';
import { s } from '../lib/style.js';
import TileMap from './TileMap.jsx';
import { toPathD } from '../lib/tiles.js';
import { useActivityTrack } from '../hooks/useActivityTrack.js';

// Route map + Strava-style analysis for an activity's detail view. Fetches the recorded
// track (GET /api/activities/{id}/track) and derives, all from the FIT stream we already
// serve: the GPS route on a real basemap, per-point traces (HR / power / speed / cadence /
// elevation), per-kilometre splits, and total work. Replaces the old placeholder.

const label = 'font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.3px;font-weight:600';

// Evenly downsample to at most `max` points (keeps first & last) so a multi-thousand-point
// ride doesn't render thousands of SVG nodes. Splits/work are computed on the FULL track.
function sample(arr, max) {
  if (arr.length <= max) return arr;
  const step = (arr.length - 1) / (max - 1);
  const out = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.round(i * step)]);
  return out;
}

function fmtDur(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s2 = sec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s2).padStart(2, '0')}`
    : `${m}:${String(s2).padStart(2, '0')}`;
}
const pace = (secPerKm) => `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, '0')}`;

function haversine(la1, lo1, la2, lo2) {
  const R = 6371000, r = Math.PI / 180;
  const dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Per-`unit`-metre splits from the full track: GPS distance where available, else speed×dt.
// → [{ index, meters, sec, avgHr, avgPower, gain, partial }].
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

// Normalized sparkline over `values` (null entries are line gaps).
function Sparkline({ values, stroke, fill, H = 42 }) {
  const W = 320;
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => v != null && Number.isFinite(v));
  if (pts.length < 2) return null;
  const n = (values.length - 1) || 1;
  const ys = pts.map(([, v]) => v);
  const min = Math.min(...ys), max = Math.max(...ys), span = (max - min) || 1;
  const X = (i) => (i / n) * W;
  const Y = (v) => (H - 3) - ((v - min) / span) * (H - 6);
  const line = pts.map(([i, v], k) => `${k ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${X(pts[pts.length - 1][0]).toFixed(1)},${H} L${X(pts[0][0]).toFixed(1)},${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, display: 'block' }}>
      <path d={area} fill={fill} opacity="0.13" />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Trace({ title, unit, values, stroke, fill, fmt }) {
  const nums = values.filter((v) => v != null && Number.isFinite(v));
  if (nums.length < 2) return null;
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  const max = Math.max(...nums);
  const f = fmt || ((x) => Math.round(x));
  return (
    <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:12px 13px;margin-top:10px')}>
      <div style={s('display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px')}>
        <div style={s('font-size:12px;font-weight:700')}>{title}</div>
        <div className="mono" style={s('font-size:11px;color:var(--text3)')}>
          avg <b style={s('color:var(--text)')}>{f(avg)}</b> · max {f(max)}{unit ? ` ${unit}` : ''}
        </div>
      </div>
      <Sparkline values={values} stroke={stroke} fill={fill} />
    </div>
  );
}

// Strava-style segment table: one row per lap (device laps) or per km/100m (computed
// splits). Each row is { index, meters, sec, avgHr, gain, partial }; a bar scaled to the
// fastest row makes pace variation read at a glance.
function SegmentTable({ title, rows, isSwim, isFoot }) {
  if (rows.length < 1) return null;
  const speeds = rows.map((sp) => (sp.sec > 0 ? sp.meters / sp.sec : 0)); // m/s
  const fastest = Math.max(...speeds, 0.1);
  return (
    <div style={s('margin-top:14px')}>
      <div style={s(label + ';margin-bottom:8px')}>{title}</div>
      <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;overflow:hidden')}>
        {rows.map((sp, i) => {
          const mps = speeds[i];
          const rate = isFoot || isSwim
            ? pace(sp.sec / (sp.meters / (isSwim ? 100 : 1000))) + (isSwim ? '/100' : '/km')
            : ((sp.meters / 1000) / (sp.sec / 3600)).toFixed(1) + ' km/h';
          return (
            <div key={sp.index} style={s(`display:flex;align-items:center;gap:10px;padding:8px 12px;position:relative;${i ? 'border-top:1px solid var(--line)' : ''}`)}>
              <div style={s('width:20px;font-size:12px;font-weight:700;color:var(--text2);flex:none')}>{sp.partial ? '·' : sp.index}</div>
              <div style={s('flex:1;min-width:0')}>
                <div style={s('height:8px;border-radius:4px;background:var(--accent);opacity:.9;width:' + Math.max(6, Math.round((mps / fastest) * 100)) + '%')} />
              </div>
              <div className="mono" style={s('width:66px;text-align:right;font-size:12px;font-weight:600')}>{rate}</div>
              <div className="mono" style={s('width:52px;text-align:right;font-size:11px;color:var(--text3)')}>{fmtDur(sp.sec)}</div>
              <div className="mono" style={s('width:44px;text-align:right;font-size:11px;color:var(--text3)')}>{sp.avgHr != null ? Math.round(sp.avgHr) : '—'}</div>
              <div className="mono" style={s('width:40px;text-align:right;font-size:11px;color:var(--text3)')}>{Math.round(sp.gain)}m</div>
            </div>
          );
        })}
      </div>
      <div style={s('display:flex;gap:10px;justify-content:flex-end;margin-top:6px;padding-right:12px;font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px')}>
        <span style={s('width:66px;text-align:right')}>pace</span>
        <span style={s('width:52px;text-align:right')}>time</span>
        <span style={s('width:44px;text-align:right')}>hr</span>
        <span style={s('width:40px;text-align:right')}>▲</span>
      </div>
    </div>
  );
}

export default function ActivityDetailAnalysis({ activityId, sport, getToken }) {
  const { track, laps, status } = useActivityTrack(activityId, { getToken });
  const isSwim = sport === 'Swim';
  const isFoot = sport === 'Run';

  const routePts = useMemo(() => {
    const gps = (track || []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    return sample(gps, 500).map((p) => [p.lat, p.lon]);
  }, [track]);

  const series = useMemo(() => {
    const t = sample(track || [], 400);
    return {
      hr: t.map((p) => p.heartRate ?? null),
      power: t.map((p) => p.powerW ?? null),
      speed: t.map((p) => (p.speedMps != null ? p.speedMps * 3.6 : null)), // m/s → km/h
      cadence: t.map((p) => p.cadence ?? null),
      elev: t.map((p) => p.elevM ?? null),
    };
  }, [track]);

  const splits = useMemo(() => computeSplits(track || [], isSwim ? 100 : 1000), [track, isSwim]);
  const workKJ = useMemo(() => totalWorkKJ(track || []), [track]);

  // Device laps (auto-lap or manual) → the same row shape as computed splits.
  const lapRows = useMemo(() => (laps || [])
    .map((l, i) => ({
      index: i + 1,
      meters: l.distanceMeters || 0,
      sec: l.durationSec || 0,
      avgHr: l.avgHeartRate ?? null,
      avgPower: l.avgPowerWatts ?? null,
      gain: l.elevGainMeters || 0,
    }))
    .filter((r) => r.meters > 0 && r.sec > 0), [laps]);
  const useLaps = lapRows.length >= 2;

  if (status === 'loading') {
    return (
      <div style={s('padding:20px 18px 0')}>
        <div style={s(label + ';margin-bottom:10px')}>Detailed analysis</div>
        <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;height:150px;display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:12px')}>Loading recording…</div>
      </div>
    );
  }

  const hasMap = routePts.length >= 2;
  const traces = [
    { key: 'hr', title: 'Heart rate', unit: 'bpm', stroke: 'var(--bad)', fill: 'var(--bad)', values: series.hr },
    { key: 'power', title: 'Power', unit: 'W', stroke: 'var(--accent)', fill: 'var(--accent)', values: series.power },
    { key: 'speed', title: 'Speed', unit: 'km/h', stroke: 'var(--bike)', fill: 'var(--bike)', values: series.speed, fmt: (x) => x.toFixed(1) },
    { key: 'cadence', title: 'Cadence', unit: 'rpm', stroke: 'var(--warn)', fill: 'var(--warn)', values: series.cadence },
    { key: 'elev', title: 'Elevation', unit: 'm', stroke: 'var(--good)', fill: 'var(--good)', values: series.elev },
  ];
  const shown = traces.filter((tr) => tr.values.filter((v) => v != null && Number.isFinite(v)).length >= 2);

  if (!hasMap && shown.length === 0 && !useLaps && splits.length === 0) {
    return (
      <div style={s('padding:20px 18px 0')}>
        <div style={s('background:var(--bg2);border:1px dashed var(--line2);border-radius:16px;padding:18px;text-align:center')}>
          <div style={s('font-size:13px;font-weight:600')}>No recording data</div>
          <div style={s('font-size:12px;color:var(--text3);line-height:1.5;margin-top:4px')}>This activity has no GPS or sensor stream — an indoor session, or a summary-only import.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={s('padding:20px 18px 0')}>
      <div style={s(label + ';margin-bottom:10px')}>Detailed analysis</div>

      {hasMap && (
        <TileMap points={routePts} radius={16} pad={26}>
          {(project) => {
            const d = toPathD(routePts, project);
            const start = project(routePts[0][0], routePts[0][1]);
            const end = project(routePts[routePts.length - 1][0], routePts[routePts.length - 1][1]);
            return (
              <>
                <path d={d} fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
                <path d={d} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx={start.x} cy={start.y} r="5" fill="var(--good)" stroke="#fff" strokeWidth="2" />
                <circle cx={end.x} cy={end.y} r="5" fill="var(--bad)" stroke="#fff" strokeWidth="2" />
              </>
            );
          }}
        </TileMap>
      )}

      {workKJ >= 1 && (
        <div className="mono" style={s('font-size:11px;color:var(--text3);margin-top:10px')}>
          Total work <b style={s('color:var(--text)')}>{Math.round(workKJ)}</b> kJ
        </div>
      )}

      {shown.map((tr) => (
        <Trace key={tr.key} title={tr.title} unit={tr.unit} values={tr.values} stroke={tr.stroke} fill={tr.fill} fmt={tr.fmt} />
      ))}

      {useLaps
        ? <SegmentTable title="Laps" rows={lapRows} isSwim={isSwim} isFoot={isFoot} />
        : <SegmentTable title={`Splits · per ${isSwim ? '100m' : 'km'}`} rows={splits} isSwim={isSwim} isFoot={isFoot} />}
    </div>
  );
}
