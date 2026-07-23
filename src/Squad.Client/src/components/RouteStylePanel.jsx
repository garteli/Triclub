import { useEffect, useRef } from 'react';
import { s } from '../lib/style.js';
import { ROUTE_COLORS, ARROW_COLORS, ROUTE_WIDTHS } from '../lib/routeStyle.js';

// Compact route colour / arrow / width picker shared by every map (event detail, live map, full
// map). Dismisses when the user taps anywhere outside it (blur). `variant` switches between the
// dark "glass" overlay (over a map) and the themed surface (the live map's own tokens). Position
// it with `pos` (a style string) plus optional `posStyle` for dynamic bits (e.g. safe-area top).
//
// The panel stops its own pointer-down so interacting with it never pans the underlying map; the
// map's style-toggle button must likewise stop pointer-down, so tapping it while open toggles it
// shut instead of being seen as an outside tap that re-opens it.
const VARIANT = {
  glass: {
    container: 'background:rgba(20,23,29,.82);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.14);color:#fff;box-shadow:0 8px 24px -10px rgba(0,0,0,.6)',
    label: 'rgba(255,255,255,.6)', ring: '#fff', arrowRing: 'var(--accent)', edge: 'rgba(255,255,255,.25)',
    tileOn: 'background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.45)',
    tileOff: 'background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14)',
  },
  themed: {
    container: 'background:color-mix(in srgb,var(--bg) 92%,transparent);border:1px solid var(--line2);color:var(--text);box-shadow:0 8px 24px -8px rgba(0,0,0,.5)',
    label: 'var(--text3)', ring: 'var(--text)', arrowRing: 'var(--accent)', edge: 'var(--line2)',
    tileOn: 'background:color-mix(in srgb,var(--accent) 18%,transparent);border:1px solid var(--accent)',
    tileOff: 'background:var(--bg3);border:1px solid var(--line)',
  },
};

export default function RouteStylePanel({ rstyle, applyRstyle, onClose, variant = 'glass', pos = '', posStyle }) {
  const ref = useRef(null);
  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose?.(); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [onClose]);

  const v = VARIANT[variant] || VARIANT.glass;
  const heading = (text, first) => (
    <div style={s(`font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:${v.label};margin:${first ? 0 : 10}px 0 6px`)}>{text}</div>
  );
  const swatchRow = (colors, selected, ring, key) => (
    <div style={s('display:grid;grid-template-columns:repeat(4,1fr);gap:6px;justify-items:center')}>
      {colors.map((c) => (
        <div key={c} className="ctl" onClick={() => applyRstyle({ ...rstyle, [key]: c })} title={c}
          style={s(`width:22px;height:22px;border-radius:50%;background:${c};cursor:pointer;box-shadow:0 0 0 ${selected === c ? `2.5px ${ring}` : `1px ${v.edge}`}`)} />
      ))}
    </div>
  );

  return (
    <div ref={ref} onPointerDown={(e) => e.stopPropagation()}
      style={{ ...s(`width:150px;border-radius:13px;padding:11px;${v.container};${pos}`), ...(posStyle || {}) }}>
      {heading('Route colour', true)}
      {swatchRow(ROUTE_COLORS, rstyle.color, v.ring, 'color')}
      {heading('Arrow colour')}
      {swatchRow(ARROW_COLORS, rstyle.arrowColor, v.arrowRing, 'arrowColor')}
      {heading('Width')}
      <div style={s('display:flex;gap:6px')}>
        {ROUTE_WIDTHS.map(({ label, w }) => (
          <div key={w} className="ctl" onClick={() => applyRstyle({ ...rstyle, width: w })}
            style={s(`flex:1;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;gap:6px;font-size:11px;font-weight:700;cursor:pointer;${rstyle.width === w ? v.tileOn : v.tileOff}`)}>
            <span style={s(`width:16px;height:${w}px;border-radius:${w}px;background:${rstyle.color}`)} />{label}
          </div>
        ))}
      </div>
    </div>
  );
}
