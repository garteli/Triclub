import { useEffect, useState } from 'react';
import { s } from '../lib/style.js';
import { Back } from './wizard.jsx';
import RouteMapGL from '../components/RouteMapGL.jsx';
import AuthedAvatar from '../components/AuthedAvatar.jsx';
import AuthedImage from '../components/AuthedImage.jsx';
import SportIcon from '../components/SportIcon.jsx';
import { listEventParticipants, joinEvent, leaveEvent, getEventRoute } from '../lib/events.js';

// The member-facing event page: details, a large map of the route, the participant roster, and a
// Join/Leave control. Check-in deliberately lives only on the Live page (on the day of the ride).
// Reached by tapping an event on the group page or the Live lobby (state.selEvent is the row).

const glyphForSport = (sport, family) =>
  family === 'motorsport' ? 'moto' : ({ 1: 'swim', 2: 'bike', 3: 'run' }[sport] || 'bike');

const fmtWhen = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
};

export default function EventDetail({ vm, state, actions, getToken }) {
  const ev = state?.selEvent || null;
  const squadId = ev?.squadId || vm.activeClubId;
  const token = getToken?.() ?? null;

  const [route, setRoute] = useState(null);   // [[lat,lon],…] | null
  const [people, setPeople] = useState(null); // null = loading
  const [joined, setJoined] = useState(!!ev?.joined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [mapFull, setMapFull] = useState(false); // fullscreen route map overlay

  const loadPeople = async (t) => {
    try { return await listEventParticipants(t, squadId, ev.id); } catch { return []; }
  };

  useEffect(() => {
    if (!ev) return undefined;
    let ok = true;
    (async () => {
      const t = await getToken?.();
      // Draw the route from the points denormalized onto the event — visible to any member who can
      // see the event (the source course is owner-scoped, so a plain getCourse 404s for members).
      if (ev.courseId || ev.courseName || ev.courseKm) {
        try { const r = await getEventRoute(t, squadId, ev.id); if (ok) setRoute(r?.points?.length ? r.points : null); }
        catch { if (ok) setRoute(null); }
      }
      const p = await loadPeople(t);
      if (ok) setPeople(p || []);
    })();
    return () => { ok = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev?.id]);

  if (!ev) {
    return (
      <div style={s('padding:20px')}>
        <Back onClick={() => actions.back?.()} />
        <div style={s('font-size:14px;color:var(--text2);margin-top:16px')}>That event is no longer available.</div>
      </div>
    );
  }

  const toggleJoin = async () => {
    setBusy(true); setErr('');
    try {
      const t = await getToken?.();
      if (joined) { await leaveEvent(t, ev.id); setJoined(false); }
      else { await joinEvent(t, ev.id); setJoined(true); }
      setPeople(await loadPeople(t));
    } catch (e) { setErr(e?.message || 'Could not update your RSVP.'); }
    finally { setBusy(false); }
  };

  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      <div style={s('display:flex;align-items:center;gap:12px;margin:6px 0 4px')}>
        <Back onClick={() => actions.back?.()} />
        <div style={s('font-size:20px;font-weight:700;letter-spacing:-.4px')}>Event</div>
      </div>

      {/* banner hero (if set) */}
      {ev.bannerUrl && (
        <div style={s('margin-top:12px;border-radius:18px;overflow:hidden;border:1px solid var(--line);height:150px')}>
          <AuthedImage url={ev.bannerUrl} token={token} style="width:100%;height:100%;object-fit:cover" />
        </div>
      )}

      {/* header — logo or sport glyph, title, when */}
      <div style={s('display:flex;align-items:center;gap:12px;margin-top:14px')}>
        <div style={s('width:48px;height:48px;border-radius:14px;background:var(--accent-dim);display:flex;align-items:center;justify-content:center;flex:none;overflow:hidden')}>
          {ev.logoUrl
            ? <AuthedImage url={ev.logoUrl} token={token} style="width:100%;height:100%;object-fit:cover" />
            : <SportIcon name={glyphForSport(ev.sport, vm.family)} size={26} color="var(--accent)" />}
        </div>
        <div style={s('min-width:0')}>
          <div style={s('font-size:20px;font-weight:700;letter-spacing:-.4px;overflow:hidden;text-overflow:ellipsis')}>{ev.title}</div>
          <div style={s('font-size:13px;color:var(--text2)')}>{fmtWhen(ev.start)}</div>
        </div>
      </div>

      {/* large route map — tap ⤢ to go fullscreen */}
      {route && route.length > 1 && (
        <div style={s('position:relative;margin-top:16px;border-radius:18px;overflow:hidden;border:1px solid var(--line);height:280px')}>
          <RouteMapGL route={route} />
          <div className="ctl" onClick={() => setMapFull(true)} aria-label="Expand map"
            style={s('position:absolute;top:10px;right:10px;z-index:5;width:34px;height:34px;border-radius:10px;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;line-height:1')}>⤢</div>
        </div>
      )}
      {(ev.courseName || ev.courseKm) && (
        <div style={s('font-size:12.5px;color:var(--text2);margin-top:10px')}>
          Route: {ev.courseName || 'Course'}{ev.courseKm ? ` · ${ev.courseKm.toFixed(1)} km` : ''}
        </div>
      )}

      {/* notes */}
      {ev.notes && (
        <div style={s('margin-top:16px;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:13px 14px;font-size:13px;color:var(--text2);line-height:1.5;white-space:pre-wrap')}>{ev.notes}</div>
      )}

      {/* join / leave — check-in is Live-page only */}
      <div className={busy ? undefined : 'ctl'} onClick={busy ? undefined : toggleJoin}
        style={s(`text-align:center;padding:14px;border-radius:14px;font-weight:700;font-size:14px;margin-top:18px;${joined ? 'background:var(--bg2);border:1px solid var(--line);color:var(--text)' : 'background:var(--accent);color:var(--accent-ink)'}`)}>
        {busy ? '…' : joined ? 'Leave event' : 'Join event'}
      </div>
      {err && <div style={s('color:var(--bad);font-size:12px;text-align:center;margin-top:8px')}>{err}</div>}
      <div style={s('font-size:11px;color:var(--text3);text-align:center;margin-top:8px;line-height:1.4')}>Check in from the Live page on the day of the ride.</div>

      {/* participants */}
      <div style={s('font-size:12px;color:var(--text3);text-transform:uppercase;letter-spacing:1.4px;font-weight:600;margin:24px 2px 12px')}>
        Participants{people ? ` · ${people.length}` : ''}
      </div>
      {people === null ? (
        <div style={s('font-size:12px;color:var(--text3);padding:6px 2px')}>Loading…</div>
      ) : people.length === 0 ? (
        <div style={s('font-size:12.5px;color:var(--text3);padding:16px;border:1px dashed var(--line2);border-radius:14px;text-align:center')}>No one's joined yet — be the first.</div>
      ) : (
        <div style={s('display:flex;flex-direction:column;gap:9px')}>
          {people.map((p) => (
            <div key={p.athleteId} className={p.you ? undefined : 'ctl'} onClick={p.you ? undefined : () => actions.openAthlete?.(p.athleteId)}
              style={s('display:flex;align-items:center;gap:11px;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:9px 11px')}>
              <AuthedAvatar avatarUrl={p.avatarUrl} token={token} initials={p.initials} color={p.avatarColor} size={34} radius={11} fontSize={13} />
              <div style={s('flex:1;min-width:0;font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{p.name}{p.you ? ' (you)' : ''}</div>
              {p.checkedIn && <span style={s('font-size:10.5px;font-weight:700;color:var(--good);flex:none')}>✓ Checked in</span>}
            </div>
          ))}
        </div>
      )}

      {/* fullscreen route map — covers the whole screen, hides everything else */}
      {mapFull && route && route.length > 1 && (
        <div style={s('position:fixed;inset:0;z-index:300;background:var(--bg)')}>
          <RouteMapGL route={route} />
          <div className="ctl" onClick={() => setMapFull(false)} aria-label="Close map"
            style={s('position:absolute;top:16px;right:16px;z-index:5;width:40px;height:40px;border-radius:12px;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;line-height:1')}>✕</div>
        </div>
      )}
    </div>
  );
}
