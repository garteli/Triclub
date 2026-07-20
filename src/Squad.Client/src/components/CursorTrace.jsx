import { useMemo, useRef } from 'react';
import { s } from '../lib/style.js';

// Keep the pointer's events flowing to this element during a drag even if the finger
// slides off it. Synthetic/edge-case pointer ids can throw here — never let that abort
// the drag handler.
export const capture = (e) => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ } };

// Value of a per-frame series at the cursor; if that exact frame is a gap, take the
// nearest recorded sample within a small window so the readout doesn't flicker to "—".
export function valueAt(values, index) {
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
// keeps vertical page scrolling working on touch. Every trace + the hero map share one
// playhead `index`, so scrubbing any of them moves them all.
export default function CursorTrace({ title, unit, values, stroke, fill, fmt, index, onSeek, onGrab }) {
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
