import { useState } from 'react';
import { s } from '../lib/style.js';
import RideRecorder from '../components/RideRecorder.jsx';
import LivePages from '../components/LivePages.jsx';
import UwbReadout from '../components/UwbReadout.jsx';
import CoursePicker from '../components/CoursePicker.jsx';
import { gearComponentsFromSensors } from '../lib/liveMetrics.js';

const Back = ({ onClick }) => (
  <div className="ctl" onClick={onClick} style={s('width:34px;height:34px;border-radius:10px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center')}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg>
  </div>
);

const mmss = (sec) => {
  if (sec == null) return '0:00';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s2 = sec % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + ':' + String(s2).padStart(2, '0');
};

function Lobby({ vm, actions, live }) {
  const riders = live?.riders || [];
  const gear = gearComponentsFromSensors(live?.sensors);
  const [coursesOpen, setCoursesOpen] = useState(false);
  const course = live?.course; // selected course { id, name, ... } | null
  return (
    <div style={s('padding:6px 18px 120px')}>
      <div style={s('display:flex;align-items:center;gap:10px;margin-bottom:6px')}>
        <Back onClick={() => actions.go('dash')} />
        <div style={s('display:flex;align-items:center;gap:7px')}><span style={s('width:8px;height:8px;border-radius:50%;background:var(--accent);animation:pulseDot 1.4s infinite')} /><span style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.4px;font-weight:600')}>Group ride</span></div>
      </div>
      <div style={s('font-size:26px;font-weight:700;letter-spacing:-.6px;margin-top:6px')}>{vm.squadName || 'Group ride'}</div>
      <div style={s('font-size:13px;color:var(--text2);margin-top:2px')}>Record your ride and share it live with the squad.</div>

      {/* who's in — real riders on the ride channel */}
      <div style={s('display:flex;align-items:center;justify-content:space-between;margin:20px 2px 12px')}>
        <div style={s('font-size:12px;color:var(--text3);text-transform:uppercase;letter-spacing:1.4px;font-weight:600')}>Who's riding</div>
        <span style={s('font-size:11px;color:var(--text3)')}>{riders.length} live</span>
      </div>
      <div style={s('display:grid;grid-template-columns:repeat(4,1fr);gap:10px')}>
        {riders.map((r) => (
          <div key={r.athleteId} style={s('text-align:center')}>
            <div style={s('position:relative;width:52px;height:52px;margin:0 auto')}>
              <div style={s(`width:52px;height:52px;border-radius:16px;background:${r.color};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;color:#0c0e11`)}>{r.initials}</div>
              <div style={s('position:absolute;bottom:-3px;right:-3px;width:18px;height:18px;border-radius:50%;background:var(--good);border:2.5px solid var(--bg);display:flex;align-items:center;justify-content:center')}><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#0c0e11" strokeWidth="4" strokeLinecap="round"><path d="M4 12l5 5 11-11" /></svg></div>
            </div>
            <div style={s('font-size:11px;font-weight:600;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{r.name}</div>
          </div>
        ))}
        {riders.length === 0 && (
          <div style={s('grid-column:1/-1;padding:16px;border:1px dashed var(--line2);border-radius:14px;text-align:center;font-size:12px;color:var(--text3);line-height:1.5')}>No one riding yet — start recording to go live, or wait for teammates to join.</div>
        )}
      </div>

      {/* shared recorder — GPS + BLE sensors, streams to the ride hub while active */}
      <RideRecorder recorder={live?.recorder} sensors={live?.sensors} streaming={!!live?.pushTelemetry} />

      {/* Bike & gear — connected BLE components (battery from the sensors, when they report it) */}
      <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:14px;margin-top:14px')}>
        <div style={s('display:flex;align-items:center;justify-content:space-between;margin-bottom:11px')}>
          <div style={s('display:flex;align-items:center;gap:8px')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2" strokeLinecap="round"><circle cx="5.5" cy="17.5" r="3.5" /><circle cx="18.5" cy="17.5" r="3.5" /><path d="M15 17.5l-3-6.5H8.5m6.5 0l-2.5 6.5M9.5 6.5h3l2 4.5" /></svg>
            <span style={s('font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--text2)')}>Bike & gear</span>
          </div>
          <span style={s(`font-size:10px;font-weight:700;color:${gear.length ? 'var(--good)' : 'var(--text3)'}`)}>{gear.length} connected</span>
        </div>
        {gear.length === 0 ? (
          <div style={s('font-size:12px;color:var(--text3);line-height:1.5')}>No components paired. Connect your HR strap, power meter or radar to see them here.</div>
        ) : (
          <div style={s('display:flex;flex-direction:column;gap:10px')}>
            {gear.map((c) => (
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
        )}
        <div className="ctl" onClick={() => actions.go('sensors')} style={s('margin-top:12px;text-align:center;padding:9px;border-radius:11px;font-size:12px;font-weight:700;background:var(--bg3);border:1px dashed var(--line2);color:var(--text2)')}>+ Pair a component</div>
      </div>

      {/* course to follow on the live map */}
      {live?.courses && (
        <div className="ctl" onClick={() => setCoursesOpen(true)} style={s('display:flex;align-items:center;gap:11px;background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:13px 14px;margin-top:14px')}>
          <div style={s('width:36px;height:36px;border-radius:11px;background:var(--accent-dim);flex:none;display:flex;align-items:center;justify-content:center;color:var(--accent)')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 20l-5.5 2 1-5.5L15 3l4 4L9 20z" /><path d="M13.5 4.5l4 4" /></svg>
          </div>
          <div style={s('flex:1;min-width:0')}>
            <div style={s('font-size:13.5px;font-weight:700')}>{course ? course.name : 'Course'}</div>
            <div style={s('font-size:11px;color:var(--text2)')}>{course ? 'Following this route on the map — tap to change' : 'Pick a route to follow, save a ride, or import a GPX'}</div>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
        </div>
      )}

      <div className="ctl" onClick={actions.startRide} style={s('background:var(--accent);color:var(--accent-ink);text-align:center;padding:15px;border-radius:15px;font-weight:700;font-size:15px;margin-top:16px;box-shadow:0 8px 22px -8px color-mix(in srgb,var(--accent) 60%,transparent)')}>Open ride display</div>

      {coursesOpen && <CoursePicker courses={live.courses} onClose={() => setCoursesOpen(false)} />}
    </div>
  );
}

// Active — Garmin Edge–style full-screen rotating page system, fed by real telemetry.
function Active({ actions, live }) {
  const tel = live?.tel;
  const you = (live?.riders || []).find((r) => r.you) || null;
  const dist = tel?.dist ?? (you ? parseFloat(you.dist) : null);
  const recording = !!live?.recorder?.recording;
  const editing = !!live?.livePages?.editFields;

  return (
    <div className={'live-active' + (editing ? ' editing' : '')}>
      {/* timer header */}
      <div style={s('display:flex;align-items:center;justify-content:space-between;padding:2px 18px 12px')}>
        <div style={s('display:flex;align-items:center;gap:9px')}>
          <Back onClick={actions.backToLobby} />
          <div style={s('display:flex;align-items:center;gap:6px')}><span style={s(`width:8px;height:8px;border-radius:50%;background:${recording ? 'var(--bad)' : 'var(--text3)'};${recording ? 'animation:pulseDot 1.1s infinite' : ''}`)} /><span style={s(`font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${recording ? 'var(--bad)' : 'var(--text3)'}`)}>{recording ? 'Live' : 'Idle'}</span></div>
        </div>
        <div style={s('text-align:center')}><div className="mono" style={s('font-size:22px;font-weight:700;line-height:1')}>{mmss(tel?.elapsed)}</div><div style={s('font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1.5px')}>Elapsed</div></div>
        <div style={s('text-align:right')}><div className="mono" style={s('font-size:16px;font-weight:700;color:var(--accent)')}>{dist != null ? dist.toFixed(1) : '—'}<span style={s('font-size:10px;color:var(--text2)')}>km</span></div><div style={s('font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:1px')}>Your dist</div></div>
      </div>

      {!recording && (
        <div style={s('margin:0 12px 8px;padding:9px 12px;border-radius:12px;background:var(--bg2);border:1px solid var(--line);font-size:11.5px;color:var(--text3);text-align:center')}>Not recording — go back and tap <b style={s('color:var(--text2)')}>Start recording</b> to see your live numbers.</div>
      )}

      {/* precise UWB distance/direction to teammates (native + U1 devices; hidden otherwise) */}
      <UwbReadout uwb={live?.uwb} riders={live?.riders} />

      <LivePages tel={tel} lp={live?.livePages} />
    </div>
  );
}

export default function LiveRide({ vm, state, actions, live }) {
  return (
    <div style={s('animation:floatUp .35s ease')}>
      {state.rideState === 'lobby'
        ? <Lobby vm={vm} actions={actions} live={live} />
        : <Active actions={actions} live={live} />}
    </div>
  );
}
