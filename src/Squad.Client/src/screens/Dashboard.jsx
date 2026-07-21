import { useState } from 'react';
import { s, html } from '../lib/style.js';
import Avatar from '../components/Avatar.jsx';
import AuthedImage from '../components/AuthedImage.jsx';
import FeedActivityCard from '../components/FeedActivityCard.jsx';
import { useNotifications } from '../hooks/useNotifications.js';

// Last 7 days of squad activities for the main-page feed. Live rows carry a real
// startUtc (kept when a row can't be dated, e.g. seed data), newest first.
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
function last7Days(activities) {
  const cutoff = Date.now() - WEEK_MS;
  return (activities || [])
    .filter((a) => { const t = a.startUtc ? new Date(a.startUtc).getTime() : NaN; return Number.isNaN(t) || t >= cutoff; })
    .sort((a, b) => new Date(b.startUtc || 0) - new Date(a.startUtc || 0));
}

const Chevron = ({ stroke = 'var(--accent)', w = 18 }) => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
);

// The club name/eyebrow in the header, upgraded to an active-club switcher when the
// athlete belongs to more than one club. Tapping opens a dropdown of their clubs; the
// active one is marked, and choosing another calls onSwitch (App persists + refreshes).
function ClubSwitcher({ vm, token, rtl, onSwitch, children }) {
  const [open, setOpen] = useState(false);
  const clubs = vm.myClubs || [];
  const canSwitch = clubs.length > 1 && !!onSwitch;
  return (
    <div style={s('position:relative;min-width:0')}>
      <div
        className={canSwitch ? 'ctl' : undefined}
        onClick={canSwitch ? () => setOpen((o) => !o) : undefined}
        style={s(`display:flex;align-items:center;gap:6px;min-width:0;${rtl ? 'flex-direction:row-reverse' : ''}`)}
      >
        {children}
        {canSwitch && <div style={s(`transition:transform .15s;${open ? 'transform:rotate(90deg)' : ''};display:flex`)}><Chevron stroke="var(--text3)" w={16} /></div>}
      </div>
      {open && canSwitch && (
        <>
          {/* click-away backdrop */}
          <div onClick={() => setOpen(false)} style={s('position:fixed;inset:0;z-index:30')} />
          <div style={s(`position:absolute;top:calc(100% + 8px);${rtl ? 'right:0' : 'left:0'};z-index:31;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:6px;min-width:210px;max-width:280px;box-shadow:0 14px 34px rgba(0,0,0,.42)`)}>
            {clubs.map((c) => (
              <div
                key={c.id}
                className="ctl"
                onClick={() => { setOpen(false); if (!c.active) onSwitch(c.id); }}
                style={s(`display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:10px;${c.active ? 'background:var(--accent-dim)' : ''};${rtl ? 'flex-direction:row-reverse;text-align:right' : ''}`)}
              >
                {c.logoUrl
                  ? <AuthedImage url={c.logoUrl} token={token} style="width:26px;height:26px;border-radius:8px;flex:none" />
                  : <div style={s(`width:26px;height:26px;border-radius:8px;flex:none;background:${c.color || 'var(--bg4)'}`)} />}
                <div style={s('flex:1;min-width:0;font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{c.name}</div>
                {c.active && <span style={s('font-size:10px;color:var(--accent);font-weight:700;flex:none')}>{rtl ? 'פעיל' : 'Active'}</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SquadRail({ squad, rtl, onOpen }) {
  if (!squad.length) {
    return (
      <div style={s('margin:2px 0 6px;padding:16px;border:1px dashed var(--line2);border-radius:16px;text-align:center;font-size:12.5px;color:var(--text3);line-height:1.5')}>
        No teammates training yet — invite your club and their weekly progress shows up here.
      </div>
    );
  }
  return (
    <div className="hscroll" style={s(`display:flex;gap:11px;overflow-x:auto;padding:2px 18px 6px;margin:0 -18px;${rtl ? 'flex-direction:row-reverse' : ''}`)}>
      {squad.map((m) => (
        <div key={m.id} className="ctl" onClick={() => onOpen?.(m.id)} style={s('flex:none;width:78px;background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:12px 8px;text-align:center')}>
          <div style={s('position:relative;width:52px;height:52px;margin:0 auto')}>
            <svg width="52" height="52" viewBox="0 0 52 52" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="26" cy="26" r="22" fill="none" stroke="var(--bg4)" strokeWidth="4" />
              <circle cx="26" cy="26" r="22" fill="none" stroke={m.ringColor} strokeWidth="4" strokeLinecap="round" strokeDasharray={m.dash} />
            </svg>
            <div style={s(`position:absolute;inset:5px;border-radius:50%;background:${m.color};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${rtl ? '13px' : '14px'};color:#0c0e11`)}>{rtl ? m.he : m.initials}</div>
            <div style={s(`position:absolute;bottom:2px;right:2px;width:12px;height:12px;border-radius:50%;background:${m.statusColor};border:2px solid var(--bg2)`)} />
          </div>
          <div style={s('font-size:11.5px;font-weight:600;margin-top:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{rtl ? m.nameHe : m.name}</div>
          <div className="mono" style={s('font-size:10.5px;color:var(--text3)')}>{m.pctLabel}</div>
        </div>
      ))}
    </div>
  );
}

function DashboardEN({ vm, go, openAthlete, openActivity, getToken, onSwitchSquad, notifUnread = 0 }) {
  const token = getToken?.() ?? null;
  const recent = last7Days(vm.activities);
  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .4s ease')}>
      {/* club banner (owner-uploaded) — a branded header strip when set */}
      {vm.squadBanner && <AuthedImage url={vm.squadBanner} token={token} style="height:88px;border-radius:16px;margin-bottom:14px" />}
      {/* header */}
      <div style={s('display:flex;align-items:center;justify-content:space-between;margin-bottom:18px')}>
        <div style={s('display:flex;align-items:center;gap:11px;min-width:0')}>
          {vm.squadLogo && <AuthedImage url={vm.squadLogo} token={token} style="width:40px;height:40px;border-radius:12px;flex:none" />}
          <ClubSwitcher vm={vm} token={token} onSwitch={onSwitchSquad}>
            <div style={s('min-width:0')}>
              <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.6px;font-weight:600')}>Domestique Team</div>
              <div style={s('font-size:23px;font-weight:700;letter-spacing:-.6px;line-height:1.05;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{vm.squadName || 'Your squad'}</div>
            </div>
          </ClubSwitcher>
        </div>
        <div style={s('display:flex;align-items:center;gap:10px')}>
          <div className="ctl" onClick={() => go('discover')} style={s('width:38px;height:38px;border-radius:12px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></svg>
          </div>
          <div className="ctl" onClick={() => go('notifs')} style={s('width:38px;height:38px;border-radius:12px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;position:relative')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
            {notifUnread > 0 && <div style={s('position:absolute;top:8px;right:9px;width:7px;height:7px;border-radius:50%;background:var(--accent);border:1.5px solid var(--bg2)')} />}
          </div>
          <div className="ctl" onClick={() => go('profile')}><Avatar photo={vm.me.photo} initials={vm.me.initials} color={vm.me.color} size={38} radius={12} fontSize={14} /></div>
        </div>
      </div>

      {/* today hero — driven by the real plan (empty state when none) */}
      {(() => {
        const todayWk = vm.plan.find((p) => p.status === 'today');
        return (
          <>
            <div style={s('font-size:12px;color:var(--text3);text-transform:uppercase;letter-spacing:1.4px;font-weight:600;margin:4px 2px 10px')}>Today · {vm.todayLabel}</div>
            {todayWk ? (
              <div style={s('background:linear-gradient(160deg,var(--bg3),var(--bg2));border:1px solid var(--line);border-radius:22px;padding:0;overflow:hidden;position:relative')}>
                <div style={s(`height:4px;background:${todayWk.color}`)} />
                <div style={s('padding:17px 18px 18px')}>
                  <div style={s('display:flex;justify-content:space-between;align-items:flex-start')}>
                    <div style={s('display:flex;gap:12px;align-items:center')}>
                      <div style={s(`width:46px;height:46px;border-radius:14px;background:color-mix(in srgb,${todayWk.color} 18%, transparent);color:${todayWk.color};display:flex;align-items:center;justify-content:center`)} dangerouslySetInnerHTML={html(todayWk.iconHtml)} />
                      <div>
                        <div style={s('font-size:19px;font-weight:700;letter-spacing:-.4px')}>{todayWk.title}</div>
                        {todayWk.sub && <div style={s('font-size:13px;color:var(--text2)')}>{todayWk.sub}</div>}
                      </div>
                    </div>
                    <div style={s('background:var(--accent);color:var(--accent-ink);font-size:10px;font-weight:700;padding:4px 8px;border-radius:7px;text-transform:uppercase;letter-spacing:.5px')}>Today</div>
                  </div>
                  <div style={s('display:flex;gap:0;margin-top:16px;border-top:1px solid var(--line);padding-top:14px')}>
                    <div style={s('flex:1')}><div className="mono" style={s('font-size:20px;font-weight:700')}>{todayWk.dur}</div><div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;margin-top:2px')}>Duration</div></div>
                    <div style={s('flex:1;border-left:1px solid var(--line);padding-left:14px')}><div className="mono" style={s('font-size:20px;font-weight:700;color:var(--accent)')}>{todayWk.load}</div><div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;margin-top:2px')}>Load</div></div>
                  </div>
                  <div style={s('display:flex;gap:9px;margin-top:14px')}>
                    <div className="ctl" onClick={() => go('ride')} style={s('flex:1;background:var(--accent);color:var(--accent-ink);text-align:center;padding:13px;border-radius:13px;font-weight:700;font-size:14px')}>Start session</div>
                    <div className="ctl" onClick={() => go('plan')} style={s('width:52px;background:var(--bg4);border:1px solid var(--line);border-radius:13px;display:flex;align-items:center;justify-content:center')}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="ctl" onClick={() => go('plan')} style={s('background:var(--bg2);border:1px dashed var(--line2);border-radius:20px;padding:22px 18px;text-align:center')}>
                <div style={s('font-size:15px;font-weight:600')}>No session planned for today</div>
                <div style={s('font-size:12.5px;color:var(--text3);margin-top:5px;line-height:1.5')}>Your coach's weekly plan shows up here. Tap to open your plan.</div>
              </div>
            )}
          </>
        );
      })()}

      {/* squad status */}
      <div style={s('display:flex;justify-content:space-between;align-items:baseline;margin:22px 2px 12px')}>
        <div style={s('font-size:12px;color:var(--text3);text-transform:uppercase;letter-spacing:1.4px;font-weight:600')}>Domestique Team this week</div>
        <div className="ctl" onClick={() => go('lb')} style={s('font-size:11.5px;color:var(--accent);font-weight:600')}>Leaderboard →</div>
      </div>
      <SquadRail squad={vm.squad} onOpen={openAthlete} />

      {/* team feed — last 7 days of squad activity, with route maps + photos */}
      <div style={s('display:flex;justify-content:space-between;align-items:baseline;margin:20px 2px 12px')}>
        <div style={s('font-size:12px;color:var(--text3);text-transform:uppercase;letter-spacing:1.4px;font-weight:600')}>Domestique Team · last 7 days</div>
        <div className="ctl" onClick={() => go('activities')} style={s('font-size:11.5px;color:var(--accent);font-weight:600')}>See all →</div>
      </div>
      {recent.length === 0 ? (
        <div style={s('padding:18px;border:1px dashed var(--line2);border-radius:16px;text-align:center;font-size:12.5px;color:var(--text3);line-height:1.5')}>No activity in the last 7 days. When the club trains, it shows up here.</div>
      ) : (
        <div style={s('display:flex;flex-direction:column;gap:12px')}>
          {recent.map((a) => (
            <FeedActivityCard key={a.id} a={a} onOpen={openActivity} onAthlete={openAthlete} token={token} getToken={getToken} />
          ))}
        </div>
      )}
    </div>
  );
}

function DashboardHE({ vm, go, openAthlete, openActivity, getToken, onSwitchSquad, notifUnread = 0 }) {
  const token = getToken?.() ?? null;
  const recent = last7Days(vm.activities);
  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .4s ease;text-align:right')}>
      {vm.squadBanner && <AuthedImage url={vm.squadBanner} token={token} style="height:88px;border-radius:16px;margin-bottom:14px" />}
      <div style={s('display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-direction:row-reverse')}>
        <div style={s('display:flex;align-items:center;gap:11px;flex-direction:row-reverse;min-width:0')}>
          {vm.squadLogo && <AuthedImage url={vm.squadLogo} token={token} style="width:40px;height:40px;border-radius:12px;flex:none" />}
          <ClubSwitcher vm={vm} token={token} rtl onSwitch={onSwitchSquad}>
            <div style={s('min-width:0;text-align:right')}>
              <div style={s('font-size:11px;color:var(--text3);letter-spacing:.5px;font-weight:600')}>המועדון</div>
              <div style={s('font-size:23px;font-weight:700;letter-spacing:-.3px;line-height:1.05;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{vm.squadName || 'המועדון שלך'}</div>
            </div>
          </ClubSwitcher>
        </div>
        <div style={s('display:flex;align-items:center;gap:10px;flex-direction:row-reverse')}>
          <div className="ctl" onClick={() => go('notifs')} style={s('width:38px;height:38px;border-radius:12px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;position:relative')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
            {notifUnread > 0 && <div style={s('position:absolute;top:8px;right:9px;width:7px;height:7px;border-radius:50%;background:var(--accent);border:1.5px solid var(--bg2)')} />}
          </div>
          <div className="ctl" onClick={() => go('profile')}><Avatar photo={vm.me.photo} initials={vm.me.initials} color={vm.me.color} size={38} radius={12} fontSize={14} /></div>
        </div>
      </div>

      {(() => {
        const todayWk = vm.plan.find((p) => p.status === 'today');
        return (
          <>
            <div style={s('font-size:12px;color:var(--text3);letter-spacing:.5px;font-weight:600;margin:4px 2px 10px')}>היום · {vm.todayLabelHe}</div>
            {todayWk ? (
              <div style={s('background:linear-gradient(160deg,var(--bg3),var(--bg2));border:1px solid var(--line);border-radius:22px;overflow:hidden')}>
                <div style={s(`height:4px;background:${todayWk.color}`)} />
                <div style={s('padding:17px 18px 18px')}>
                  <div style={s('display:flex;justify-content:space-between;align-items:flex-start;flex-direction:row-reverse')}>
                    <div style={s('display:flex;gap:12px;align-items:center;flex-direction:row-reverse')}>
                      <div style={s(`width:46px;height:46px;border-radius:14px;background:color-mix(in srgb,${todayWk.color} 18%, transparent);color:${todayWk.color};display:flex;align-items:center;justify-content:center`)} dangerouslySetInnerHTML={html(todayWk.iconHtml)} />
                      <div style={s('text-align:right')}>
                        <div style={s('font-size:19px;font-weight:700')}>{todayWk.title}</div>
                        {todayWk.sub && <div style={s('font-size:13px;color:var(--text2)')}>{todayWk.sub}</div>}
                      </div>
                    </div>
                    <div style={s('background:var(--accent);color:var(--accent-ink);font-size:10px;font-weight:700;padding:4px 8px;border-radius:7px')}>היום</div>
                  </div>
                  <div style={s('display:flex;margin-top:16px;border-top:1px solid var(--line);padding-top:14px;flex-direction:row-reverse;text-align:right')}>
                    <div style={s('flex:1')}><div className="mono" style={s('font-size:20px;font-weight:700')}>{todayWk.dur}</div><div style={s('font-size:10px;color:var(--text3);margin-top:2px')}>משך</div></div>
                    <div style={s('flex:1;border-right:1px solid var(--line);padding-right:14px')}><div className="mono" style={s('font-size:20px;font-weight:700;color:var(--accent)')}>{todayWk.load}</div><div style={s('font-size:10px;color:var(--text3);margin-top:2px')}>עומס</div></div>
                  </div>
                  <div className="ctl" onClick={() => go('ride')} style={s('background:var(--accent);color:var(--accent-ink);text-align:center;padding:13px;border-radius:13px;font-weight:700;font-size:14px;margin-top:14px')}>התחל אימון</div>
                </div>
              </div>
            ) : (
              <div className="ctl" onClick={() => go('plan')} style={s('background:var(--bg2);border:1px dashed var(--line2);border-radius:20px;padding:22px 18px;text-align:center')}>
                <div style={s('font-size:15px;font-weight:600')}>אין אימון מתוכנן להיום</div>
                <div style={s('font-size:12.5px;color:var(--text3);margin-top:5px;line-height:1.5')}>התוכנית השבועית של המאמן תופיע כאן. הקש כדי לפתוח.</div>
              </div>
            )}
          </>
        );
      })()}

      <div style={s('display:flex;justify-content:space-between;align-items:baseline;margin:22px 2px 12px;flex-direction:row-reverse')}>
        <div style={s('font-size:12px;color:var(--text3);font-weight:600')}>המועדון השבוע</div>
        <div className="ctl" onClick={() => go('lb')} style={s('font-size:11.5px;color:var(--accent);font-weight:600')}>← טבלה</div>
      </div>
      <SquadRail squad={vm.squad} rtl onOpen={openAthlete} />

      <div style={s('display:flex;justify-content:space-between;align-items:baseline;margin:20px 2px 12px;flex-direction:row-reverse')}>
        <div style={s('font-size:12px;color:var(--text3);font-weight:600')}>פעילות המועדון · 7 ימים אחרונים</div>
        <div className="ctl" onClick={() => go('activities')} style={s('font-size:11.5px;color:var(--accent);font-weight:600')}>← הכל</div>
      </div>
      {recent.length === 0 ? (
        <div style={s('padding:18px;border:1px dashed var(--line2);border-radius:16px;text-align:center;font-size:12.5px;color:var(--text3);line-height:1.5')}>אין פעילות ב-7 הימים האחרונים.</div>
      ) : (
        <div style={s('display:flex;flex-direction:column;gap:12px')} dir="ltr">
          {recent.map((a) => (
            <FeedActivityCard key={a.id} a={a} onOpen={openActivity} onAthlete={openAthlete} token={token} getToken={getToken} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Dashboard({ vm, state, actions, getToken, onSwitchSquad }) {
  // Real unread count so the bell badge only shows when there's actually something to
  // read — previously the dot was hard-coded on, hence "badge but no notifications".
  const { items: notifItems } = useNotifications({ getToken, enabled: !!getToken });
  const notifUnread = notifItems.filter((n) => n.unread).length;
  return state.lang === 'he'
    ? <DashboardHE vm={vm} go={actions.go} openAthlete={actions.openAthlete} openActivity={actions.openActivity} getToken={getToken} onSwitchSquad={onSwitchSquad} notifUnread={notifUnread} />
    : <DashboardEN vm={vm} go={actions.go} openAthlete={actions.openAthlete} openActivity={actions.openActivity} getToken={getToken} onSwitchSquad={onSwitchSquad} notifUnread={notifUnread} />;
}
