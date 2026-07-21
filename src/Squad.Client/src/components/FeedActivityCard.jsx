import { useMemo, useState } from 'react';
import { s } from '../lib/style.js';
import AuthedAvatar from './AuthedAvatar.jsx';
import AuthedImage from './AuthedImage.jsx';
import TileMap from './TileMap.jsx';
import { toPathD } from '../lib/tiles.js';
import { useActivityTrack } from '../hooks/useActivityTrack.js';
import { useInView } from '../hooks/useInView.js';
import { useActivityPhotos } from '../hooks/useActivityPhotos.js';
import { setKudos } from '../lib/interactions.js';

// Route trace colour on the feed maps — a warm Strava-style orange that reads the
// same in both themes (the basemap is always the light CARTO Voyager tileset).
const ROUTE = '#f2622d';

// Monochrome line glyph for the activity's sport, drawn beside the title (the
// feed's primary "what is this" cue now that the corner sport chip is gone).
// Three headline metrics per sport (label above, value below), matching the feed
// mock: rides show elevation, foot/water sports show pace, the gym shows HR + load.
function metricsFor(a) {
  const time = ['Time', a.moving];
  const distance = ['Distance', a.dist + (a.distU ? ' ' + a.distU : '')];
  const pace = ['Pace', a.avgSpeed + (a.speedU || '')];
  if (a.sport === 'Bike') return [distance, ['Elev Gain', a.elev + ' m'], time];
  if (a.sport === 'Run' || a.sport === 'Swim') return [distance, pace, time];
  return [time, ['Avg HR', a.avgHr ? a.avgHr + ' bpm' : '—'], ['Load', String(a.load)]];
}

// Downsample a recorded track to its GPS polyline ([lat,lon] pairs) for the feed map.
function routeLatLon(track, max = 300) {
  const gps = (track || []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (gps.length <= max) return gps.map((p) => [p.lat, p.lon]);
  const step = gps.length / max;
  const out = [];
  for (let i = 0; i < max; i++) out.push(gps[Math.floor(i * step)]);
  out.push(gps[gps.length - 1]);
  return out.map((p) => [p.lat, p.lon]);
}

// Real recorded route for a feed card — the ingested GPS track (GET .../track), the same
// data the detail screen maps. Renders nothing when the activity has no GPS (indoor /
// summary-only import) rather than faking a route.
function FeedRouteMap({ activityId, getToken }) {
  // Only fetch the (heavy) track + render tiles once the card scrolls near the viewport,
  // so an off-screen feed card costs nothing. rootMargin prefetches just before it shows.
  const [boxRef, inView] = useInView({ rootMargin: '400px 0px' });
  const { track, status } = useActivityTrack(activityId, { getToken, enabled: inView });
  const pts = useMemo(() => routeLatLon(track), [track]);
  const waiting = !inView || status === 'loading';
  return (
    <div ref={boxRef}>
      {waiting
        ? <div style={s('margin-top:14px;aspect-ratio:356/150;border-radius:14px;background:var(--bg3);border:1px solid var(--line)')} />
        : pts.length < 2
          ? null
          : (
    <div style={s('margin-top:14px')}>
      <TileMap points={pts} radius={14} pad={22} H={150}>
        {(project) => {
          const d = toPathD(pts, project);
          const start = project(pts[0][0], pts[0][1]);
          const end = project(pts[pts.length - 1][0], pts[pts.length - 1][1]);
          return (
            <>
              <path d={d} fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
              <path d={d} fill="none" stroke={ROUTE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={start.x} cy={start.y} r="4.5" fill="var(--good)" stroke="#fff" strokeWidth="2" />
              <circle cx={end.x} cy={end.y} r="4.5" fill={ROUTE} stroke="#fff" strokeWidth="2" />
            </>
          );
        }}
      </TileMap>
    </div>
          )}
    </div>
  );
}

// Photos attached to (or captured in-ride during) an activity — a horizontal strip
// under the map. Renders nothing until it resolves / when the activity has none.
function FeedPhotos({ activityId, token, getToken }) {
  const { photos } = useActivityPhotos(activityId, { getToken, enabled: !!activityId });
  if (!photos.length) return null;
  const single = photos.length === 1;
  return (
    <div style={s(`display:grid;gap:8px;margin-top:14px;grid-template-columns:${single ? '1fr' : 'repeat(3,1fr)'}`)}>
      {photos.slice(0, 6).map((p) => (
        <AuthedImage key={p.id} url={p.url} token={token}
          style={`width:100%;${single ? 'aspect-ratio:16/9' : 'aspect-ratio:1'};border-radius:14px;border:1px solid var(--line)`} />
      ))}
    </div>
  );
}

// One rich activity card for the feed — athlete row, sport title, headline metrics,
// optional achievement banner, real recorded route map, attached photos, kudos footer.
// Shared by the Activities screen and the Dashboard's last-7-days team feed.
export default function FeedActivityCard({ a, onOpen, onAthlete, token, getToken }) {
  const metrics = metricsFor(a);
  const meta = [a.when, a.location].filter(Boolean).join(' · ');
  const stop = (e) => e.stopPropagation();

  // Kudos are a toggle held locally (seeded from the server row) so the tap responds
  // instantly; the API call reconciles the count and reverts on failure.
  const [kudoed, setKudoed] = useState(!!a.iKudoed);
  const [kudos, setKudos_] = useState(a.kudos || 0);
  const [busy, setBusy] = useState(false);
  const toggleKudos = async (e) => {
    stop(e);
    if (busy) return;
    const next = !kudoed;
    setBusy(true);
    setKudoed(next);
    setKudos_((n) => Math.max(0, n + (next ? 1 : -1)));
    try {
      const tk = getToken ? await getToken() : token;
      const st = await setKudos(a.id, next, tk);
      setKudoed(!!st.kudoed);
      setKudos_(st.count);
    } catch {
      setKudoed(!next);
      setKudos_((n) => Math.max(0, n + (next ? -1 : 1)));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ctl" onClick={() => onOpen(a.id)} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:18px;padding:15px;box-shadow:var(--shadow)')}>
      {/* athlete row */}
      <div style={s('display:flex;align-items:center;gap:11px')}>
        <div className="ctl" onClick={(e) => { stop(e); onAthlete(a.athleteId); }} style={s('flex:none')}>
          <AuthedAvatar avatarUrl={a.avatarUrl} token={token} initials={a.initials} color={a.color} size={40} radius={12} fontSize={14} />
        </div>
        <div style={s('flex:1;min-width:0;display:flex;align-items:baseline;gap:7px')}>
          <span style={s('font-size:13.5px;font-weight:700;flex:none')}>{a.athleteName}</span>
          {meta && <span style={s('font-size:11px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>· {meta}</span>}
        </div>
        {/* activity type — right-aligned pill, matching the activity detail header */}
        <div style={s(`background:color-mix(in srgb,${a.sportColor} 16%,transparent);color:${a.sportColor};font-size:10px;font-weight:700;padding:4px 9px;border-radius:7px;text-transform:uppercase;flex:none`)}>{a.sport}</div>
      </div>

      {/* title */}
      <div style={s('font-size:18px;font-weight:700;letter-spacing:-.3px;margin-top:12px')}>{a.title}</div>

      {/* headline metrics — label above, value below */}
      <div style={s('display:flex;margin-top:14px')}>
        {metrics.map(([l, v], i) => (
          <div key={l} style={s('flex:1' + (i > 0 ? ';border-left:1px solid var(--line);padding-left:14px' : ''))}>
            <div style={s('font-size:10.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.4px;font-weight:600')}>{l}</div>
            <div className="mono" style={s('font-size:20px;font-weight:700;margin-top:3px')}>{v}</div>
          </div>
        ))}
      </div>

      {/* achievement banner (shows once the backend fills in achievements) */}
      {a.achievements > 0 && (
        <div style={s('display:flex;align-items:center;gap:10px;margin-top:14px;padding:11px 13px;border-radius:12px;background:var(--bg3);border:1px solid var(--line)')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--good)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6" /><path d="M9 13.5L7 22l5-3 5 3-2-8.5" /></svg>
          <span style={s('font-size:12.5px;font-weight:600')}>{a.achievements} new achievement{a.achievements > 1 ? 's' : ''} · Give {a.athleteName} kudos</span>
        </div>
      )}

      {/* real recorded route (rides + runs with GPS) */}
      {(a.sport === 'Bike' || a.sport === 'Run') && <FeedRouteMap activityId={a.id} getToken={getToken} />}

      {/* attached / in-ride photos */}
      <FeedPhotos activityId={a.id} token={token} getToken={getToken} />

      {/* kudos footer — your own activity shows a read-only count (no self-kudos) */}
      <div style={s('display:flex;align-items:center;gap:10px;margin-top:14px;padding-top:13px;border-top:1px solid var(--line)')}>
        <span style={s('flex:1;font-size:12.5px;color:var(--text2)')}>{kudos > 0 ? `${kudos} kudos` : (a.isMe ? 'No kudos yet' : 'Be the first to give kudos!')}</span>
        {a.isMe ? (
          <div title="Kudos" style={s('display:flex;align-items:center;justify-content:center;gap:5px;min-width:38px;height:32px;padding:0 10px;border-radius:9px;background:var(--bg3);border:1px solid var(--line);color:var(--text3)')}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM7 10l4-7a2 2 0 0 1 2 2v3h5a2 2 0 0 1 2 2.3l-1.3 7a2 2 0 0 1-2 1.7H7" /></svg>
            {kudos > 0 && <span className="mono" style={s('font-size:11px;font-weight:700')}>{kudos}</span>}
          </div>
        ) : (
          <div className="ctl" onClick={toggleKudos} title={kudoed ? 'Remove kudos' : 'Give kudos'} style={s(`display:flex;align-items:center;justify-content:center;gap:5px;min-width:38px;height:32px;padding:0 10px;border-radius:9px;${kudoed ? 'background:var(--accent);border:1px solid var(--accent);color:var(--accent-ink)' : 'background:var(--bg3);border:1px solid var(--line);color:var(--text2)'};opacity:${busy ? 0.6 : 1};transition:background .15s`)}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill={kudoed ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM7 10l4-7a2 2 0 0 1 2 2v3h5a2 2 0 0 1 2 2.3l-1.3 7a2 2 0 0 1-2 1.7H7" /></svg>
            {kudos > 0 && <span className="mono" style={s('font-size:11px;font-weight:700')}>{kudos}</span>}
          </div>
        )}
        <div className="ctl" onClick={(e) => { stop(e); onOpen(a.id); }} title="Comments" style={s('display:flex;align-items:center;justify-content:center;gap:5px;min-width:38px;height:32px;padding:0 10px;border-radius:9px;background:var(--bg3);border:1px solid var(--line);color:var(--text2)')}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-4-.9L3 21l1.9-5a8.4 8.4 0 0 1-.9-4 8.5 8.5 0 0 1 17 0z" /></svg>
          {a.comments > 0 && <span className="mono" style={s('font-size:11px;font-weight:700')}>{a.comments}</span>}
        </div>
      </div>
    </div>
  );
}
