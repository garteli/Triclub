import { s } from '../lib/style.js';
import RideRecorder from '../components/RideRecorder.jsx';
import LivePages from '../components/LivePages.jsx';
import TileMap from '../components/TileMap.jsx';
import { toPathD } from '../lib/tiles.js';
import { RIDE_ROUTE } from '../data/course.js';
import { gearComponents } from '../lib/liveMetrics.js';

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
      <div style={s('font-size:13px;color:var(--text2);margin-top:2px')}>Group ride · led by your coach</div>

      {/* route preview */}
      <div style={s('margin-top:16px;border-radius:20px;overflow:hidden;border:1px solid var(--line);background:var(--bg2);position:relative')}>
        <TileMap points={RIDE_ROUTE} W={344} H={150} radius={20}>
          {(project) => {
            const d = toPathD(RIDE_ROUTE, project);
            const start = project(RIDE_ROUTE[0][0], RIDE_ROUTE[0][1]);
            return (
              <>
                <path d={d} fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
                <path d={d} fill="none" stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx={start.x} cy={start.y} r="6" fill="var(--good)" stroke="#fff" strokeWidth="2.5" />
              </>
            );
          }}
        </TileMap>
        <div style={s('position:absolute;bottom:0;left:0;right:0;display:flex;background:linear-gradient(0deg,var(--bg2),transparent);padding:22px 14px 12px;pointer-events:none')}>
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
        <div style={s('font-size:12px;color:var(--text2);line-height:1.45')}><span style={s('color:var(--text);font-weight:600')}>Coach:</span> Neutral roll for 10′, then we hit the 3 threshold blocks together. Regroup at the top of each climb.</div>
      </div>

      <RideRecorder pushTelemetry={live?.pushTelemetry} />

      {/* Bike & gear — connected components with live battery bars */}
      <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:14px;margin-top:14px')}>
        <div style={s('display:flex;align-items:center;justify-content:space-between;margin-bottom:11px')}>
          <div style={s('display:flex;align-items:center;gap:8px')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2" strokeLinecap="round"><circle cx="5.5" cy="17.5" r="3.5" /><circle cx="18.5" cy="17.5" r="3.5" /><path d="M15 17.5l-3-6.5H8.5m6.5 0l-2.5 6.5M9.5 6.5h3l2 4.5" /></svg>
            <span style={s('font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--text2)')}>Bike & gear</span>
          </div>
          <span style={s('font-size:10px;color:var(--good);font-weight:700')}>5 connected</span>
        </div>
        <div style={s('display:flex;flex-direction:column;gap:10px')}>
          {gearComponents.map((c) => (
            <div key={c.name} style={s('display:flex;align-items:center;gap:10px')}>
              <span style={s('width:8px;height:8px;border-radius:50%;background:var(--good);flex:none')} />
              <div style={s('flex:1;min-width:0')}>
                <div style={s('font-size:12.5px;font-weight:600')}>{c.name}</div>
                <div style={s('font-size:10px;color:var(--text3)')}>{c.sub}</div>
              </div>
              <div style={s('display:flex;align-items:center;gap:7px;flex:none')}>
                <div style={s('width:34px;height:6px;border-radius:3px;background:var(--bg4);overflow:hidden')}><div style={s(`height:100%;width:${c.battW};background:${c.battColor};border-radius:3px`)} /></div>
                <span className="mono" style={s(`font-size:11px;font-weight:700;color:${c.battColor};width:30px;text-align:right`)}>{c.battLabel}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="ctl" onClick={() => actions.go('sensors')} style={s('margin-top:12px;text-align:center;padding:9px;border-radius:11px;font-size:12px;font-weight:700;background:var(--bg3);border:1px dashed var(--line2);color:var(--text2)')}>+ Pair a component</div>
      </div>

      <div className="ctl" onClick={actions.startRide} style={s('background:var(--accent);color:var(--accent-ink);text-align:center;padding:15px;border-radius:15px;font-weight:700;font-size:15px;margin-top:16px;box-shadow:0 8px 22px -8px color-mix(in srgb,var(--accent) 60%,transparent)')}>Join the ride</div>
    </div>
  );
}

// Active — Garmin Edge–style full-screen rotating page system.
function Active({ vm, actions, live, tick, livePages }) {
  // Your distance in the timer header — real feed if connected, else simulation.
  const riders = live?.riders?.length ? live.riders : vm.rideRiders;
  const you = riders.find((r) => r.you) || riders[0];

  return (
    <div className="live-active">
      {/* timer header */}
      <div style={s('display:flex;align-items:center;justify-content:space-between;padding:2px 18px 12px')}>
        <div style={s('display:flex;align-items:center;gap:9px')}>
          <Back onClick={actions.backToLobby} />
          <div style={s('display:flex;align-items:center;gap:6px')}><span style={s('width:8px;height:8px;border-radius:50%;background:var(--bad);animation:pulseDot 1.1s infinite')} /><span style={s('font-size:11px;font-weight:700;letter-spacing:1.4px;color:var(--bad);text-transform:uppercase')}>Live</span></div>
        </div>
        <div style={s('text-align:center')}><div className="mono" style={s('font-size:22px;font-weight:700;line-height:1')}>{vm.rideTimer}</div><div style={s('font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1.5px')}>Elapsed</div></div>
        <div style={s('text-align:right')}><div className="mono" style={s('font-size:16px;font-weight:700;color:var(--accent)')}>{you.dist}<span style={s('font-size:10px;color:var(--text2)')}>km</span></div><div style={s('font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1px')}>Your dist</div></div>
      </div>

      <LivePages t={tick} lp={livePages} />
    </div>
  );
}

export default function LiveRide({ vm, state, actions, live, tick, livePages }) {
  return (
    <div style={s('animation:floatUp .35s ease')}>
      {state.rideState === 'lobby'
        ? <Lobby vm={vm} actions={actions} live={live} />
        : <Active vm={vm} actions={actions} live={live} tick={tick} livePages={livePages} />}
    </div>
  );
}
