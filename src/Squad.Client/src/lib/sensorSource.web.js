// Web Bluetooth sensors — Chrome/Edge/Android only (iOS Safari has no Web Bluetooth).
// Same shape and shared parsers as the native controller; foreground-only.
import { SENSOR_SPECS, emptySnapshot } from './ble.js';

export function createWebSensorController() {
  const latest = emptySnapshot();
  const conns = {}; // kind -> { device, characteristic, handler }

  const supported = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

  // Wire notifications for an already-selected device. Shared by fresh pairs (connect)
  // and silent reconnects (connectKnown).
  async function subscribe(kind, device) {
    const spec = SENSOR_SPECS[kind];
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(spec.service);
    const characteristic = await service.getCharacteristic(spec.measurement);

    const handler = (e) => { try { spec.apply(e.target.value, latest); } catch { /* skip */ } };
    characteristic.addEventListener('characteristicvaluechanged', handler);
    await characteristic.startNotifications();
    device.addEventListener('gattserverdisconnected', () => clearKind(kind));

    conns[kind] = { device, characteristic, handler };
    return { id: device.id, name: device.name || kind };
  }

  async function connect(kind) {
    if (!supported) throw new Error('Web Bluetooth not supported on this browser');
    const spec = SENSOR_SPECS[kind];
    if (!spec) throw new Error(`Unknown sensor: ${kind}`);

    // Match by advertised service, plus by name prefix for devices that don't advertise
    // their service (e.g. Varia radar). Keep the service in optionalServices either way.
    const device = await navigator.bluetooth.requestDevice({
      filters: spec.namePrefix
        ? [{ services: [spec.service] }, { namePrefix: spec.namePrefix }]
        : [{ services: [spec.service] }],
      optionalServices: [spec.service],
    });
    return subscribe(kind, device);
  }

  // Best-effort silent reconnect to a previously-paired device id. Relies on
  // navigator.bluetooth.getDevices() (permission-backed; behind a flag on some
  // browsers), so it can legitimately fail — the caller falls back to connect().
  async function connectKnown(kind, deviceId) {
    if (!supported || !navigator.bluetooth.getDevices) throw new Error('reconnect unsupported');
    const devices = await navigator.bluetooth.getDevices();
    const device = devices.find((d) => d.id === deviceId);
    if (!device) throw new Error('device not remembered by this browser');
    return subscribe(kind, device);
  }

  async function disconnect(kind) {
    const c = conns[kind];
    if (!c) return;
    try { c.characteristic.removeEventListener('characteristicvaluechanged', c.handler); } catch { /* ignore */ }
    try { await c.characteristic.stopNotifications(); } catch { /* ignore */ }
    try { c.device.gatt?.disconnect(); } catch { /* ignore */ }
    clearKind(kind);
  }

  function clearKind(kind) {
    delete conns[kind];
    const spec = SENSOR_SPECS[kind];
    spec?.clears?.forEach((f) => { latest[f] = null; });
    if (spec?.reset) delete latest[spec.reset];
  }

  return { kind: 'web', supported, connect, connectKnown, disconnect, snapshot: () => ({ ...latest }) };
}
