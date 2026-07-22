import { useCallback, useEffect, useRef, useState } from 'react';
import { haversineMeters, mpsToKph } from '../lib/geo.js';
import { createWebLocationSource } from '../lib/locationSource.web.js';
import { apiUrl } from '../lib/apiBase.js';
import { encodeFitActivity, FitSport } from '../lib/fitEncoder.js';
import { uploadActivityPhoto } from '../lib/photos.js';
import { loadDraft, saveDraft, clearDraft, draftMode } from '../lib/rideDraft.js';

function isNativePlatform() {
  return !!(typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.());
}

// Gaps longer than this (e.g. web GPS paused while backgrounded) are treated as stopped
// time, so a pocketed-and-locked phase doesn't inflate moving time.
const MAX_GAP_MS = 10_000;
// Below this ground speed we count the rider as stopped (traffic light, café stop).
const MOVING_MPS = 0.8;
// GPS quality gate — after the first fix, drop readings the OS reports as poor (accuracy worse than
// this many metres) and "teleport" spikes (implied speed above the max) so noise doesn't zig-zag the
// track or inflate distance while standing still. The first fix is always kept so recording starts.
const GPS_ACCURACY_MAX_M = 40;
const GPS_MAX_JUMP_MPS = 45; // ~160 km/h — passes fast driving, catches large noise jumps

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
export function useRideRecorder({ pushTelemetry, sensors, getToken, onSaved, onEnded, enabled = true, sport = FitSport.cycling, indoor = false, driver = false, autoPause = { enabled: false, pauseKph: 2, resumeKph: 4 }, throttleMs = 1000 } = {}) {
  const driverRef = useRef(driver);
  driverRef.current = driver;
  // Called whenever a ride fully ends (discarded, saved-and-dismissed, or a driver stop with no
  // save card) so the host can end the ride SESSION (drop back to the lobby) — otherwise a ride
  // with no pending summary can leave the app stuck showing the active ride display.
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  // Auto-pause: freeze distance + the elapsed clock when you stop, resume after sustained movement.
  const apCfgRef = useRef(autoPause);
  apCfgRef.current = autoPause;
  const [autoPaused, setAutoPaused] = useState(false);
  const autoPausedRef = useRef(false);
  const pausedMsRef = useRef(0);      // total time spent auto-paused (excluded from elapsed)
  const pauseStartRef = useRef(null); // when the current pause began
  const resumeStartRef = useRef(null); // when speed first crossed the resume threshold (5s sustain)
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);       // web: backgrounded / screen locked
  const [distanceKm, setDistanceKm] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);   // wall-clock since the ride started, ticks live
  const [lastFix, setLastFix] = useState(null);      // { lat, lon, speedKph, accuracy }
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('idle');          // 'web' | 'native'

  // Finished-but-unsaved ride awaiting the save/discard decision on the summary card.
  const [pending, setPending] = useState(null);      // { startMs, endMs, sport, sampleCount, summary }
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [saveError, setSaveError] = useState(null);

  // Photos snapped during the ride (or on the summary card). Each: { id, dataUrl,
  // capturedUtc }. Uploaded on save and attached to the resulting activity by time
  // window (the .fit becomes an Activity asynchronously, so there's no id yet).
  const [photos, setPhotos] = useState([]);
  const addPhoto = useCallback((dataUrl) => {
    if (!dataUrl) return;
    const id = (globalThis.crypto?.randomUUID?.() ?? `p-${Date.now()}-${Math.random()}`);
    setPhotos((ps) => [...ps, { id, dataUrl, capturedUtc: Date.now() }]);
  }, []);
  const removePhoto = useCallback((id) => setPhotos((ps) => ps.filter((p) => p.id !== id)), []);

  const source = useRef(null);
  const startedAtRef = useRef(null); // fallback ride start before the first GPS fix lands
  const wakeLock = useRef(null);
  const prevCoord = useRef(null);
  const lastSampleTs = useRef(null); // for integrating indoor distance from sensor speed (no GPS)
  const distMeters = useRef(0);
  const lastPush = useRef(0);

  // Full-resolution capture + running summary aggregates for the FIT encode.
  const samples = useRef([]);
  const agg = useRef(null);

  const resetCapture = () => {
    distMeters.current = 0; prevCoord.current = null; lastSampleTs.current = null; lastPush.current = 0;
    autoPausedRef.current = false; pausedMsRef.current = 0; pauseStartRef.current = null; resumeStartRef.current = null; setAutoPaused(false);
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
    const nowTs = s.ts ?? Date.now();

    // GPS quality gate (after the first fix): drop OS-reported poor-accuracy readings and implausible
    // "teleport" jumps so they don't zig-zag the track or inflate distance while barely moving.
    if (s.lat != null && s.lon != null && prevCoord.current) {
      if (s.accuracy != null && s.accuracy > GPS_ACCURACY_MAX_M) return;
      const jump = haversineMeters(prevCoord.current, s);
      const dtS = lastSampleTs.current != null ? (nowTs - lastSampleTs.current) / 1000 : 0;
      if (dtS > 0 && dtS < 30 && jump / dtS > GPS_MAX_JUMP_MPS) return;
    }

    const speedKph = s.speedMps != null ? mpsToKph(s.speedMps) : null;

    // Auto-pause: when moving speed drops near zero, pause (freeze distance + the elapsed clock);
    // resume only after speed holds above the resume threshold for a sustained 5 s.
    const ap = apCfgRef.current;
    if (ap?.enabled) {
      const kph = speedKph ?? 0;
      if (!autoPausedRef.current) {
        if (kph < (ap.pauseKph ?? 2)) { autoPausedRef.current = true; pauseStartRef.current = nowTs; resumeStartRef.current = null; setAutoPaused(true); }
      } else if (kph > (ap.resumeKph ?? 4)) {
        if (resumeStartRef.current == null) resumeStartRef.current = nowTs;
        else if (nowTs - resumeStartRef.current >= 5000) {
          pausedMsRef.current += Math.max(0, nowTs - (pauseStartRef.current ?? nowTs)); // bank the paused span
          autoPausedRef.current = false; pauseStartRef.current = null; resumeStartRef.current = null; setAutoPaused(false);
        }
      } else {
        resumeStartRef.current = null; // dropped back below resume — restart the 5 s sustain
      }
    }

    // Distance from GPS when we have a fix (haversine between consecutive points); indoors there's
    // no position, so integrate it from the sensor's instantaneous speed instead (speed × Δt). While
    // auto-paused we still track position (so the map dot stays put) but stop counting distance.
    if (s.lat != null && s.lon != null) {
      if (prevCoord.current && !autoPausedRef.current) distMeters.current += haversineMeters(prevCoord.current, s);
      prevCoord.current = { lat: s.lat, lon: s.lon };
    } else if (s.speedMps != null && s.speedMps > 0 && !autoPausedRef.current) {
      const prevTs = lastSampleTs.current;
      if (prevTs != null) { const dt = (nowTs - prevTs) / 1000; if (dt > 0 && dt < 10) distMeters.current += s.speedMps * dt; }
    }
    lastSampleTs.current = nowTs;
    const km = distMeters.current / 1000;
    setDistanceKm(km);

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
        driver: driverRef.current,
      });
    }
  }, [pushTelemetry, sensors, throttleMs]);

  // Open the location source (native background source or web watch + Wake Lock) and begin
  // feeding onSample. Shared by a fresh start() and by resuming a recording after a reload.
  const openSource = useCallback(async () => {
    if (indoor) {
      // Indoor (trainer / treadmill): no GPS — drive distance from the paired sensors' speed.
      const { createSensorLocationSource } = await import('../lib/locationSource.sensor.js');
      source.current = createSensorLocationSource(sensors);
      setMode('indoor');
      await acquireWakeLock();
    } else if (isNativePlatform()) {
      const { createNativeLocationSource } = await import('../lib/locationSource.native.js');
      source.current = await createNativeLocationSource();
      setMode('native');
    } else {
      source.current = createWebLocationSource();
      setMode('web');
      await acquireWakeLock(); // keep the screen alive so the foreground watch survives
    }
    source.current.start(onSample, (err) => setError(err?.message || 'Location error'));
  }, [onSample, acquireWakeLock, indoor, sensors]);

  const start = useCallback(async () => {
    setError(null);
    setPending(null); setSaveState('idle'); setSaveError(null); setPhotos([]);
    resetCapture(); setDistanceKm(0); setElapsedSec(0);
    startedAtRef.current = Date.now();
    clearDraft(); // a fresh ride supersedes any recovered draft
    try {
      await openSource();
      setRecording(true);
    } catch (e) {
      setError(e?.message || 'Could not start recording');
    }
  }, [openSource]);

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

    // A driver/escort ride isn't a workout — discard it instead of offering to save (never
    // uploaded, so it can't land as a bike activity). The live stream already served the group.
    if (driverRef.current) {
      clearDraft(); resetCapture(); setDistanceKm(0); setElapsedSec(0); setPhotos([]);
      setPending(null); setSaveState('idle'); setSaveError(null);
      onEndedRef.current?.(); // no save card for a driver ride — end the session so we return to the lobby
      return;
    }

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

      // Upload any photos taken during the ride. They carry a real capture time,
      // clamped into the ride's [start, end] window so the backend resolves them to
      // this activity. Best-effort: a photo failure doesn't fail the ride save.
      if (photos.length) {
        const startMs = pending.startMs ?? 0;
        const endMs = pending.endMs ?? Date.now();
        for (const ph of photos) {
          const capturedUtc = Math.min(Math.max(ph.capturedUtc, startMs), endMs);
          try { await uploadActivityPhoto(token, ph.dataUrl, { capturedUtc }); } catch { /* ignore */ }
        }
      }

      setSaveState('saved');
      samples.current = [];
      setPhotos([]);
      clearDraft(); // uploaded — no longer recoverable
      if (result?.status !== 'already-received') onSaved?.();
    } catch (e) {
      setSaveState('error');
      setSaveError(e?.message || 'Could not save the ride.');
    }
  }, [pending, getToken, onSaved, photos]);

  // The recorded track so far as a decimated [lat, lon] array (capped for the live map). Read on
  // the tick by useRideTelemetry, so the breadcrumb grows as you ride. Empty until the first fix.
  const getPath = useCallback((max = 400) => {
    const s = samples.current;
    if (!s.length) return [];
    const step = Math.max(1, Math.ceil(s.length / max));
    const out = [];
    for (let i = 0; i < s.length; i += step) out.push([s[i].lat, s[i].lon]);
    const last = s[s.length - 1];
    if (out.length === 0 || out[out.length - 1][0] !== last.lat || out[out.length - 1][1] !== last.lon) {
      out.push([last.lat, last.lon]);
    }
    return out;
  }, []);

  const discardRide = useCallback(() => {
    samples.current = []; agg.current = null; startedAtRef.current = null;
    clearDraft();
    setPending(null); setSaveState('idle'); setSaveError(null); setDistanceKm(0); setElapsedSec(0); setPhotos([]);
    onEndedRef.current?.(); // ride is done (discarded, or dismissed after saving) — end the session
  }, []);

  // Tick the live elapsed (wall-clock) time once a second while recording. Anchored to the
  // first fix (agg.startMs) so it survives a reload/resume; falls back to the start() moment
  // until that first fix lands.
  useEffect(() => {
    if (!recording) return undefined;
    const tick = () => {
      const base = agg.current?.startMs ?? startedAtRef.current;
      // Exclude auto-paused time (banked + any in-progress pause) so the clock freezes when stopped.
      const pausedMs = pausedMsRef.current + (autoPausedRef.current && pauseStartRef.current ? Date.now() - pauseStartRef.current : 0);
      setElapsedSec(base ? Math.max(0, Math.round((Date.now() - base - pausedMs) / 1000)) : 0);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [recording]);

  // Restore a persisted ride once on boot (see lib/rideDraft.js). A fresh in-progress ride
  // resumes recording (re-arms the GPS + Wake Lock and keeps appending to the same buffer);
  // a stale or already-stopped one comes back as a pending save/discard card so nothing is
  // lost. Runs once the recorder is enabled (i.e. signed in) — never when signed out.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || !enabled) return;
    restoredRef.current = true;
    const draft = loadDraft();
    const how = draftMode(draft);
    console.log('[RIDEDIAG] restore: hasDraft=', !!draft, 'recording=', draft?.recording,
      'pending=', !!draft?.pending, 'ageMs=', draft ? Date.now() - (draft.savedAt || 0) : null, 'how=', how);
    if (!how) return;
    samples.current = draft.samples || [];
    agg.current = draft.agg || null;
    distMeters.current = draft.distMeters || 0;
    prevCoord.current = draft.prevCoord || null;
    startedAtRef.current = draft.startedAtMs ?? draft.agg?.startMs ?? null;
    lastPush.current = 0;
    setDistanceKm((draft.distMeters || 0) / 1000);
    if (how === 'resume') {
      setRecording(true);
      openSource().catch((e) => setError(e?.message || 'Could not resume recording after reload'));
    } else {
      setPending(draft.pending || {
        startMs: agg.current?.startMs ?? null,
        endMs: agg.current?.lastTs ?? null,
        sport: draft.sport ?? sport,
        sampleCount: samples.current.length,
        summary: buildSummary(),
      });
      setSaveState('idle'); setSaveError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Mirror the ride to storage so a refresh/crash can recover it. While recording we flush
  // periodically (crash safety) and, crucially, on pagehide/visibility-hidden so the very
  // latest buffer is captured right before a reload. A stopped-but-unsaved ride is persisted
  // once (it no longer changes). Cleared on save/discard/fresh-start elsewhere.
  useEffect(() => {
    if (!enabled) return undefined;
    const snapshot = (isRecording) => ({
      savedAt: Date.now(),
      recording: isRecording,
      mode,
      sport,
      distMeters: distMeters.current,
      prevCoord: prevCoord.current,
      startedAtMs: startedAtRef.current,
      agg: agg.current,
      samples: samples.current,
      pending: isRecording ? null : pending,
    });
    if (recording) {
      const flush = () => { console.log('[RIDEDIAG] flush recording draft'); saveDraft(snapshot(true)); };
      flush();
      const id = setInterval(flush, 8000);
      const onHide = () => { console.log('[RIDEDIAG] visibilitychange hidden=', document.hidden); if (document.hidden) flush(); };
      const onPageHide = () => { console.log('[RIDEDIAG] pagehide'); flush(); };
      document.addEventListener('visibilitychange', onHide);
      window.addEventListener('pagehide', onPageHide);
      return () => {
        clearInterval(id);
        document.removeEventListener('visibilitychange', onHide);
        window.removeEventListener('pagehide', onPageHide);
      };
    }
    if (pending && saveState !== 'saved') saveDraft(snapshot(false));
    return undefined;
  }, [enabled, recording, pending, mode, sport, saveState]);

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
    recording, paused, autoPaused, distanceKm, elapsedSec, lastFix, error, mode, start, stop,
    pending, saveState, saveError, saveRide, discardRide,
    photos, addPhoto, removePhoto,
    getPath,
  };
}
