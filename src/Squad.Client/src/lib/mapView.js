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
