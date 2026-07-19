import { s } from '../lib/style.js';

const label = 'font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.3px;font-weight:600';

export default function Segments({ vm }) {
  return (
    <div style={s('padding:6px 0 120px;animation:floatUp .35s ease')}>
      <div style={s('padding:2px 18px 0')}>
        <div style={s('display:flex;align-items:center;gap:8px')}><span style={s('font-size:10px;font-weight:700;color:var(--bike);background:color-mix(in srgb,var(--bike) 16%,transparent);padding:3px 8px;border-radius:6px;text-transform:uppercase;letter-spacing:.6px')}>Climb segment</span><span style={s('font-size:11px;color:var(--text3)')}>★ Starred</span></div>
        <div style={s('font-size:23px;font-weight:700;letter-spacing:-.5px;margin-top:8px')}>Kaza Dam Climb</div>
        <div style={s('font-size:12.5px;color:var(--text2)')}>2.4 km · 5.8% avg · 139 m gain</div>
      </div>

      {/* mini map */}
      <div style={s('margin:14px 18px 0;border-radius:18px;overflow:hidden;border:1px solid var(--line);background:#0d1512;position:relative')}>
        <svg viewBox="0 0 356 120" style={{ width: '100%', display: 'block' }}>
          <rect width="356" height="120" fill="var(--bg3)" />
          <path d="M20,100 C80,96 120,70 170,66 C230,60 280,34 336,22" fill="none" stroke="var(--line2)" strokeWidth="7" strokeLinecap="round" />
          <path d="M20,100 C80,96 120,70 170,66 C230,60 280,34 336,22" fill="none" stroke="var(--bike)" strokeWidth="3" strokeLinecap="round" />
          <circle cx="20" cy="100" r="6" fill="var(--good)" stroke="var(--bg3)" strokeWidth="2" />
          <circle cx="336" cy="22" r="6" fill="var(--bad)" stroke="var(--bg3)" strokeWidth="2" />
        </svg>
      </div>

      {/* your effort + QOM */}
      <div style={s('margin:14px 18px 0;display:flex;gap:10px')}>
        <div style={s('flex:1;background:var(--accent-dim);border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);border-radius:16px;padding:13px 14px')}>
          <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;font-weight:600')}>Your PR</div>
          <div className="mono" style={s('font-size:24px;font-weight:700;color:var(--accent);margin-top:3px')}>6:58</div>
          <div style={s('font-size:11px;color:var(--text2)')}>Rank 2 of 6 · 12 efforts</div>
        </div>
        <div style={s('flex:1;background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:13px 14px')}>
          <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;font-weight:600')}>👑 Domestique Club QOM</div>
          <div className="mono" style={s('font-size:24px;font-weight:700;margin-top:3px')}>6:42</div>
          <div style={s('font-size:11px;color:var(--text2)')}>Noa · 16s ahead</div>
        </div>
      </div>

      {/* effort history */}
      <div style={s('padding:20px 18px 0')}>
        <div style={s('display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px')}><div style={s(label)}>Your efforts · getting faster</div><span className="mono" style={s('font-size:11px;color:var(--good)')}>▼ 14s</span></div>
        <div style={s('display:flex;align-items:flex-end;gap:6px;height:62px')}>
          {vm.segEffortBars.map((e, i) => (
            <div key={i} style={s(`flex:1;height:${e.h}px;border-radius:5px 5px 2px 2px;background:${e.best ? 'var(--accent)' : 'var(--bike)'};opacity:${e.best ? '1' : '.5'}`)} />
          ))}
        </div>
      </div>

      {/* squad leaderboard */}
      <div style={s(label + ';margin:22px 18px 12px')}>Domestique Club leaderboard</div>
      <div style={s('display:flex;flex-direction:column;gap:8px;padding:0 18px')}>
        {vm.segRows.map((r) => (
          <div key={r.rank} style={s(`${r.rowStyle};border-radius:14px;padding:10px 12px;display:flex;align-items:center;gap:11px`)}>
            <div className="mono" style={s(`width:18px;text-align:center;font-size:14px;font-weight:700;color:${r.rankColor}`)}>{r.rank}</div>
            <div style={s(`width:34px;height:34px;border-radius:11px;background:${r.color};flex:none;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:#0c0e11`)}>{r.initials}</div>
            <div style={s('flex:1;min-width:0;display:flex;align-items:center;gap:6px')}><span style={s('font-size:13.5px;font-weight:600')}>{r.name}</span>{r.crown && <span style={s('font-size:13px')}>👑</span>}</div>
            <div style={s('text-align:right;flex:none')}><div className="mono" style={s('font-size:15px;font-weight:700')}>{r.time}</div><div className="mono" style={s('font-size:10px;color:var(--text3)')}>{r.speed} kph</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}
