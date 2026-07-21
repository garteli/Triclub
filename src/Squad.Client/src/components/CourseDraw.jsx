import { useEffect, useRef, useState } from 'react';
import { s } from '../lib/style.js';
import { haversineMeters } from '../lib/geo.js';
import { courseNameFromPoints } from '../lib/courses.js';

// Draw a course by tapping points on an interactive map. Full-screen overlay; lazy-loads MapLibre
// (never touches the main bundle). Tap to add a vertex, undo/clear, then name + save. `onSave(name,
// points, km)` gets the [[lat,lon],…] polyline; `onCancel` closes without saving. `initialCenter`
// ([lat,lon]) seeds the camera (e.g. the current ride's start); falls back to a regional default.

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

export default function CourseDraw({ onCancel, onSave, initialCenter }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const ptsRef = useRef([]);
  const [pts, setPts] = useState([]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const km = distKm(pts);

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
        map.on('click', (e) => {
          ptsRef.current = [...ptsRef.current, [e.lngLat.lat, e.lngLat.lng]];
          setPts(ptsRef.current);
        });
        setTimeout(() => map && map.resize(), 60);
      } catch { if (!cancelled) setFailed(true); }
    })();
    return () => { cancelled = true; if (map) map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push the current points into the map's line + vertex sources.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.getSource('line')?.setData(lineData(pts));
    map.getSource('verts')?.setData(vertData(pts));
  }, [pts, ready]);

  const setPoints = (next) => { ptsRef.current = next; setPts(next); };
  const undo = () => setPoints(ptsRef.current.slice(0, -1));
  const clear = () => setPoints([]);

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
      {/* header */}
      {/* Header sits below the status bar / notch: the fixed overlay covers the safe-area, so pad the
          top by env(safe-area-inset-top) or "Cancel" lands under the notch and can't be tapped. */}
      <div style={s('flex:none;display:flex;align-items:center;justify-content:space-between;padding:calc(12px + env(safe-area-inset-top)) 8px 12px;border-bottom:1px solid var(--line2)')}>
        <div className="ctl" onClick={busy ? undefined : onCancel} style={s('font-size:13px;color:var(--text2);font-weight:700;padding:6px 10px')}>Cancel</div>
        <div style={s('font-size:15px;font-weight:700')}>Draw a course</div>
        <div style={s('font-size:12px;color:var(--text3);font-weight:600;min-width:56px;text-align:right;padding-right:8px')}>{pts.length} · {km.toFixed(1)}km</div>
      </div>

      {/* map */}
      <div style={s('flex:1;position:relative;min-height:0')}>
        <div ref={elRef} style={{ position: 'absolute', inset: 0 }} />
        {failed && (
          <div style={s('position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;font-size:13px;color:var(--text3);line-height:1.5')}>
            The map couldn’t load (needs a network connection). Try “Save last ride” or “Import GPX” instead.
          </div>
        )}
        {!failed && pts.length === 0 && (
          <div style={s('position:absolute;left:50%;bottom:16px;transform:translateX(-50%);background:rgba(0,0,0,.6);color:#fff;font-size:12px;font-weight:600;padding:8px 14px;border-radius:999px;pointer-events:none;white-space:nowrap')}>
            Tap the map to drop points
          </div>
        )}
      </div>

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
          <div style={s('display:flex;gap:10px')}>
            <div className={pts.length ? 'ctl' : undefined} onClick={pts.length ? undo : undefined}
              style={s(`flex:1;text-align:center;padding:13px;border-radius:12px;font-weight:700;font-size:13.5px;background:var(--bg2);border:1px solid var(--line);color:var(--text);opacity:${pts.length ? 1 : 0.45}`)}>Undo</div>
            <div className={pts.length ? 'ctl' : undefined} onClick={pts.length ? clear : undefined}
              style={s(`flex:1;text-align:center;padding:13px;border-radius:12px;font-weight:700;font-size:13.5px;background:var(--bg2);border:1px solid var(--line);color:var(--text);opacity:${pts.length ? 1 : 0.45}`)}>Clear</div>
            <div className={pts.length >= 2 ? 'ctl' : undefined} onClick={pts.length >= 2 ? startSave : undefined}
              style={s(`flex:1.4;text-align:center;padding:13px;border-radius:12px;font-weight:700;font-size:13.5px;background:var(--accent);color:var(--accent-ink);opacity:${pts.length >= 2 ? 1 : 0.45}`)}>Save course</div>
          </div>
        )}
      </div>
    </div>
  );
}
