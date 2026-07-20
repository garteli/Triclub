import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { s } from '../lib/style.js';

// Full-screen interactive route map (Leaflet) — pinch/drag to pan, pinch/scroll/buttons
// to zoom. Uses the same CARTO basemaps as the rest of the app. `style` selects the
// basemap ('voyager' | 'light' | 'dark'); `route` is an [lat,lon][] track.
const TILE_SEG = { voyager: 'voyager', light: 'light_all', dark: 'dark_all' };

export default function FullMap({ route, style = 'voyager', onClose }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    const map = L.map(elRef.current, { zoomControl: false, attributionControl: true, zoomSnap: 0.5 });
    mapRef.current = map;
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer(`https://{s}.basemaps.cartocdn.com/rastertiles/${TILE_SEG[style] || 'voyager'}/{z}/{x}/{y}{r}.png`, {
      subdomains: 'abcd', maxZoom: 20, detectRetina: true, attribution: '© OpenStreetMap · © CARTO',
    }).addTo(map);

    const pts = (route || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (pts.length > 1) {
      const line = L.polyline(pts, { color: '#ff6a2c', weight: 4, lineJoin: 'round', lineCap: 'round' }).addTo(map);
      L.circleMarker(pts[0], { radius: 6, color: '#fff', weight: 2.5, fillColor: '#4fe08b', fillOpacity: 1 }).addTo(map);
      L.circleMarker(pts[pts.length - 1], { radius: 6, color: '#fff', weight: 2.5, fillColor: '#ff5d5d', fillOpacity: 1 }).addTo(map);
      map.fitBounds(line.getBounds(), { padding: [46, 46] });
    } else {
      map.setView([32.72, 35.53], 12);
    }
    // The container mounts inside a just-shown overlay; make sure Leaflet measured it.
    const t = setTimeout(() => map.invalidateSize(), 60);
    return () => { clearTimeout(t); map.remove(); mapRef.current = null; };
  }, [route, style]);

  return (
    <div style={s('position:fixed;inset:0;z-index:60;background:var(--bg)')}>
      <div ref={elRef} style={{ position: 'absolute', inset: 0 }} />
      <div className="ctl" onClick={onClose} title="Close" style={s('position:absolute;top:16px;left:16px;z-index:1000;width:40px;height:40px;border-radius:50%;background:rgba(20,23,29,.85);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;color:#fff')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </div>
    </div>
  );
}
