import { s } from '../lib/style.js';
import TileMap from '../components/TileMap.jsx';
import { toPathD } from '../lib/tiles.js';

const Comment = ({ av, avBg, avColor, name, time, body }) => (
  <div style={s('display:flex;gap:10px')}>
    <div style={s(`width:30px;height:30px;border-radius:9px;background:${avBg};flex:none;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:${avColor}`)}>{av}</div>
    <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:9px 12px;flex:1')}>
      <div style={s('font-size:12px')}><span style={s('font-weight:600')}>{name}</span> <span style={s('color:var(--text3);font-size:11px')}>· {time}</span></div>
      <div style={s('font-size:12.5px;color:var(--text2);margin-top:2px')}>{body}</div>
    </div>
  </div>
);

const label = 'font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.3px;font-weight:600';

// Data-driven single-activity detail (yours or a teammate's). Summary + header
// come from vm.activityDetail; the deep analysis reuses the shared demo arrays,
// gated per sport (no power/laps for a swim, etc).
export default function Feed({ vm, state, actions }) {
  const a = vm.activityDetail;
  return (
    <div style={s('padding:6px 0 120px;animation:floatUp .35s ease')}>
      {/* header */}
      <div style={s('display:flex;align-items:center;gap:11px;padding:2px 18px 12px')}>
        <div className="ctl" onClick={() => actions.go(state.activityBack || 'activities')} style={s('width:34px;height:34px;border-radius:10px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;flex:none')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg>
        </div>
        <div className="ctl" onClick={() => actions.openAthlete(a.athleteId)} style={s(`width:40px;height:40px;border-radius:12px;background:${a.color};flex:none;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#0c0e11`)}>{a.initials}</div>
        <div style={s('flex:1;min-width:0')}><div style={s('font-size:15px;font-weight:700')}>{a.title}</div><div style={s('font-size:12px;color:var(--text2)')}>{a.athleteName} · {a.when} · {a.location}</div></div>
        <div style={s(`background:color-mix(in srgb,${a.sportColor} 16%,transparent);color:${a.sportColor};font-size:10px;font-weight:700;padding:4px 9px;border-radius:7px;text-transform:uppercase`)}>{a.sport}</div>
      </div>

      {/* map */}
      {a.hasMap && a.routePath && (
        <div style={s('margin:0 18px;border:1px solid var(--line);border-radius:20px;overflow:hidden')}>
          <TileMap points={a.routePath} W={356} H={170} radius={20}>
            {(project) => {
              const d = toPathD(a.routePath, project);
              const start = project(a.routePath[0][0], a.routePath[0][1]);
              const end = project(a.routePath[a.routePath.length - 1][0], a.routePath[a.routePath.length - 1][1]);
              return (
                <>
                  <path d={d} fill="none" stroke="rgba(0,0,0,.45)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
                  <path d={d} fill="none" stroke={a.sportColor} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx={start.x} cy={start.y} r="6" fill="var(--good)" stroke="#0b0f14" strokeWidth="2.5" />
                  <circle cx={end.x} cy={end.y} r="5.5" fill="var(--bad)" stroke="#0b0f14" strokeWidth="2.5" />
                </>
              );
            }}
          </TileMap>
        </div>
      )}

      {/* key metrics */}
      <div style={s('display:grid;grid-template-columns:repeat(3,1fr);gap:9px;padding:14px 18px 0')}>
        {a.metricCards.map(([v, u, l, col], i) => (
          <div key={i} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:11px 12px')}>
            <div className="mono" style={s(`font-size:20px;font-weight:700${col ? ';color:' + col : ''}`)}>{v}{u && <span style={s('font-size:11px;color:var(--text2)')}>{u}</span>}</div>
            <div style={s('font-size:9.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px')}>{l}</div>
          </div>
        ))}
      </div>

      {/* HR / elevation chart */}
      <div style={s('padding:20px 18px 0')}>
        <div style={s(label + ';margin-bottom:10px')}>Heart rate · elevation</div>
        <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:14px 12px 10px')}>
          <svg viewBox="0 0 320 90" style={{ width: '100%', display: 'block' }}>
            <defs><linearGradient id="elevg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--text3)" stopOpacity=".25" /><stop offset="1" stopColor="var(--text3)" stopOpacity="0" /></linearGradient></defs>
            <polygon points={a.analysis.elevArea} fill="url(#elevg)" stroke="none" />
            <polyline points={a.analysis.hrPoints} fill="none" stroke="var(--run)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {/* splits */}
      {a.hasSplits && (
        <div style={s('padding:20px 18px 0')}>
          <div style={s(label + ';margin-bottom:12px')}>Splits · {a.sport === 'Run' ? 'min/km' : 'km'} effort</div>
          <div style={s('display:flex;align-items:flex-end;gap:5px;height:78px')}>
            {a.analysis.splitBars.map((sp, i) => (
              <div key={i} style={s('flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;height:100%;justify-content:flex-end')}>
                <div style={s(`width:100%;height:${sp.h}px;border-radius:5px 5px 2px 2px;background:${sp.barColor};opacity:${sp.op}`)} />
                <div className="mono" style={s('font-size:8px;color:var(--text3)')}>{sp.km}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* achievements */}
      {a.achievements > 0 && (
        <div style={s('padding:22px 18px 0')}>
          <div style={s(label + ';margin-bottom:12px')}>Achievements</div>
          <div style={s('display:flex;flex-direction:column;gap:8px')}>
            {vm.achievements.slice(0, a.achievements).map((ac, i) => (
              <div key={i} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:11px 13px;display:flex;align-items:center;gap:12px')}>
                <div style={s('font-size:22px;flex:none')}>{ac.icon}</div>
                <div style={s('flex:1')}><div style={s('font-size:13.5px;font-weight:600')}>{ac.title}</div><div style={s('font-size:11.5px;color:var(--text2)')}>{ac.sub}</div></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* HR zones */}
      <div style={s('padding:22px 18px 0')}>
        <div style={s(label + ';margin-bottom:12px')}>Time in heart-rate zones</div>
        <div style={s('display:flex;flex-direction:column;gap:9px')}>
          {a.analysis.zones.map((z) => (
            <div key={z.z} style={s('display:flex;align-items:center;gap:10px')}>
              <div style={s('width:56px;flex:none')}><span className="mono" style={s(`font-size:12px;font-weight:700;color:${z.color}`)}>{z.z}</span> <span style={s('font-size:10px;color:var(--text3)')}>{z.label}</span></div>
              <div style={s('flex:1;height:16px;background:var(--bg3);border-radius:5px;overflow:hidden')}><div style={s(`height:100%;width:${z.pct}%;background:${z.color};border-radius:5px`)} /></div>
              <div className="mono" style={s('width:34px;text-align:right;font-size:12px;font-weight:600;flex:none')}>{z.pct}%</div>
            </div>
          ))}
        </div>
      </div>

      {/* power curve */}
      {a.hasPower && (
        <div style={s('padding:22px 18px 0')}>
          <div style={s(label + ';margin-bottom:12px')}>Peak power curve</div>
          <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:14px 14px 10px;display:flex;align-items:flex-end;gap:8px;height:112px')}>
            {a.analysis.powerCurve.map((p) => (
              <div key={p.t} style={s('flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:6px;height:100%')}>
                <div className="mono" style={s('font-size:11px;font-weight:700;color:var(--accent)')}>{p.w}</div>
                <div style={s(`width:100%;height:${p.h}px;border-radius:5px 5px 2px 2px;background:linear-gradient(180deg,var(--accent),color-mix(in srgb,var(--accent) 45%,transparent))`)} />
                <div className="mono" style={s('font-size:9px;color:var(--text3)')}>{p.t}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* laps */}
      {a.hasLaps && (
        <div style={s('padding:22px 18px 0')}>
          <div style={s(label + ';margin-bottom:12px')}>Laps</div>
          <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;overflow:hidden')}>
            <div style={s('display:flex;padding:9px 14px;border-bottom:1px solid var(--line);font-size:9.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;font-weight:600')}><span style={s('width:26px')}>#</span><span style={s('flex:1')}>Dist</span><span style={s('width:56px;text-align:right')}>Time</span><span style={s('width:46px;text-align:right')}>kph</span><span style={s('width:40px;text-align:right')}>W</span></div>
            {a.analysis.laps.map((l) => (
              <div key={l.n} style={s(`${l.rowBg};display:flex;padding:10px 14px;align-items:center;border-bottom:1px solid var(--line)`)}>
                <span className="mono" style={s(`width:26px;font-size:12px;font-weight:700;color:${l.bestColor}`)}>{l.n}</span>
                <span className="mono" style={s('flex:1;font-size:12.5px')}>{l.dist} km</span>
                <span className="mono" style={s('width:56px;text-align:right;font-size:12.5px;font-weight:600')}>{l.time}</span>
                <span className="mono" style={s('width:46px;text-align:right;font-size:12.5px;color:var(--text2)')}>{l.speed}</span>
                <span className="mono" style={s('width:40px;text-align:right;font-size:12.5px;color:var(--text2)')}>{l.pw}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* segment link */}
      {a.hasSegment && (
        <div style={s('padding:16px 18px 0')}>
          <div className="ctl" onClick={() => actions.go('seg')} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:12px 14px;display:flex;align-items:center;gap:12px')}>
            <div style={s('width:36px;height:36px;border-radius:11px;background:color-mix(in srgb,var(--bike) 16%,transparent);flex:none;display:flex;align-items:center;justify-content:center;font-size:16px')}>⛰️</div>
            <div style={s('flex:1')}><div style={s('font-size:13.5px;font-weight:600')}>1 segment on this ride</div><div style={s('font-size:11.5px;color:var(--text2)')}>Kaza Dam Climb · you ranked 2nd</div></div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
          </div>
        </div>
      )}

      {/* reactions */}
      <div style={s('padding:20px 18px 0')}>
        <div style={s('display:flex;align-items:center;gap:8px;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:10px 13px')}>
          <div style={s('display:flex')}>
            <div style={s('width:26px;height:26px;border-radius:50%;background:#ff9a4c;border:2px solid var(--bg2);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#0c0e11')}>NR</div>
            <div style={s('width:26px;height:26px;border-radius:50%;background:#5a86ff;border:2px solid var(--bg2);margin-left:-8px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff')}>TV</div>
            <div style={s('width:26px;height:26px;border-radius:50%;background:#4fe08b;border:2px solid var(--bg2);margin-left:-8px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#0c0e11')}>RG</div>
          </div>
          <span style={s('font-size:12px;color:var(--text2);flex:1')}>{a.reactText}</span>
          <div className="ctl" style={s('font-size:12px;font-weight:600;color:var(--accent)')}>React</div>
        </div>
      </div>

      {/* comments */}
      {a.comments > 0 && (
        <div style={s('padding:16px 18px 0;display:flex;flex-direction:column;gap:12px')}>
          <Comment av="NR" avBg="#ff9a4c" avColor="#0c0e11" name="Noa" time="2h" body="That climb at km 40 is brutal 😮‍💨 strong ride!" />
          {a.comments > 1 && <Comment av="C" avBg="linear-gradient(135deg,#37c0ff,#5a86ff)" avColor="#fff" name="Coach Ronen" time="1h" body="Great pacing on the back half. Negative split — exactly what we wanted." />}
        </div>
      )}

      {/* more feed */}
      <div style={s(label + ';margin:24px 18px 12px')}>More from your squad</div>
      <div style={s('display:flex;flex-direction:column;gap:10px;padding:0 18px')}>
        {vm.feed.map((f) => (
          <div key={f.id} className="ctl" onClick={() => (f.activityId ? actions.openActivity(f.activityId) : actions.openAthlete(f.athleteId))} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:13px 14px;display:flex;gap:12px;align-items:center')}>
            <div style={s(`width:40px;height:40px;border-radius:12px;background:${f.color};flex:none;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#0c0e11`)}>{f.initials}</div>
            <div style={s('flex:1;min-width:0')}><div style={s('font-size:13px;line-height:1.3')}><span style={s('font-weight:600')}>{f.name}</span> <span style={s('color:var(--text2)')}>{f.action}</span></div><div style={s('display:flex;gap:10px;margin-top:4px;align-items:center')}><span className="mono" style={s('font-size:11px')}>{f.metric}</span><span style={s('font-size:11px;color:var(--text3)')}>{f.time}</span></div></div>
            <div style={s(`width:30px;height:30px;border-radius:8px;background:color-mix(in srgb,${f.discColor} 16%,transparent);flex:none;display:flex;align-items:center;justify-content:center;font-size:14px`)}>{f.icon}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
