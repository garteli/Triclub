import { s } from '../lib/style.js';
import { groupRadar } from '../lib/radar.js';

const W = 344;
const H = 280;
const PAD = 26;

// Build a stable lat/lon -> SVG projector. Prefer the route's bounds so the frame
// doesn't jitter as riders move; fall back to the riders themselves. Uniform scale
// (with a cos(lat) correction on longitude) keeps the course from looking stretched.
function makeProjector(points) {
  const lats = points.map((p) => p[0]);
  const lons = points.map((p) => p[1]);
  let minLat = Math.min(...lats), maxLat = Math.max(...lats);
  let minLon = Math.min(...lons), maxLon = Math.max(...lons);
  if (maxLat - minLat < 1e-4) { maxLat += 5e-5; minLat -= 5e-5; }
  if (maxLon - minLon < 1e-4) { maxLon += 5e-5; minLon -= 5e-5; }

  const cosLat = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
  const spanLon = (maxLon - minLon) * cosLat;
  const spanLat = maxLat - minLat;
  const scale = Math.min((W - 2 * PAD) / spanLon, (H - 2 * PAD) / spanLat);

  // center the projected content in the box
  const offX = (W - spanLon * scale) / 2;
  const offY = (H - spanLat * scale) / 2;

  return (lat, lon) => ({
    x: offX + (lon - minLon) * cosLat * scale,
    y: offY + (maxLat - lat) * scale,
  });
}

export default function LiveRideMap({ riders = [], route = [] }) {
  const basis = route.length ? route : riders.map((r) => [r.lat, r.lon]);
  if (basis.length === 0) {
    return (
      <div style={s('margin:0 12px;border-radius:22px;border:1px solid var(--line2);background:var(--bg2);height:220px;display:flex;align-items:center;justify-content:center')}>
        <span style={s('font-size:12px;color:var(--text3)')}>Waiting for riders to start sending…</span>
      </div>
    );
  }

  const project = makeProjector(basis);
  const gr = groupRadar(riders);
  const routePts = route.map(([la, lo]) => project(la, lo));
  const routeD = routePts.length
    ? 'M' + routePts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L')
    : '';

  return (
    <div style={s('position:relative;margin:0 12px;border-radius:22px;overflow:hidden;border:1px solid var(--line2);background:radial-gradient(120% 100% at 50% 0%, var(--bg3), var(--bg))')}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
        <defs>
          <radialGradient id="lrGlow" cx="50%" cy="45%" r="60%">
            <stop offset="0" stopColor="color-mix(in srgb,var(--accent) 20%,transparent)" />
            <stop offset="1" stopColor="transparent" />
          </radialGradient>
          <linearGradient id="lrRoute" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--accent)" /><stop offset="1" stopColor="var(--swim)" />
          </linearGradient>
        </defs>
        <rect width={W} height={H} fill="url(#lrGlow)" />
        <g stroke="var(--line)" strokeWidth="1">
          <path d={`M0,${H * 0.25} H${W} M0,${H * 0.5} H${W} M0,${H * 0.75} H${W} M${W * 0.25},0 V${H} M${W * 0.5},0 V${H} M${W * 0.75},0 V${H}`} />
        </g>
        {routeD && (
          <>
            <path d={routeD} fill="none" stroke="var(--line2)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
            <path d={routeD} fill="none" stroke="url(#lrRoute)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 7" opacity=".9" />
          </>
        )}

        {/* Riders: positioned by real coordinates, gliding between 1 Hz updates. */}
        {riders.map((r) => {
          const { x, y } = project(r.lat, r.lon);
          const fill = r.you ? 'var(--accent)' : r.color;
          const textFill = r.you ? '#141a05' : '#0c0e11';
          return (
            <g key={r.athleteId} style={{ transform: `translate(${x}px,${y}px)`, transition: 'transform 1s linear' }}>
              {r.radar?.level > 0 && (
                <circle r="15" fill="none" stroke={r.radar.level >= 2 ? 'var(--bad)' : 'var(--warn)'} strokeWidth="2.5">
                  <animate attributeName="r" values="13;19;13" dur="1.2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.9;0.15;0.9" dur="1.2s" repeatCount="indefinite" />
                </circle>
              )}
              {r.you && (
                <circle r="14" fill="none" stroke="var(--accent)" strokeWidth="2" opacity=".5">
                  <animate attributeName="r" values="12;16;12" dur="2s" repeatCount="indefinite" />
                </circle>
              )}
              <circle r={r.you ? 12 : 11} fill={fill} stroke={r.dropped ? 'var(--behind)' : 'var(--bg)'} strokeWidth="2.5" strokeDasharray={r.dropped ? '3 2' : undefined} />
              <text y="4" textAnchor="middle" fontSize="9" fontWeight="700" fill={textFill} fontFamily="'JetBrains Mono',monospace">{r.you ? 'YOU' : r.initials}</text>
            </g>
          );
        })}
      </svg>

      {gr.level > 0 && (
        <div style={s(`position:absolute;top:12px;left:12px;right:76px;border-radius:12px;padding:9px 11px;display:flex;align-items:center;gap:8px;font-size:11.5px;font-weight:700;line-height:1.25;backdrop-filter:blur(8px);color:${gr.level >= 2 ? '#fff' : '#1a1405'};background:${gr.level >= 2 ? 'var(--bad)' : 'var(--warn)'};animation:floatUp .25s ease`)}>
          <span style={s('font-size:15px')}>🚗</span>
          <span>Vehicle {gr.level >= 2 ? 'approaching fast' : 'approaching'} the pack{gr.closestM != null ? ` · ${gr.closestM} m` : ''}{gr.byName ? ` · spotted by ${gr.byName}` : ''}</span>
        </div>
      )}

      <div style={s('position:absolute;top:12px;right:12px;background:color-mix(in srgb,var(--bg2) 80%,transparent);border:1px solid var(--line);border-radius:11px;padding:7px 10px;backdrop-filter:blur(8px);text-align:center')}>
        <div className="mono" style={s('font-size:13px;font-weight:700;color:var(--good)')}>{riders.filter((r) => !r.dropped).length} up</div>
        <div style={s('font-size:8.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px')}>pack</div>
      </div>
    </div>
  );
}
