import { useEffect, useState } from 'react';
import { s, html } from '../lib/style.js';
import Avatar from '../components/Avatar.jsx';
import AuthedAvatar from '../components/AuthedAvatar.jsx';
import AuthedImage from '../components/AuthedImage.jsx';
import SportIcon from '../components/SportIcon.jsx';
import FeedActivityCard from '../components/FeedActivityCard.jsx';
import { useNotifications } from '../hooks/useNotifications.js';
import { mapRow } from '../hooks/usePlan.js';
import { discIcon } from '../data/squadData.js';
import { listSquadEvents } from '../lib/events.js';

// Monday (week start, matching the plan's week convention) `weekOffset` weeks from today,
// as a 'yyyy-MM-dd' string for the /api/plan?weekStart= query.
function mondayISO(weekOffset = 0) {
  const n = new Date();
  const mon = new Date(n.getFullYear(), n.getMonth(), n.getDate() - ((n.getDay() + 6) % 7) + weekOffset * 7);
  return `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;
}

// Is an event's start on the local calendar-today?
function eventIsToday(iso) {
  const d = new Date(iso); const n = new Date();
  return !Number.isNaN(d.getTime())
    && d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

// The "today" hero for a motorsport club: a group ride scheduled for today (from the club's
// events), mirroring the endurance plan card so a coach's just-added ride actually shows here.
function TodayEventCard({ ev, onOpen, token, rtl = false, label = null }) {
  const d = new Date(ev.start);
  const time = Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString(rtl ? 'he-IL' : 'en-US', { hour: 'numeric', minute: '2-digit' });
  const sub = [time, ev.courseName, ev.courseKm ? `${ev.courseKm.toFixed(1)} km` : null].filter(Boolean).join(' · ');
  const going = ev.joinCount || 0;
  return (
    <div className="ctl" onClick={() => onOpen?.(ev)} style={s('background:linear-gradient(160deg,var(--bg3),var(--bg2));border:1px solid var(--line);border-radius:22px;overflow:hidden')}>
      {ev.bannerUrl
        ? <div style={s('height:96px;overflow:hidden')}><AuthedImage url={ev.bannerUrl} token={token} style="width:100%;height:100%;object-fit:cover" /></div>
        : <div style={s('height:4px;background:var(--accent)')} />}
      <div style={s(`padding:17px 18px 18px;${rtl ? 'text-align:right' : ''}`)}>
        <div style={s(`display:flex;justify-content:space-between;align-items:flex-start;${rtl ? 'flex-direction:row-reverse' : ''}`)}>
          <div style={s(`display:flex;gap:12px;align-items:center;${rtl ? 'flex-direction:row-reverse' : ''}`)}>
            <div style={s('width:46px;height:46px;border-radius:14px;background:var(--accent-dim);display:flex;align-items:center;justify-content:center;flex:none;overflow:hidden')}>
              {ev.logoUrl
                ? <AuthedImage url={ev.logoUrl} token={token} style="width:100%;height:100%;object-fit:cover" />
                : <SportIcon name="moto" size={24} color="var(--accent)" />}
            </div>
            <div>
              <div style={s('font-size:19px;font-weight:700;letter-spacing:-.4px')}>{ev.title}</div>
              {sub && <div style={s('font-size:13px;color:var(--text2)')}>{sub}</div>}
            </div>
          </div>
          <div style={s('background:var(--accent);color:var(--accent-ink);font-size:10px;font-weight:700;padding:4px 8px;border-radius:7px;text-transform:uppercase;letter-spacing:.5px;flex:none')}>{label ?? (rtl ? 'היום' : 'Today')}</div>
        </div>
        <div style={s('display:flex;margin-top:14px')}>
          <div className="ctl" style={s('flex:1;background:var(--accent);color:var(--accent-ink);text-align:center;padding:13px;border-radius:13px;font-weight:700;font-size:14px')}>
            {rtl ? (going ? `${going} רשומים · צפה` : 'צפה באירוע') : (going ? `${going} going · View` : 'View ride')}
          </div>
        </div>
      </div>
    </div>
  );
}

// Local 'yyyy-MM-dd' for today (matches plan-row `iso`, which is a plain date string).
function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}
// 'yyyy-MM-dd' → local Date (constructing from parts avoids the UTC-midnight day shift).
function localDate(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  return (y && m && d) ? new Date(y, m - 1, d) : new Date(iso);
}
// Short weekday + day for the "Up next" badge (day disambiguates next-week items), localised.
function heroDayLabel(d, rtl) {
  try { return d.toLocaleDateString(rtl ? 'he-IL' : 'en-US', { weekday: 'short', day: 'numeric' }); }
  catch { return ''; }
}
// The next real training session after today from the current week's plan (skips
// rest days and anything already done). Plan is this-week-only, so this looks ahead
// to the end of the week — beyond that we fall back to events / the empty state.
function nextPlannedSession(plan) {
  const t = todayISO();
  return (plan || [])
    .filter((p) => p.iso && p.iso > t && p.status !== 'rest' && p.status !== 'done')
    .sort((a, b) => (a.iso < b.iso ? -1 : 1))[0] || null;
}
// Decide the "today" hero: today's session, else today's event, else whichever of the
// next planned session / next scheduled event comes first. null → nothing upcoming.
function pickHero(vm, todayEvent, upcomingEvent, nextWeekSession) {
  const plan = vm.plan || [];
  const todayWk = plan.find((p) => p.status === 'today') || null;
  if (todayWk) return { kind: 'session', item: todayWk, isToday: true };
  if (todayEvent) return { kind: 'event', item: todayEvent, isToday: true };
  const cands = [];
  // This week's next session, or (nothing left this week) the first of next week's plan.
  const upWk = nextPlannedSession(plan) || nextWeekSession || null;
  if (upWk) cands.push({ kind: 'session', item: upWk, ts: localDate(upWk.iso).getTime() });
  if (upcomingEvent) cands.push({ kind: 'event', item: upcomingEvent, ts: new Date(upcomingEvent.start).getTime() });
  cands.sort((a, b) => a.ts - b.ts);
  return cands[0] ? { kind: cands[0].kind, item: cands[0].item, isToday: false } : null;
}

// The planned-session hero card. Reused for today (Start session + open-plan) and for an
// upcoming session (single "View plan" CTA), in both LTR and RTL.
function PlanHero({ wk, label, isToday, go, rtl }) {
  const L = rtl
    ? { dur: 'משך', load: 'עומס', start: 'התחל אימון', view: 'צפה בתוכנית' }
    : { dur: 'Duration', load: 'Load', start: 'Start session', view: 'View plan' };
  return (
    <div style={s(`background:linear-gradient(160deg,var(--bg3),var(--bg2));border:1px solid var(--line);border-radius:22px;overflow:hidden;position:relative${rtl ? ';text-align:right' : ''}`)}>
      <div style={s(`height:4px;background:${wk.color}`)} />
      <div style={s('padding:17px 18px 18px')}>
        <div style={s(`display:flex;justify-content:space-between;align-items:flex-start${rtl ? ';flex-direction:row-reverse' : ''}`)}>
          <div style={s(`display:flex;gap:12px;align-items:center${rtl ? ';flex-direction:row-reverse' : ''}`)}>
            <div style={s(`width:46px;height:46px;border-radius:14px;background:color-mix(in srgb,${wk.color} 18%, transparent);color:${wk.color};display:flex;align-items:center;justify-content:center;flex:none`)} dangerouslySetInnerHTML={html(wk.iconHtml)} />
            <div>
              <div style={s('font-size:19px;font-weight:700;letter-spacing:-.4px')}>{wk.title}</div>
              {wk.sub && <div style={s('font-size:13px;color:var(--text2)')}>{wk.sub}</div>}
            </div>
          </div>
          <div style={s('background:var(--accent);color:var(--accent-ink);font-size:10px;font-weight:700;padding:4px 8px;border-radius:7px;text-transform:uppercase;letter-spacing:.5px;flex:none')}>{label}</div>
        </div>
        <div style={s(`display:flex;margin-top:16px;border-top:1px solid var(--line);padding-top:14px${rtl ? ';flex-direction:row-reverse;text-align:right' : ''}`)}>
          <div style={s('flex:1')}><div className="mono" style={s('font-size:20px;font-weight:700')}>{wk.dur}</div><div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;margin-top:2px')}>{L.dur}</div></div>
          <div style={s(`flex:1;${rtl ? 'border-right:1px solid var(--line);padding-right:14px' : 'border-left:1px solid var(--line);padding-left:14px'}`)}><div className="mono" style={s('font-size:20px;font-weight:700;color:var(--accent)')}>{wk.load}</div><div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;margin-top:2px')}>{L.load}</div></div>
        </div>
        {isToday ? (
          <div style={s(`display:flex;gap:9px;margin-top:14px${rtl ? ';flex-direction:row-reverse' : ''}`)}>
            <div className="ctl" onClick={() => go('ride')} style={s('flex:1;background:var(--accent);color:var(--accent-ink);text-align:center;padding:13px;border-radius:13px;font-weight:700;font-size:14px')}>{L.start}</div>
            <div className="ctl" onClick={() => go('plan')} style={s('width:52px;background:var(--bg4);border:1px solid var(--line);border-radius:13px;display:flex;align-items:center;justify-content:center')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" style={rtl ? { transform: 'scaleX(-1)' } : undefined}><path d="M9 6l6 6-6 6" /></svg>
            </div>
          </div>
        ) : (
          <div className="ctl" onClick={() => go('plan')} style={s('background:var(--accent);color:var(--accent-ink);text-align:center;padding:13px;border-radius:13px;font-weight:700;font-size:14px;margin-top:14px')}>{L.view}</div>
        )}
      </div>
    </div>
  );
}

// Empty state when there's nothing today *and* nothing upcoming.
function EmptyHero({ family, go, rtl }) {
  const moto = family === 'motorsport';
  const copy = moto
    ? (rtl
      ? { t: 'אין רכיבות מתוזמנות', s: 'הרכיבות הקבוצתיות של המועדון יופיעו כאן. הקש לצפייה באירועים.', to: 'events' }
      : { t: 'No rides scheduled', s: "Your club's group rides show up here. Tap to see upcoming events.", to: 'events' })
    : (rtl
      ? { t: 'אין אימונים מתוכננים', s: 'התוכנית השבועית של המאמן תופיע כאן. הקש כדי לפתוח.', to: 'plan' }
      : { t: 'No sessions planned', s: "Your coach's weekly plan shows up here. Tap to open your plan.", to: 'plan' });
  return (
    <div className="ctl" onClick={() => go(copy.to)} style={s('background:var(--bg2);border:1px dashed var(--line2);border-radius:20px;padding:22px 18px;text-align:center')}>
      <div style={s('font-size:15px;font-weight:600')}>{copy.t}</div>
      <div style={s('font-size:12.5px;color:var(--text3);margin-top:5px;line-height:1.5')}>{copy.s}</div>
    </div>
  );
}

// The home "today" hero: eyebrow + the chosen session/event card (or empty state).
function TodayHero({ vm, go, openEvent, token, rtl, todayEvent, upcomingEvent, nextWeekSession }) {
  const hero = pickHero(vm, todayEvent, upcomingEvent, nextWeekSession);
  const upNext = hero && !hero.isToday;
  const eyebrow = upNext
    ? (rtl ? 'הבא בתור' : 'Up next')
    : (rtl ? `היום · ${vm.todayLabelHe}` : `Today · ${vm.todayLabel}`);
  const label = hero
    ? (hero.isToday
      ? (rtl ? 'היום' : 'Today')
      : heroDayLabel(hero.kind === 'session' ? localDate(hero.item.iso) : new Date(hero.item.start), rtl))
    : null;
  return (
    <>
      <div style={s(`font-size:12px;color:var(--text3);font-weight:600;margin:4px 2px 10px;${rtl ? 'letter-spacing:.5px' : 'text-transform:uppercase;letter-spacing:1.4px'}`)}>{eyebrow}</div>
      {!hero ? (
        <EmptyHero family={vm.family} go={go} rtl={rtl} />
      ) : hero.kind === 'session' ? (
        <PlanHero wk={hero.item} label={label} isToday={hero.isToday} go={go} rtl={rtl} />
      ) : (
        <TodayEventCard ev={hero.item} onOpen={openEvent} token={token} rtl={rtl} label={label} />
      )}
    </>
  );
}

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

function SquadRail({ squad, rtl, onOpen, token }) {
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
        <div
          key={m.id}
          className="ctl"
          onClick={() => onOpen?.(m.id)}
          style={s(`position:relative;flex:none;width:82px;background:var(--bg2);border:1px solid ${m.you ? 'color-mix(in srgb,var(--accent) 34%,transparent)' : 'var(--line)'};border-radius:17px;padding:13px 8px;text-align:center`)}
        >
          {m.medalColor && (
            <div className="mono" style={s(`position:absolute;top:8px;${rtl ? 'right:9px' : 'left:9px'};font-size:10px;font-weight:700;color:${m.medalColor}`)}>#{m.rank}</div>
          )}
          <div style={s('position:relative;width:52px;height:52px;margin:0 auto')}>
            <svg width="52" height="52" viewBox="0 0 52 52" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="26" cy="26" r="22" fill="none" stroke="var(--bg4)" strokeWidth="4" />
              <circle cx="26" cy="26" r="22" fill="none" stroke={m.ringColor} strokeWidth="4" strokeLinecap="round" strokeDasharray={m.dash} />
            </svg>
            <div style={s('position:absolute;inset:5px')}>
              <AuthedAvatar avatarUrl={m.avatarUrl} token={token} initials={rtl ? m.he : m.initials} color={m.color} size={42} radius={21} fontSize={rtl ? 13 : 14} />
            </div>
          </div>
          <div style={s('font-size:11.5px;font-weight:600;margin-top:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{rtl ? m.nameHe : m.name}</div>
          <div className="mono" style={s(`font-size:11px;font-weight:700;margin-top:1px;color:${m.you ? 'var(--accent)' : 'var(--text3)'}`)}>{m.pctLabel}</div>
        </div>
      ))}
    </div>
  );
}

function DashboardEN({ vm, go, openAthlete, openActivity, openEvent, getToken, onSwitchSquad, notifUnread = 0, todayEvent = null, upcomingEvent = null, nextWeekSession = null }) {
  const token = getToken?.() ?? null;
  const recent = last7Days(vm.activities);
  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .4s ease')}>
      {/* today hero — today's session/event, else the earliest upcoming one, else empty */}
      <TodayHero vm={vm} go={go} openEvent={openEvent} token={token} rtl={false} todayEvent={todayEvent} upcomingEvent={upcomingEvent} nextWeekSession={nextWeekSession} />

      {/* squad status */}
      <div style={s('display:flex;justify-content:space-between;align-items:baseline;margin:22px 2px 12px')}>
        <div style={s('font-size:12px;color:var(--text3);text-transform:uppercase;letter-spacing:1.4px;font-weight:600')}>Domestique Hub this week</div>
        <div className="ctl" onClick={() => go('lb')} style={s('font-size:11.5px;color:var(--accent);font-weight:600')}>Leaderboard →</div>
      </div>
      <SquadRail squad={vm.squad} onOpen={openAthlete} token={token} />

      {/* team feed — last 7 days of squad activity, with route maps + photos */}
      <div style={s('display:flex;justify-content:space-between;align-items:baseline;margin:20px 2px 12px')}>
        <div style={s('font-size:12px;color:var(--text3);text-transform:uppercase;letter-spacing:1.4px;font-weight:600')}>Domestique Hub · last 7 days</div>
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

function DashboardHE({ vm, go, openAthlete, openActivity, openEvent, getToken, onSwitchSquad, notifUnread = 0, todayEvent = null, upcomingEvent = null, nextWeekSession = null }) {
  const token = getToken?.() ?? null;
  const recent = last7Days(vm.activities);
  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .4s ease;text-align:right')}>
      {/* today hero — today's session/event, else the earliest upcoming one, else empty */}
      <TodayHero vm={vm} go={go} openEvent={openEvent} token={token} rtl todayEvent={todayEvent} upcomingEvent={upcomingEvent} nextWeekSession={nextWeekSession} />

      <div style={s('display:flex;justify-content:space-between;align-items:baseline;margin:22px 2px 12px;flex-direction:row-reverse')}>
        <div style={s('font-size:12px;color:var(--text3);font-weight:600')}>המועדון השבוע</div>
        <div className="ctl" onClick={() => go('lb')} style={s('font-size:11.5px;color:var(--accent);font-weight:600')}>← טבלה</div>
      </div>
      <SquadRail squad={vm.squad} rtl onOpen={openAthlete} token={token} />

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

  // The "today" hero surfaces the club's group rides alongside the training plan — so
  // fetch the active club's events and keep the earliest one that hasn't happened yet
  // (today or later). `todayEvent` is that one when it falls on today; the hero shows it
  // (or the next planned session) and falls back to the soonest upcoming when nothing's on today.
  const [upcomingEvent, setUpcomingEvent] = useState(null);
  useEffect(() => {
    let ok = true;
    const squadId = vm.activeClubId;
    if (!squadId || !getToken) { setUpcomingEvent(null); return undefined; }
    (async () => {
      try {
        const t = await getToken();
        const evs = await listSquadEvents(t, squadId);
        const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
        const up = (evs || [])
          .filter((e) => { const ts = new Date(e.start).getTime(); return !Number.isNaN(ts) && ts >= startOfToday.getTime(); })
          .sort((a, b) => new Date(a.start) - new Date(b.start))[0] || null;
        if (ok) setUpcomingEvent(up);
      } catch { if (ok) setUpcomingEvent(null); }
    })();
    return () => { ok = false; };
  }, [vm.activeClubId, getToken]);

  const todayEvent = upcomingEvent && eventIsToday(upcomingEvent.start) ? upcomingEvent : null;

  // The plan the hero reads is this-week-only. When there's nothing left to train this
  // week (no session today, none still ahead), look ahead to next week's plan and surface
  // its first real session so the hero keeps pointing at what's coming. Only fetched in
  // that gap — a plan session today or later this week makes the extra call unnecessary.
  const hasSessionThisWeekAhead = (vm.plan || []).some((p) => p.status === 'today') || !!nextPlannedSession(vm.plan);
  const [nextWeekSession, setNextWeekSession] = useState(null);
  useEffect(() => {
    let ok = true;
    const squadId = vm.activeClubId;
    if (!getToken || !squadId || hasSessionThisWeekAhead) { setNextWeekSession(null); return undefined; }
    (async () => {
      try {
        const t = await getToken();
        const res = await fetch(`/api/plan?weekStart=${encodeURIComponent(mondayISO(1))}`, {
          headers: t ? { Authorization: `Bearer ${t}` } : undefined,
        });
        if (!res.ok) { if (ok) setNextWeekSession(null); return; }
        const data = await res.json();
        const rows = (data.week || []).map((r) => { const m = mapRow(r); return { ...m, iconHtml: discIcon(m.disc) }; });
        // These rows are all in a future week, so nextPlannedSession's "after today" holds.
        if (ok) setNextWeekSession(nextPlannedSession(rows));
      } catch { if (ok) setNextWeekSession(null); }
    })();
    return () => { ok = false; };
  }, [vm.activeClubId, getToken, hasSessionThisWeekAhead]);

  return state.lang === 'he'
    ? <DashboardHE vm={vm} go={actions.go} openAthlete={actions.openAthlete} openActivity={actions.openActivity} openEvent={actions.openEvent} getToken={getToken} onSwitchSquad={onSwitchSquad} notifUnread={notifUnread} todayEvent={todayEvent} upcomingEvent={upcomingEvent} nextWeekSession={nextWeekSession} />
    : <DashboardEN vm={vm} go={actions.go} openAthlete={actions.openAthlete} openActivity={actions.openActivity} openEvent={actions.openEvent} getToken={getToken} onSwitchSquad={onSwitchSquad} notifUnread={notifUnread} todayEvent={todayEvent} upcomingEvent={upcomingEvent} nextWeekSession={nextWeekSession} />;
}
