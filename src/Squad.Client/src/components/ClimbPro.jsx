import { useState } from 'react';
import { s } from '../lib/style.js';

// ClimbPro-style live climb view. Rendered from the shared useClimb() state (the same state that
// feeds the individual "Climb" data fields), so the card and the tiles never disagree. Shows the
// climb's gradient bars + elevation line, your position on it, and distance / ascent / estimated
// time to the top. Two consumers:
//   • ClimbPro (default)  — the standalone card auto-shown above the pages (dismissable).
//   • ClimbField (named)  — the same view as a selectable page tile (empty state when no climb).

const fmtDist = (m) => (m == null ? '—' : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
const kmM = (m) => (m >= 1000 ? { v: (m / 1000).toFixed(1), u: 'km' } : { v: String(Math.round(m)), u: 'm' });
const fmtTime = (sec) => {
  if (sec == null || !Number.isFinite(sec)) return '—';
  const s2 = Math.max(0, Math.round(sec));
  const h = Math.floor(s2 / 3600), m = Math.floor((s2 % 3600) / 60), ss = s2 % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + ':' + String(ss).padStart(2, '0');
};

// One cell of the segmented field strip (divider on all but the last).
function Cell({ lines, value, unit, hi, last }) {
  return (
    <div style={s(`flex:1;padding:11px 13px 12px;${last ? '' : 'border-right:1px solid var(--line)'}`)}>
      <div style={s('font-size:9px;font-weight:700;letter-spacing:.9px;color:var(--text3);text-transform:uppercase;height:22px;line-height:1.15')}>
        {lines[0]}{lines[1] && <br />}{lines[1]}
      </div>
      <div style={s('display:flex;align-items:baseline;gap:3px;margin-top:5px')}>
        <span className="mono" style={s(`font-size:20px;font-weight:700;line-height:1;${hi ? 'color:var(--accent)' : ''}`)}>{value}</span>
        {unit && <span style={s('font-size:10px;color:var(--text2);font-weight:600')}>{unit}</span>}
      </div>
    </div>
  );
}

// The climb view itself (header + profile + to-go strip). `onDismiss` adds the ✕ (card only).
function ClimbView({ climb, onDismiss }) {
  const { climbing, bars, linePath, posFrac, posTopPct, distToGoM, ascentToGoM, etaSec, gradeNow, distToStartM, topE } = climb;
  const cat = climb.category ? (climb.category === 'HC' ? 'HC' : `Cat ${climb.category}`) : 'Climb';
  const dg = kmM(distToGoM); // dist-to-go while climbing; the whole climb length while approaching
  const cells = climbing
    ? [{ l: ['Dist', 'to go'], v: dg.v, u: dg.u, hi: true }, { l: ['Ascent', 'to go'], v: Math.round(ascentToGoM), u: 'm', hi: true }, { l: ['Est.', 'time'], v: fmtTime(etaSec) }, { l: ['Gradient'], v: (gradeNow || 0).toFixed(1), u: '%', hi: true }]
    : [{ l: ['Climb', 'length'], v: dg.v, u: dg.u }, { l: ['Ascent'], v: Math.round(ascentToGoM), u: 'm', hi: true }, { l: ['Est.', 'time'], v: fmtTime(etaSec) }, { l: ['Avg', 'grade'], v: (gradeNow || 0).toFixed(1), u: '%', hi: true }];

  return (
    <>
      {/* header: category + which climb + phase */}
      <div style={s('display:flex;align-items:center;gap:9px')}>
        <span style={s('font-size:10px;font-weight:700;letter-spacing:.5px;color:#12140a;background:var(--accent);padding:3px 9px;border-radius:7px')}>{cat}</span>
        <span style={s('font-size:15px;font-weight:700;letter-spacing:.3px')}>CLIMB {climb.index + 1}/{climb.total}</span>
        <span style={s('flex:1')} />
        {climbing ? (
          <span style={s('display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--accent)')}>
            <span style={s('width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 25%,transparent)')} />On climb
          </span>
        ) : (
          <span style={s('font-size:12.5px;color:var(--text3)')}>Starts in <span className="mono" style={s('color:var(--text2)')}>{fmtDist(distToStartM)}</span></span>
        )}
        {onDismiss && (
          <div className="ctl" onClick={onDismiss} style={s('width:20px;height:20px;border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--text3);flex:none')}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </div>
        )}
      </div>

      {/* profile: gradient-stroked elevation line + steepness bars + your position */}
      <div style={s('position:relative;height:104px;margin-top:14px')}>
        <div className="mono" style={s('position:absolute;top:-2px;right:2px;font-size:10px;color:var(--text3)')}>{Math.round(topE)} m</div>
        <svg viewBox="0 0 400 104" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
          <defs>
            <linearGradient id="climbStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#4fe08b" /><stop offset=".45" stopColor="#ffc24d" /><stop offset=".7" stopColor="#ff5d3a" /><stop offset="1" stopColor="#ffd24d" />
            </linearGradient>
          </defs>
          <path d={linePath} fill="none" stroke="url(#climbStroke)" strokeWidth="2.5" />
        </svg>
        <div style={s('position:absolute;inset:0;display:flex;align-items:flex-end;gap:1.5px;padding-top:34px')}>
          {bars.map((b, i) => {
            const dim = climbing && posFrac != null && (bars.length > 1 ? i / (bars.length - 1) : 0) < posFrac;
            return <div key={i} style={s(`flex:1;height:${b.h}%;background:${b.color};border-radius:1px;opacity:${dim ? '.35' : '1'}`)} />;
          })}
        </div>
        {climbing && (
          <>
            <div style={s(`position:absolute;top:-4px;bottom:0;left:${(posFrac * 100).toFixed(1)}%;width:2px;background:#fff;box-shadow:0 0 8px rgba(0,0,0,.6)`)} />
            <div style={s(`position:absolute;left:${(posFrac * 100).toFixed(1)}%;top:${posTopPct}%;transform:translate(-50%,-50%);width:14px;height:14px;border-radius:50%;background:var(--accent);border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.5)`)} />
          </>
        )}
      </div>

      {/* segmented to-go field strip */}
      <div style={s('display:flex;background:var(--bg3);border:1px solid var(--line);border-radius:14px;margin-top:14px;overflow:hidden')}>
        {cells.map((c, i) => <Cell key={i} lines={c.l} value={c.v} unit={c.u} hi={c.hi} last={i === cells.length - 1} />)}
      </div>
    </>
  );
}

// Standalone card — auto-shown above the pages while a climb is near/underway. Dismissable.
export default function ClimbPro({ climb }) {
  const [dismissed, setDismissed] = useState(null); // id of a climb the user closed
  if (!climb || dismissed === climb.id) return null;
  const border = climb.climbing ? 'color-mix(in srgb,var(--accent) 22%,transparent)' : 'var(--line)';
  const glow = climb.climbing ? ';box-shadow:0 0 0 1px color-mix(in srgb,var(--accent) 10%,transparent)' : '';
  return (
    <div style={s(`position:relative;margin:0 12px 8px;border-radius:20px;border:1px solid ${border};background:var(--bg2);padding:16px 16px 6px;color:var(--text);animation:floatUp .25s ease${glow}`)}>
      <ClimbView climb={climb} onDismiss={() => setDismissed(climb.id)} />
    </div>
  );
}

// Selectable page tile — the same climb view, filling the field cell; an empty state until a
// climb on the followed course is near/underway.
export function ClimbField({ climb, indoor = false }) {
  if (!climb) {
    return (
      <div style={s('flex:1;display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:11px;text-align:center;padding:0 12px')}>
        {indoor ? 'Indoor session — no climbs.' : 'No climb nearby — appears on the course ahead.'}
      </div>
    );
  }
  return <ClimbView climb={climb} />;
}
