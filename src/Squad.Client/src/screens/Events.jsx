import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { s } from '../lib/style.js';
import EmptyState from '../components/EmptyState.jsx';
import { EventCard, DirectionsSheet, sportMeta } from '../components/EventCard.jsx';
import {
  listSquadEvents, deleteSquadEvent, publishEvent, unpublishEvent, listEventAttendees,
  listEventParticipants, getEventRoute, setEventStartPlace,
  joinEvent, leaveEvent, checkInEvent, undoCheckInEvent,
  listEventRequests, approveEventRequest, declineEventRequest,
} from '../lib/events.js';
import { reverseGeocode } from '../lib/reverseGeocode.js';

// The motorsport clubs' second tab (replaces Plan). Motorsport clubs run on scheduled
// group rides rather than a training plan, so this shows the active club's sessions three ways:
//   • Upcoming → the flagship browse view: future sessions grouped by time bucket (This week /
//     Later this month / by month), rich cards with a route-map preview, RSVP and who's going.
//   • Week     → a manager-friendly single-week list (coach: add/edit/publish/delete + roster).
//   • Month    → a heatmap calendar + this-month list.
// Members RSVP (join) and, on the day, check in; the coach (squad owner) manages the schedule.

// ── date helpers (weeks start Monday, matching the Plan month grid) ──────────────
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const startOfWeek = (d) => { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const startOfMonth = (d) => { const x = startOfDay(d); x.setDate(1); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d, n) => { const x = new Date(d); x.setDate(1); x.setMonth(x.getMonth() + n); return x; };
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const fmtDay = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const monthName = (d) => d.toLocaleDateString('en-US', { month: 'long' });

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
  const [reqs, setReqs] = useState({});             // eventId → pending join requests[] (non-members)
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

  // Lazily fetch each event's route (for the map preview + directions) and its participants
  // (for the "who's going" faces) — real data only, fetched once per event and shared by every
  // view so the Upcoming / Week / Month cards all look identical.
  const fetchFaces = useCallback(async (ev) => {
    setFaces((f) => (f[ev.id] === undefined ? { ...f, [ev.id]: null } : f));
    try { const t = await getToken?.(); const p = await listEventParticipants(t, squadId, ev.id); setFaces((f) => ({ ...f, [ev.id]: p || [] })); }
    catch { setFaces((f) => ({ ...f, [ev.id]: [] })); }
  }, [getToken, squadId]);

  const seen = useRef(new Set());
  useEffect(() => {
    if (!squadId || !items) return;
    items.forEach((ev) => {
      if (seen.current.has(ev.id)) return;
      seen.current.add(ev.id);
      // faces: only worth a call when someone has joined
      if ((ev.joinCount || 0) > 0) fetchFaces(ev);
      else setFaces((f) => ({ ...f, [ev.id]: [] }));
      // route: only events that carry a course have one to draw
      if (ev.courseId || ev.courseName || ev.courseKm) {
        setRoutes((r) => ({ ...r, [ev.id]: r[ev.id] ?? null }));
        (async () => {
          try {
            const t = await getToken?.();
            const rt = await getEventRoute(t, squadId, ev.id);
            const pts = rt?.points?.length ? rt.points : null;
            setRoutes((r) => ({ ...r, [ev.id]: pts }));
            // Name the start point once (reverse geocode) and cache it on the event, so the card can
            // show it and future loads carry it without geocoding again.
            if (pts && !ev.startPlace) {
              const st = pts.find((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
              if (st) {
                const name = await reverseGeocode(st[0], st[1]);
                if (name) { patch(ev.id, { startPlace: name }); try { await setEventStartPlace(t, squadId, ev.id, name); } catch { /* best-effort cache */ } }
              }
            }
          } catch { setRoutes((r) => ({ ...r, [ev.id]: null })); }
        })();
      }
    });
  }, [squadId, items, getToken, fetchFaces]);

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
      try {
        const t = await getToken?.();
        // Fetch the confirmed roster and any pending (non-member) requests together.
        const [a, pending] = await Promise.all([
          listEventAttendees(t, squadId, ev.id),
          listEventRequests(t, squadId, ev.id).catch(() => []),
        ]);
        setRosters((r) => ({ ...r, [ev.id]: a }));
        setReqs((r) => ({ ...r, [ev.id]: pending || [] }));
      } catch { setRosters((r) => ({ ...r, [ev.id]: [] })); }
    }
  };

  // Coach approves/declines a non-member's request to join this event, then refreshes the roster + counts.
  const decideReq = async (ev, athleteId, approve) => {
    setReqs((r) => ({ ...r, [ev.id]: (r[ev.id] || []).filter((x) => x.athleteId !== athleteId) })); // optimistic
    try {
      const t = await getToken?.();
      if (approve) {
        await approveEventRequest(t, squadId, ev.id, athleteId);
        const a = await listEventAttendees(t, squadId, ev.id);
        setRosters((r) => ({ ...r, [ev.id]: a }));
        patch(ev.id, { joinCount: (ev.joinCount || 0) + 1 });
      } else {
        await declineEventRequest(t, squadId, ev.id, athleteId);
      }
    } catch (e) { setError(e?.message || 'Could not update that request.'); }
  };

  const pendingEvent = confirmId ? (items || []).find((x) => x.id === confirmId) : null;
  const deleting = busyId === confirmId;
  const token = getToken?.();

  // One card, wired identically for every view (Upcoming / Week / Month) so they all match.
  const renderCard = (ev) => (
    <EventCard key={ev.id} ev={ev} isOwner={isOwner} busy={busyId === ev.id} token={token}
      route={routes[ev.id]} participants={faces[ev.id]} rosterOpen={openId === ev.id} roster={rosters[ev.id]}
      requests={reqs[ev.id]}
      onOpen={() => actions.openEvent(ev)}
      onDirections={(lat, lon) => setDirTarget({ lat, lon, title: ev.title })}
      onJoin={() => join(ev)} onLeave={() => leave(ev)} onCheckIn={() => checkin(ev)} onUndoCheckIn={() => undoCheckin(ev)}
      onApproveReq={(aid) => decideReq(ev, aid, true)} onDeclineReq={(aid) => decideReq(ev, aid, false)}
      onEdit={() => actions.editEvent(ev)} onPublish={() => togglePublish(ev)} onDelete={() => setConfirmId(ev.id)} onRoster={() => toggleRoster(ev)} />
  );

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
                        {g.events.map(renderCard)}
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
                    {weekItems.map(renderCard)}
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
                  <div style={s('display:flex;flex-direction:column;gap:10px')}>
                    {monthList.map(renderCard)}
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

