import { s } from '../lib/style.js';

// Precise UWB (Nearby Interaction) ranging strip for the live ride. Shows, per teammate the U1
// radio can see, the exact distance and a direction arrow (front/back, left/right). Renders
// NOTHING when there are no UWB peers — so it's invisible on web / non-UWB devices.
export default function UwbReadout({ uwb, riders = [] }) {
  const peers = uwb?.peers || {};
  const ids = Object.keys(peers);
  if (!ids.length) return null;

  const nameFor = (id) => {
    const r = riders.find((x) => String(x.athleteId).toLowerCase() === String(id).toLowerCase());
    return { initials: r?.initials || '··', color: r?.color || 'var(--accent)' };
  };

  const rows = ids
    .map((id) => ({ id, ...peers[id], ...nameFor(id) }))
    .filter((p) => p.distanceM != null)
    .sort((a, b) => a.distanceM - b.distanceM);
  if (!rows.length) return null;

  return (
    <div className="hscroll" style={s('display:flex;gap:8px;overflow-x:auto;padding:0 12px 8px')}>
      <div style={s('flex:none;display:flex;align-items:center;font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--accent)')}>UWB</div>
      {rows.map((p) => {
        const angle = p.bearing?.angle; // 0 = ahead, + = right, − = left
        return (
          <div key={p.id} style={s('flex:none;display:flex;align-items:center;gap:8px;background:var(--bg2);border:1px solid var(--line);border-radius:11px;padding:7px 11px')}>
            <span style={s(`width:9px;height:9px;border-radius:3px;background:${p.color};flex:none`)} />
            <span style={s('font-size:11px;font-weight:700')}>{p.initials}</span>
            {angle != null ? (
              <svg width="16" height="16" viewBox="0 0 24 24" style={s(`transform:rotate(${angle}deg)`)} fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v18M12 3l-5 6M12 3l5 6" />
              </svg>
            ) : (
              <span style={s('font-size:10px;color:var(--text3)')}>◦</span>
            )}
            <span className="mono" style={s('font-size:12px;font-weight:700')}>{p.distanceM.toFixed(2)}<span style={s('font-size:9px;color:var(--text2)')}>m</span></span>
            {p.bearing?.label ? <span style={s('font-size:10px;color:var(--text3)')}>{p.bearing.label}</span> : null}
          </div>
        );
      })}
    </div>
  );
}
