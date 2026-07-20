import { useMemo, useState } from 'react';
import { s } from '../lib/style.js';
import TileMap from './TileMap.jsx';
import FullMap from './FullMap.jsx';
import { toPathD } from '../lib/tiles.js';
import { usePlayback } from '../hooks/usePlayback.js';

const MAP_STYLES = ['voyager', 'light', 'dark'];

// Strava-beating hero: a full-bleed route map with translucent glass controls
// (back · Save Route · overflow · layers · 3D) and a round play button that animates
// the travelled route + a marker. Dragging the map scrubs. Falls back to a gradient
// panel with the sport glyph when there's no GPS. Save Route / layers / 3D are visual
// per the design (no data source yet); back, overflow→delete and play are live.
const glass = 'background:rgba(20,23,29,.72);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.1);color:#fff';

export default function ActivityHero({ a, route, frames, hasMap, status, token, onBack, onDelete }) {
  const playback = usePlayback(frames.length);
  const { index, playing, speed, setSpeed, toggle, seek, pause } = playback;
  const n = frames.length;
  const travelled = useMemo(() => (hasMap ? route.slice(0, index + 1) : null), [route, index, hasMap]);
  const canPlay = n > 1 && hasMap;
  const [mapStyle, setMapStyle] = useState('voyager');
  const [full, setFull] = useState(false);
  const cycleStyle = () => setMapStyle((st) => MAP_STYLES[(MAP_STYLES.indexOf(st) + 1) % MAP_STYLES.length]);

  const controls = (
    <>
      {/* back */}
      <div className="ctl" onClick={onBack} style={s(`position:absolute;top:16px;left:16px;z-index:3;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;${glass}`)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg>
      </div>
      {/* Save Route + overflow */}
      <div style={s('position:absolute;top:16px;right:16px;z-index:3;display:flex;gap:8px')}>
        <div className="ctl" style={s(`height:38px;padding:0 14px;border-radius:19px;display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;${glass}`)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
          Save Route
        </div>
        <div className="ctl" onClick={a.isMe ? onDelete : undefined} title={a.isMe ? 'Delete training' : undefined} style={s(`width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;letter-spacing:1px;font-size:13px;${glass}`)}>···</div>
      </div>
      {/* layers (cycle basemap) + 3D (opens the real 3D-terrain full map) */}
      <div style={s('position:absolute;top:64px;right:16px;z-index:3;display:flex;flex-direction:column;gap:8px')}>
        <div className="ctl" onClick={cycleStyle} title={`Map: ${mapStyle}`} style={s(`width:38px;height:38px;border-radius:12px;display:flex;align-items:center;justify-content:center;${glass}`)}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M12 2l9 5-9 5-9-5z" /><path d="M3 12l9 5 9-5M3 17l9 5 9-5" /></svg>
        </div>
        {hasMap && <div className="ctl" onClick={() => setFull(true)} title="3D map" style={s(`width:38px;height:38px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;${glass}`)}>3D</div>}
      </div>
      {hasMap && (
        <div className="ctl" onClick={() => setFull(true)} title="Full-screen map" style={s(`position:absolute;left:16px;bottom:34px;z-index:3;width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;${glass}`)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
        </div>
      )}
      {canPlay && (
        <div style={s('position:absolute;right:16px;bottom:34px;z-index:3;display:flex;flex-direction:column;align-items:center;gap:8px')}>
          <div className="ctl" onClick={() => setSpeed((sp) => (sp >= 4 ? 1 : sp * 2))} title="Playback speed" style={s(`min-width:36px;height:28px;padding:0 8px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;${glass}`)}>{speed}×</div>
          <button onClick={toggle} aria-label={playing ? 'Pause replay' : 'Play replay'}
            style={s('width:52px;height:52px;border-radius:50%;border:none;background:var(--accent);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;box-shadow:0 8px 20px -6px color-mix(in srgb,var(--accent) 60%,transparent)')}>
            {playing
              ? <svg width="20" height="20" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1.2" fill="var(--accent-ink)" /><rect x="14" y="4" width="4" height="16" rx="1.2" fill="var(--accent-ink)" /></svg>
              : <svg width="22" height="22" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="var(--accent-ink)" /></svg>}
          </button>
        </div>
      )}
      {/* bottom fade into the sheet */}
      <div style={s('position:absolute;left:0;right:0;bottom:0;height:60px;background:linear-gradient(0deg,var(--bg),transparent);pointer-events:none;z-index:2')} />
    </>
  );

  const box = 'position:relative;width:100%;height:308px;overflow:hidden;background:linear-gradient(160deg,#101922,#0b0f13)';

  if (status === 'loading') {
    return <div style={s(box)}>{controls}<div style={s('position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:12px')}>Loading route…</div></div>;
  }

  if (!hasMap) {
    return (
      <div style={s(box)}>
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
      <TileMap points={route} fill radius={0} pad={30} style={mapStyle} scrubPoints={route}
        onScrub={(i) => { pause(); seek(n > 1 ? i / (n - 1) : 0); }}>
        {(project) => {
          const full = toPathD(route, project);
          const done = travelled && travelled.length > 1 ? toPathD(travelled, project) : null;
          const start = project(route[0][0], route[0][1]);
          const endPt = project(route[route.length - 1][0], route[route.length - 1][1]);
          const head = project(route[index][0], route[index][1]);
          return (
            <>
              <path d={full} fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
              <path d={full} fill="none" stroke="#ff6a2c" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
              {done && <path d={done} fill="none" stroke="#111" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />}
              <circle cx={start.x} cy={start.y} r="7" fill="var(--good)" stroke="#fff" strokeWidth="3" />
              <circle cx={endPt.x} cy={endPt.y} r="7" fill="var(--bad)" stroke="#fff" strokeWidth="3" />
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
      {full && <FullMap route={route} style={mapStyle} a={a} token={token} onClose={() => setFull(false)} />}
    </div>
  );
}
