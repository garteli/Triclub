import { useState } from 'react';
import { s } from '../lib/style.js';
import { progressMeters, elevAt } from '../lib/elevation.js';
import { gradeColor } from '../lib/climbs.js';
import { useClimbs } from '../hooks/useClimbs.js';

// ClimbPro-style live climb view. When you're on or approaching a climb on the course you're
// following, this card appears with the climb's real profile (shaded by gradient), your position
// on it, and distance / ascent / estimated-time to the top. All derived from the terrain — never
// fabricated. Renders nothing when there's no course, no fix, or no climb nearby.

const APPROACH_M = 1000; // start showing the climb this far before it begins
const VW = 300;          // SVG x units (stretched to width); y is a 0..100 viewBox
const PAD_T = 14, PAD_B = 4;

const fmtDist = (m) => (m == null ? '—' : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
const fmtTime = (sec) => {
  if (sec == null || !Number.isFinite(sec)) return '—';
  const s2 = Math.max(0, Math.round(sec));
  const h = Math.floor(s2 / 3600), m = Math.floor((s2 % 3600) / 60), ss = s2 % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + ':' + String(ss).padStart(2, '0');
};
// Fallback climbing speed (kph) from gradient when there's no live speed yet.
const estKph = (grade) => Math.max(6, Math.min(24, 18 - (grade || 0) * 1.0));

function Stat({ label, value, unit, color }) {
  return (
    <div style={s('flex:1;min-width:0')}>
      <div style={s('font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px;font-weight:600')}>{label}</div>
      <div style={s('display:flex;align-items:baseline;gap:3px')}>
        <span className="mono" style={s(`font-size:18px;font-weight:700;color:${color || 'var(--text)'}`)}>{value}</span>
        {unit && <span className="mono" style={s('font-size:10px;color:var(--text2);font-weight:600')}>{unit}</span>}
      </div>
    </div>
  );
}

export default function ClimbPro({ tel, indoor = false }) {
  const [dismissed, setDismissed] = useState(null); // startDist of a climb the user closed
  const course = (tel?.course || []).filter((p) => p && p[0] != null && p[1] != null);
  const { profile, climbs } = useClimbs(indoor ? [] : course);

  // Where the rider is on the course.
  const riders = (tel?.riders || []).filter((r) => r.lat != null && r.lon != null);
  const youR = riders.find((r) => r.you);
  const path = (tel?.path || []).filter((p) => p && p[0] != null && p[1] != null);
  const you = youR ? [youR.lat, youR.lon] : (path.length ? path[path.length - 1] : null);
  const progress = progressMeters(course, you);

  if (indoor || !profile || !climbs.length || progress == null) return null;

  // The relevant climb: the one we're on, else the nearest ahead within the approach window.
  let climb = null, index = -1, phase = null, distToStart = 0;
  for (let i = 0; i < climbs.length; i++) {
    const c = climbs[i];
    if (progress >= c.startDist && progress < c.endDist) { climb = c; index = i; phase = 'climbing'; break; }
  }
  if (!climb) {
    for (let i = 0; i < climbs.length; i++) {
      const c = climbs[i];
      if (c.startDist > progress) {
        const d = c.startDist - progress;
        if (d <= APPROACH_M) { climb = c; index = i; phase = 'approach'; distToStart = d; }
        break;
      }
    }
  }
  if (!climb || dismissed === climb.startDist) return null;

  const prof = profile.profile;
  const currentE = elevAt(prof, progress);
  // Local gradient (%) over a 100 m window centred on the given distance.
  const gradeAt = (d) => {
    const a = elevAt(prof, Math.max(0, d - 50)), b = elevAt(prof, d + 50);
    return a != null && b != null ? (b - a) / 100 * 100 : 0; // Δe over 100 m = percent
  };

  // "To go" values: remaining to the top while climbing; the whole climb while approaching.
  const climbing = phase === 'climbing';
  const distToGo = climbing ? Math.max(0, climb.endDist - progress) : climb.length;
  const ascentToGo = climbing ? Math.max(0, (climb.topE ?? 0) - (currentE ?? 0)) : climb.gain;
  const remGrade = distToGo > 0 ? (ascentToGo / distToGo) * 100 : climb.avgGrade;
  const liveKph = Number.isFinite(tel?.spd) && tel.spd > 3 ? tel.spd : null;
  const etaSec = (distToGo / 1000) / (liveKph || estKph(remGrade)) * 3600;
  const curGrade = climbing ? gradeAt(progress) : climb.avgGrade;

  // Build the climb profile slice (exact endpoints) for the shaded chart.
  const inner = prof.filter((p) => p.dist > climb.startDist && p.dist < climb.endDist);
  const cp = [{ dist: climb.startDist, e: elevAt(prof, climb.startDist) }, ...inner, { dist: climb.endDist, e: elevAt(prof, climb.endDist) }];
  const eMin = Math.min(...cp.map((p) => p.e)), eMax = Math.max(...cp.map((p) => p.e));
  const span = Math.max(1, eMax - eMin);
  const px = (d) => ((d - climb.startDist) / Math.max(1, climb.length)) * VW;
  const py = (e) => PAD_T + (1 - (e - eMin) / span) * (100 - PAD_T - PAD_B);
  const segs = [];
  for (let i = 1; i < cp.length; i++) {
    const a = cp[i - 1], b = cp[i];
    const dl = b.dist - a.dist;
    const g = dl > 0 ? ((b.e - a.e) / dl) * 100 : 0;
    segs.push({ x0: px(a.dist), x1: px(b.dist), y0: py(a.e), y1: py(b.e), color: gradeColor(g) });
  }
  const posFrac = climbing ? Math.max(0, Math.min(1, (progress - climb.startDist) / Math.max(1, climb.length))) : 0;
  const posTop = py(elevAt(prof, Math.min(climb.endDist, Math.max(climb.startDist, progress))));

  const cat = climb.category ? (climb.category === 'HC' ? 'HC' : `Cat ${climb.category}`) : 'Climb';
  const accent = gradeColor(climb.avgGrade);

  return (
    <div style={s(`position:relative;margin:0 12px 8px;border-radius:16px;border:1px solid color-mix(in srgb,${accent} 45%,var(--line));background:var(--bg2);padding:11px 13px 10px;animation:floatUp .25s ease;overflow:hidden`)}>
      {/* header: category + which climb + phase */}
      <div style={s('display:flex;align-items:center;gap:8px;margin-bottom:8px')}>
        <span style={s(`font-size:10px;font-weight:800;letter-spacing:.4px;color:#0c0e11;background:${accent};padding:2px 7px;border-radius:6px`)}>{cat}</span>
        <span style={s('font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--text2)')}>Climb {index + 1}/{climbs.length}</span>
        <span style={s(`margin-left:auto;font-size:11px;font-weight:700;color:${climbing ? accent : 'var(--text3)'}`)}>
          {climbing ? 'ON CLIMB' : `Starts in ${fmtDist(distToStart)}`}
        </span>
        <div className="ctl" onClick={() => setDismissed(climb.startDist)} style={s('width:20px;height:20px;border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--text3);flex:none')}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </div>
      </div>

      {/* gradient-shaded climb profile with the rider's position */}
      <div style={s('position:relative;height:74px;margin-bottom:9px')}>
        <svg viewBox="0 0 300 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}>
          {segs.map((sg, i) => (
            <polygon key={i} points={`${sg.x0.toFixed(1)},100 ${sg.x0.toFixed(1)},${sg.y0.toFixed(1)} ${sg.x1.toFixed(1)},${sg.y1.toFixed(1)} ${sg.x1.toFixed(1)},100`} fill={sg.color} opacity="0.85" />
          ))}
          {/* passed portion dimmed on top */}
          {climbing && <rect x="0" y="0" width={(posFrac * VW).toFixed(1)} height="100" fill="var(--bg2)" opacity="0.45" />}
        </svg>
        {/* top elevation tag */}
        <div className="mono" style={s('position:absolute;top:2px;right:4px;font-size:9.5px;font-weight:700;color:var(--text2)')}>{Math.round(climb.topE)} m</div>
        {climbing && (
          <>
            <div style={s(`position:absolute;top:0;bottom:0;left:${(posFrac * 100).toFixed(1)}%;width:2px;background:#fff;opacity:.85`)} />
            <div style={s(`position:absolute;left:${(posFrac * 100).toFixed(1)}%;top:${posTop}%;width:11px;height:11px;border-radius:50%;background:#fff;border:2px solid ${accent};transform:translate(-50%,-50%);box-shadow:0 0 0 1px rgba(0,0,0,.3)`)} />
          </>
        )}
      </div>

      {/* to-go numbers */}
      <div style={s('display:flex;gap:8px')}>
        <Stat label={climbing ? 'Dist to go' : 'Climb length'} value={distToGo >= 1000 ? (distToGo / 1000).toFixed(1) : Math.round(distToGo)} unit={distToGo >= 1000 ? 'km' : 'm'} />
        <Stat label={climbing ? 'Ascent to go' : 'Ascent'} value={Math.round(ascentToGo)} unit="m" color={accent} />
        <Stat label="Est. time" value={fmtTime(etaSec)} />
        <Stat label={climbing ? 'Gradient' : 'Avg grade'} value={(curGrade || 0).toFixed(1)} unit="%" color={gradeColor(curGrade)} />
      </div>
    </div>
  );
}
