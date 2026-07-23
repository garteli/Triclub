import { useEffect, useState } from 'react';
import { buildElevationProfile } from '../lib/elevation.js';

// Reads the REAL terrain profile (Open-Meteo) for a [[lat,lon],…] route and keeps it fresh as the
// route changes — used by the live elevation chart + under-map strip. The terrain read is gated on
// a COARSE signature (endpoint coords ~100 m + a bucketed length) so a live-growing breadcrumb
// re-reads terrain roughly every ~5 points / 100 m, not on every 1 Hz GPS fix. Returns
// { elev, loading, failed }; elev is null until a route with ≥2 points has been read.
export function useElevationProfile(points) {
  const [state, setState] = useState({ elev: null, loading: false, failed: false });
  const pts = (points || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));

  const coord = (p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`; // ~100 m
  const sig = pts.length < 2 ? '' :
    `${Math.floor(pts.length / 5)}|${coord(pts[0])}|${coord(pts[pts.length - 1])}`;

  useEffect(() => {
    if (pts.length < 2) { setState({ elev: null, loading: false, failed: false }); return undefined; }
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
