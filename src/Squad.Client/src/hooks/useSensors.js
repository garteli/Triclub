import { useCallback, useEffect, useRef, useState } from 'react';
import { createWebSensorController } from '../lib/sensorSource.web.js';
import { SENSOR_SPECS, emptySnapshot } from '../lib/ble.js';

const KINDS = Object.keys(SENSOR_SPECS); // hr, power, csc, rsc, trainer, radar
const PAIRED_KEY = 'squad.sensors';      // { [kind]: { id, name } } — remembered devices

function isNativePlatform() {
  return !!(typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.());
}

function loadPaired() {
  try { return JSON.parse(localStorage.getItem(PAIRED_KEY)) || {}; } catch { return {}; }
}
function savePaired(map) {
  try { localStorage.setItem(PAIRED_KEY, JSON.stringify(map)); } catch { /* storage unavailable */ }
}

const offStatus = () => KINDS.reduce((o, k) => ((o[k] = 'off'), o), {});

// Manages BLE sensor pairing across every supported profile and exposes:
//   - status   per-kind connection state for the UI
//   - metrics  latest values, polled for display
//   - paired   remembered devices ({ id, name }) for reconnect + display
//   - current()  a synchronous snapshot the recorder merges into each telemetry push
export function useSensors() {
  const ctrl = useRef(null);
  const [status, setStatus] = useState(offStatus);
  const [metrics, setMetrics] = useState(emptySnapshot);
  const [paired, setPaired] = useState(loadPaired);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null); // { kinds:[], name } | null
  const [scanError, setScanError] = useState(null);

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

  const rememberPaired = useCallback((kind, device) => {
    setPaired((prev) => {
      const next = { ...prev, [kind]: { id: device.id, name: device.name } };
      savePaired(next);
      return next;
    });
  }, []);

  const connect = useCallback(async (kind) => {
    setStatus((s) => ({ ...s, [kind]: 'connecting' }));
    try {
      const c = await ensureController();
      const device = await c.connect(kind);
      rememberPaired(kind, device);
      setStatus((s) => ({ ...s, [kind]: 'connected' }));
    } catch {
      setStatus((s) => ({ ...s, [kind]: 'error' }));
    }
  }, [ensureController, rememberPaired]);

  // Search-all / auto-detect: one picker, then subscribe to every kind the chosen device
  // exposes. Surfaces a themed result sheet via scanResult / scanError.
  const connectAll = useCallback(async () => {
    if (scanning) return;
    const c = await ensureController();
    if (!c.connectAny) { setScanError('Auto-detect isn’t available on this platform.'); return; }
    setScanning(true); setScanError(null); setScanResult(null);
    try {
      const res = await c.connectAny();
      res.kinds.forEach((k) => rememberPaired(k, { id: res.id, name: res.name }));
      setStatus((s) => { const n = { ...s }; res.kinds.forEach((k) => (n[k] = 'connected')); return n; });
      setScanResult({ kinds: res.kinds, name: res.name });
    } catch (e) {
      setScanError(e?.message || 'Scan cancelled — no sensor selected.');
    } finally {
      setScanning(false);
    }
  }, [scanning, ensureController, rememberPaired]);

  const dismissScan = useCallback(() => { setScanResult(null); setScanError(null); }, []);

  const disconnect = useCallback(async (kind, { forget = true } = {}) => {
    try { await ctrl.current?.disconnect(kind); } catch { /* ignore */ }
    setStatus((s) => ({ ...s, [kind]: 'off' }));
    if (forget) {
      setPaired((prev) => {
        const next = { ...prev }; delete next[kind]; savePaired(next);
        return next;
      });
    }
  }, []);

  // On mount, silently try to re-establish previously-paired sensors (in range, same
  // browser/device). Best-effort: a failure just leaves the row as "remembered, tap to
  // reconnect" rather than surfacing an error.
  useEffect(() => {
    const remembered = loadPaired();
    const kinds = Object.keys(remembered);
    if (kinds.length === 0) return;
    let cancelled = false;
    (async () => {
      const c = await ensureController();
      if (!c.connectKnown) return;
      for (const kind of kinds) {
        if (cancelled) return;
        try {
          await c.connectKnown(kind, remembered[kind].id);
          if (!cancelled) setStatus((s) => ({ ...s, [kind]: 'connected' }));
        } catch { /* leave remembered-but-off */ }
      }
    })();
    return () => { cancelled = true; };
  }, [ensureController]);

  const current = useCallback(() => (ctrl.current ? ctrl.current.snapshot() : {}), []);

  return { kinds: KINDS, status, metrics, paired, connect, connectAll, scanning, scanResult, scanError, dismissScan, disconnect, current };
}
