import { useRef, useState } from 'react';
import { s } from '../lib/style.js';
import RouteMapGL from './RouteMapGL.jsx';
import FullMap from './FullMap.jsx';

const MAP_STYLES = ['voyager', 'light', 'dark'];
const validPts = (route) => (route || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));

// Strava-style hero: an interactive route map (pan / pinch-zoom / rotate) with glass
// controls — back · Save Route · overflow · layers · 3D (inline terrain tilt) · full-screen ·
// play (route replay at 4×). Falls back to a gradient panel when there's no GPS.
const glass = 'background:rgba(20,23,29,.72);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.1);color:#fff';

export default function ActivityHero({ a, route, frames, hasMap, status, token, onBack, onDelete }) {
  const [mapStyle, setMapStyle] = useState('voyager');
  const [is3D, setIs3D] = useState(false);
  const [full, setFull] = useState(false);
  const [playing, setPlaying] = useState(false);
  const mapRef = useRef(null);
  const glRef = useRef(null);
  const headRef = useRef(null);
  const rafRef = useRef(0);
  const canPlay = hasMap && validPts(route).length > 1;
  const cycleStyle = () => setMapStyle((st) => MAP_STYLES[(MAP_STYLES.indexOf(st) + 1) % MAP_STYLES.length]);

  // Replay: glide a head marker along the route at a fixed 4×.
  const togglePlay = () => {
    const m = mapRef.current, gl = glRef.current, pts = validPts(route);
    if (!m || !gl || pts.length < 2) return;
    if (playing) { cancelAnimationFrame(rafRef.current); setPlaying(false); return; }
    if (!headRef.current) {
      const el = document.createElement('div');
      el.style.cssText = 'width:15px;height:15px;border-radius:50%;background:#111;border:2px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.3)';
      headRef.current = new gl.Marker({ element: el }).setLngLat([pts[0][1], pts[0][0]]).addTo(m);
    }
    setPlaying(true);
    let last = null, prog = 0;
    const step = (ts) => {
      if (last == null) last = ts;
      prog += ((ts - last) / 22000) * 4;
      last = ts;
      if (prog >= 1) { const [la, lo] = pts[pts.length - 1]; headRef.current.setLngLat([lo, la]); setPlaying(false); return; }
      const [la, lo] = pts[Math.floor(prog * (pts.length - 1))];
      headRef.current.setLngLat([lo, la]);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  };

  const controls = (
    <>
      {/* back — only when a handler is given (the global app header provides it otherwise) */}
      {onBack && (
        <div className="ctl" onClick={onBack} style={s(`position:absolute;top:16px;left:16px;z-index:3;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;${glass}`)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg>
        </div>
      )}
      {/* Save Route + overflow */}
      <div style={s('position:absolute;top:16px;right:16px;z-index:3;display:flex;gap:8px')}>
        <div className="ctl" style={s(`height:38px;padding:0 14px;border-radius:19px;display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;${glass}`)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
          Save Route
        </div>
        <div className="ctl" onClick={a.isMe ? onDelete : undefined} title={a.isMe ? 'Delete training' : undefined} style={s(`width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;letter-spacing:1px;font-size:13px;${glass}`)}>···</div>
      </div>
      {/* layers (cycle basemap) + 3D (inline terrain tilt) */}
      {hasMap && (
        <div style={s('position:absolute;top:64px;right:16px;z-index:3;display:flex;flex-direction:column;gap:8px')}>
          <div className="ctl" onClick={cycleStyle} title={`Map: ${mapStyle}`} style={s(`width:38px;height:38px;border-radius:12px;display:flex;align-items:center;justify-content:center;${glass}`)}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M12 2l9 5-9 5-9-5z" /><path d="M3 12l9 5 9-5M3 17l9 5 9-5" /></svg>
          </div>
          <div className="ctl" onClick={() => setIs3D((v) => !v)} title={is3D ? 'Switch to 2D' : 'Switch to 3D'} style={s(`width:38px;height:38px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;${is3D ? 'background:var(--accent);color:var(--accent-ink);border:1px solid var(--accent)' : glass}`)}>{is3D ? '2D' : '3D'}</div>
        </div>
      )}
      {/* full-screen */}
      {hasMap && (
        <div className="ctl" onClick={() => setFull(true)} title="Full-screen map" style={s(`position:absolute;left:16px;bottom:34px;z-index:3;width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;${glass}`)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
        </div>
      )}
      {/* play (route replay · 4×) */}
      {canPlay && (
        <button onClick={togglePlay} aria-label={playing ? 'Pause replay' : 'Play replay'}
          style={s('position:absolute;right:16px;bottom:34px;z-index:3;width:52px;height:52px;border-radius:50%;border:none;background:var(--accent);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;box-shadow:0 8px 20px -6px color-mix(in srgb,var(--accent) 60%,transparent)')}>
          {playing
            ? <svg width="20" height="20" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1.2" fill="var(--accent-ink)" /><rect x="14" y="4" width="4" height="16" rx="1.2" fill="var(--accent-ink)" /></svg>
            : <svg width="22" height="22" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="var(--accent-ink)" /></svg>}
        </button>
      )}
      {/* bottom fade into the sheet */}
      <div style={s('position:absolute;left:0;right:0;bottom:0;height:56px;background:linear-gradient(0deg,var(--bg),transparent);pointer-events:none;z-index:2')} />
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
      <RouteMapGL route={route} styleName={mapStyle} pitch={is3D ? 55 : 0} terrain={is3D}
        fitPadding={{ top: 62, bottom: 66, left: 30, right: 30 }}
        onReady={(m, gl) => { mapRef.current = m; glRef.current = gl; }} />
      {controls}
      {full && <FullMap route={route} style={mapStyle} a={a} token={token} onClose={() => setFull(false)} />}
    </div>
  );
}
