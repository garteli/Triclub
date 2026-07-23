import { useEffect, useState } from 'react';
import { buildDenseProfile } from '../lib/elevation.js';
import { detectClimbs } from '../lib/climbs.js';

// Reads a dense REAL terrain profile for the course (Open-Meteo) and detects its climbs once,
// keyed on the course identity (endpoints + point count) so it runs per selected route, not per
// GPS tick. Returns { profile, climbs, loading, failed } — profile is the dense
// { profile:[{dist,e}], … } used to place the rider on the climb.
export function useClimbs(course) {
  const [state, setState] = useState({ profile: null, climbs: [], loading: false, failed: false });
  const pts = (course || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  const coord = (p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
  const sig = pts.length < 2 ? '' : `${pts.length}|${coord(pts[0])}|${coord(pts[pts.length - 1])}`;

  useEffect(() => {
    if (pts.length < 2) { setState({ profile: null, climbs: [], loading: false, failed: false }); return undefined; }
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, failed: false }));
    (async () => {
      try {
        const profile = await buildDenseProfile(pts, ctrl.signal);
        setState({ profile, climbs: profile ? detectClimbs(profile.profile) : [], loading: false, failed: false });
      } catch (e) {
        if (e.name !== 'AbortError') setState({ profile: null, climbs: [], loading: false, failed: true });
      }
    })();
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return state;
}
