import { s } from '../lib/style.js';
import { progressMeters, elevAt } from '../lib/elevation.js';
import { getRouteStyle } from '../lib/routeStyle.js';
import { useElevationProfile } from '../hooks/useElevationProfile.js';

// Compact elevation profile for the course you're following, pinned under the live map.
// Reads the REAL terrain (Open-Meteo, via useElevationProfile) so it's never fabricated,
// and drops a "you are here" marker by projecting your GPS fix onto the route. Renders
// nothing until it has a route with ≥2 points — so it only appears when following a course.

const W = 300;    // SVG horizontal units (stretched to fit; height is 1:1 with px)
const PAD_T = 16; // room for the labels above the chart
const PAD_B = 3;

export default function LiveElevationStrip({ route = [], you = null, height = 60 }) {
  const { elev, loading, failed } = useElevationProfile(route);
  const color = getRouteStyle().color || 'var(--accent)';
  const pts = (route || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));

  if (pts.length < 2) return null;

  const H = height;
  const chartTop = PAD_T, chartBot = H - PAD_B;
  let line = '', area = '', marker = null;
  if (elev && elev.profile.length >= 2) {
    const { profile, min, max } = elev;
    const total = profile[profile.length - 1].dist || 1;
    const span = Math.max(1, max - min);
    const px = (d) => (d / total) * W;
    const py = (e) => chartBot - ((e - min) / span) * (chartBot - chartTop);
    line = profile.map((p, i) => `${i ? 'L' : 'M'}${px(p.dist).toFixed(1)},${py(p.e).toFixed(1)}`).join(' ');
    area = `${line} L${W},${H} L0,${H} Z`;
    const dist = progressMeters(pts, you);
    if (dist != null) {
      const frac = Math.max(0, Math.min(1, dist / total));
      marker = { leftPct: frac * 100, topPx: py(elevAt(profile, dist)) };
    }
  }

  return (
    <div style={s(`position:absolute;left:0;right:0;bottom:0;height:${H}px;z-index:2;border-top:1px solid var(--line2);background:color-mix(in srgb,var(--bg) 78%,transparent);backdrop-filter:blur(6px);overflow:hidden;pointer-events:none`)}>
      {line && (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}>
          <path d={area} fill={color} opacity="0.16" />
          <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      {marker && (
        <>
          <div style={s(`position:absolute;top:${chartTop}px;bottom:0;left:${marker.leftPct}%;width:1.5px;background:${color};opacity:.55`)} />
          <div style={s(`position:absolute;left:${marker.leftPct}%;top:${marker.topPx}px;width:9px;height:9px;border-radius:50%;background:${color};border:2px solid var(--bg);transform:translate(-50%,-50%);box-shadow:0 0 0 1px ${color}`)} />
        </>
      )}
      <div style={s('position:absolute;top:4px;left:8px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.9px;color:var(--text3)')}>Elevation</div>
      <div className="mono" style={s('position:absolute;top:4px;right:8px;font-size:10px;font-weight:700;color:var(--text2)')}>
        {loading && !elev ? 'reading terrain…' : elev ? `↑ ${elev.ascent} m` : failed ? 'unavailable' : ''}
      </div>
    </div>
  );
}
