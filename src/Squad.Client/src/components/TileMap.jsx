import { useMemo, useRef, useState, useLayoutEffect } from 'react';
import { s } from '../lib/style.js';
import { fitView, tilesFor, TILE_ATTRIBUTION } from '../lib/tiles.js';

// Real map basemap (CARTO Voyager light tiles) with an SVG overlay drawn in the same
// coordinate space. `points` (array of [lat,lon]) frames the view; `children` is a
// render function that receives project(lat,lon) → {x,y} in the W×H design box, so
// callers draw routes / riders / markers directly on top of the real map.
//
// Sizing: by default the box keeps a fixed W:H aspect ratio at width:100%. Pass `fill`
// to instead stretch to the parent's box (e.g. a `position:absolute;inset:0` cell) and
// frame the view against the parent's *measured* pixel size, so the basemap covers the
// whole cell without distortion no matter how tall the cell is.
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
  fill = false,
  children,
  scrubPoints,
  onScrub,
}) {
  const boxRef = useRef(null);

  // In fill mode we measure the rendered box and frame the view against those real
  // pixels, so the basemap fills the whole cell (no aspect-ratio letterboxing) and the
  // SVG viewBox matches 1:1 → no stretch. Until measured, fall back to the W×H design box.
  const [measured, setMeasured] = useState(null);
  useLayoutEffect(() => {
    if (!fill || !boxRef.current) return;
    const el = boxRef.current;
    const update = () => setMeasured({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fill]);

  // Effective design box the projection + tiles + viewBox are all computed against.
  const vw = fill && measured?.w ? measured.w : W;
  const vh = fill && measured?.h ? measured.h : H;

  // fitView + tilesFor do real work (zoom search, trig, tile grid). Memoise so an
  // animation that re-renders this component every frame doesn't recompute the basemap.
  const view = useMemo(() => fitView(points, vw, vh, pad), [points, vw, vh, pad]);
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
    const x = ((e.clientX - r.left) / r.width) * vw;
    const y = ((e.clientY - r.top) / r.height) * vh;
    let best = 0, bd = Infinity;
    for (let i = 0; i < projected.length; i++) {
      const p = projected[i];
      const dx = p.x - x, dy = p.y - y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    onScrub(best);
  };

  const sizing = fill ? 'width:100%;height:100%' : `width:100%;aspect-ratio:${W}/${H}`;

  return (
    <div ref={boxRef} style={s(`position:relative;${sizing};overflow:hidden;border-radius:${radius}px;background:#e8ecef`)}>
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
        <svg viewBox={`0 0 ${vw} ${vh}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }}>
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
