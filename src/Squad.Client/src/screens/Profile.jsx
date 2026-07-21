import { s } from '../lib/style.js';
import Avatar from '../components/Avatar.jsx';

// Your own profile: real identity + season badges (streak / squad rank from the live
// leaderboard), real achievements and personal bests when the backend serves them, and
// your squad. No fabricated stats or charts — sections without a live data source are
// omitted rather than filled with sample data (real data or an empty state, never fake).

const eyebrow = 'font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.3px;font-weight:600';

const SquadLogo = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <g stroke="#fff" strokeWidth="6" strokeLinecap="round">
      <path d="M13 44 L23 30" /><path d="M25 46 L35 32" opacity=".85" /><path d="M37 48 L47 34" opacity=".55" />
    </g>
    <circle cx="49.5" cy="20.5" r="4.6" fill="#fff" />
  </svg>
);

export default function Profile({ vm, actions }) {
  const me = vm.me || {};
  const sub = [me.club, me.ageGroup && `Age-group ${me.ageGroup}`].filter(Boolean).join(' · ');
  // Real streak / squad rank from the leaderboard row for the signed-in athlete.
  const you = (vm.lbRows || []).find((r) => r.you) || {};
  const streak = you.streak;
  const rank = you.rank;
  const trophies = vm.achievements || [];
  const pbs = vm.pbs || [];

  const squadSub = [
    vm.squadTotal ? `${vm.squadTotal} athlete${vm.squadTotal === 1 ? '' : 's'}` : null,
    rank != null ? `Rank #${rank} this week` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      {/* header */}
      <div style={s('display:flex;align-items:flex-start;gap:14px')}>
        <Avatar photo={me.photo} initials={me.initials} color={me.color} size={66} radius={20} fontSize={23} />
        <div style={s('flex:1;min-width:0')}>
          <div style={s('font-size:22px;font-weight:700;letter-spacing:-.4px')}>{me.name || 'Your name'}</div>
          {sub && <div style={s('font-size:12.5px;color:var(--text2)')}>{sub}</div>}
          {(streak != null || rank != null) && (
            <div style={s('display:flex;gap:6px;margin-top:7px;flex-wrap:wrap')}>
              {streak != null && <span style={s('font-size:10px;font-weight:700;color:var(--accent-ink);background:var(--accent);padding:2px 8px;border-radius:6px')}>⚡ {streak}-day streak</span>}
              {rank != null && <span style={s('font-size:10px;font-weight:700;color:var(--text2);background:var(--bg3);border:1px solid var(--line);padding:2px 8px;border-radius:6px')}>Squad rank #{rank}</span>}
            </div>
          )}
        </div>
        <div className="ctl" onClick={() => actions?.go('settings')} style={s('width:34px;height:34px;border-radius:11px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;flex:none')}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
        </div>
      </div>

      {/* actions */}
      <div style={s('display:flex;gap:10px;margin-top:18px')}>
        <div className="ctl" onClick={() => actions?.go('editprofile')} style={s('flex:1;text-align:center;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:11px;font-size:12.5px;font-weight:700;color:var(--text)')}>Edit profile</div>
        <div className="ctl" onClick={() => actions?.go('activities')} style={s('flex:1;text-align:center;background:var(--accent-dim);border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);border-radius:12px;padding:11px;font-size:12.5px;font-weight:700;color:var(--accent)')}>My activities</div>
      </div>

      {/* trophy case — only when the backend serves real achievements */}
      {trophies.length > 0 && (
        <>
          <div style={s(eyebrow + ';margin:22px 2px 12px')}>Trophy case</div>
          <div className="hscroll" style={s('display:flex;gap:12px;overflow-x:auto;padding:2px 18px 4px;margin:0 -18px')}>
            {trophies.map((t, i) => (
              <div key={i} style={s('width:88px;flex:none;text-align:center')}>
                <div style={s(`width:58px;height:58px;border-radius:18px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${t.fs || 20}px;color:${t.ink};background:${t.bg};box-shadow:0 8px 20px -8px ${t.glow};margin:0 auto`)}>{t.icon}</div>
                <div style={s('font-size:11.5px;font-weight:700;margin-top:8px')}>{t.title}</div>
                <div style={s('font-size:10px;color:var(--text3);margin-top:1px')}>{t.sub}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* personal bests — only when the backend serves them */}
      {pbs.length > 0 && (
        <>
          <div style={s(eyebrow + ';margin:22px 2px 12px')}>Personal bests</div>
          <div style={s('display:grid;grid-template-columns:1fr 1fr;gap:10px')}>
            {pbs.map((p) => (
              <div key={p.label} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:15px;padding:13px 14px;position:relative;overflow:hidden')}>
                <div style={s(`position:absolute;right:0;top:0;bottom:0;width:3px;background:${p.color}`)} />
                <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px;font-weight:600')}>{p.label}</div>
                <div className="mono" style={s('font-size:24px;font-weight:700;margin-top:4px')}>{p.value}<span style={s('font-size:12px;color:var(--text2)')}>{p.unit}</span></div>
                {p.delta && <div style={s('font-size:11px;font-weight:700;color:var(--good);margin-top:2px')}>{p.delta}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* squad card */}
      <div style={s(eyebrow + ';margin:22px 2px 12px')}>Squad</div>
      <div className="ctl" onClick={() => actions?.go('discover')} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:13px 14px;display:flex;align-items:center;gap:12px')}>
        <div style={s('width:44px;height:44px;border-radius:13px;background:linear-gradient(135deg,#ff8a3d,#ef5f1f);flex:none;display:flex;align-items:center;justify-content:center')}><SquadLogo /></div>
        <div style={s('flex:1;min-width:0')}>
          <div style={s('font-size:14px;font-weight:700')}>{me.club || 'Your club'}</div>
          {squadSub && <div style={s('font-size:11.5px;color:var(--text2)')}>{squadSub}</div>}
        </div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
      </div>
    </div>
  );
}
