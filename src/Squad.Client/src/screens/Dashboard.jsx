import { s, html } from '../lib/style.js';
import Avatar from '../components/Avatar.jsx';

const BikeIcon = ({ size = 26, stroke = 'var(--bike)' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round">
    <circle cx="5.5" cy="17.5" r="3.5" /><circle cx="18.5" cy="17.5" r="3.5" />
    <path d="M15 17.5l-3-6.5H8.5m6.5 0l-2.5 6.5M9.5 6.5h3l2 4.5" />
  </svg>
);

const Chevron = ({ stroke = 'var(--accent)', w = 18 }) => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
);

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

function DashboardEN({ vm, state, go, openAthlete, openActivity }) {
  const dashB = state.dashVar === 'b';
  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .4s ease')}>
      {/* header */}
      <div style={s('display:flex;align-items:center;justify-content:space-between;margin-bottom:18px')}>
        <div>
          <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.6px;font-weight:600')}>Domestique Team</div>
          <div style={s('font-size:23px;font-weight:700;letter-spacing:-.6px;line-height:1.05')}>{vm.squadName || 'Your squad'}</div>
        </div>
        <div style={s('display:flex;align-items:center;gap:10px')}>
          <div className="ctl" onClick={() => go('discover')} style={s('width:38px;height:38px;border-radius:12px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></svg>
          </div>
          <div className="ctl" onClick={() => go('notifs')} style={s('width:38px;height:38px;border-radius:12px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;position:relative')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
            <div style={s('position:absolute;top:8px;right:9px;width:7px;height:7px;border-radius:50%;background:var(--accent);border:1.5px solid var(--bg2)')} />
          </div>
          <div className="ctl" onClick={() => go('profile')}><Avatar photo={vm.me.photo} initials={vm.me.initials} color={vm.me.color} size={38} radius={12} fontSize={14} /></div>
        </div>
      </div>

      {/* VARIANT B: squad-first hero */}
      {dashB && (
        <div style={s('background:linear-gradient(160deg,var(--bg3),var(--bg2));border:1px solid var(--line);border-radius:22px;padding:18px;margin-bottom:14px')}>
          <div style={s('display:flex;gap:16px;align-items:center')}>
            <div style={s('position:relative;width:104px;height:104px;flex:none')}>
              <svg width="104" height="104" viewBox="0 0 104 104" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="52" cy="52" r="44" fill="none" stroke="var(--bg4)" strokeWidth="9" />
                <circle cx="52" cy="52" r="44" fill="none" stroke="var(--accent)" strokeWidth="9" strokeLinecap="round" strokeDasharray="205 276" />
              </svg>
              <div style={s('position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center')}>
                <div className="mono" style={s('font-size:30px;font-weight:700;line-height:1')}>74<span style={s('font-size:14px')}>%</span></div>
                <div style={s('font-size:8.5px;color:var(--text3);text-transform:uppercase;letter-spacing:1px')}>squad done</div>
              </div>
            </div>
            <div style={s('flex:1')}>
              <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.4px;font-weight:600')}>This week · Base block</div>
              <div style={s('font-size:19px;font-weight:700;letter-spacing:-.3px;margin-top:2px')}>Domestique Team is on pace</div>
              <div style={s('display:flex;gap:8px;margin-top:12px')}>
                <div style={s('flex:1;background:var(--bg);border:1px solid var(--line);border-radius:11px;padding:8px 9px')}><div className="mono" style={s('font-size:17px;font-weight:700;color:var(--good)')}>{vm.squadOnTrack}</div><div style={s('font-size:8.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px')}>On track</div></div>
                <div style={s('flex:1;background:var(--bg);border:1px solid var(--line);border-radius:11px;padding:8px 9px')}><div className="mono" style={s('font-size:17px;font-weight:700;color:var(--behind)')}>2</div><div style={s('font-size:8.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px')}>Behind</div></div>
                <div style={s('flex:1;background:var(--bg);border:1px solid var(--line);border-radius:11px;padding:8px 9px')}><div className="mono" style={s('font-size:17px;font-weight:700;color:var(--accent)')}>583</div><div style={s('font-size:8.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px')}>Load</div></div>
              </div>
            </div>
          </div>
          <div className="ctl" onClick={() => go('ride')} style={s('display:flex;align-items:center;gap:11px;background:var(--bg);border:1px solid color-mix(in srgb,var(--bike) 35%,transparent);border-radius:14px;padding:11px 13px;margin-top:14px')}>
            <div style={s('width:38px;height:38px;border-radius:11px;background:color-mix(in srgb,var(--bike) 18%,transparent);flex:none;display:flex;align-items:center;justify-content:center')}><BikeIcon size={22} /></div>
            <div style={s('flex:1')}><div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600')}>Today · Tue</div><div style={s('font-size:14.5px;font-weight:700')}>Bike · Threshold 3×12′</div></div>
            <div className="mono" style={s('font-size:12px;color:var(--text2)')}>1:15</div>
            <Chevron />
          </div>
        </div>
      )}

      {/* VARIANT A: today hero — driven by the real plan (empty state when none) */}
      {!dashB && (() => {
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

      {/* team feed */}
      <div style={s('display:flex;justify-content:space-between;align-items:baseline;margin:20px 2px 12px')}>
        <div style={s('font-size:12px;color:var(--text3);text-transform:uppercase;letter-spacing:1.4px;font-weight:600')}>Domestique Team activity</div>
        <div className="ctl" onClick={() => go('activities')} style={s('font-size:11.5px;color:var(--accent);font-weight:600')}>See all →</div>
      </div>
      {vm.feed.length === 0 && (
        <div style={s('padding:18px;border:1px dashed var(--line2);border-radius:16px;text-align:center;font-size:12.5px;color:var(--text3);line-height:1.5')}>No activity yet. When the club trains, it shows up here.</div>
      )}
      <div style={s('display:flex;flex-direction:column;gap:10px')}>
        {vm.feed.map((f) => (
          <div key={f.id} className="ctl" onClick={() => (f.activityId ? openActivity(f.activityId) : go('activities'))} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:13px 14px;display:flex;gap:12px;align-items:center')}>
            <div style={s(`width:40px;height:40px;border-radius:12px;background:${f.color};flex:none;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#0c0e11`)}>{f.initials}</div>
            <div style={s('flex:1;min-width:0')}>
              <div style={s('font-size:13px;line-height:1.3')}><span style={s('font-weight:600')}>{f.name}</span> <span style={s('color:var(--text2)')}>{f.action}</span></div>
              <div style={s('display:flex;gap:10px;margin-top:4px;align-items:center')}>
                <span className="mono" style={s('font-size:11px;color:var(--text)')}>{f.metric}</span>
                <span style={s('font-size:11px;color:var(--text3)')}>{f.time}</span>
                <span style={s('font-size:11px;color:var(--text3)')}>· ♥ {f.reacts}</span>
              </div>
            </div>
            <div style={s(`width:30px;height:30px;border-radius:8px;background:color-mix(in srgb,${f.discColor} 16%, transparent);flex:none;display:flex;align-items:center;justify-content:center;font-size:14px`)}>{f.icon}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardHE({ vm, go, openAthlete, openActivity }) {
  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .4s ease;text-align:right')}>
      <div style={s('display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-direction:row-reverse')}>
        <div>
          <div style={s('font-size:11px;color:var(--text3);letter-spacing:.5px;font-weight:600')}>המועדון</div>
          <div style={s('font-size:23px;font-weight:700;letter-spacing:-.3px;line-height:1.05')}>{vm.squadName || 'המועדון שלך'}</div>
        </div>
        <div style={s('display:flex;align-items:center;gap:10px;flex-direction:row-reverse')}>
          <div className="ctl" onClick={() => go('notifs')} style={s('width:38px;height:38px;border-radius:12px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;position:relative')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
            <div style={s('position:absolute;top:8px;right:9px;width:7px;height:7px;border-radius:50%;background:var(--accent);border:1.5px solid var(--bg2)')} />
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

      <div style={s('font-size:12px;color:var(--text3);font-weight:600;margin:20px 2px 12px')}>פעילות המועדון</div>
      {vm.feed.length === 0 && (
        <div style={s('padding:18px;border:1px dashed var(--line2);border-radius:16px;text-align:center;font-size:12.5px;color:var(--text3);line-height:1.5')}>אין עדיין פעילות.</div>
      )}
      <div style={s('display:flex;flex-direction:column;gap:10px')}>
        {vm.feed.map((f) => (
          <div key={f.id} className="ctl" onClick={() => (f.activityId ? openActivity(f.activityId) : go('activities'))} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:13px 14px;display:flex;gap:12px;align-items:center;flex-direction:row-reverse;text-align:right')}>
            <div style={s(`width:40px;height:40px;border-radius:12px;background:${f.color};flex:none;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#0c0e11`)}>{f.he}</div>
            <div style={s('flex:1;min-width:0')}>
              <div style={s('font-size:13px;line-height:1.3')}><span style={s('font-weight:600')}>{f.nameHe}</span> <span style={s('color:var(--text2)')}>{f.actionHe}</span></div>
              <div style={s('display:flex;gap:10px;margin-top:4px;align-items:center;flex-direction:row-reverse')}><span className="mono" style={s('font-size:11px')} dir="ltr">{f.metric}</span><span style={s('font-size:11px;color:var(--text3)')}>{f.timeHe}</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard({ vm, state, actions }) {
  return state.lang === 'he'
    ? <DashboardHE vm={vm} go={actions.go} openAthlete={actions.openAthlete} openActivity={actions.openActivity} />
    : <DashboardEN vm={vm} state={state} go={actions.go} openAthlete={actions.openAthlete} openActivity={actions.openActivity} />;
}
