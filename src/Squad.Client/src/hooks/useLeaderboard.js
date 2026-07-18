import { useCallback, useEffect, useState } from 'react';

// Maps a server LeaderboardRow to the exact shape the Leaderboard screen already
// renders (see buildViewModel's leaderboard section), so switching from the seed
// data to live data is a drop-in. Server sends per-discipline *load*; the tabs
// labelled Swim/Bike/Run rank on those.
export function mapLeaderboardRows(server) {
  return (server ?? []).map((r) => ({
    name: r.name,
    initials: r.initials,
    color: r.color,
    you: r.you,
    load: Math.round(r.load),
    vol: `${r.volumeHours.toFixed(1)}h`,
    streak: r.streak,
    swim: Math.round(r.swimLoad),
    bike: Math.round(r.bikeLoad),
    run: Math.round(r.runLoad),
    move: r.move,
    badge: r.you ? '⚡' : '',
  }));
}

// Fetches the weekly board and re-fetches whenever `refreshSignal` changes — pair it
// with useSquadFeed's onLeaderboardChanged so an ingested activity updates the ranks live.
export function useLeaderboard(squadId, { getToken, refreshSignal } = {}) {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'

  const refetch = useCallback(async () => {
    if (!squadId) return;
    try {
      const token = getToken ? await getToken() : null;
      const res = await fetch(`/api/squads/${squadId}/leaderboard`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error(`Leaderboard ${res.status}`);
      setRows(mapLeaderboardRows(await res.json()));
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [squadId, getToken]);

  useEffect(() => { refetch(); }, [refetch, refreshSignal]);

  return { rows, status, refetch };
}
