import { s } from '../lib/style.js';
import SportIcon from '../components/SportIcon.jsx';

const label = 'font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.3px;font-weight:600';

const seasonRows = [
  ['bike', 'Bike', '642 km · 21h', 'var(--bike)'],
  ['run', 'Run', '118 km · 9h', 'var(--run)'],
  ['swim', 'Swim', '28.4 km · 11h', 'var(--swim)'],
  ['gym', 'Gym · Mobility', '14 sessions · 9h', 'var(--gym)'],
];

export default function Profile({ vm, actions }) {
  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      {/* header */}
      <div style={s('display:flex;align-items:center;gap:14px')}>
        <div style={s(`width:64px;height:64px;border-radius:20px;background:${vm.me.color || 'linear-gradient(135deg,#ff6f61,#ffb84d)'};flex:none;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:22px;color:${vm.me.color ? '#0c0e11' : '#fff'}`)}>{vm.me.initials || '·'}</div>
        <div style={s('flex:1')}>
          <div style={s('font-size:21px;font-weight:700;letter-spacing:-.4px')}>{vm.me.name}</div>
          <div style={s('font-size:12.5px;color:var(--text2)')}>{[vm.me.club, vm.me.ageGroup && `Age-group ${vm.me.ageGroup}`].filter(Boolean).join(' · ')}</div>
          <div style={s('display:flex;gap:6px;margin-top:6px')}>
            <span style={s('font-size:10px;font-weight:700;color:var(--accent-ink);background:var(--accent);padding:2px 7px;border-radius:6px')}>⚡ 23-day streak</span>
            <span style={s('font-size:10px;font-weight:700;color:var(--text2);background:var(--bg3);border:1px solid var(--line);padding:2px 7px;border-radius:6px')}>Rank #2</span>
          </div>
        </div>
        <div className="ctl" onClick={() => actions?.go('settings')} style={s('width:38px;height:38px;border-radius:12px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;flex:none;align-self:flex-start')}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
        </div>
      </div>

      {/* quick actions */}
      <div style={s('display:flex;gap:9px;margin-top:14px')}>
        <div className="ctl" onClick={() => actions?.openAthlete('dana')} style={s('flex:1;display:flex;align-items:center;justify-content:center;gap:7px;background:var(--bg2);border:1px solid var(--line);border-radius:13px;padding:11px;font-size:12.5px;font-weight:700;color:var(--text2)')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
          Public profile
        </div>
        <div className="ctl" onClick={() => actions?.go('activities')} style={s('flex:1;display:flex;align-items:center;justify-content:center;gap:7px;background:var(--bg2);border:1px solid var(--line);border-radius:13px;padding:11px;font-size:12.5px;font-weight:700;color:var(--text2)')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l3 8 4-16 3 8h4" /></svg>
          My activities
        </div>
      </div>

      {/* race countdown */}
      <div style={s('background:linear-gradient(120deg,var(--accent),color-mix(in srgb,var(--accent) 55%,var(--swim)));border-radius:20px;padding:18px;margin-top:18px;color:#0c0e11;position:relative;overflow:hidden')}>
        <div style={s('position:absolute;right:-20px;bottom:-30px;font-size:120px;opacity:.14;line-height:1')}>🏁</div>
        <div style={s('font-size:11px;text-transform:uppercase;letter-spacing:1.6px;font-weight:700;opacity:.75')}>Goal race</div>
        <div style={s('font-size:20px;font-weight:700;letter-spacing:-.3px;margin-top:2px')}>Tiberias 70.3</div>
        <div style={s('display:flex;align-items:flex-end;gap:6px;margin-top:10px')}><div className="mono" style={s('font-size:46px;font-weight:700;line-height:.85')}>42</div><div style={s('font-size:14px;font-weight:700;margin-bottom:6px')}>days to go</div></div>
        <div style={s('font-size:12px;font-weight:600;opacity:.75;margin-top:4px')}>Sat 30 Aug · Sea of Galilee</div>
      </div>

      {/* fitness trend */}
      <div style={s('display:flex;justify-content:space-between;align-items:baseline;margin:22px 2px 12px')}><div style={s(label)}>Fitness trend · 12 wk</div><div style={s('font-size:11px;color:var(--text2)')}><span style={s('color:var(--accent)')}>●</span> Fitness <span style={s('color:var(--run);margin-left:6px')}>●</span> Fatigue</div></div>
      <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:14px 12px 10px')}>
        <svg viewBox="0 0 320 110" style={{ width: '100%', display: 'block' }}>
          <defs><linearGradient id="ctlg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".28" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
          <path d="M0,90 L30,84 L60,80 L90,72 L120,66 L150,58 L180,52 L210,46 L240,42 L270,36 L300,30 L320,28 L320,110 L0,110Z" fill="url(#ctlg)" />
          <polyline points="0,90 30,84 60,80 90,72 120,66 150,58 180,52 210,46 240,42 270,36 300,30 320,28" fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="0,96 30,88 60,92 90,78 120,84 150,70 180,76 210,60 240,66 270,52 300,58 320,50" fill="none" stroke="var(--run)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity=".85" strokeDasharray="1 0" />
        </svg>
        <div style={s('display:flex;justify-content:space-between;margin-top:8px;padding:0 4px')}>
          <div><div className="mono" style={s('font-size:16px;font-weight:700;color:var(--accent)')}>68</div><div style={s('font-size:9px;color:var(--text3);text-transform:uppercase')}>CTL fitness</div></div>
          <div><div className="mono" style={s('font-size:16px;font-weight:700;color:var(--run)')}>54</div><div style={s('font-size:9px;color:var(--text3);text-transform:uppercase')}>ATL fatigue</div></div>
          <div><div className="mono" style={s('font-size:16px;font-weight:700;color:var(--good)')}>+14</div><div style={s('font-size:9px;color:var(--text3);text-transform:uppercase')}>Form TSB</div></div>
        </div>
      </div>

      {/* PBs */}
      <div style={s(label + ';margin:22px 2px 12px')}>Personal bests</div>
      <div style={s('display:grid;grid-template-columns:1fr 1fr;gap:10px')}>
        {vm.pbs.map((p) => (
          <div key={p.label} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:15px;padding:13px 14px;position:relative;overflow:hidden')}>
            <div style={s(`position:absolute;right:0;top:0;bottom:0;width:3px;background:${p.color}`)} />
            <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px;font-weight:600')}>{p.label}</div>
            <div className="mono" style={s('font-size:24px;font-weight:700;margin-top:4px')}>{p.value}<span style={s('font-size:12px;color:var(--text2)')}>{p.unit}</span></div>
            <div style={s('font-size:11px;font-weight:700;color:var(--good);margin-top:2px')}>{p.delta}</div>
          </div>
        ))}
      </div>

      {/* season stats */}
      <div style={s(label + ';margin:22px 2px 12px')}>This block</div>
      <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:4px 0')}>
        {seasonRows.map(([key, name, val, color], i) => (
          <div key={name} style={s(`display:flex;align-items:center;padding:12px 16px${i < seasonRows.length - 1 ? ';border-bottom:1px solid var(--line)' : ''}`)}>
            <span style={s('flex:1;display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--text2)')}><SportIcon name={key} size={18} color={color} />{name}</span>
            <span className="mono" style={s('font-size:13px;font-weight:600')}>{val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
