import { useEffect, useMemo, useState } from 'react';
import { s } from '../lib/style.js';
import { analyzeProfile, catStyle, sectionKindLabel, coordAtDistance, PROFILE_LEGEND } from '../lib/routeProfile.js';
import { reverseGeocode } from '../lib/reverseGeocode.js';

// Event-page "route breakdown" (design 1a): the route split into flats / climbs / descents like a
// Grand-Tour stage profile — a colour-coded profile with climb-category chips, then a section-by-
// section list. All derived from the real terrain profile (elev), so nothing is fabricated.

const W = 940, H = 300, TOP = 30, BOT = 6; // profile viewBox + insets (matches the design)

export default function RouteBreakdown({ route, elev, loading }) {
  const analysis = useMemo(() => (elev?.profile ? analyzeProfile(elev.profile) : null), [elev]);
  const [names, setNames] = useState({}); // section.index → reverse-geocoded name

  // Name each climb from the [lat,lon] at its summit (once). Descents/flats keep a kind label.
  useEffect(() => {
    if (!analysis || !route) return undefined;
    let ok = true;
    (async () => {
      for (const sec of analysis.sections) {
        if (sec.kind !== 'climb' || names[sec.index]) continue;
        const c = coordAtDistance(route, sec.summitM);
        if (!c) continue;
        const n = await reverseGeocode(c[0], c[1]).catch(() => null);
        if (ok && n) setNames((m) => ({ ...m, [sec.index]: n }));
      }
    })();
    return () => { ok = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, route]);

  // The event always has a route here (the parent gates on it), so never render blank: show a
  // loading state while the terrain is read, and an explicit fallback if it couldn't be resolved.
  if (!analysis) {
    return (
      <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:18px;padding:20px;text-align:center;color:var(--text3);font-size:12.5px;margin-top:12px')}>
        {loading ? 'Reading the terrain…' : 'Elevation profile unavailable'}
      </div>
    );
  }

  const { totalKm, totalGainM, climbCount, minE, maxE, sections } = analysis;
  const totalM = totalKm * 1000 || 1;
  const eSpan = Math.max(1, maxE - minE);
  const X = (m) => (m / totalM) * W;
  const Y = (e) => H - BOT - ((e - minE) / eSpan) * (H - TOP - BOT);

  // Ridge path per section (coloured), sliced from the shared samples.
  const prof = elev.profile;
  const pathOf = (a, b) => prof.slice(a, b + 1).map((p, i) => `${i ? 'L' : 'M'}${X(p.dist).toFixed(1)} ${Y(p.e).toFixed(1)}`).join(' ');
  const ridge = prof.map((p, i) => `${i ? 'L' : 'M'}${X(p.dist).toFixed(1)} ${Y(p.e).toFixed(1)}`).join(' ');
  const areaD = `${ridge} L${W} ${H} L0 ${H} Z`;
  const ridgeSegs = sections.map((sec) => ({ d: pathOf(sec.aIdx, sec.bIdx), color: sec.color }));

  // Category chips at each climb summit.
  const chips = sections.filter((x) => x.kind === 'climb' && x.cat).map((sec) => {
    const cs = catStyle(sec.cat);
    return { key: sec.index, leftPct: (sec.endM / totalM) * 100, topPct: (Y(prof[sec.bIdx].e) / H) * 100, cat: sec.cat, color: cs.color, ink: cs.ink };
  });

  // km ticks at section boundaries (deduped, rounded).
  const tickSet = new Set([0, Math.round(totalKm)]);
  sections.forEach((sec) => tickSet.add(Math.round((sec.endM / 1000) * 10) / 10));
  const ticks = [...tickSet].filter((k) => k >= 0 && k <= totalKm).sort((a, b) => a - b)
    .map((k) => ({ km: k % 1 ? k.toFixed(1) : k, leftPct: (k / totalKm) * 100 }));

  const nameFor = (sec) => names[sec.index]
    || (sec.kind === 'climb' ? `Climb ${sec.index}` : sec.kind === 'descent' ? 'Descent' : 'Rolling');

  const stat = (val, unit, label, color) => (
    <div style={s('flex:1;background:var(--bg2);border:1px solid var(--line);border-radius:13px;padding:10px 11px')}>
      <div className="mono" style={s(`font-size:16px;font-weight:700;${color ? `color:${color}` : ''}`)}>{val}{unit && <span style={s('font-size:10px;color:var(--text2);font-weight:600')}> {unit}</span>}</div>
      <div style={s('font-size:8.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;margin-top:3px')}>{label}</div>
    </div>
  );

  return (
    <div style={s('margin-top:12px')}>
      {/* summary stats */}
      <div style={s('display:flex;gap:7px')}>
        {stat(totalKm.toFixed(1), 'km', 'Distance')}
        {stat(`↑${totalGainM}`, 'm', 'Climbing')}
        {stat(String(climbCount), '', 'Rated climbs')}
      </div>

      {/* stage profile */}
      <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:18px;padding:13px 12px 10px;margin-top:11px')}>
        <div style={s('display:flex;align-items:center;justify-content:space-between;margin-bottom:2px')}>
          <span style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1.3px;font-weight:600')}>Stage profile</span>
          <span className="mono" style={s('font-size:10px;color:var(--text2)')}>{minE}–{maxE} m</span>
        </div>
        <div style={s('position:relative;width:100%;height:150px')}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
            <path d={areaD} fill="rgba(255,255,255,.05)" />
            {ridgeSegs.map((seg, i) => <path key={i} d={seg.d} fill="none" stroke={seg.color} strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />)}
          </svg>
          <div style={s('position:absolute;inset:0;pointer-events:none')}>
            {chips.map((c) => (
              <div key={c.key} style={s(`position:absolute;left:${c.leftPct}%;top:${c.topPct}%;transform:translate(-50%,-115%)`)}>
                <span className="mono" style={s(`display:flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 3px;border-radius:4px;background:${c.color};color:${c.ink};font-size:10px;font-weight:800;box-shadow:0 2px 5px rgba(0,0,0,.5)`)}>{c.cat}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={s('position:relative;height:14px;margin-top:1px')}>
          {ticks.map((t, i) => <span key={i} className="mono" style={s(`position:absolute;left:${t.leftPct}%;transform:translateX(-50%);font-size:8.5px;color:var(--text3)`)}>{t.km}</span>)}
        </div>
        <div style={s('display:flex;flex-wrap:wrap;gap:9px 12px;margin-top:9px;padding-top:10px;border-top:1px solid var(--line)')}>
          {PROFILE_LEGEND.map((l) => (
            <div key={l.label} style={s('display:flex;align-items:center;gap:5px')}>
              <span style={s(`width:14px;height:5px;border-radius:3px;background:${l.c}`)} />
              <span style={s('font-size:9.5px;color:var(--text2);font-weight:600')}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* section-by-section list */}
      <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.4px;font-weight:600;margin:20px 2px 10px')}>The route, section by section</div>
      <div style={s('display:flex;flex-direction:column;gap:8px')}>
        {sections.map((sec) => {
          const cs = sec.cat ? catStyle(sec.cat) : null;
          return (
            <div key={sec.index} style={s('display:flex;align-items:stretch;gap:11px;background:var(--bg2);border:1px solid var(--line);border-radius:15px;padding:11px 13px;position:relative;overflow:hidden')}>
              <span style={s(`position:absolute;left:0;top:0;bottom:0;width:4px;background:${sec.color}`)} />
              <div style={s('flex:none;width:34px;display:flex;flex-direction:column;align-items:center;justify-content:center')}>
                <span className="mono" style={s(`font-size:20px;font-weight:700;color:${sec.color};line-height:1`)}>{sec.index}</span>
                {cs && <span className="mono" style={s(`margin-top:4px;min-width:15px;height:15px;padding:0 3px;display:flex;align-items:center;justify-content:center;border-radius:4px;background:${cs.color};color:${cs.ink};font-size:9px;font-weight:800`)}>{sec.cat}</span>}
              </div>
              <div style={s('flex:1;min-width:0')}>
                <div dir="auto" style={s('font-size:13.5px;font-weight:700;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{nameFor(sec)}</div>
                <div style={s('font-size:10.5px;color:var(--text2);margin-top:2px')}>{sectionKindLabel(sec)} · {(sec.startM / 1000).toFixed(1)} → {(sec.endM / 1000).toFixed(1)} km</div>
                <div style={s('display:flex;gap:14px;margin-top:8px')}>
                  <div><span className="mono" style={s('font-size:13px;font-weight:700')}>{(sec.lenM / 1000).toFixed(1)}</span><span style={s('font-size:9px;color:var(--text3)')}> km</span></div>
                  <div><span className="mono" style={s(`font-size:13px;font-weight:700;color:${sec.color}`)}>{sec.avgGradPct >= 0 ? '+' : ''}{sec.avgGradPct.toFixed(1)}</span><span style={s('font-size:9px;color:var(--text3)')}> %</span></div>
                  <div><span className="mono" style={s('font-size:13px;font-weight:700')}>{sec.gainM >= 0 ? '↑' : '↓'}{Math.abs(sec.gainM)}</span><span style={s('font-size:9px;color:var(--text3)')}> m</span></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
