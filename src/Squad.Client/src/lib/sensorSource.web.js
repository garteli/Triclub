// Web Bluetooth sensors — Chrome/Edge/Android only (iOS Safari has no Web Bluetooth).
// Same shape and shared parsers as the native controller; foreground-only.
import { SENSOR_SPECS } from './ble.js';

export function createWebSensorController() {
  const latest = { heartRate: null, powerW: null, cadence: null, radar: null };
  const conns = {}; // kind -> { device, characteristic, handler }

  const supported = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

  async function connect(kind) {
    if (!supported) throw new Error('Web Bluetooth not supported on this browser');
    const spec = SENSOR_SPECS[kind];
    if (!spec) throw new Error(`Unknown sensor: ${kind}`);

    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [spec.service] }],
      optionalServices: [spec.service],
    });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(spec.service);
    const characteristic = await service.getCharacteristic(spec.measurement);

    const handler = (e) => { try { spec.apply(e.target.value, latest); } catch { /* skip */ } };
    characteristic.addEventListener('characteristicvaluechanged', handler);
    await characteristic.startNotifications();
    device.addEventListener('gattserverdisconnected', () => clearKind(kind));

    conns[kind] = { device, characteristic, handler };
    return device.name || kind;
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
    if (kind === 'hr') latest.heartRate = null;
    if (kind === 'power') latest.powerW = null;
    if (kind === 'radar') latest.radar = null;
  }

  return { kind: 'web', supported, connect, disconnect, snapshot: () => ({ ...latest }) };
}
