import { useMemo, useRef } from 'react';
import { s } from '../lib/style.js';
import { fitView, tilesFor, TILE_ATTRIBUTION } from '../lib/tiles.js';

// Real map basemap (CARTO Voyager light tiles) with an SVG overlay drawn in the same
// coordinate space. `points` (array of [lat,lon]) frames the view; `children` is a
// render function that receives project(lat,lon) → {x,y} in the W×H design box, so
// callers draw routes / riders / markers directly on top of the real map.
//
// Optional scrubbing: pass `scrubPoints` (an [lat,lon] array whose index carries meaning
// to the caller — e.g. a replay frame index) plus `onScrub(index)` and the map becomes
// interactive — pointer down/drag picks the nearest point on the route and reports its
// index, so the caller can move a shared playhead by dragging on the map itself.
export default function TileMap({
  points,
  W = 356,
  H = 190,
  pad = 24,
  radius = 20,
  children,
  scrubPoints,
  onScrub,
}) {
  // fitView + tilesFor do real work (zoom search, trig, tile grid). Memoise so an
  // animation that re-renders this component every frame doesn't recompute the basemap.
  const view = useMemo(() => fitView(points, W, H, pad), [points, W, H, pad]);
  const tiles = useMemo(() => tilesFor(view), [view]);

  const overlayRef = useRef(null);
  const interactive = Array.isArray(scrubPoints) && scrubPoints.length > 1 && typeof onScrub === 'function';

  // Project the scrub points once per view so nearest-point picking is a cheap loop.
  const projected = useMemo(
    () => (interactive ? scrubPoints.map(([la, lo]) => view.project(la, lo)) : null),
    [interactive, scrubPoints, view],
  );

  const pickFromEvent = (e) => {
    if (!projected || !overlayRef.current) return;
    const r = overlayRef.current.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    let best = 0, bd = Infinity;
    for (let i = 0; i < projected.length; i++) {
      const p = projected[i];
      const dx = p.x - x, dy = p.y - y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    onScrub(best);
  };

  return (
    <div style={s(`position:relative;width:100%;aspect-ratio:${W}/${H};overflow:hidden;border-radius:${radius}px;background:#e8ecef`)}>
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

      {children && (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }}>
          {children(view.project, view)}
        </svg>
      )}

      {interactive && (
        <div
          ref={overlayRef}
          onPointerDown={(e) => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ } pickFromEvent(e); }}
          onPointerMove={(e) => { if (e.buttons) pickFromEvent(e); }}
          style={{ position: 'absolute', inset: 0, cursor: 'pointer', touchAction: 'none' }}
        />
      )}

      <div style={s('position:absolute;bottom:4px;right:6px;font-size:8px;color:rgba(40,50,60,.75);background:rgba(255,255,255,.6);padding:1px 5px;border-radius:5px;pointer-events:none;letter-spacing:.2px')}>{TILE_ATTRIBUTION}</div>
    </div>
  );
}
