import { useCallback, useEffect, useRef, useState } from 'react';
import {
  garminAvailable, garminHasSession, garminLogin, garminLoginWebView, garminLogout, syncGarmin,
} from '../lib/garmin.js';

// Drives Garmin Connect: login/logout, "is a session persisted?", a run() sync trigger,
// and live status/progress for the UI. Mirrors useHealthSync. Safe to mount on web —
// `available` is just false there.
//
// syncOnLaunch:true runs one sync automatically once, as soon as a persisted session is
// found — this is the "sync activities every time the app launches" behaviour. The parent
// mounts this hook near the app root and passes getToken (the app JWT accessor).
export function useGarminSync({ getToken, onDataChanged, syncOnLaunch = false } = {}) {
  const available = garminAvailable();
  const [connected, setConnected] = useState(false);     // a restorable session exists
  const [status, setStatus] = useState('idle');          // idle | syncing | done | error
  const [progress, setProgress] = useState(null);        // { done, total, queued, duplicates, failed }
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const launchedRef = useRef(false);

  // Reflect persisted-session state on mount.
  useEffect(() => {
    if (!available) return;
    let alive = true;
    garminHasSession().then((has) => { if (alive) setConnected(has); }).catch(() => {});
    return () => { alive = false; };
  }, [available]);

  const run = useCallback(async ({ force = false } = {}) => {
    if (!available || status === 'syncing') return;
    setStatus('syncing');
    setError(null);
    setSummary(null);
    setProgress({ done: 0, total: 0, queued: 0, duplicates: 0, failed: 0 });
    try {
      const result = await syncGarmin({ getToken, onProgress: setProgress, force });
      if (result?.skipped) { setConnected(false); setStatus('idle'); return; }
      setSummary(result);
      setStatus('done');
      if (result.queued > 0) onDataChanged?.();
    } catch (err) {
      setError(err.message || 'Garmin sync failed.');
      setStatus('error');
    }
  }, [available, status, getToken, onDataChanged]);

  const login = useCallback(async ({ username, password, rememberCredentials } = {}) => {
    setError(null);
    await garminLogin({ username, password, rememberCredentials });
    setConnected(true);
    return run({ force: false });
  }, [run]);

  const loginWebView = useCallback(async () => {
    setError(null);
    await garminLoginWebView();
    setConnected(true);
    return run({ force: false });
  }, [run]);

  const logout = useCallback(async () => {
    await garminLogout();
    setConnected(false);
    setStatus('idle');
    setSummary(null);
    setProgress(null);
  }, []);

  // Auto-sync once on launch, only if a session is already persisted.
  useEffect(() => {
    if (!available || !syncOnLaunch || launchedRef.current || !connected) return;
    launchedRef.current = true;
    run({ force: false });
  }, [available, syncOnLaunch, connected, run]);

  return { available, connected, status, progress, summary, error, run, login, loginWebView, logout };
}
