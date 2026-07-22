import { useCallback, useEffect, useMemo, useState } from 'react';
import { s, html } from '../lib/style.js';
import { listCourses } from '../lib/courses.js';
import {
  listSquadEvents, createSquadEvent, deleteSquadEvent,
  joinEvent, leaveEvent, checkInEvent, toOffsetIso,
} from '../lib/events.js';

// Ad-hoc group sessions a coach schedules for a squad. Two modes:
//   mode="manage"  — the owner picks a route + sport + date/time and publishes; sees join/check-in counts.
//   mode="browse"  — members join upcoming sessions and, on the day of the event, check in.
// Shared so the Manage screen and the Group page render the same list consistently.

const SPORTS = {
  1: { label: 'Swim', icon: '<path d="M2 16c1.5 0 1.5 1.5 3 1.5S8.5 16 10 16s1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5"/><path d="M2 20c1.5 0 1.5 1.5 3 1.5S8.5 20 10 20s1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5"/><circle cx="15" cy="6" r="2"/><path d="M6 13l5-4 3 2 3-3"/>' },
  2: { label: 'Bike', icon: '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 17.5l-3-6.5H8.5m6.5 0l-2.5 6.5M9.5 6.5h3l2 4.5"/>' },
  3: { label: 'Run', icon: '<circle cx="14" cy="5" r="2"/><path d="M11 21l1.5-5-2.5-2 1-5 3 2 2 1M8 12l1-4 3-1"/>' },
  0: { label: 'Session', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
};
const sportMeta = (n) => SPORTS[n] || SPORTS[0];

const fmtWhen = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
};
const isToday = (iso) => {
  const d = new Date(iso); const n = new Date();
  return !Number.isNaN(d.getTime())
    && d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};
// datetime-local default: the next round hour, formatted "yyyy-MM-ddTHH:mm" in local time.
const defaultWhen = () => {
  const d = new Date(Date.now() + 60 * 60 * 1000); d.setMinutes(0, 0, 0);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const SportIcon = ({ sport, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={html(sportMeta(sport).icon)} />
);

// standalone=true — rendered as its own screen (the motorsport Events tab): keep the
// empty state visible instead of collapsing the section, and drop the section heading.
export default function SquadEvents({ squadId, getToken, mode = 'browse', standalone = false }) {
  const manage = mode === 'manage';
  const [items, setItems] = useState(null); // null = loading
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  // create form (manage only)
  const [courses, setCourses] = useState(null);
  const [title, setTitle] = useState('');
  const [sport, setSport] = useState(2);
  const [when, setWhen] = useState(defaultWhen);
  const [courseId, setCourseId] = useState('');
  const [notes, setNotes] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!squadId) { setItems([]); return; }
    try { const t = await getToken?.(); setItems(await listSquadEvents(t, squadId)); }
    catch { setItems([]); }
  }, [squadId, getToken]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!manage) return;
    let ok = true;
    (async () => {
      try { const t = await getToken?.(); const cs = await listCourses(t); if (ok) setCourses(cs); }
      catch { if (ok) setCourses([]); }
    })();
    return () => { ok = false; };
  }, [manage, getToken]);

  const selectedCourse = useMemo(
    () => (courses || []).find((c) => String(c.id) === String(courseId)) || null, [courses, courseId]);

  const create = async () => {
    const t = title.trim();
    if (!t || adding) return;
    const start = toOffsetIso(when);
    if (!start) { setError('Pick a valid date and time.'); return; }
    setAdding(true); setError('');
    try {
      const tok = await getToken?.();
      const created = await createSquadEvent(tok, squadId, {
        title: t, sport, start, courseId: courseId || null, notes: notes.trim() || null,
      });
      setItems((xs) => [...(xs || []), created].sort((a, b) => new Date(a.start) - new Date(b.start)));
      setTitle(''); setNotes(''); setCourseId(''); setWhen(defaultWhen());
    } catch (e) { setError(e?.message || 'Could not schedule that session.'); }
    finally { setAdding(false); }
  };

  const remove = async (id) => {
    setBusyId(id); setError('');
    try { const t = await getToken?.(); await deleteSquadEvent(t, squadId, id); setItems((xs) => (xs || []).filter((x) => x.id !== id)); }
    catch (e) { setError(e?.message || 'Could not remove that session.'); }
    finally { setBusyId(null); }
  };

  // Optimistic-ish patch of a single event row after a member action.
  const patch = (id, fields) => setItems((xs) => (xs || []).map((x) => (x.id === id ? { ...x, ...fields } : x)));

  const join = async (ev) => {
    setBusyId(ev.id); setError('');
    try { const t = await getToken?.(); await joinEvent(t, ev.id); patch(ev.id, { joined: true, joinCount: (ev.joinCount || 0) + 1 }); }
    catch (e) { setError(e?.message || 'Could not join.'); }
    finally { setBusyId(null); }
  };
  const leave = async (ev) => {
    setBusyId(ev.id); setError('');
    try {
      const t = await getToken?.(); await leaveEvent(t, ev.id);
      patch(ev.id, { joined: false, checkedIn: false, joinCount: Math.max(0, (ev.joinCount || 1) - 1) });
    } catch (e) { setError(e?.message || 'Could not leave.'); }
    finally { setBusyId(null); }
  };
  const checkin = async (ev) => {
    setBusyId(ev.id); setError('');
    try { const t = await getToken?.(); await checkInEvent(t, ev.id); patch(ev.id, { checkedIn: true, checkedInCount: (ev.checkedInCount || 0) + 1 }); }
    catch (e) { setError(e?.message || 'Could not check in.'); }
    finally { setBusyId(null); }
  };

  if (items === null) return null;                              // loading — avoid flicker
  if (!manage && !standalone && items.length === 0) return null; // members: hide an empty inline section

  return (
    <div style={s('margin-top:16px')}>
      {!standalone && <div style={s('font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text2);margin:0 2px 10px')}>Group sessions</div>}

      {/* manager: schedule a session */}
      {manage && (
        <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:13px 14px;margin-bottom:10px;display:flex;flex-direction:column;gap:9px')}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Session title — e.g. Saturday hills"
            style={s('background:var(--bg3);border:1px solid var(--line);border-radius:11px;padding:11px 12px;font-size:13px;color:var(--text);outline:none;font-family:inherit')} />

          {/* sport toggle */}
          <div style={s('display:flex;gap:7px')}>
            {[1, 2, 3].map((n) => (
              <div key={n} className="ctl" onClick={() => setSport(n)}
                style={s(`flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:9px;border-radius:10px;font-size:12.5px;font-weight:700;border:1px solid ${sport === n ? 'var(--accent)' : 'var(--line)'};background:${sport === n ? 'var(--accent-dim)' : 'var(--bg3)'};color:${sport === n ? 'var(--accent)' : 'var(--text2)'}`)}>
                <SportIcon sport={n} size={16} />{sportMeta(n).label}
              </div>
            ))}
          </div>

          {/* date + time */}
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)}
            style={s('background:var(--bg3);border:1px solid var(--line);border-radius:11px;padding:11px 12px;font-size:13px;color:var(--text);outline:none;font-family:inherit')} />

          {/* route picker (saved courses) */}
          <select value={courseId} onChange={(e) => setCourseId(e.target.value)}
            style={s('background:var(--bg3);border:1px solid var(--line);border-radius:11px;padding:11px 12px;font-size:13px;color:var(--text);outline:none;font-family:inherit')}>
            <option value="">{courses === null ? 'Loading routes…' : 'No route (optional)'}</option>
            {(courses || []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.distanceKm ? ` · ${c.distanceKm.toFixed(1)} km` : ''}</option>
            ))}
          </select>

          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional) — meeting point, pace…"
            style={s('background:var(--bg3);border:1px solid var(--line);border-radius:11px;padding:11px 12px;font-size:13px;color:var(--text);outline:none;font-family:inherit')} />

          <div className={adding || !title.trim() ? undefined : 'ctl'} onClick={adding || !title.trim() ? undefined : create}
            style={s(`text-align:center;padding:11px;border-radius:11px;font-weight:700;font-size:13px;background:var(--accent);color:var(--accent-ink);opacity:${adding || !title.trim() ? 0.5 : 1}`)}>
            {adding ? 'Publishing…' : 'Publish to squad'}
          </div>
          {selectedCourse && <div style={s('font-size:11px;color:var(--text3);text-align:center')}>Route: {selectedCourse.name}</div>}
        </div>
      )}

      {error && <div style={s('font-size:12px;color:var(--bad);font-weight:600;margin-bottom:10px')}>{error}</div>}

      {items.length === 0 ? (
        (manage || standalone) && <div style={s('font-size:12.5px;color:var(--text3);background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:14px;text-align:center')}>{manage ? 'No sessions scheduled yet — publish your next group ride above.' : 'No sessions scheduled yet — your club’s upcoming rides will show up here.'}</div>
      ) : (
        <div style={s('display:flex;flex-direction:column;gap:9px')}>
          {items.map((ev) => {
            const today = isToday(ev.start);
            return (
              <div key={ev.id} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:13px 14px;display:flex;align-items:center;gap:11px')}>
                <div style={s('width:38px;height:38px;border-radius:11px;flex:none;display:flex;align-items:center;justify-content:center;background:var(--accent-dim);color:var(--accent)')}>
                  <SportIcon sport={ev.sport} />
                </div>
                <div style={s('flex:1;min-width:0')}>
                  <div style={s('font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{ev.title}</div>
                  <div style={s('font-size:11.5px;color:var(--text3);margin-top:2px')}>
                    {fmtWhen(ev.start)}
                    {ev.courseName ? ` · ${ev.courseName}` : ''}
                    {today ? <span style={s('color:var(--accent);font-weight:700')}>{'  ·  Today'}</span> : null}
                  </div>
                  <div style={s('font-size:10.5px;color:var(--text3);margin-top:3px')}>
                    {ev.joinCount || 0} going{manage && (ev.checkedInCount ? ` · ${ev.checkedInCount} checked in` : '')}
                  </div>
                </div>

                {manage ? (
                  <div className={busyId === ev.id ? undefined : 'ctl'} onClick={busyId === ev.id ? undefined : () => remove(ev.id)}
                    style={s('width:34px;height:34px;border-radius:10px;flex:none;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--bad) 12%,var(--bg3));border:1px solid color-mix(in srgb,var(--bad) 30%,transparent);color:var(--bad)')}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" /></svg>
                  </div>
                ) : (
                  <MemberActions ev={ev} today={today} busy={busyId === ev.id}
                    onJoin={() => join(ev)} onLeave={() => leave(ev)} onCheckIn={() => checkin(ev)} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// The member's action zone for one event, per state: not joined / joined-future / joined-today / checked-in.
function MemberActions({ ev, today, busy, onJoin, onLeave, onCheckIn }) {
  if (ev.checkedIn) {
    return (
      <div style={s('flex:none;display:flex;align-items:center;gap:5px;font-size:12px;font-weight:700;color:var(--good)')}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>Checked in
      </div>
    );
  }
  if (!ev.joined) {
    return (
      <div className={busy ? undefined : 'ctl'} onClick={busy ? undefined : onJoin}
        style={s(`flex:none;padding:9px 14px;border-radius:10px;font-weight:700;font-size:12px;background:var(--accent);color:var(--accent-ink);opacity:${busy ? 0.6 : 1}`)}>
        {busy ? '…' : 'Join'}
      </div>
    );
  }
  // joined, not yet checked in
  return (
    <div style={s('flex:none;display:flex;align-items:center;gap:7px')}>
      {today ? (
        <div className={busy ? undefined : 'ctl'} onClick={busy ? undefined : onCheckIn}
          style={s(`padding:9px 14px;border-radius:10px;font-weight:700;font-size:12px;background:var(--good);color:#04140b;opacity:${busy ? 0.6 : 1}`)}>
          {busy ? '…' : 'Check in'}
        </div>
      ) : (
        <span style={s('font-size:11px;font-weight:700;color:var(--good)')}>Joined</span>
      )}
      <div className={busy ? undefined : 'ctl'} onClick={busy ? undefined : onLeave}
        style={s('font-size:11px;font-weight:600;color:var(--text3)')}>Leave</div>
    </div>
  );
}
