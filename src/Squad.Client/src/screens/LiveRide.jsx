import { s } from '../lib/style.js';
import LiveRideMap from '../components/LiveRideMap.jsx';
import RideRecorder from '../components/RideRecorder.jsx';

const Back = ({ onClick }) => (
  <div className="ctl" onClick={onClick} style={s('width:34px;height:34px;border-radius:10px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center')}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg>
  </div>
);

function Lobby({ vm, actions, live }) {
  return (
    <div style={s('padding:6px 18px 120px')}>
      <div style={s('display:flex;align-items:center;gap:10px;margin-bottom:6px')}>
        <Back onClick={() => actions.go('dash')} />
        <div style={s('display:flex;align-items:center;gap:7px')}><span style={s('width:8px;height:8px;border-radius:50%;background:var(--accent);animation:pulseDot 1.4s infinite')} /><span style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.4px;font-weight:600')}>Ride starting soon</span></div>
      </div>
      <div style={s('font-size:26px;font-weight:700;letter-spacing:-.6px;margin-top:6px')}>Tuesday Threshold</div>
      <div style={s('font-size:13px;color:var(--text2);margin-top:2px')}>Group ride · led by Coach Ronen</div>

      {/* route preview */}
      <div style={s('margin-top:16px;border-radius:20px;overflow:hidden;border:1px solid var(--line);background:var(--bg2);position:relative')}>
        <svg viewBox="0 0 344 150" style={{ width: '100%', display: 'block' }}>
          <defs><linearGradient id="lobRoute" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--accent)" /><stop offset="1" stopColor="var(--swim)" /></linearGradient></defs>
          <rect width="344" height="150" fill="var(--bg3)" />
          <path d="M20,120 C40,60 90,70 120,90 C150,110 180,40 220,45 C270,52 300,90 324,60" fill="none" stroke="var(--line2)" strokeWidth="8" strokeLinecap="round" />
          <path d="M20,120 C40,60 90,70 120,90 C150,110 180,40 220,45 C270,52 300,90 324,60" fill="none" stroke="url(#lobRoute)" strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="20" cy="120" r="6" fill="var(--good)" stroke="var(--bg2)" strokeWidth="2" />
          <circle cx="324" cy="60" r="6" fill="var(--bad)" stroke="var(--bg2)" strokeWidth="2" />
        </svg>
        <div style={s('position:absolute;bottom:0;left:0;right:0;display:flex;background:linear-gradient(0deg,var(--bg2),transparent);padding:22px 14px 12px')}>
          <div style={s('flex:1')}><div className="mono" style={s('font-size:16px;font-weight:700')}>42.0<span style={s('font-size:11px;color:var(--text2)')}>km</span></div><div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px')}>Distance</div></div>
          <div style={s('flex:1')}><div className="mono" style={s('font-size:16px;font-weight:700')}>480<span style={s('font-size:11px;color:var(--text2)')}>m</span></div><div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px')}>Elevation</div></div>
          <div style={s('flex:1')}><div className="mono" style={s('font-size:16px;font-weight:700;color:var(--accent)')}>~1:15</div><div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px')}>Est. time</div></div>
        </div>
      </div>

      {/* countdown */}
      <div style={s('display:flex;align-items:center;justify-content:space-between;background:var(--accent-dim);border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);border-radius:16px;padding:14px 16px;margin-top:14px')}>
        <div><div style={s('font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:1px;font-weight:600')}>Rolling out in</div><div className="mono" style={s('font-size:24px;font-weight:700;color:var(--accent);line-height:1.1')}>02:00</div></div>
        <div style={s('text-align:right')}><div className="mono" style={s('font-size:15px;font-weight:700')}>6 <span style={s('font-size:11px;color:var(--text2)')}>/ 8</span></div><div style={s('font-size:10.5px;color:var(--text3)')}>squad ready</div></div>
      </div>

      {/* roster */}
      <div style={s('font-size:12px;color:var(--text3);text-transform:uppercase;letter-spacing:1.4px;font-weight:600;margin:20px 2px 12px')}>Who's in</div>
      <div style={s('display:grid;grid-template-columns:repeat(4,1fr);gap:10px')}>
        {vm.rideRiders.map((r) => (
          <div key={r.name} style={s('text-align:center')}>
            <div style={s('position:relative;width:52px;height:52px;margin:0 auto')}>
              <div style={s(`width:52px;height:52px;border-radius:16px;background:${r.color};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;color:#0c0e11`)}>{r.initials}</div>
              <div style={s('position:absolute;bottom:-3px;right:-3px;width:18px;height:18px;border-radius:50%;background:var(--good);border:2.5px solid var(--bg);display:flex;align-items:center;justify-content:center')}><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#0c0e11" strokeWidth="4" strokeLinecap="round"><path d="M4 12l5 5 11-11" /></svg></div>
            </div>
            <div style={s('font-size:11px;font-weight:600;margin-top:6px')}>{r.name}</div>
          </div>
        ))}
        <div style={s('text-align:center')}>
          <div style={s('width:52px;height:52px;margin:0 auto;border-radius:16px;border:1.5px dashed var(--line2);display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:22px')}>+</div>
          <div style={s('font-size:11px;color:var(--text3);margin-top:6px')}>Invite</div>
        </div>
      </div>

      <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin-top:16px;display:flex;gap:10px;align-items:flex-start')}>
        <div style={s('width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#37c0ff,#5a86ff);flex:none;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff')}>C</div>
        <div style={s('font-size:12px;color:var(--text2);line-height:1.45')}><span style={s('color:var(--text);font-weight:600')}>Coach Ronen:</span> Neutral roll for 10′, then we hit the 3 threshold blocks together. Regroup at the top of each climb.</div>
      </div>

      <div className="ctl" onClick={actions.startRide} style={s('background:var(--accent);color:var(--accent-ink);text-align:center;padding:15px;border-radius:15px;font-weight:700;font-size:15px;margin-top:16px;box-shadow:0 8px 22px -8px color-mix(in srgb,var(--accent) 60%,transparent)')}>Join the ride</div>

      <RideRecorder pushTelemetry={live?.pushTelemetry} />
    </div>
  );
}

// One animated rider on the loop route (SMIL survives re-render, like the prototype).
function Rider({ begin, fill, textFill, label, dashed, you }) {
  const r = you ? 12 : 11;
  const off = you ? -15 : -13;
  const c = you ? 15 : 13;
  return (
    <g>
      <animateMotion dur="44s" repeatCount="indefinite" begin={begin}><mpath href="#rideRoute" /></animateMotion>
      <g transform={`translate(${off},${off})`}>
        {you && <circle cx="15" cy="15" r="14" fill="none" stroke="var(--accent)" strokeWidth="2" opacity=".5"><animate attributeName="r" values="13;16;13" dur="2s" repeatCount="indefinite" /></circle>}
        <circle cx={c} cy={c} r={r} fill={fill} stroke={you ? 'var(--bg)' : dashed ? 'var(--behind)' : 'var(--bg)'} strokeWidth="2.5" strokeDasharray={dashed ? '3 2' : undefined} />
        <text x={c} y={c + 4} textAnchor="middle" fontSize="9" fontWeight="700" fill={textFill} fontFamily="'JetBrains Mono',monospace">{label}</text>
      </g>
    </g>
  );
}

function ActiveMap({ vm }) {
  return (
    <div style={s('position:relative;margin:0 12px;border-radius:22px;overflow:hidden;border:1px solid var(--line2);background:radial-gradient(120% 100% at 50% 0%, var(--bg3), var(--bg))')}>
      <svg viewBox="0 0 344 280" style={{ width: '100%', display: 'block' }}>
        <defs>
          <radialGradient id="glow" cx="50%" cy="45%" r="60%"><stop offset="0" stopColor="color-mix(in srgb,var(--accent) 20%,transparent)" /><stop offset="1" stopColor="transparent" /></radialGradient>
          <linearGradient id="routeg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--accent)" /><stop offset="1" stopColor="var(--swim)" /></linearGradient>
        </defs>
        <rect width="344" height="280" fill="url(#glow)" />
        <g stroke="var(--line)" strokeWidth="1"><path d="M0,70 H344 M0,140 H344 M0,210 H344 M86,0 V280 M172,0 V280 M258,0 V280" /></g>
        <path id="rideRoute" d="M28,232 C24,168 66,140 110,142 C156,144 168,86 210,78 C258,69 306,92 314,140 C321,182 280,204 236,202 C186,200 156,238 108,244 C68,249 34,248 28,232 Z" fill="none" stroke="var(--line2)" strokeWidth="9" strokeLinecap="round" />
        <path d="M28,232 C24,168 66,140 110,142 C156,144 168,86 210,78 C258,69 306,92 314,140 C321,182 280,204 236,202 C186,200 156,238 108,244 C68,249 34,248 28,232 Z" fill="none" stroke="url(#routeg)" strokeWidth="3" strokeLinecap="round" strokeDasharray="4 7" opacity=".9" />
        <Rider begin="-3.4s" fill="#5a86ff" textFill="#fff" label="TV" />
        <Rider begin="-2.9s" fill="#4fe08b" textFill="#0c0e11" label="RG" />
        <Rider begin="-2.5s" fill="#37c0ff" textFill="#0c0e11" label="AB" />
        <Rider begin="-2.1s" fill="#c68bff" textFill="#0c0e11" label="MK" />
        <Rider begin="-1.7s" fill="#ff9a4c" textFill="#0c0e11" label="NR" />
        <Rider begin="-8.5s" fill="#ff6f61" textFill="#fff" label="YS" dashed />
        <Rider begin="-2.3s" fill="var(--accent)" textFill="#141a05" label="YOU" you />
      </svg>
      {/* regroup indicator */}
      <div style={s('position:absolute;top:12px;left:12px;background:color-mix(in srgb,var(--behind) 22%, var(--bg));border:1px solid color-mix(in srgb,var(--behind) 50%,transparent);border-radius:12px;padding:8px 11px;display:flex;align-items:center;gap:8px;backdrop-filter:blur(8px)')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--behind)" strokeWidth="2.2" strokeLinecap="round"><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
        <div><div style={s('font-size:11.5px;font-weight:700;color:var(--behind);line-height:1.1')}>Yoav dropped</div><div className="mono" style={s('font-size:10px;color:var(--text2)')}>{vm.gapMeters}m back</div></div>
      </div>
      <div style={s('position:absolute;top:12px;right:12px;background:color-mix(in srgb,var(--bg2) 80%,transparent);border:1px solid var(--line);border-radius:11px;padding:7px 10px;backdrop-filter:blur(8px);text-align:center')}><div className="mono" style={s('font-size:13px;font-weight:700;color:var(--good)')}>6 up</div><div style={s('font-size:8.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px')}>pack</div></div>
      <div className="ctl" style={s('position:absolute;bottom:12px;right:12px;background:var(--accent);color:var(--accent-ink);border-radius:11px;padding:9px 13px;font-size:12px;font-weight:700;box-shadow:0 6px 16px -6px rgba(0,0,0,.5)')}>Regroup ping</div>
    </div>
  );
}

function ActiveList({ riders }) {
  return (
    <>
      <div style={s('display:flex;justify-content:space-between;align-items:baseline;margin:18px 18px 10px')}><div style={s('font-size:12px;color:var(--text3);text-transform:uppercase;letter-spacing:1.4px;font-weight:600')}>Live riders</div><div className="mono" style={s('font-size:11px;color:var(--text2)')}>avg 33.8 kph</div></div>
      <div style={s('display:flex;flex-direction:column;gap:7px;padding:0 12px')}>
        {riders.map((r) => (
          <div key={r.athleteId ?? r.name} style={s(`${r.rowBg};border-radius:14px;padding:9px 11px;display:flex;align-items:center;gap:11px`)}>
            <div style={s(`width:34px;height:34px;border-radius:11px;background:${r.color};flex:none;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:#0c0e11`)}>{r.initials}</div>
            <div style={s('flex:1;min-width:0')}>
              <div style={s('display:flex;align-items:center;gap:6px')}><span style={s('font-size:13px;font-weight:600')}>{r.name}</span>{r.dropped && <span style={s('font-size:9px;font-weight:700;color:var(--behind);background:color-mix(in srgb,var(--behind) 18%,transparent);padding:1px 5px;border-radius:5px;text-transform:uppercase')}>Gap</span>}</div>
              <div style={s('height:4px;background:var(--bg4);border-radius:3px;margin-top:5px;overflow:hidden')}><div style={s(`height:100%;width:${r.hrPct}%;background:${r.hrColor};border-radius:3px`)} /></div>
            </div>
            <div style={s('text-align:right;flex:none;width:52px')}><div className="mono" style={s('font-size:14px;font-weight:700')}>{r.spd}</div><div style={s('font-size:8.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px')}>kph</div></div>
            <div style={s('text-align:right;flex:none;width:52px')}><div className="mono" style={s(`font-size:14px;font-weight:700;color:${r.hrColor}`)}>{r.hr}</div><div style={s('font-size:8.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px')}>bpm</div></div>
          </div>
        ))}
      </div>
    </>
  );
}

function ActiveFocus({ you, riders, gapMeters }) {
  return (
    <div style={s('padding:0 16px')}>
      <div style={s('background:linear-gradient(160deg,var(--bg3),var(--bg2));border:1px solid var(--line2);border-radius:22px;padding:20px 18px;position:relative;overflow:hidden')}>
        <div style={s('position:absolute;right:-40px;top:-40px;width:150px;height:150px;border-radius:50%;background:var(--accent-dim);filter:blur(10px)')} />
        <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.6px;font-weight:600')}>Your live effort</div>
        <div style={s('display:flex;align-items:flex-end;gap:6px;margin-top:4px')}><div className="mono" style={s('font-size:60px;font-weight:700;line-height:.9;letter-spacing:-2px')}>{you.spd}</div><div style={s('font-size:15px;color:var(--text2);font-weight:600;margin-bottom:9px')}>kph</div></div>
        <div style={s('display:flex;gap:10px;margin-top:18px')}>
          <div style={s('flex:1;background:var(--bg);border:1px solid var(--line);border-radius:14px;padding:11px 12px')}><div className="mono" style={s(`font-size:22px;font-weight:700;color:${you.hrColor}`)}>{you.hr}</div><div style={s('font-size:9.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px')}>Heart rate</div></div>
          <div style={s('flex:1;background:var(--bg);border:1px solid var(--line);border-radius:14px;padding:11px 12px')}><div className="mono" style={s('font-size:22px;font-weight:700')}>287</div><div style={s('font-size:9.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px')}>Power W</div></div>
          <div style={s('flex:1;background:var(--bg);border:1px solid var(--line);border-radius:14px;padding:11px 12px')}><div className="mono" style={s('font-size:22px;font-weight:700')}>91</div><div style={s('font-size:9.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px')}>Cadence</div></div>
        </div>
      </div>
      <div style={s('display:flex;gap:10px;margin-top:12px')}>
        <div style={s('flex:1;border-radius:16px;overflow:hidden;border:1px solid var(--line);background:var(--bg2)')}>
          <svg viewBox="0 0 160 96" style={{ width: '100%', display: 'block' }}>
            <rect width="160" height="96" fill="var(--bg3)" />
            <path d="M14,78 C10,44 34,32 58,36 C86,40 92,20 112,22 C138,24 150,44 148,60" fill="none" stroke="var(--line2)" strokeWidth="5" strokeLinecap="round" />
            <path d="M14,78 C10,44 34,32 58,36 C86,40 92,20 112,22 C138,24 150,44 148,60" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" />
            <circle cx="92" cy="21" r="5" fill="var(--accent)" stroke="var(--bg2)" strokeWidth="2" />
            <circle cx="112" cy="22" r="4" fill="#ff9a4c" stroke="var(--bg2)" strokeWidth="1.5" />
            <circle cx="34" cy="34" r="4" fill="var(--behind)" stroke="var(--bg2)" strokeWidth="1.5" />
          </svg>
        </div>
        <div style={s('flex:1;background:color-mix(in srgb,var(--behind) 14%,var(--bg2));border:1px solid color-mix(in srgb,var(--behind) 35%,transparent);border-radius:16px;padding:12px;display:flex;flex-direction:column;justify-content:center')}>
          <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600')}>Regroup</div>
          <div style={s('font-size:14px;font-weight:700;color:var(--behind);margin-top:3px')}>Yoav is off the back</div>
          <div className="mono" style={s('font-size:19px;font-weight:700;margin-top:4px')}>{gapMeters}m</div>
          <div className="ctl" style={s('margin-top:8px;background:var(--behind);color:#1a0d06;text-align:center;padding:7px;border-radius:9px;font-size:11px;font-weight:700')}>Soft-pedal</div>
        </div>
      </div>
      <div className="hscroll" style={s('display:flex;gap:8px;overflow-x:auto;margin:14px -16px 0;padding:0 16px')}>
        {riders.map((r) => (
          <div key={r.athleteId ?? r.name} style={s('flex:none;width:64px;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:9px 6px;text-align:center')}>
            <div style={s(`width:30px;height:30px;border-radius:9px;background:${r.color};margin:0 auto;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;color:#0c0e11`)}>{r.initials}</div>
            <div className="mono" style={s('font-size:12px;font-weight:700;margin-top:6px')}>{r.spd}</div>
            <div className="mono" style={s(`font-size:10px;color:${r.hrColor}`)}>{r.hr}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Active({ vm, state, actions, live }) {
  // Live telemetry when a ride feed is connected; otherwise the local simulation.
  const isLive = !!live?.riders?.length;
  const riders = isLive ? live.riders : vm.rideRiders;
  const you = riders.find((r) => r.you) || riders[0];

  return (
    <div style={s('padding:6px 0 120px')}>
      <div style={s('display:flex;align-items:center;justify-content:space-between;padding:2px 18px 12px')}>
        <div style={s('display:flex;align-items:center;gap:9px')}>
          <Back onClick={actions.backToLobby} />
          <div style={s('display:flex;align-items:center;gap:6px')}><span style={s('width:8px;height:8px;border-radius:50%;background:var(--bad);animation:pulseDot 1.1s infinite')} /><span style={s('font-size:11px;font-weight:700;letter-spacing:1.4px;color:var(--bad);text-transform:uppercase')}>Live</span></div>
        </div>
        <div style={s('text-align:center')}><div className="mono" style={s('font-size:22px;font-weight:700;line-height:1')}>{vm.rideTimer}</div><div style={s('font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1.5px')}>Elapsed</div></div>
        <div style={s('text-align:right')}><div className="mono" style={s('font-size:16px;font-weight:700;color:var(--accent)')}>{you.dist}<span style={s('font-size:10px;color:var(--text2)')}>km</span></div><div style={s('font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1px')}>Your dist</div></div>
      </div>

      {state.rideVar === 'a' ? (
        <>
          {isLive ? <LiveRideMap riders={live.riders} route={live.route} /> : <ActiveMap vm={vm} />}
          <ActiveList riders={riders} />
        </>
      ) : (
        <ActiveFocus you={you} riders={riders} gapMeters={vm.gapMeters} />
      )}
    </div>
  );
}

export default function LiveRide({ vm, state, actions, live }) {
  return (
    <div style={s('animation:floatUp .35s ease')}>
      {state.rideState === 'lobby' ? <Lobby vm={vm} actions={actions} live={live} /> : <Active vm={vm} state={state} actions={actions} live={live} />}
    </div>
  );
}
