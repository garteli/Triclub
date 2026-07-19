import { s } from '../lib/style.js';

const BikeIcon = ({ size = 26, stroke = 'var(--bike)' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round">
    <circle cx="5.5" cy="17.5" r="3.5" /><circle cx="18.5" cy="17.5" r="3.5" />
    <path d="M15 17.5l-3-6.5H8.5m6.5 0l-2.5 6.5M9.5 6.5h3l2 4.5" />
  </svg>
);

const Chevron = ({ stroke = 'var(--accent)', w = 18 }) => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
);

function SquadRail({ squad, rtl }) {
  return (
    <div className="hscroll" style={s(`display:flex;gap:11px;overflow-x:auto;padding:2px 18px 6px;margin:0 -18px;${rtl ? 'flex-direction:row-reverse' : ''}`)}>
      {squad.map((m) => (
        <div key={m.id} style={s('flex:none;width:78px;background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:12px 8px;text-align:center')}>
          <div style={s('position:relative;width:52px;height:52px;margin:0 auto')}>
            <svg width="52" height="52" viewBox="0 0 52 52" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="26" cy="26" r="22" fill="none" stroke="var(--bg4)" strokeWidth="4" />
              <circle cx="26" cy="26" r="22" fill="none" stroke={m.ringColor} strokeWidth="4" strokeLinecap="round" strokeDasharray={m.dash} />
            </svg>
            <div style={s(`position:absolute;inset:5px;border-radius:50%;background:${m.color};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${rtl ? '13px' : '14px'};color:#0c0e11`)}>{rtl ? m.he : m.initials}</div>
            <div style={s(`position:absolute;bottom:2px;right:2px;width:12px;height:12px;border-radius:50%;background:${m.statusColor};border:2px solid var(--bg2)`)} />
          </div>
          <div style={s('font-size:11.5px;font-weight:600;margin-top:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{rtl ? m.nameHe : m.name}</div>
          <div className="mono" style={s('font-size:10.5px;color:var(--text3)')}>{m.pctLabel}</div>
        </div>
      ))}
    </div>
  );
}

function DashboardEN({ vm, state, go }) {
  const dashB = state.dashVar === 'b';
  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .4s ease')}>
      {/* header */}
      <div style={s('display:flex;align-items:center;justify-content:space-between;margin-bottom:18px')}>
        <div>
          <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.6px;font-weight:600')}>Domestique Club</div>
          <div style={s('font-size:23px;font-weight:700;letter-spacing:-.6px;line-height:1.05')}>Kaza Tri Club</div>
        </div>
        <div style={s('display:flex;align-items:center;gap:10px')}>
          <div style={s('width:38px;height:38px;border-radius:12px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;position:relative')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
            <div style={s('position:absolute;top:8px;right:9px;width:7px;height:7px;border-radius:50%;background:var(--accent);border:1.5px solid var(--bg2)')} />
          </div>
          <div style={s('width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,#ff6f61,#ffb84d);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#fff')}>DL</div>
        </div>
      </div>

      {/* VARIANT B: squad-first hero */}
      {dashB && (
        <div style={s('background:linear-gradient(160deg,var(--bg3),var(--bg2));border:1px solid var(--line);border-radius:22px;padding:18px;margin-bottom:14px')}>
          <div style={s('display:flex;gap:16px;align-items:center')}>
            <div style={s('position:relative;width:104px;height:104px;flex:none')}>
              <svg width="104" height="104" viewBox="0 0 104 104" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="52" cy="52" r="44" fill="none" stroke="var(--bg4)" strokeWidth="9" />
                <circle cx="52" cy="52" r="44" fill="none" stroke="var(--accent)" strokeWidth="9" strokeLinecap="round" strokeDasharray="205 276" />
              </svg>
              <div style={s('position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center')}>
                <div className="mono" style={s('font-size:30px;font-weight:700;line-height:1')}>74<span style={s('font-size:14px')}>%</span></div>
                <div style={s('font-size:8.5px;color:var(--text3);text-transform:uppercase;letter-spacing:1px')}>squad done</div>
              </div>
            </div>
            <div style={s('flex:1')}>
              <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.4px;font-weight:600')}>This week · Base block</div>
              <div style={s('font-size:19px;font-weight:700;letter-spacing:-.3px;margin-top:2px')}>Domestique Club is on pace</div>
              <div style={s('display:flex;gap:8px;margin-top:12px')}>
                <div style={s('flex:1;background:var(--bg);border:1px solid var(--line);border-radius:11px;padding:8px 9px')}><div className="mono" style={s('font-size:17px;font-weight:700;color:var(--good)')}>{vm.squadOnTrack}</div><div style={s('font-size:8.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px')}>On track</div></div>
                <div style={s('flex:1;background:var(--bg);border:1px solid var(--line);border-radius:11px;padding:8px 9px')}><div className="mono" style={s('font-size:17px;font-weight:700;color:var(--behind)')}>2</div><div style={s('font-size:8.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px')}>Behind</div></div>
                <div style={s('flex:1;background:var(--bg);border:1px solid var(--line);border-radius:11px;padding:8px 9px')}><div className="mono" style={s('font-size:17px;font-weight:700;color:var(--accent)')}>583</div><div style={s('font-size:8.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px')}>Load</div></div>
              </div>
            </div>
          </div>
          <div className="ctl" onClick={() => go('ride')} style={s('display:flex;align-items:center;gap:11px;background:var(--bg);border:1px solid color-mix(in srgb,var(--bike) 35%,transparent);border-radius:14px;padding:11px 13px;margin-top:14px')}>
            <div style={s('width:38px;height:38px;border-radius:11px;background:color-mix(in srgb,var(--bike) 18%,transparent);flex:none;display:flex;align-items:center;justify-content:center')}><BikeIcon size={22} /></div>
            <div style={s('flex:1')}><div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600')}>Today · Tue</div><div style={s('font-size:14.5px;font-weight:700')}>Bike · Threshold 3×12′</div></div>
            <div className="mono" style={s('font-size:12px;color:var(--text2)')}>1:15</div>
            <Chevron />
          </div>
        </div>
      )}

      {/* VARIANT A: block banner + today hero */}
      {!dashB && (
        <>
          <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:20px;padding:16px 17px;margin-bottom:14px;position:relative;overflow:hidden')}>
            <div style={s('position:absolute;right:-30px;top:-30px;width:120px;height:120px;border-radius:50%;background:var(--accent-dim);filter:blur(6px)')} />
            <div style={s('display:flex;justify-content:space-between;align-items:flex-start;position:relative')}>
              <div>
                <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.4px;font-weight:600')}>Current block</div>
                <div style={s('font-size:18px;font-weight:700;letter-spacing:-.3px')}>Base · Endurance</div>
              </div>
              <div style={s('text-align:right')}>
                <div className="mono" style={s('font-size:11px;color:var(--text2)')}>WK <span style={s('color:var(--accent);font-weight:700')}>03</span> / 12</div>
                <div style={s('font-size:10.5px;color:var(--text3);margin-top:2px')}>Tiberias 70.3 · <span style={s('color:var(--text)')}>42d</span></div>
              </div>
            </div>
            <div style={s('height:7px;border-radius:4px;background:var(--bg4);margin-top:13px;overflow:hidden;position:relative')}>
              <div style={s('position:absolute;inset:0;width:25%;background:linear-gradient(90deg,var(--accent),color-mix(in srgb,var(--accent) 60%, #fff));border-radius:4px')} />
              <div style={s('position:absolute;left:25%;top:-2px;width:2px;height:11px;background:var(--text);opacity:.5')} />
            </div>
          </div>

          <div style={s('font-size:12px;color:var(--text3);text-transform:uppercase;letter-spacing:1.4px;font-weight:600;margin:20px 2px 10px')}>Today · Tue</div>
          <div style={s('background:linear-gradient(160deg,var(--bg3),var(--bg2));border:1px solid var(--line);border-radius:22px;padding:0;overflow:hidden;position:relative')}>
            <div style={s('height:4px;background:var(--bike)')} />
            <div style={s('padding:17px 18px 18px')}>
              <div style={s('display:flex;justify-content:space-between;align-items:flex-start')}>
                <div style={s('display:flex;gap:12px;align-items:center')}>
                  <div style={s('width:46px;height:46px;border-radius:14px;background:color-mix(in srgb,var(--bike) 18%, transparent);display:flex;align-items:center;justify-content:center')}><BikeIcon /></div>
                  <div>
                    <div style={s('font-size:19px;font-weight:700;letter-spacing:-.4px')}>Bike · Threshold</div>
                    <div style={s('font-size:13px;color:var(--text2)')}>3 × 12′ @ FTP · Zone 4</div>
                  </div>
                </div>
                <div style={s('background:var(--bike);color:#1a1405;font-size:10px;font-weight:700;padding:4px 8px;border-radius:7px;text-transform:uppercase;letter-spacing:.5px')}>Key</div>
              </div>
              <div style={s('display:flex;gap:0;margin-top:16px;border-top:1px solid var(--line);padding-top:14px')}>
                <div style={s('flex:1')}><div className="mono" style={s('font-size:20px;font-weight:700')}>1:15</div><div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;margin-top:2px')}>Duration</div></div>
                <div style={s('flex:1;border-left:1px solid var(--line);padding-left:14px')}><div className="mono" style={s('font-size:20px;font-weight:700')}>~42<span style={s('font-size:12px;color:var(--text2)')}>km</span></div><div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;margin-top:2px')}>Distance</div></div>
                <div style={s('flex:1;border-left:1px solid var(--line);padding-left:14px')}><div className="mono" style={s('font-size:20px;font-weight:700;color:var(--accent)')}>78</div><div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;margin-top:2px')}>Load</div></div>
              </div>
              <div style={s('background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin-top:14px;display:flex;gap:9px;align-items:flex-start')}>
                <div style={s('width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#37c0ff,#5a86ff);flex:none;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff')}>C</div>
                <div style={s('font-size:12px;color:var(--text2);line-height:1.45')}><span style={s('color:var(--text);font-weight:600')}>Coach Ronen:</span> Hold the last interval — don't fade. Cadence 90+.</div>
              </div>
              <div style={s('display:flex;gap:9px;margin-top:14px')}>
                <div className="ctl" onClick={() => go('ride')} style={s('flex:1;background:var(--accent);color:var(--accent-ink);text-align:center;padding:13px;border-radius:13px;font-weight:700;font-size:14px')}>Start session</div>
                <div className="ctl" onClick={() => go('plan')} style={s('width:52px;background:var(--bg4);border:1px solid var(--line);border-radius:13px;display:flex;align-items:center;justify-content:center')}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* squad status */}
      <div style={s('display:flex;justify-content:space-between;align-items:baseline;margin:22px 2px 12px')}>
        <div style={s('font-size:12px;color:var(--text3);text-transform:uppercase;letter-spacing:1.4px;font-weight:600')}>Domestique Club this week</div>
        <div className="ctl" onClick={() => go('lb')} style={s('font-size:11.5px;color:var(--accent);font-weight:600')}>Leaderboard →</div>
      </div>
      <SquadRail squad={vm.squad} />

      {/* team feed */}
      <div style={s('display:flex;justify-content:space-between;align-items:baseline;margin:20px 2px 12px')}>
        <div style={s('font-size:12px;color:var(--text3);text-transform:uppercase;letter-spacing:1.4px;font-weight:600')}>Domestique Club activity</div>
        <div className="ctl" onClick={() => go('feed')} style={s('font-size:11.5px;color:var(--accent);font-weight:600')}>See all →</div>
      </div>
      <div style={s('display:flex;flex-direction:column;gap:10px')}>
        {vm.feed.map((f) => (
          <div key={f.id} className="ctl" onClick={() => go('feed')} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:13px 14px;display:flex;gap:12px;align-items:center')}>
            <div style={s(`width:40px;height:40px;border-radius:12px;background:${f.color};flex:none;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#0c0e11`)}>{f.initials}</div>
            <div style={s('flex:1;min-width:0')}>
              <div style={s('font-size:13px;line-height:1.3')}><span style={s('font-weight:600')}>{f.name}</span> <span style={s('color:var(--text2)')}>{f.action}</span></div>
              <div style={s('display:flex;gap:10px;margin-top:4px;align-items:center')}>
                <span className="mono" style={s('font-size:11px;color:var(--text)')}>{f.metric}</span>
                <span style={s('font-size:11px;color:var(--text3)')}>{f.time}</span>
                <span style={s('font-size:11px;color:var(--text3)')}>· ♥ {f.reacts}</span>
              </div>
            </div>
            <div style={s(`width:30px;height:30px;border-radius:8px;background:color-mix(in srgb,${f.discColor} 16%, transparent);flex:none;display:flex;align-items:center;justify-content:center;font-size:14px`)}>{f.icon}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardHE({ vm, go }) {
  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .4s ease;text-align:right')}>
      <div style={s('display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-direction:row-reverse')}>
        <div>
          <div style={s('font-size:11px;color:var(--text3);letter-spacing:.5px;font-weight:600')}>המועדון</div>
          <div style={s('font-size:23px;font-weight:700;letter-spacing:-.3px;line-height:1.05')}>מועדון קזא טרייתלון</div>
        </div>
        <div style={s('display:flex;align-items:center;gap:10px;flex-direction:row-reverse')}>
          <div style={s('width:38px;height:38px;border-radius:12px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;position:relative')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
            <div style={s('position:absolute;top:8px;right:9px;width:7px;height:7px;border-radius:50%;background:var(--accent);border:1.5px solid var(--bg2)')} />
          </div>
          <div style={s('width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,#ff6f61,#ffb84d);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#fff')}>דל</div>
        </div>
      </div>

      <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:20px;padding:16px 17px;margin-bottom:14px;position:relative;overflow:hidden')}>
        <div style={s('display:flex;justify-content:space-between;align-items:flex-start;flex-direction:row-reverse')}>
          <div>
            <div style={s('font-size:11px;color:var(--text3);font-weight:600')}>הבלוק הנוכחי</div>
            <div style={s('font-size:18px;font-weight:700')}>בסיס · סיבולת</div>
          </div>
          <div style={s('text-align:left')}>
            <div className="mono" style={s('font-size:11px;color:var(--text2)')} dir="ltr">WK <span style={s('color:var(--accent);font-weight:700')}>03</span> / 12</div>
            <div style={s('font-size:10.5px;color:var(--text3);margin-top:2px')}>טבריה 70.3 · <span style={s('color:var(--text)')}>42 ימים</span></div>
          </div>
        </div>
        <div style={s('height:7px;border-radius:4px;background:var(--bg4);margin-top:13px;overflow:hidden;position:relative')}>
          <div style={s('position:absolute;inset:0;right:0;width:25%;background:linear-gradient(90deg,var(--accent),color-mix(in srgb,var(--accent) 60%, #fff));border-radius:4px;margin-left:auto')} />
        </div>
      </div>

      <div style={s('font-size:12px;color:var(--text3);letter-spacing:.5px;font-weight:600;margin:20px 2px 10px')}>היום · יום ג׳</div>
      <div style={s('background:linear-gradient(160deg,var(--bg3),var(--bg2));border:1px solid var(--line);border-radius:22px;overflow:hidden')}>
        <div style={s('height:4px;background:var(--bike)')} />
        <div style={s('padding:17px 18px 18px')}>
          <div style={s('display:flex;justify-content:space-between;align-items:flex-start;flex-direction:row-reverse')}>
            <div style={s('display:flex;gap:12px;align-items:center;flex-direction:row-reverse')}>
              <div style={s('width:46px;height:46px;border-radius:14px;background:color-mix(in srgb,var(--bike) 18%, transparent);display:flex;align-items:center;justify-content:center')}><BikeIcon /></div>
              <div style={s('text-align:right')}>
                <div style={s('font-size:19px;font-weight:700')}>אופניים · סף</div>
                <div style={s('font-size:13px;color:var(--text2)')}>3 × 12′ בעוצמת סף · אזור 4</div>
              </div>
            </div>
            <div style={s('background:var(--bike);color:#1a1405;font-size:10px;font-weight:700;padding:4px 8px;border-radius:7px')}>אימון מפתח</div>
          </div>
          <div style={s('display:flex;margin-top:16px;border-top:1px solid var(--line);padding-top:14px;flex-direction:row-reverse;text-align:right')}>
            <div style={s('flex:1')}><div className="mono" style={s('font-size:20px;font-weight:700')}>1:15</div><div style={s('font-size:10px;color:var(--text3);margin-top:2px')}>משך</div></div>
            <div style={s('flex:1;border-right:1px solid var(--line);padding-right:14px')}><div className="mono" style={s('font-size:20px;font-weight:700')}>42<span style={s('font-size:12px;color:var(--text2)')}>ק״מ</span></div><div style={s('font-size:10px;color:var(--text3);margin-top:2px')}>מרחק</div></div>
            <div style={s('flex:1;border-right:1px solid var(--line);padding-right:14px')}><div className="mono" style={s('font-size:20px;font-weight:700;color:var(--accent)')}>78</div><div style={s('font-size:10px;color:var(--text3);margin-top:2px')}>עומס</div></div>
          </div>
          <div className="ctl" onClick={() => go('ride')} style={s('background:var(--accent);color:var(--accent-ink);text-align:center;padding:13px;border-radius:13px;font-weight:700;font-size:14px;margin-top:14px')}>התחל אימון</div>
        </div>
      </div>

      <div style={s('display:flex;justify-content:space-between;align-items:baseline;margin:22px 2px 12px;flex-direction:row-reverse')}>
        <div style={s('font-size:12px;color:var(--text3);font-weight:600')}>המועדון השבוע</div>
        <div className="ctl" onClick={() => go('lb')} style={s('font-size:11.5px;color:var(--accent);font-weight:600')}>← טבלה</div>
      </div>
      <SquadRail squad={vm.squad} rtl />

      <div style={s('font-size:12px;color:var(--text3);font-weight:600;margin:20px 2px 12px')}>פעילות המועדון</div>
      <div style={s('display:flex;flex-direction:column;gap:10px')}>
        {vm.feed.map((f) => (
          <div key={f.id} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:13px 14px;display:flex;gap:12px;align-items:center;flex-direction:row-reverse;text-align:right')}>
            <div style={s(`width:40px;height:40px;border-radius:12px;background:${f.color};flex:none;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#0c0e11`)}>{f.he}</div>
            <div style={s('flex:1;min-width:0')}>
              <div style={s('font-size:13px;line-height:1.3')}><span style={s('font-weight:600')}>{f.nameHe}</span> <span style={s('color:var(--text2)')}>{f.actionHe}</span></div>
              <div style={s('display:flex;gap:10px;margin-top:4px;align-items:center;flex-direction:row-reverse')}><span className="mono" style={s('font-size:11px')} dir="ltr">{f.metric}</span><span style={s('font-size:11px;color:var(--text3)')}>{f.timeHe}</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard({ vm, state, actions }) {
  return state.lang === 'he'
    ? <DashboardHE vm={vm} go={actions.go} />
    : <DashboardEN vm={vm} state={state} go={actions.go} />;
}
