import { useMemo, useRef } from 'react';
import { s } from '../lib/style.js';
import TileMap from './TileMap.jsx';
import { toPathD } from '../lib/tiles.js';
import { usePlayback } from '../hooks/usePlayback.js';

// Interactive, animated replay of one activity: a real-basemap route that draws in as a
// marker sweeps along it, in lock-step with the HR / power / speed / cadence / elevation
// traces below. One shared playhead (usePlayback) drives every surface — press play to
// watch the ride unfold, or drag the scrubber, any chart, or the map itself to scrub the
// whole set to that moment. `frames` and each trace's `values` share one index space, so
// the cursor is a single number.

// Keep the pointer's events flowing to this element during a drag even if the finger
// slides off it. Synthetic/edge-case pointer ids can throw here — never let that abort
// the drag handler.
const capture = (e) => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ } };

const clock = (sec) => {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), ss = sec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    : `${m}:${String(ss).padStart(2, '0')}`;
};

// Value of a per-frame series at the cursor; if that exact frame is a gap, take the
// nearest recorded sample within a small window so the readout doesn't flicker to "—".
function valueAt(values, index) {
  const v = values[index];
  if (v != null && Number.isFinite(v)) return v;
  for (let d = 1; d <= 24; d++) {
    const a = values[index - d], b = values[index + d];
    if (a != null && Number.isFinite(a)) return a;
    if (b != null && Number.isFinite(b)) return b;
  }
  return null;
}

// One time-synced trace: the sparkline plus a cursor line + dot at the playhead, a live
// current-value readout, and drag-to-scrub. Horizontal drags seek; `touch-action:pan-y`
// keeps vertical page scrolling working on touch.
function CursorTrace({ title, unit, values, stroke, fill, fmt, index, onSeek, onGrab }) {
  const W = 320, H = 46;
  const f = fmt || ((x) => Math.round(x));
  const trackRef = useRef(null);
  const geom = useMemo(() => {
    const pts = values.map((v, i) => [i, v]).filter(([, v]) => v != null && Number.isFinite(v));
    if (pts.length < 2) return null;
    const ys = pts.map(([, v]) => v);
    const min = Math.min(...ys), max = Math.max(...ys), span = (max - min) || 1;
    const n = (values.length - 1) || 1;
    const X = (i) => (i / n) * W;
    const Y = (v) => (H - 3) - ((v - min) / span) * (H - 6);
    const line = pts.map(([i, v], k) => `${k ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    const area = `${line} L${X(pts[pts.length - 1][0]).toFixed(1)},${H} L${X(pts[0][0]).toFixed(1)},${H} Z`;
    const avg = ys.reduce((a, b) => a + b, 0) / ys.length;
    return { line, area, X, Y, avg, max, n };
  }, [values]);
  if (!geom) return null;

  const cur = valueAt(values, index);
  const cx = geom.X(index);
  const cy = cur != null ? geom.Y(cur) : null;

  const seekFromEvent = (e) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    onSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
  };

  return (
    <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:12px 13px;margin-top:10px')}>
      <div style={s('display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px')}>
        <div style={s('font-size:12px;font-weight:700')}>{title}</div>
        <div className="mono" style={s('font-size:11px;color:var(--text3)')}>
          <b style={s(`color:${stroke};font-size:13px`)}>{cur != null ? f(cur) : '—'}</b>{unit ? ` ${unit}` : ''}
          <span style={s('opacity:.7')}> · avg {f(geom.avg)}</span>
        </div>
      </div>
      <div
        ref={trackRef}
        onPointerDown={(e) => { capture(e); onGrab(); seekFromEvent(e); }}
        onPointerMove={(e) => { if (e.buttons) seekFromEvent(e); }}
        style={{ position: 'relative', cursor: 'ew-resize', touchAction: 'pan-y' }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, display: 'block' }}>
          <path d={geom.area} fill={fill} opacity="0.13" />
          <path d={geom.line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <line x1={cx} y1="0" x2={cx} y2={H} stroke="var(--text2)" strokeWidth="1" opacity="0.5" vectorEffect="non-scaling-stroke" />
          {cy != null && <circle cx={cx} cy={cy} r="3.5" fill={stroke} stroke="var(--bg2)" strokeWidth="1.5" />}
        </svg>
      </div>
    </div>
  );
}

export default function ActivityReplay({ frames, route, hasMap, traces }) {
  const { pos, index, playing, speed, setSpeed, seek, toggle, pause } = usePlayback(frames.length);

  const totalSec = frames.length ? (frames[frames.length - 1].offsetSec ?? 0) : 0;
  const curSec = frames[index]?.offsetSec ?? 0;

  // Progressive route: the whole line faded, the travelled portion up to the cursor in
  // accent, with a marker at the head. Slicing per frame is cheap at ≤600 points.
  const travelled = useMemo(() => (hasMap ? route.slice(0, index + 1) : null), [route, index, hasMap]);

  const scrubTrackRef = useRef(null);
  const seekFromScrubber = (e) => {
    const r = scrubTrackRef.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    seek((e.clientX - r.left) / r.width);
  };
  const cycleSpeed = () => setSpeed((sp) => (sp >= 4 ? 1 : sp * 2));

  // Live chips: current value of each present metric at the playhead.
  const chips = traces.map((tr) => ({
    key: tr.key, stroke: tr.stroke, unit: tr.unit,
    label: tr.title,
    value: valueAt(tr.values, index),
    fmt: tr.fmt || ((x) => Math.round(x)),
  }));

  return (
    <div>
      {hasMap && (
        <div style={s('position:relative')}>
          <TileMap
            points={route}
            radius={16}
            pad={26}
            scrubPoints={route}
            onScrub={(i) => { pause(); seek(frames.length > 1 ? i / (frames.length - 1) : 0); }}
          >
            {(project) => {
              const full = toPathD(route, project);
              const done = travelled && travelled.length > 1 ? toPathD(travelled, project) : null;
              const start = project(route[0][0], route[0][1]);
              const endPt = project(route[route.length - 1][0], route[route.length - 1][1]);
              const head = project(route[index][0], route[index][1]);
              return (
                <>
                  <path d={full} fill="none" stroke="rgba(255,255,255,.85)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
                  <path d={full} fill="none" stroke="var(--text3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
                  {done && <path d={done} fill="none" stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />}
                  <circle cx={start.x} cy={start.y} r="5" fill="var(--good)" stroke="#fff" strokeWidth="2" />
                  <circle cx={endPt.x} cy={endPt.y} r="5" fill="var(--bad)" stroke="#fff" strokeWidth="2" />
                  {/* moving playhead marker with a soft pulse */}
                  <circle cx={head.x} cy={head.y} r="9" fill="var(--accent)" opacity="0.22">
                    <animate attributeName="r" values="7;12;7" dur="1.6s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.28;0.05;0.28" dur="1.6s" repeatCount="indefinite" />
                  </circle>
                  <circle cx={head.x} cy={head.y} r="6" fill="#fff" />
                  <circle cx={head.x} cy={head.y} r="4" fill="var(--accent)" />
                </>
              );
            }}
          </TileMap>
        </div>
      )}

      {/* Live readout chips */}
      {chips.length > 0 && (
        <div style={s('display:flex;flex-wrap:wrap;gap:6px;margin-top:10px')}>
          {chips.map((c) => (
            <div key={c.key} style={s('display:flex;align-items:center;gap:5px;background:var(--bg2);border:1px solid var(--line);border-radius:999px;padding:4px 10px')}>
              <span style={s(`width:7px;height:7px;border-radius:50%;background:${c.stroke};flex:none`)} />
              <span className="mono" style={s('font-size:12px;font-weight:700')}>{c.value != null ? c.fmt(c.value) : '—'}</span>
              <span style={s('font-size:10px;color:var(--text3)')}>{c.unit}</span>
            </div>
          ))}
        </div>
      )}

      {/* Transport bar: play/pause · scrubber · time · speed */}
      <div style={s('display:flex;align-items:center;gap:11px;margin-top:11px')}>
        <button
          onClick={toggle}
          aria-label={playing ? 'Pause' : 'Play'}
          style={s('flex:none;width:38px;height:38px;border-radius:50%;border:none;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0')}
        >
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="1.5" width="3.4" height="11" rx="1" fill="#fff" /><rect x="8.6" y="1.5" width="3.4" height="11" rx="1" fill="#fff" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 1.7 12 7 3 12.3Z" fill="#fff" /></svg>
          )}
        </button>

        <div
          ref={scrubTrackRef}
          onPointerDown={(e) => { capture(e); pause(); seekFromScrubber(e); }}
          onPointerMove={(e) => { if (e.buttons) seekFromScrubber(e); }}
          style={{ position: 'relative', flex: 1, height: 26, display: 'flex', alignItems: 'center', cursor: 'pointer', touchAction: 'none' }}
        >
          <div style={s('position:absolute;left:0;right:0;height:5px;border-radius:3px;background:var(--bg4)')} />
          <div style={{ position: 'absolute', left: 0, width: `${pos * 100}%`, height: 5, borderRadius: 3, background: 'var(--accent)' }} />
          <div style={{ position: 'absolute', left: `${pos * 100}%`, width: 14, height: 14, marginLeft: -7, borderRadius: '50%', background: '#fff', border: '2px solid var(--accent)', boxShadow: '0 1px 3px rgba(0,0,0,.25)' }} />
        </div>

        <div className="mono" style={s('font-size:11px;color:var(--text3);flex:none;letter-spacing:.2px')}>
          <b style={s('color:var(--text)')}>{clock(curSec)}</b> / {clock(totalSec)}
        </div>

        <button
          onClick={cycleSpeed}
          aria-label="Playback speed"
          style={s('flex:none;min-width:34px;height:26px;border-radius:8px;border:1px solid var(--line);background:var(--bg2);color:var(--text2);font-size:11px;font-weight:700;cursor:pointer;padding:0 7px')}
        >
          {speed}×
        </button>
      </div>

      {/* Time-synced traces */}
      {traces.map((tr) => (
        <CursorTrace
          key={tr.key}
          title={tr.title}
          unit={tr.unit}
          values={tr.values}
          stroke={tr.stroke}
          fill={tr.fill}
          fmt={tr.fmt}
          index={index}
          onSeek={seek}
          onGrab={pause}
        />
      ))}
    </div>
  );
}
