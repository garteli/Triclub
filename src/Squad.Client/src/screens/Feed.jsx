import { useEffect, useMemo, useRef, useState } from 'react';
import { s } from '../lib/style.js';
import EmptyState from '../components/EmptyState.jsx';
import AuthedAvatar from '../components/AuthedAvatar.jsx';
import AuthedImage from '../components/AuthedImage.jsx';
import { deleteActivity } from '../hooks/useActivities.js';
import { useActivityPhotos } from '../hooks/useActivityPhotos.js';
import { useActivityTrack } from '../hooks/useActivityTrack.js';
import { buildFrames, frameRoute, gpsFrameCount, buildTraces } from '../lib/activityFrames.js';
import { describeWeather } from '../lib/weather.js';
import { useActivityAnalytics, fmtDur, pace, fmtEffortDur, CURVE_LABEL, DIST_LABEL } from '../hooks/useActivityAnalytics.js';
import { PWR_ZONE_FRACS, PWR_ZONE_NAMES, HR_ZONE_FRACS, HR_ZONE_NAMES } from '../lib/powerAnalysis.js';
import ActivityHero from '../components/ActivityHero.jsx';
import ActivityInteractions from '../components/ActivityInteractions.jsx';
import { downscaleToJpeg, captureNativePhoto, isNativePlatform, uploadActivityPhoto } from '../lib/photos.js';

const label = 'font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.3px;font-weight:600';
const title = 'font-size:17px;font-weight:700;margin-bottom:12px';
const POWER_COLORS = ['#8a94a6', '#4a86ff', '#22c55e', '#eab308', '#f97316', '#ef4444', '#a855f7'];
const HR_COLORS = ['#8a94a6', '#22c55e', '#eab308', '#f97316', '#ef4444'];

const finite = (arr) => (arr || []).filter((v) => v != null && Number.isFinite(v));
const avgOf = (arr) => { const f = finite(arr); return f.length ? Math.round(f.reduce((a, b) => a + b, 0) / f.length) : null; };
const maxOf = (arr) => { const f = finite(arr); return f.length ? Math.round(Math.max(...f)) : null; };

// Small "not-real-data-yet" tag so the stubbed cards never read as genuine metrics.
const Sample = () => <span style={s('font-size:8.5px;font-weight:800;color:var(--text3);border:1px solid var(--line2);border-radius:5px;padding:1px 5px;letter-spacing:.5px;flex:none')}>SAMPLE</span>;
const Spark = ({ icon }) => (
  <div style={s('width:22px;height:22px;border-radius:7px;background:var(--accent);display:flex;align-items:center;justify-content:center;flex:none')}>
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
  </div>
);
const boltPath = <path d="M13 2L4.5 13H11l-1 9 8.5-11H12z" />;

// ---- activity photos (attached or captured in-ride) + add-photos on your own ----
function ActivityPhotos({ activityId, isMe, token, getToken }) {
  const [refresh, setRefresh] = useState(0);
  const { photos } = useActivityPhotos(activityId, { getToken, enabled: !!activityId, refreshSignal: refresh });
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const doUpload = async (dataUrl) => {
    setBusy(true); setErr('');
    try { await uploadActivityPhoto(token, dataUrl, { activityId }); setRefresh((n) => n + 1); }
    catch (e) { setErr(e.message || 'Could not add the photo.'); }
    finally { setBusy(false); }
  };
  const add = async () => {
    setErr('');
    if (isNativePlatform()) { try { const d = await captureNativePhoto(); if (d) await doUpload(d); } catch { setErr('Could not capture a photo.'); } }
    else fileRef.current?.click();
  };
  const onPick = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    try { await doUpload(await downscaleToJpeg(file)); } catch (er) { setErr(er.message || 'Could not use that image.'); }
  };

  if (!photos.length && !isMe) return null;
  return (
    <div style={s('padding:20px 18px 0')}>
      <div style={s(label + ';margin-bottom:10px')}>Photos</div>
      {photos.length > 0 && (
        <div style={s('display:grid;grid-template-columns:repeat(3,1fr);gap:8px')}>
          {photos.map((p) => <AuthedImage key={p.id} url={p.url} token={token} style="width:100%;aspect-ratio:1;border-radius:12px;border:1px solid var(--line)" />)}
        </div>
      )}
      {isMe && (
        <>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onPick} style={s('display:none')} />
          <div className="ctl" onClick={busy ? undefined : add} style={s(`display:flex;align-items:center;justify-content:center;gap:7px;margin-top:${photos.length ? '10px' : '0'};padding:11px;border-radius:12px;background:var(--bg2);border:1px dashed var(--line2);font-size:13px;font-weight:600;color:var(--text2);opacity:${busy ? 0.6 : 1}`)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
            {busy ? 'Adding…' : photos.length ? 'Add more photos' : 'Add photos'}
          </div>
        </>
      )}
      {err && <div style={s('font-size:11px;color:var(--bad);margin-top:8px')}>{err}</div>}
    </div>
  );
}

// ---- athlete row + big title ----
function AthleteTitle({ a, token, onAthlete }) {
  return (
    <div style={s('padding:8px 18px 0')}>
      <div style={s('display:flex;align-items:center;gap:11px')}>
        <div className="ctl" onClick={() => onAthlete(a.athleteId)} style={s('flex:none')}>
          <AuthedAvatar avatarUrl={a.avatarUrl} token={token} initials={a.initials} color={a.color} size={44} radius={13} fontSize={15} />
        </div>
        <div style={s('flex:1;min-width:0')}>
          <div style={s('font-size:15px;font-weight:700')}>{a.athleteName}</div>
          <div style={s('font-size:11.5px;color:var(--text2)')}>{[a.when, a.location].filter(Boolean).join(' · ')}</div>
        </div>
        <div style={s(`background:color-mix(in srgb,${a.sportColor} 16%,transparent);color:${a.sportColor};font-size:10px;font-weight:700;padding:4px 9px;border-radius:7px;text-transform:uppercase;flex:none`)}>{a.sport}</div>
      </div>
      <div style={s('font-size:27px;font-weight:700;letter-spacing:-.7px;margin-top:14px')}>{a.title}</div>
    </div>
  );
}

// ---- 3-column metric card ----
function MetricHero({ a, load }) {
  const cells = [
    ['Distance', a.dist, a.distU ? ' ' + a.distU : ''],
    ['Elevation', a.elev, ' m'],
    ['Moving Time', a.moving, ''],
    ['Avg Speed', a.avgSpeed, a.speedU || ''],
    ['Avg HR', a.avgHr || '—', a.avgHr ? ' bpm' : ''],
    ['Training Load', String(load ?? a.load ?? 0), ''],
  ];
  return (
    <div style={s('padding:14px 18px 0')}>
      <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:18px;display:grid;grid-template-columns:1fr 1fr 1fr;overflow:hidden')}>
        {cells.map(([l, v, u], i) => {
          const cell = `padding:13px 13px;${i % 3 > 0 ? 'border-left:1px solid var(--line);' : ''}${i >= 3 ? 'border-top:1px solid var(--line);' : ''}`;
          return (
            <div key={l} style={s(cell)}>
              <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;font-weight:600')}>{l}</div>
              <div className="mono" style={s('font-size:19px;font-weight:700;margin-top:3px')}>{v}<span style={s('font-size:11px;color:var(--text2);font-weight:600')}>{u}</span></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Athlete Intelligence (no AI wired yet → SAMPLE copy) ----
function AIInsight() {
  return (
    <div style={s('padding:14px 18px 0')}>
      <div style={s('background:linear-gradient(150deg,color-mix(in srgb,var(--accent) 14%,var(--bg2)),var(--bg2));border:1px solid color-mix(in srgb,var(--accent) 35%,transparent);border-radius:18px;padding:15px 16px')}>
        <div style={s('display:flex;align-items:center;gap:8px')}><Spark icon={boltPath} /><span style={s('font-size:13px;font-weight:700')}>Athlete Intelligence</span><span style={s('margin-left:auto')}><Sample /></span></div>
        <div style={s('font-size:13.5px;color:var(--text);line-height:1.5;margin-top:11px')}>Strong endurance performance with <b>new 30-day power bests</b> across all durations; maintained typical effort despite higher elevation gain.</div>
        <div className="ctl" style={s('background:var(--accent);color:var(--accent-ink);text-align:center;padding:12px;border-radius:12px;font-weight:700;font-size:14px;margin-top:13px')}>Say More</div>
      </div>
    </div>
  );
}

// ---- device + weather (real: device from the FIT file, weather from Open-Meteo) ----
// Each line falls back to a SAMPLE placeholder only when that datum is missing (e.g. an
// indoor session has no weather; a manual/native entry may have no device).
function DeviceWeather({ device, weather }) {
  const wxText = describeWeather(weather);
  return (
    <div style={s('padding:16px 18px 0;display:flex;flex-direction:column;gap:12px')}>
      <div style={s('display:flex;align-items:center;gap:11px')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2.5" /><path d="M9 6h6" /></svg>
        <span style={s('font-size:13px;color:var(--text)')}>{device || 'Garmin Edge 1050'}</span>{!device && <Sample />}
      </div>
      <div style={s('display:flex;align-items:flex-start;gap:11px')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></svg>
        <span style={s('font-size:12.5px;color:var(--text2);line-height:1.45')}>{wxText || 'Clear, 23°C. Feels like 23°C. Humidity 71%. Wind 4.0 km/h from SSE.'}</span>
        {!weather && <Sample />}
      </div>
    </div>
  );
}

// ---- Relative Effort — score is the real training load; the bands are illustrative ----
// Training Load = TSS (your power through the ride vs FTP). The bands below map the score
// to how long recovery typically takes, per the club's guidance.
const RECOVERY_BANDS = [
  ['≤125', 'About 24 hours', 'var(--good)'],
  ['125–250', '36–48 hours', 'var(--warn)'],
  ['250–400', 'At least 3 days', '#f97316'],
  ['400+', 'At least 5 days', 'var(--bad)'],
];
function recoveryTier(load) {
  if (load == null) return null;
  if (load <= 125) return 0;
  if (load <= 250) return 1;
  if (load <= 400) return 2;
  return 3;
}

function TrainingLoad({ load, estimated }) {
  const [open, setOpen] = useState(false);
  const tier = recoveryTier(load);
  if (tier == null) return null;
  return (
    <div style={s('padding:22px 18px 0')}>
      <div style={s('display:flex;align-items:center;justify-content:space-between')}>
        <div style={s('display:flex;align-items:center;gap:8px')}><Spark icon={boltPath} /><span style={s('font-size:17px;font-weight:700')}>Training Load</span></div>
        <span className="mono" style={s('font-size:22px;font-weight:700')}>{load}</span>
      </div>
      <div style={s('font-size:12.5px;color:var(--text2);margin-top:6px')}>Estimated recovery: <b style={s('color:var(--text)')}>{RECOVERY_BANDS[tier][1]}</b>{estimated ? ' · estimated from your FTP' : ''}</div>
      <div style={s('display:flex;gap:5px;margin-top:13px')}>
        {RECOVERY_BANDS.map(([range, lbl, color], i) => {
          const on = i === tier;
          return (
            <div key={range} style={s(`flex:1;border-radius:9px;overflow:hidden;background:var(--bg2);border:${on ? `2px solid ${color}` : '1px solid var(--line)'};opacity:${on ? 1 : 0.55}`)}>
              <div style={s(`height:6px;background:${color}`)} />
              <div style={s('padding:6px 7px 8px')}>
                <div className="mono" style={s('font-size:10.5px;font-weight:800;color:var(--text)')}>{range}</div>
                <div style={s('font-size:9px;color:var(--text3);margin-top:2px;line-height:1.25')}>{lbl}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="ctl" onClick={() => setOpen((o) => !o)} style={s('display:flex;align-items:center;gap:5px;margin-top:12px;font-size:12.5px;font-weight:700;color:var(--accent)')}>
        How Training Load works
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}><path d="M6 9l6 6 6-6" /></svg>
      </div>
      {open && (
        <div style={s('font-size:12.5px;color:var(--text2);line-height:1.55;margin-top:8px;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:13px 14px')}>
          Training Load compares your power through the ride to your FTP to gauge how much load the workout put on your body. It's a great way to judge how much rest you need — the guide above estimates how long until you're fully recovered.
        </div>
      )}
    </div>
  );
}

// A small band-gauge + expandable "how it works" — shared by Intensity (below) so the
// effort metrics read consistently with Training Load.
function BandCard({ heading, value, sub, bands, tier, explanation }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={s('padding:22px 18px 0')}>
      <div style={s('display:flex;align-items:center;justify-content:space-between')}>
        <div style={s('display:flex;align-items:center;gap:8px')}><Spark icon={boltPath} /><span style={s('font-size:17px;font-weight:700')}>{heading}</span></div>
        <span className="mono" style={s('font-size:22px;font-weight:700')}>{value}</span>
      </div>
      <div style={s('font-size:12.5px;color:var(--text2);margin-top:6px')}>{sub}</div>
      <div style={s('display:flex;gap:5px;margin-top:13px')}>
        {bands.map(([range, lbl, color], i) => {
          const on = i === tier;
          return (
            <div key={range} style={s(`flex:1;border-radius:9px;overflow:hidden;background:var(--bg2);border:${on ? `2px solid ${color}` : '1px solid var(--line)'};opacity:${on ? 1 : 0.55}`)}>
              <div style={s(`height:6px;background:${color}`)} />
              <div style={s('padding:6px 5px 8px')}>
                <div className="mono" style={s('font-size:9.5px;font-weight:800;color:var(--text)')}>{range}</div>
                <div style={s('font-size:8.5px;color:var(--text3);margin-top:2px;line-height:1.2')}>{lbl}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="ctl" onClick={() => setOpen((o) => !o)} style={s('display:flex;align-items:center;gap:5px;margin-top:12px;font-size:12.5px;font-weight:700;color:var(--accent)')}>
        How {heading} works
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}><path d="M6 9l6 6 6-6" /></svg>
      </div>
      {open && <div style={s('font-size:12.5px;color:var(--text2);line-height:1.55;margin-top:8px;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:13px 14px')}>{explanation}</div>}
    </div>
  );
}

// ---- Intensity = Intensity Factor % (weighted-average power vs FTP) ----
const INTENSITY_BANDS = [
  ['≤65%', 'Endurance', 'var(--good)'],
  ['65–80%', 'Moderate', 'var(--swim)'],
  ['80–95%', 'Tempo', 'var(--warn)'],
  ['95–105%', 'TT / Race', '#f97316'],
  ['105%+', 'Short TT', 'var(--bad)'],
];
function intensityTier(pct) {
  if (pct == null) return null;
  if (pct <= 65) return 0;
  if (pct <= 80) return 1;
  if (pct <= 95) return 2;
  if (pct <= 105) return 3;
  return 4;
}
function Intensity({ pct }) {
  const tier = intensityTier(pct);
  if (tier == null) return null;
  return (
    <BandCard heading="Intensity" value={`${pct}%`} tier={tier} bands={INTENSITY_BANDS}
      sub={<>Ride type: <b style={s('color:var(--text)')}>{['Endurance / Recovery', 'Moderate', 'Tempo', 'Time Trial / Race', 'Short TT / Race'][tier]}</b></>}
      explanation="Intensity compares your Weighted Average Power for the ride to your FTP — e.g. 250 W at a 300 W FTP is 83%. Rides shorter than an hour can go over 100%." />
  );
}

// ---- Relative Effort = HR-based TRIMP (Banister) — how hard you worked from heart rate ----
// Exponential TRIMP over the recorded HR: Σ dt·HRr·0.64·e^(1.92·HRr), HRr = (HR−rest)/(max−rest).
// No resting-HR setting yet, so we assume 60 bpm. Needs max HR (Settings → Training zones).
function computeTrimp(track, maxHr, restHr = 60) {
  if (!maxHr || maxHr <= restHr) return null;
  let trimp = 0, prev = null, any = false;
  for (const p of (track || [])) {
    if (!Number.isFinite(p.offsetSec)) continue;
    if (prev && Number.isFinite(p.heartRate)) {
      const dtMin = (p.offsetSec - prev.offsetSec) / 60;
      if (dtMin > 0 && dtMin < 1) {
        const hrr = Math.min(1, Math.max(0, (p.heartRate - restHr) / (maxHr - restHr)));
        trimp += dtMin * hrr * 0.64 * Math.exp(1.92 * hrr);
        any = true;
      }
    }
    prev = p;
  }
  return any ? Math.round(trimp) : null;
}
const reLabel = (v) => (v <= 50 ? 'Easy' : v <= 150 ? 'Moderate' : v <= 300 ? 'Hard' : 'Epic');
function RelativeEffort({ score }) {
  const [open, setOpen] = useState(false);
  if (score == null) return null;
  return (
    <div style={s('padding:22px 18px 0')}>
      <div style={s('display:flex;align-items:center;justify-content:space-between')}>
        <div style={s('display:flex;align-items:center;gap:8px')}><Spark icon={boltPath} /><span style={s('font-size:17px;font-weight:700')}>Relative Effort</span></div>
        <span className="mono" style={s('font-size:22px;font-weight:700')}>{score}</span>
      </div>
      <div style={s('font-size:12.5px;color:var(--text2);margin-top:6px')}>From your heart-rate data — this ride reads as <b style={s('color:var(--text)')}>{reLabel(score)}</b>.</div>
      <div className="ctl" onClick={() => setOpen((o) => !o)} style={s('display:flex;align-items:center;gap:5px;margin-top:12px;font-size:12.5px;font-weight:700;color:var(--accent)')}>
        How Relative Effort works
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}><path d="M6 9l6 6 6-6" /></svg>
      </div>
      {open && (
        <div style={s('font-size:12.5px;color:var(--text2);line-height:1.55;margin-top:8px;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:13px 14px')}>
          Relative Effort analyses your heart rate through the workout, relative to your maximum, to score exactly how hard you worked — the more time at full gas and the longer the activity, the higher the score. Inspired by TRIMP (Training Impulse), coined by Dr. Eric Bannister.
        </div>
      )}
    </div>
  );
}

// ---- fitness (still SAMPLE) + matched rides (real: squad-mates who rode the same
// place + time, from the /track endpoint) ----
function StubTrends({ matched }) {
  const mates = matched || [];
  return (
    <div style={s('padding:16px 18px 0')}>
      <div style={s('display:flex;align-items:center;gap:6px;margin-bottom:8px')}><span style={s(label)}>Trends</span></div>
      <div style={s('display:flex;gap:10px')}>
        <div style={s('flex:1;background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:14px')}>
          <div style={s('display:flex;align-items:center;gap:6px')}><span style={s('font-size:14px;font-weight:700')}>Fitness +3</span><Sample /></div>
          <div style={s('font-size:11px;color:var(--text3);margin-top:2px')}>Score <b className="mono" style={s('color:var(--text)')}>19</b></div>
          <svg viewBox="0 0 120 54" preserveAspectRatio="none" style={{ width: '100%', height: 44, marginTop: 8, display: 'block' }}><polyline points="4,34 30,30 56,32 84,40 104,34 116,10" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /><circle cx="116" cy="10" r="3" fill="var(--accent)" /></svg>
        </div>
        <MatchedRides mates={mates} />
      </div>
    </div>
  );
}

// The teammates who rode alongside (same sport, start point + time). Real data when present;
// falls back to a SAMPLE card until this activity has any matches.
function MatchedRides({ mates }) {
  if (!mates.length) {
    return (
      <div style={s('flex:1;background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:14px')}>
        <div style={s('display:flex;align-items:center;gap:6px')}><span style={s('font-size:14px;font-weight:700')}>Matched Rides</span><Sample /></div>
        <div className="mono" style={s('font-size:11px;color:var(--text3);margin-top:2px')}>28.2 km/h · 17</div>
        <svg viewBox="0 0 120 54" preserveAspectRatio="none" style={{ width: '100%', height: 44, marginTop: 8, display: 'block' }}><polyline points="4,18 34,16 62,20 90,30 116,26" fill="none" stroke="var(--swim)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /><circle cx="116" cy="26" r="3" fill="var(--accent)" /></svg>
      </div>
    );
  }
  const names = mates.map((m) => (m.athleteName || '').split(' ')[0]).filter(Boolean);
  const sub = names.length <= 2 ? names.join(' & ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
  return (
    <div style={s('flex:1;background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:14px')}>
      <div style={s('font-size:14px;font-weight:700')}>Matched Rides</div>
      <div style={s('display:flex;align-items:baseline;gap:6px;margin-top:2px')}>
        <span className="mono" style={s('font-size:22px;font-weight:800;line-height:1')}>{mates.length}</span>
        <span style={s('font-size:11px;color:var(--text3)')}>{mates.length === 1 ? 'teammate' : 'teammates'}</span>
      </div>
      <div style={s('display:flex;margin-top:10px')}>
        {mates.slice(0, 5).map((m, i) => (
          <div key={m.activityId || i} title={m.athleteName}
               style={s(`width:26px;height:26px;border-radius:50%;background:${m.avatarColor || 'var(--bg4)'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:9.5px;font-weight:700;border:2px solid var(--bg2);margin-left:${i ? -8 : 0}px`)}>
            {m.initials || (m.athleteName || '?').slice(0, 2).toUpperCase()}
          </div>
        ))}
      </div>
      <div style={s('font-size:11px;color:var(--text2);margin-top:8px;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{sub}</div>
    </div>
  );
}

// ---- yearly distance goal (device-local): set a target, sum your activities this year ----
function Goals({ myActivities }) {
  const year = new Date().getFullYear();
  const [goal, setGoal] = useState(() => { const v = parseInt(localStorage.getItem('squad.goalKm'), 10); return Number.isFinite(v) && v > 0 ? v : null; });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const ridden = useMemo(() => Math.round((myActivities || []).reduce((sum, a) => {
    const y = a.startUtc ? new Date(a.startUtc).getFullYear() : year;
    if (y !== year) return sum;
    let km = parseFloat(a.dist);
    if (!Number.isFinite(km)) return sum;
    if (a.distU === 'm') km /= 1000;
    return sum + km;
  }, 0)), [myActivities, year]);

  const C = 2 * Math.PI * 24;
  const dash = `${(Math.min(1, goal ? ridden / goal : 0) * C).toFixed(1)} ${C.toFixed(1)}`;
  const startEdit = () => { setDraft(goal ? String(goal) : ''); setEditing(true); };
  const save = () => { const v = parseInt(draft, 10); if (Number.isFinite(v) && v > 0) { localStorage.setItem('squad.goalKm', String(v)); setGoal(v); } setEditing(false); };

  return (
    <div style={s('padding:16px 18px 0')}>
      <div style={s(label + ';margin-bottom:8px')}>Goal · {year}</div>
      <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:15px 16px;display:flex;align-items:center;gap:15px')}>
        <div style={s('position:relative;width:58px;height:58px;flex:none')}>
          <svg width="58" height="58" viewBox="0 0 58 58" style={{ transform: 'rotate(-90deg)' }}><circle cx="29" cy="29" r="24" fill="none" stroke="var(--bg4)" strokeWidth="5" /><circle cx="29" cy="29" r="24" fill="none" stroke="var(--good)" strokeWidth="5" strokeLinecap="round" strokeDasharray={dash} /></svg>
          <div style={s('position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:16px')}>🚴</div>
        </div>
        <div style={s('flex:1;min-width:0')}>
          {editing ? (
            <div style={s('display:flex;align-items:center;gap:8px')}>
              <input value={draft} onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} inputMode="numeric" placeholder="Goal km" autoFocus
                style={s('width:96px;background:var(--bg3);border:1px solid var(--line);border-radius:9px;padding:8px 10px;font-size:13px;color:var(--text);outline:none;font-family:inherit')} />
              <div className="ctl" onClick={save} style={s('padding:8px 13px;border-radius:9px;background:var(--accent);color:var(--accent-ink);font-size:12px;font-weight:700')}>Save</div>
            </div>
          ) : goal ? (
            <>
              <div style={s('font-size:14px;font-weight:700')}>This year · {Math.max(0, goal - ridden).toLocaleString()} km to go</div>
              <div className="mono" style={s('font-size:11.5px;color:var(--text2);margin-top:2px')}>{ridden.toLocaleString()} / {goal.toLocaleString()} km</div>
              <div className="ctl" onClick={startEdit} style={s('font-size:11px;font-weight:700;color:var(--accent);margin-top:6px')}>Edit goal</div>
            </>
          ) : (
            <>
              <div style={s('font-size:14px;font-weight:700')}>Set a distance goal</div>
              <div style={s('font-size:11.5px;color:var(--text2);margin-top:2px')}>{ridden.toLocaleString()} km so far this year</div>
              <div className="ctl" onClick={startEdit} style={s('font-size:11px;font-weight:700;color:var(--accent);margin-top:6px')}>Set goal</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- a zone-time distribution (power or HR), all real from the recorded stream ----
function zoneRows(seconds, colors, names, fracs, ref) {
  const total = seconds.reduce((a, b) => a + b, 0);
  if (total <= 0 || !ref) return null;
  const n = seconds.length, max = Math.max(...seconds);
  const bounds = fracs.map((f) => f * ref);
  const range = (i) => {
    const lo = i === 0 ? null : Math.round(bounds[i - 1]);
    const hi = i === n - 1 ? null : Math.round(bounds[i]) - 1;
    if (lo == null) return `< ${hi + 1}`;
    if (hi == null) return `> ${lo - 1}`;
    return `${lo}–${hi}`;
  };
  return seconds.map((sec, i) => ({
    z: `Z${i + 1}`, name: names[i], c: colors[i],
    bar: max > 0 ? Math.round((sec / max) * 100) : 0,
    pct: Math.round((sec / total) * 100), range: range(i),
  }));
}

function ZoneBlock({ heading, sub, zoneTitle, rows, insight, insightColor }) {
  return (
    <div style={s('padding:22px 18px 0')}>
      {heading && <div style={s(title + (sub ? ';margin-bottom:4px' : ''))}>{heading}</div>}
      {sub && <div className="mono" style={s('font-size:12px;color:var(--text2);margin-bottom:12px')}>{sub}</div>}
      {rows && (
        <>
          {zoneTitle && <div style={s('font-size:12px;color:var(--text3);margin:0 0 4px')}>{zoneTitle}</div>}
          <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:13px 14px;display:flex;flex-direction:column;gap:9px')}>
            {rows.map((z) => (
              <div key={z.z} style={s('display:flex;align-items:center;gap:9px')}>
                <span style={s(`width:22px;font-size:11px;font-weight:800;color:${z.c}`)}>{z.z}</span>
                <div style={s('flex:1;height:14px;border-radius:5px;background:var(--bg3);overflow:hidden')}><div style={s(`height:100%;width:${z.bar}%;background:${z.c};border-radius:5px`)} /></div>
                <span className="mono" style={s('width:34px;text-align:right;font-size:12px;font-weight:700')}>{z.pct}%</span>
                <span className="mono" style={s('width:74px;text-align:right;font-size:10px;color:var(--text3)')}>{z.range}</span>
              </div>
            ))}
          </div>
          {insight && <div style={s(`background:color-mix(in srgb,${insightColor} 10%,var(--bg2));border:1px solid color-mix(in srgb,${insightColor} 28%,transparent);border-radius:14px;padding:12px 14px;margin-top:10px;font-size:12.5px;color:var(--text2);line-height:1.5`)}>{insight}</div>}
        </>
      )}
    </div>
  );
}

// ---- workout analysis: mean power binned over time (real) ----
function WorkoutAnalysis({ powerValues }) {
  const bars = useMemo(() => {
    const v = finite(powerValues);
    if (v.length < 4) return null;
    const N = 26, per = powerValues.length / N, out = [];
    let max = 0;
    for (let b = 0; b < N; b++) {
      const seg = finite(powerValues.slice(Math.floor(b * per), Math.floor((b + 1) * per)));
      const m = seg.length ? seg.reduce((a, c) => a + c, 0) / seg.length : 0;
      out.push(m); max = Math.max(max, m);
    }
    const avg = v.reduce((a, c) => a + c, 0) / v.length;
    return { out, max, avg };
  }, [powerValues]);
  if (!bars) return null;
  const W = 320, H = 130, bw = W / bars.out.length;
  const col = (m) => { const r = bars.max ? m / bars.max : 0; return r < 0.4 ? '#c084fc' : r < 0.7 ? '#a855f7' : '#7c26b8'; };
  return (
    <div style={s('padding:22px 18px 0')}>
      <div style={s(title)}>Workout Analysis</div>
      <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:14px')}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, display: 'block' }}>
          {bars.out.map((m, i) => {
            const h = bars.max ? (m / bars.max) * (H - 6) : 0;
            return <rect key={i} x={(i * bw + 3).toFixed(1)} y={(H - h).toFixed(1)} width={(bw - 6).toFixed(1)} height={h.toFixed(1)} rx="3" fill={col(m)} />;
          })}
          <line x1="0" y1={(H - (bars.max ? (bars.avg / bars.max) * (H - 6) : 0)).toFixed(1)} x2={W} y2={(H - (bars.max ? (bars.avg / bars.max) * (H - 6) : 0)).toFixed(1)} stroke="var(--text3)" strokeWidth="1" strokeDasharray="4 4" />
        </svg>
        <div style={s('font-size:10.5px;color:var(--text3);margin-top:6px')}>Mean power over the ride · dashed line = ride average ({Math.round(bars.avg)} W)</div>
      </div>
    </div>
  );
}

// ---- power curve (real, log-time x) ----
function PowerCurve({ curve }) {
  if (curve.length < 2) return null;
  const maxW = Math.max(...curve.map((c) => c.watts));
  const first = curve[0].sec, last = curve[curve.length - 1].sec;
  const lmin = Math.log(first), lspan = Math.log(last) - lmin || 1;
  const W = 320, H = 150, padY = 8;
  const X = (sec) => ((Math.log(sec) - lmin) / lspan) * W;
  const Y = (w) => H - padY - (w / maxW) * (H - 2 * padY);
  const line = curve.map((c, i) => `${i ? 'L' : 'M'}${X(c.sec).toFixed(1)},${Y(c.watts).toFixed(1)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;
  const ticks = [1, 5, 15, 30, 60, 300, 1200, 7200].filter((tk) => tk >= first && tk <= last);
  return (
    <div style={s('padding:16px 18px 0')}>
      <div style={s(title)}>Power Curve</div>
      <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:14px 14px 8px')}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, display: 'block' }}>
          <path d={area} fill="#7c2fd6" opacity="0.14" />
          <path d={line} fill="none" stroke="#7c2fd6" strokeWidth="2.4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        <div style={s('position:relative;height:14px;margin-top:2px')}>
          {ticks.map((tk) => <span key={tk} className="mono" style={s(`position:absolute;left:${((X(tk) / W) * 100).toFixed(1)}%;transform:translateX(-50%);font-size:9px;color:var(--text3)`)}>{CURVE_LABEL[tk]}</span>)}
        </div>
      </div>
    </div>
  );
}

// ---- static sensor trace charts (real; area sparkline + axis) ----
// Each chart carries the elevation profile as a faint grey backdrop for context (the
// shape of the climb behind HR/power/speed), matching the design.
function SensorTraces({ traces, totalSec, elevValues }) {
  const W = 320, H = 88;
  const areaFor = (values) => {
    const pts = values.map((v, i) => [i, v]).filter(([, v]) => v != null && Number.isFinite(v));
    if (pts.length < 2) return null;
    const ys = pts.map(([, v]) => v), min = Math.min(...ys), max = Math.max(...ys), span = (max - min) || 1;
    const n = (values.length - 1) || 1;
    const X = (i) => (i / n) * W, Y = (v) => (H - 2) - ((v - min) / span) * (H - 6);
    const line = pts.map(([i, v]) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    return { line, area: `${X(pts[0][0]).toFixed(1)},${H} ${line} ${X(pts[pts.length - 1][0]).toFixed(1)},${H}`, min, max, avg: ys.reduce((a, b) => a + b, 0) / ys.length };
  };
  const elev = areaFor(elevValues || []);
  if (!traces.length) return null;
  const ax = [1 / 6, 1 / 2, 5 / 6].map((f) => fmtDur(totalSec * f));
  return (
    <div style={s('padding:16px 18px 0;display:flex;flex-direction:column;gap:12px')}>
      {traces.map((t) => {
        const g = areaFor(t.values);
        if (!g) return null;
        const f = t.fmt || ((x) => Math.round(x));
        return (
          <div key={t.key} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:14px 14px 8px')}>
            <div style={s('display:flex;align-items:baseline;justify-content:space-between')}><span style={s('font-size:15px;font-weight:700')}>{t.title}</span><span className="mono" style={s('font-size:11.5px;color:var(--text3)')}>avg {f(g.avg)} · max {f(g.max)} {t.unit}</span></div>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: H, marginTop: 8, display: 'block' }}>
              {elev && t.key !== 'elev' && <polygon points={elev.area} fill="rgba(255,255,255,.07)" />}
              <polygon points={g.area} fill={t.stroke} opacity="0.28" />
              <polyline points={g.line} fill="none" stroke={t.stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
            <div style={s('position:relative;height:13px')}>{ax.map((lbl, i) => <span key={i} className="mono" style={s(`position:absolute;left:${[16, 48, 80][i]}%;font-size:9px;color:var(--text3)`)}>{lbl}</span>)}</div>
          </div>
        );
      })}
    </div>
  );
}

// ---- splits / laps table (real) ----
function Splits({ analytics, sport }) {
  const { splits, lapRows, useLaps, splitUnitLabel } = analytics;
  const rows = useLaps ? lapRows : splits;
  if (!rows.length) return null;
  const isSwim = sport === 'Swim', isFoot = sport === 'Run';
  const speeds = rows.map((sp) => (sp.sec > 0 ? sp.meters / sp.sec : 0));
  const fastest = Math.max(...speeds, 0.1);
  const hasPwr = rows.some((sp) => sp.avgPower != null);
  return (
    <div style={s('padding:22px 18px 0')}>
      <div style={s(title)}>{useLaps ? 'Laps' : `Splits · ${splitUnitLabel}`}</div>
      <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;overflow:hidden')}>
        {rows.map((sp, i) => {
          const rate = isFoot || isSwim
            ? pace(sp.sec / (sp.meters / (isSwim ? 100 : 1000))) + (isSwim ? '/100' : '/km')
            : ((sp.meters / 1000) / (sp.sec / 3600)).toFixed(1);
          return (
            <div key={sp.index} style={s(`display:flex;align-items:center;gap:9px;padding:8px 12px;${i ? 'border-top:1px solid var(--line)' : ''}`)}>
              <div style={s('width:18px;font-size:12px;font-weight:700;color:var(--text2);flex:none')}>{sp.partial ? '·' : sp.index}</div>
              <div style={s('flex:1;min-width:0')}><div style={s('height:8px;border-radius:4px;background:var(--accent);opacity:.9;width:' + Math.max(6, Math.round((speeds[i] / fastest) * 100)) + '%')} /></div>
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
    </div>
  );
}

// ---- best efforts (real) ----
function BestEfforts({ bestPower, bestDist }) {
  if (!bestPower.length && !bestDist.length) return null;
  const maxW = bestPower.length ? Math.max(...bestPower.map((e) => e.watts)) : 1;
  return (
    <div style={s('padding:22px 18px 0')}>
      <div style={s(title)}>Best Efforts{bestPower.length ? ' · Power' : ''}</div>
      <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:12px 14px')}>
        {bestPower.map((e) => (
          <div key={e.sec} style={s('display:flex;align-items:center;gap:9px;padding:5px 0')}>
            <div className="mono" style={s('width:38px;font-size:11px;color:var(--text2)')}>{fmtEffortDur(e.sec)}</div>
            <div style={s('flex:1;height:8px;border-radius:4px;background:var(--bg4);overflow:hidden')}><div style={s(`height:100%;border-radius:4px;background:var(--accent);width:${Math.round((e.watts / maxW) * 100)}%`)} /></div>
            <div className="mono" style={s('width:48px;text-align:right;font-size:12.5px;font-weight:700')}>{e.watts}<span style={s('font-size:9px;color:var(--text3)')}>w</span></div>
            <div className="mono" style={s('width:40px;text-align:right;font-size:11px;color:var(--text3)')}>{e.avgHr != null ? `${e.avgHr}` : '—'}</div>
          </div>
        ))}
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
  );
}

// Data-driven single-activity detail (yours or a teammate's), redesigned to a rich
// Strava-style page. Everything derived from the real recording where possible; a few
// cards (Athlete Intelligence, device, weather, fitness/matched, goals) are tagged
// SAMPLE until a data source exists.
export default function Feed({ vm, state, actions, getToken, onDataChanged, meId }) {
  const a = vm.activityDetail;
  const token = getToken?.() ?? null;
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { track, laps, matched, status } = useActivityTrack(a?.id, { getToken });
  const frames = useMemo(() => buildFrames(track), [track]);
  const route = useMemo(() => frameRoute(frames), [frames]);
  const hasMap = useMemo(() => gpsFrameCount(frames) >= 2, [frames]);
  const traces = useMemo(() => buildTraces(frames), [frames]);
  const powerValues = useMemo(() => frames.map((f) => f.power), [frames]);
  const hrValues = useMemo(() => frames.map((f) => f.hr), [frames]);
  const elevValues = useMemo(() => frames.map((f) => f.elev), [frames]);
  const analytics = useActivityAnalytics(track, laps, a?.sport);
  const relEffort = useMemo(() => computeTrimp(track, analytics.zones.maxHr), [track, analytics.zones.maxHr]);

  // Opening an activity should always start at the top, not wherever the previous
  // screen was scrolled to (the shell reuses one scroll container).
  useEffect(() => {
    const scr = document.querySelector('.scr');
    if (scr) scr.scrollTop = 0;
  }, [a?.id]);

  const doDelete = async () => {
    if (!a || deleting) return;
    setDeleting(true);
    try {
      const tk = getToken ? await getToken() : null;
      await deleteActivity(a.id, tk);
      onDataChanged?.();
      actions.go(state.activityBack || 'activities');
    } catch { setDeleting(false); }
  };

  if (!a) {
    return (
      <div style={s('padding:6px 0 120px;animation:floatUp .35s ease')}>
        <div style={s('display:flex;align-items:center;gap:11px;padding:2px 18px 12px')}>
          <div className="ctl" onClick={() => actions.go(state.activityBack || 'activities')} style={s('width:34px;height:34px;border-radius:10px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;flex:none')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg>
          </div>
        </div>
        <EmptyState icon="🚴" title="Activity not found" sub="This activity isn't available. Record a ride or sync from Apple Health to see it here." />
      </div>
    );
  }

  const totalSec = frames.length ? (frames[frames.length - 1].offsetSec ?? 0) : 0;
  const { zones, np, ifactor, pwZones, hZones, workKJ } = analytics;
  const avgPower = avgOf(powerValues), maxPower = maxOf(powerValues);
  const avgHr = avgOf(hrValues), maxHr = maxOf(hrValues);

  // Training Load = TSS. Prefer the device's value (a.load); when it's missing but we have
  // power + the athlete's FTP, compute it: hours × IF² × 100 (NP relative to FTP).
  const computedTss = (np != null && zones.ftp && totalSec > 0)
    ? Math.round((totalSec / 3600) * (np / zones.ftp) ** 2 * 100)
    : null;
  const effLoad = a.load > 0 ? a.load : computedTss;
  // Real power = an actual power stream (runs / no-power rides have none, so every
  // power-derived section stays hidden rather than showing zeros).
  const hasRealPower = (np != null && np > 0) || (avgPower != null && avgPower > 0) || analytics.curve.length > 0;
  const intensityPct = (hasRealPower && ifactor != null) ? Math.round(ifactor * 100) : null;

  const powerZoneRows = (hasRealPower && pwZones) ? zoneRows(pwZones, POWER_COLORS, PWR_ZONE_NAMES, PWR_ZONE_FRACS, zones.ftp) : null;
  const hrZoneRows = hZones ? zoneRows(hZones, HR_COLORS, HR_ZONE_NAMES, HR_ZONE_FRACS, zones.maxHr) : null;
  const zoneInsight = (rows) => rows.map((z) => `${z.pct}% ${z.name.toLowerCase()}`).join(', ') + '.';

  const powerStats = !hasRealPower ? [] : [
    avgPower > 0 && ['Avg Power', `${avgPower} W`],
    maxPower > 0 && ['Max Power', `${maxPower} W`],
    np > 0 && ['Normalized Power', `${np} W`],
    workKJ >= 1 && ['Work', `${Math.round(workKJ)} kJ`],
  ].filter(Boolean);

  return (
    <div style={s('padding:0 0 120px;animation:floatUp .35s ease')}>
      <ActivityHero a={a} route={route} frames={frames} hasMap={hasMap} status={status} token={token}
        onBack={() => actions.go(state.activityBack || 'activities')} onDelete={() => setConfirmDel(true)} />

      <AthleteTitle a={a} token={token} onAthlete={actions.openAthlete} />
      <MetricHero a={a} load={effLoad} />
      <AIInsight />
      <DeviceWeather device={a.deviceName} weather={a.weather} />

      {/* social — real kudos (self-kudos blocked) + comments */}
      <div style={s('padding:16px 0 0')}>
        <ActivityInteractions activity={a} token={token} getToken={getToken} meId={meId} />
      </div>

      <TrainingLoad load={effLoad} estimated={!(a.load > 0) && computedTss != null} />
      <Intensity pct={intensityPct} />
      <RelativeEffort score={relEffort} />
      <StubTrends matched={matched} />
      <Goals myActivities={vm.myActivities} />

      <ActivityPhotos activityId={a.id} isMe={a.isMe} token={token} getToken={getToken} />

      {hasRealPower && <WorkoutAnalysis powerValues={powerValues} />}
      <PowerCurve curve={analytics.curve} />
      <SensorTraces traces={traces} totalSec={totalSec} elevValues={elevValues} />

      {/* power stats + zones */}
      {(powerStats.length > 0 || powerZoneRows) && (
        <div style={s('padding:22px 18px 0')}>
          <div style={s(title)}>Power</div>
          {powerStats.length > 0 && (
            <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;overflow:hidden')}>
              {powerStats.map(([k, v], i) => (
                <div key={k} style={s(`display:flex;align-items:center;padding:12px 15px;${i ? 'border-top:1px solid var(--line)' : ''}`)}><span style={s('flex:1;font-size:13px;color:var(--text2)')}>{k}</span><span className="mono" style={s('font-size:14px;font-weight:700')}>{v}</span></div>
              ))}
            </div>
          )}
        </div>
      )}
      {powerZoneRows && (
        <ZoneBlock heading="" sub={null} zoneTitle={`Power Zones · FTP ${zones.ftp} W`} rows={powerZoneRows}
          insight={<><b style={s('color:var(--text)')}>Distribution:</b> {zoneInsight(powerZoneRows)}</>} insightColor="var(--accent)" />
      )}

      {/* heart rate + zones */}
      {(avgHr != null || hrZoneRows) && (
        <ZoneBlock heading="Heart Rate" sub={avgHr != null ? `avg ${avgHr} bpm${maxHr != null ? ` · max ${maxHr} bpm` : ''}` : null}
          zoneTitle={hrZoneRows ? `HR Zones · max ${zones.maxHr} bpm` : ''} rows={hrZoneRows}
          insight={hrZoneRows ? <><b style={s('color:var(--text)')}>Distribution:</b> {zoneInsight(hrZoneRows)}</> : null} insightColor="var(--bad)" />
      )}

      {hasRealPower && !zones.ftp && (
        <div style={s('padding:12px 18px 0;font-size:11px;color:var(--text3);line-height:1.5')}>Set your FTP &amp; max HR in <b>Settings → Training zones</b> to unlock power / heart-rate zones and Intensity Factor.</div>
      )}

      <Splits analytics={analytics} sport={a.sport} />
      <BestEfforts bestPower={analytics.bestPower} bestDist={analytics.bestDist} />

      {confirmDel && (
        <>
          <div className="ctl" onClick={() => !deleting && setConfirmDel(false)} style={s('position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:50;animation:floatUp .2s ease')} />
          <div className="scr" style={s('position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(90%,420px);z-index:51;background:var(--bg);border:1px solid var(--line2);border-radius:20px;padding:20px;animation:floatUpCenter .25s ease')}>
            <div style={s('font-size:17px;font-weight:700')}>Delete this training?</div>
            <div style={s('font-size:13px;color:var(--text2);line-height:1.5;margin-top:8px')}>{a.title} · {a.when}. This removes it from your activities, feed and leaderboard. You can re-import it later.</div>
            <div style={s('display:flex;gap:10px;margin-top:18px')}>
              <div className="ctl" onClick={() => !deleting && setConfirmDel(false)} style={s('flex:1;text-align:center;padding:12px;border-radius:12px;font-weight:700;font-size:14px;background:var(--bg3);border:1px solid var(--line);color:var(--text2)')}>Cancel</div>
              <div className="ctl" onClick={doDelete} style={s(`flex:1;text-align:center;padding:12px;border-radius:12px;font-weight:700;font-size:14px;background:var(--bad);color:#fff;opacity:${deleting ? 0.7 : 1}`)}>{deleting ? 'Deleting…' : 'Delete'}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
