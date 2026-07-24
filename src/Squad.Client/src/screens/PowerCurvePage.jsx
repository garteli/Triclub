import { useEffect, useMemo, useState } from 'react';
import { s } from '../lib/style.js';
import EmptyState from '../components/EmptyState.jsx';
import { useActivityTrack, loadTrack } from '../hooks/useActivityTrack.js';
import { powerCurve, curveEnvelope, curveWattsAt } from '../lib/powerAnalysis.js';

// Full-screen mean-maximal power curve for the open activity — the best average power sustained
// for every duration (log-time x-axis), with an optional "last 6 weeks" best-of envelope for
// context and a 5s/1m/5m/20m peak strip. Reached from the activity's Power Curve card.

const RIDE = '#b98cff';      // this ride
const HIST = 'var(--text3)'; // 6-week best
const RIDE_DIM = 'rgba(185,140,255,.14)';

const DUR_LABEL = (sec) => (sec < 60 ? `${sec}s` : sec < 3600 ? `${Math.round(sec / 60)}m` : `${Math.round(sec / 360) / 10}h`);
const SIX_WEEKS_MS = 42 * 24 * 3600 * 1000;
const PEAKS = [[5, '5s'], [60, '1m'], [300, '5m'], [1200, '20m']];

export default function PowerCurvePage({ vm, actions, getToken }) {
  const a = vm.activityDetail;
  const { track, status } = useActivityTrack(a?.id, { getToken });
  const rideCurve = useMemo(() => powerCurve(track || []), [track]);

  const [showRide, setShowRide] = useState(true);
  const [showHist, setShowHist] = useState(true);
  const [hist, setHist] = useState({ curve: [], status: 'idle', n: 0 });

  // Build the athlete's 6-week best-of envelope from their recent bike rides (lazy; the track
  // fetches share useActivityTrack's session cache, and concurrency is capped).
  useEffect(() => {
    if (!a || a.sport !== 'Bike') { setHist({ curve: [], status: 'none', n: 0 }); return undefined; }
    let cancelled = false;
    (async () => {
      setHist((h) => ({ ...h, status: 'loading' }));
      const now = Date.now();
      const rides = (vm.myActivities || [])
        .filter((x) => x.sport === 'Bike' && x.id && x.startUtc && (now - new Date(x.startUtc).getTime()) <= SIX_WEEKS_MS)
        .sort((x, y) => new Date(y.startUtc) - new Date(x.startUtc))
        .slice(0, 20);
      if (!rides.length) { if (!cancelled) setHist({ curve: [], status: 'ready', n: 0 }); return; }
      const token = getToken ? await getToken() : null;
      const curves = [];
      let idx = 0;
      const worker = async () => {
        while (idx < rides.length && !cancelled) {
          const r = rides[idx++];
          try { const { track: t } = await loadTrack(r.id, token); const c = powerCurve(t); if (c.length) curves.push(c); }
          catch { /* skip a ride we can't read */ }
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, rides.length) }, worker));
      if (!cancelled) setHist({ curve: curveEnvelope(curves), status: 'ready', n: curves.length });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a?.id, a?.sport]);

  if (!a) {
    return <div style={s('padding:20px 18px 120px')}><EmptyState icon="⚡" title="No activity" sub="Open a ride to see its power curve." /></div>;
  }
  if (status === 'ready' && rideCurve.length < 2 && hist.curve.length < 2) {
    return (
      <div style={s('padding:20px 18px 120px;animation:floatUp .35s ease')}>
        <EmptyState icon="⚡" title="No power data" sub="This activity was recorded without a power meter, so there's no power curve to show." />
      </div>
    );
  }

  const histReady = hist.status === 'ready' && hist.curve.length >= 2;
  const showRideCurve = showRide && rideCurve.length >= 2;
  const showHistCurve = showHist && histReady;

  return (
    <div style={s('display:flex;flex-direction:column;min-height:calc(100dvh - var(--app-header-h));padding:2px 16px 120px;animation:floatUp .35s ease')}>
      {/* legend toggles */}
      <div style={s('display:flex;gap:10px;margin:4px 0 14px')}>
        <Toggle on={showRide} onClick={() => setShowRide((v) => !v)} dot={RIDE} label="This ride" />
        <Toggle on={showHist} onClick={() => setShowHist((v) => !v)} dot="#6b7686"
          label={hist.status === 'loading' ? 'Last 6 weeks…' : `Last 6 weeks${histReady && hist.n ? ` · ${hist.n}` : ''}`}
          disabled={hist.status === 'none' || (hist.status === 'ready' && hist.curve.length < 2)} />
      </div>

      <Chart rideCurve={showRideCurve ? rideCurve : []} histCurve={showHistCurve ? hist.curve : []} loading={status === 'loading'} />

      {/* peak readout strip — this ride's bests */}
      <div style={s('margin-top:16px')}>
        <div style={s('display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:1px;background:var(--line);border:1px solid var(--line);border-radius:16px;overflow:hidden')}>
          {PEAKS.map(([sec, lbl]) => {
            const w = curveWattsAt(rideCurve, sec);
            return (
              <div key={sec} style={s('background:var(--bg2);padding:13px 6px;text-align:center')}>
                <div className="mono" style={s(`font-size:22px;font-weight:800;letter-spacing:-.6px;line-height:1;color:${w != null ? RIDE : 'var(--text3)'}`)}>{w != null ? w : '—'}</div>
                <div style={s('font-size:9px;letter-spacing:1.1px;text-transform:uppercase;font-weight:700;color:var(--text3);margin-top:6px')}>{lbl}{w != null ? ' W' : ''}</div>
              </div>
            );
          })}
        </div>
        <div style={s('font-size:11px;color:var(--text3);text-align:center;margin-top:10px;line-height:1.5')}>
          Peak power — the best average you held for each duration this ride.
        </div>
      </div>
    </div>
  );
}

function Toggle({ on, onClick, dot, label, disabled }) {
  return (
    <div className={disabled ? undefined : 'ctl'} onClick={disabled ? undefined : onClick}
      style={s(`flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:11px;border-radius:13px;font-size:13px;font-weight:600;transition:all .15s;
        ${disabled ? 'opacity:.4;' : ''}
        ${on ? 'background:var(--accent-dim);border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);color:var(--text)'
             : 'background:var(--bg2);border:1px solid var(--line);color:var(--text2)'}`)}>
      <span style={s(`width:15px;height:3px;border-radius:2px;background:${dot}`)} />{label}
    </div>
  );
}

// Log-time x-axis power curve. Both curves share one scale so they overlay for comparison.
// The plot flexes to fill the page's remaining height; the SVG stretches to it via
// preserveAspectRatio="none", so both axes' labels are positioned as viewBox-fraction
// percentages (not px) to stay aligned at any rendered height. H_PX is just the viewBox
// coordinate height (an arbitrary aspect unit), no longer a fixed pixel size.
const H_PX = 268;
function Chart({ rideCurve, histCurve, loading }) {
  const g = useMemo(() => {
    const all = [...rideCurve, ...histCurve];
    if (all.length < 2) return null;
    const secs = all.map((c) => c.sec);
    const first = Math.min(...secs), last = Math.max(...secs);
    const maxW = Math.max(...all.map((c) => c.watts));
    const W = 400, H = H_PX, L = 30, R = 398, T = 8, B = H_PX - 8;
    const lmin = Math.log(first), lspan = (Math.log(last) - lmin) || 1;
    const X = (sec) => L + ((Math.log(sec) - lmin) / lspan) * (R - L);
    const yTop = Math.max(100, Math.ceil(maxW / 100) * 100); // round up to a clean 100 W
    const Y = (w) => T + (1 - w / yTop) * (B - T);
    const path = (curve) => curve.map((c, i) => `${i ? 'L' : 'M'}${X(c.sec).toFixed(1)},${Y(c.watts).toFixed(1)}`).join(' ');
    const area = (curve) => `${path(curve)} L${X(last).toFixed(1)},${B} L${X(first).toFixed(1)},${B} Z`;
    const step = yTop <= 400 ? 100 : yTop <= 800 ? 200 : 300;
    const yTicks = [];
    for (let v = 0; v <= yTop; v += step) yTicks.push({ v, y: Y(v) });
    const xTicks = [1, 5, 15, 60, 300, 1200, 3600, 7200].filter((t) => t >= first && t <= last).map((t) => ({ t, x: X(t) }));
    return { W, H, L, R, T, B, X, Y, path, area, yTicks, xTicks };
  }, [rideCurve, histCurve]);

  if (!g) {
    return (
      <div style={s('flex:1;min-height:320px;display:flex;align-items:center;justify-content:center;background:var(--bg2);border:1px solid var(--line);border-radius:16px;color:var(--text3);font-size:12.5px')}>
        {loading ? 'Reading the ride…' : 'Turn on a curve to see it.'}
      </div>
    );
  }
  return (
    <div style={s('flex:1;min-height:0;display:flex;flex-direction:column;background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:10px 10px 8px')}>
      <div style={s('position:relative;flex:1;min-height:0')}>
        <svg viewBox={`0 0 ${g.W} ${g.H}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
          <defs><linearGradient id="pcFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={RIDE} stopOpacity=".22" /><stop offset="1" stopColor={RIDE} stopOpacity="0" /></linearGradient></defs>
          {g.yTicks.map((t) => <line key={t.v} x1={g.L} y1={t.y} x2={g.R} y2={t.y} stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
          {g.xTicks.map((t) => <line key={t.t} x1={t.x} y1={g.T} x2={t.x} y2={g.B} stroke="var(--line)" strokeWidth="1" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />)}
          {histCurve.length >= 2 && <>
            <path d={g.area(histCurve)} fill="rgba(120,132,150,.10)" />
            <path d={g.path(histCurve)} fill="none" stroke="#7d8896" strokeWidth="2.4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          </>}
          {rideCurve.length >= 2 && <>
            <path d={g.area(rideCurve)} fill="url(#pcFill)" />
            <path d={g.path(rideCurve)} fill="none" stroke={RIDE} strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          </>}
        </svg>
        {/* y-axis labels — top in px matches the svg (viewBox H == pixel H) */}
        {g.yTicks.filter((t) => t.v > 0).map((t) => (
          <span key={t.v} className="mono" style={s(`position:absolute;top:${(t.y / g.H * 100).toFixed(2)}%;left:0;transform:translateY(-50%);font-size:9.5px;color:var(--text3);background:var(--bg2);padding-right:3px`)}>{t.v}</span>
        ))}
      </div>
      {/* x-axis labels — full-width strip under the plot, aligned by viewBox fraction */}
      <div style={s('position:relative;height:14px;margin-top:2px')}>
        {g.xTicks.map((t) => (
          <span key={t.t} className="mono" style={s(`position:absolute;left:${(t.x / g.W * 100).toFixed(1)}%;transform:translateX(-50%);font-size:10px;color:var(--text3)`)}>{DUR_LABEL(t.t)}</span>
        ))}
      </div>
    </div>
  );
}
