import { useEffect, useState } from 'react';

// Session cache of fetched detail, keyed by activityId, so a card re-mounting (scroll /
// tab switch) or several views of the same activity don't refetch the heavy /track blob
// (which also runs the matched-rides query server-side). A failed fetch is evicted so a
// later view can retry.
const trackCache = new Map(); // activityId -> Promise<{ track, laps, matched }>

export function loadTrack(activityId, token) {
  const cached = trackCache.get(activityId);
  if (cached) return cached;
  const p = (async () => {
    const res = await fetch(`/api/activities/${activityId}/track`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    // { track, laps, matched } is the current shape; tolerate a bare array from older servers.
    return {
      track: Array.isArray(data?.track) ? data.track : (Array.isArray(data) ? data : []),
      laps: Array.isArray(data?.laps) ? data.laps : [],
      matched: Array.isArray(data?.matched) ? data.matched : [],
    };
  })();
  trackCache.set(activityId, p);
  p.catch(() => trackCache.delete(activityId));
  return p;
}

// Fetches one activity's recorded detail from GET /api/activities/{id}/track — the route +
// per-point heart-rate/power/elevation/speed track, device laps (the heavy blob the list
// omits), and the squad-mates who rode the same place + time. Returns { track, laps, matched, status }:
//   track:   null while loading, [] when there's none (indoor / not visible), else the points.
//   laps:    [] unless the recording carried ≥2 laps.
//   matched: [] unless teammates rode alongside (each { activityId, athleteId, athleteName,
//            initials, avatarColor, distanceMeters, movingTimeSec, avgHeartRate, avatarUrl }).
export function useActivityTrack(activityId, { getToken, enabled = true } = {}) {
  const [track, setTrack] = useState(null);
  const [laps, setLaps] = useState([]);
  const [matched, setMatched] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'

  useEffect(() => {
    if (!enabled || !activityId) { setTrack([]); setLaps([]); setMatched([]); setStatus('ready'); return; }
    let cancelled = false;
    setStatus('loading');
    setTrack(null);
    setLaps([]);
    setMatched([]);
    (async () => {
      try {
        const token = getToken ? await getToken() : null;
        const { track: t, laps: l, matched: m } = await loadTrack(activityId, token);
        if (!cancelled) { setTrack(t); setLaps(l); setMatched(m); setStatus('ready'); }
      } catch {
        if (!cancelled) { setTrack([]); setLaps([]); setMatched([]); setStatus('error'); }
      }
    })();
    return () => { cancelled = true; };
    // getToken is derived from the session and stable across a signed-in run; refetch only
    // when the activity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId, enabled]);

  return { track, laps, matched, status };
}
