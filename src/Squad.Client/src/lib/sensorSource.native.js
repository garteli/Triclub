// Native BLE sensors via @capacitor-community/bluetooth-le. Dynamically imported so
// the web build never needs it (also externalized in vite.config.js). Keeps a shared
// `latest` store that the recorder samples each push; works in the background on native.
import { SENSOR_SPECS, emptySnapshot } from './ble.js';

// Every distinct advertised service — the "search all" scan filter + optionalServices.
const ALL_SERVICES = [...new Set(Object.values(SENSOR_SPECS).map((s) => s.service))];

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

  // "Search all" — one picker listing any device advertising a supported service; after
  // the athlete picks one we read its GATT services and subscribe to every kind it exposes.
  // (Varia radar advertises no service, so it's found via its own dedicated Connect.)
  async function connectAny() {
    const device = await BleClient.requestDevice({ services: ALL_SERVICES, optionalServices: ALL_SERVICES });
    await BleClient.connect(device.deviceId, () => {
      for (const k of Object.keys(deviceIds)) if (deviceIds[k] === device.deviceId) clearKind(k);
    });
    const services = await BleClient.getServices(device.deviceId);
    const present = new Set(services.map((s) => (s.uuid || '').toLowerCase()));
    const kinds = [];
    for (const [kind, spec] of Object.entries(SENSOR_SPECS)) {
      if (!present.has(spec.service.toLowerCase())) continue;
      try {
        await BleClient.startNotifications(device.deviceId, spec.service, spec.measurement, (dv) => {
          try { spec.apply(dv, latest); } catch { /* skip */ }
        });
        deviceIds[kind] = device.deviceId;
        kinds.push(kind);
      } catch { /* characteristic unusable — skip this kind */ }
    }
    if (kinds.length === 0) {
      try { await BleClient.disconnect(device.deviceId); } catch { /* ignore */ }
      throw new Error('No supported sensor found on that device.');
    }
    return { id: device.deviceId, name: device.name || 'sensor', kinds };
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

  return { kind: 'native', connect, connectAny, connectKnown, disconnect, snapshot: () => ({ ...latest }) };
}
