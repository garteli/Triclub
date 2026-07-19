import { s } from '../lib/style.js';
import { useAthlete } from '../hooks/useAthlete.js';
import Avatar from '../components/Avatar.jsx';

const label = 'font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.3px;font-weight:600;margin:22px 2px 10px';

// Viewable athlete profile. Serves two roles:
//  - a teammate's profile (opened from the squad rail / leaderboard / feed)
//  - your own public profile (when it's you) — with Share + Edit actions.
// Real athletes (GUID id + signed in) load from /api/athletes/{id}; otherwise the
// prototype falls back to vm.athlete.
export default function AthleteProfile({ vm, state, actions, getToken }) {
  const { athlete: liveAthlete, live, follow, unfollow } = useAthlete({ id: state.selMember, getToken });
  const a = live ? liveAthlete : vm.athlete;
  const onToggleFollow = live
    ? () => (a.following ? unfollow() : follow())
    : () => actions.toggleFollow(a.id);
  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      {/* header */}
      <div style={s('display:flex;align-items:center;justify-content:space-between')}>
        <div className="ctl" onClick={() => actions.go(state.profileBack || 'dash')} style={s('width:34px;height:34px;border-radius:10px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg>
        </div>
        <div style={s('font-size:12px;color:var(--text3);font-weight:600')}>{a.isMe ? 'Your public profile' : 'Athlete'}</div>
        <div style={s('width:34px')} />
      </div>

      {/* identity */}
      <div style={s('display:flex;align-items:center;gap:14px;margin-top:14px')}>
        <Avatar photo={a.photo} initials={a.initials} color={a.color} size={64} radius={20} fontSize={22} />
        <div style={s('flex:1;min-width:0')}>
          <div style={s('font-size:21px;font-weight:700;letter-spacing:-.4px')}>{a.name}</div>
          <div style={s('font-size:12.5px;color:var(--text2)')}>{a.club} · Age-group {a.ageGroup}</div>
          <div style={s('display:flex;gap:6px;margin-top:6px;flex-wrap:wrap')}>
            {a.rank && <span style={s('font-size:10px;font-weight:700;color:var(--accent-ink);background:var(--accent);padding:2px 7px;border-radius:6px')}>Rank #{a.rank}</span>}
            <span style={s('font-size:10px;font-weight:700;color:var(--text2);background:var(--bg3);border:1px solid var(--line);padding:2px 7px;border-radius:6px')}>⚡ {a.streak}-day streak</span>
            <span style={s('font-size:10px;font-weight:700;color:var(--text2);background:var(--bg3);border:1px solid var(--line);padding:2px 7px;border-radius:6px')}>{a.level}</span>
          </div>
        </div>
      </div>

      {/* actions */}
      <div style={s('display:flex;gap:9px;margin-top:16px')}>
        {a.isMe ? (
          <>
            <div className="ctl" onClick={() => actions.go('editprofile')} style={s('flex:1;background:var(--accent);color:var(--accent-ink);text-align:center;padding:12px;border-radius:13px;font-weight:700;font-size:13.5px')}>Edit profile</div>
            <div className="ctl" style={s('flex:none;background:var(--bg2);border:1px solid var(--line);color:var(--text);padding:12px 16px;border-radius:13px;font-weight:700;font-size:13.5px;display:flex;align-items:center;gap:7px')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><path d="M16 6l-4-4-4 4M12 2v13" /></svg>Share
            </div>
          </>
        ) : (
          <>
            <div className="ctl" onClick={() => actions.go('chat')} style={s('flex:1;background:var(--accent);color:var(--accent-ink);text-align:center;padding:12px;border-radius:13px;font-weight:700;font-size:13.5px;display:flex;align-items:center;justify-content:center;gap:7px')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 11.5a8.5 8.5 0 0 1-12 7.7L3 21l1.8-6A8.5 8.5 0 1 1 21 11.5z" /></svg>Message
            </div>
            <div className="ctl" onClick={onToggleFollow} style={s('flex:1;text-align:center;padding:12px;border-radius:13px;font-weight:700;font-size:13.5px;' + (a.following ? 'background:var(--bg2);border:1px solid var(--line);color:var(--text2)' : 'background:var(--bg3);border:1px solid var(--line2);color:var(--text)'))}>{a.following ? '✓ Following' : '+ Follow'}</div>
          </>
        )}
      </div>

      {/* this block */}
      <div style={s(label)}>This block</div>
      <div style={s('display:flex;gap:9px')}>
        {[[a.pct + '%', 'Complete'], [a.weekly, 'Weekly'], [a.streak + 'd', 'Streak']].map(([v, l]) => (
          <div key={l} style={s('flex:1;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:13px 12px;text-align:center')}>
            <div className="mono" style={s('font-size:20px;font-weight:700')}>{v}</div>
            <div style={s('font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-top:2px')}>{l}</div>
          </div>
        ))}
      </div>

      {/* fitness */}
      <div style={s(label)}>Fitness</div>
      <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:14px 15px')}>
        <div style={s('display:flex;align-items:baseline;justify-content:space-between')}>
          <div><span className="mono" style={s('font-size:24px;font-weight:700')}>{a.ftp}</span><span style={s('font-size:12px;color:var(--text2)')}> W FTP</span></div>
          <div style={s('font-size:11.5px;color:var(--text3)')}>{a.sport}</div>
        </div>
        <div style={s('display:flex;flex-direction:column;gap:10px;margin-top:14px')}>
          {a.loads.map((d) => (
            <div key={d.key} style={s('display:flex;align-items:center;gap:10px')}>
              <span style={s('width:34px;font-size:10.5px;color:var(--text3);text-transform:uppercase;font-weight:600')}>{d.label}</span>
              <div style={s('flex:1;height:6px;background:var(--bg4);border-radius:3px;overflow:hidden')}><div style={s(`height:100%;width:${d.v}%;background:${d.color};border-radius:3px`)} /></div>
              <span className="mono" style={s('width:26px;text-align:right;font-size:11.5px;font-weight:600;color:var(--text2)')}>{d.v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* bio */}
      {a.bio && (
        <>
          <div style={s(label)}>About</div>
          <div style={s('font-size:13px;color:var(--text2);line-height:1.55;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:13px 14px')}>{a.bio}</div>
        </>
      )}

      {/* recent activity */}
      <div style={s(label)}>Recent activity</div>
      {a.recent.length ? (
        <div style={s('display:flex;flex-direction:column;gap:8px')}>
          {a.recent.map((f) => (
            <div key={f.id} className="ctl" onClick={() => f.activityId && actions.openActivity(f.activityId)} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:11px 13px;display:flex;align-items:center;gap:11px')}>
              <div style={s(`width:34px;height:34px;border-radius:10px;background:color-mix(in srgb,${f.discColor} 22%,transparent);flex:none;display:flex;align-items:center;justify-content:center;font-size:16px`)}>{f.icon}</div>
              <div style={s('flex:1;min-width:0')}>
                <div style={s('font-size:12.5px;font-weight:600')}>{f.action}</div>
                <div className="mono" style={s('font-size:11px;color:var(--text3);margin-top:1px')}>{f.metric}</div>
              </div>
              <div style={s('font-size:10.5px;color:var(--text3)')}>{f.time}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={s('font-size:12.5px;color:var(--text3);background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:16px;text-align:center')}>No public activity yet.</div>
      )}
    </div>
  );
}
