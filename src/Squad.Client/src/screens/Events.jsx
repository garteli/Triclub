import { useCallback, useEffect, useMemo, useState } from 'react';
import { s, html } from '../lib/style.js';
import EmptyState from '../components/EmptyState.jsx';
import {
  listSquadEvents, deleteSquadEvent, publishEvent, unpublishEvent, listEventAttendees,
  joinEvent, leaveEvent, checkInEvent, undoCheckInEvent,
} from '../lib/events.js';

// The motorsport clubs' second tab (replaces Plan). Motorsport clubs run on scheduled
// group rides rather than a training plan, so this shows the active club's sessions on a
// Plan-style calendar: a Week / Month toggle, prev/next navigation, and a month heatmap.
//   • Members  → browse cards (join, and check in on the day).
//   • The coach (squad owner) → a manager view: Add / Edit / Delete, Publish / Unpublish,
//     and each event's join + check-in roster.

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
const isTodayIso = (iso) => { const d = new Date(iso); return !Number.isNaN(d.getTime()) && sameDay(d, new Date()); };

const SportIcon = ({ sport, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={html(sportMeta(sport).icon)} />
);

const seg = (active) =>
  active
    ? 'flex:1;text-align:center;padding:7px 6px;border-radius:9px;font-size:11.5px;font-weight:600;background:var(--accent);color:var(--accent-ink)'
    : 'flex:1;text-align:center;padding:7px 6px;border-radius:9px;font-size:11.5px;font-weight:600;background:rgba(255,255,255,.06);color:var(--text2)';

const dowLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function Events({ vm, actions, getToken, meId, onDataChanged }) {
  const squadId = vm.activeClubId;
  const owner = vm.activeSquad?.owner;
  const isOwner = !!meId && !!owner && String(meId).toLowerCase() === String(owner).toLowerCase();

  const [view, setView] = useState('week');        // 'week' | 'month'
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [items, setItems] = useState(null);        // null = loading
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  // coach-only per-event UI state
  const [openId, setOpenId] = useState(null);       // event whose roster is expanded
  const [rosters, setRosters] = useState({});       // eventId → attendees[] (null = loading)
  const [confirmId, setConfirmId] = useState(null); // event pending delete-confirmation

  const load = useCallback(async () => {
    if (!squadId) { setItems([]); return; }
    try { const t = await getToken?.(); setItems(await listSquadEvents(t, squadId)); }
    catch { setItems([]); }
  }, [squadId, getToken]);
  useEffect(() => { load(); }, [load]);

  const patch = (id, fields) => setItems((xs) => (xs || []).map((x) => (x.id === id ? { ...x, ...fields } : x)));

  // ── the current period's window + label ────────────────────────────────────────
  const week = view === 'week';
  const weekStart = useMemo(() => startOfWeek(anchor), [anchor]);
  const nav = useMemo(() => {
    const now = new Date();
    if (week) {
      const isCurrent = sameDay(weekStart, startOfWeek(now));
      const eyebrow = isCurrent ? 'This week' : (weekStart > now ? 'Upcoming' : 'Past');
      return { label: `${fmtDay(weekStart)} – ${fmtDay(addDays(weekStart, 6))}`, eyebrow, isCurrent };
    }
    const isCurrent = anchor.getFullYear() === now.getFullYear() && anchor.getMonth() === now.getMonth();
    return { label: anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), eyebrow: 'Month', isCurrent };
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

  const monthLegend = useMemo(() => {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end = addMonths(start, 1);
    const present = new Set((items || []).filter((e) => { const d = new Date(e.start); return d >= start && d < end; }).map((e) => e.sport));
    return [...present].sort().map((n) => ({ label: sportMeta(n).label, color: sportMeta(n).color }));
  }, [items, anchor]);

  // ── member actions ─────────────────────────────────────────────────────────────
  const runMember = async (ev, fn, fields) => {
    setBusyId(ev.id); setError('');
    try { const t = await getToken?.(); await fn(t, ev.id); patch(ev.id, fields(ev)); }
    catch (e) { setError(e?.message || 'Something went wrong.'); }
    finally { setBusyId(null); }
  };
  const join = (ev) => runMember(ev, joinEvent, (e) => ({ joined: true, joinCount: (e.joinCount || 0) + 1 }));
  const leave = (ev) => runMember(ev, leaveEvent, (e) => ({ joined: false, checkedIn: false, joinCount: Math.max(0, (e.joinCount || 1) - 1) }));
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

  return (
    <>
      <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
        <div style={s('display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:14px')}>
          <div>
            <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.6px;font-weight:600')}>{nav.eyebrow}</div>
            <div style={s('font-size:23px;font-weight:700;letter-spacing:-.5px')}>Events</div>
            {vm.squadName && <div style={s('font-size:12.5px;color:var(--text2);margin-top:2px')}>{vm.squadName}</div>}
          </div>
          {isOwner && squadId && (
            <div className="ctl" onClick={() => actions.editEvent(null)}
              style={s('flex:none;display:flex;align-items:center;gap:6px;background:var(--accent);color:var(--accent-ink);border-radius:12px;padding:9px 13px;font-size:12.5px;font-weight:700;margin-top:4px')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              Add event
            </div>
          )}
        </div>

        {!squadId ? (
          <EmptyState icon="🏁" title="No club yet" sub="Join a club to see its scheduled rides and sessions here." />
        ) : (
          <>
            {/* Week / Month toggle */}
            <div style={s('display:flex;gap:6px;background:var(--bg2);border:1px solid var(--line);border-radius:13px;padding:4px;margin-bottom:10px')}>
              <div className="ctl" onClick={() => setView('week')} style={s(seg(week))}>Week</div>
              <div className="ctl" onClick={() => setView('month')} style={s(seg(!week))}>Month</div>
            </div>

            {/* prev / label / next navigation */}
            <div style={s('display:flex;align-items:center;gap:8px;margin-bottom:16px')}>
              <div className="ctl" onClick={() => step(-1)} style={s('width:38px;height:36px;flex:none;border-radius:11px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--text2)')}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
              </div>
              <div style={s('flex:1;min-width:0;text-align:center')}>
                <div style={s('font-size:14.5px;font-weight:700;letter-spacing:-.2px')}>{nav.label}</div>
                {!nav.isCurrent && <div className="ctl" onClick={jumpToday} style={s('font-size:10.5px;color:var(--accent);font-weight:700;margin-top:1px')}>Jump to today</div>}
              </div>
              <div className="ctl" onClick={() => step(1)} style={s('width:38px;height:36px;flex:none;border-radius:11px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--text2)')}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
              </div>
            </div>

            {error && <div style={s('font-size:12px;color:var(--bad);font-weight:600;margin-bottom:10px')}>{error}</div>}

            {items === null ? (
              <div style={s('text-align:center;color:var(--text3);font-size:12.5px;margin-top:40px')}>Loading events…</div>
            ) : week ? (
              weekItems.length === 0 ? (
                <EmptyState icon="📅" title="No events this week"
                  sub={isOwner ? 'Tap Add event to schedule a session, or use the arrows to browse other weeks.' : 'Nothing scheduled for this week — check another week or back soon.'} />
              ) : (
                <div style={s('display:flex;flex-direction:column;gap:10px')}>
                  {weekItems.map((ev) => (isOwner ? (
                    <CoachCard key={ev.id} ev={ev} busy={busyId === ev.id} open={openId === ev.id} roster={rosters[ev.id]}
                      onOpen={() => actions.openEvent(ev)}
                      onEdit={() => actions.editEvent(ev)} onPublish={() => togglePublish(ev)} onDelete={() => setConfirmId(ev.id)} onRoster={() => toggleRoster(ev)} />
                  ) : (
                    <MemberCard key={ev.id} ev={ev} busy={busyId === ev.id} onOpen={() => actions.openEvent(ev)}
                      onJoin={() => join(ev)} onLeave={() => leave(ev)} onCheckIn={() => checkin(ev)} onUndoCheckIn={() => undoCheckin(ev)} />
                  )))}
                </div>
              )
            ) : (
              <MonthGrid cells={monthCells} legend={monthLegend} onOpenWeek={openWeekOf} />
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
    </>
  );
}

// ── month heatmap ──────────────────────────────────────────────────────────────────
function MonthGrid({ cells, legend, onOpenWeek }) {
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
      {legend.length > 0 && (
        <div style={s('display:flex;gap:14px;margin-top:16px;justify-content:center;flex-wrap:wrap')}>
          {legend.map((l) => (
            <div key={l.label} style={s('display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text2)')}><span style={s(`width:8px;height:8px;border-radius:50%;background:${l.color}`)} />{l.label}</div>
          ))}
        </div>
      )}
    </>
  );
}

// ── member browse card (join / check in / undo) ─────────────────────────────────────
function MemberCard({ ev, busy, onOpen, onJoin, onLeave, onCheckIn, onUndoCheckIn }) {
  const today = isTodayIso(ev.start);
  return (
    <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:13px 14px;display:flex;align-items:center;gap:11px')}>
      <div style={s('width:38px;height:38px;border-radius:11px;flex:none;display:flex;align-items:center;justify-content:center;background:var(--accent-dim);color:var(--accent)')}>
        <SportIcon sport={ev.sport} />
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

// ── coach manager card (edit / publish / delete + roster) ───────────────────────────
function CoachCard({ ev, busy, open, roster, onOpen, onEdit, onPublish, onDelete, onRoster }) {
  return (
    <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:13px 14px')}>
      <div style={s('display:flex;align-items:center;gap:11px')}>
        <div style={s('width:38px;height:38px;border-radius:11px;flex:none;display:flex;align-items:center;justify-content:center;background:var(--accent-dim);color:var(--accent)')}>
          <SportIcon sport={ev.sport} />
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
