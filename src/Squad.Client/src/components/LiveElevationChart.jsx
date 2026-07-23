import { s } from '../lib/style.js';
import { progressMeters, elevAt } from '../lib/elevation.js';
import { useElevationProfile } from '../hooks/useElevationProfile.js';

const COLOR = '#ff7a3c'; // elevation accent (ride-computer handoff)

// Full-tile elevation profile for the live pages. Two sources, same chart:
//  • source="route" — the course you're following; the marker projects your GPS fix onto it.
//  • source="track" — the ride you've recorded so far (breadcrumb); the marker sits at the
//    leading edge (your current position = the latest point).
// Terrain is REAL (Open-Meteo via useElevationProfile) — never fabricated. y is mapped in a
// 0..100 viewBox so the HTML "you are here" marker lines up with the stretched SVG line.

const VW = 300;      // SVG x units (stretched to the tile width)
const PAD_T = 12;    // % headroom above the peak
const PAD_B = 6;     // % below the valley

export default function LiveElevationChart({ route = [], you = null, source = 'route', indoor = false, mono = false }) {
  const { elev, loading, failed } = useElevationProfile(route);
  const color = mono ? '#cdd3db' : COLOR;
  const pts = (route || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));

  const header = (right) => (
    <div style={s('display:flex;align-items:flex-start;justify-content:space-between;gap:6px')}>
      <div style={s('display:flex;align-items:center;gap:6px;min-width:0')}>
        <span style={s(`width:8px;height:8px;border-radius:2px;background:${color};flex:none`)} />
        <span style={s('font-size:9.5px;color:var(--text3);text-transform:uppercase;letter-spacing:1.1px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
          {source === 'route' ? 'Route elevation' : 'Elevation'}
        </span>
      </div>
      {right}
    </div>
  );

  // Not enough of a route yet → an honest empty state (never a fake profile).
  if (pts.length < 2) {
    const msg = source === 'route'
      ? 'No route — pick a course to follow.'
      : indoor ? 'Indoor session — no elevation.' : 'Recording… your climb profile builds as you ride.';
    return (
      <>
        {header(null)}
        <div style={s('flex:1;display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:11px;text-align:center;padding:0 10px')}>{msg}</div>
      </>
    );
  }

  let line = '', area = '', marker = null, ascent = null;
  if (elev && elev.profile.length >= 2) {
    const { profile, min, max } = elev;
    ascent = elev.ascent;
    const total = profile[profile.length - 1].dist || 1;
    const span = Math.max(1, max - min);
    const px = (d) => (d / total) * VW;
    const py = (e) => PAD_T + (1 - (e - min) / span) * (100 - PAD_T - PAD_B); // % of height
    line = profile.map((p, i) => `${i ? 'L' : 'M'}${px(p.dist).toFixed(1)},${py(p.e).toFixed(2)}`).join(' ');
    area = `${line} L${VW},100 L0,100 Z`;
    // Where the rider is: project onto the route, or the leading edge for the recorded track.
    const dist = source === 'track' ? total : progressMeters(pts, you);
    if (dist != null) {
      const frac = Math.max(0, Math.min(1, dist / total));
      marker = { leftPct: frac * 100, topPct: py(elevAt(profile, dist)) };
    }
  }

  return (
    <>
      {header(
        <div style={s('display:flex;align-items:baseline;gap:3px;flex:none')}>
          <span className="mono" style={s(`font-size:20px;font-weight:700;line-height:.9;color:${color};letter-spacing:-.5px`)}>{loading && !elev ? '…' : elev ? ascent : failed ? '—' : ''}</span>
          {elev && <span style={s('font-size:10px;font-weight:600;color:var(--text2)')}>↑m</span>}
        </div>,
      )}
      <div style={s('position:relative;flex:1;min-height:36px;margin-top:6px')}>
        {line ? (
          <>
            <svg viewBox={`0 0 ${VW} 100`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}>
              <path d={area} fill={color} opacity="0.2" />
              <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>
            {marker && (
              <>
                <div style={s(`position:absolute;top:0;bottom:0;left:${marker.leftPct}%;width:1.5px;background:${color};opacity:.5`)} />
                <div style={s(`position:absolute;left:${marker.leftPct}%;top:${marker.topPct}%;width:10px;height:10px;border-radius:50%;background:${color};border:2px solid var(--bg2);transform:translate(-50%,-50%);box-shadow:0 0 0 1px ${color}`)} />
              </>
            )}
          </>
        ) : (
          <div style={s('position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:11px')}>
            {loading ? 'reading terrain…' : failed ? 'elevation unavailable' : ''}
          </div>
        )}
      </div>
    </>
  );
}
