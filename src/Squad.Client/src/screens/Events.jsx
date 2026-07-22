import { useCallback, useEffect, useState } from 'react';
import { s, html } from '../lib/style.js';
import SquadEvents from '../components/SquadEvents.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { listSquadEvents, deleteSquadEvent, publishEvent, unpublishEvent, listEventAttendees } from '../lib/events.js';

// The motorsport clubs' second tab (replaces Plan). Motorsport clubs run on scheduled
// group rides rather than a training plan, so this shows the active club's sessions.
//   • Members  → the browse list (join, and check in on the day).
//   • The coach (squad owner) → a manager view: Add / Edit / Delete, Publish / Unpublish,
//     and each event's join + check-in roster.

const SPORTS = {
  0: { label: 'Session', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
  1: { label: 'Swim', icon: '<path d="M2 16c1.5 0 1.5 1.5 3 1.5S8.5 16 10 16s1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5"/><path d="M2 20c1.5 0 1.5 1.5 3 1.5S8.5 20 10 20s1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5"/><circle cx="15" cy="6" r="2"/><path d="M6 13l5-4 3 2 3-3"/>' },
  2: { label: 'Ride', icon: '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 17.5l-3-6.5H8.5m6.5 0l-2.5 6.5M9.5 6.5h3l2 4.5"/>' },
  3: { label: 'Run', icon: '<circle cx="14" cy="5" r="2"/><path d="M11 21l1.5-5-2.5-2 1-5 3 2 2 1M8 12l1-4 3-1"/>' },
};
const sportMeta = (n) => SPORTS[n] || SPORTS[0];

const fmtWhen = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
};
const fmtTime = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};
const isToday = (iso) => {
  const d = new Date(iso); const n = new Date();
  return !Number.isNaN(d.getTime()) && d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};

const SportIcon = ({ sport, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={html(sportMeta(sport).icon)} />
);

export default function Events({ vm, actions, getToken, meId, onDataChanged }) {
  const squadId = vm.activeClubId;
  const owner = vm.activeSquad?.owner;
  const isOwner = !!meId && !!owner && String(meId).toLowerCase() === String(owner).toLowerCase();

  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      <div style={s('display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:2px')}>
        <div>
          <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.6px;font-weight:600')}>{isOwner ? 'Manage' : 'Upcoming'}</div>
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

      {!squadId
        ? <EmptyState icon="🏁" title="No club yet" sub="Join a club to see its scheduled rides and sessions here." />
        : isOwner
          ? <CoachEventList squadId={squadId} getToken={getToken} actions={actions} onDataChanged={onDataChanged} />
          : <SquadEvents squadId={squadId} getToken={getToken} mode="browse" standalone />}
    </div>
  );
}

// ── coach manager list ────────────────────────────────────────────────────────
function CoachEventList({ squadId, getToken, actions, onDataChanged }) {
  const [items, setItems] = useState(null);   // null = loading
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [openId, setOpenId] = useState(null);  // event whose roster is expanded
  const [rosters, setRosters] = useState({});  // eventId → attendees[] (null = loading)

  const load = useCallback(async () => {
    try { const t = await getToken?.(); setItems(await listSquadEvents(t, squadId)); }
    catch { setItems([]); }
  }, [squadId, getToken]);
  useEffect(() => { load(); }, [load]);

  const patch = (id, fields) => setItems((xs) => (xs || []).map((x) => (x.id === id ? { ...x, ...fields } : x)));

  const remove = async (ev) => {
    setBusyId(ev.id); setError('');
    try { const t = await getToken?.(); await deleteSquadEvent(t, squadId, ev.id); setItems((xs) => (xs || []).filter((x) => x.id !== ev.id)); onDataChanged?.(); }
    catch (e) { setError(e?.message || 'Could not remove that event.'); }
    finally { setBusyId(null); }
  };

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

  const toggleRoster = async (ev) => {
    if (openId === ev.id) { setOpenId(null); return; }
    setOpenId(ev.id);
    if (rosters[ev.id] === undefined) {
      setRosters((r) => ({ ...r, [ev.id]: null }));
      try { const t = await getToken?.(); const a = await listEventAttendees(t, squadId, ev.id); setRosters((r) => ({ ...r, [ev.id]: a })); }
      catch { setRosters((r) => ({ ...r, [ev.id]: [] })); }
    }
  };

  if (items === null) return <div style={s('text-align:center;color:var(--text3);font-size:12.5px;margin-top:40px')}>Loading events…</div>;
  if (items.length === 0)
    return <div style={s('margin-top:18px')}><EmptyState icon="🏁" title="No events yet" sub="Tap Add event to schedule your club's first group ride." /></div>;

  return (
    <div style={s('display:flex;flex-direction:column;gap:10px;margin-top:16px')}>
      {error && <div style={s('font-size:12px;color:var(--bad);font-weight:600')}>{error}</div>}
      {items.map((ev) => {
        const busy = busyId === ev.id;
        const open = openId === ev.id;
        const roster = rosters[ev.id];
        return (
          <div key={ev.id} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:13px 14px')}>
            <div style={s('display:flex;align-items:center;gap:11px')}>
              <div style={s('width:38px;height:38px;border-radius:11px;flex:none;display:flex;align-items:center;justify-content:center;background:var(--accent-dim);color:var(--accent)')}>
                <SportIcon sport={ev.sport} />
              </div>
              <div style={s('flex:1;min-width:0')}>
                <div style={s('display:flex;align-items:center;gap:7px')}>
                  <span style={s('font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{ev.title}</span>
                  <span style={s(ev.published
                    ? 'font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--good);background:color-mix(in srgb,var(--good) 15%,transparent);padding:2px 6px;border-radius:5px'
                    : 'font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--warn);background:color-mix(in srgb,var(--warn) 15%,transparent);padding:2px 6px;border-radius:5px')}>
                    {ev.published ? 'Published' : 'Draft'}
                  </span>
                </div>
                <div style={s('font-size:11.5px;color:var(--text3);margin-top:2px')}>
                  {fmtWhen(ev.start)}{ev.courseName ? ` · ${ev.courseName}` : ''}{isToday(ev.start) ? <span style={s('color:var(--accent);font-weight:700')}>{'  ·  Today'}</span> : null}
                </div>
              </div>
            </div>

            {/* joins / check-ins summary — tap to expand the roster */}
            <div className="ctl" onClick={() => toggleRoster(ev)}
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
              <div className={busy ? undefined : 'ctl'} onClick={busy ? undefined : () => actions.editEvent(ev)}
                style={s('flex:1;text-align:center;padding:9px;border-radius:10px;font-size:12px;font-weight:700;background:var(--bg3);border:1px solid var(--line);color:var(--text)')}>Edit</div>
              <div className={busy ? undefined : 'ctl'} onClick={busy ? undefined : () => togglePublish(ev)}
                style={s(`flex:1;text-align:center;padding:9px;border-radius:10px;font-size:12px;font-weight:700;${ev.published ? 'background:var(--bg3);border:1px solid var(--line);color:var(--text2)' : 'background:var(--accent-dim);border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);color:var(--accent)'}`)}>
                {ev.published ? 'Unpublish' : 'Publish'}
              </div>
              <div className={busy ? undefined : 'ctl'} onClick={busy ? undefined : () => remove(ev)}
                style={s('width:40px;flex:none;display:flex;align-items:center;justify-content:center;padding:9px;border-radius:10px;background:color-mix(in srgb,var(--bad) 12%,var(--bg3));border:1px solid color-mix(in srgb,var(--bad) 30%,transparent);color:var(--bad)')}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" /></svg>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
