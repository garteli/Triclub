import { s } from '../lib/style.js';
import { groupRadar } from '../lib/radar.js';
import TileMap from './TileMap.jsx';
import { toPathD } from '../lib/tiles.js';

const W = 344;
const H = 280;

// Live group-ride map: a real CARTO basemap (framed on the course) with the route
// and rider dots drawn on top in the same coordinate space. Riders glide between
// 1 Hz updates; the projection stays fixed to the route bounds so the frame doesn't
// jitter as the pack moves.
export default function LiveRideMap({ riders = [], route = [] }) {
  const basis = route.length ? route : riders.map((r) => [r.lat, r.lon]);
  if (basis.length === 0) {
    return (
      <div style={s('margin:0 12px;border-radius:22px;border:1px solid var(--line2);background:var(--bg2);height:220px;display:flex;align-items:center;justify-content:center')}>
        <span style={s('font-size:12px;color:var(--text3)')}>Waiting for riders to start sending…</span>
      </div>
    );
  }

  const gr = groupRadar(riders);

  return (
    <div style={s('position:relative;margin:0 12px;border-radius:22px;overflow:hidden;border:1px solid var(--line2)')}>
      <TileMap points={basis} W={W} H={H} radius={22} pad={34}>
        {(project) => {
          const routeD = toPathD(route, project);
          return (
            <>
              {routeD && (
                <>
                  <path d={routeD} fill="none" stroke="rgba(0,0,0,.5)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
                  <path d={routeD} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 7" opacity=".95" />
                </>
              )}

              {/* Riders: positioned by real coordinates, gliding between updates. */}
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
                    <circle r={r.you ? 12 : 11} fill={fill} stroke={r.dropped ? 'var(--behind)' : '#0b0f14'} strokeWidth="2.5" strokeDasharray={r.dropped ? '3 2' : undefined} />
                    <text y="4" textAnchor="middle" fontSize="9" fontWeight="700" fill={textFill} fontFamily="'JetBrains Mono',monospace">{r.you ? 'YOU' : r.initials}</text>
                  </g>
                );
              })}
            </>
          );
        }}
      </TileMap>

      {gr.level > 0 && (
        <div style={s(`position:absolute;top:12px;left:12px;right:76px;border-radius:12px;padding:9px 11px;display:flex;align-items:center;gap:8px;font-size:11.5px;font-weight:700;line-height:1.25;backdrop-filter:blur(8px);color:${gr.level >= 2 ? '#fff' : '#1a1405'};background:${gr.level >= 2 ? 'var(--bad)' : 'var(--warn)'};animation:floatUp .25s ease')}>
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
