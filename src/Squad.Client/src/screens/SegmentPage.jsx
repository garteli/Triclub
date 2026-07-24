import { useMemo } from 'react';
import { s } from '../lib/style.js';
import EmptyState from '../components/EmptyState.jsx';
import { fmtDur } from '../hooks/useActivityAnalytics.js';

// One route section of an activity ("segment") — its stage profile + the athlete's real recorded
// effort over that exact stretch (time, speed, power, HR from the frames in its distance band).
// Reached by tapping a section in the activity's Route & timing breakdown. Everything is real;
// the cross-athlete segment leaderboard has no data yet, so it shows an honest "coming" state.

const kindLabel = (seg) =>
  seg.kind === 'climb' ? (seg.cat ? `Cat ${seg.cat} climb` : 'Climb')
    : seg.kind === 'descent' ? 'Descent'
      : Math.abs(seg.avgGradPct) < 1 ? 'Flat' : 'Rolling';

export default function SegmentPage({ state, actions }) {
  const seg = state.selSegment;

  const mini = useMemo(() => {
    const p = seg?.profile;
    if (!p || p.length < 2) return null;
    const d0 = p[0].dist, d1 = p[p.length - 1].dist, span = (d1 - d0) || 1;
    const es = p.map((x) => x.e), minE = Math.min(...es), maxE = Math.max(...es), eSpan = Math.max(1, maxE - minE);
    const W = 320, H = 92, pad = 6;
    const X = (dist) => ((dist - d0) / span) * W;
    const Y = (e) => H - pad - ((e - minE) / eSpan) * (H - 2 * pad);
    const line = p.map((x, i) => `${i ? 'L' : 'M'}${X(x.dist).toFixed(1)},${Y(x.e).toFixed(1)}`).join(' ');
    return { W, H, line, area: `${line} L${W},${H} L0,${H} Z`, minE: Math.round(minE), maxE: Math.round(maxE) };
  }, [seg]);

  if (!seg) {
    return <div style={s('padding:20px 18px 120px')}><EmptyState icon="⛰️" title="No segment" sub="Open a ride and tap a route section to see it here." /></div>;
  }

  const eff = seg.effort || {};
  const lenKm = (seg.lenM / 1000).toFixed(2);
  const gainTxt = `${seg.gainM >= 0 ? '↑' : '↓'}${Math.abs(seg.gainM)} m`;
  const gradTxt = `${seg.avgGradPct >= 0 ? '+' : ''}${seg.avgGradPct.toFixed(1)}%`;
  const accent = seg.color || 'var(--accent)';

  const bigs = [
    eff.durationSec != null && { v: fmtDur(eff.durationSec), u: '', k: 'Time', c: 'var(--text)' },
    eff.avgSpeed != null && { v: eff.avgSpeed.toFixed(1), u: 'km/h', k: 'Avg spd', c: 'var(--bike)' },
    eff.avgPower != null && { v: String(eff.avgPower), u: 'W', k: 'Avg pwr', c: 'var(--accent)' },
    eff.avgHr != null && { v: String(eff.avgHr), u: 'bpm', k: 'Avg HR', c: 'var(--bad)' },
  ].filter(Boolean);
  const maxes = [
    eff.maxSpeed != null && { v: eff.maxSpeed.toFixed(1), u: 'km/h', k: 'Max spd', c: 'var(--bike)' },
    eff.maxPower != null && { v: String(eff.maxPower), u: 'W', k: 'Max pwr', c: 'var(--accent)' },
    eff.maxHr != null && { v: String(eff.maxHr), u: 'bpm', k: 'Max HR', c: 'var(--bad)' },
  ].filter(Boolean);

  const facts = [
    { v: lenKm, u: 'km', k: 'Length' },
    { v: gradTxt, u: '', k: 'Avg grade', c: accent },
    { v: gainTxt, u: '', k: 'Elevation', c: seg.gainM >= 0 ? 'var(--good)' : 'var(--bike)' },
    seg.kind === 'climb' && seg.maxGradPct > 0 && { v: `${seg.maxGradPct.toFixed(1)}%`, u: '', k: 'Max grade', c: accent },
  ].filter(Boolean);

  return (
    <div style={s('padding:4px 16px 120px;animation:floatUp .35s ease')}>
      {/* name + kind */}
      <div style={s('display:flex;align-items:center;gap:11px')}>
        <span style={s(`width:40px;height:40px;border-radius:12px;flex:none;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,${accent} 16%,transparent)`)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 20l6-14 5 9 3-5 4 10z" /></svg>
        </span>
        <div style={s('flex:1;min-width:0')}>
          <div dir="auto" style={s('font-size:18px;font-weight:700;letter-spacing:-.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left')}>{seg.name}</div>
          <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin-top:3px')}>{kindLabel(seg)} · {lenKm} km · {gainTxt}</div>
        </div>
      </div>

      {/* section stage profile */}
      {mini && (
        <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:12px 12px 8px;margin-top:14px')}>
          <div style={s('display:flex;justify-content:space-between;margin-bottom:2px')}>
            <span style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;font-weight:600')}>Stage profile</span>
            <span className="mono" style={s('font-size:10px;color:var(--text2)')}>{mini.minE}–{mini.maxE} m</span>
          </div>
          <svg viewBox={`0 0 ${mini.W} ${mini.H}`} preserveAspectRatio="none" style={{ width: '100%', height: 92, display: 'block' }}>
            <path d={mini.area} fill={accent} opacity="0.12" />
            <path d={mini.line} fill="none" stroke={accent} strokeWidth="2.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        </div>
      )}

      {/* your effort */}
      <div style={s(`background:color-mix(in srgb,${accent} 8%,var(--bg2));border:1px solid color-mix(in srgb,${accent} 28%,transparent);border-radius:18px;padding:15px 16px;margin-top:14px`)}>
        <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1.2px;font-weight:700')}>Your effort</div>
        <div style={s('display:flex;flex-wrap:wrap;gap:18px;margin-top:12px')}>
          {bigs.map((b) => (
            <div key={b.k}>
              <div className="mono" style={s(`font-size:26px;font-weight:800;letter-spacing:-1px;line-height:1;color:${b.c}`)}>{b.v}{b.u && <span style={s('font-size:11px;color:var(--text3);font-weight:600')}> {b.u}</span>}</div>
              <div style={s('font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px;margin-top:6px')}>{b.k}</div>
            </div>
          ))}
        </div>
        {maxes.length > 0 && (
          <div style={s('display:flex;flex-wrap:wrap;gap:16px;margin-top:14px;padding-top:12px;border-top:1px solid var(--line)')}>
            {maxes.map((m) => (
              <div key={m.k}><span className="mono" style={s(`font-size:14px;font-weight:700;color:${m.c}`)}>{m.v}<span style={s('font-size:9px;color:var(--text3)')}> {m.u}</span></span><div style={s('font-size:8px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-top:3px')}>{m.k}</div></div>
            ))}
          </div>
        )}
        {bigs.length === 0 && <div style={s('font-size:12.5px;color:var(--text3);margin-top:8px')}>No power / speed data was recorded over this section.</div>}
      </div>

      {/* section facts */}
      <div style={s('display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:1px;background:var(--line);border:1px solid var(--line);border-radius:16px;overflow:hidden;margin-top:12px')}>
        {facts.map((f) => (
          <div key={f.k} style={s('background:var(--bg2);padding:12px 6px;text-align:center')}>
            <div className="mono" style={s(`font-size:16px;font-weight:800;letter-spacing:-.5px;line-height:1;color:${f.c || 'var(--text)'}`)}>{f.v}{f.u && <span style={s('font-size:9px;color:var(--text3);font-weight:600')}> {f.u}</span>}</div>
            <div style={s('font-size:8px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px;margin-top:6px')}>{f.k}</div>
          </div>
        ))}
      </div>

      {/* leaderboard — no segment-matching backend yet, so an honest empty state (no fabricated ranks) */}
      <div style={s('display:flex;align-items:center;gap:10px;margin:22px 2px 12px')}>
        <span style={s('font-size:10px;color:var(--accent);text-transform:uppercase;letter-spacing:1.3px;font-weight:700')}>Leaderboard</span>
        <span style={s('flex:1;height:1px;background:var(--line)')} />
      </div>
      <div style={s('background:var(--bg2);border:1px dashed var(--line2);border-radius:16px;padding:18px 16px;text-align:center')}>
        <div style={s('font-size:13.5px;font-weight:700')}>Segment leaderboards are coming</div>
        <div style={s('font-size:12px;color:var(--text2);margin-top:4px;line-height:1.5')}>Once your squad rides this stretch, everyone's times here will be ranked — with KOM/CR and your PR.</div>
      </div>

      <div className="ctl" onClick={() => actions.back?.()} style={s('text-align:center;margin-top:16px;font-size:12.5px;font-weight:700;color:var(--accent)')}>Back to the ride</div>
    </div>
  );
}
