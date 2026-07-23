import { useEffect, useState } from 'react';
import { s } from '../lib/style.js';
import { buildElevationProfile } from '../lib/elevation.js';
import { routeKm } from '../lib/courses.js';

// Elevation-vs-distance chart for a [[lat,lon],…] route, read from the real terrain (Open-Meteo).
// Reused across the maps so every profile is genuine terrain, never fabricated. `color` matches the
// route line so the map and the profile read as one. Renders nothing until it has a route to profile.
function Chart({ elev, color, H = 60 }) {
  const W = 320;
  if (!elev || elev.profile.length < 2) return <div style={s(`height:${H}px;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--text3)`)}>—</div>;
  const { profile, min, max } = elev;
  const total = profile[profile.length - 1].dist || 1;
  const span = Math.max(1, max - min);
  const px = (d) => (d / total) * W;
  const py = (e) => H - 2 - ((e - min) / span) * (H - 10);
  const line = profile.map((p, i) => `${i ? 'L' : 'M'}${px(p.dist).toFixed(1)},${py(p.e).toFixed(1)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, display: 'block' }}>
      <path d={area} fill={color} opacity="0.14" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function ElevationProfile({ route, color = 'var(--accent)', height = 60 }) {
  const [elev, setElev] = useState(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // (Re)read the terrain when the route changes; abort the previous request if it does.
  useEffect(() => {
    const pts = (route || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (pts.length < 2) { setElev(null); setLoading(false); setFailed(false); return undefined; }
    const ctrl = new AbortController();
    setLoading(true); setFailed(false);
    (async () => {
      try { setElev(await buildElevationProfile(pts, ctrl.signal)); }
      catch (e) { if (e.name !== 'AbortError') { setElev(null); setFailed(true); } }
      finally { setLoading(false); }
    })();
    return () => ctrl.abort();
  }, [route]);

  const pts = (route || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (pts.length < 2) return null;
  const km = routeKm(pts);

  return (
    <div style={s('margin-top:12px;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:11px 13px 7px')}>
      <div style={s('display:flex;align-items:center;justify-content:space-between;margin-bottom:5px')}>
        <span style={s('font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text3)')}>Elevation · {km.toFixed(1)} km</span>
        <span style={s('font-size:11.5px;font-weight:700;color:var(--text2)')}>
          {loading ? 'reading terrain…' : elev ? `↑ ${elev.ascent} m` : failed ? 'unavailable' : ''}
        </span>
      </div>
      <Chart elev={elev} color={color} H={height} />
    </div>
  );
}
