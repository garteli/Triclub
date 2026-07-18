import { useCallback, useEffect, useRef, useState } from 'react';
import { createWebSensorController } from '../lib/sensorSource.web.js';

function isNativePlatform() {
  return !!(typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.());
}

// Manages BLE sensor pairing (heart rate, power, radar) and exposes:
//   - status  per-kind connection state for the UI
//   - metrics latest values, polled for display
//   - current() a synchronous snapshot the recorder merges into each telemetry push
export function useSensors() {
  const ctrl = useRef(null);
  const [status, setStatus] = useState({ hr: 'off', power: 'off', radar: 'off' });
  const [metrics, setMetrics] = useState({ heartRate: null, powerW: null, radar: null });

  // Poll the shared store so the UI reflects incoming notifications.
  useEffect(() => {
    const iv = setInterval(() => { if (ctrl.current) setMetrics(ctrl.current.snapshot()); }, 1000);
    return () => clearInterval(iv);
  }, []);

  const ensureController = useCallback(async () => {
    if (ctrl.current) return ctrl.current;
    if (isNativePlatform()) {
      const { createNativeSensorController } = await import('../lib/sensorSource.native.js');
      ctrl.current = await createNativeSensorController();
    } else {
      ctrl.current = createWebSensorController();
    }
    return ctrl.current;
  }, []);

  const connect = useCallback(async (kind) => {
    setStatus((s) => ({ ...s, [kind]: 'connecting' }));
    try {
      const c = await ensureController();
      await c.connect(kind);
      setStatus((s) => ({ ...s, [kind]: 'connected' }));
    } catch (e) {
      setStatus((s) => ({ ...s, [kind]: 'error' }));
    }
  }, [ensureController]);

  const disconnect = useCallback(async (kind) => {
    try { await ctrl.current?.disconnect(kind); } catch { /* ignore */ }
    setStatus((s) => ({ ...s, [kind]: 'off' }));
  }, []);

  const current = useCallback(() => (ctrl.current ? ctrl.current.snapshot() : {}), []);

  return { status, metrics, connect, disconnect, current };
}
