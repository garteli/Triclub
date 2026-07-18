// Native BLE sensors via @capacitor-community/bluetooth-le. Dynamically imported so
// the web build never needs it (also externalized in vite.config.js). Keeps a shared
// `latest` store that the recorder samples each push; works in the background on native.
import { SENSOR_SPECS } from './ble.js';

export async function createNativeSensorController() {
  const { BleClient } = await import('@capacitor-community/bluetooth-le');
  await BleClient.initialize({ androidNeverForLocation: true });

  const latest = { heartRate: null, powerW: null, cadence: null, radar: null };
  const deviceIds = {}; // kind -> deviceId

  async function connect(kind) {
    const spec = SENSOR_SPECS[kind];
    if (!spec) throw new Error(`Unknown sensor: ${kind}`);

    const device = await BleClient.requestDevice({ services: [spec.service] });
    await BleClient.connect(device.deviceId, () => clearKind(kind));
    await BleClient.startNotifications(device.deviceId, spec.service, spec.measurement, (dv) => {
      try { spec.apply(dv, latest); } catch { /* malformed packet — skip */ }
    });
    deviceIds[kind] = device.deviceId;
    return device.name || kind;
  }

  async function disconnect(kind) {
    const id = deviceIds[kind];
    if (!id) return;
    const spec = SENSOR_SPECS[kind];
    try { await BleClient.stopNotifications(id, spec.service, spec.measurement); } catch { /* ignore */ }
    try { await BleClient.disconnect(id); } catch { /* ignore */ }
    clearKind(kind);
  }

  function clearKind(kind) {
    delete deviceIds[kind];
    if (kind === 'hr') latest.heartRate = null;
    if (kind === 'power') latest.powerW = null;
    if (kind === 'radar') latest.radar = null;
  }

  return { kind: 'native', connect, disconnect, snapshot: () => ({ ...latest }) };
}
