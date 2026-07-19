import { useCallback, useState } from 'react';
import { healthKitAvailable, syncAppleHealth } from '../lib/health.js';

// Drives an Apple Health import: exposes availability, a run() trigger, and live
// status/progress for the UI. Safe to mount on web — `available` is just false there.
export function useHealthSync({ getToken, onDataChanged } = {}) {
  const available = healthKitAvailable();
  const [status, setStatus] = useState('idle'); // idle | syncing | done | error
  const [progress, setProgress] = useState(null); // { done, total, queued, duplicates, failed }
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  const run = useCallback(async ({ since } = {}) => {
    if (!available || status === 'syncing') return;
    setStatus('syncing');
    setError(null);
    setSummary(null);
    setProgress({ done: 0, total: 0, queued: 0, duplicates: 0, failed: 0 });
    try {
      const result = await syncAppleHealth({ since, getToken, onProgress: setProgress });
      setSummary(result);
      setStatus('done');
      if (result.queued > 0) onDataChanged?.();
    } catch (err) {
      setError(err.message || 'Sync failed.');
      setStatus('error');
    }
  }, [available, status, getToken, onDataChanged]);

  return { available, status, progress, summary, error, run };
}
