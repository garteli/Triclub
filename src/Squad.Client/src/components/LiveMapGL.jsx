import { useEffect, useRef, useState } from 'react';
import { s } from '../lib/style.js';

// Interactive live-ride map tile: a real MapLibre basemap you can pinch-zoom, pan and rotate,
// with the course route, your breadcrumb and the pack drawn on top. A compass toggle switches
// between pinned-north (free pan) and follow-heading (map rotates to your GPS heading and keeps
// you centred). Lazy-loads MapLibre so it never touches the main bundle.
//
// props: pts (frame [lat,lon][]), course/path ([lat,lon][]), riders ([{lat,lon,color,you}]),
//        interactive (gestures on — off during tile drag-reorder).

const baseTiles = () => ['a', 'b', 'c', 'd'].map((sd) => `https://${sd}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png`);
const buildStyle = () => ({
  version: 8,
  sources: { base: { type: 'raster', tiles: baseTiles(), tileSize: 256, attribution: '© OpenStreetMap · © CARTO' } },
  layers: [{ id: 'base', type: 'raster', source: 'base' }],
});

// Resolve a CSS custom property (var(--x)) to a concrete color MapLibre can paint; pass others through.
const resolveColor = (c) => {
  if (typeof c === 'string' && c.startsWith('var(')) {
    const name = c.slice(4, -1).trim();
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || '#5b8cff';
  }
  return c || '#5b8cff';
};

const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;
function bearingDeg(a, b) {
  const φ1 = toRad(a[0]), φ2 = toRad(b[0]), dλ = toRad(b[1] - a[1]);
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
// Heading from the end of the breadcrumb — walk back to a point far enough to beat GPS jitter.
function headingFromPath(path) {
  if (!Array.isArray(path) || path.length < 2) return null;
  const last = path[path.length - 1];
  for (let i = path.length - 2; i >= 0; i--) {
    const p = path[i];
    const dLat = (last[0] - p[0]) * 111000;
    const dLon = (last[1] - p[1]) * 111000 * Math.cos(toRad(last[0]));
    if (Math.hypot(dLat, dLon) >= 8) return bearingDeg(p, last);
  }
  return null;
}

const lineFC = (pts) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: (pts || []).map(([la, lo]) => [lo, la]) } });
const youPos = (riders, path) => {
  const you = (riders || []).find((r) => r.you);
  if (you) return [you.lat, you.lon];
  return path && path.length ? path[path.length - 1] : null;
};

export default function LiveMapGL({ pts, course, path, riders, interactive = true }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const mlRef = useRef(null);
  const readyRef = useRef(false);
  const framedRef = useRef(false);
  const headingRef = useRef(0);
  const [follow, setFollow] = useState(false); // false = north-up (free pan), true = follow heading
  const [failed, setFailed] = useState(false);

  // Create the map once.
  useEffect(() => {
    let map, cancelled = false;
    (async () => {
      try {
        const maplibregl = (await import('maplibre-gl')).default;
        await import('maplibre-gl/dist/maplibre-gl.css');
        if (cancelled || !elRef.current) return;
        const c = Array.isArray(pts) && pts.length ? [pts[0][1], pts[0][0]] : [34.9, 32.0];
        map = new maplibregl.Map({
          container: elRef.current, style: buildStyle(), center: c, zoom: 14,
          attributionControl: false, fadeDuration: 0, renderWorldCopies: false, maxPitch: 0, dragRotate: true,
        });
        mapRef.current = map;
        mlRef.current = maplibregl;
        map.on('error', (e) => { const m = e?.error?.message || String(e?.error || e); if (!/tile|404|Failed to fetch|AbortError/i.test(m)) console.error('MAPLIBRE', m); });
        map.on('load', () => {
          const accent = resolveColor('var(--accent)');
          map.addSource('course', { type: 'geojson', data: lineFC(course) });
          map.addLayer({ id: 'course', type: 'line', source: 'course', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#7c8794', 'line-width': 3, 'line-opacity': 0.7, 'line-dasharray': [2, 2] } });
          map.addSource('path', { type: 'geojson', data: lineFC(path) });
          map.addLayer({ id: 'path', type: 'line', source: 'path', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': accent, 'line-width': 4 } });
          map.addSource('riders', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          map.addLayer({ id: 'riders', type: 'circle', source: 'riders', paint: { 'circle-radius': 6, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5 } });
          map.addSource('you', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          map.addLayer({ id: 'you-halo', type: 'circle', source: 'you', paint: { 'circle-radius': 16, 'circle-color': accent, 'circle-opacity': 0.22 } });
          map.addLayer({ id: 'you', type: 'circle', source: 'you', paint: { 'circle-radius': 9, 'circle-color': accent, 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
          readyRef.current = true;
          setFailed(false);
          // seed the overlays + initial frame right away
          drawAll();
        });
        setTimeout(() => map && map.resize(), 60);
        const ro = new ResizeObserver(() => map && map.resize());
        ro.observe(elRef.current);
        map._ro = ro;
      } catch { if (!cancelled) setFailed(true); }
    })();
    return () => { cancelled = true; if (map?._ro) map._ro.disconnect(); if (map) map.remove(); mapRef.current = null; readyRef.current = false; framedRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push the current geometry into the map's sources (also called once on load).
  const drawAll = () => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.getSource('course')?.setData(lineFC(course));
    map.getSource('path')?.setData(lineFC(path));
    map.getSource('riders')?.setData({
      type: 'FeatureCollection',
      features: (riders || []).filter((r) => !r.you).map((r) => ({ type: 'Feature', properties: { color: resolveColor(r.color) }, geometry: { type: 'Point', coordinates: [r.lon, r.lat] } })),
    });
    const yp = youPos(riders, path);
    map.getSource('you')?.setData({ type: 'FeatureCollection', features: yp ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: [yp[1], yp[0]] } }] : [] });
  };

  // Redraw overlays whenever the live data changes.
  useEffect(() => { drawAll(); }); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial framing to the whole route+pack (north-up only; once).
  useEffect(() => {
    const map = mapRef.current, maplibregl = mlRef.current;
    if (!map || !maplibregl || !readyRef.current || framedRef.current || follow) return;
    const valid = (pts || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]));
    if (valid.length < 1) return;
    const b = new maplibregl.LngLatBounds();
    valid.forEach(([la, lo]) => b.extend([lo, la]));
    map.fitBounds(b, { padding: 34, duration: 0, maxZoom: 16 });
    framedRef.current = true;
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow-heading camera: rotate to heading and keep you centred each tick.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    if (follow) {
      const yp = youPos(riders, path);
      const h = headingFromPath(path);
      if (h != null) headingRef.current = h;
      map.easeTo({ center: yp ? [yp[1], yp[0]] : undefined, bearing: headingRef.current, duration: 380 });
    }
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggling back to north-up snaps the map upright (pinned north).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || follow) return;
    map.easeTo({ bearing: 0, duration: 300 });
  }, [follow]);

  // Enable/disable gesture handlers (off during tile drag-reorder so the tile can be dragged).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handlers = ['dragPan', 'scrollZoom', 'boxZoom', 'dragRotate', 'keyboard', 'doubleClickZoom', 'touchZoomRotate', 'touchPitch'];
    handlers.forEach((h) => { if (map[h]) (interactive ? map[h].enable() : map[h].disable()); });
  }, [interactive]);

  const stop = (e) => e.stopPropagation();

  return (
    <div ref={elRef} style={{ position: 'absolute', inset: 0 }}>
      {failed && (
        <div style={s('position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:16px;font-size:11px;color:var(--text3)')}>Map needs a connection.</div>
      )}
      {/* North ⇄ follow-heading toggle */}
      <div
        className="ctl" onPointerDown={stop} onClick={(e) => { stop(e); setFollow((v) => !v); }}
        title={follow ? 'Following heading — tap for north up' : 'North up — tap to follow heading'}
        style={s(`position:absolute;bottom:8px;left:8px;z-index:3;width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--bg) 78%,transparent);border:1px solid var(--line2);color:${follow ? 'var(--accent)' : 'var(--text)'}`)}>
        {follow ? (
          // heading arrow (map rotates under it)
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l7 19-7-4-7 4z" fill="currentColor" /></svg>
        ) : (
          // compass N
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7l2.5 6L12 12l-2.5 1z" fill="currentColor" stroke="none" /><text x="12" y="6" fontSize="4.5" textAnchor="middle" fill="currentColor" stroke="none">N</text></svg>
        )}
      </div>
    </div>
  );
}
