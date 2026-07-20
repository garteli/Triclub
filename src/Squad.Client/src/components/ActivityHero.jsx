import { useMemo } from 'react';
import { s } from '../lib/style.js';
import TileMap from './TileMap.jsx';
import { toPathD } from '../lib/tiles.js';

// Strava-style hero: a full-bleed basemap with the recorded route, overlaid nav controls,
// and a round play button. Play animates the travelled portion + a marker along the route
// (and, via the shared `playback`, the synced charts below). Dragging the map scrubs the
// whole set. Falls back to a gradient panel with the sport glyph when there's no GPS.
const RoundBtn = ({ onClick, title, children, style = '' }) => (
  <button
    onClick={onClick}
    aria-label={title}
    title={title}
    style={s('width:38px;height:38px;border-radius:50%;border:none;background:#fff;color:#111;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;box-shadow:0 2px 8px rgba(0,0,0,.28)' + (style ? ';' + style : ''))}
  >
    {children}
  </button>
);

const BackIcon = () => (<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>);
const TrashIcon = () => (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" /></svg>);

export default function ActivityHero({ a, route, frames, hasMap, status, playback, onBack, onDelete }) {
  const { index, playing, toggle, seek, pause } = playback;
  const n = frames.length;
  const travelled = useMemo(() => (hasMap ? route.slice(0, index + 1) : null), [route, index, hasMap]);
  const canPlay = n > 1 && hasMap; // no route to animate → the analysis transport plays the charts

  const controls = (
    <>
      <div style={s('position:absolute;top:12px;left:12px;z-index:3')}><RoundBtn onClick={onBack} title="Back"><BackIcon /></RoundBtn></div>
      {a.isMe && (
        <div style={s('position:absolute;top:12px;right:12px;z-index:3')}><RoundBtn onClick={onDelete} title="Delete training" style="color:var(--bad)"><TrashIcon /></RoundBtn></div>
      )}
      {canPlay && (
        <button
          onClick={toggle}
          aria-label={playing ? 'Pause replay' : 'Play replay'}
          style={s('position:absolute;right:16px;bottom:16px;z-index:3;width:54px;height:54px;border-radius:50%;border:none;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;box-shadow:0 4px 14px rgba(0,0,0,.32)')}
        >
          {playing
            ? <svg width="20" height="20" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1.2" fill="#111" /><rect x="14" y="4" width="4" height="16" rx="1.2" fill="#111" /></svg>
            : <svg width="22" height="22" viewBox="0 0 24 24"><path d="M7 4.5 19 12 7 19.5Z" fill="#111" /></svg>}
        </button>
      )}
    </>
  );

  // Height: a tall hero on phones, capped so it never eats a tablet-width column.
  const box = 'position:relative;width:100%;height:clamp(280px,44vh,400px);overflow:hidden;background:var(--bg3)';

  if (status === 'loading') {
    return <div style={s(box)}>{controls}<div style={s('position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:12px')}>Loading route…</div></div>;
  }

  if (!hasMap) {
    return (
      <div style={s(box + ';background:linear-gradient(135deg,color-mix(in srgb,' + a.sportColor + ' 30%,var(--bg2)),var(--bg2))')}>
        {controls}
        <div style={s('position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px')}>
          <div style={s('font-size:44px;line-height:1')}>{a.icon}</div>
          <div style={s('font-size:12px;color:var(--text2)')}>No GPS route for this activity</div>
        </div>
      </div>
    );
  }

  return (
    <div style={s(box)}>
      <TileMap
        points={route}
        fill
        radius={0}
        pad={30}
        scrubPoints={route}
        onScrub={(i) => { pause(); seek(n > 1 ? i / (n - 1) : 0); }}
      >
        {(project) => {
          const full = toPathD(route, project);
          const done = travelled && travelled.length > 1 ? toPathD(travelled, project) : null;
          const start = project(route[0][0], route[0][1]);
          const endPt = project(route[route.length - 1][0], route[route.length - 1][1]);
          const head = project(route[index][0], route[index][1]);
          return (
            <>
              <path d={full} fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
              <path d={full} fill="none" stroke="#f2622d" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
              {done && <path d={done} fill="none" stroke="#111" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />}
              <circle cx={start.x} cy={start.y} r="6" fill="var(--good)" stroke="#fff" strokeWidth="2.5" />
              <circle cx={endPt.x} cy={endPt.y} r="6" fill="var(--bad)" stroke="#fff" strokeWidth="2.5" />
              {(playing || index > 0) && (
                <>
                  <circle cx={head.x} cy={head.y} r="9" fill="#fff" opacity="0.9" />
                  <circle cx={head.x} cy={head.y} r="6" fill="#111" />
                </>
              )}
            </>
          );
        }}
      </TileMap>
      {controls}
    </div>
  );
}
