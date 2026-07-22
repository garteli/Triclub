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
// setTiles) so maxzoom + attribution follow the layer — off-road stops at z15 vs CARTO's z20. Keeps
// the base beneath `beneathId` (e.g. the route line) so overlays stay on top.
export const applyBasemap = (map, key, beneathId) => {
  const swap = () => {
    if (map.getLayer('base')) map.removeLayer('base');
    if (map.getSource('base')) map.removeSource('base');
    map.addSource('base', baseSource(key));
    map.addLayer({ id: 'base', type: 'raster', source: 'base' }, beneathId && map.getLayer(beneathId) ? beneathId : undefined);
  };
  if (map.isStyleLoaded()) swap(); else map.once('styledata', swap);
};
