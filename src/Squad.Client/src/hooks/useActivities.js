import { useCallback, useEffect, useState } from 'react';

// Maps a server ActivitySummaryRow to the exact activity shape buildViewModel's
// enrichAct/activityDetail/activityAnalysis already consume (see data/squadData.js),
// so switching the Activities screen from seed to live data is a drop-in. Metrics
// the DB doesn't have yet (reactions, comments, achievements, GPS location) default
// to empty — the synthetic per-activity analysis charts stay (seeded by id).

const SPORTS = ['Gym', 'Swim', 'Bike', 'Run']; // ActivitySport: 0=Other→Gym, 1=Swim, 2=Bike, 3=Run
const TITLES = { Bike: 'Ride', Run: 'Run', Swim: 'Swim', Gym: 'Session' };

const pace = (secPerUnit) => {
  if (!isFinite(secPerUnit) || secPerUnit <= 0) return '—';
  const s = Math.round(secPerUnit);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const dur = (sec) => {
  const s = Math.round(sec || 0);
  if (s >= 3600) return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const ago = (iso) => {
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  const m = Math.floor(secs / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

export function mapActivity(r) {
  const sport = SPORTS[r.sport] ?? 'Gym';
  const isSwim = sport === 'Swim';
  const meters = r.distanceMeters || 0;
  const sec = r.movingTimeSec || 0;

  let dist = '0', distU = '';
  if (meters > 0) {
    if (isSwim) { dist = Math.round(meters).toLocaleString(); distU = 'm'; }
    else { dist = (meters / 1000).toFixed(1); distU = 'km'; }
  }

  let avgSpeed = '—', speedU = '';
  if (meters > 0 && sec > 0) {
    if (sport === 'Bike') { avgSpeed = ((meters / 1000) / (sec / 3600)).toFixed(1); speedU = 'kph'; }
    else if (sport === 'Run') { avgSpeed = pace(sec / (meters / 1000)); speedU = '/km'; }
    else if (isSwim) { avgSpeed = pace(sec / (meters / 100)); speedU = '/100'; }
  }

  return {
    id: r.id,
    athleteId: r.athleteId,
    athleteName: r.athleteName,
    initials: r.initials,
    color: r.avatarColor,
    avatarUrl: r.avatarUrl ?? null,
    isMe: !!r.isMe,
    title: TITLES[sport] || 'Session',
    sport,
    when: ago(r.startUtc),
    location: '',
    dist, distU,
    moving: dur(sec),
    load: Math.round(r.trainingLoad || 0),
    avgSpeed, speedU,
    elev: Math.round(r.elevationGainM || 0).toLocaleString(),
    avgHr: Math.round(r.avgHeartRate || 0),
    fire: 0, strong: 0, clap: 0, comments: 0, achievements: 0,
  };
}

// Delete one of the caller's own activities. 204 on success; 404 if it isn't yours or
// no longer exists. Caller refreshes the list (onDataChanged / bumped refreshSignal).
export async function deleteActivity(id, token) {
  const res = await fetch(`/api/activities/${id}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok && res.status !== 204) throw new Error(`Delete failed (${res.status})`);
  return true;
}

// Fetches the squad's activities; refetch via the returned fn or a bumped refreshSignal.
export function useActivities({ getToken, enabled = true, refreshSignal } = {}) {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'

  const refetch = useCallback(async () => {
    if (!enabled) return;
    try {
      const token = getToken ? await getToken() : null;
      const res = await fetch('/api/activities', { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (!res.ok) throw new Error(`Activities ${res.status}`);
      const rows = await res.json();
      setItems(Array.isArray(rows) ? rows.map(mapActivity) : []);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [getToken, enabled]);

  useEffect(() => { refetch(); }, [refetch, refreshSignal]);

  return { items, status, refetch };
}
