import { s } from '../lib/style.js';
import { useRideRecorder } from '../hooks/useRideRecorder.js';
import { useSensors } from '../hooks/useSensors.js';

const radarLabel = (r) => (!r ? '—' : r.level > 0 ? `${r.closestM ?? '?'}m` : 'clear');

function SensorChip({ label, kind, status, value, connect, disconnect }) {
  const on = status === 'connected';
  const dot = on ? 'var(--good)' : status === 'connecting' ? 'var(--warn)' : status === 'error' ? 'var(--bad)' : 'var(--text3)';
  return (
    <div className="ctl" onClick={() => (on ? disconnect(kind) : connect(kind))} style={s('flex:1;background:var(--bg3);border:1px solid var(--line);border-radius:11px;padding:8px 9px;text-align:center')}>
      <div style={s('display:flex;align-items:center;justify-content:center;gap:5px')}>
        <span style={s(`width:7px;height:7px;border-radius:50%;background:${dot}`)} />
        <span style={s('font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text2)')}>{label}</span>
      </div>
      <div className="mono" style={s('font-size:15px;font-weight:700;margin-top:3px')}>{value}</div>
    </div>
  );
}

const Dot = ({ color, pulse }) => (
  <span style={s(`width:9px;height:9px;border-radius:50%;background:${color};${pulse ? 'animation:pulseDot 1.1s infinite' : ''}`)} />
);

// If `pushTelemetry` is provided (from useLiveRide), fixes stream to the ride hub;
// without it, the recorder still runs locally so you can test GPS/distance on a phone.
export default function RideRecorder({ pushTelemetry }) {
  const sensors = useSensors();
  const { recording, paused, distanceKm, lastFix, error, mode, start, stop } = useRideRecorder({ pushTelemetry, sensors });
  const radar = sensors.metrics.radar;

  return (
    <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:14px;margin-top:14px')}>
      <div style={s('display:flex;align-items:center;justify-content:space-between')}>
        <div style={s('display:flex;align-items:center;gap:8px')}>
          <Dot color={recording ? (paused ? 'var(--warn)' : 'var(--bad)') : 'var(--text3)'} pulse={recording && !paused} />
          <span style={s('font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--text2)')}>
            {recording ? (paused ? 'Paused' : 'Recording') : 'Record ride'}
          </span>
        </div>
        {!pushTelemetry && <span style={s('font-size:10px;color:var(--text3)')}>local · not streaming</span>}
      </div>

      {/* BLE sensors — tap to pair / unpair */}
      <div style={s('display:flex;gap:8px;margin-top:12px')}>
        <SensorChip label="HR" kind="hr" status={sensors.status.hr} value={sensors.metrics.heartRate ?? '—'} connect={sensors.connect} disconnect={sensors.disconnect} />
        <SensorChip label="Power" kind="power" status={sensors.status.power} value={sensors.metrics.powerW != null ? `${sensors.metrics.powerW}W` : '—'} connect={sensors.connect} disconnect={sensors.disconnect} />
        <SensorChip label="Radar" kind="radar" status={sensors.status.radar} value={radarLabel(radar)} connect={sensors.connect} disconnect={sensors.disconnect} />
      </div>

      {/* radar threat banner */}
      {radar?.level > 0 && (
        <div style={s(`margin-top:10px;border-radius:11px;padding:9px 12px;font-size:12px;font-weight:700;display:flex;align-items:center;gap:8px;color:${radar.level >= 2 ? '#fff' : '#1a1405'};background:${radar.level >= 2 ? 'var(--bad)' : 'var(--warn)'}`)}>
          🚗 Vehicle approaching{radar.closestM != null ? ` · ${radar.closestM} m` : ''}{radar.count > 1 ? ` · ${radar.count} behind` : ''}
        </div>
      )}

      {recording && (
        <div style={s('display:flex;gap:0;margin-top:12px;border-top:1px solid var(--line);padding-top:12px')}>
          <div style={s('flex:1')}><div className="mono" style={s('font-size:20px;font-weight:700')}>{distanceKm.toFixed(2)}<span style={s('font-size:11px;color:var(--text2)')}>km</span></div><div style={s('font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px')}>Distance</div></div>
          <div style={s('flex:1;border-left:1px solid var(--line);padding-left:12px')}><div className="mono" style={s('font-size:20px;font-weight:700')}>{lastFix?.speedKph != null ? lastFix.speedKph.toFixed(1) : '—'}<span style={s('font-size:11px;color:var(--text2)')}>kph</span></div><div style={s('font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px')}>Speed</div></div>
          <div style={s('flex:1;border-left:1px solid var(--line);padding-left:12px')}><div className="mono" style={s('font-size:20px;font-weight:700')}>{lastFix?.accuracy != null ? `±${Math.round(lastFix.accuracy)}` : '—'}<span style={s('font-size:11px;color:var(--text2)')}>m</span></div><div style={s('font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px')}>GPS</div></div>
        </div>
      )}

      {/* honest status about background behaviour */}
      {recording && mode === 'web' && (
        <div style={s(`font-size:11px;line-height:1.4;margin-top:10px;color:${paused ? 'var(--warn)' : 'var(--text3)'}`)}>
          {paused
            ? 'Screen locked or app backgrounded — web GPS is paused and no fixes are recording. Reopen to resume, or use the installed app for pocket recording.'
            : 'Keeping the screen on. Web recording only runs while this stays open and unlocked.'}
        </div>
      )}
      {recording && mode === 'native' && (
        <div style={s('font-size:11px;line-height:1.4;margin-top:10px;color:var(--good)')}>
          Recording in the background — you can lock the phone and pocket it.
        </div>
      )}
      {error && <div style={s('font-size:11px;color:var(--bad);margin-top:10px')}>{error}</div>}

      <div
        className="ctl"
        onClick={recording ? stop : start}
        style={s(`margin-top:14px;text-align:center;padding:13px;border-radius:13px;font-weight:700;font-size:14px;${recording ? 'background:var(--bg3);border:1px solid var(--line);color:var(--text)' : 'background:var(--accent);color:var(--accent-ink)'}`)}
      >
        {recording ? 'Stop & save' : 'Start recording'}
      </div>
    </div>
  );
}
