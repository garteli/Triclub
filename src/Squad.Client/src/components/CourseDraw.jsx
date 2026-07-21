import { useEffect, useRef, useState } from 'react';
import { s } from '../lib/style.js';
import { haversineMeters } from '../lib/geo.js';
import { courseNameFromPoints } from '../lib/courses.js';

// Draw a course by tapping points on an interactive map. Full-screen overlay; lazy-loads MapLibre
// (never touches the main bundle). Tap to add waypoints (straight lines, or routed along roads),
// undo/clear, then name + save. `onSave(name, points, km)` gets the [[lat,lon],…] polyline;
// `onCancel` closes without saving. `initialCenter` ([lat,lon]) seeds the camera.

// CARTO Voyager raster basemap — same tiles RouteMapGL uses (kept local to avoid coupling).
const baseTiles = () => ['a', 'b', 'c', 'd'].map((sd) => `https://${sd}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png`);
const buildStyle = () => ({
  version: 8,
  sources: { base: { type: 'raster', tiles: baseTiles(), tileSize: 256, attribution: '© OpenStreetMap · © CARTO' } },
  layers: [{ id: 'base', type: 'raster', source: 'base' }],
});

const EMPTY_LINE = { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } };
const lineData = (pts) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: pts.map(([la, lo]) => [lo, la]) } });
const vertData = (pts) => ({
  type: 'FeatureCollection',
  features: pts.map(([la, lo], i) => ({ type: 'Feature', properties: { start: i === 0 ? 1 : 0 }, geometry: { type: 'Point', coordinates: [lo, la] } })),
});

const distKm = (pts) => {
  let m = 0;
  for (let i = 1; i < pts.length; i++) m += haversineMeters({ lat: pts[i - 1][0], lon: pts[i - 1][1] }, { lat: pts[i][0], lon: pts[i][1] });
  return m / 1000;
};

// Flatten waypoints + their legs into one [lat,lon] polyline. Each leg includes both endpoints, so
// the join point is dropped when concatenating. (A leg is a straight [prev,wp] or a routed path.)
function flattenLegs(waypoints, legs) {
  if (waypoints.length === 0) return [];
  if (waypoints.length === 1) return [waypoints[0]];
  const out = [];
  legs.forEach((leg, i) => { (i === 0 ? leg : leg.slice(1)).forEach((p) => out.push(p)); });
  return out.length ? out : waypoints.slice();
}

// Road-following route between two [lat,lon] points via the OSRM public demo (cycling profile,
// no key, CORS-enabled). Returns a [[lat,lon],…] polyline, or null on any failure (caller then
// falls back to a straight line). Best-effort — the demo server is rate-limited.
async function routeRoads(a, b, signal) {
  try {
    const url = `https://router.project-osrm.org/route/v1/cycling/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    const coords = data?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    return coords.map(([lo, la]) => [la, lo]);
  } catch { return null; }
}

// Sample N points evenly ALONG the polyline (interpolating inside segments), each with its
// cumulative distance (m) — so the elevation profile reflects the whole route, not just vertices.
function sampleAlong(pts, N) {
  if (pts.length < 2) return [];
  const seg = []; let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = haversineMeters({ lat: pts[i - 1][0], lon: pts[i - 1][1] }, { lat: pts[i][0], lon: pts[i][1] });
    seg.push({ a: pts[i - 1], b: pts[i], d, start: total }); total += d;
  }
  if (total === 0) return [];
  const out = [];
  for (let k = 0; k < N; k++) {
    const target = (total * k) / (N - 1);
    const sg = seg.find((x) => target <= x.start + x.d) || seg[seg.length - 1];
    const f = sg.d ? (target - sg.start) / sg.d : 0;
    out.push({ lat: sg.a[0] + (sg.b[0] - sg.a[0]) * f, lon: sg.a[1] + (sg.b[1] - sg.a[1]) * f, dist: target });
  }
  return out;
}

// Terrain elevations for a set of points (Open-Meteo elevation API — CORS-enabled, no key; same
// provider the app already uses for weather). Returns metres[] aligned to the samples.
async function fetchElevations(samples, signal) {
  const lat = samples.map((s) => s.lat.toFixed(5)).join(',');
  const lon = samples.map((s) => s.lon.toFixed(5)).join(',');
  const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`, { signal });
  if (!res.ok) throw new Error('elevation');
  return (await res.json()).elevation || [];
}

// Compact elevation profile (elevation vs distance) for the drawn route.
function ElevChart({ elev }) {
  const H = 42, W = 300;
  if (!elev || elev.profile.length < 2) return <div style={s(`height:${H}px;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--text3)`)}>—</div>;
  const { profile, min, max } = elev;
  const total = profile[profile.length - 1].dist || 1;
  const span = Math.max(1, max - min);
  const px = (d) => (d / total) * W;
  const py = (e) => H - 2 - ((e - min) / span) * (H - 8);
  const line = profile.map((p, i) => `${i ? 'L' : 'M'}${px(p.dist).toFixed(1)},${py(p.e).toFixed(1)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, display: 'block' }}>
      <path d={area} fill="var(--accent)" opacity="0.14" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function CourseDraw({ onCancel, onSave, initialCenter }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const wpRef = useRef([]);      // tapped waypoints [[lat,lon],…]
  const legsRef = useRef([]);    // leg i = polyline from wp[i] to wp[i+1] (inclusive of both ends)
  const followRef = useRef(false);
  const ptsRef = useRef([]);     // flattened geometry (what gets saved)
  const [waypoints, setWaypoints] = useState([]);
  const [pts, setPts] = useState([]);
  const [follow, setFollow] = useState(false); // follow roads vs straight lines
  const [routing, setRouting] = useState(0);   // in-flight route requests
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [elev, setElev] = useState(null); // { profile:[{dist,e}], ascent, min, max } | null
  const [elevLoading, setElevLoading] = useState(false);

  const km = distKm(pts);
  const canSave = waypoints.length >= 2 && pts.length >= 2;

  // Recompute the rendered/saved polyline from waypoints + legs, and sync the vertex state.
  const rebuild = () => {
    const flat = flattenLegs(wpRef.current, legsRef.current);
    ptsRef.current = flat;
    setPts(flat);
    setWaypoints([...wpRef.current]);
  };

  useEffect(() => { followRef.current = follow; }, [follow]);

  // Elevation profile from the terrain — debounced so tapping fast doesn't hammer the API, and the
  // previous request is aborted when the route changes. Cleared when there's nothing to profile.
  useEffect(() => {
    if (pts.length < 2) { setElev(null); setElevLoading(false); return undefined; }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setElevLoading(true);
      try {
        const samples = sampleAlong(pts, Math.min(90, Math.max(12, pts.length * 2)));
        const els = await fetchElevations(samples, ctrl.signal);
        if (els.length !== samples.length) throw new Error('mismatch');
        let ascent = 0;
        for (let i = 1; i < els.length; i++) { const d = els[i] - els[i - 1]; if (d > 0) ascent += d; }
        setElev({ profile: samples.map((s, i) => ({ dist: s.dist, e: els[i] })), ascent: Math.round(ascent), min: Math.min(...els), max: Math.max(...els) });
      } catch (e) { if (e.name !== 'AbortError') setElev(null); }
      finally { setElevLoading(false); }
    }, 700);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [pts]);

  // Create the map ONCE and drive the drawing imperatively (no re-create on each tap).
  useEffect(() => {
    let map, cancelled = false;
    (async () => {
      try {
        const maplibregl = (await import('maplibre-gl')).default;
        await import('maplibre-gl/dist/maplibre-gl.css');
        if (cancelled || !elRef.current) return;
        const c = Array.isArray(initialCenter) && Number.isFinite(initialCenter[0])
          ? [initialCenter[1], initialCenter[0]] : [34.9, 32.0];
        map = new maplibregl.Map({
          container: elRef.current, style: buildStyle(), center: c, zoom: 13,
          attributionControl: true, fadeDuration: 0, renderWorldCopies: false, maxPitch: 0,
        });
        mapRef.current = map;
        map.on('error', (e) => { const m = e?.error?.message || String(e?.error || e); if (!/tile|404|Failed to fetch|AbortError/i.test(m)) console.error('MAPLIBRE', m); });
        map.on('load', () => {
          map.addSource('line', { type: 'geojson', data: EMPTY_LINE });
          map.addLayer({ id: 'line', type: 'line', source: 'line', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#d6ff3f', 'line-width': 4 } });
          map.addSource('verts', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          map.addLayer({ id: 'verts', type: 'circle', source: 'verts', paint: {
            'circle-radius': ['case', ['==', ['get', 'start'], 1], 7, 5],
            'circle-color': ['case', ['==', ['get', 'start'], 1], '#4fe08b', '#d6ff3f'],
            'circle-stroke-color': '#0c0e11', 'circle-stroke-width': 2,
          } });
          setReady(true);
        });
        // Tap adds a waypoint. A straight leg is drawn immediately; in follow-roads mode it's then
        // upgraded in place to the road-following geometry when the route request returns.
        map.on('click', (e) => {
          const wp = [e.lngLat.lat, e.lngLat.lng];
          const prev = wpRef.current[wpRef.current.length - 1];
          wpRef.current = [...wpRef.current, wp];
          if (prev) {
            const straight = [prev, wp];
            legsRef.current = [...legsRef.current, straight];
            rebuild();
            if (followRef.current) {
              setRouting((n) => n + 1);
              routeRoads(prev, wp).then((geo) => {
                const i = legsRef.current.indexOf(straight);
                if (i >= 0 && geo) { legsRef.current[i] = geo; rebuild(); }
              }).finally(() => setRouting((n) => Math.max(0, n - 1)));
            }
          } else {
            rebuild();
          }
        });
        setTimeout(() => map && map.resize(), 60);
      } catch { if (!cancelled) setFailed(true); }
    })();
    return () => { cancelled = true; if (map) map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push the current geometry into the map's line source and the waypoints into the vertex source.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.getSource('line')?.setData(lineData(pts));
    map.getSource('verts')?.setData(vertData(waypoints));
  }, [pts, waypoints, ready]);

  const undo = () => { wpRef.current = wpRef.current.slice(0, -1); legsRef.current = legsRef.current.slice(0, -1); rebuild(); };
  const clear = () => { wpRef.current = []; legsRef.current = []; rebuild(); };

  const startSave = () => { setName(courseNameFromPoints(ptsRef.current)); setError(''); setNaming(true); };
  const confirmSave = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await onSave((name || 'Course').trim(), ptsRef.current, km || null);
      // parent closes the whole picker on success
    } catch (e) { setError(e?.message || 'Could not save the course.'); setBusy(false); }
  };

  return (
    <div style={s('position:fixed;inset:0;z-index:60;background:var(--bg);display:flex;flex-direction:column')}>
      {/* Header sits below the status bar / notch: the fixed overlay covers the safe-area, so pad the
          top by env(safe-area-inset-top) or "Cancel" lands under the notch and can't be tapped. */}
      <div style={s('flex:none;display:flex;align-items:center;justify-content:space-between;padding:calc(12px + env(safe-area-inset-top)) 8px 12px;border-bottom:1px solid var(--line2)')}>
        <div className="ctl" onClick={busy ? undefined : onCancel} style={s('font-size:13px;color:var(--text2);font-weight:700;padding:6px 10px')}>Cancel</div>
        <div style={s('font-size:15px;font-weight:700')}>Draw a course</div>
        <div style={s('font-size:12px;color:var(--text3);font-weight:600;min-width:64px;text-align:right;padding-right:8px')}>{waypoints.length} pts · {km.toFixed(1)}km</div>
      </div>

      {/* map */}
      <div style={s('flex:1;position:relative;min-height:0')}>
        <div ref={elRef} style={{ position: 'absolute', inset: 0 }} />
        {failed && (
          <div style={s('position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;font-size:13px;color:var(--text3);line-height:1.5')}>
            The map couldn’t load (needs a network connection). Try “Save last ride” or “Import GPX” instead.
          </div>
        )}
        {!failed && waypoints.length === 0 && (
          <div style={s('position:absolute;left:50%;bottom:16px;transform:translateX(-50%);background:rgba(0,0,0,.6);color:#fff;font-size:12px;font-weight:600;padding:8px 14px;border-radius:999px;pointer-events:none;white-space:nowrap')}>
            Tap the map to drop points
          </div>
        )}
        {routing > 0 && (
          <div style={s('position:absolute;top:10px;right:10px;background:rgba(0,0,0,.6);color:#fff;font-size:11px;font-weight:700;padding:5px 10px;border-radius:999px;pointer-events:none')}>routing…</div>
        )}
      </div>

      {/* elevation profile (distance + ascent from the terrain) */}
      {waypoints.length >= 2 && !naming && (
        <div style={s('flex:none;padding:8px 14px 2px')}>
          <div style={s('display:flex;align-items:center;justify-content:space-between;margin-bottom:3px')}>
            <span style={s('font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.9px;color:var(--text3)')}>Elevation · {km.toFixed(1)} km</span>
            <span style={s('font-size:11px;font-weight:700;color:var(--text2)')}>{elevLoading ? 'reading terrain…' : elev ? `↑ ${elev.ascent} m` : ''}</span>
          </div>
          <ElevChart elev={elev} />
        </div>
      )}

      {/* footer controls */}
      <div style={s('flex:none;padding:12px 16px calc(12px + env(safe-area-inset-bottom));border-top:1px solid var(--line2);background:var(--bg)')}>
        {naming ? (
          <>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Course name" disabled={busy}
              style={s('width:100%;box-sizing:border-box;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-size:14px;color:var(--text);outline:none;font-family:inherit')} />
            {error && <div style={s('font-size:12px;color:var(--bad);font-weight:600;margin-top:9px')}>{error}</div>}
            <div style={s('display:flex;gap:10px;margin-top:12px')}>
              <div className="ctl" onClick={busy ? undefined : () => setNaming(false)} style={s('flex:1;text-align:center;padding:13px;border-radius:12px;font-weight:700;font-size:14px;background:var(--bg3);border:1px solid var(--line);color:var(--text2)')}>Back</div>
              <div className="ctl" onClick={confirmSave} style={s(`flex:1;text-align:center;padding:13px;border-radius:12px;font-weight:700;font-size:14px;background:var(--accent);color:var(--accent-ink);opacity:${busy ? 0.7 : 1}`)}>{busy ? 'Saving…' : 'Save course'}</div>
            </div>
          </>
        ) : (
          <>
            {/* Follow-roads toggle: route each new segment along roads (best-effort) vs straight lines. */}
            <div style={s('display:flex;align-items:center;gap:9px;margin-bottom:10px')}>
              <div className="ctl" onClick={() => setFollow((v) => !v)}
                style={s(`display:flex;align-items:center;gap:7px;padding:9px 13px;border-radius:11px;font-size:12.5px;font-weight:700;${follow ? 'background:var(--accent);color:var(--accent-ink)' : 'background:var(--bg2);border:1px solid var(--line);color:var(--text)'}`)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19l6-14M20 19l-6-14M9 9h6M8 14h8" /></svg>
                Follow roads
              </div>
              <span style={s('flex:1;font-size:11px;color:var(--text3);line-height:1.35')}>{follow ? 'New points route along roads.' : 'Points connect with straight lines.'}</span>
            </div>
            <div style={s('display:flex;gap:10px')}>
              <div className={waypoints.length ? 'ctl' : undefined} onClick={waypoints.length ? undo : undefined}
                style={s(`flex:1;text-align:center;padding:13px;border-radius:12px;font-weight:700;font-size:13.5px;background:var(--bg2);border:1px solid var(--line);color:var(--text);opacity:${waypoints.length ? 1 : 0.45}`)}>Undo</div>
              <div className={waypoints.length ? 'ctl' : undefined} onClick={waypoints.length ? clear : undefined}
                style={s(`flex:1;text-align:center;padding:13px;border-radius:12px;font-weight:700;font-size:13.5px;background:var(--bg2);border:1px solid var(--line);color:var(--text);opacity:${waypoints.length ? 1 : 0.45}`)}>Clear</div>
              <div className={canSave ? 'ctl' : undefined} onClick={canSave ? startSave : undefined}
                style={s(`flex:1.4;text-align:center;padding:13px;border-radius:12px;font-weight:700;font-size:13.5px;background:var(--accent);color:var(--accent-ink);opacity:${canSave ? 1 : 0.45}`)}>Save course</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
