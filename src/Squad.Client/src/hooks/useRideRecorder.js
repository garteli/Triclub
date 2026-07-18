import { useCallback, useEffect, useRef, useState } from 'react';
import { haversineMeters, mpsToKph } from '../lib/geo.js';
import { createWebLocationSource } from '../lib/locationSource.web.js';

function isNativePlatform() {
  return !!(typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.());
}

// One recorder, two location sources. On native it records in the background; on the
// web it records only while visible (Wake Lock keeps the screen on) and reports when
// it's been backgrounded rather than pretending to still track. Everything it captures
// is streamed through the injected pushTelemetry (the same hub contract the map reads).
export function useRideRecorder({ pushTelemetry, sensors, throttleMs = 1000 } = {}) {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);       // web: backgrounded / screen locked
  const [distanceKm, setDistanceKm] = useState(0);
  const [lastFix, setLastFix] = useState(null);      // { lat, lon, speedKph, accuracy }
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('idle');          // 'web' | 'native'

  const source = useRef(null);
  const wakeLock = useRef(null);
  const prevCoord = useRef(null);
  const distMeters = useRef(0);
  const lastPush = useRef(0);

  const acquireWakeLock = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
        wakeLock.current = await navigator.wakeLock.request('screen');
      }
    } catch { /* denied or not visible — non-fatal */ }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    try { await wakeLock.current?.release?.(); } catch { /* ignore */ }
    wakeLock.current = null;
  }, []);

  const onSample = useCallback((s) => {
    if (prevCoord.current) distMeters.current += haversineMeters(prevCoord.current, s);
    prevCoord.current = { lat: s.lat, lon: s.lon };
    const km = distMeters.current / 1000;
    setDistanceKm(km);

    const speedKph = s.speedMps != null ? mpsToKph(s.speedMps) : null;

    // Fold in the latest BLE sensor readings (HR / power / radar), if paired.
    const m = sensors?.current?.() || {};
    const radar = m.radar || null;
    setLastFix({ lat: s.lat, lon: s.lon, speedKph, accuracy: s.accuracy, heartRate: m.heartRate ?? null, powerW: m.powerW ?? null, radar });

    // Throttle the uplink so a chatty source doesn't spam the hub.
    const now = Date.now();
    if (pushTelemetry && now - lastPush.current >= throttleMs) {
      lastPush.current = now;
      pushTelemetry({
        lat: s.lat, lon: s.lon, elevM: s.elevM ?? null,
        speedKph,
        heartRate: m.heartRate ?? null, cadence: m.cadence ?? null, powerW: m.powerW ?? null,
        radarThreatLevel: radar?.level ?? null,
        radarVehicleCount: radar?.count ?? null,
        radarClosestMeters: radar?.closestM ?? null,
        radarClosestClosingKph: radar?.closingKph ?? null,
        distanceKm: km,
      });
    }
  }, [pushTelemetry, sensors, throttleMs]);

  const start = useCallback(async () => {
    setError(null);
    distMeters.current = 0; prevCoord.current = null; setDistanceKm(0); lastPush.current = 0;
    try {
      if (isNativePlatform()) {
        const { createNativeLocationSource } = await import('../lib/locationSource.native.js');
        source.current = await createNativeLocationSource();
        setMode('native');
      } else {
        source.current = createWebLocationSource();
        setMode('web');
        await acquireWakeLock(); // keep the screen alive so the foreground watch survives
      }
      source.current.start(onSample, (err) => setError(err?.message || 'Location error'));
      setRecording(true);
    } catch (e) {
      setError(e?.message || 'Could not start recording');
    }
  }, [onSample, acquireWakeLock]);

  const stop = useCallback(async () => {
    try { await source.current?.stop?.(); } catch { /* ignore */ }
    source.current = null;
    await releaseWakeLock();
    setRecording(false);
    setPaused(false);
    setMode('idle');
  }, [releaseWakeLock]);

  // Web only: surface the background limitation honestly. The Wake Lock is dropped
  // when the page hides, so re-arm it on return and flag the gap while hidden.
  useEffect(() => {
    if (!recording || mode !== 'web') return;
    const onVisibility = async () => {
      if (document.hidden) {
        setPaused(true);
      } else {
        setPaused(false);
        await acquireWakeLock();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [recording, mode, acquireWakeLock]);

  // Stop cleanly if the component unmounts mid-ride.
  useEffect(() => () => { stop(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { recording, paused, distanceKm, lastFix, error, mode, start, stop };
}
