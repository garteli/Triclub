import { s } from '../lib/style.js';
import Avatar from '../components/Avatar.jsx';

const label = 'font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.3px;font-weight:600';

export default function Profile({ vm, actions, meId }) {
  const pbs = vm.pbs || [];
  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      {/* header */}
      <div style={s('display:flex;align-items:center;gap:14px')}>
        <Avatar photo={vm.me.photo} initials={vm.me.initials} color={vm.me.color} size={64} radius={20} fontSize={22} />
        <div style={s('flex:1')}>
          <div style={s('font-size:21px;font-weight:700;letter-spacing:-.4px')}>{vm.me.name}</div>
          <div style={s('font-size:12.5px;color:var(--text2)')}>{[vm.me.club, vm.me.ageGroup && `Age-group ${vm.me.ageGroup}`].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="ctl" onClick={() => actions?.go('settings')} style={s('width:38px;height:38px;border-radius:12px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;flex:none;align-self:flex-start')}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
        </div>
      </div>

      {/* quick actions */}
      <div style={s('display:flex;gap:9px;margin-top:14px')}>
        {meId && (
          <div className="ctl" onClick={() => actions?.openAthlete(meId)} style={s('flex:1;display:flex;align-items:center;justify-content:center;gap:7px;background:var(--bg2);border:1px solid var(--line);border-radius:13px;padding:11px;font-size:12.5px;font-weight:700;color:var(--text2)')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
            Public profile
          </div>
        )}
        <div className="ctl" onClick={() => actions?.go('activities')} style={s('flex:1;display:flex;align-items:center;justify-content:center;gap:7px;background:var(--bg2);border:1px solid var(--line);border-radius:13px;padding:11px;font-size:12.5px;font-weight:700;color:var(--text2)')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l3 8 4-16 3 8h4" /></svg>
          My activities
        </div>
      </div>

      {/* Personal bests — from real activity data; empty until logged */}
      <div style={s(label + ';margin:22px 2px 12px')}>Personal bests</div>
      {pbs.length === 0 ? (
        <div style={s('background:var(--bg2);border:1px dashed var(--line2);border-radius:15px;padding:18px;text-align:center;font-size:12.5px;color:var(--text3);line-height:1.5')}>
          Your PBs, fitness trend and season totals appear here as you log activities.
        </div>
      ) : (
        <div style={s('display:grid;grid-template-columns:1fr 1fr;gap:10px')}>
          {pbs.map((p) => (
            <div key={p.label} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:15px;padding:13px 14px;position:relative;overflow:hidden')}>
              <div style={s(`position:absolute;right:0;top:0;bottom:0;width:3px;background:${p.color}`)} />
              <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px;font-weight:600')}>{p.label}</div>
              <div className="mono" style={s('font-size:24px;font-weight:700;margin-top:4px')}>{p.value}<span style={s('font-size:12px;color:var(--text2)')}>{p.unit}</span></div>
              <div style={s('font-size:11px;font-weight:700;color:var(--good);margin-top:2px')}>{p.delta}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
