import { s } from '../lib/style.js';

export default function Coach({ vm }) {
  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      <div style={s('display:flex;align-items:center;gap:9px;margin-bottom:4px')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 4.6L18.5 9l-3.5 3 1 5-4-2.7L8 17l1-5L5.5 9l4.6-1.4z" /></svg>
        <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.6px;font-weight:600')}>Coach AI · personal</div>
      </div>
      <div style={s('font-size:23px;font-weight:700;letter-spacing:-.5px')}>Your week, read closely</div>

      {/* readiness ring */}
      <div style={s('background:linear-gradient(160deg,var(--bg3),var(--bg2));border:1px solid var(--line);border-radius:20px;padding:18px;margin-top:16px;display:flex;gap:18px;align-items:center')}>
        <div style={s('position:relative;width:96px;height:96px;flex:none')}>
          <svg width="96" height="96" viewBox="0 0 96 96" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="48" cy="48" r="40" fill="none" stroke="var(--bg4)" strokeWidth="8" />
            <circle cx="48" cy="48" r="40" fill="none" stroke="var(--warn)" strokeWidth="8" strokeLinecap="round" strokeDasharray="181 251" />
          </svg>
          <div style={s('position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center')}><div className="mono" style={s('font-size:28px;font-weight:700;line-height:1')}>72</div><div style={s('font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1px')}>ready</div></div>
        </div>
        <div style={s('flex:1')}>
          <div style={s('font-size:14px;font-weight:600;margin-bottom:8px')}>Moderate readiness</div>
          <div style={s('display:flex;flex-direction:column;gap:7px')}>
            <div style={s('display:flex;justify-content:space-between;font-size:12px')}><span style={s('color:var(--text2)')}>HRV</span><span className="mono" style={s('color:var(--bad);font-weight:600')}>48ms ▼</span></div>
            <div style={s('display:flex;justify-content:space-between;font-size:12px')}><span style={s('color:var(--text2)')}>Sleep</span><span className="mono" style={s('color:var(--warn);font-weight:600')}>6h05</span></div>
            <div style={s('display:flex;justify-content:space-between;font-size:12px')}><span style={s('color:var(--text2)')}>Form (TSB)</span><span className="mono" style={s('color:var(--good);font-weight:600')}>+4</span></div>
          </div>
        </div>
      </div>

      <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.3px;font-weight:600;margin:22px 2px 12px')}>Insights · 4 this week</div>
      <div style={s('display:flex;flex-direction:column;gap:12px')}>
        {vm.coach.map((c, i) => (
          <div key={i} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:18px;padding:15px 15px 13px;position:relative;overflow:hidden')}>
            <div style={s(`position:absolute;left:0;top:0;bottom:0;width:3px;background:${c.color}`)} />
            <div style={s('display:flex;align-items:center;gap:10px')}>
              <div style={s(`width:38px;height:38px;border-radius:11px;background:color-mix(in srgb,${c.color} 15%,transparent);flex:none;display:flex;align-items:center;justify-content:center;font-size:18px`)}>{c.icon}</div>
              <div style={s('flex:1')}><div style={s('font-size:15px;font-weight:700;letter-spacing:-.2px')}>{c.title}</div><span style={s(c.sevStyle)}>{c.sevLabel}</span></div>
            </div>
            <div style={s('font-size:12.5px;color:var(--text2);line-height:1.5;margin-top:11px')}>{c.body}</div>
            <div style={s('display:flex;align-items:center;gap:8px;margin-top:11px')}><span style={s(`width:6px;height:6px;border-radius:50%;background:${c.color}`)} /><span className="mono" style={s('font-size:11px;color:var(--text3)')}>{c.metric}</span></div>
            <div className="ctl" style={s(`margin-top:12px;background:color-mix(in srgb,${c.color} 13%,transparent);border:1px solid color-mix(in srgb,${c.color} 35%,transparent);color:${c.color};border-radius:11px;padding:10px 13px;font-size:12.5px;font-weight:700;display:flex;align-items:center;justify-content:space-between`)}>
              <span>{c.action}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
            </div>
          </div>
        ))}
      </div>
      <div style={s('text-align:center;font-size:10.5px;color:var(--text3);margin-top:16px;line-height:1.5')}>Suggestions from your last 14 days of data.<br />Your coach reviews and can approve changes.</div>
    </div>
  );
}
