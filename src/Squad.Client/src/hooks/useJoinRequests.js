import { useCallback, useEffect, useState } from 'react';
import { listRequests, approveRequest, declineRequest } from '../lib/squads.js';
import { listMyEventRequests, approveEventRequest, declineEventRequest } from '../lib/events.js';

const ago = (iso) => {
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  const m = Math.floor(secs / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const eventWhen = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

// Owner-side pending requests across the caller's squads: group-join requests (join the whole squad)
// and event-join requests (a non-member asking into a single session). Both approve/decline inline.
export function useJoinRequests({ getToken, enabled = true } = {}) {
  const [items, setItems] = useState([]);         // group-join requests
  const [eventItems, setEventItems] = useState([]); // event-join requests (non-members)
  const [ready, setReady] = useState(false);

  const refetch = useCallback(async () => {
    if (!enabled) return;
    try {
      const token = await getToken();
      const [rows, evRows] = await Promise.all([
        listRequests(token),
        listMyEventRequests(token).catch(() => []),
      ]);
      setItems((Array.isArray(rows) ? rows : []).map((r) => ({
        squadId: r.squadId, squadName: r.squadName,
        athleteId: r.athleteId, name: r.athleteName, initials: r.initials, color: r.avatarColor,
        ftp: r.ftp ?? '—', weekly: r.weeklyHours || '—', when: ago(r.createdUtc),
      })));
      setEventItems((Array.isArray(evRows) ? evRows : []).map((r) => ({
        squadId: r.squadId, eventId: r.eventId, eventTitle: r.eventTitle, eventWhen: eventWhen(r.start),
        athleteId: r.athleteId, name: r.athleteName, initials: r.initials, color: r.avatarColor,
        avatarUrl: r.avatarUrl, when: ago(r.requestedUtc),
      })));
      setReady(true);
    } catch { /* offline */ }
  }, [getToken, enabled]);

  useEffect(() => { refetch(); }, [refetch]);

  const decide = useCallback(async (fn, squadId, athleteId) => {
    setItems((prev) => prev.filter((r) => !(r.squadId === squadId && r.athleteId === athleteId))); // optimistic remove
    try { await fn(await getToken(), squadId, athleteId); } catch { refetch(); }
  }, [getToken, refetch]);

  const decideEvent = useCallback(async (fn, squadId, eventId, athleteId) => {
    setEventItems((prev) => prev.filter((r) => !(r.eventId === eventId && r.athleteId === athleteId))); // optimistic
    try { await fn(await getToken(), squadId, eventId, athleteId); } catch { refetch(); }
  }, [getToken, refetch]);

  return {
    items, eventItems, ready: ready && enabled,
    approve: (sq, a) => decide(approveRequest, sq, a),
    decline: (sq, a) => decide(declineRequest, sq, a),
    approveEvent: (sq, ev, a) => decideEvent(approveEventRequest, sq, ev, a),
    declineEvent: (sq, ev, a) => decideEvent(declineEventRequest, sq, ev, a),
  };
}
