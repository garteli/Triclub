import { useEffect, useMemo, useState } from 'react';
import { s } from '../lib/style.js';
import EmptyState from '../components/EmptyState.jsx';
import { loadTrack } from '../hooks/useActivityTrack.js';
import { loadZones } from '../lib/zones.js';
import {
  powerZones, hrZones, zoneDistribution,
  PWR_ZONE_FRACS, PWR_ZONE_NAMES, HR_ZONE_FRACS, HR_ZONE_NAMES,
} from '../lib/powerAnalysis.js';

// Your aggregate time-in-zone across a date range (per the design handoff) — a discipline picker
// (Ride / Run / Swim, from the sports you actually have), Power / Heart-rate toggle, a range selector
// (7D…1Y) plus a custom date range, the busiest zone as a headline with its change vs the prior equal
// period, one bar per zone (highest first), and a plain-language read-out. Aggregated from your rides.

const HR_RAMP = ['#f7b0ac', '#f5837c', '#f0574f', '#e0342f', '#a30f12'];
const PW_RAMP = ['#cdaaff', '#b98cff', '#9a5cf5', '#8340e8', '#6f2ad6', '#5a1fb0', '#3b1580'];
const RANGES = [['7D', '7 days'], ['1M', '1 month'], ['3M', '3 months'], ['6M', '6 months'], ['YTD', 'year to date'], ['1Y', '12 months']];
const DISCIPLINES = [['Bike', 'Ride'], ['Run', 'Run'], ['Swim', 'Swim']];
const MAX_ACTS = 80; // rides scanned per view (cap keeps the track fetches bounded)

// [from, to] for the selected preset, plus the equal-length window immediately before it (for the delta).
function presetBounds(range, now) {
  const to = now;
  const mo = (n) => { const x = new Date(now); x.setMonth(x.getMonth() - n); return x; };
  const day = (n) => { const x = new Date(now); x.setDate(x.getDate() - n); return x; };
  const from = range === '7D' ? day(7) : range === '1M' ? mo(1) : range === '3M' ? mo(3)
    : range === '6M' ? mo(6) : range === 'YTD' ? new Date(now.getFullYear(), 0, 1) : mo(12);
  const priorFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));
  return { from, to, priorFrom };
}

const fmtDate = (d) => d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
const isToday = (d) => { const n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate(); };

// Run tasks with limited concurrency.
async function pool(items, n, fn) {
  let i = 0;
  const worker = async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

export default function ActivityZones({ vm, state, actions, getToken }) {
  const zones = useMemo(() => loadZones(), []); // device FTP / max HR
  const hasFtp = !!zones.ftp, hasMaxHr = !!zones.maxHr;
  const [metric, setMetric] = useState(state?.zonesMetric === 'hr' ? 'hr' : 'power');
  const [range, setRange] = useState('3M');
  const [data, setData] = useState({ status: 'loading' });

  // Discipline picker — only the sports the athlete actually has recorded.
  const sportsPresent = useMemo(() => {
    const set = new Set((vm.myActivities || []).map((a) => a.sport).filter(Boolean));
    const avail = DISCIPLINES.filter(([sp]) => set.has(sp));
    return avail.length ? avail : [['Bike', 'Ride']];
  }, [vm.myActivities]);
  const [discipline, setDiscipline] = useState(sportsPresent[0][0]);
  const [discOpen, setDiscOpen] = useState(false);
  const discLabel = (DISCIPLINES.find(([sp]) => sp === discipline) || ['Bike', 'Ride'])[1];

  // Custom date range (overrides the preset when both ends are set and valid).
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState({ from: '', to: '' });
  const customActive = !!custom.from && !!custom.to && new Date(custom.from) <= new Date(custom.to);

  // Power needs a power meter (bike only) + an FTP; HR works for any sport.
  const powerOk = hasFtp && discipline === 'Bike';
  const active = metric === 'power' && powerOk ? 'power' : hasMaxHr ? 'hr' : powerOk ? 'power' : 'hr';

  const cfg = active === 'power'
    ? { fracs: PWR_ZONE_FRACS, names: PWR_ZONE_NAMES, ramp: PW_RAMP, ref: zones.ftp, unit: 'W', accent: '#b98cff', compute: (t) => powerZones(t, zones.ftp) }
    : { fracs: HR_ZONE_FRACS, names: HR_ZONE_NAMES, ramp: HR_RAMP, ref: zones.maxHr, unit: 'bpm', accent: '#ff5064', compute: (t) => hrZones(t, zones.maxHr) };

  useEffect(() => {
    if (!cfg.ref) { setData({ status: 'nozones' }); return undefined; }
    let ok = true;
    setData({ status: 'loading' });
    (async () => {
      const now = new Date();
      let from, to, priorFrom;
      if (customActive) {
        from = new Date(custom.from); to = new Date(custom.to); to.setHours(23, 59, 59, 999);
        priorFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));
      } else {
        ({ from, to, priorFrom } = presetBounds(range, now));
      }
      const acts = (vm.myActivities || [])
        .filter((a) => a.sport === discipline && a.id && a.startUtc && new Date(a.startUtc) >= priorFrom && new Date(a.startUtc) <= to)
        .sort((a, b) => new Date(b.startUtc) - new Date(a.startUtc))
        .slice(0, MAX_ACTS);
      const n = cfg.fracs.length + 1;
      const cur = new Array(n).fill(0), pri = new Array(n).fill(0);
      let curCount = 0;
      const token = await getToken?.();
      await pool(acts, 4, async (a) => {
        try {
          const { track } = await loadTrack(a.id, token);
          const z = cfg.compute(track);
          if (!z) return;
          const inCur = new Date(a.startUtc) >= from;
          const bucket = inCur ? cur : pri;
          for (let i = 0; i < z.length; i++) bucket[i] += z[i];
          if (inCur) curCount++;
        } catch { /* skip a ride we can't read */ }
      });
      if (ok) setData({ status: 'ready', cur, pri, curCount, from, to, toLabel: (customActive && !isToday(to)) ? fmtDate(to) : 'Today' });
    })();
    return () => { ok = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, range, discipline, customActive, custom.from, custom.to, zones.ftp, zones.maxHr]);

  const rows = useMemo(() => {
    if (data.status !== 'ready') return null;
    const r = zoneDistribution(data.cur, cfg.fracs, cfg.ref);
    return r && r.map((x) => ({ ...x, name: cfg.names[x.i] || x.z, color: cfg.ramp[x.i] || cfg.ramp[cfg.ramp.length - 1] }));
  }, [data, cfg]);
  const priorRows = useMemo(() => (data.status === 'ready' ? zoneDistribution(data.pri, cfg.fracs, cfg.ref) : null), [data, cfg]);

  const ready = data.status === 'ready' && rows && data.curCount > 0;
  const top = ready ? rows.reduce((best, z) => (z.pct > best.pct ? z : best), rows[0]) : null;
  const priorTop = ready && priorRows ? priorRows.find((p) => p.i === top.i) : null;
  const delta = priorTop && priorRows.reduce((a, b) => a + b.secs, 0) > 0 ? top.pct - priorTop.pct : null;

  const pickDiscipline = (sp) => { setDiscipline(sp); setDiscOpen(false); };

  return (
    <div style={s('padding:4px 16px 120px;animation:floatUp .35s ease')}>
      {/* discipline + metric pills */}
      <div style={s('display:flex;gap:8px;margin:2px 0 16px;position:relative')}>
        <div className="ctl" onClick={() => setDiscOpen((v) => !v)}
          style={s('flex:none;display:flex;align-items:center;gap:7px;padding:9px 13px;border-radius:999px;font-size:13.5px;font-weight:600;border:1px solid color-mix(in srgb,var(--accent) 55%,transparent);background:var(--accent-dim);color:var(--accent)')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="5.5" cy="17.5" r="3.5" /><circle cx="18.5" cy="17.5" r="3.5" /><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM12 17.5L9 9l3-2 3 4h3" /></svg>
          {discLabel}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ transform: discOpen ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }}><path d="M6 9l6 6 6-6" /></svg>
        </div>
        <Pill on={active === 'hr'} disabled={!hasMaxHr} onClick={() => setMetric('hr')} accent="#ff5064">Heart Rate</Pill>
        <Pill on={active === 'power'} disabled={!powerOk} onClick={() => setMetric('power')} accent="#b98cff">Power</Pill>

        {discOpen && (
          <div style={s('position:absolute;top:100%;left:0;margin-top:6px;z-index:20;background:var(--bg2);border:1px solid var(--line2);border-radius:12px;padding:5px;min-width:130px;box-shadow:0 10px 30px rgba(0,0,0,.4)')}>
            {sportsPresent.map(([sp, lbl]) => (
              <div key={sp} className="ctl" onClick={() => pickDiscipline(sp)}
                style={s(`padding:9px 11px;border-radius:9px;font-size:13.5px;font-weight:600;${sp === discipline ? 'background:var(--accent-dim);color:var(--accent)' : 'color:var(--text2)'}`)}>{lbl}</div>
            ))}
          </div>
        )}
      </div>

      <Body data={data} rows={rows} ready={ready} top={top} delta={delta} cfg={cfg} range={range} custom={customActive} actions={actions} />

      {/* range selector */}
      <div style={s('display:flex;gap:3px;background:var(--bg2);border:1px solid var(--line);border-radius:13px;padding:4px;margin-top:24px')}>
        {RANGES.map(([k]) => (
          <div key={k} className="ctl" onClick={() => { setRange(k); setCustom({ from: '', to: '' }); }}
            style={s(`flex:1;text-align:center;padding:9px 2px;border-radius:9px;font-size:12.5px;font-weight:700;${range === k && !customActive ? 'background:var(--text);color:var(--bg)' : 'color:var(--text2)'}`)}>{k}</div>
        ))}
      </div>

      {/* custom date range */}
      <div className="ctl" onClick={() => setCustomOpen((v) => !v)}
        style={s('display:flex;align-items:center;justify-content:center;gap:8px;margin-top:10px;padding:13px;border-radius:13px;background:var(--bg2);border:1px solid var(--line);font-size:13.5px;font-weight:600;color:var(--text2)')}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="2.5" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
        {customActive ? `${fmtDate(new Date(custom.from))} – ${fmtDate(new Date(custom.to))}` : 'Select custom date range'}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ transform: customOpen ? 'rotate(180deg)' : 'none', transition: 'transform .18s' }}><path d="M6 9l6 6 6-6" /></svg>
      </div>
      {customOpen && (
        <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:14px;margin-top:8px;display:flex;flex-direction:column;gap:10px')}>
          <label style={s('display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12.5px;color:var(--text2)')}>From
            <input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
              style={s('background:var(--bg3);border:1px solid var(--line);border-radius:9px;padding:8px 10px;font-size:13px;color:var(--text);font-family:inherit;color-scheme:dark')} />
          </label>
          <label style={s('display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12.5px;color:var(--text2)')}>To
            <input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
              style={s('background:var(--bg3);border:1px solid var(--line);border-radius:9px;padding:8px 10px;font-size:13px;color:var(--text);font-family:inherit;color-scheme:dark')} />
          </label>
          {custom.from && custom.to && !customActive && <div style={s('font-size:11.5px;color:var(--bad)')}>The start date must be on or before the end date.</div>}
          {customActive && (
            <div className="ctl" onClick={() => { setCustom({ from: '', to: '' }); }} style={s('align-self:flex-end;font-size:12px;font-weight:700;color:var(--accent)')}>Clear</div>
          )}
        </div>
      )}

      {/* insight — bottom of the page (design) */}
      {ready && (
        <div style={s(`background:color-mix(in srgb,${cfg.accent} 9%,var(--bg2));border:1px solid color-mix(in srgb,${cfg.accent} 26%,transparent);border-radius:16px;padding:15px 16px;margin-top:16px`)}>
          <div style={s('display:flex;align-items:center;gap:8px')}>
            <span style={s(`width:8px;height:8px;border-radius:2px;background:${cfg.accent}`)} />
            <span style={s('font-size:14px;font-weight:700')}>Your zones at a glance</span>
          </div>
          <p style={s('font-size:13px;line-height:1.6;color:var(--text2);margin:10px 0 0')}>{insight(rows, top, delta, cfg)}</p>
        </div>
      )}
    </div>
  );
}

function Body({ data, rows, ready, top, delta, cfg, range, custom, actions }) {
  if (data.status === 'nozones') {
    return (
      <div style={s('padding:8px 0')}>
        <EmptyState icon="🎯" title="Set your zones first"
          sub={`Add your ${cfg.unit === 'W' ? 'FTP' : 'max HR'} in Settings → Training zones to see your time-in-zone.`} />
        <div className="ctl" onClick={() => actions.go('zones')} style={s('margin:16px auto 0;max-width:220px;text-align:center;padding:11px;border-radius:12px;background:var(--bg2);border:1px solid var(--line);font-size:12.5px;font-weight:700;color:var(--accent)')}>Edit training zones</div>
      </div>
    );
  }
  if (data.status === 'loading') {
    return <div style={s('height:260px;display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:12.5px')}>Adding up your zones…</div>;
  }
  if (!ready) {
    return (
      <div style={s('padding:8px 0')}>
        <EmptyState icon="📊" title="No rides in this range"
          sub={`No recorded ${cfg.unit === 'W' ? 'power' : 'heart-rate'} activities ${custom ? 'in that date range' : `in the last ${RANGES.find((r) => r[0] === range)[1]}`}. Try a longer range.`} />
      </div>
    );
  }

  const ordered = [...rows].reverse();

  return (
    <>
      {/* headline + delta */}
      <div style={s('display:flex;align-items:flex-start;justify-content:space-between;gap:12px')}>
        <div>
          <div style={s('font-size:30px;font-weight:700;letter-spacing:-1px;line-height:1.05')}>{top.pct}% in <span style={s(`color:${top.color}`)}>Zone {top.i + 1}</span></div>
          <div style={s('font-size:12px;color:var(--text3);margin-top:8px')}>{fmtDate(data.from)} – {data.toLabel} · {data.curCount} ride{data.curCount === 1 ? '' : 's'}</div>
        </div>
        {delta != null && delta !== 0 && (
          <div style={s('text-align:right;flex:none')}>
            <div style={s(`display:inline-flex;align-items:center;gap:4px;padding:4px 9px;border-radius:8px;font-size:13px;font-weight:700;${delta > 0 ? 'color:var(--good);background:color-mix(in srgb,var(--good) 14%,transparent)' : 'color:var(--accent);background:var(--accent-dim)'}`)}>
              <span style={s('font-size:9px')}>{delta > 0 ? '▲' : '▼'}</span>{Math.abs(delta)}%
            </div>
            <div style={s('font-size:10.5px;color:var(--text3);margin-top:6px')}>vs. prior period</div>
          </div>
        )}
      </div>

      {/* zone bars */}
      <div style={s('margin-top:22px;display:flex;flex-direction:column;gap:13px')}>
        {ordered.map((z) => (
          <div key={z.z} style={s('display:flex;align-items:center;gap:11px')}>
            <span className="mono" style={s(`width:22px;font-size:13px;font-weight:800;color:${z.color}`)}>{z.z}</span>
            <div style={s('flex:1;display:flex;align-items:center;gap:9px;min-width:0')}>
              <div style={s(`height:18px;width:${Math.max(z.bar, z.pct > 0 ? 4 : 0)}%;min-width:${z.pct > 0 ? 6 : 0}px;background:${z.color};border-radius:5px;transition:width .4s ease`)} />
              <span className="mono" style={s('font-size:13.5px;font-weight:700;white-space:nowrap')}>{z.pct}%</span>
            </div>
            <span className="mono" style={s('font-size:11.5px;color:var(--text3);white-space:nowrap')}>{z.range} {cfg.unit}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function insight(rows, top, delta, cfg) {
  const hi = rows.filter((z) => z.i >= 3).reduce((a, z) => a + z.pct, 0); // Z4+
  const lead = `Over this period you spent most of your time in ${top.name.toLowerCase()} — Zone ${top.i + 1} (${top.pct}%).`;
  const trend = delta != null && delta !== 0
    ? ` That's ${Math.abs(delta)}% ${delta > 0 ? 'more' : 'less'} than the previous period.`
    : '';
  const tail = hi >= 30 ? ` A high-intensity block — plenty of ${cfg.unit === 'W' ? 'threshold and above' : 'hard'} work.`
    : hi >= 12 ? ' A balanced mix of easy and hard riding.'
      : ' Mostly aerobic base-building — steady, easy riding.';
  return `${lead}${trend}${tail}`;
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
