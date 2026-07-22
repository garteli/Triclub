import { useEffect, useRef, useState } from 'react';
import { s } from '../lib/style.js';

// Interactive live-ride map tile: a real MapLibre basemap you can pinch-zoom, pan and rotate,
// with the course route + your breadcrumb, and each rider as a coloured dot with their initials.
// Riders that overlap on screen collapse into one cluster dot (showing the count); tapping a
// cluster zooms in to expand it into the individuals. A compass toggle switches between pinned-
// north (free pan) and follow-heading. Lazy-loads MapLibre so it never touches the main bundle.
//
// props: pts (frame [lat,lon][]), course/path ([lat,lon][]), riders ([{lat,lon,initials,color,you}]),
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
  const you = (riders || []).find((r) => r.you && Number.isFinite(r.lat) && Number.isFinite(r.lon));
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
  const markersRef = useRef([]);      // live DOM markers (rider dots + clusters)
  const rebuildRef = useRef(() => {}); // always the latest rider-marker rebuild (for map event listeners)
  const markerSigRef = useRef('');     // last rider signature, so we only rebuild on real change
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
          // Riders are DOM markers (initials dots + clusters), not a circle layer — see rebuildMarkers.
          readyRef.current = true;
          setFailed(false);
          // Re-cluster when the zoom changes (pixel distances between riders change with zoom).
          map.on('zoomend', () => rebuildRef.current());
          drawAll();          // seed the route + breadcrumb
          rebuildRef.current(); // seed the rider markers
        });
        setTimeout(() => map && map.resize(), 60);
        const ro = new ResizeObserver(() => map && map.resize());
        ro.observe(elRef.current);
        map._ro = ro;
      } catch { if (!cancelled) setFailed(true); }
    })();
    return () => { cancelled = true; markersRef.current.forEach((m) => m.remove()); markersRef.current = []; if (map?._ro) map._ro.disconnect(); if (map) map.remove(); mapRef.current = null; readyRef.current = false; framedRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push the route + breadcrumb lines into the map's sources (riders are DOM markers — see below).
  const drawAll = () => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.getSource('course')?.setData(lineFC(course));
    map.getSource('path')?.setData(lineFC(path));
  };

  // Rider markers with initials, clustering nearby riders into one dot. Greedy pixel-distance
  // clustering (so dots that overlap on screen merge); tapping a cluster zooms to expand it into
  // the individuals. Rebuilt on data change + zoom (pixel gaps between riders change with zoom).
  const CLUSTER_PX = 42;
  const rebuildMarkers = () => {
    const map = mapRef.current, maplibregl = mlRef.current;
    if (!map || !maplibregl || !readyRef.current) return false;
    const accent = resolveColor('var(--accent)');
    const accentInk = resolveColor('var(--accent-ink)');

    const list = (riders || [])
      .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon))
      .map((r) => ({ lat: r.lat, lon: r.lon, initials: r.initials || '··', color: resolveColor(r.color), you: !!r.you }));
    // Always show "you" — when your rider isn't positioned (solo, or presence-without-GPS), fall back
    // to your breadcrumb position, keeping your initials from the rider row if it exists.
    if (!list.some((r) => r.you)) {
      const yp = youPos(riders, path);
      const yr = (riders || []).find((r) => r.you);
      if (yp) list.push({ lat: yp[0], lon: yp[1], initials: yr?.initials || 'You', color: resolveColor(yr?.color || 'var(--accent)'), you: true });
    }

    // Greedy cluster by on-screen pixel distance.
    const proj = list.map((r) => ({ ...r, px: map.project([r.lon, r.lat]) }));
    const used = new Array(proj.length).fill(false);
    const clusters = [];
    for (let i = 0; i < proj.length; i++) {
      if (used[i]) continue;
      const members = [proj[i]]; used[i] = true;
      for (let j = i + 1; j < proj.length; j++) {
        if (used[j]) continue;
        if (Math.hypot(proj[i].px.x - proj[j].px.x, proj[i].px.y - proj[j].px.y) < CLUSTER_PX) { members.push(proj[j]); used[j] = true; }
      }
      clusters.push(members);
    }

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = clusters.map((members) => {
      const hasYou = members.some((m) => m.you);
      const cLat = members.reduce((a, m) => a + m.lat, 0) / members.length;
      const cLon = members.reduce((a, m) => a + m.lon, 0) / members.length;
      const el = document.createElement('div');
      if (members.length > 1) {
        el.style.cssText = `width:30px;height:30px;border-radius:50%;background:#0c0e11;color:#fff;border:2px solid ${hasYou ? accent : '#fff'};display:flex;align-items:center;justify-content:center;font:700 12px system-ui;box-shadow:0 1px 4px rgba(0,0,0,.45);cursor:pointer`;
        el.textContent = String(members.length);
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const b = new maplibregl.LngLatBounds();
          members.forEach((m) => b.extend([m.lon, m.lat]));
          map.fitBounds(b, { padding: 80, maxZoom: 18, duration: 500 });
        });
      } else {
        const m0 = members[0];
        const bg = m0.you ? accent : m0.color;
        const fg = m0.you ? accentInk : '#0c0e11';
        el.style.cssText = `width:26px;height:26px;border-radius:50%;background:${bg};color:${fg};border:2.5px solid #fff;display:flex;align-items:center;justify-content:center;font:700 10px system-ui;box-shadow:0 1px 4px rgba(0,0,0,.45)${m0.you ? `,0 0 0 3px ${accent}66` : ''}`;
        el.textContent = m0.initials;
      }
      return new maplibregl.Marker({ element: el }).setLngLat([cLon, cLat]).addTo(map);
    });
    return true;
  };
  rebuildRef.current = rebuildMarkers;

  // Redraw lines + the clustered markers when riders/breadcrumb change. Only advance the signature
  // once a rebuild actually ran (the map may not be ready on the first renders), so it isn't skipped.
  useEffect(() => {
    drawAll();
    const tail = (path && path.length) ? path[path.length - 1] : null; // "you" falls back to the breadcrumb
    const sig = (riders || []).map((r) => `${r.you ? 'Y' : ''}${r.initials || ''}:${(r.lat ?? 0).toFixed(5)},${(r.lon ?? 0).toFixed(5)}`).join('|')
      + (tail ? `|@${tail[0].toFixed(5)},${tail[1].toFixed(5)}` : '');
    if (sig !== markerSigRef.current && rebuildMarkers()) markerSigRef.current = sig;
  }); // eslint-disable-line react-hooks/exhaustive-deps

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
