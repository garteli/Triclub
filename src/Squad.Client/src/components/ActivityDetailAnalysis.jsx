import { useMemo } from 'react';
import { s } from '../lib/style.js';
import TileMap from './TileMap.jsx';
import { toPathD } from '../lib/tiles.js';
import { useActivityTrack } from '../hooks/useActivityTrack.js';

// Route map + per-point traces for an activity's detail view. Fetches the recorded track
// (GET /api/activities/{id}/track) and draws the GPS route on a real basemap plus heart-rate,
// power, speed and elevation sparklines — whichever the recording actually carried. Replaces
// the old "detailed analysis coming" placeholder now that the track is served end-to-end.

const label = 'font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.3px;font-weight:600';

// Evenly downsample to at most `max` points (keeps first & last) so a multi-thousand-point
// ride doesn't render thousands of SVG nodes.
function sample(arr, max) {
  if (arr.length <= max) return arr;
  const step = (arr.length - 1) / (max - 1);
  const out = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.round(i * step)]);
  return out;
}

// Normalized sparkline over `values` (null entries are gaps in the line).
function Sparkline({ values, stroke, fill, H = 42 }) {
  const W = 320;
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => v != null && Number.isFinite(v));
  if (pts.length < 2) return null;
  const n = (values.length - 1) || 1;
  const ys = pts.map(([, v]) => v);
  const min = Math.min(...ys), max = Math.max(...ys);
  const span = (max - min) || 1;
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

export default function ActivityDetailAnalysis({ activityId, getToken }) {
  const { track, status } = useActivityTrack(activityId, { getToken });

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
      elev: t.map((p) => p.elevM ?? null),
    };
  }, [track]);

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
    { key: 'elev', title: 'Elevation', unit: 'm', stroke: 'var(--good)', fill: 'var(--good)', values: series.elev },
  ];
  const shown = traces.filter((tr) => tr.values.filter((v) => v != null && Number.isFinite(v)).length >= 2);

  if (!hasMap && shown.length === 0) {
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

      {shown.map((tr) => (
        <Trace key={tr.key} title={tr.title} unit={tr.unit} values={tr.values} stroke={tr.stroke} fill={tr.fill} fmt={tr.fmt} />
      ))}
    </div>
  );
}
