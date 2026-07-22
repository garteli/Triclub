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
  // Esri World Imagery — global aerial/satellite (JPEG, open CORS). ArcGIS tile scheme is z/y/x.
  satellite: { tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], maxzoom: 19, attribution: '© Esri · Maxar · Earthstar Geographics' },
  offroad: { tiles: ['https://hiking.off-road.io/hiking_map/{z}/{x}/{y}.png'], maxzoom: 15, attribution: '© off-road.io · © OpenStreetMap' },
};
export const BASEMAP_ORDER = ['voyager', 'light', 'dark', 'satellite', 'offroad'];
export const BASEMAP_LABEL = { voyager: 'Voyager', light: 'Light', dark: 'Dark', satellite: 'Satellite', offroad: 'Off-road' };
export const nextBasemap = (key) => BASEMAP_ORDER[(BASEMAP_ORDER.indexOf(key) + 1) % BASEMAP_ORDER.length];

// A MapLibre raster-source spec for the given basemap key (falls back to voyager).
export const baseSource = (key) => {
  const cfg = BASEMAPS[key] || BASEMAPS.voyager;
  return { type: 'raster', tiles: cfg.tiles, tileSize: 256, maxzoom: cfg.maxzoom, attribution: cfg.attribution };
};

// Swap a live map's 'base' raster source+layer to a different basemap. Rebuilds the source (not just
// setTiles) so maxzoom + attribution follow the layer — off-road stops at z15 vs CARTO's z20. Always
// re-inserts the base at the very bottom, so the route/course line and markers stay above it.
//
// Runs synchronously: callers only invoke this once the map is ready (they guard on getSource('base')
// / a ready flag), and add/removeLayer only needs the style parsed — NOT isStyleLoaded(), which is
// false whenever any source is mid-tile-load and would wrongly defer the swap to a styledata event
// that may never fire on a static map (the "button reacts, map doesn't" bug).
export const applyBasemap = (map, key) => {
  if (map.getLayer('base')) map.removeLayer('base');
  if (map.getSource('base')) map.removeSource('base');
  map.addSource('base', baseSource(key));
  const layers = map.getStyle().layers || [];
  map.addLayer({ id: 'base', type: 'raster', source: 'base' }, layers.length ? layers[0].id : undefined);
};
