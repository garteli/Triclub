import { useEffect, useRef, useState } from 'react';
import { s } from '../lib/style.js';
import { BASEMAP_LABEL, baseSource, applyBasemap, nextBasemap, inIsrael } from '../lib/basemaps.js';
import { getRouteStyle, setRouteStyle as persistRouteStyle, ROUTE_COLORS, ROUTE_WIDTHS } from '../lib/routeStyle.js';
import { addRouteArrows, styleArrows } from '../lib/mapArrows.js';

// Interactive live-ride map tile: a real MapLibre basemap you can pinch-zoom, pan and rotate,
// with the course route + your breadcrumb, and each rider as a coloured dot with their initials.
// Riders that overlap on screen collapse into one cluster dot (showing the count); tapping a
// cluster zooms in to expand it into the individuals. A compass toggle switches between pinned-
// north (free pan) and follow-heading. Lazy-loads MapLibre so it never touches the main bundle.
//
// props: pts (frame [lat,lon][]), course/path ([lat,lon][]), riders ([{lat,lon,initials,color,you}]),
//        interactive (gestures on — off during tile drag-reorder).

const buildStyle = (basemap) => ({
  version: 8,
  sources: { base: baseSource(basemap) },
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

// Activity-type glyphs for your own marker (indoor variants reuse the outdoor icon).
const SPORT_ICON = {
  bike: '<circle cx="5.5" cy="17" r="3.4"/><circle cx="18.5" cy="17" r="3.4"/><path d="M5.5 17l4.5-8.5h4"/><path d="M14 8.5l4.5 8.5"/><path d="M8 8.5h4l2 4"/>',
  run: '<circle cx="16" cy="5" r="1.8"/><path d="M14.5 8l-4 3.5 2.5 2 1 5.5"/><path d="M10.5 11.5l-4 1"/><path d="M13 13.5l3.5 1"/>',
};
const sportGlyph = (sport) => {
  const p = sport === 'trainer' ? SPORT_ICON.bike : sport === 'treadmill' ? SPORT_ICON.run : SPORT_ICON[sport];
  return p ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${p}</svg>` : null;
};

const lineFC = (pts) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: (pts || []).map(([la, lo]) => [lo, la]) } });
const youPos = (riders, path) => {
  const you = (riders || []).find((r) => r.you && Number.isFinite(r.lat) && Number.isFinite(r.lon));
  if (you) return [you.lat, you.lon];
  return path && path.length ? path[path.length - 1] : null;
};

export default function LiveMapGL({ pts, course, path, riders, mySport, interactive = true }) {
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
  const [basemap, setBasemap] = useState('voyager'); // cycle Voyager → Light → Satellite → Terrain → Off-road
  const basemapRef = useRef('voyager');
  const [rstyle, setRstyle] = useState(getRouteStyle); // per-user route colour + width (path + arrows)
  const [styleOpen, setStyleOpen] = useState(false);
  const rstyleRef = useRef(rstyle);
  rstyleRef.current = rstyle;
  // Off-road basemap only offered when the ride is in Israel (its tiles are blank elsewhere).
  const firstPt = (Array.isArray(pts) && pts[0]) || (Array.isArray(course) && course[0]) || (Array.isArray(path) && path[0]);
  const israel = firstPt ? inIsrael(firstPt[0], firstPt[1]) : true;

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
          container: elRef.current, style: buildStyle(basemapRef.current), center: c, zoom: 14,
          attributionControl: false, fadeDuration: 0, renderWorldCopies: false, maxPitch: 0, dragRotate: true,
        });
        mapRef.current = map;
        mlRef.current = maplibregl;
        map.on('error', (e) => { const m = e?.error?.message || String(e?.error || e); if (!/tile|404|Failed to fetch|AbortError/i.test(m)) console.error('MAPLIBRE', m); });
        map.on('load', () => {
          const accent = resolveColor('var(--accent)');
          const rs = rstyleRef.current; // per-user route colour/width (shared with the full map)
          // Course = the route to follow: the user's colour + width, kept dashed + dimmed so it still
          // reads as the guide vs the solid breadcrumb.
          map.addSource('course', { type: 'geojson', data: lineFC(course) });
          map.addLayer({ id: 'course', type: 'line', source: 'course', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': rs.color || accent, 'line-width': rs.width || 4, 'line-opacity': 0.6, 'line-dasharray': [2, 2] } });
          map.addSource('path', { type: 'geojson', data: lineFC(path) });
          map.addLayer({ id: 'path', type: 'line', source: 'path', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': rs.color || accent, 'line-width': rs.width || 4 } });
          // Direction chevrons (in the route colour) along the course (route to follow) + your breadcrumb.
          addRouteArrows(map, 'course', 'course-arrows', { color: rs.color, width: rs.width });
          addRouteArrows(map, 'path', 'path-arrows', { color: rs.color, width: rs.width });
          // Riders are DOM markers (initials dots + clusters), not a circle layer — see rebuildMarkers.
          readyRef.current = true;
          setFailed(false);
          // Re-cluster when the zoom changes (pixel distances between riders change with zoom).
          map.on('zoomend', () => rebuildRef.current());
          drawAll();          // seed the route + breadcrumb
          rebuildRef.current(); // seed the rider markers
        });
        // Tiles never load if the map is created while its pager page is off-screen / zero-size (the
        // pages stay mounted). So nudge a resize on any size change (ResizeObserver), when it scrolls
        // into view (IntersectionObserver), and a few times just after creation — so it always paints.
        const nudge = () => { if (map) map.resize(); };
        [60, 250, 600].forEach((t) => setTimeout(nudge, t));
        const ro = new ResizeObserver(nudge);
        ro.observe(elRef.current);
        map._ro = ro;
        const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) nudge(); }, { threshold: 0.01 });
        io.observe(elRef.current);
        map._io = io;
      } catch { if (!cancelled) setFailed(true); }
    })();
    return () => { cancelled = true; markersRef.current.forEach((m) => m.remove()); markersRef.current = []; if (map?._ro) map._ro.disconnect(); if (map?._io) map._io.disconnect(); if (map) map.remove(); mapRef.current = null; readyRef.current = false; framedRef.current = false; };
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
      .map((r) => ({ lat: r.lat, lon: r.lon, initials: r.initials || '··', color: resolveColor(r.color), you: !!r.you, driver: !!r.driver }));
    // Always show "you" — when your rider isn't positioned (solo, or presence-without-GPS), fall back
    // to your breadcrumb position, keeping your initials from the rider row if it exists.
    if (!list.some((r) => r.you)) {
      const yp = youPos(riders, path);
      const yr = (riders || []).find((r) => r.you);
      // Carry the driver flag through so a positionless driver still shows the car (not a plain dot).
      if (yp) list.push({ lat: yp[0], lon: yp[1], initials: yr?.initials || 'You', color: resolveColor(yr?.color || 'var(--accent)'), you: true, driver: yr?.driver || mySport === 'driver' });
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
        if (m0.driver) {
          // Escort vehicle — a car icon instead of an initials dot.
          el.style.cssText = 'width:30px;height:22px;border-radius:7px;background:#0c0e11;color:#fff;border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.5);cursor:pointer';
          el.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11"/><path d="M3 11h18v4a1 1 0 0 1-1 1h-1a2 2 0 0 1-4 0H9a2 2 0 0 1-4 0H4a1 1 0 0 1-1-1z"/></svg>';
        } else {
          const bg = m0.you ? accent : m0.color;
          const fg = m0.you ? accentInk : '#0c0e11';
          el.style.cssText = `width:26px;height:26px;border-radius:50%;background:${bg};color:${fg};border:2.5px solid #fff;display:flex;align-items:center;justify-content:center;font:700 10px system-ui;box-shadow:0 1px 4px rgba(0,0,0,.45)${m0.you ? `,0 0 0 3px ${accent}66` : ''};cursor:pointer`;
          // Your own marker shows your activity icon (bike/run/…); everyone else keeps their initials.
          const glyph = m0.you ? sportGlyph(mySport) : null;
          if (glyph) el.innerHTML = glyph; else el.textContent = m0.initials;
        }
        // Tap an individual rider to zoom in on them (mirrors a cluster tap, which fits its members).
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          map.easeTo({ center: [m0.lon, m0.lat], zoom: Math.max(map.getZoom() + 1.5, 16.5), duration: 500 });
        });
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
    const sig = (riders || []).map((r) => `${r.you ? 'Y' : ''}${r.driver ? 'D' : ''}${r.initials || ''}:${(r.lat ?? 0).toFixed(5)},${(r.lon ?? 0).toFixed(5)}`).join('|')
      + (tail ? `|@${tail[0].toFixed(5)},${tail[1].toFixed(5)}` : '') + `|s:${mySport || ''}`;
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

  // Swap the basemap when cycled — kept beneath the course line so route/riders stay on top.
  useEffect(() => {
    basemapRef.current = basemap;
    const map = mapRef.current;
    if (map && readyRef.current) applyBasemap(map, basemap);
  }, [basemap]);

  // Apply the per-user route colour/width live to the course + breadcrumb lines AND the arrows.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    if (map.getLayer('course')) { map.setPaintProperty('course', 'line-color', rstyle.color); map.setPaintProperty('course', 'line-width', rstyle.width); }
    if (map.getLayer('path')) { map.setPaintProperty('path', 'line-color', rstyle.color); map.setPaintProperty('path', 'line-width', rstyle.width); }
    styleArrows(map, ['course-arrows', 'path-arrows'], rstyle);
  }, [rstyle]);
  const applyRstyle = (next) => { setRstyle(next); persistRouteStyle(next); };

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
      {/* Route colour + width (path + arrows), stacked above the basemap button */}
      <div
        className="ctl" onPointerDown={stop} onClick={(e) => { stop(e); setStyleOpen((o) => !o); }}
        title="Route colour & width"
        style={s(`position:absolute;bottom:50px;right:8px;z-index:3;width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--bg) 78%,transparent);border:1px solid ${styleOpen ? 'var(--accent)' : 'var(--line2)'};color:var(--text)`)}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 18l7-7" /><circle cx="15.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" /><path d="M12 3l3 3-8 8-3 1 1-3z" /><path d="M17 5l2-2 2 2-2 2z" /></svg>
      </div>
      {styleOpen && (
        <div onPointerDown={stop} style={s('position:absolute;bottom:50px;right:50px;z-index:4;width:172px;border-radius:13px;padding:11px;background:color-mix(in srgb,var(--bg) 92%,transparent);border:1px solid var(--line2);box-shadow:0 8px 24px -8px rgba(0,0,0,.5)')}>
          <div style={s('font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--text3);margin-bottom:7px')}>Route colour</div>
          <div style={s('display:flex;flex-wrap:wrap;gap:7px')}>
            {ROUTE_COLORS.map((c) => (
              <div key={c} className="ctl" onClick={(e) => { stop(e); applyRstyle({ ...rstyle, color: c }); }}
                style={s(`width:24px;height:24px;border-radius:50%;background:${c};cursor:pointer;box-shadow:0 0 0 ${rstyle.color === c ? '2.5px var(--text)' : '1px var(--line2)'}`)} />
            ))}
          </div>
          <div style={s('font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--text3);margin:11px 0 7px')}>Width</div>
          <div style={s('display:flex;gap:7px')}>
            {ROUTE_WIDTHS.map(({ label, w }) => (
              <div key={w} className="ctl" onClick={(e) => { stop(e); applyRstyle({ ...rstyle, width: w }); }}
                style={s(`flex:1;height:32px;border-radius:9px;display:flex;align-items:center;justify-content:center;gap:6px;font-size:11.5px;font-weight:700;cursor:pointer;background:${rstyle.width === w ? 'color-mix(in srgb,var(--accent) 18%,transparent)' : 'var(--bg3)'};border:1px solid ${rstyle.width === w ? 'var(--accent)' : 'var(--line)'};color:var(--text)`)}>
                <span style={s(`width:18px;height:${w}px;border-radius:${w}px;background:${rstyle.color}`)} />{label}
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Basemap cycle (Voyager → Light → Satellite → Terrain → Off-road) */}
      <div
        className="ctl" onPointerDown={stop} onClick={(e) => { stop(e); setBasemap((b) => nextBasemap(b, israel)); }}
        title={`Map: ${BASEMAP_LABEL[basemap] || basemap} — tap to change`}
        style={s(`position:absolute;bottom:8px;right:8px;z-index:3;width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--bg) 78%,transparent);border:1px solid var(--line2);color:${basemap === 'offroad' ? 'var(--accent)' : 'var(--text)'}`)}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M12 2l9 5-9 5-9-5z" /><path d="M3 12l9 5 9-5M3 17l9 5 9-5" /></svg>
      </div>
    </div>
  );
}
