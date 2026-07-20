import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { s } from '../lib/style.js';
import AuthedAvatar from './AuthedAvatar.jsx';

// Full-screen 3D route map (MapLibre GL): our CARTO basemap draped over free AWS terrain
// DEM tiles, with a 2D/3D pitch toggle, compass, basemap layers, replay, and an athlete
// sheet — the Strava-style full page. MapLibre is lazy-loaded so it never touches the main
// bundle. Portaled to <body> so it's a true viewport overlay (and reliably exitable).
const TILE_SEG = { voyager: 'voyager', light: 'light_all', dark: 'dark_all' };
const MAP_STYLES = ['voyager', 'light', 'dark'];
const glass = 'background:rgba(20,23,29,.82);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.14);color:#fff';
const validPts = (route) => (route || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
const baseTiles = (style) => ['a', 'b', 'c', 'd'].map((sd) => `https://${sd}.basemaps.cartocdn.com/rastertiles/${TILE_SEG[style] || 'voyager'}/{z}/{x}/{y}.png`);

const buildStyle = (style) => ({
  version: 8,
  sources: {
    base: { type: 'raster', tiles: baseTiles(style), tileSize: 256, attribution: '© OpenStreetMap · © CARTO' },
    dem: { type: 'raster-dem', tiles: ['https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'], tileSize: 256, encoding: 'terrarium', maxzoom: 14 },
  },
  layers: [{ id: 'base', type: 'raster', source: 'base' }],
});

export default function FullMap({ route, style: initialStyle = 'voyager', a, token, onClose }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const headRef = useRef(null);
  const rafRef = useRef(0);
  // Render inside the phone frame (not <body>) so the overlay is bounded to the app —
  // otherwise it covers the whole window: huge/slow, controls off-frame, back untappable.
  const targetRef = useRef(null);
  if (!targetRef.current && typeof document !== 'undefined') targetRef.current = document.querySelector('.phone') || document.body;
  const inPhone = targetRef.current && targetRef.current !== document.body;
  const safeTop = (px) => `calc(env(safe-area-inset-top, 0px) + ${px}px)`;
  const [mapStyle, setMapStyle] = useState(initialStyle);
  const [is3D, setIs3D] = useState(true);
  const [bearing, setBearing] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const speedRef = useRef(1);
  speedRef.current = speed;
  const [error, setError] = useState(false);

  useEffect(() => {
    let map, cancelled = false;
    (async () => {
      try {
        const maplibregl = (await import('maplibre-gl')).default;
        await import('maplibre-gl/dist/maplibre-gl.css');
        if (cancelled || !elRef.current) return;
        const pts = validPts(route);
        map = new maplibregl.Map({
          container: elRef.current, style: buildStyle(mapStyle),
          center: pts.length ? [pts[0][1], pts[0][0]] : [34.9, 32.0],
          zoom: 10, pitch: 62, bearing: 0, maxPitch: 80, attributionControl: true,
          fadeDuration: 0, renderWorldCopies: false,
        });
        mapRef.current = map;
        map.on('rotate', () => setBearing(map.getBearing()));
        map.on('error', (e) => { const m = e?.error?.message || String(e?.error || e); if (!/tile|404|Failed to fetch|AbortError/i.test(m)) console.error('MAPLIBRE', m); }); // ignore benign tile 404s
        map.on('load', () => {
          try { map.setTerrain({ source: 'dem', exaggeration: 1.3 }); } catch { /* no webgl2 terrain */ }
          if (pts.length > 1) {
            map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: pts.map(([la, lo]) => [lo, la]) } } });
            map.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ff6a2c', 'line-width': 4 } });
            // Start/end as circle layers (canvas-rendered, same reliable path as the line).
            map.addSource('ends', { type: 'geojson', data: { type: 'FeatureCollection', features: [
              { type: 'Feature', properties: { c: '#4fe08b' }, geometry: { type: 'Point', coordinates: [pts[0][1], pts[0][0]] } },
              { type: 'Feature', properties: { c: '#ff5d5d' }, geometry: { type: 'Point', coordinates: [pts[pts.length - 1][1], pts[pts.length - 1][0]] } },
            ] } });
            map.addLayer({ id: 'ends', type: 'circle', source: 'ends', paint: { 'circle-radius': 6, 'circle-color': ['get', 'c'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5 } });
            const b = new maplibregl.LngLatBounds();
            pts.forEach(([la, lo]) => b.extend([lo, la]));
            map.fitBounds(b, { padding: { top: 90, bottom: 170, left: 40, right: 40 }, pitch: 62, bearing: 0, duration: 0 });
          }
        });
        setTimeout(() => map && map.resize(), 80);
      } catch { if (!cancelled) setError(true); }
    })();
    return () => { cancelled = true; cancelAnimationFrame(rafRef.current); if (map) map.remove(); mapRef.current = null; headRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  useEffect(() => { const src = mapRef.current?.getSource('base'); if (src) src.setTiles(baseTiles(mapStyle)); }, [mapStyle]);

  const cycleStyle = () => setMapStyle((st) => MAP_STYLES[(MAP_STYLES.indexOf(st) + 1) % MAP_STYLES.length]);
  const toggle3D = () => { const m = mapRef.current; if (!m) return; const next = !is3D; setIs3D(next); m.easeTo({ pitch: next ? 62 : 0, duration: 600 }); };
  const resetNorth = () => mapRef.current?.easeTo({ bearing: 0, duration: 400 });

  const togglePlay = async () => {
    const m = mapRef.current, pts = validPts(route);
    if (!m || pts.length < 2) return;
    if (playing) { cancelAnimationFrame(rafRef.current); setPlaying(false); return; }
    if (!headRef.current) {
      const maplibregl = (await import('maplibre-gl')).default;
      const el = document.createElement('div');
      el.style.cssText = 'width:16px;height:16px;border-radius:50%;background:#111;border:2px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.3)';
      headRef.current = new maplibregl.Marker({ element: el }).setLngLat([pts[0][1], pts[0][0]]).addTo(m);
    }
    setPlaying(true);
    // Accumulate progress each frame so a mid-replay speed change (1×/2×/4×) applies live.
    let last = null, prog = 0;
    const step = (ts) => {
      if (last == null) last = ts;
      prog += ((ts - last) / 22000) * speedRef.current;
      last = ts;
      if (prog >= 1) { const [la, lo] = pts[pts.length - 1]; headRef.current.setLngLat([lo, la]); setPlaying(false); return; }
      const [la, lo] = pts[Math.floor(prog * (pts.length - 1))];
      headRef.current.setLngLat([lo, la]);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  };

  const overlay = (
    <div style={s(`position:${inPhone ? 'absolute' : 'fixed'};inset:0;z-index:4000;background:var(--bg);overflow:hidden`)}>
      <div ref={elRef} style={{ position: 'absolute', inset: 0 }} />
      {error && <div style={s('position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:13px;text-align:center;padding:0 30px')}>3D map couldn’t load here (needs WebGL).</div>}

      {/* back (exit) */}
      <div className="ctl" onClick={onClose} title="Close" style={{ ...s(`position:absolute;left:16px;z-index:1200;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;${glass}`), top: safeTop(14) }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg>
      </div>
      {/* Save Route + overflow (visual) */}
      <div style={{ ...s('position:absolute;right:16px;z-index:1200;display:flex;gap:8px'), top: safeTop(14) }}>
        <div className="ctl" style={s(`height:40px;padding:0 14px;border-radius:20px;display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;${glass}`)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>Save Route
        </div>
        <div className="ctl" style={s(`width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;letter-spacing:1px;${glass}`)}>···</div>
      </div>
      {/* layers · 2D/3D · compass */}
      <div style={{ ...s('position:absolute;right:16px;z-index:1200;display:flex;flex-direction:column;gap:8px'), top: safeTop(64) }}>
        <div className="ctl" onClick={cycleStyle} title={`Map: ${mapStyle}`} style={s(`width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;${glass}`)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M12 2l9 5-9 5-9-5z" /><path d="M3 12l9 5 9-5M3 17l9 5 9-5" /></svg>
        </div>
        <div className="ctl" onClick={toggle3D} title={is3D ? 'Switch to 2D' : 'Switch to 3D'} style={s(`width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;${glass}`)}>{is3D ? '2D' : '3D'}</div>
        <div className="ctl" onClick={resetNorth} title="Reset north" style={s(`width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;${glass}`)}>
          <svg width="20" height="20" viewBox="0 0 24 24" style={{ transform: `rotate(${-bearing}deg)` }}><path d="M12 3l3.2 8H8.8z" fill="var(--bad)" /><path d="M12 21l-3.2-8h6.4z" fill="#fff" /></svg>
        </div>
      </div>
      {/* play (route replay) + speed */}
      {validPts(route).length > 1 && (
        <div style={s('position:absolute;right:16px;bottom:120px;z-index:1200;display:flex;flex-direction:column;align-items:center;gap:9px')}>
          <div className="ctl" onClick={() => setSpeed((sp) => (sp >= 4 ? 1 : sp * 2))} title="Playback speed" style={s(`min-width:38px;height:30px;padding:0 9px;border-radius:15px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;${glass}`)}>{speed}×</div>
          <button onClick={togglePlay} aria-label={playing ? 'Pause replay' : 'Play replay'}
            style={s('width:54px;height:54px;border-radius:50%;border:none;background:var(--accent);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;box-shadow:0 8px 20px -6px color-mix(in srgb,var(--accent) 60%,transparent)')}>
            {playing
              ? <svg width="20" height="20" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1.2" fill="var(--accent-ink)" /><rect x="14" y="4" width="4" height="16" rx="1.2" fill="var(--accent-ink)" /></svg>
              : <svg width="22" height="22" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="var(--accent-ink)" /></svg>}
          </button>
        </div>
      )}

      {/* athlete sheet */}
      {a && (
        <div style={s('position:absolute;left:0;right:0;bottom:0;z-index:1200;background:var(--bg);border-radius:18px 18px 0 0;border-top:1px solid var(--line);padding:10px 18px calc(16px + env(safe-area-inset-bottom))')}>
          <div style={s('width:40px;height:4px;border-radius:3px;background:var(--line2);margin:0 auto 12px')} />
          <div style={s('display:flex;align-items:center;gap:11px')}>
            <AuthedAvatar avatarUrl={a.avatarUrl} token={token} initials={a.initials} color={a.color} size={40} radius={12} fontSize={14} />
            <div style={s('flex:1;min-width:0')}>
              <div style={s('font-size:14px;font-weight:700')}>{a.athleteName}</div>
              <div style={s('font-size:11.5px;color:var(--text2)')}>{[a.when, a.location].filter(Boolean).join(' · ')}</div>
            </div>
            <div style={s(`background:color-mix(in srgb,${a.sportColor} 16%,transparent);color:${a.sportColor};font-size:10px;font-weight:700;padding:4px 9px;border-radius:7px;text-transform:uppercase;flex:none`)}>{a.sport}</div>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(overlay, targetRef.current || document.body);
}
