import { useEffect, useMemo, useState } from 'react';
import { s } from '../lib/style.js';
import { Back } from './wizard.jsx';
import RouteMapGL from '../components/RouteMapGL.jsx';
import AuthedAvatar from '../components/AuthedAvatar.jsx';
import AuthedImage from '../components/AuthedImage.jsx';
import SportIcon from '../components/SportIcon.jsx';
import { listEventParticipants, joinEvent, leaveEvent, getEventRoute } from '../lib/events.js';
import { buildElevationProfile } from '../lib/elevation.js';
import { routeKm } from '../lib/courses.js';
import { BASEMAP_LABEL, nextBasemap, inIsrael } from '../lib/basemaps.js';
import { getRouteStyle, setRouteStyle as persistRouteStyle } from '../lib/routeStyle.js';
import { getMapView, setMapStyle as persistMapStyle } from '../lib/mapView.js';
import { eventShareUrl } from '../lib/eventLink.js';
import RouteStylePanel from '../components/RouteStylePanel.jsx';

// The member-facing event page: an identity block, a large map of the route, terrain-derived ride
// stats + elevation, the meeting point, the organizer's notes, RSVP status, and the participant
// roster. Check-in deliberately lives only on the Live page (on the day of the ride). Everything
// shown is real: distance/climb come from the route + Open-Meteo terrain, never fabricated.
// Reached by tapping an event on the group page or the Live lobby (state.selEvent is the row).

// Sport/family → the identity colour, pill label, and glyph. Motorsport clubs store a single "Ride"
// (sport=2) rendered with the motorcycle glyph and the club accent; endurance clubs colour by sport.
const typeMeta = (sport, family) => {
  if (family === 'motorsport') return { color: 'var(--accent)', label: 'Ride', glyph: 'moto' };
  return ({
    1: { color: 'var(--swim)', label: 'Swim', glyph: 'swim' },
    2: { color: 'var(--bike)', label: 'Ride', glyph: 'bike' },
    3: { color: 'var(--run)', label: 'Run', glyph: 'run' },
  }[sport]) || { color: 'var(--accent)', label: 'Session', glyph: 'bike' };
};

const fmtDateLine = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  return {
    date: d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  };
};
const isTodayIso = (iso) => {
  const d = new Date(iso); const n = new Date();
  return !Number.isNaN(d.getTime()) && d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};

// Turn-by-turn links to a [lat,lon] start point, one per navigation app (Waze / Google Maps / Apple
// Maps) — universal/https links the OS hands to the installed app or the web fallback.
const navApps = (lat, lon) => [
  { key: 'waze', label: 'Waze', color: '#33ccff', url: `https://waze.com/ul?ll=${lat}%2C${lon}&navigate=yes` },
  { key: 'gmaps', label: 'Google Maps', color: '#34a853', url: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}` },
  { key: 'amaps', label: 'Apple Maps', color: '#5a86ff', url: `https://maps.apple.com/?daddr=${lat},${lon}&dirflg=d` },
];

// Build a minimal iCalendar (RFC 5545) for the event — DTSTART only (no fabricated duration), plus
// the real title / place / notes — and trigger a download so the rider can add it to any calendar.
const icsStamp = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
};
const icsEscape = (t) => String(t || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`);
function downloadCalendar(ev) {
  const start = new Date(ev.start);
  if (Number.isNaN(start.getTime())) return;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Squad//Event//EN', 'BEGIN:VEVENT',
    `UID:squad-event-${ev.id}@squad`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`,
    `SUMMARY:${icsEscape(ev.title || 'Event')}`,
    ...(ev.courseName ? [`LOCATION:${icsEscape(ev.courseName)}`] : []),
    ...(ev.notes ? [`DESCRIPTION:${icsEscape(ev.notes)}`] : []),
    'END:VEVENT', 'END:VCALENDAR',
  ];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${(ev.title || 'event').replace(/[^\w-]+/g, '-').slice(0, 40)}.ics`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// Share the event page: the event's name + when + notes, and a link that opens this event
// (?event=<squadId>.<eventId>). Uses the event's name — never the underlying route/GPS file name.
async function shareEvent(ev, squadId) {
  const when = fmtDateLine(ev.start);
  const title = ev.title || 'Event';
  const url = eventShareUrl(squadId || ev.squadId, ev.id);
  const text = [title, [when.date, when.time].filter(Boolean).join(' · '), ev.notes || ''].filter(Boolean).join('\n');
  try {
    if (navigator.share) { await navigator.share({ title, text, url: url || undefined }); return; }
    if (navigator.clipboard) await navigator.clipboard.writeText(url ? `${text}\n${url}` : text);
  } catch { /* user dismissed the share sheet — ignore */ }
}

const glass = 'background:rgba(0,0,0,.55);backdrop-filter:blur(6px);color:#fff;border:1px solid rgba(255,255,255,.14)';

// Map overlay controls shared by the inline card and the fullscreen view: a basemap-layer cycle
// button and a route colour/width picker — the same set the app's other maps offer.
function MapStyleControls({ mapStyle, cycleLayer, styleOpen, setStyleOpen }) {
  return (
    <>
      <div className="ctl" onClick={cycleLayer} title={`Map: ${BASEMAP_LABEL[mapStyle] || mapStyle}`}
        style={s(`width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;${glass}`)}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M12 2l9 5-9 5-9-5z" /><path d="M3 12l9 5 9-5M3 17l9 5 9-5" /></svg>
      </div>
      <div className="ctl" onPointerDown={(e) => e.stopPropagation()} onClick={() => setStyleOpen((o) => !o)} title="Route colour & width"
        style={s(`width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;${glass}${styleOpen ? ';border-color:rgba(255,255,255,.5)' : ''}`)}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l3 3-8 8-3 1 1-3z" /><path d="M17 5l2-2 2 2-2 2z" /></svg>
      </div>
    </>
  );
}


// A terrain-derived elevation card: distance + total ascent from Open-Meteo, and a gradient area
// chart of the profile. Fed the already-computed profile so the terrain is read once per route.
function ElevationCard({ elev, km, loading, failed, color }) {
  const W = 320, H = 76;
  let line = '', area = '';
  if (elev && elev.profile.length >= 2) {
    const total = elev.profile[elev.profile.length - 1].dist || 1;
    const span = Math.max(1, elev.max - elev.min);
    const px = (d) => (d / total) * W;
    const py = (e) => H - 4 - ((e - elev.min) / span) * (H - 14);
    line = elev.profile.map((p, i) => `${i ? 'L' : 'M'}${px(p.dist).toFixed(1)} ${py(p.e).toFixed(1)}`).join(' ');
    const [x0] = [px(0)];
    const xn = px(total);
    area = `${line} L${xn.toFixed(1)} ${H - 2} L${x0.toFixed(1)} ${H - 2} Z`;
  }
  return (
    <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:18px;padding:14px 15px 12px;margin-top:10px')}>
      <div style={s('display:flex;align-items:center;justify-content:space-between')}>
        <span style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1.3px;font-weight:600')}>Elevation profile</span>
        <span className="mono" style={s('font-size:11px;color:var(--text2)')}>
          {km ? `${km.toFixed(1)} km` : ''}{elev ? <> · <span style={s('color:var(--accent);font-weight:700')}>↑{elev.ascent} m</span></> : loading ? ' · reading terrain…' : failed ? ' · unavailable' : ''}
        </span>
      </div>
      {line ? (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 52, marginTop: 9, display: 'block' }}>
          <defs>
            <linearGradient id="evElevFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.38" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#evElevFill)" />
          <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      ) : (
        <div style={s('height:52px;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--text3);margin-top:9px')}>
          {loading ? 'Reading terrain…' : 'Elevation unavailable'}
        </div>
      )}
      {km ? (
        <div className="mono" style={s('display:flex;justify-content:space-between;font-size:9px;color:var(--text3);margin-top:2px')}>
          <span>0 km</span><span>{(km / 2).toFixed(1)} km</span><span>{km.toFixed(1)} km</span>
        </div>
      ) : null}
    </div>
  );
}

// Directions action sheet — pick which navigation app to open for the start point.
function DirectionsSheet({ target, onClose, onPick }) {
  const apps = navApps(target.lat, target.lon);
  return (
    <>
      <div className="ctl" onClick={onClose} style={s('position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:320;animation:floatUp .2s ease')} />
      <div className="scr" style={s('position:fixed;left:0;right:0;bottom:0;z-index:321;background:var(--bg);border-top:1px solid var(--line2);border-radius:22px 22px 0 0;padding:16px 16px calc(20px + env(safe-area-inset-bottom));animation:floatUp .22s ease')}>
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
  const [mapStyle, setMapStyle] = useState(() => getMapView().style); // basemap layer (shared across maps)
  const [rstyle, setRstyle] = useState(getRouteStyle);  // per-user route colour + width (shared)
  const [styleOpen, setStyleOpen] = useState(false);    // route-style picker open
  const [dirTarget, setDirTarget] = useState(null);     // { lat, lon, title } → Directions action sheet
  // terrain-derived elevation for the stat tile + elevation card (read once per route)
  const [elev, setElev] = useState(null);
  const [elevLoading, setElevLoading] = useState(false);
  const [elevFailed, setElevFailed] = useState(false);

  const meta = typeMeta(ev?.sport, vm.family);
  const when = fmtDateLine(ev?.start);
  const today = isTodayIso(ev?.start);
  const start = useMemo(() => (route || []).find((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) || null, [route]);
  const km = useMemo(() => {
    if (Number.isFinite(ev?.courseKm) && ev.courseKm > 0) return ev.courseKm;
    const pts = (route || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    return pts.length > 1 ? routeKm(pts) : 0;
  }, [ev?.courseKm, route]);

  // Off-road basemap only makes sense over Israel (blank tiles elsewhere).
  const israel = useMemo(() => (start ? inIsrael(start[0], start[1]) : true), [start]);
  const cycleLayer = () => setMapStyle((st) => nextBasemap(st, israel));
  const applyRstyle = (next) => { setRstyle(next); persistRouteStyle(next); };
  // Fall back to a global basemap if we're on Off-road but the route isn't in Israel.
  useEffect(() => { if (!israel && mapStyle === 'offroad') setMapStyle('voyager'); }, [israel, mapStyle]);
  // Persist the chosen layer so every map in the app opens on the same basemap.
  useEffect(() => { persistMapStyle(mapStyle); }, [mapStyle]);

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

  // Read the real terrain elevation once we have a drawable route.
  useEffect(() => {
    const pts = (route || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (pts.length < 2) { setElev(null); setElevLoading(false); setElevFailed(false); return undefined; }
    const ctrl = new AbortController();
    setElevLoading(true); setElevFailed(false);
    (async () => {
      try { setElev(await buildElevationProfile(pts, ctrl.signal)); }
      catch (e) { if (e.name !== 'AbortError') { setElev(null); setElevFailed(true); } }
      finally { setElevLoading(false); }
    })();
    return () => ctrl.abort();
  }, [route]);

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

  const hasRoute = route && route.length > 1;
  // The meeting point + directions are labelled with the event's name, not the underlying
  // route/GPS file name (which is often just an auto-generated filename like "offroad-1234…").
  const openDirections = () => { if (start) setDirTarget({ lat: start[0], lon: start[1], title: ev.title }); };

  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      {/* header — back · title · share */}
      <div style={s('display:flex;align-items:center;gap:12px;margin:6px 0 4px')}>
        <Back onClick={() => actions.back?.()} />
        <div style={s('flex:1;font-size:20px;font-weight:700;letter-spacing:-.4px')}>Event</div>
        <div className="ctl" onClick={() => shareEvent(ev, squadId)} aria-label="Share event"
          style={s('width:36px;height:36px;flex:none;border-radius:11px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--text2)')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></svg>
        </div>
      </div>

      {/* banner hero (if the coach set one) */}
      {ev.bannerUrl && (
        <div style={s('margin-top:12px;border-radius:18px;overflow:hidden;border:1px solid var(--line);height:150px')}>
          <AuthedImage url={ev.bannerUrl} token={token} style="width:100%;height:100%;object-fit:cover" />
        </div>
      )}

      {/* identity — glyph · type pill · title */}
      <div style={s('display:flex;align-items:center;gap:13px;margin-top:14px')}>
        <div style={s(`width:52px;height:52px;flex:none;border-radius:15px;background:color-mix(in srgb,${meta.color} 20%,transparent);border:1px solid color-mix(in srgb,${meta.color} 38%,transparent);display:flex;align-items:center;justify-content:center;overflow:hidden`)}>
          {ev.logoUrl
            ? <AuthedImage url={ev.logoUrl} token={token} style="width:100%;height:100%;object-fit:cover" />
            : <SportIcon name={meta.glyph} size={27} color={meta.color} />}
        </div>
        <div style={s('flex:1;min-width:0')}>
          <div style={s(`display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:6px;background:color-mix(in srgb,${meta.color} 18%,transparent)`)}>
            <span style={s(`width:5px;height:5px;border-radius:50%;background:${meta.color}`)} />
            <span style={s(`font-size:8.5px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;color:${meta.color}`)}>{meta.label}</span>
          </div>
          <div dir="auto" style={s('font-size:22px;font-weight:700;letter-spacing:-.3px;line-height:1.2;margin-top:4px;overflow-wrap:anywhere')}>{ev.title}</div>
        </div>
      </div>

      {/* when */}
      <div style={s('display:flex;align-items:center;gap:7px;font-size:13px;color:var(--text2);margin-top:12px')}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="17" rx="2.5" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
        <span style={s('color:var(--text);font-weight:600')}>{when.date}</span>
        {when.time && <span>· {when.time}</span>}
        {today && <span style={s('color:var(--accent);font-weight:700')}>· Today</span>}
      </div>

      {/* large route map — layers + route colour/width controls; tap ⤢ to go fullscreen */}
      {hasRoute && (
        <div style={s('position:relative;margin-top:14px;border-radius:20px;overflow:hidden;border:1px solid var(--line);height:214px')}>
          <RouteMapGL route={route} styleName={mapStyle} routeColor={rstyle.color} routeWidth={rstyle.width} arrowColor={rstyle.arrowColor} />
          <div style={s('position:absolute;top:10px;right:10px;z-index:5;display:flex;flex-direction:column;gap:8px')}>
            <div className="ctl" onClick={() => setMapFull(true)} aria-label="Expand map"
              style={s(`width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1;${glass}`)}>⤢</div>
            <MapStyleControls mapStyle={mapStyle} cycleLayer={cycleLayer} styleOpen={styleOpen} setStyleOpen={setStyleOpen} />
          </div>
          {styleOpen && <RouteStylePanel rstyle={rstyle} applyRstyle={applyRstyle} onClose={() => setStyleOpen(false)} pos="position:absolute;top:10px;right:52px;z-index:6" />}
        </div>
      )}

      {/* ride stats — distance from the route, climb from the terrain (both real) */}
      {hasRoute && km > 0 && (
        <div style={s('display:flex;gap:8px;margin-top:12px')}>
          <div style={s('flex:1;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:11px 12px')}>
            <div className="mono" style={s('font-size:17px;font-weight:700')}>{km.toFixed(1)}<span style={s('font-size:11px;color:var(--text2);font-weight:600')}> km</span></div>
            <div style={s('font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;margin-top:3px')}>Distance</div>
          </div>
          <div style={s('flex:1;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:11px 12px')}>
            <div className="mono" style={s('font-size:17px;font-weight:700')}>
              {elev ? <>↑{elev.ascent}<span style={s('font-size:11px;color:var(--text2);font-weight:600')}> m</span></>
                : <span style={s('color:var(--text3)')}>{elevLoading ? '…' : '—'}</span>}
            </div>
            <div style={s('font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;margin-top:3px')}>Climb</div>
          </div>
        </div>
      )}

      {/* elevation profile (real terrain) */}
      {hasRoute && <ElevationCard elev={elev} km={km} loading={elevLoading} failed={elevFailed} color={rstyle.color} />}

      {/* meeting point — directions to the route start */}
      {start && (
        <div className="ctl" onClick={openDirections}
          style={s('display:flex;align-items:center;gap:12px;background:var(--bg2);border:1px solid var(--line);border-radius:15px;padding:13px 14px;margin-top:14px')}>
          <div style={s('width:38px;height:38px;flex:none;border-radius:11px;background:color-mix(in srgb,var(--good) 18%,transparent);display:flex;align-items:center;justify-content:center')}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--good)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
          </div>
          <div style={s('flex:1;min-width:0')}>
            <div style={s('font-size:13.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>Start point</div>
            <div style={s('font-size:11px;color:var(--text2);margin-top:1px')}>Directions to the meeting point</div>
          </div>
          <div style={s('flex:none;padding:6px 11px;border-radius:9px;background:var(--bg3);border:1px solid var(--line);font-size:11px;font-weight:700;color:var(--accent)')}>Directions</div>
        </div>
      )}

      {/* notes from the organizer */}
      {ev.notes && (
        <>
          <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.4px;font-weight:600;margin:20px 2px 10px')}>Notes from the organizer</div>
          <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:15px;padding:14px 15px')}>
            {vm.squadName && (
              <div style={s('display:flex;align-items:center;gap:9px;margin-bottom:10px')}>
                <div style={s('width:26px;height:26px;flex:none;border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:var(--accent-dim);color:var(--accent);font-size:11px;font-weight:700')}>
                  {vm.activeSquad?.logoUrl ? <AuthedImage url={vm.activeSquad.logoUrl} token={token} style="width:100%;height:100%;object-fit:cover" /> : (vm.squadName[0] || '·')}
                </div>
                <div style={s('font-size:12px;font-weight:600')}>{vm.squadName}</div>
                <span style={s('font-size:10px;color:var(--text3)')}>· organizer</span>
              </div>
            )}
            <div style={s('font-size:12.5px;color:var(--text2);line-height:1.55;white-space:pre-wrap')}>{ev.notes}</div>
          </div>
        </>
      )}

      {/* RSVP status — going card, or the join CTA */}
      {joined ? (
        <div style={s('display:flex;align-items:center;gap:11px;background:color-mix(in srgb,var(--good) 10%,var(--bg2));border:1px solid color-mix(in srgb,var(--good) 30%,transparent);border-radius:15px;padding:12px 14px;margin-top:16px')}>
          <div style={s('width:32px;height:32px;flex:none;border-radius:10px;background:color-mix(in srgb,var(--good) 20%,transparent);display:flex;align-items:center;justify-content:center')}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--good)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          </div>
          <div style={s('flex:1;min-width:0')}>
            <div style={s('font-size:13.5px;font-weight:700;color:var(--good)')}>You’re going</div>
            <div style={s('font-size:11px;color:var(--text2)')}>Check in from Live on ride day</div>
          </div>
          <div className={busy ? undefined : 'ctl'} onClick={busy ? undefined : toggleJoin}
            style={s(`flex:none;padding:8px 14px;border-radius:11px;background:var(--bg3);border:1px solid var(--line);font-size:12px;font-weight:700;color:var(--text2);opacity:${busy ? 0.6 : 1}`)}>{busy ? '…' : 'Leave'}</div>
        </div>
      ) : (
        <div className={busy ? undefined : 'ctl'} onClick={busy ? undefined : toggleJoin}
          style={s(`text-align:center;padding:14px;border-radius:14px;font-weight:700;font-size:14px;margin-top:16px;background:var(--accent);color:var(--accent-ink);opacity:${busy ? 0.7 : 1}`)}>
          {busy ? '…' : 'Join event'}
        </div>
      )}
      {err && <div style={s('color:var(--bad);font-size:12px;text-align:center;margin-top:8px')}>{err}</div>}

      {/* secondary actions — add to calendar · share */}
      <div style={s('display:flex;gap:9px;margin-top:9px')}>
        <div className="ctl" onClick={() => downloadCalendar(ev)}
          style={s('flex:1;display:flex;align-items:center;justify-content:center;gap:7px;background:var(--bg2);border:1px solid var(--line);border-radius:13px;padding:11px;font-size:12.5px;font-weight:700')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="2.5" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>Add to calendar
        </div>
        <div className="ctl" onClick={() => shareEvent(ev, squadId)}
          style={s('flex:1;display:flex;align-items:center;justify-content:center;gap:7px;background:var(--bg2);border:1px solid var(--line);border-radius:13px;padding:11px;font-size:12.5px;font-weight:700')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8" /><path d="M16 6l-4-4-4 4M12 2v13" /></svg>Share
        </div>
      </div>

      {/* participants */}
      <div style={s('display:flex;align-items:center;justify-content:space-between;margin:22px 2px 11px')}>
        <span style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.4px;font-weight:600')}>Participants{people ? ` · ${people.length}` : ''}</span>
      </div>
      {people === null ? (
        <div style={s('font-size:12px;color:var(--text3);padding:6px 2px')}>Loading…</div>
      ) : people.length === 0 ? (
        <div style={s('font-size:12.5px;color:var(--text3);padding:16px;border:1px dashed var(--line2);border-radius:14px;text-align:center')}>No one’s joined yet — be the first.</div>
      ) : (
        <div style={s('display:flex;flex-direction:column;gap:9px')}>
          {people.map((p) => (
            <div key={p.athleteId} className={p.you ? undefined : 'ctl'} onClick={p.you ? undefined : () => actions.openAthlete?.(p.athleteId)}
              style={s('display:flex;align-items:center;gap:12px;background:var(--bg2);border:1px solid var(--line);border-radius:15px;padding:11px 13px')}>
              <AuthedAvatar avatarUrl={p.avatarUrl} token={token} initials={p.initials} color={p.avatarColor} size={40} radius={20} fontSize={14} />
              <div style={s('flex:1;min-width:0')}>
                <div style={s('font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{p.name}</div>
                <div style={s(`font-size:10.5px;margin-top:1px;${p.checkedIn ? 'color:var(--good);font-weight:700' : 'color:var(--text3)'}`)}>{p.checkedIn ? '✓ Checked in' : 'Going'}</div>
              </div>
              {p.you && <span style={s('flex:none;font-size:9px;font-weight:700;color:var(--accent);background:color-mix(in srgb,var(--accent) 15%,transparent);padding:3px 8px;border-radius:6px;text-transform:uppercase')}>You</span>}
            </div>
          ))}
        </div>
      )}

      {/* fullscreen route map — covers the whole screen, hides everything else */}
      {mapFull && hasRoute && (
        <div style={s('position:fixed;inset:0;z-index:300;background:var(--bg)')}>
          <RouteMapGL route={route} styleName={mapStyle} routeColor={rstyle.color} routeWidth={rstyle.width} arrowColor={rstyle.arrowColor} fitPadding={70} />
          <div style={s('position:absolute;top:16px;right:16px;z-index:5;display:flex;flex-direction:column;gap:8px')}>
            <div className="ctl" onClick={() => setMapFull(false)} aria-label="Close map"
              style={s(`width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;line-height:1;${glass}`)}>✕</div>
            <MapStyleControls mapStyle={mapStyle} cycleLayer={cycleLayer} styleOpen={styleOpen} setStyleOpen={setStyleOpen} />
          </div>
          {styleOpen && <RouteStylePanel rstyle={rstyle} applyRstyle={applyRstyle} onClose={() => setStyleOpen(false)} pos="position:absolute;top:16px;right:64px;z-index:6" />}
        </div>
      )}

      {/* directions — pick which navigation app to open */}
      {dirTarget && (
        <DirectionsSheet target={dirTarget} onClose={() => setDirTarget(null)}
          onPick={(url) => { (actions.openLink || ((u) => { try { window.open(u, '_blank', 'noopener'); } catch { /* ignore */ } }))(url); setDirTarget(null); }} />
      )}
    </div>
  );
}
