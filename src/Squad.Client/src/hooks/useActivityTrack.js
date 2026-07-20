import { useEffect, useState } from 'react';

// Fetches one activity's full recorded track — the route plus per-point heart-rate, power,
// elevation and speed — from GET /api/activities/{id}/track (the heavy blob the list omits).
//   track: null while loading, [] when there's none (indoor / not visible), else the points.
export function useActivityTrack(activityId, { getToken, enabled = true } = {}) {
  const [track, setTrack] = useState(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'

  useEffect(() => {
    if (!enabled || !activityId) { setTrack([]); setStatus('ready'); return; }
    let cancelled = false;
    setStatus('loading');
    setTrack(null);
    (async () => {
      try {
        const token = getToken ? await getToken() : null;
        const res = await fetch(`/api/activities/${activityId}/track`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) throw new Error(String(res.status));
        const pts = await res.json();
        if (!cancelled) { setTrack(Array.isArray(pts) ? pts : []); setStatus('ready'); }
      } catch {
        if (!cancelled) { setTrack([]); setStatus('error'); }
      }
    })();
    return () => { cancelled = true; };
    // getToken is derived from the session and stable across a signed-in run; refetch only
    // when the activity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId, enabled]);

  return { track, status };
}
