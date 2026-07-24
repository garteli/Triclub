// Per-user activity-map prefs: the last-selected basemap layer + 2D/3D view, persisted in
// localStorage so reopening an activity's map (inline hero or full-screen) restores your last
// choice. Client-side only — no server round-trip.

const KEY = 'squad.mapView';
const DEFAULT = { style: 'voyager', is3D: false };

export function getMapView() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!v || typeof v !== 'object') return { ...DEFAULT };
    return { style: typeof v.style === 'string' ? v.style : DEFAULT.style, is3D: !!v.is3D };
  } catch { return { ...DEFAULT }; }
}

export function setMapView(view) {
  try { localStorage.setItem(KEY, JSON.stringify({ style: view.style, is3D: !!view.is3D })); } catch { /* ignore */ }
}

// Persist just the basemap layer, keeping the stored 2D/3D preference — for maps that only pick a
// layer (event route map, live-ride map) and shouldn't clobber the activity map's 3D choice.
export function setMapStyle(style) {
  setMapView({ ...getMapView(), style });
}

// ── Map-layer favorites + default (Settings → Maps) ──────────────────────────
// The athlete picks which basemap layers they want (favorites) and which one maps open on
// (default). Favorites null/empty = "all layers" (the out-of-the-box behavior, nothing filtered).
// basemaps.js reads these to hide non-favorites from every map's layer switcher.
const LAYER_KEY = 'squad.mapLayers';

export function getMapLayerPrefs() {
  try {
    const v = JSON.parse(localStorage.getItem(LAYER_KEY) || 'null');
    if (!v || typeof v !== 'object') return { favorites: null, defaultStyle: 'voyager' };
    return {
      favorites: Array.isArray(v.favorites) && v.favorites.length ? v.favorites.filter((k) => typeof k === 'string') : null,
      defaultStyle: typeof v.defaultStyle === 'string' ? v.defaultStyle : 'voyager',
    };
  } catch { return { favorites: null, defaultStyle: 'voyager' }; }
}

export function setMapLayerPrefs({ favorites, defaultStyle }) {
  try {
    localStorage.setItem(LAYER_KEY, JSON.stringify({
      favorites: Array.isArray(favorites) && favorites.length ? favorites : null,
      defaultStyle: defaultStyle || 'voyager',
    }));
  } catch { /* storage unavailable */ }
}
