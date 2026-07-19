import { s } from '../lib/style.js';

export default function Leaderboard({ vm, state, actions }) {
  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      <div style={s('display:flex;align-items:center;justify-content:space-between;margin-bottom:6px')}>
        <div><div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.6px;font-weight:600')}>This week</div><div style={s('font-size:23px;font-weight:700;letter-spacing:-.5px')}>Domestique Team Ranks</div></div>
        <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:11px;padding:7px 10px;text-align:center')}><div className="mono" style={s('font-size:13px;font-weight:700;color:var(--accent)')}>4d</div><div style={s('font-size:9px;color:var(--text3);text-transform:uppercase')}>resets</div></div>
      </div>

      {/* tabs */}
      <div className="hscroll" style={s('display:flex;gap:7px;overflow-x:auto;margin:14px -18px 0;padding:0 18px 4px')}>
        {vm.lbTabs.map((t) => (
          <div key={t.id} className="ctl" onClick={() => actions.setLbTab(t.id)} style={s(t.style)}>{t.label}</div>
        ))}
      </div>

      {/* podium */}
      <div style={s('display:flex;align-items:flex-end;gap:8px;margin-top:20px')}>
        {vm.podium.map((p) => (
          <div key={p.name} style={s('flex:1;text-align:center')}>
            <div style={s(`position:relative;width:${p.podSize};height:${p.podSize};margin:0 auto 8px`)}>
              <div style={s(`width:100%;height:100%;border-radius:50%;background:${p.color};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${p.podFont};color:#0c0e11;border:2.5px solid ${p.podBorder}`)}>{p.initials}</div>
              <div style={s(`position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);width:20px;height:20px;border-radius:50%;z-index:2;background:${p.podBadgeBg};color:${p.podBadgeColor};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;border:2px solid var(--bg)`)}>{p.rank}</div>
            </div>
            <div style={s('font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{p.name}</div>
            <div className="mono" style={s('font-size:15px;font-weight:700;color:var(--accent)')}>{p.val}</div>
            <div style={s(`height:${p.pedestalH};background:linear-gradient(180deg,var(--bg3),var(--bg2));border:1px solid var(--line);border-bottom:none;border-radius:10px 10px 0 0;margin-top:8px`)} />
          </div>
        ))}
      </div>

      {/* rows */}
      <div style={s('display:flex;flex-direction:column;gap:8px;margin-top:6px')}>
        {vm.lbRows.map((r) => (
          <div key={r.name} className="ctl" onClick={() => r.id && actions.openAthlete(r.id)} style={s(`${r.rowStyle};border-radius:14px;padding:10px 12px;display:flex;align-items:center;gap:11px`)}>
            <div className="mono" style={s(`width:18px;text-align:center;font-size:14px;font-weight:700;color:${r.rankColor}`)}>{r.rank}</div>
            <div style={s(`width:36px;height:36px;border-radius:11px;background:${r.color};flex:none;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:#0c0e11`)}>{r.initials}</div>
            <div style={s('flex:1;min-width:0')}>
              <div style={s('display:flex;align-items:center;gap:6px')}><span style={s('font-size:13.5px;font-weight:600')}>{r.name}</span><span style={s('font-size:12px')}>{r.badge}</span></div>
              <div style={s('height:4px;background:var(--bg4);border-radius:3px;margin-top:5px;overflow:hidden')}><div style={s(`height:100%;width:${r.barPct}%;background:${r.barColor};border-radius:3px`)} /></div>
            </div>
            <div style={s('text-align:right;flex:none')}><div className="mono" style={s('font-size:15px;font-weight:700')}>{r.val}<span style={s('font-size:10px;color:var(--text3)')}>{r.unit}</span></div><div style={s(`font-size:11px;font-weight:700;color:${r.moveColor}`)}>{r.moveIcon}</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}
