import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { s, html } from '../lib/style.js';
import EmptyState from '../components/EmptyState.jsx';
import AuthedImage from '../components/AuthedImage.jsx';
import AuthedAvatar from '../components/AuthedAvatar.jsx';
import TileMap from '../components/TileMap.jsx';
import { toPathD } from '../lib/tiles.js';
import {
  listSquadEvents, deleteSquadEvent, publishEvent, unpublishEvent, listEventAttendees,
  listEventParticipants, getEventRoute,
  joinEvent, leaveEvent, checkInEvent, undoCheckInEvent,
} from '../lib/events.js';

// The motorsport clubs' second tab (replaces Plan). Motorsport clubs run on scheduled
// group rides rather than a training plan, so this shows the active club's sessions three ways:
//   • Upcoming → the flagship browse view: future sessions grouped by time bucket (This week /
//     Later this month / by month), rich cards with a route-map preview, RSVP and who's going.
//   • Week     → a manager-friendly single-week list (coach: add/edit/publish/delete + roster).
//   • Month    → a heatmap calendar + this-month list.
// Members RSVP (join) and, on the day, check in; the coach (squad owner) manages the schedule.

const SPORTS = {
  0: { label: 'Session', color: 'var(--accent)', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
  1: { label: 'Swim', color: 'var(--swim)', icon: '<path d="M2 16c1.5 0 1.5 1.5 3 1.5S8.5 16 10 16s1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5"/><path d="M2 20c1.5 0 1.5 1.5 3 1.5S8.5 20 10 20s1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5"/><circle cx="15" cy="6" r="2"/><path d="M6 13l5-4 3 2 3-3"/>' },
  2: { label: 'Ride', color: 'var(--bike)', icon: '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 17.5l-3-6.5H8.5m6.5 0l-2.5 6.5M9.5 6.5h3l2 4.5"/>' },
  3: { label: 'Run', color: 'var(--run)', icon: '<circle cx="14" cy="5" r="2"/><path d="M11 21l1.5-5-2.5-2 1-5 3 2 2 1M8 12l1-4 3-1"/>' },
};
const sportMeta = (n) => SPORTS[n] || SPORTS[0];

// ── date helpers (weeks start Monday, matching the Plan month grid) ──────────────
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const startOfWeek = (d) => { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const startOfMonth = (d) => { const x = startOfDay(d); x.setDate(1); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d, n) => { const x = new Date(d); x.setDate(1); x.setMonth(x.getMonth() + n); return x; };
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const fmtWhen = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
};
const fmtTime = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};
const fmtDay = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const monthName = (d) => d.toLocaleDateString('en-US', { month: 'long' });
const isTodayIso = (iso) => { const d = new Date(iso); return !Number.isNaN(d.getTime()) && sameDay(d, new Date()); };

// Turn-by-turn links to a [lat,lon] start point, one per navigation app. The rider picks
// which app to open from the Directions action sheet; each is a universal/https link so the
// OS hands it to the installed app (Waze / Google Maps / Apple Maps) or the web fallback.
const navApps = (lat, lon) => [
  { key: 'waze', label: 'Waze', color: '#33ccff', url: `https://waze.com/ul?ll=${lat}%2C${lon}&navigate=yes` },
  { key: 'gmaps', label: 'Google Maps', color: '#34a853', url: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}` },
  { key: 'amaps', label: 'Apple Maps', color: '#5a86ff', url: `https://maps.apple.com/?daddr=${lat},${lon}&dirflg=d` },
];

const SportIcon = ({ sport, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={html(sportMeta(sport).icon)} />
);

const seg = (active) =>
  active
    ? 'flex:1;text-align:center;padding:9px 6px;border-radius:11px;font-size:12.5px;font-weight:700;background:var(--accent);color:var(--accent-ink)'
    : 'flex:1;text-align:center;padding:9px 6px;border-radius:11px;font-size:12.5px;font-weight:700;color:var(--text2)';

const dowLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function Events({ vm, actions, getToken, meId, onDataChanged }) {
  const squadId = vm.activeClubId;
  const owner = vm.activeSquad?.owner;
  const isOwner = !!meId && !!owner && String(meId).toLowerCase() === String(owner).toLowerCase();

  const [view, setView] = useState('upcoming');    // 'upcoming' | 'week' | 'month'
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [items, setItems] = useState(null);        // null = loading
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  // upcoming-view enrichment: per-event route points + participant faces (real data, lazy).
  const [routes, setRoutes] = useState({});         // eventId → [[lat,lon],…] | null
  const [faces, setFaces] = useState({});           // eventId → participants[] | null
  // coach-only per-event UI state
  const [openId, setOpenId] = useState(null);       // event whose roster is expanded
  const [rosters, setRosters] = useState({});       // eventId → attendees[] (null = loading)
  const [confirmId, setConfirmId] = useState(null); // event pending delete-confirmation
  const [dirTarget, setDirTarget] = useState(null); // { lat, lon, title } → Directions action sheet

  const load = useCallback(async () => {
    if (!squadId) { setItems([]); return; }
    try { const t = await getToken?.(); setItems(await listSquadEvents(t, squadId)); }
    catch { setItems([]); }
  }, [squadId, getToken]);
  useEffect(() => { load(); }, [load]);

  const patch = (id, fields) => setItems((xs) => (xs || []).map((x) => (x.id === id ? { ...x, ...fields } : x)));

  // ── upcoming: future events (today onward), soonest first ───────────────────────
  const upcoming = useMemo(() => {
    const from = startOfDay(new Date());
    return (items || [])
      .filter((e) => { const d = new Date(e.start); return !Number.isNaN(d.getTime()) && d >= from; })
      .sort((a, b) => new Date(a.start) - new Date(b.start));
  }, [items]);

  // Bucket the upcoming events: This week · Later this <month> · then one group per later month.
  const upcomingGroups = useMemo(() => {
    const now = startOfDay(new Date());
    const weekEnd = addDays(startOfWeek(now), 7);
    const monthEnd = addMonths(startOfMonth(now), 1);
    const buckets = new Map();          // key → { order, label, events[] }
    const push = (key, order, label, e) => {
      if (!buckets.has(key)) buckets.set(key, { order, label, events: [] });
      buckets.get(key).events.push(e);
    };
    upcoming.forEach((e) => {
      const d = new Date(e.start);
      if (d < weekEnd) push('week', 0, 'This week', e);
      else if (d < monthEnd) push('month', 1, `Later in ${monthName(now)}`, e);
      else {
        const mk = `${d.getFullYear()}-${d.getMonth()}`;
        const label = d.getFullYear() === now.getFullYear() ? monthName(d) : `${monthName(d)} ${d.getFullYear()}`;
        push(mk, 100 + d.getFullYear() * 12 + d.getMonth(), label, e);
      }
    });
    return [...buckets.values()]
      .sort((a, b) => a.order - b.order)
      .map((g) => ({ ...g, count: `${g.events.length} event${g.events.length === 1 ? '' : 's'}` }));
  }, [upcoming]);

  // Lazily fetch each upcoming event's route (for the map preview + directions) and its
  // participants (for the "who's going" faces) — real data only, fetched once per event.
  const fetchFaces = useCallback(async (ev) => {
    setFaces((f) => (f[ev.id] === undefined ? { ...f, [ev.id]: null } : f));
    try { const t = await getToken?.(); const p = await listEventParticipants(t, squadId, ev.id); setFaces((f) => ({ ...f, [ev.id]: p || [] })); }
    catch { setFaces((f) => ({ ...f, [ev.id]: [] })); }
  }, [getToken, squadId]);

  const seen = useRef(new Set());
  useEffect(() => {
    if (view !== 'upcoming' || !squadId) return;
    upcoming.forEach((ev) => {
      if (seen.current.has(ev.id)) return;
      seen.current.add(ev.id);
      // faces: only worth a call when someone has joined
      if ((ev.joinCount || 0) > 0) fetchFaces(ev);
      else setFaces((f) => ({ ...f, [ev.id]: [] }));
      // route: only events that carry a course have one to draw
      if (ev.courseId || ev.courseName || ev.courseKm) {
        setRoutes((r) => ({ ...r, [ev.id]: r[ev.id] ?? null }));
        (async () => {
          try { const t = await getToken?.(); const rt = await getEventRoute(t, squadId, ev.id); setRoutes((r) => ({ ...r, [ev.id]: rt?.points?.length ? rt.points : null })); }
          catch { setRoutes((r) => ({ ...r, [ev.id]: null })); }
        })();
      }
    });
  }, [view, squadId, upcoming, getToken, fetchFaces]);

  // ── the current period's window + label (Week / Month views) ─────────────────────
  const week = view === 'week';
  const weekStart = useMemo(() => startOfWeek(anchor), [anchor]);
  const nav = useMemo(() => {
    const now = new Date();
    if (week) {
      const isCurrent = sameDay(weekStart, startOfWeek(now));
      return { label: `${fmtDay(weekStart)} – ${fmtDay(addDays(weekStart, 6))}`, isCurrent };
    }
    const isCurrent = anchor.getFullYear() === now.getFullYear() && anchor.getMonth() === now.getMonth();
    return { label: anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), isCurrent };
  }, [week, weekStart, anchor]);

  const step = (dir) => setAnchor((a) => (week ? addDays(startOfWeek(a), dir * 7) : addMonths(a, dir)));
  const jumpToday = () => setAnchor(startOfDay(new Date()));
  // Tapping a month-grid day that has events opens that day's week.
  const openWeekOf = (day) => { setAnchor(startOfDay(day)); setView('week'); };

  // events falling inside the selected week (sorted by start)
  const weekItems = useMemo(() => {
    const end = addDays(weekStart, 7);
    return (items || [])
      .filter((e) => { const d = new Date(e.start); return d >= weekStart && d < end; })
      .sort((a, b) => new Date(a.start) - new Date(b.start));
  }, [items, weekStart]);

  // month grid: 42 Monday-first cells, each carrying that day's events
  const monthCells = useMemo(() => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const gridStart = startOfWeek(first);
    const today = new Date();
    return Array.from({ length: 42 }, (_, i) => {
      const day = addDays(gridStart, i);
      const evs = (items || []).filter((e) => sameDay(new Date(e.start), day));
      return {
        day, inMonth: day.getMonth() === anchor.getMonth(), isToday: sameDay(day, today),
        sports: [...new Set(evs.map((e) => e.sport))],
      };
    });
  }, [items, anchor]);

  // this-month list under the calendar (real events in the anchored month, soonest first)
  const monthList = useMemo(() => {
    const start = startOfMonth(anchor);
    const end = addMonths(start, 1);
    return (items || [])
      .filter((e) => { const d = new Date(e.start); return d >= start && d < end; })
      .sort((a, b) => new Date(a.start) - new Date(b.start));
  }, [items, anchor]);

  // ── member actions ─────────────────────────────────────────────────────────────
  const runMember = async (ev, fn, fields, refreshFaces) => {
    setBusyId(ev.id); setError('');
    try {
      const t = await getToken?.(); await fn(t, ev.id); patch(ev.id, fields(ev));
      if (refreshFaces) fetchFaces({ ...ev, ...fields(ev) });
    }
    catch (e) { setError(e?.message || 'Something went wrong.'); }
    finally { setBusyId(null); }
  };
  const join = (ev) => runMember(ev, joinEvent, (e) => ({ joined: true, joinCount: (e.joinCount || 0) + 1 }), true);
  const leave = (ev) => runMember(ev, leaveEvent, (e) => ({ joined: false, checkedIn: false, joinCount: Math.max(0, (e.joinCount || 1) - 1) }), true);
  const checkin = (ev) => runMember(ev, checkInEvent, (e) => ({ checkedIn: true, checkedInCount: (e.checkedInCount || 0) + 1 }));
  const undoCheckin = (ev) => runMember(ev, undoCheckInEvent, (e) => ({ checkedIn: false, checkedInCount: Math.max(0, (e.checkedInCount || 1) - 1) }));

  // ── coach actions ────────────────────────────────────────────────────────────────
  const togglePublish = async (ev) => {
    setBusyId(ev.id); setError('');
    try {
      const t = await getToken?.();
      if (ev.published) { await unpublishEvent(t, squadId, ev.id); patch(ev.id, { published: false }); }
      else { await publishEvent(t, squadId, ev.id); patch(ev.id, { published: true }); }
      onDataChanged?.();
    } catch (e) { setError(e?.message || 'Could not change publish state.'); }
    finally { setBusyId(null); }
  };
  const remove = async (ev) => {
    setBusyId(ev.id); setError('');
    try { const t = await getToken?.(); await deleteSquadEvent(t, squadId, ev.id); setItems((xs) => (xs || []).filter((x) => x.id !== ev.id)); onDataChanged?.(); setConfirmId(null); }
    catch (e) { setError(e?.message || 'Could not remove that event.'); }
    finally { setBusyId(null); }
  };
  const toggleRoster = async (ev) => {
    if (openId === ev.id) { setOpenId(null); return; }
    setOpenId(ev.id);
    if (rosters[ev.id] === undefined) {
      setRosters((r) => ({ ...r, [ev.id]: null }));
      try { const t = await getToken?.(); const a = await listEventAttendees(t, squadId, ev.id); setRosters((r) => ({ ...r, [ev.id]: a })); }
      catch { setRosters((r) => ({ ...r, [ev.id]: [] })); }
    }
  };

  const pendingEvent = confirmId ? (items || []).find((x) => x.id === confirmId) : null;
  const deleting = busyId === confirmId;
  const token = getToken?.();

  return (
    <>
      <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
        <div style={s('display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:14px')}>
          <div style={s('min-width:0')}>
            {vm.squadName && <div style={s('font-size:10.5px;color:var(--text3);text-transform:uppercase;letter-spacing:1.6px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{vm.squadName}</div>}
            <div style={s('display:flex;align-items:flex-end;gap:10px;margin-top:2px')}>
              <div style={s('font-size:26px;font-weight:700;letter-spacing:-.6px')}>Events</div>
              {items && upcoming.length > 0 && (
                <div style={s('font-size:12px;color:var(--text2);padding-bottom:5px')}>
                  <span className="mono" style={s('color:var(--accent);font-weight:700')}>{upcoming.length}</span> upcoming
                </div>
              )}
            </div>
          </div>
          {isOwner && squadId && (
            <div className="ctl" onClick={() => actions.editEvent(null)}
              style={s('flex:none;display:flex;align-items:center;gap:6px;background:var(--accent);color:var(--accent-ink);border-radius:12px;padding:9px 13px;font-size:12.5px;font-weight:700;margin-top:4px')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              Add
            </div>
          )}
        </div>

        {!squadId ? (
          <EmptyState icon="🏁" title="No club yet" sub="Join a club to see its scheduled rides and sessions here." />
        ) : (
          <>
            {/* Upcoming / Week / Month toggle */}
            <div style={s('display:flex;gap:5px;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:4px;margin-bottom:14px')}>
              <div className="ctl" onClick={() => setView('upcoming')} style={s(seg(view === 'upcoming'))}>Upcoming</div>
              <div className="ctl" onClick={() => setView('week')} style={s(seg(view === 'week'))}>Week</div>
              <div className="ctl" onClick={() => setView('month')} style={s(seg(view === 'month'))}>Month</div>
            </div>

            {error && <div style={s('font-size:12px;color:var(--bad);font-weight:600;margin-bottom:10px')}>{error}</div>}

            {items === null ? (
              <div style={s('text-align:center;color:var(--text3);font-size:12.5px;margin-top:40px')}>Loading events…</div>
            ) : view === 'upcoming' ? (
              upcomingGroups.length === 0 ? (
                <EmptyState icon="📅" title="No upcoming events"
                  sub={isOwner ? 'Tap Add to schedule your club’s next session.' : 'Nothing on the calendar yet — check back soon.'} />
              ) : (
                <div style={s('animation:floatUp .3s ease')}>
                  {upcomingGroups.map((g) => (
                    <div key={g.label} style={s('margin-top:6px')}>
                      <div style={s('display:flex;align-items:center;gap:9px;margin:16px 2px 11px')}>
                        <span style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.4px;font-weight:600')}>{g.label}</span>
                        <span style={s('flex:1;height:1px;background:var(--line)')} />
                        <span className="mono" style={s('font-size:10.5px;color:var(--text3)')}>{g.count}</span>
                      </div>
                      <div style={s('display:flex;flex-direction:column;gap:10px')}>
                        {g.events.map((ev) => (
                          <UpcomingCard key={ev.id} ev={ev} isOwner={isOwner} busy={busyId === ev.id} token={token}
                            route={routes[ev.id]} participants={faces[ev.id]}
                            onOpen={() => actions.openEvent(ev)}
                            onDirections={(lat, lon) => setDirTarget({ lat, lon, title: ev.title })}
                            onJoin={() => join(ev)} onLeave={() => leave(ev)} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : view === 'week' ? (
              <>
                <PeriodNav nav={nav} onPrev={() => step(-1)} onNext={() => step(1)} onToday={jumpToday} />
                {weekItems.length === 0 ? (
                  <WeekEmpty isOwner={isOwner} next={upcoming[0]} onUpcoming={() => setView('upcoming')} />
                ) : (
                  <div style={s('display:flex;flex-direction:column;gap:10px')}>
                    {weekItems.map((ev) => (isOwner ? (
                      <CoachCard key={ev.id} ev={ev} busy={busyId === ev.id} open={openId === ev.id} roster={rosters[ev.id]} token={token}
                        onOpen={() => actions.openEvent(ev)}
                        onEdit={() => actions.editEvent(ev)} onPublish={() => togglePublish(ev)} onDelete={() => setConfirmId(ev.id)} onRoster={() => toggleRoster(ev)} />
                    ) : (
                      <MemberCard key={ev.id} ev={ev} busy={busyId === ev.id} token={token} onOpen={() => actions.openEvent(ev)}
                        onJoin={() => join(ev)} onLeave={() => leave(ev)} onCheckIn={() => checkin(ev)} onUndoCheckIn={() => undoCheckin(ev)} />
                    )))}
                  </div>
                )}
              </>
            ) : (
              <>
                <PeriodNav nav={nav} onPrev={() => step(-1)} onNext={() => step(1)} onToday={jumpToday} />
                <MonthGrid cells={monthCells} onOpenWeek={openWeekOf} />
                <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.4px;font-weight:600;margin:22px 2px 11px')}>This month</div>
                {monthList.length === 0 ? (
                  <div style={s('font-size:12.5px;color:var(--text3);padding:14px;border:1px dashed var(--line2);border-radius:14px;text-align:center')}>No events in {monthName(anchor)}.</div>
                ) : (
                  <div style={s('display:flex;flex-direction:column;gap:9px')}>
                    {monthList.map((ev) => <MonthRow key={ev.id} ev={ev} onOpen={() => actions.openEvent(ev)} />)}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* delete-event confirmation — removing an event also drops its join/check-in roster */}
      {pendingEvent && (
        <>
          <div className="ctl" onClick={deleting ? undefined : () => setConfirmId(null)} style={s('position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:50;animation:floatUp .2s ease')} />
          <div className="scr" style={s('position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(90%,420px);z-index:51;background:var(--bg);border:1px solid var(--line2);border-radius:20px;padding:20px;animation:floatUpCenter .25s ease')}>
            <div style={s('font-size:17px;font-weight:700')}>Delete this event?</div>
            <div style={s('font-size:13px;color:var(--text2);line-height:1.5;margin-top:8px')}>
              <span style={s('color:var(--text);font-weight:600')}>{pendingEvent.title || 'Untitled event'}</span> will be permanently deleted, along with everyone’s joins and check-ins. This can’t be undone.
            </div>
            <div style={s('display:flex;gap:10px;margin-top:18px')}>
              <div className="ctl" onClick={deleting ? undefined : () => setConfirmId(null)} style={s(`flex:1;text-align:center;padding:12px;border-radius:12px;font-weight:700;font-size:14px;background:var(--bg3);border:1px solid var(--line);color:var(--text2);opacity:${deleting ? 0.5 : 1}`)}>Cancel</div>
              <div className="ctl" onClick={deleting ? undefined : () => remove(pendingEvent)} style={s(`flex:1;text-align:center;padding:12px;border-radius:12px;font-weight:700;font-size:14px;background:var(--bad);color:#fff;opacity:${deleting ? 0.7 : 1}`)}>{deleting ? 'Deleting…' : 'Delete'}</div>
            </div>
          </div>
        </>
      )}

      {/* directions — pick which navigation app to open (Waze / Google Maps / Apple Maps) */}
      {dirTarget && (
        <DirectionsSheet target={dirTarget} onClose={() => setDirTarget(null)}
          onPick={(url) => { (actions.openLink || ((u) => { try { window.open(u, '_blank', 'noopener'); } catch { /* ignore */ } }))(url); setDirTarget(null); }} />
      )}
    </>
  );
}

// ── directions action sheet ─────────────────────────────────────────────────────────
function DirectionsSheet({ target, onClose, onPick }) {
  const apps = navApps(target.lat, target.lon);
  return (
    <>
      <div className="ctl" onClick={onClose} style={s('position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:50;animation:floatUp .2s ease')} />
      <div className="scr" style={s('position:fixed;left:0;right:0;bottom:0;z-index:51;background:var(--bg);border-top:1px solid var(--line2);border-radius:22px 22px 0 0;padding:16px 16px calc(20px + env(safe-area-inset-bottom));animation:floatUp .22s ease')}>
        <div style={s('width:38px;height:4px;border-radius:2px;background:var(--line2);margin:0 auto 14px')} />
        <div style={s('font-size:15px;font-weight:700')}>Get directions</div>
        {target.title && <div style={s('font-size:12px;color:var(--text2);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>to {target.title}</div>}
        <div style={s('display:flex;flex-direction:column;gap:8px;margin-top:14px')}>
          {apps.map((a) => (
            <div key={a.key} className="ctl" onClick={() => onPick(a.url)}
              style={s('display:flex;align-items:center;gap:12px;padding:12px 13px;border-radius:13px;background:var(--bg2);border:1px solid var(--line)')}>
              <div style={s(`width:34px;height:34px;flex:none;border-radius:10px;display:flex;align-items:center;justify-content:center;background:${a.color}`)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l19-9-9 19-2-8-8-2z" /></svg>
              </div>
              <span style={s('flex:1;font-size:14px;font-weight:700')}>{a.label}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            </div>
          ))}
        </div>
        <div className="ctl" onClick={onClose} style={s('text-align:center;margin-top:12px;padding:12px;border-radius:12px;font-size:13.5px;font-weight:700;background:var(--bg3);border:1px solid var(--line);color:var(--text2)')}>Cancel</div>
      </div>
    </>
  );
}

// ── prev / label / next period navigation (Week + Month) ────────────────────────────
function PeriodNav({ nav, onPrev, onNext, onToday }) {
  return (
    <div style={s('display:flex;align-items:center;gap:8px;margin-bottom:16px')}>
      <div className="ctl" onClick={onPrev} style={s('width:38px;height:36px;flex:none;border-radius:11px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--text2)')}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
      </div>
      <div style={s('flex:1;min-width:0;text-align:center')}>
        <div style={s('font-size:14.5px;font-weight:700;letter-spacing:-.2px')}>{nav.label}</div>
        {!nav.isCurrent && <div className="ctl" onClick={onToday} style={s('font-size:10.5px;color:var(--accent);font-weight:700;margin-top:1px')}>Jump to today</div>}
      </div>
      <div className="ctl" onClick={onNext} style={s('width:38px;height:36px;flex:none;border-radius:11px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--text2)')}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
      </div>
    </div>
  );
}

// ── the flagship upcoming card: date chip · type · title · when/where · map · who's going ──
function UpcomingCard({ ev, isOwner, busy, token, route, participants, onOpen, onDirections, onJoin, onLeave }) {
  const d = new Date(ev.start);
  const meta = sportMeta(ev.sport);
  const joined = !!ev.joined;
  const chip = joined
    ? { bg: 'color-mix(in srgb,var(--accent) 16%,transparent)', border: 'color-mix(in srgb,var(--accent) 40%,transparent)', ink: 'var(--accent)' }
    : { bg: 'var(--bg3)', border: 'var(--line)', ink: 'var(--text)' };
  const place = ev.courseName || '';
  const start = route && route.length ? route.find((p) => Array.isArray(p) && Number.isFinite(p[0])) : null;

  const rsvpStyle = joined
    ? 'flex:none;padding:8px 15px;border-radius:11px;background:color-mix(in srgb,var(--good) 16%,transparent);border:1px solid color-mix(in srgb,var(--good) 40%,transparent);font-size:12px;font-weight:700;color:var(--good)'
    : 'flex:none;padding:8px 15px;border-radius:11px;background:var(--accent);color:var(--accent-ink);font-size:12px;font-weight:700';

  return (
    <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:17px;padding:13px 14px')}>
      <div className={onOpen ? 'ctl' : undefined} onClick={onOpen} style={s('display:flex;gap:13px;align-items:flex-start')}>
        {/* date chip */}
        <div style={s(`width:52px;flex:none;text-align:center;border-radius:13px;background:${chip.bg};border:1px solid ${chip.border};padding:8px 0 7px`)}>
          <div className="mono" style={s(`font-size:9px;font-weight:700;letter-spacing:1px;color:${chip.ink};text-transform:uppercase`)}>{d.toLocaleDateString('en-US', { month: 'short' })}</div>
          <div className="mono" style={s(`font-size:21px;font-weight:700;line-height:1;color:${chip.ink};margin-top:2px`)}>{String(d.getDate()).padStart(2, '0')}</div>
          <div style={s('font-size:8.5px;color:var(--text3);margin-top:3px')}>{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
        </div>
        <div style={s('flex:1;min-width:0')}>
          <div style={s('display:flex;align-items:center;gap:7px')}>
            <span style={s(`width:7px;height:7px;border-radius:50%;background:${meta.color};flex:none`)} />
            <span style={s(`font-size:9.5px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:${meta.color}`)}>{meta.label}</span>
            {isOwner && !ev.published && (
              <span style={s('font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--warn);background:color-mix(in srgb,var(--warn) 15%,transparent);padding:2px 6px;border-radius:5px')}>Draft</span>
            )}
          </div>
          <div dir="ltr" style={s('font-size:15.5px;font-weight:700;line-height:1.2;margin-top:5px;text-align:left')}>{ev.title}</div>
          <div style={s('display:flex;flex-wrap:wrap;gap:12px;font-size:11px;color:var(--text2);margin-top:7px')}>
            <span style={s('display:flex;align-items:center;gap:5px')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
              {fmtTime(ev.start)}
            </span>
            {place && (
              <span style={s('display:flex;align-items:center;gap:5px')}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                {place}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* route-map preview — only when the event carries a drawable route */}
      {route && route.length > 1 && (
        <div style={s('position:relative;height:78px;border-radius:13px;overflow:hidden;margin-top:12px')}>
          <TileMap points={route} fill radius={13} pad={16}>
            {(project) => <path d={toPathD(route, project)} fill="none" stroke={meta.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
          </TileMap>
          <div style={s('position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,transparent 45%,rgba(6,8,11,.6) 100%)')} />
          {place && (
            <div style={s('position:absolute;left:9px;bottom:8px;pointer-events:none;display:flex;align-items:center;gap:5px;font-size:10.5px;font-weight:600;color:#fff')}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
              {place}
            </div>
          )}
          {start && (
            <div className="ctl" onClick={(e) => { e.stopPropagation(); onDirections?.(start[0], start[1]); }}
              style={s('position:absolute;right:8px;bottom:8px;display:flex;align-items:center;gap:4px;padding:5px 10px;border-radius:9px;background:rgba(20,23,29,.82);backdrop-filter:blur(6px);border:1px solid var(--line2);font-size:10px;font-weight:700;color:#fff')}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l19-9-9 19-2-8-8-2z" /></svg>Directions
            </div>
          )}
        </div>
      )}

      {/* who's going + RSVP */}
      <div style={s('display:flex;align-items:center;gap:10px;margin-top:12px;padding-top:12px;border-top:1px solid var(--line)')}>
        {Array.isArray(participants) && participants.length > 0 && (
          <div style={s('display:flex;align-items:center')}>
            {participants.slice(0, 3).map((p, i) => (
              <AuthedAvatar key={p.athleteId} avatarUrl={p.avatarUrl} token={token} initials={p.initials} color={p.avatarColor}
                size={23} radius={12} fontSize={8.5} style={`border:2px solid var(--bg2)${i ? ';margin-left:-7px' : ''}`} />
            ))}
          </div>
        )}
        <span style={s('font-size:10.5px;color:var(--text3);flex:1')}>{(ev.joinCount || 0) > 0 ? `${ev.joinCount} going` : 'Be the first to RSVP'}</span>
        <div className={busy ? undefined : 'ctl'} onClick={busy ? undefined : (joined ? onLeave : onJoin)} style={s(`${rsvpStyle};opacity:${busy ? 0.6 : 1}`)}>
          {busy ? '…' : joined ? 'Going ✓' : 'RSVP'}
        </div>
      </div>
    </div>
  );
}

// ── week empty state ────────────────────────────────────────────────────────────────
function WeekEmpty({ isOwner, next, onUpcoming }) {
  const nextDay = next ? fmtDay(new Date(next.start)) : null;
  return (
    <div style={s('display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:48px 20px')}>
      <div style={s('width:60px;height:60px;border-radius:18px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center')}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="2.5" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
      </div>
      <div style={s('font-size:16px;font-weight:700;margin-top:16px')}>No events this week</div>
      <div style={s('font-size:12.5px;color:var(--text2);line-height:1.5;margin-top:6px;max-width:240px')}>
        {nextDay
          ? <>Nothing scheduled this week. Your next session is <span style={s('color:var(--accent);font-weight:600')}>{nextDay}</span> — see Upcoming.</>
          : (isOwner ? 'Tap Add to schedule a session, or use the arrows to browse other weeks.' : 'Nothing scheduled — check another week or back soon.')}
      </div>
      {next && (
        <div className="ctl" onClick={onUpcoming} style={s('margin-top:16px;padding:10px 18px;border-radius:12px;background:var(--accent);color:var(--accent-ink);font-size:13px;font-weight:700')}>View upcoming</div>
      )}
    </div>
  );
}

// ── month heatmap ──────────────────────────────────────────────────────────────────
function MonthGrid({ cells, onOpenWeek }) {
  return (
    <>
      <div style={s('display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin-bottom:8px')}>
        {dowLabels.map((d, i) => <div key={i} style={s('text-align:center;font-size:10px;color:var(--text3);font-weight:600')}>{d}</div>)}
      </div>
      <div style={s('display:grid;grid-template-columns:repeat(7,1fr);gap:5px')}>
        {cells.map((c, i) => {
          const hasEvents = c.sports.length > 0;
          return (
            <div key={i} className={hasEvents ? 'ctl' : undefined} onClick={hasEvents ? () => onOpenWeek(c.day) : undefined}
              style={s(`aspect-ratio:1;border-radius:9px;padding:5px 4px;display:flex;flex-direction:column;justify-content:space-between;background:${c.isToday ? 'var(--accent-dim)' : 'var(--bg2)'};border:1px solid ${c.isToday ? 'color-mix(in srgb,var(--accent) 45%,transparent)' : 'var(--line)'}`)}>
              <div className="mono" style={s(`font-size:11px;font-weight:600;opacity:${c.inMonth ? 1 : 0.32};${c.isToday ? 'color:var(--accent)' : ''}`)}>{c.day.getDate()}</div>
              <div style={s('display:flex;gap:2px;justify-content:center;min-height:5px')}>
                {c.sports.slice(0, 3).map((sp, j) => <div key={j} style={s(`width:5px;height:5px;border-radius:50%;background:${sportMeta(sp).color};opacity:${c.inMonth ? 1 : 0.4}`)} />)}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── this-month list row ─────────────────────────────────────────────────────────────
function MonthRow({ ev, onOpen }) {
  const d = new Date(ev.start);
  const meta = sportMeta(ev.sport);
  return (
    <div className="ctl" onClick={onOpen} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:11px 13px;display:flex;align-items:center;gap:12px')}>
      <div style={s('width:40px;flex:none;text-align:center')}>
        <div className="mono" style={s('font-size:8.5px;font-weight:700;color:var(--text3);text-transform:uppercase')}>{d.toLocaleDateString('en-US', { month: 'short' })}</div>
        <div className="mono" style={s('font-size:18px;font-weight:700;line-height:1')}>{d.getDate()}</div>
      </div>
      <div style={s('width:1px;align-self:stretch;background:var(--line)')} />
      <div style={s('flex:1;min-width:0')}>
        <div dir="ltr" style={s('font-size:13.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left')}>{ev.title}</div>
        <div style={s('font-size:10.5px;color:var(--text2);margin-top:2px')}>{fmtTime(ev.start)} · {meta.label}</div>
      </div>
      <span style={s(`width:8px;height:8px;border-radius:50%;background:${meta.color};flex:none`)} />
    </div>
  );
}

// ── member browse card (join / check in / undo) — Week view ─────────────────────────
function MemberCard({ ev, busy, token, onOpen, onJoin, onLeave, onCheckIn, onUndoCheckIn }) {
  const today = isTodayIso(ev.start);
  return (
    <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:13px 14px;display:flex;align-items:center;gap:11px')}>
      <div style={s('width:38px;height:38px;border-radius:11px;flex:none;display:flex;align-items:center;justify-content:center;background:var(--accent-dim);color:var(--accent);overflow:hidden')}>
        {ev.logoUrl ? <AuthedImage url={ev.logoUrl} token={token} style="width:100%;height:100%;object-fit:cover" /> : <SportIcon sport={ev.sport} />}
      </div>
      <div className={onOpen ? 'ctl' : undefined} onClick={onOpen ? () => onOpen(ev) : undefined} style={s('flex:1;min-width:0')}>
        <div style={s('font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{ev.title}</div>
        <div style={s('font-size:11.5px;color:var(--text3);margin-top:2px')}>
          {fmtWhen(ev.start)}{ev.courseName ? ` · ${ev.courseName}` : ''}{today ? <span style={s('color:var(--accent);font-weight:700')}>{'  ·  Today'}</span> : null}
        </div>
        <div style={s('font-size:10.5px;color:var(--text3);margin-top:3px')}>{ev.joinCount || 0} going{onOpen ? ' · Details ›' : ''}</div>
      </div>

      {ev.checkedIn ? (
        <div style={s('flex:none;display:flex;align-items:center;gap:7px')}>
          <div style={s('display:flex;align-items:center;gap:5px;font-size:12px;font-weight:700;color:var(--good)')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>Checked in
          </div>
          <div className={busy ? undefined : 'ctl'} onClick={busy ? undefined : onUndoCheckIn} style={s(`font-size:11px;font-weight:600;color:var(--text3);opacity:${busy ? 0.6 : 1}`)}>{busy ? '…' : 'Undo'}</div>
        </div>
      ) : !ev.joined ? (
        <div className={busy ? undefined : 'ctl'} onClick={busy ? undefined : onJoin}
          style={s(`flex:none;padding:9px 14px;border-radius:10px;font-weight:700;font-size:12px;background:var(--accent);color:var(--accent-ink);opacity:${busy ? 0.6 : 1}`)}>{busy ? '…' : 'Join'}</div>
      ) : (
        <div style={s('flex:none;display:flex;align-items:center;gap:7px')}>
          {today ? (
            <div className={busy ? undefined : 'ctl'} onClick={busy ? undefined : onCheckIn}
              style={s(`padding:9px 14px;border-radius:10px;font-weight:700;font-size:12px;background:var(--good);color:#04140b;opacity:${busy ? 0.6 : 1}`)}>{busy ? '…' : 'Check in'}</div>
          ) : (
            <span style={s('font-size:11px;font-weight:700;color:var(--good)')}>Joined</span>
          )}
          <div className={busy ? undefined : 'ctl'} onClick={busy ? undefined : onLeave} style={s('font-size:11px;font-weight:600;color:var(--text3)')}>Leave</div>
        </div>
      )}
    </div>
  );
}

// ── coach manager card (edit / publish / delete + roster) — Week view ───────────────
function CoachCard({ ev, busy, open, roster, token, onOpen, onEdit, onPublish, onDelete, onRoster }) {
  return (
    <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:13px 14px')}>
      <div style={s('display:flex;align-items:center;gap:11px')}>
        <div style={s('width:38px;height:38px;border-radius:11px;flex:none;display:flex;align-items:center;justify-content:center;background:var(--accent-dim);color:var(--accent);overflow:hidden')}>
          {ev.logoUrl ? <AuthedImage url={ev.logoUrl} token={token} style="width:100%;height:100%;object-fit:cover" /> : <SportIcon sport={ev.sport} />}
        </div>
        <div className={onOpen ? 'ctl' : undefined} onClick={onOpen ? () => onOpen(ev) : undefined} style={s('flex:1;min-width:0')}>
          <div style={s('display:flex;align-items:center;gap:7px')}>
            <span style={s('font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{ev.title}</span>
            <span style={s(ev.published
              ? 'font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--good);background:color-mix(in srgb,var(--good) 15%,transparent);padding:2px 6px;border-radius:5px'
              : 'font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--warn);background:color-mix(in srgb,var(--warn) 15%,transparent);padding:2px 6px;border-radius:5px')}>
              {ev.published ? 'Published' : 'Draft'}
            </span>
          </div>
          <div style={s('font-size:11.5px;color:var(--text3);margin-top:2px')}>
            {fmtWhen(ev.start)}{ev.courseName ? ` · ${ev.courseName}` : ''}{isTodayIso(ev.start) ? <span style={s('color:var(--accent);font-weight:700')}>{'  ·  Today'}</span> : null}
          </div>
        </div>
      </div>

      {/* joins / check-ins summary — tap to expand the roster */}
      <div className="ctl" onClick={onRoster}
        style={s('display:flex;align-items:center;gap:8px;margin-top:10px;padding:9px 11px;background:var(--bg3);border:1px solid var(--line);border-radius:11px')}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
        <span style={s('flex:1;font-size:12px;color:var(--text2);font-weight:600')}>
          <span className="mono" style={s('color:var(--text)')}>{ev.joinCount || 0}</span> joined · <span className="mono" style={s('color:var(--good)')}>{ev.checkedInCount || 0}</span> checked in
        </span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={s(`transform:rotate(${open ? 180 : 0}deg);transition:transform .15s`)}><path d="M6 9l6 6 6-6" /></svg>
      </div>

      {open && (
        <div style={s('margin-top:8px;display:flex;flex-direction:column;gap:6px')}>
          {roster === null && <div style={s('font-size:11.5px;color:var(--text3);padding:6px 2px')}>Loading roster…</div>}
          {roster && roster.length === 0 && <div style={s('font-size:11.5px;color:var(--text3);padding:6px 2px')}>Nobody has joined yet.</div>}
          {roster && roster.map((a) => (
            <div key={a.athleteId} style={s('display:flex;align-items:center;gap:10px;padding:7px 9px;background:var(--bg3);border-radius:10px')}>
              <div style={s(`width:28px;height:28px;border-radius:9px;flex:none;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#0c0e11;background:${a.avatarColor || 'var(--accent)'}`)}>{a.initials}</div>
              <div style={s('flex:1;min-width:0')}>
                <div style={s('font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{a.name}</div>
              </div>
              {a.checkedIn
                ? <span style={s('flex:none;display:flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:var(--good)')}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                    {fmtTime(a.checkedInUtc)}
                  </span>
                : <span style={s('flex:none;font-size:10.5px;font-weight:600;color:var(--text3)')}>Joined</span>}
            </div>
          ))}
        </div>
      )}

      {/* coach actions */}
      <div style={s('display:flex;gap:7px;margin-top:10px')}>
        <div className={busy ? undefined : 'ctl'} onClick={busy ? undefined : onEdit}
          style={s('flex:1;text-align:center;padding:9px;border-radius:10px;font-size:12px;font-weight:700;background:var(--bg3);border:1px solid var(--line);color:var(--text)')}>Edit</div>
        <div className={busy ? undefined : 'ctl'} onClick={busy ? undefined : onPublish}
          style={s(`flex:1;text-align:center;padding:9px;border-radius:10px;font-size:12px;font-weight:700;${ev.published ? 'background:var(--bg3);border:1px solid var(--line);color:var(--text2)' : 'background:var(--accent-dim);border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);color:var(--accent)'}`)}>
          {ev.published ? 'Unpublish' : 'Publish'}
        </div>
        <div className={busy ? undefined : 'ctl'} onClick={busy ? undefined : onDelete}
          style={s('width:40px;flex:none;display:flex;align-items:center;justify-content:center;padding:9px;border-radius:10px;background:color-mix(in srgb,var(--bad) 12%,var(--bg3));border:1px solid color-mix(in srgb,var(--bad) 30%,transparent);color:var(--bad)')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" /></svg>
        </div>
      </div>
    </div>
  );
}
