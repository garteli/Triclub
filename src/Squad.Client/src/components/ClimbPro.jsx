import { useState } from 'react';
import { s } from '../lib/style.js';
import { gradeColor } from '../lib/climbs.js';

// ClimbPro-style live climb card. Rendered from the shared useClimb() state (the same state that
// feeds the individual "Climb" data fields), so the card and the tiles never disagree. Shows the
// climb's gradient-shaded profile, your position on it, and distance / ascent / estimated-time to
// the top. Renders nothing when there's no climb nearby or the user dismissed this one.

const VW = 300;
const fmtDist = (m) => (m == null ? '—' : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
const fmtTime = (sec) => {
  if (sec == null || !Number.isFinite(sec)) return '—';
  const s2 = Math.max(0, Math.round(sec));
  const h = Math.floor(s2 / 3600), m = Math.floor((s2 % 3600) / 60), ss = s2 % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + ':' + String(ss).padStart(2, '0');
};

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

export default function ClimbPro({ climb }) {
  const [dismissed, setDismissed] = useState(null); // id of a climb the user closed
  if (!climb || dismissed === climb.id) return null;

  const { climbing, accent, segs, posFrac, posTopPct, distToGoM, ascentToGoM, etaSec, gradeNow, distToStartM } = climb;
  const cat = climb.category ? (climb.category === 'HC' ? 'HC' : `Cat ${climb.category}`) : 'Climb';

  return (
    <div style={s(`position:relative;margin:0 12px 8px;border-radius:16px;border:1px solid color-mix(in srgb,${accent} 45%,var(--line));background:var(--bg2);padding:11px 13px 10px;animation:floatUp .25s ease;overflow:hidden`)}>
      {/* header: category + which climb + phase */}
      <div style={s('display:flex;align-items:center;gap:8px;margin-bottom:8px')}>
        <span style={s(`font-size:10px;font-weight:800;letter-spacing:.4px;color:#0c0e11;background:${accent};padding:2px 7px;border-radius:6px`)}>{cat}</span>
        <span style={s('font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--text2)')}>Climb {climb.index + 1}/{climb.total}</span>
        <span style={s(`margin-left:auto;font-size:11px;font-weight:700;color:${climbing ? accent : 'var(--text3)'}`)}>
          {climbing ? 'ON CLIMB' : `Starts in ${fmtDist(distToStartM)}`}
        </span>
        <div className="ctl" onClick={() => setDismissed(climb.id)} style={s('width:20px;height:20px;border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--text3);flex:none')}>
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
        <div className="mono" style={s('position:absolute;top:2px;right:4px;font-size:9.5px;font-weight:700;color:var(--text2)')}>{Math.round(climb.topE)} m</div>
        {climbing && (
          <>
            <div style={s(`position:absolute;top:0;bottom:0;left:${(posFrac * 100).toFixed(1)}%;width:2px;background:#fff;opacity:.85`)} />
            <div style={s(`position:absolute;left:${(posFrac * 100).toFixed(1)}%;top:${posTopPct}%;width:11px;height:11px;border-radius:50%;background:#fff;border:2px solid ${accent};transform:translate(-50%,-50%);box-shadow:0 0 0 1px rgba(0,0,0,.3)`)} />
          </>
        )}
      </div>

      {/* to-go numbers */}
      <div style={s('display:flex;gap:8px')}>
        <Stat label={climbing ? 'Dist to go' : 'Climb length'} value={distToGoM >= 1000 ? (distToGoM / 1000).toFixed(1) : Math.round(distToGoM)} unit={distToGoM >= 1000 ? 'km' : 'm'} />
        <Stat label={climbing ? 'Ascent to go' : 'Ascent'} value={Math.round(ascentToGoM)} unit="m" color={accent} />
        <Stat label="Est. time" value={fmtTime(etaSec)} />
        <Stat label={climbing ? 'Gradient' : 'Avg grade'} value={(gradeNow || 0).toFixed(1)} unit="%" color={gradeColor(gradeNow)} />
      </div>
    </div>
  );
}
