import { useCallback, useEffect, useState } from 'react';

// Maps a server ClubRankingRow to the shape the ClubRanking screen renders. Volume
// keeps both the numeric hours (for sorting the Volume tab) and a display string.
export function mapClubRows(server) {
  return (server ?? []).map((r) => ({
    id: r.squadId,
    name: r.name,
    initials: r.initials,
    color: r.color,
    disc: r.discipline, // the club's discipline — scopes the board to same-discipline peers
    emblem: r.emblem, // peak | wave | wheel | bolt (decorative glyph)
    you: r.you,
    load: Math.round(r.load),
    volHours: r.volumeHours,
    vol: `${Math.round(r.volumeHours)}h`,
    members: r.members,
    streak: r.streak,
    move: r.move,
  }));
}

// Fetches the weekly cross-club board and re-fetches whenever `refreshSignal` changes —
// pair it with the shared data-refresh signal so an ingested activity updates the ranks.
export function useClubRanking({ getToken, refreshSignal, enabled = true } = {}) {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'

  const refetch = useCallback(async () => {
    if (!enabled) return;
    try {
      const token = getToken ? await getToken() : null;
      const res = await fetch('/api/clubs/ranking', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error(`Club ranking ${res.status}`);
      setRows(mapClubRows(await res.json()));
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [enabled, getToken]);

  useEffect(() => { refetch(); }, [refetch, refreshSignal]);

  return { rows, status, refetch };
}
