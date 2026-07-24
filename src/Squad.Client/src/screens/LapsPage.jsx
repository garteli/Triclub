import { useMemo, useState } from 'react';
import { s } from '../lib/style.js';
import EmptyState from '../components/EmptyState.jsx';
import { useActivityTrack } from '../hooks/useActivityTrack.js';
import { useActivityAnalytics, fmtDur } from '../hooks/useActivityAnalytics.js';

// Per-lap breakdown for the open activity (per the handoff) — a bar per lap (avg power, or speed
// when there's no power) over the elevation backdrop, tappable to highlight, then a laps list with
// distance / speed / time / avg power. Device laps when the recording carried them, else auto splits.

export default function LapsPage({ vm, getToken }) {
  const a = vm.activityDetail;
  const { track, laps, status } = useActivityTrack(a?.id, { getToken });
  const analytics = useActivityAnalytics(track, laps, a?.sport);
  const rows = analytics.useLaps ? analytics.lapRows : analytics.splits;

  const [sel, setSel] = useState(0); // 0 = none selected (all lit)

  const powerMode = useMemo(() => (rows || []).some((l) => l.avgPower != null && l.avgPower > 0), [rows]);
  const laneVal = (l) => (powerMode ? (l.avgPower || 0) : (l.sec > 0 ? l.meters / l.sec * 3.6 : 0));
  const vmax = useMemo(() => Math.max(1, ...(rows || []).map(laneVal)), [rows, powerMode]);

  const elev = useMemo(() => {
    const es = (track || []).map((p) => p.elevM).filter((v) => Number.isFinite(v));
    if (es.length < 4) return null;
    const N = 90, out = [];
    for (let i = 0; i < N; i++) out.push(es[Math.floor(i / (N - 1) * (es.length - 1))]);
    const min = Math.min(...out), max = Math.max(...out), span = Math.max(1, max - min);
    const W = 300, H = 210;
    const line = out.map((v, i) => `${i ? 'L' : 'M'}${(i / (N - 1) * W).toFixed(1)} ${(H - (v - min) / span * (H - 20)).toFixed(1)}`).join(' ');
    return { line, area: `${line} L${W} ${H} L0 ${H} Z` };
  }, [track]);

  if (!a) {
    return <div style={s('padding:20px 18px 120px')}><EmptyState icon="🏁" title="No activity" sub="Open a ride to see its laps." /></div>;
  }
  if (status === 'ready' && (!rows || rows.length < 2)) {
    return (
      <div style={s('padding:20px 18px 120px;animation:floatUp .35s ease')}>
        <EmptyState icon="🏁" title="No laps" sub="This activity didn't record laps and is too short to split." />
      </div>
    );
  }
  if (!rows || rows.length < 2) {
    return <div style={s('padding:20px 18px 120px;color:var(--text3);font-size:12.5px;text-align:center')}>Reading the ride…</div>;
  }

  const unitLabel = powerMode ? 'W' : 'kph';
  const yTop = powerMode ? Math.ceil(vmax / 50) * 50 : Math.ceil(vmax / 10) * 10;
  const yTicks = [];
  for (let v = 0; v <= yTop; v += (powerMode ? yTop / 5 : yTop / 5)) yTicks.push({ v: Math.round(v), topPct: (1 - v / yTop) * 100 });

  return (
    <div style={s('padding:2px 15px 120px;animation:floatUp .35s ease')}>
      <div style={s('font-size:12.5px;color:var(--text3);margin:6px 2px 16px')}>Tap a lap to highlight it.</div>

      {/* chart */}
      <div style={s('position:relative;height:230px;padding-left:34px')}>
        <div style={s('position:absolute;left:0;top:0;bottom:20px;width:32px;pointer-events:none')}>
          {yTicks.map((y) => <span key={y.v} className="mono" style={s(`position:absolute;top:${y.topPct.toFixed(1)}%;transform:translateY(-50%);right:4px;font-size:10px;color:var(--text3)`)}>{y.v === 0 ? unitLabel : y.v}</span>)}
        </div>
        <div style={s('position:relative;height:210px')}>
          {elev && (
            <svg viewBox="0 0 300 210" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              <path d={elev.area} fill="rgba(255,255,255,.06)" />
              <path d={elev.line} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="1.1" />
            </svg>
          )}
          <div style={s('position:absolute;inset:0;display:flex;align-items:flex-end;gap:6px')}>
            {rows.map((l) => {
              const on = sel === 0 || sel === l.index;
              return (
                <div key={l.index} className="ctl" onClick={() => setSel((cur) => (cur === l.index ? 0 : l.index))}
                  style={s(`flex:1;height:${Math.max(6, Math.round(laneVal(l) / yTop * 100))}%;background:linear-gradient(180deg,#b98cff,#7b3ff2);border-radius:5px 5px 0 0;min-height:8px;opacity:${on ? 1 : 0.4};transition:opacity .15s`)} />
              );
            })}
          </div>
        </div>
        <div style={s('display:flex;gap:6px;height:20px;padding-top:6px')}>
          {rows.map((l) => <span key={l.index} className="mono" style={s(`flex:1;text-align:center;font-size:11px;color:${sel === l.index ? '#b98cff' : 'var(--text3)'}`)}>{l.index}</span>)}
        </div>
      </div>

      {/* list */}
      <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1.3px;font-weight:700;margin:22px 4px 4px')}>Laps</div>
      <div>
        {rows.map((l) => {
          const on = sel === l.index;
          const kph = l.sec > 0 ? (l.meters / l.sec * 3.6) : 0;
          return (
            <div key={l.index} className="ctl" onClick={() => setSel((cur) => (cur === l.index ? 0 : l.index))}
              style={s(`display:flex;align-items:center;gap:12px;padding:14px 8px;border-bottom:1px solid var(--line);border-radius:10px;background:${on ? 'color-mix(in srgb,#b98cff 12%,transparent)' : 'transparent'}`)}>
              <span className="mono" style={s(`font-size:15px;font-weight:800;color:${on ? '#c79bff' : '#b98cff'};width:22px`)}>{l.index}</span>
              <span className="mono" style={s('flex:1;font-size:14.5px;color:var(--text)')}>{(l.meters / 1000).toFixed(2)}<span style={s('font-size:10px;color:var(--text3)')}> km</span></span>
              <span className="mono" style={s('font-size:13.5px;font-weight:700;color:var(--bike);width:62px;text-align:right')}>{kph.toFixed(1)}<span style={s('font-size:9px;color:var(--text3)')}> kph</span></span>
              <span className="mono" style={s('font-size:14.5px;font-weight:700;width:54px;text-align:right')}>{fmtDur(l.sec)}</span>
              <span className="mono" style={s('font-size:14.5px;font-weight:700;color:#b98cff;width:52px;text-align:right')}>{l.avgPower != null && l.avgPower > 0 ? Math.round(l.avgPower) : '—'}<span style={s('font-size:9px;color:var(--text3)')}> W</span></span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
