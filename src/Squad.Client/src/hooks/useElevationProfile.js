import { useEffect, useState } from 'react';
import { buildElevationProfile, profileFromRoute } from '../lib/elevation.js';

// Elevation profile for a route — used by the live elevation chart + under-map strip. Prefers the
// route's OWN per-point elevation when it carries it (a 3rd value, e.g. an imported off-road.io GPX):
// instant, no network, and never "unavailable" — the same source the event page uses. Only when the
// route has no embedded elevation (a plain [lat,lon] breadcrumb / drawn route) does it read the
// terrain (Open-Meteo, cached/deduped). The terrain read is gated on a COARSE signature (endpoint
// coords ~100 m + a bucketed length) so a live-growing breadcrumb re-reads roughly every ~5 points /
// 100 m, not on every 1 Hz GPS fix. Returns { elev, loading, failed }; elev is null until read.
export function useElevationProfile(points) {
  const [state, setState] = useState({ elev: null, loading: false, failed: false });
  const pts = (points || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));

  const coord = (p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`; // ~100 m
  const sig = pts.length < 2 ? '' :
    `${Math.floor(pts.length / 5)}|${coord(pts[0])}|${coord(pts[pts.length - 1])}`;

  useEffect(() => {
    if (pts.length < 2) { setState({ elev: null, loading: false, failed: false }); return undefined; }

    // Route already carries its own elevation → use it directly, no terrain fetch.
    const embedded = profileFromRoute(pts);
    if (embedded) { setState({ elev: embedded, loading: false, failed: false }); return undefined; }

    let alive = true; // the shared terrain read (cached/deduped) isn't abortable — guard stale updates
    setState((s) => ({ ...s, loading: true, failed: false }));
    (async () => {
      try { const elev = await buildElevationProfile(pts); if (alive) setState({ elev, loading: false, failed: false }); }
      catch (e) { if (alive && e.name !== 'AbortError') setState({ elev: null, loading: false, failed: true }); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return state;
}
