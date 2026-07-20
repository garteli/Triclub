import { useCallback, useEffect, useState } from 'react';

// Photos for one activity — those explicitly attached to it plus in-ride captures
// resolved by time window (see the backend). Each item: { id, url, capturedUtc }.
// The url is the authenticated proxy path; render it through <AuthedImage>.
export function useActivityPhotos(activityId, { getToken, enabled = true, refreshSignal } = {}) {
  const [photos, setPhotos] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'

  const refetch = useCallback(async () => {
    if (!enabled || !activityId) { setPhotos([]); setStatus('ready'); return; }
    try {
      const token = getToken ? await getToken() : null;
      const res = await fetch(`/api/activities/${activityId}/photos`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error(`Photos ${res.status}`);
      const rows = await res.json();
      setPhotos(Array.isArray(rows) ? rows : []);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [activityId, getToken, enabled]);

  useEffect(() => { refetch(); }, [refetch, refreshSignal]);

  return { photos, status, refetch };
}
