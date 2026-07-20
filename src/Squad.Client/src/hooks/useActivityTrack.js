import { useEffect, useState } from 'react';

// Fetches one activity's recorded detail from GET /api/activities/{id}/track — the route +
// per-point heart-rate/power/elevation/speed track, plus device laps (the heavy blob the
// list omits). Returns { track, laps, status }:
//   track: null while loading, [] when there's none (indoor / not visible), else the points.
//   laps:  [] unless the recording carried ≥2 laps.
export function useActivityTrack(activityId, { getToken, enabled = true } = {}) {
  const [track, setTrack] = useState(null);
  const [laps, setLaps] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'

  useEffect(() => {
    if (!enabled || !activityId) { setTrack([]); setLaps([]); setStatus('ready'); return; }
    let cancelled = false;
    setStatus('loading');
    setTrack(null);
    setLaps([]);
    (async () => {
      try {
        const token = getToken ? await getToken() : null;
        const res = await fetch(`/api/activities/${activityId}/track`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        // { track, laps } is the current shape; tolerate a bare array from older servers.
        const t = Array.isArray(data?.track) ? data.track : (Array.isArray(data) ? data : []);
        const l = Array.isArray(data?.laps) ? data.laps : [];
        if (!cancelled) { setTrack(t); setLaps(l); setStatus('ready'); }
      } catch {
        if (!cancelled) { setTrack([]); setLaps([]); setStatus('error'); }
      }
    })();
    return () => { cancelled = true; };
    // getToken is derived from the session and stable across a signed-in run; refetch only
    // when the activity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId, enabled]);

  return { track, laps, status };
}
