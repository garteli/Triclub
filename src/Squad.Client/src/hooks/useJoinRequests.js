import { useCallback, useEffect, useState } from 'react';
import { listRequests, approveRequest, declineRequest } from '../lib/squads.js';

const ago = (iso) => {
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  const m = Math.floor(secs / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// Owner-side pending join requests across the caller's squads, with approve/decline.
export function useJoinRequests({ getToken, enabled = true } = {}) {
  const [items, setItems] = useState([]);
  const [ready, setReady] = useState(false);

  const refetch = useCallback(async () => {
    if (!enabled) return;
    try {
      const token = await getToken();
      const rows = await listRequests(token);
      setItems((Array.isArray(rows) ? rows : []).map((r) => ({
        squadId: r.squadId, squadName: r.squadName,
        athleteId: r.athleteId, name: r.athleteName, initials: r.initials, color: r.avatarColor,
        ftp: r.ftp ?? '—', weekly: r.weeklyHours || '—', when: ago(r.createdUtc),
      })));
      setReady(true);
    } catch { /* offline */ }
  }, [getToken, enabled]);

  useEffect(() => { refetch(); }, [refetch]);

  const decide = useCallback(async (fn, squadId, athleteId) => {
    setItems((prev) => prev.filter((r) => !(r.squadId === squadId && r.athleteId === athleteId))); // optimistic remove
    try { await fn(await getToken(), squadId, athleteId); } catch { refetch(); }
  }, [getToken, refetch]);

  return {
    items, ready: ready && enabled,
    approve: (sq, a) => decide(approveRequest, sq, a),
    decline: (sq, a) => decide(declineRequest, sq, a),
  };
}
