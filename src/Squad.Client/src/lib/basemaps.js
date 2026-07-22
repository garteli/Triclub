// Shared MapLibre basemap definitions for the app's raster maps (the full route map + the live
// ride map), so both offer the same set of layers.
//
// 'offroad' is off-road.io's Israel hiking/off-road raster tiles — rich trail detail across Israel,
// blank elsewhere, so it's an option rather than the default. Its tiles top out at z15 (z16+ 403s),
// so we cap maxzoom and let MapLibre overzoom past that; the host serves open CORS
// (Access-Control-Allow-Origin: *), so the cross-origin WebGL texture upload works.

const cartoTiles = (seg) => ['a', 'b', 'c', 'd'].map((sd) => `https://${sd}.basemaps.cartocdn.com/rastertiles/${seg}/{z}/{x}/{y}.png`);

export const BASEMAPS = {
  voyager: { tiles: cartoTiles('voyager'), maxzoom: 20, attribution: '© OpenStreetMap · © CARTO' },
  light: { tiles: cartoTiles('light_all'), maxzoom: 20, attribution: '© OpenStreetMap · © CARTO' },
  dark: { tiles: cartoTiles('dark_all'), maxzoom: 20, attribution: '© OpenStreetMap · © CARTO' },
  offroad: { tiles: ['https://hiking.off-road.io/hiking_map/{z}/{x}/{y}.png'], maxzoom: 15, attribution: '© off-road.io · © OpenStreetMap' },
};
export const BASEMAP_ORDER = ['voyager', 'light', 'dark', 'offroad'];
export const BASEMAP_LABEL = { voyager: 'Voyager', light: 'Light', dark: 'Dark', offroad: 'Off-road' };
export const nextBasemap = (key) => BASEMAP_ORDER[(BASEMAP_ORDER.indexOf(key) + 1) % BASEMAP_ORDER.length];

// A MapLibre raster-source spec for the given basemap key (falls back to voyager).
export const baseSource = (key) => {
  const cfg = BASEMAPS[key] || BASEMAPS.voyager;
  return { type: 'raster', tiles: cfg.tiles, tileSize: 256, maxzoom: cfg.maxzoom, attribution: cfg.attribution };
};

// Swap a live map's 'base' raster source+layer to a different basemap. Rebuilds the source (not just
// setTiles) so maxzoom + attribution follow the layer — off-road stops at z15 vs CARTO's z20. Always
// re-inserts the base at the very bottom, so the route line AND the trails overlay stay above it.
export const applyBasemap = (map, key) => {
  const swap = () => {
    if (map.getLayer('base')) map.removeLayer('base');
    if (map.getSource('base')) map.removeSource('base');
    map.addSource('base', baseSource(key));
    const layers = map.getStyle().layers || [];
    map.addLayer({ id: 'base', type: 'raster', source: 'base' }, layers.length ? layers[0].id : undefined);
  };
  if (map.isStyleLoaded()) swap(); else map.once('styledata', swap);
};

// Marked-trails overlay: Waymarked Trails hiking tiles (OSM-based, global, open + CORS). A transparent
// raster — coloured marked-route lines you drape over ANY basemap, anywhere. OSM data is CC-BY-SA, so
// the attribution must ride along.
export const TRAILS = {
  tiles: ['https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png'],
  maxzoom: 18,
  attribution: '© <a href="https://hiking.waymarkedtrails.org">Waymarked Trails</a> · © OpenStreetMap (CC-BY-SA)',
};

// Toggle the trails overlay on a live map. Kept beneath `beneathId` (the route/course line) so our
// track + rider markers stay on top of the trail lines, but above the basemap (which applyBasemap
// pins to the bottom).
export const setTrailsOverlay = (map, on, beneathId) => {
  const apply = () => {
    const has = !!map.getLayer('trails');
    if (on && !has) {
      if (!map.getSource('trails')) map.addSource('trails', { type: 'raster', tiles: TRAILS.tiles, tileSize: 256, maxzoom: TRAILS.maxzoom, attribution: TRAILS.attribution });
      map.addLayer({ id: 'trails', type: 'raster', source: 'trails' }, beneathId && map.getLayer(beneathId) ? beneathId : undefined);
    } else if (!on && has) {
      map.removeLayer('trails');
      if (map.getSource('trails')) map.removeSource('trails');
    }
  };
  if (map.isStyleLoaded()) apply(); else map.once('styledata', apply);
};
