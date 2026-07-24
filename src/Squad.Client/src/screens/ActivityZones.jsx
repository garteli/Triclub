import { useMemo, useState } from 'react';
import { s } from '../lib/style.js';
import EmptyState from '../components/EmptyState.jsx';
import { useActivityTrack } from '../hooks/useActivityTrack.js';
import { useActivityAnalytics, fmtDur } from '../hooks/useActivityAnalytics.js';
import {
  zoneDistribution, PWR_ZONE_FRACS, PWR_ZONE_NAMES, HR_ZONE_FRACS, HR_ZONE_NAMES,
} from '../lib/powerAnalysis.js';

// Full-screen time-in-zone breakdown for the open activity (per the design handoff) — a
// Power / Heart-rate toggle, one bar per zone (share of the ride + its bpm/W band), a
// headline for the busiest zone, and a plain-language read-out. Reached from the activity's
// zone card. All real: zones come from the recorded stream + the athlete's FTP / max-HR.

// Handoff ramps: HR reds (Z1 light → Z5 dark), Power purples (Z1 light → Z7 dark).
const HR_RAMP = ['#f7b0ac', '#f5837c', '#f0574f', '#e0342f', '#a30f12'];
const PW_RAMP = ['#cdaaff', '#b98cff', '#9a5cf5', '#8340e8', '#6f2ad6', '#5a1fb0', '#3b1580'];

export default function ActivityZones({ vm, actions, getToken }) {
  const a = vm.activityDetail;
  const { track, laps, status } = useActivityTrack(a?.id, { getToken });
  const { pwZones, hZones, zones } = useActivityAnalytics(track, laps, a?.sport);

  const powerRows = useMemo(
    () => attach(zoneDistribution(pwZones, PWR_ZONE_FRACS, zones.ftp), PWR_ZONE_NAMES, PW_RAMP, 'W'),
    [pwZones, zones.ftp]);
  const hrRows = useMemo(
    () => attach(zoneDistribution(hZones, HR_ZONE_FRACS, zones.maxHr), HR_ZONE_NAMES, HR_RAMP, 'bpm'),
    [hZones, zones.maxHr]);

  const hasPower = !!powerRows, hasHr = !!hrRows;
  const [metric, setMetric] = useState('power'); // default; corrected below once data is known
  const active = metric === 'power' && hasPower ? 'power' : metric === 'hr' && hasHr ? 'hr' : hasPower ? 'power' : 'hr';
  const rows = active === 'power' ? powerRows : hrRows;
  const accent = active === 'power' ? '#b98cff' : '#ff5064';
  const ref = active === 'power' ? zones.ftp : zones.maxHr;
  const refLabel = active === 'power' ? `FTP ${zones.ftp} W` : `max ${zones.maxHr} bpm`;

  if (!a) {
    return <div style={s('padding:20px 18px 120px')}><EmptyState icon="🎯" title="No activity" sub="Open a ride to see its training zones." /></div>;
  }
  if (status === 'ready' && !hasPower && !hasHr) {
    return (
      <div style={s('padding:20px 18px 120px;animation:floatUp .35s ease')}>
        <EmptyState icon="🎯" title="No zone data"
          sub={ref ? "This activity has no power or heart-rate stream, so there's nothing to break into zones." : 'Set your FTP and max HR in Settings → Training zones to unlock zone analysis.'} />
        <div className="ctl" onClick={() => actions.go('zones')} style={s('margin:16px auto 0;max-width:220px;text-align:center;padding:11px;border-radius:12px;background:var(--bg2);border:1px solid var(--line);font-size:12.5px;font-weight:700;color:var(--accent)')}>Edit training zones</div>
      </div>
    );
  }

  const total = rows ? rows.reduce((acc, z) => acc + z.secs, 0) : 0;
  const top = rows ? rows.reduce((best, z) => (z.pct > best.pct ? z : best), rows[0]) : null;
  const ordered = rows ? [...rows].reverse() : []; // highest zone first, like the handoff

  return (
    <div style={s('padding:4px 16px 120px;animation:floatUp .35s ease')}>
      {/* metric toggle — only the metrics this ride recorded */}
      <div style={s('display:flex;gap:8px;margin:2px 0 18px;overflow-x:auto')}>
        <Pill on={active === 'hr'} disabled={!hasHr} onClick={() => setMetric('hr')} accent="#ff5064">Heart rate</Pill>
        <Pill on={active === 'power'} disabled={!hasPower} onClick={() => setMetric('power')} accent="#b98cff">Power</Pill>
      </div>

      {/* headline — the busiest zone this ride */}
      {top && (
        <div style={s('display:flex;align-items:flex-start;justify-content:space-between;gap:12px')}>
          <div>
            <div style={s('font-size:32px;font-weight:700;letter-spacing:-1px;line-height:1')}>{top.pct}% in <span style={s(`color:${top.color}`)}>Zone {top.i + 1}</span></div>
            <div style={s('font-size:12.5px;color:var(--text3);margin-top:8px')}>{top.name} · {fmtDur(top.secs)} of {fmtDur(total)}</div>
          </div>
          <div className="ctl" onClick={() => actions.go('zones')} title="Edit FTP & max HR"
            style={s('flex:none;width:34px;height:34px;border-radius:11px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></svg>
          </div>
        </div>
      )}

      {/* zone bars */}
      <div style={s('margin-top:22px;display:flex;flex-direction:column;gap:13px')}>
        {ordered.map((z) => (
          <div key={z.z} style={s('display:flex;align-items:center;gap:11px')}>
            <span className="mono" style={s(`width:22px;font-size:13px;font-weight:800;color:${z.color}`)}>{z.z}</span>
            <div style={s('flex:1;display:flex;align-items:center;gap:9px;min-width:0')}>
              <div style={s(`height:18px;width:${Math.max(z.bar, z.pct > 0 ? 4 : 0)}%;min-width:${z.pct > 0 ? 6 : 0}px;background:${z.color};border-radius:5px;transition:width .4s ease`)} />
              <span className="mono" style={s('font-size:13.5px;font-weight:700;white-space:nowrap')}>{z.pct}%</span>
            </div>
            <span className="mono" style={s('font-size:11.5px;color:var(--text3);white-space:nowrap')}>{z.range} {z.unit}</span>
          </div>
        ))}
      </div>

      {/* insight */}
      {top && (
        <div style={s(`background:color-mix(in srgb,${accent} 9%,var(--bg2));border:1px solid color-mix(in srgb,${accent} 26%,transparent);border-radius:16px;padding:15px 16px;margin-top:22px`)}>
          <div style={s('display:flex;align-items:center;gap:8px')}>
            <span style={s(`width:8px;height:8px;border-radius:2px;background:${accent}`)} />
            <span style={s('font-size:14px;font-weight:700')}>This ride at a glance</span>
          </div>
          <p style={s('font-size:13px;line-height:1.6;color:var(--text2);margin:10px 0 0')}>{insightText(rows, top)}</p>
          <div style={s('font-size:11px;color:var(--text3);margin-top:10px')}>Zones from your {refLabel}.</div>
        </div>
      )}
    </div>
  );
}

// Attach the display name, ramp colour and unit to each zone-distribution row.
function attach(rows, names, ramp, unit) {
  if (!rows) return null;
  return rows.map((r) => ({ ...r, name: names[r.i] || r.z, color: ramp[r.i] || ramp[ramp.length - 1], unit }));
}

// A short, real read-out of the distribution — busiest zone + how polarised the ride was.
function insightText(rows, top) {
  const sorted = [...rows].sort((x, y) => y.pct - x.pct);
  const second = sorted[1];
  const hi = rows.filter((z) => z.i >= 3).reduce((a, z) => a + z.pct, 0); // Z4+ = hard (threshold and up)
  const lead = `You spent most of this ride in ${top.name.toLowerCase()} — Zone ${top.i + 1} (${top.pct}%)`;
  const next = second && second.pct > 0 ? `, then ${second.name.toLowerCase()} at ${second.pct}%` : '';
  const tail = hi >= 25 ? ' A hard, high-intensity session.' : hi >= 10 ? ' A solid mixed effort.' : ' Mostly easy, aerobic riding.';
  return `${lead}${next}.${tail}`;
}

function Pill({ on, disabled, onClick, accent, children }) {
  return (
    <div className={disabled ? undefined : 'ctl'} onClick={disabled ? undefined : onClick}
      style={s(`flex:none;padding:9px 16px;border-radius:999px;font-size:13.5px;font-weight:600;transition:all .15s;
        ${disabled ? 'opacity:.35;' : ''}
        ${on ? `border:1px solid color-mix(in srgb,${accent} 55%,transparent);background:color-mix(in srgb,${accent} 14%,transparent);color:${accent}`
             : 'border:1px solid var(--line);background:var(--bg2);color:var(--text2)'}`)}>{children}</div>
  );
}
