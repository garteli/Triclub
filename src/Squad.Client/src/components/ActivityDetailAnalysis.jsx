import { useMemo, useRef, useState } from 'react';
import { s } from '../lib/style.js';
import CursorTrace, { capture } from './CursorTrace.jsx';
import { loadZones } from '../lib/zones.js';
import {
  normalizedPower, hrZones, powerZones, powerCurve, powerBestEfforts, distanceBestEfforts,
  HR_ZONE_FRACS, HR_ZONE_NAMES, PWR_ZONE_FRACS, PWR_ZONE_NAMES,
} from '../lib/powerAnalysis.js';

const DIST_LABEL = { 1000: '1K', 5000: '5K', 10000: '10K', 16093: '10 mi', 20000: '20K', 30000: '30K', 40000: '40K', 50000: '50K' };
const fmtEffortDur = (sec) => (sec < 60 ? `${sec}s` : sec % 60 === 0 ? `${sec / 60}m` : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`);

const POWER_COLORS = ['#8a94a6', '#4a86ff', '#22c55e', '#eab308', '#f97316', '#ef4444', '#a855f7'];
const HR_COLORS = ['#8a94a6', '#22c55e', '#eab308', '#f97316', '#ef4444'];
const CURVE_LABEL = { 1: '1s', 5: '5s', 15: '15s', 30: '30s', 60: '1m', 300: '5m', 600: '10m', 1200: '20m', 3600: '1h', 7200: '2h' };

// Route map + Strava-style analysis for an activity's detail view. Fetches the recorded
// track (GET /api/activities/{id}/track) and derives, all from the FIT stream we already
// serve: the GPS route on a real basemap, per-point traces (HR / power / speed / cadence /
// elevation), per-kilometre splits, and total work. Replaces the old placeholder.

const label = 'font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.3px;font-weight:600';

function fmtDur(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s2 = sec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s2).padStart(2, '0')}`
    : `${m}:${String(s2).padStart(2, '0')}`;
}
const pace = (secPerKm) => `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, '0')}`;

function haversine(la1, lo1, la2, lo2) {
  const R = 6371000, r = Math.PI / 180;
  const dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Per-`unit`-metre splits from the full track: GPS distance where available, else speed×dt.
// → [{ index, meters, sec, avgHr, avgPower, gain, partial }].
function computeSplits(track, unit) {
  const pts = track.filter((p) => Number.isFinite(p.offsetSec));
  if (pts.length < 2) return [];
  const out = [];
  let prev = pts[0];
  let cum = 0, boundary = unit, segStart = pts[0].offsetSec ?? 0;
  let gain = 0, hrSum = 0, hrN = 0, pwSum = 0, pwN = 0;
  const flush = (endSec, meters, partial) => {
    out.push({
      index: out.length + 1, meters, sec: endSec - segStart,
      avgHr: hrN ? hrSum / hrN : null, avgPower: pwN ? pwSum / pwN : null, gain, partial,
    });
    segStart = endSec; gain = 0; hrSum = hrN = pwSum = pwN = 0;
  };
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    let d = 0;
    if (Number.isFinite(prev.lat) && Number.isFinite(p.lat)) d = haversine(prev.lat, prev.lon, p.lat, p.lon);
    else if (Number.isFinite(p.speedMps)) d = p.speedMps * Math.max(0, (p.offsetSec - prev.offsetSec));
    cum += d;
    if (Number.isFinite(prev.elevM) && Number.isFinite(p.elevM) && p.elevM > prev.elevM) gain += p.elevM - prev.elevM;
    if (Number.isFinite(p.heartRate)) { hrSum += p.heartRate; hrN++; }
    if (Number.isFinite(p.powerW)) { pwSum += p.powerW; pwN++; }
    while (cum >= boundary) { flush(p.offsetSec, unit, false); boundary += unit; }
    prev = p;
  }
  const tail = cum - (boundary - unit);
  if (tail > unit * 0.15) flush(pts[pts.length - 1].offsetSec, tail, true);
  return out;
}

// Total mechanical work (kJ) = ∫ power dt, guarding against recording gaps.
function totalWorkKJ(track) {
  let j = 0;
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1], b = track[i];
    if (!Number.isFinite(b.powerW) || !Number.isFinite(a.offsetSec) || !Number.isFinite(b.offsetSec)) continue;
    const dt = b.offsetSec - a.offsetSec;
    if (dt > 0 && dt < 30) j += b.powerW * dt;
  }
  return j / 1000;
}

// Strava-style segment table: one row per lap (device laps) or per km/100m (computed
// splits). Each row is { index, meters, sec, avgHr, gain, partial }; a bar scaled to the
// fastest row makes pace variation read at a glance.
function SegmentTable({ title, rows, isSwim, isFoot }) {
  if (rows.length < 1) return null;
  const speeds = rows.map((sp) => (sp.sec > 0 ? sp.meters / sp.sec : 0)); // m/s
  const fastest = Math.max(...speeds, 0.1);
  const hasPwr = rows.some((sp) => sp.avgPower != null); // show power col (laps) instead of elev
  const rateHdr = isFoot || isSwim ? 'pace' : 'speed';
  return (
    <div style={s('margin-top:14px')}>
      <div style={s(label + ';margin-bottom:8px')}>{title}</div>
      <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;overflow:hidden')}>
        {rows.map((sp, i) => {
          const mps = speeds[i];
          const rate = isFoot || isSwim
            ? pace(sp.sec / (sp.meters / (isSwim ? 100 : 1000))) + (isSwim ? '/100' : '/km')
            : ((sp.meters / 1000) / (sp.sec / 3600)).toFixed(1);
          return (
            <div key={sp.index} style={s(`display:flex;align-items:center;gap:9px;padding:8px 12px;position:relative;${i ? 'border-top:1px solid var(--line)' : ''}`)}>
              <div style={s('width:18px;font-size:12px;font-weight:700;color:var(--text2);flex:none')}>{sp.partial ? '·' : sp.index}</div>
              <div style={s('flex:1;min-width:0')}>
                <div style={s('height:8px;border-radius:4px;background:var(--accent);opacity:.9;width:' + Math.max(6, Math.round((mps / fastest) * 100)) + '%')} />
              </div>
              <div className="mono" style={s('width:52px;text-align:right;font-size:12px;font-weight:600')}>{rate}</div>
              <div className="mono" style={s('width:44px;text-align:right;font-size:11px;color:var(--text3)')}>{fmtDur(sp.sec)}</div>
              {hasPwr
                ? <div className="mono" style={s('width:38px;text-align:right;font-size:11px;color:var(--text3)')}>{sp.avgPower != null ? Math.round(sp.avgPower) : '—'}</div>
                : <div className="mono" style={s('width:38px;text-align:right;font-size:11px;color:var(--text3)')}>{Math.round(sp.gain)}m</div>}
              <div className="mono" style={s('width:36px;text-align:right;font-size:11px;color:var(--text3)')}>{sp.avgHr != null ? Math.round(sp.avgHr) : '—'}</div>
            </div>
          );
        })}
      </div>
      <div style={s('display:flex;gap:9px;justify-content:flex-end;margin-top:6px;padding-right:12px;font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px')}>
        <span style={s('width:52px;text-align:right')}>{rateHdr}</span>
        <span style={s('width:44px;text-align:right')}>time</span>
        <span style={s('width:38px;text-align:right')}>{hasPwr ? 'watts' : '▲'}</span>
        <span style={s('width:36px;text-align:right')}>hr</span>
      </div>
    </div>
  );
}

// Strava-style zone-distribution table: highest zone first, each row = zone badge, name, the
// bpm/watt range, time, percent, over a bar scaled to the biggest zone. `bounds` are the upper
// threshold VALUES (length = zones − 1); the top/bottom rows render open-ended.
function ZoneDist({ title, seconds, colors, names, bounds }) {
  const total = seconds.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  const n = seconds.length;
  const max = Math.max(...seconds);
  const range = (i) => {
    const lo = i === 0 ? null : Math.round(bounds[i - 1]);
    const hi = i === n - 1 ? null : Math.round(bounds[i]) - 1;
    if (lo == null) return `< ${hi + 1}`;
    if (hi == null) return `> ${lo - 1}`;
    return `${lo}–${hi}`;
  };
  return (
    <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:12px 13px;margin-top:10px')}>
      <div style={s('font-size:12px;font-weight:700;margin-bottom:6px')}>{title}</div>
      {[...seconds.keys()].reverse().map((i) => {
        const pct = Math.round((seconds[i] / total) * 100);
        const barPct = max > 0 ? Math.round((seconds[i] / max) * 100) : 0;
        return (
          <div key={i} style={s('position:relative;overflow:hidden;border-radius:8px;background:var(--bg3);margin-top:6px')}>
            <div style={s(`position:absolute;top:0;bottom:0;left:0;width:${barPct}%;background:${colors[i]};opacity:.20`)} />
            <div style={s('position:relative;display:flex;align-items:center;gap:8px;padding:8px 10px')}>
              <span style={s(`font-size:10px;font-weight:800;color:${colors[i]};width:20px;flex:none`)}>Z{i + 1}</span>
              <span style={s('font-size:12px;font-weight:600;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{names[i]}</span>
              <span className="mono" style={s('font-size:10px;color:var(--text3);flex:none')}>{range(i)}</span>
              <span className="mono" style={s('font-size:11px;font-weight:600;width:50px;text-align:right;flex:none')}>{fmtDur(seconds[i])}</span>
              <span className="mono" style={s('font-size:10px;color:var(--text2);width:30px;text-align:right;flex:none')}>{pct}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// The replay transport under the hero map: a scrubber + elapsed/total time + a speed cycle.
// The play/pause button lives on the hero map; this drives the same shared `playback`.
function Transport({ playback, curSec, totalSec }) {
  const trackRef = useRef(null);
  const seekFromEvent = (e) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    playback.seek((e.clientX - r.left) / r.width);
  };
  const cycleSpeed = () => playback.setSpeed((sp) => (sp >= 4 ? 1 : sp * 2));
  return (
    <div style={s('display:flex;align-items:center;gap:11px;margin-top:2px')}>
      <button
        onClick={playback.toggle}
        aria-label={playback.playing ? 'Pause' : 'Play'}
        style={s('flex:none;width:34px;height:34px;border-radius:50%;border:none;background:var(--accent);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0')}
      >
        {playback.playing
          ? <svg width="13" height="13" viewBox="0 0 14 14"><rect x="2" y="1.5" width="3.4" height="11" rx="1" fill="var(--accent-ink)" /><rect x="8.6" y="1.5" width="3.4" height="11" rx="1" fill="var(--accent-ink)" /></svg>
          : <svg width="13" height="13" viewBox="0 0 14 14"><path d="M3 1.7 12 7 3 12.3Z" fill="var(--accent-ink)" /></svg>}
      </button>
      <div
        ref={trackRef}
        onPointerDown={(e) => { capture(e); playback.pause(); seekFromEvent(e); }}
        onPointerMove={(e) => { if (e.buttons) seekFromEvent(e); }}
        style={{ position: 'relative', flex: 1, height: 26, display: 'flex', alignItems: 'center', cursor: 'pointer', touchAction: 'none' }}
      >
        <div style={s('position:absolute;left:0;right:0;height:5px;border-radius:3px;background:var(--bg4)')} />
        <div style={{ position: 'absolute', left: 0, width: `${playback.pos * 100}%`, height: 5, borderRadius: 3, background: 'var(--accent)' }} />
        <div style={{ position: 'absolute', left: `${playback.pos * 100}%`, width: 14, height: 14, marginLeft: -7, borderRadius: '50%', background: '#fff', border: '2px solid var(--accent)', boxShadow: '0 1px 3px rgba(0,0,0,.25)' }} />
      </div>
      <div className="mono" style={s('font-size:11px;color:var(--text3);flex:none;letter-spacing:.2px')}>
        <b style={s('color:var(--text)')}>{fmtDur(curSec)}</b> / {fmtDur(totalSec)}
      </div>
      <button onClick={cycleSpeed} aria-label="Playback speed"
        style={s('flex:none;min-width:34px;height:26px;border-radius:8px;border:1px solid var(--line);background:var(--bg2);color:var(--text2);font-size:11px;font-weight:700;cursor:pointer;padding:0 7px')}>
        {playback.speed}×
      </button>
    </div>
  );
}

// Detailed analysis: the replay transport + time-synced traces (both driven by the shared
// `playback` that also moves the hero-map marker), then Strava-style splits / zones / power
// curve / best efforts. Frames + traces are derived once by the parent (Feed).
export default function ActivityDetailAnalysis({ frames, traces, playback, track, laps, status, sport }) {
  const [zones] = useState(() => loadZones()); // device FTP / max HR
  const isSwim = sport === 'Swim';
  const isFoot = sport === 'Run';

  // Split distance by sport: swim 100m, ride 5km, run (and everything else) 1km.
  const splitUnit = isSwim ? 100 : sport === 'Bike' ? 5000 : 1000;
  const splitUnitLabel = isSwim ? 'per 100m' : sport === 'Bike' ? 'per 5km' : 'per km';
  const splits = useMemo(() => computeSplits(track || [], splitUnit), [track, splitUnit]);
  const workKJ = useMemo(() => totalWorkKJ(track || []), [track]);

  // Power/HR analysis. NP + power curve need only the stream; zones + IF need the settings.
  const np = useMemo(() => normalizedPower(track || []), [track]);
  const pwZones = useMemo(() => powerZones(track || [], zones.ftp), [track, zones.ftp]);
  const hZones = useMemo(() => hrZones(track || [], zones.maxHr), [track, zones.maxHr]);
  const curve = useMemo(() => powerCurve(track || []), [track]);
  const bestPower = useMemo(() => powerBestEfforts(track || []), [track]);
  const bestDist = useMemo(() => distanceBestEfforts(track || []), [track]);
  const ifactor = np && zones.ftp ? np / zones.ftp : null;
  const hasPower = curve.length > 0 || np != null;
  const hasHr = (track || []).some((p) => Number.isFinite(p.heartRate));

  // Device laps (auto-lap or manual) → the same row shape as computed splits.
  const lapRows = useMemo(() => (laps || [])
    .map((l, i) => ({
      index: i + 1,
      meters: l.distanceMeters || 0,
      sec: l.durationSec || 0,
      avgHr: l.avgHeartRate ?? null,
      avgPower: l.avgPowerWatts ?? null,
      gain: l.elevGainMeters || 0,
    }))
    .filter((r) => r.meters > 0 && r.sec > 0), [laps]);
  const useLaps = lapRows.length >= 2;

  if (status === 'loading') {
    return (
      <div style={s('padding:20px 18px 0')}>
        <div style={s(label + ';margin-bottom:10px')}>Detailed analysis</div>
        <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;height:150px;display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:12px')}>Loading recording…</div>
      </div>
    );
  }

  const hasReplay = frames.length > 1 && traces.length > 0;
  const totalSec = frames.length ? (frames[frames.length - 1].offsetSec ?? 0) : 0;
  const curSec = frames[playback.index]?.offsetSec ?? 0;

  if (!hasReplay && !useLaps && splits.length === 0) {
    return (
      <div style={s('padding:20px 18px 0')}>
        <div style={s('background:var(--bg2);border:1px dashed var(--line2);border-radius:16px;padding:18px;text-align:center')}>
          <div style={s('font-size:13px;font-weight:600')}>No recording data</div>
          <div style={s('font-size:12px;color:var(--text3);line-height:1.5;margin-top:4px')}>This activity has no GPS or sensor stream — an indoor session, or a summary-only import.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={s('padding:20px 18px 0')}>
      <div style={s(label + ';margin-bottom:10px')}>Detailed analysis</div>

      {hasReplay && (
        <>
          <Transport playback={playback} curSec={curSec} totalSec={totalSec} />
          {traces.map((tr) => (
            <CursorTrace key={tr.key} title={tr.title} unit={tr.unit} values={tr.values}
              stroke={tr.stroke} fill={tr.fill} fmt={tr.fmt}
              index={playback.index} onSeek={playback.seek} onGrab={playback.pause} />
          ))}
        </>
      )}

      {workKJ >= 1 && (
        <div className="mono" style={s('font-size:11px;color:var(--text3);margin-top:10px')}>
          Total work <b style={s('color:var(--text)')}>{Math.round(workKJ)}</b> kJ
        </div>
      )}

      {/* Normalized Power / Intensity Factor + zone distributions + power curve */}
      {(np != null || ifactor != null) && (
        <div className="mono" style={s('font-size:11px;color:var(--text3);margin-top:10px')}>
          {np != null && <>Normalized Power <b style={s('color:var(--text)')}>{np}</b> W</>}
          {ifactor != null && <> · IF <b style={s('color:var(--text)')}>{ifactor.toFixed(2)}</b></>}
        </div>
      )}
      {pwZones && (
        <ZoneDist title="Power zones · W" seconds={pwZones} colors={POWER_COLORS}
          names={PWR_ZONE_NAMES} bounds={PWR_ZONE_FRACS.map((f) => f * zones.ftp)} />
      )}
      {hZones && (
        <ZoneDist title="Heart-rate zones · bpm" seconds={hZones} colors={HR_COLORS}
          names={HR_ZONE_NAMES} bounds={HR_ZONE_FRACS.map((f) => f * zones.maxHr)} />
      )}
      {curve.length > 1 && (() => {
        const maxW = Math.max(...curve.map((c) => c.watts));
        const first = curve[0].sec, last = curve[curve.length - 1].sec;
        const lmin = Math.log(first), lspan = Math.log(last) - lmin || 1;
        const W = 320, H = 116, padY = 6;
        const X = (sec) => ((Math.log(sec) - lmin) / lspan) * W;
        const Y = (w) => H - padY - (w / maxW) * (H - 2 * padY);
        const linePath = curve.map((c, i) => `${i ? 'L' : 'M'}${X(c.sec).toFixed(1)},${Y(c.watts).toFixed(1)}`).join(' ');
        const areaPath = `${linePath} L${W},${H} L0,${H} Z`;
        const ticks = [15, 60, 300, 1200, 3600, 7200].filter((tk) => tk >= first && tk <= last);
        const at = (sec) => curve.find((c) => c.sec === sec)?.watts ?? null;
        const key = [5, 60, 300, 1200].map((sec) => ({ sec, w: at(sec) })).filter((k) => k.w != null);
        return (
          <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:12px 13px;margin-top:10px')}>
            <div style={s('display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px')}>
              <div style={s('font-size:12px;font-weight:700')}>Power curve · best watts</div>
              <div className="mono" style={s('font-size:10px;color:var(--text3)')}>
                {key.map((k, i) => <span key={k.sec}>{i ? ' · ' : ''}{CURVE_LABEL[k.sec]} <b style={s('color:var(--text2)')}>{k.w}</b></span>)}
              </div>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, display: 'block' }}>
              <path d={areaPath} fill="var(--accent)" opacity="0.14" />
              <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
            <div style={s('position:relative;height:13px;margin-top:3px')}>
              {ticks.map((tk) => (
                <span key={tk} className="mono" style={s(`position:absolute;left:${((X(tk) / W) * 100).toFixed(1)}%;transform:translateX(-50%);font-size:9px;color:var(--text3)`)}>{CURVE_LABEL[tk]}</span>
              ))}
            </div>
          </div>
        );
      })()}
      {((hasPower && !zones.ftp) || (hasHr && !zones.maxHr)) && (
        <div style={s('font-size:11px;color:var(--text3);margin-top:8px;line-height:1.5')}>
          Set your FTP &amp; max HR in <b>Settings → Training zones</b> to unlock power / heart-rate zones and Intensity Factor.
        </div>
      )}

      {useLaps
        ? <SegmentTable title="Laps" rows={lapRows} isSwim={isSwim} isFoot={isFoot} />
        : <SegmentTable title={`Splits · ${splitUnitLabel}`} rows={splits} isSwim={isSwim} isFoot={isFoot} />}

      {(bestPower.length > 0 || bestDist.length > 0) && (
        <div style={s('margin-top:14px')}>
          <div style={s(label + ';margin-bottom:8px')}>Best efforts</div>
          <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:10px 12px')}>
            {bestPower.length > 0 && (() => {
              const maxW = Math.max(...bestPower.map((e) => e.watts));
              return (
                <>
                  <div style={s('font-size:11px;font-weight:700;color:var(--text2);margin-bottom:4px')}>Power</div>
                  {bestPower.map((e) => (
                    <div key={e.sec} style={s('display:flex;align-items:center;gap:9px;padding:4px 0')}>
                      <div className="mono" style={s('width:38px;font-size:11px;color:var(--text2)')}>{fmtEffortDur(e.sec)}</div>
                      <div style={s('flex:1;height:7px;border-radius:4px;background:var(--bg4);overflow:hidden')}>
                        <div style={s(`height:100%;border-radius:4px;background:var(--accent);width:${Math.round((e.watts / maxW) * 100)}%`)} />
                      </div>
                      <div className="mono" style={s('width:46px;text-align:right;font-size:12px;font-weight:700')}>{e.watts}<span style={s('font-size:9px;color:var(--text3)')}>w</span></div>
                      <div className="mono" style={s('width:44px;text-align:right;font-size:11px;color:var(--text3)')}>{e.avgHr != null ? `${e.avgHr}` : '—'}</div>
                    </div>
                  ))}
                </>
              );
            })()}
            {bestDist.length > 0 && (
              <>
                <div style={s(`font-size:11px;font-weight:700;color:var(--text2);margin:${bestPower.length ? '10px' : '0'} 0 4px`)}>Distance</div>
                {bestDist.map((e) => (
                  <div key={e.meters} style={s('display:flex;align-items:center;gap:9px;padding:4px 0')}>
                    <div style={s('width:46px;font-size:12px;font-weight:600')}>{DIST_LABEL[e.meters] || `${Math.round(e.meters / 1000)}K`}</div>
                    <div className="mono" style={s('flex:1;font-size:12px;font-weight:600')}>{fmtDur(e.sec)}</div>
                    <div className="mono" style={s('width:60px;text-align:right;font-size:11px;color:var(--text3)')}>{((e.meters / 1000) / (e.sec / 3600)).toFixed(1)} km/h</div>
                    <div className="mono" style={s('width:44px;text-align:right;font-size:11px;color:var(--text3)')}>{e.avgHr != null ? `${e.avgHr}` : '—'}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
