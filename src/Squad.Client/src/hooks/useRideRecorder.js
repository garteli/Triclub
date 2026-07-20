import { useCallback, useEffect, useRef, useState } from 'react';
import { haversineMeters, mpsToKph } from '../lib/geo.js';
import { createWebLocationSource } from '../lib/locationSource.web.js';
import { apiUrl } from '../lib/apiBase.js';
import { encodeFitActivity, FitSport } from '../lib/fitEncoder.js';

function isNativePlatform() {
  return !!(typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.());
}

// Gaps longer than this (e.g. web GPS paused while backgrounded) are treated as stopped
// time, so a pocketed-and-locked phase doesn't inflate moving time.
const MAX_GAP_MS = 10_000;
// Below this ground speed we count the rider as stopped (traffic light, café stop).
const MOVING_MPS = 0.8;

async function uploadFit(bytes, token) {
  const file = new File([bytes], `ride-${new Date().toISOString().replace(/[:.]/g, '-')}.fit`, { type: 'application/octet-stream' });
  const fd = new FormData();
  fd.append('file', file, file.name);
  const res = await fetch(apiUrl('/api/activities/upload'), {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (res.status === 401) throw new Error('Not signed in.');
  if (res.status !== 202) {
    const t = await res.text().catch(() => '');
    throw new Error(t?.slice(0, 140) || `Upload failed (${res.status})`);
  }
  return res.json().catch(() => ({ status: 'queued' }));
}

// One recorder, two location sources. On native it records in the background; on the
// web it records only while visible (Wake Lock keeps the screen on) and reports when
// it's been backgrounded rather than pretending to still track. Everything it captures
// streams through pushTelemetry (live hub) AND is accumulated at full resolution so the
// finished ride can be encoded as a real Garmin .fit and uploaded through the same
// ingest path as a Garmin file (see lib/fitEncoder.js).
export function useRideRecorder({ pushTelemetry, sensors, getToken, onSaved, sport = FitSport.cycling, throttleMs = 1000 } = {}) {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);       // web: backgrounded / screen locked
  const [distanceKm, setDistanceKm] = useState(0);
  const [lastFix, setLastFix] = useState(null);      // { lat, lon, speedKph, accuracy }
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('idle');          // 'web' | 'native'

  // Finished-but-unsaved ride awaiting the save/discard decision on the summary card.
  const [pending, setPending] = useState(null);      // { startMs, endMs, sport, sampleCount, summary }
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [saveError, setSaveError] = useState(null);

  const source = useRef(null);
  const wakeLock = useRef(null);
  const prevCoord = useRef(null);
  const distMeters = useRef(0);
  const lastPush = useRef(0);

  // Full-resolution capture + running summary aggregates for the FIT encode.
  const samples = useRef([]);
  const agg = useRef(null);

  const resetCapture = () => {
    distMeters.current = 0; prevCoord.current = null; lastPush.current = 0;
    samples.current = [];
    agg.current = {
      startMs: null, lastTs: null, movingMs: 0,
      prevElev: null, ascentM: 0,
      hrSum: 0, hrCount: 0, maxHr: 0,
      powerSum: 0, powerCount: 0, energyJ: 0,
      cadSum: 0, cadCount: 0,
    };
  };

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

    // --- accumulate the full-resolution sample + summary aggregates for the FIT ---
    const a = agg.current;
    const tMs = s.ts ?? Date.now();
    if (a) {
      if (a.startMs == null) a.startMs = tMs;
      const dt = a.lastTs != null ? tMs - a.lastTs : 0;
      if (dt > 0 && dt <= MAX_GAP_MS && (s.speedMps == null || s.speedMps >= MOVING_MPS)) {
        a.movingMs += dt;
        if (m.powerW != null) a.energyJ += m.powerW * (dt / 1000); // ∫P dt → joules (≈ kcal/1000)
      }
      a.lastTs = tMs;
      if (s.elevM != null) {
        if (a.prevElev != null && s.elevM > a.prevElev) a.ascentM += s.elevM - a.prevElev;
        a.prevElev = s.elevM;
      }
      if (m.heartRate != null) { a.hrSum += m.heartRate; a.hrCount++; if (m.heartRate > a.maxHr) a.maxHr = m.heartRate; }
      if (m.powerW != null) { a.powerSum += m.powerW; a.powerCount++; }
      if (m.cadence != null) { a.cadSum += m.cadence; a.cadCount++; }
    }
    samples.current.push({
      tMs, lat: s.lat, lon: s.lon, elevM: s.elevM ?? null,
      speedMps: s.speedMps ?? null,
      heartRate: m.heartRate ?? null, cadence: m.cadence ?? null, powerW: m.powerW ?? null,
      distanceM: distMeters.current,
    });

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
    setPending(null); setSaveState('idle'); setSaveError(null);
    resetCapture(); setDistanceKm(0);
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

  // Build the summary the FIT session/lap carry from the running aggregates.
  const buildSummary = () => {
    const a = agg.current || {};
    const movingSec = Math.round(a.movingMs / 1000);
    const elapsedSec = a.startMs != null && a.lastTs != null ? Math.round((a.lastTs - a.startMs) / 1000) : movingSec;
    return {
      movingSec, elapsedSec,
      distanceM: distMeters.current || null,
      ascentM: a.ascentM ? Math.round(a.ascentM) : null,
      avgHr: a.hrCount ? Math.round(a.hrSum / a.hrCount) : null,
      maxHr: a.maxHr || null,
      avgPowerW: a.powerCount ? Math.round(a.powerSum / a.powerCount) : null,
      avgCadence: a.cadCount ? Math.round(a.cadSum / a.cadCount) : null,
      calories: a.energyJ ? Math.round(a.energyJ / 1000) : null, // kJ of mechanical work ≈ kcal
    };
  };

  // Stop the location source and hand the ride to the save/discard summary card.
  const stop = useCallback(async () => {
    try { await source.current?.stop?.(); } catch { /* ignore */ }
    source.current = null;
    await releaseWakeLock();
    setRecording(false);
    setPaused(false);
    setMode('idle');

    const a = agg.current;
    const summary = buildSummary();
    setPending({
      startMs: a?.startMs ?? null,
      endMs: a?.lastTs ?? null,
      sport,
      sampleCount: samples.current.length,
      summary,
    });
    setSaveState('idle'); setSaveError(null);
  }, [releaseWakeLock, sport]);

  // Encode the captured ride as a real Garmin .fit and upload it through the shared
  // /api/activities/upload ingest (dedup + fan-out identical to a Garmin file upload).
  const saveRide = useCallback(async () => {
    if (!pending || pending.sampleCount === 0) return;
    setSaveState('saving'); setSaveError(null);
    try {
      const bytes = encodeFitActivity({
        startMs: pending.startMs, endMs: pending.endMs,
        sport: pending.sport, samples: samples.current, summary: pending.summary,
      });
      const token = getToken ? await getToken() : null;
      const result = await uploadFit(bytes, token);
      setSaveState('saved');
      samples.current = [];
      if (result?.status !== 'already-received') onSaved?.();
    } catch (e) {
      setSaveState('error');
      setSaveError(e?.message || 'Could not save the ride.');
    }
  }, [pending, getToken, onSaved]);

  const discardRide = useCallback(() => {
    samples.current = []; agg.current = null;
    setPending(null); setSaveState('idle'); setSaveError(null); setDistanceKm(0);
  }, []);

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

  // Stop the source cleanly if the component unmounts mid-ride (don't wipe a pending
  // ride — the summary card may still be open on another screen).
  useEffect(() => () => { source.current?.stop?.(); releaseWakeLock(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    recording, paused, distanceKm, lastFix, error, mode, start, stop,
    pending, saveState, saveError, saveRide, discardRide,
  };
}
