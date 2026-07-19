import { s } from '../lib/style.js';
import { useSensors } from '../hooks/useSensors.js';
import { SENSOR_CATALOG } from '../lib/ble.js';

const Back = ({ onClick }) => (
  <div className="ctl" onClick={onClick} style={s('width:34px;height:34px;border-radius:10px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center')}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg>
  </div>
);

const BleGlyph = ({ color }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6.5 6.5l11 11L12 23V1l5.5 5.5-11 11" />
  </svg>
);

function radarLabel(r) {
  if (!r) return '—';
  return r.level > 0 ? `${r.closestM ?? '?'} m` : 'clear';
}

// One metric value → display string, from the polled snapshot.
function fmtMetric(name, m) {
  switch (name) {
    case 'heartRate': return m.heartRate != null ? `${m.heartRate} bpm` : null;
    case 'powerW':    return m.powerW != null ? `${m.powerW} W` : null;
    case 'cadence':   return m.cadence != null ? `${m.cadence} rpm` : null;
    case 'speedKph':  return m.speedKph != null ? `${m.speedKph.toFixed(1)} kph` : null;
    case 'radar':     return m.radar ? radarLabel(m.radar) : null;
    default:          return null;
  }
}

function SensorRow({ item, status, metrics, paired, onConnect, onDisconnect }) {
  const { kind, label, hint, metrics: metricNames, available = true } = item;
  const on = status === 'connected';
  const connecting = status === 'connecting';
  const dotColor = !available ? 'var(--text3)'
    : on ? 'var(--good)'
    : connecting ? 'var(--warn)'
    : status === 'error' ? 'var(--bad)'
    : 'var(--text3)';

  const values = on ? metricNames.map((n) => fmtMetric(n, metrics)).filter(Boolean).join(' · ') : '';

  let right;
  if (!available) {
    right = <span style={s('font-size:11px;color:var(--text3)')}>Unavailable</span>;
  } else if (on) {
    right = <button onClick={() => onDisconnect(kind)} style={s('font-size:11.5px;font-weight:700;color:var(--text2);background:var(--bg3);border:1px solid var(--line);border-radius:9px;padding:7px 12px;cursor:pointer')}>Disconnect</button>;
  } else if (connecting) {
    right = <span style={s('font-size:11.5px;color:var(--warn);font-weight:600')}>Scanning…</span>;
  } else {
    const remembered = paired[kind];
    right = <button onClick={() => onConnect(kind)} style={s('font-size:11.5px;font-weight:700;color:var(--accent-ink);background:var(--accent);border:none;border-radius:9px;padding:7px 14px;cursor:pointer')}>{remembered ? 'Reconnect' : 'Connect'}</button>;
  }

  const subline = !available ? 'Needs ANT+ or a vendor bridge — not standard Bluetooth'
    : on && values ? values
    : status === 'error' ? 'Couldn’t connect — is it awake and nearby?'
    : paired[kind] ? `Last paired · ${paired[kind].name}`
    : hint;

  return (
    <div style={s(`display:flex;align-items:center;gap:12px;padding:14px 15px;border-bottom:1px solid var(--line);opacity:${available ? 1 : 0.55}`)}>
      <div style={s(`width:36px;height:36px;border-radius:11px;flex:none;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,${on ? 'var(--good)' : 'var(--text3)'} 15%,transparent)`)}>
        <BleGlyph color={on ? 'var(--good)' : 'var(--text2)'} />
      </div>
      <div style={s('flex:1;min-width:0')}>
        <div style={s('display:flex;align-items:center;gap:7px')}>
          <span style={s(`width:7px;height:7px;border-radius:50%;flex:none;background:${dotColor}`)} />
          <span style={s('font-size:13.5px;font-weight:700')}>{label}</span>
        </div>
        <div style={s(`font-size:11.5px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${on && values ? 'var(--good)' : 'var(--text3)'}`)}>{subline}</div>
      </div>
      <div style={s('flex:none')}>{right}</div>
    </div>
  );
}

export default function Sensors({ actions }) {
  const { status, metrics, paired, connect, disconnect } = useSensors();
  const webBleMissing = typeof navigator !== 'undefined' && !('bluetooth' in navigator)
    && !(typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.());

  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      <div style={s('display:flex;align-items:center;gap:10px')}>
        <Back onClick={() => actions.go('settings')} />
        <div style={s('font-size:20px;font-weight:700')}>Connected sensors</div>
      </div>
      <div style={s('font-size:12.5px;color:var(--text2);margin-top:8px;line-height:1.5')}>
        Pair Bluetooth sensors to record real heart rate, power, cadence and speed. Tap Connect to scan — remembered sensors reconnect automatically next time.
      </div>

      {webBleMissing && (
        <div style={s('background:color-mix(in srgb,var(--warn) 12%,transparent);border:1px solid color-mix(in srgb,var(--warn) 40%,transparent);border-radius:13px;padding:12px 14px;margin-top:14px;font-size:12px;color:var(--text2);line-height:1.5')}>
          This browser has no Web Bluetooth (Safari and iOS don’t support it). Use the <b>Domestique Club app</b>, or Chrome on Android/desktop, to pair sensors.
        </div>
      )}

      <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;margin-top:14px;overflow:hidden')}>
        {SENSOR_CATALOG.map((item) => (
          <SensorRow
            key={item.kind}
            item={item}
            status={status[item.kind]}
            metrics={metrics}
            paired={paired}
            onConnect={connect}
            onDisconnect={disconnect}
          />
        ))}
      </div>

      <div style={s('font-size:11px;color:var(--text3);margin-top:12px;line-height:1.5;padding:0 2px')}>
        Radar is community-reverse-engineered (Garmin Varia) and unofficial. Smart-trainer support reads power/speed/cadence over FTMS; erg control is a follow-up.
      </div>
    </div>
  );
}
