import { useEffect, useMemo, useState } from 'react';
import { buildElevationProfile } from '../lib/elevation.js';
import { analyzeProfile } from '../lib/routeProfile.js';

// Analyse the live ride's selected course into graded sections (see routeProfile.js), so the ClimbPro
// data field can show the climb ahead. Reads the real terrain once per distinct course (Open-Meteo,
// like the event page) and returns the analysis with its sample profile attached, or null.

const keyOf = (course) => {
  const pts = (course || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (pts.length < 4) return '';
  const a = pts[0], b = pts[pts.length - 1];
  return `${pts.length}:${a[0].toFixed(4)},${a[1].toFixed(4)}:${b[0].toFixed(4)},${b[1].toFixed(4)}`;
};

export function useRouteAnalysis(course) {
  const key = useMemo(() => keyOf(course), [course]);
  const [analysis, setAnalysis] = useState(null);

  useEffect(() => {
    const pts = (course || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (pts.length < 4) { setAnalysis(null); return undefined; }
    const ctrl = new AbortController();
    (async () => {
      try {
        const elev = await buildElevationProfile(pts, ctrl.signal);
        const a = elev?.profile ? analyzeProfile(elev.profile) : null;
        setAnalysis(a ? { ...a, profile: elev.profile } : null);
      } catch (e) { if (e.name !== 'AbortError') setAnalysis(null); }
    })();
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return analysis;
}
