import { useEffect, useRef } from 'react';
import { baseSource, applyBasemap } from '../lib/basemaps.js';

// Reusable interactive MapLibre route map — shared basemap set (+ optional 3D terrain drape),
// the route line and start/end markers, pan/pinch-zoom/rotate. Lazy-loads MapLibre so it
// never touches the main bundle. Fills its (positioned) parent. `onReady(map, maplibregl)`
// hands the instance back so the caller can drive replay / camera.
const validPts = (route) => (route || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
const buildStyle = (style) => ({
  version: 8,
  sources: {
    base: baseSource(style),
    dem: { type: 'raster-dem', tiles: ['https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'], tileSize: 256, encoding: 'terrarium', maxzoom: 14 },
  },
  layers: [{ id: 'base', type: 'raster', source: 'base' }],
});

export default function RouteMapGL({ route, styleName = 'voyager', pitch = 0, terrain = false, interactive = true, fitPadding = 40, routeColor = '#ff6a2c', routeWidth = 4, onError, onReady }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  // Keep the latest style available inside the (route-keyed) map-build effect without re-creating.
  const styleRef = useRef({ routeColor, routeWidth });
  styleRef.current = { routeColor, routeWidth };

  useEffect(() => {
    let map, cancelled = false;
    (async () => {
      try {
        const maplibregl = (await import('maplibre-gl')).default;
        await import('maplibre-gl/dist/maplibre-gl.css');
        if (cancelled || !elRef.current) return;
        const pts = validPts(route);
        map = new maplibregl.Map({
          container: elRef.current, style: buildStyle(styleName),
          center: pts.length ? [pts[0][1], pts[0][0]] : [34.9, 32.0],
          zoom: 10, pitch, bearing: 0, maxPitch: 80, interactive,
          attributionControl: true, fadeDuration: 0, renderWorldCopies: false,
        });
        mapRef.current = map;
        onReady && onReady(map, maplibregl); // hand the instance back immediately (markers attach pre-load)
        map.on('error', (e) => { const m = e?.error?.message || String(e?.error || e); if (!/tile|404|Failed to fetch|AbortError/i.test(m)) console.error('MAPLIBRE', m); });
        map.on('load', () => {
          if (terrain) { try { map.setTerrain({ source: 'dem', exaggeration: 1.3 }); } catch { /* no webgl2 */ } }
          if (pts.length > 1) {
            map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: pts.map(([la, lo]) => [lo, la]) } } });
            map.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': styleRef.current.routeColor, 'line-width': styleRef.current.routeWidth } });
            map.addSource('ends', { type: 'geojson', data: { type: 'FeatureCollection', features: [
              { type: 'Feature', properties: { c: '#4fe08b' }, geometry: { type: 'Point', coordinates: [pts[0][1], pts[0][0]] } },
              { type: 'Feature', properties: { c: '#ff5d5d' }, geometry: { type: 'Point', coordinates: [pts[pts.length - 1][1], pts[pts.length - 1][0]] } },
            ] } });
            map.addLayer({ id: 'ends', type: 'circle', source: 'ends', paint: { 'circle-radius': 6, 'circle-color': ['get', 'c'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5 } });
            const b = new maplibregl.LngLatBounds();
            pts.forEach(([la, lo]) => b.extend([lo, la]));
            map.fitBounds(b, { padding: fitPadding, pitch, bearing: 0, duration: 0 });
          }
          readyRef.current = true;
        });
        setTimeout(() => map && map.resize(), 60);
      } catch { onError && onError(); }
    })();
    return () => { cancelled = true; if (map) map.remove(); mapRef.current = null; readyRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route]);

  // React to control changes without re-creating the map. Rebuild the base (via applyBasemap) so
  // maxzoom + attribution track the layer — the route line stays above it.
  useEffect(() => { const m = mapRef.current; if (m && m.getSource && m.getSource('base')) applyBasemap(m, styleName); }, [styleName]);
  // Apply route colour/width live to the existing line (no map re-create).
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !m.getLayer || !m.getLayer('route')) return;
    m.setPaintProperty('route', 'line-color', routeColor);
    m.setPaintProperty('route', 'line-width', routeWidth);
  }, [routeColor, routeWidth]);
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !readyRef.current) return;
    m.easeTo({ pitch, duration: 500 });
    if (terrain) { try { m.setTerrain({ source: 'dem', exaggeration: 1.3 }); } catch { /* ignore */ } }
    else { try { m.setTerrain(null); } catch { /* ignore */ } }
  }, [pitch, terrain]);

  return <div ref={elRef} style={{ position: 'absolute', inset: 0 }} />;
}
