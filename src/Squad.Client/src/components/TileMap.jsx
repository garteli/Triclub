import { s } from '../lib/style.js';
import { fitView, tilesFor, TILE_ATTRIBUTION } from '../lib/tiles.js';

// Real map basemap (CARTO dark tiles) with an SVG overlay drawn in the same
// coordinate space. `points` (array of [lat,lon]) frames the view; `children` is a
// render function that receives project(lat,lon) → {x,y} in the W×H design box, so
// callers draw routes / riders / markers directly on top of the real map.
export default function TileMap({
  points,
  W = 356,
  H = 190,
  pad = 24,
  radius = 20,
  children,
}) {
  const view = fitView(points, W, H, pad);
  const tiles = tilesFor(view);

  return (
    <div style={s(`position:relative;width:100%;aspect-ratio:${W}/${H};overflow:hidden;border-radius:${radius}px;background:#0b0f14`)}>
      {tiles.map((t) => (
        <img
          key={t.key}
          src={t.url}
          alt=""
          draggable={false}
          loading="lazy"
          style={{ position: 'absolute', left: `${t.left}%`, top: `${t.top}%`, width: `${t.wpct}%`, height: `${t.hpct}%`, objectFit: 'cover', pointerEvents: 'none' }}
        />
      ))}
      {/* subtle scrim so bright route colours and labels stay legible over the map */}
      <div style={s('position:absolute;inset:0;background:linear-gradient(180deg,color-mix(in srgb,var(--bg) 22%,transparent),transparent 30%,transparent 70%,color-mix(in srgb,var(--bg) 30%,transparent));pointer-events:none')} />

      {children && (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}>
          {children(view.project, view)}
        </svg>
      )}

      <div style={s('position:absolute;bottom:4px;right:6px;font-size:8px;color:color-mix(in srgb,var(--text3) 90%,transparent);background:color-mix(in srgb,var(--bg) 55%,transparent);padding:1px 5px;border-radius:5px;pointer-events:none;letter-spacing:.2px')}>{TILE_ATTRIBUTION}</div>
    </div>
  );
}
