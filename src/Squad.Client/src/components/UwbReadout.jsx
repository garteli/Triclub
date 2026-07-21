import { s } from '../lib/style.js';
import { mergePeerRanges } from '../lib/ranging.js';

// Precise UWB (Nearby Interaction) ranging + diagnostics strip for the live ride. Shows, per
// teammate, the distance + a direction arrow (front/back, left/right) when UWB has it, and falls
// back to the (smoothed) BLE range — tagged "BLE" — whenever UWB isn't working/converged for that
// teammate. Renders when UWB is supported OR any BLE range exists; hidden only when neither does.

const HINT = {
  'move-around': 'move phone around',
  'sweep-left-right': 'sweep left–right',
  'sweep-up-down': 'sweep up–down',
  'more-light': 'needs more light',
};

// searching (no data) → ranging (distance, no angle) → located (has direction). BLE-sourced rows
// report as 'BLE' since there's no direction/convergence there.
function statusOf(r) {
  if (r.src === 'ble') return { label: 'BLE', color: 'var(--warn)' };
  if (r.dir) return { label: 'located', color: 'var(--good)' };
  if (r.distanceM != null) return { label: 'ranging', color: 'var(--warn)' };
  return { label: 'searching', color: 'var(--text3)' };
}

function hintFor(r) {
  if (r.src !== 'uwb' || r.dir) return '';
  if (r.distanceM == null) return '';
  const rs = (r.reasons || []).map((x) => HINT[x]).filter(Boolean);
  return rs.length ? rs.join(' · ') : 'point top of phone at them & move';
}

export default function UwbReadout({ uwb, riders = [], blePeers = {} }) {
  const hasBle = Object.keys(blePeers || {}).length > 0;
  if (!uwb?.supported && !hasBle) return null; // nothing to range with

  const nameFor = (id) => {
    const r = riders.find((x) => String(x.athleteId).toLowerCase() === String(id).toLowerCase());
    return { initials: r?.initials || '··', color: r?.color || 'var(--accent)' };
  };
  const rows = mergePeerRanges(uwb?.peers, blePeers).map((r) => ({ ...r, ...nameFor(r.id) }));
  const label = uwb?.supported ? 'UWB' : 'BLE';

  return (
    <div className="hscroll" style={s('display:flex;gap:8px;overflow-x:auto;padding:0 12px 8px;align-items:stretch')}>
      <div style={s('flex:none;display:flex;align-items:center;font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--accent)')}>{label}</div>

      {rows.length === 0 && (
        <div style={s('flex:none;display:flex;align-items:center;font-size:11px;color:var(--text3);background:var(--bg2);border:1px solid var(--line);border-radius:11px;padding:7px 11px')}>
          Searching for a teammate to range…
        </div>
      )}

      {rows.map((r) => {
        const st = statusOf(r);
        const angle = r.bearing?.angle; // 0 ahead, + right, − left (UWB only)
        const hint = hintFor(r);
        const approx = r.src === 'ble';
        return (
          <div key={r.id} style={s('flex:none;display:flex;align-items:center;gap:8px;background:var(--bg2);border:1px solid var(--line);border-radius:11px;padding:7px 11px')}>
            <span style={s(`width:9px;height:9px;border-radius:3px;background:${r.color};flex:none`)} />
            <span style={s('font-size:11px;font-weight:700')}>{r.initials}</span>
            {angle != null ? (
              <svg width="16" height="16" viewBox="0 0 24 24" style={s(`transform:rotate(${angle}deg)`)} fill="none" stroke="var(--good)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v18M12 3l-5 6M12 3l5 6" />
              </svg>
            ) : null}
            {r.distanceM != null && (
              <span className="mono" style={s('font-size:12px;font-weight:700')}>{approx ? '~' : ''}{r.distanceM.toFixed(approx ? 1 : 2)}<span style={s('font-size:9px;color:var(--text2)')}>m</span></span>
            )}
            <span style={s(`font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${st.color}`)}>{st.label}</span>
            {hint ? <span style={s('font-size:10px;color:var(--text3)')}>· {hint}</span> : null}
          </div>
        );
      })}
    </div>
  );
}
