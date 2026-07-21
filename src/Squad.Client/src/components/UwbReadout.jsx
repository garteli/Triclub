import { s } from '../lib/style.js';

// Precise UWB (Nearby Interaction) ranging + diagnostics strip for the live ride. Shows, per
// teammate the U1 radio can see, the exact distance, a direction arrow (front/back, left/right),
// and a status/coaching hint (searching / ranging / located, plus Apple's convergence reasons).
// Renders only when UWB is actually supported (native + U1) — invisible on web / non-UWB devices.

const HINT = {
  'move-around': 'move phone around',
  'sweep-left-right': 'sweep left–right',
  'sweep-up-down': 'sweep up–down',
  'more-light': 'needs more light',
};

// searching (no data) → ranging (distance, no angle) → located (has direction).
function statusOf(p) {
  if (!p) return { key: 'searching', label: 'searching', color: 'var(--text3)' };
  if (p.dir) return { key: 'located', label: 'located', color: 'var(--good)' };
  if (p.distanceM != null) return { key: 'ranging', label: 'ranging', color: 'var(--warn)' };
  return { key: 'searching', label: 'searching', color: 'var(--text3)' };
}

function hintFor(p) {
  if (!p || p.dir) return '';
  if (p.distanceM == null) return '';
  const rs = (p.reasons || []).map((r) => HINT[r]).filter(Boolean);
  if (rs.length) return rs.join(' · ');
  return 'point top of phone at them & move';
}

export default function UwbReadout({ uwb, riders = [] }) {
  if (!uwb?.supported) return null; // hidden on web / non-UWB

  const peers = uwb.peers || {};
  const nameFor = (id) => {
    const r = riders.find((x) => String(x.athleteId).toLowerCase() === String(id).toLowerCase());
    return { initials: r?.initials || '··', color: r?.color || 'var(--accent)' };
  };
  const rows = Object.keys(peers).map((id) => ({ id, ...peers[id], ...nameFor(id) }));

  return (
    <div className="hscroll" style={s('display:flex;gap:8px;overflow-x:auto;padding:0 12px 8px;align-items:stretch')}>
      <div style={s('flex:none;display:flex;align-items:center;font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--accent)')}>UWB</div>

      {rows.length === 0 && (
        <div style={s('flex:none;display:flex;align-items:center;font-size:11px;color:var(--text3);background:var(--bg2);border:1px solid var(--line);border-radius:11px;padding:7px 11px')}>
          Searching for a teammate to range…
        </div>
      )}

      {rows.map((p) => {
        const st = statusOf(p);
        const angle = p.bearing?.angle; // 0 ahead, + right, − left
        const hint = hintFor(p);
        return (
          <div key={p.id} style={s('flex:none;display:flex;align-items:center;gap:8px;background:var(--bg2);border:1px solid var(--line);border-radius:11px;padding:7px 11px')}>
            <span style={s(`width:9px;height:9px;border-radius:3px;background:${p.color};flex:none`)} />
            <span style={s('font-size:11px;font-weight:700')}>{p.initials}</span>
            {angle != null ? (
              <svg width="16" height="16" viewBox="0 0 24 24" style={s(`transform:rotate(${angle}deg)`)} fill="none" stroke="var(--good)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v18M12 3l-5 6M12 3l5 6" />
              </svg>
            ) : null}
            {p.distanceM != null && (
              <span className="mono" style={s('font-size:12px;font-weight:700')}>{p.distanceM.toFixed(2)}<span style={s('font-size:9px;color:var(--text2)')}>m</span></span>
            )}
            <span style={s(`font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${st.color}`)}>{st.label}</span>
            {hint ? <span style={s('font-size:10px;color:var(--text3)')}>· {hint}</span> : null}
          </div>
        );
      })}
    </div>
  );
}
