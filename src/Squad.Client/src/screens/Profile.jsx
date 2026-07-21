import { s } from '../lib/style.js';
import Avatar from '../components/Avatar.jsx';

// Your own profile — the "Domestique Profile" design handoff. Identity, season stats,
// goal-race countdown, weekly-volume + fitness-trend charts, trophy case, PBs and a
// by-discipline block. Real fields (name/club/age-group/avatar, and PBs/achievements
// once the backend serves them) come from `vm`; the analytics-heavy sections that have
// no live source yet fall back to representative sample data, matching the prototype's
// swap-for-real-feeds convention (see CLAUDE.md).

const eyebrow = 'font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.3px;font-weight:600';

// ---- sample fallbacks (pending real analytics endpoints) ----
const SAMPLE_STATS = [['128', 'Following'], ['214', 'Followers'], ['2,005', 'Activities'], ['788 km', 'This year']];
// 10 weeks of stacked discipline minutes → bar heights (px); opacity ramps to "now".
const SAMPLE_VOLUME = [
  [21, 9, 7, 4, 0.42], [26, 11, 9, 5, 0.47], [17, 13, 6, 3, 0.53], [30, 10, 9, 6, 0.58],
  [33, 14, 10, 5, 0.64], [25, 12, 8, 5, 0.70], [37, 16, 10, 7, 0.75], [32, 14, 9, 6, 0.80],
  [41, 17, 11, 7, 0.86], [35, 15, 10, 6, 1],
];
const SAMPLE_TROPHIES = [
  { icon: '1000', title: 'Club legend', sub: 'Activities', bg: 'var(--accent)', ink: 'var(--accent-ink)', glow: 'var(--accent)', fs: 16 },
  { icon: '23', title: 'On fire', sub: 'Day streak', bg: 'linear-gradient(135deg,#ff6f61,#ff9a4c)', ink: '#fff', glow: 'var(--run)', fs: 22 },
  { icon: '👑', title: 'Squad KOM', sub: 'Kaza Dam', bg: 'var(--bike)', ink: '#0c0e11', glow: 'var(--bike)', fs: 22 },
  { icon: '70.3', title: 'Finisher', sub: 'Eilat 2025', bg: 'var(--swim)', ink: '#04222f', glow: 'var(--swim)', fs: 16 },
  { icon: '⚡', title: '12h block', sub: 'Big week', bg: 'linear-gradient(135deg,#c68bff,#8a5cff)', ink: '#fff', glow: 'var(--gym)', fs: 22 },
];
const SAMPLE_PBS = [
  { label: 'FTP', value: '271', unit: 'W', delta: '+8', color: 'var(--bike)' },
  { label: '5K run', value: '19:42', unit: '', delta: '−0:18', color: 'var(--run)' },
  { label: '1K swim', value: '16:20', unit: '', delta: '−0:34', color: 'var(--swim)' },
  { label: 'Longest ride', value: '134', unit: 'km', delta: 'PB', color: 'var(--bike)' },
];
const SAMPLE_DISCIPLINE = [
  { name: 'Bike', pct: 100, main: '642 km', sub: '21h', color: 'var(--bike)' },
  { name: 'Run', pct: 44, main: '118 km', sub: '9h', color: 'var(--run)' },
  { name: 'Swim', pct: 52, main: '28.4 km', sub: '11h', color: 'var(--swim)' },
  { name: 'Gym', pct: 42, main: '14 sessions', sub: '9h', color: 'var(--gym)' },
];

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
  // Prefer the athlete's real leaderboard row for streak / squad rank.
  const you = (vm.lbRows || []).find((r) => r.you) || {};
  const streak = you.streak ?? 23;
  const rank = you.rank ?? 2;

  const trophies = vm.achievements?.length ? vm.achievements : SAMPLE_TROPHIES;
  const pbs = vm.pbs?.length ? vm.pbs : SAMPLE_PBS;

  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      {/* header */}
      <div style={s('display:flex;align-items:flex-start;gap:14px')}>
        <Avatar photo={me.photo} initials={me.initials} color={me.color} size={66} radius={20} fontSize={23} />
        <div style={s('flex:1;min-width:0')}>
          <div style={s('font-size:22px;font-weight:700;letter-spacing:-.4px')}>{me.name || 'Your name'}</div>
          {sub && <div style={s('font-size:12.5px;color:var(--text2)')}>{sub}</div>}
          <div style={s('display:flex;gap:6px;margin-top:7px;flex-wrap:wrap')}>
            <span style={s('font-size:10px;font-weight:700;color:var(--accent-ink);background:var(--accent);padding:2px 8px;border-radius:6px')}>⚡ {streak}-day streak</span>
            <span style={s('font-size:10px;font-weight:700;color:var(--text2);background:var(--bg3);border:1px solid var(--line);padding:2px 8px;border-radius:6px')}>Squad rank #{rank}</span>
          </div>
        </div>
        <div className="ctl" onClick={() => actions?.go('settings')} style={s('width:34px;height:34px;border-radius:11px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;flex:none')}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
        </div>
      </div>

      {/* season stat strip */}
      <div style={s('display:flex;background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:12px 6px;margin-top:16px')}>
        {SAMPLE_STATS.map(([v, l], i) => (
          <div key={l} style={s(`flex:1;text-align:center;${i < SAMPLE_STATS.length - 1 ? 'border-right:1px solid var(--line)' : ''}`)}>
            <div className="mono" style={s('font-size:16px;font-weight:700')}>{v}</div>
            <div style={s('font-size:9.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-top:2px')}>{l}</div>
          </div>
        ))}
      </div>

      {/* actions */}
      <div style={s('display:flex;gap:10px;margin-top:10px')}>
        <div className="ctl" onClick={() => actions?.go('editprofile')} style={s('flex:1;text-align:center;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:11px;font-size:12.5px;font-weight:700;color:var(--text)')}>Edit profile</div>
        <div className="ctl" onClick={() => actions?.go('activities')} style={s('flex:1;text-align:center;background:var(--accent-dim);border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);border-radius:12px;padding:11px;font-size:12.5px;font-weight:700;color:var(--accent)')}>My activities</div>
      </div>

      {/* goal race countdown */}
      <div style={s('background:linear-gradient(120deg,var(--accent),color-mix(in srgb,var(--accent) 55%,var(--swim)));border-radius:20px;padding:18px;margin-top:18px;color:#0c0e11;position:relative;overflow:hidden')}>
        <div style={s('position:absolute;right:-20px;bottom:-30px;font-size:120px;opacity:.14;line-height:1')}>🏁</div>
        <div style={s('font-size:11px;text-transform:uppercase;letter-spacing:1.6px;font-weight:700;opacity:.75')}>Goal race</div>
        <div style={s('font-size:20px;font-weight:700;letter-spacing:-.3px;margin-top:2px')}>Tiberias 70.3</div>
        <div style={s('display:flex;align-items:flex-end;gap:6px;margin-top:10px')}>
          <div className="mono" style={s('font-size:46px;font-weight:700;line-height:.85')}>42</div>
          <div style={s('font-size:14px;font-weight:700;margin-bottom:6px')}>days to go</div>
        </div>
        <div style={s('font-size:12px;font-weight:600;opacity:.75;margin-top:4px')}>Sat 30 Aug · Sea of Galilee</div>
      </div>

      {/* weekly volume */}
      <div style={s('display:flex;justify-content:space-between;align-items:baseline;margin:22px 2px 12px')}>
        <div style={s(eyebrow)}>Weekly volume · 10 wk</div>
        <div className="mono" style={s('font-size:11px;color:var(--good)')}>▲ 11.2h this wk</div>
      </div>
      <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:16px 14px 12px')}>
        <div style={s('display:flex;align-items:flex-end;gap:5px;height:82px')}>
          {SAMPLE_VOLUME.map(([bike, run, swim, gym, op], i) => (
            <div key={i} style={s(`flex:1;display:flex;flex-direction:column-reverse;gap:2px;opacity:${op}`)}>
              <div style={s(`height:${bike}px;background:var(--bike);border-radius:0 0 4px 4px`)} />
              <div style={s(`height:${run}px;background:var(--run)`)} />
              <div style={s(`height:${swim}px;background:var(--swim)`)} />
              <div style={s(`height:${gym}px;background:var(--gym);border-radius:4px 4px 0 0`)} />
            </div>
          ))}
        </div>
        <div style={s('display:flex;gap:16px;margin-top:14px;padding-top:12px;border-top:1px solid var(--line);flex-wrap:wrap')}>
          {[['Bike', 'var(--bike)'], ['Run', 'var(--run)'], ['Swim', 'var(--swim)'], ['Gym', 'var(--gym)']].map(([l, c]) => (
            <div key={l} style={s('display:flex;align-items:center;gap:5px;font-size:10.5px;color:var(--text2)')}>
              <span style={s(`width:8px;height:8px;border-radius:2px;background:${c}`)} />{l}
            </div>
          ))}
        </div>
      </div>

      {/* fitness trend */}
      <div style={s('display:flex;justify-content:space-between;align-items:baseline;margin:22px 2px 12px')}>
        <div style={s(eyebrow)}>Fitness trend · 12 wk</div>
        <div style={s('font-size:11px;color:var(--text2)')}>
          <span style={s('color:var(--accent)')}>●</span> Fitness <span style={s('color:var(--run);margin-left:6px')}>●</span> Fatigue
        </div>
      </div>
      <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:14px 12px 10px')}>
        <svg viewBox="0 0 320 110" style={s('width:100%;display:block')}>
          <defs>
            <linearGradient id="ctlg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity=".28" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0,90 L30,84 L60,80 L90,72 L120,66 L150,58 L180,52 L210,46 L240,42 L270,36 L300,30 L320,28 L320,110 L0,110Z" fill="url(#ctlg)" />
          <polyline points="0,90 30,84 60,80 90,72 120,66 150,58 180,52 210,46 240,42 270,36 300,30 320,28" fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points="0,96 30,88 60,92 90,78 120,84 150,70 180,76 210,60 240,66 270,52 300,58 320,50" fill="none" stroke="var(--run)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity=".85" />
        </svg>
        <div style={s('display:flex;justify-content:space-between;margin-top:8px;padding:0 4px')}>
          {[['68', 'CTL fitness', 'var(--accent)'], ['54', 'ATL fatigue', 'var(--run)'], ['+14', 'Form TSB', 'var(--good)']].map(([v, l, c]) => (
            <div key={l}>
              <div className="mono" style={s(`font-size:16px;font-weight:700;color:${c}`)}>{v}</div>
              <div style={s('font-size:9px;color:var(--text3);text-transform:uppercase')}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* trophy case */}
      <div style={s('display:flex;justify-content:space-between;align-items:baseline;margin:22px 2px 12px')}>
        <div style={s(eyebrow)}>Trophy case</div>
        <div style={s('font-size:11px;color:var(--text2)')}>36 earned</div>
      </div>
      <div className="hscroll" style={s('display:flex;gap:12px;overflow-x:auto;padding:2px 18px 4px;margin:0 -18px')}>
        {trophies.map((t, i) => (
          <div key={i} style={s('width:88px;flex:none;text-align:center')}>
            <div style={s(`width:58px;height:58px;border-radius:18px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${t.fs || 20}px;color:${t.ink};background:${t.bg};box-shadow:0 8px 20px -8px ${t.glow};margin:0 auto`)}>{t.icon}</div>
            <div style={s('font-size:11.5px;font-weight:700;margin-top:8px')}>{t.title}</div>
            <div style={s('font-size:10px;color:var(--text3);margin-top:1px')}>{t.sub}</div>
          </div>
        ))}
      </div>

      {/* personal bests */}
      <div style={s(eyebrow + ';margin:22px 2px 12px')}>Personal bests</div>
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

      {/* this block · by discipline */}
      <div style={s(eyebrow + ';margin:22px 2px 12px')}>This block · by discipline</div>
      <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:6px 16px')}>
        {SAMPLE_DISCIPLINE.map((d, i) => (
          <div key={d.name} style={s(`display:flex;align-items:center;gap:12px;padding:13px 0;${i < SAMPLE_DISCIPLINE.length - 1 ? 'border-bottom:1px solid var(--line)' : ''}`)}>
            <div style={s('width:52px;font-size:12.5px;font-weight:600;color:var(--text)')}>{d.name}</div>
            <div style={s('flex:1;height:6px;background:var(--bg4);border-radius:5px;overflow:hidden')}>
              <div style={s(`height:100%;width:${d.pct}%;border-radius:5px;background:${d.color}`)} />
            </div>
            <div className="mono" style={s('text-align:right;flex:none;min-width:78px')}>
              <span style={s('font-size:12.5px;font-weight:700')}>{d.main}</span>
              <span style={s('font-size:11px;color:var(--text3)')}> · {d.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* squad card */}
      <div style={s(eyebrow + ';margin:22px 2px 12px')}>Squad</div>
      <div className="ctl" onClick={() => actions?.go('discover')} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:13px 14px;display:flex;align-items:center;gap:12px')}>
        <div style={s('width:44px;height:44px;border-radius:13px;background:linear-gradient(135deg,#ff8a3d,#ef5f1f);flex:none;display:flex;align-items:center;justify-content:center')}><SquadLogo /></div>
        <div style={s('flex:1;min-width:0')}>
          <div style={s('font-size:14px;font-weight:700')}>{me.club || 'Your club'}</div>
          <div style={s('font-size:11.5px;color:var(--text2)')}>42 athletes · Rank #2 this week</div>
        </div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
      </div>
    </div>
  );
}
