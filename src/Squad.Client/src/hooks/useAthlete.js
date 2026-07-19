import { useCallback, useEffect, useState } from 'react';

const isGuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const ago = (iso) => {
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  const m = Math.floor(secs / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// Maps the server athlete-detail payload to the shape AthleteProfile renders (vm.athlete).
function mapAthlete(d) {
  return {
    id: d.id, isMe: d.isMe, following: d.isFollowing,
    name: d.name, initials: d.initials, color: d.color,
    club: d.club || '', ageGroup: d.ageGroup || '',
    sport: d.sport || 'Triathlon', level: d.level || '',
    ftp: d.ftp ?? '', weekly: d.weekly || '—', bio: d.bio || '',
    rank: d.rank || 0,
    streak: d.streak || 0,
    pct: Math.min(100, Math.round((d.volumeHours || 0) * 10)), // volume vs a ~10h/wk proxy
    loads: [
      { key: 'swim', label: 'Swim', color: 'var(--swim)', v: d.loads?.swim || 0 },
      { key: 'bike', label: 'Bike', color: 'var(--bike)', v: d.loads?.bike || 0 },
      { key: 'run', label: 'Run', color: 'var(--run)', v: d.loads?.run || 0 },
    ],
    recent: (d.recent || []).map((f) => ({
      id: f.id, action: f.action, metric: f.metric, time: ago(f.startUtc),
      icon: f.icon, discColor: f.discColor, activityId: f.id,
    })),
  };
}

// Fetches a teammate's profile by id (only when it's a real athlete GUID + signed in).
// Returns the mapped athlete plus follow/unfollow that update local state optimistically.
export function useAthlete({ id, getToken, enabled = true } = {}) {
  const [athlete, setAthlete] = useState(null);
  const live = enabled && !!getToken && isGuid(id);

  const load = useCallback(async () => {
    if (!live) { setAthlete(null); return; }
    try {
      const token = await getToken();
      const res = await fetch(`/api/athletes/${id}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (!res.ok) { setAthlete(null); return; }
      setAthlete(mapAthlete(await res.json()));
    } catch { setAthlete(null); }
  }, [id, getToken, live]);

  useEffect(() => { load(); }, [load]);

  const setFollow = useCallback(async (follow) => {
    if (!live) return;
    setAthlete((a) => (a ? { ...a, following: follow } : a)); // optimistic
    try {
      const token = await getToken();
      await fetch(`/api/athletes/${id}/follow`, {
        method: follow ? 'POST' : 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
    } catch {
      setAthlete((a) => (a ? { ...a, following: !follow } : a)); // revert on failure
    }
  }, [id, getToken, live]);

  return { athlete, live: live && !!athlete, follow: () => setFollow(true), unfollow: () => setFollow(false) };
}
