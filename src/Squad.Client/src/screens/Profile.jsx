import { s } from '../lib/style.js';

const label = 'font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.3px;font-weight:600';

const seasonRows = [
  ['🚴 Bike', '642 km · 21h'],
  ['🏃 Run', '118 km · 9h'],
  ['🏊 Swim', '28.4 km · 11h'],
  ['🏋️ Gym · Mobility', '14 sessions · 9h'],
];

export default function Profile({ vm }) {
  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      {/* header */}
      <div style={s('display:flex;align-items:center;gap:14px')}>
        <div style={s('width:64px;height:64px;border-radius:20px;background:linear-gradient(135deg,#ff6f61,#ffb84d);flex:none;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:22px;color:#fff')}>DL</div>
        <div style={s('flex:1')}>
          <div style={s('font-size:21px;font-weight:700;letter-spacing:-.4px')}>Dana Levi</div>
          <div style={s('font-size:12.5px;color:var(--text2)')}>Kaza Tri Club · Age-group 30–34</div>
          <div style={s('display:flex;gap:6px;margin-top:6px')}>
            <span style={s('font-size:10px;font-weight:700;color:var(--accent-ink);background:var(--accent);padding:2px 7px;border-radius:6px')}>⚡ 23-day streak</span>
            <span style={s('font-size:10px;font-weight:700;color:var(--text2);background:var(--bg3);border:1px solid var(--line);padding:2px 7px;border-radius:6px')}>Rank #2</span>
          </div>
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
        {seasonRows.map(([name, val], i) => (
          <div key={name} style={s(`display:flex;padding:12px 16px${i < seasonRows.length - 1 ? ';border-bottom:1px solid var(--line)' : ''}`)}>
            <span style={s('flex:1;font-size:12.5px;color:var(--text2)')}>{name}</span>
            <span className="mono" style={s('font-size:13px;font-weight:600')}>{val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
