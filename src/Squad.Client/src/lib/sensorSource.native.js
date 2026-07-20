// Native BLE sensors via @capacitor-community/bluetooth-le. Dynamically imported so
// the web build never needs it (also externalized in vite.config.js). Keeps a shared
// `latest` store that the recorder samples each push; works in the background on native.
import { SENSOR_SPECS, emptySnapshot } from './ble.js';

export async function createNativeSensorController() {
  const { BleClient } = await import('@capacitor-community/bluetooth-le');
  await BleClient.initialize({ androidNeverForLocation: true });

  const latest = emptySnapshot();
  const deviceIds = {}; // kind -> deviceId

  // Subscribe to a connected device's measurement characteristic. Shared by connect
  // (after a scan) and connectKnown (silent reconnect by stored id).
  async function subscribe(kind, deviceId) {
    const spec = SENSOR_SPECS[kind];
    await BleClient.connect(deviceId, () => clearKind(kind));
    await BleClient.startNotifications(deviceId, spec.service, spec.measurement, (dv) => {
      try { spec.apply(dv, latest); } catch { /* malformed packet — skip */ }
    });
    deviceIds[kind] = deviceId;
  }

  async function connect(kind) {
    const spec = SENSOR_SPECS[kind];
    if (!spec) throw new Error(`Unknown sensor: ${kind}`);
    // Sensors that advertise their service are filtered on it directly. Devices that don't
    // (e.g. Varia radar) are scanned by name prefix, with the service in optionalServices
    // so it's reachable once connected.
    const device = await BleClient.requestDevice(
      spec.namePrefix
        ? { namePrefix: spec.namePrefix, optionalServices: [spec.service] }
        : { services: [spec.service] },
    );
    await subscribe(kind, device.deviceId);
    return { id: device.deviceId, name: device.name || kind };
  }

  // Silent reconnect to a remembered device id — no scan/picker.
  //
  // The plugin only tracks peripherals discovered in the *current* process: after an
  // app restart its internal map is empty and connect(id) fails outright with
  // "Device not found. Call 'requestDevice', 'requestLEScan' or 'getDevices' first."
  // getDevices([id]) re-hydrates that map from the system's known peripherals, so it
  // must run before connect on every fresh launch — otherwise no remembered sensor
  // (HR, power, radar) ever reconnects without the user re-picking it from a scan.
  async function connectKnown(kind, deviceId) {
    if (!SENSOR_SPECS[kind]) throw new Error(`Unknown sensor: ${kind}`);
    await BleClient.getDevices([deviceId]);
    await subscribe(kind, deviceId);
    return { id: deviceId, name: kind };
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
    const spec = SENSOR_SPECS[kind];
    spec?.clears?.forEach((f) => { latest[f] = null; });
    if (spec?.reset) delete latest[spec.reset];
  }

  return { kind: 'native', connect, connectKnown, disconnect, snapshot: () => ({ ...latest }) };
}
