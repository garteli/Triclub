import { useCallback, useEffect, useState } from 'react';

const ago = (iso) => {
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  const m = Math.floor(secs / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// kind -> icon key (see Notifications.jsx ICONS) + accent color. `target` navigates to a screen
// on tap (instead of opening the actor's athlete profile).
const KIND = {
  follow:   { icon: 'heart', color: '#ff6f61' },
  join:     { icon: 'bike', color: '#37c0ff' },
  // A join request (group or event) is the owner's to act on — send them to the requests inbox
  // (where they can approve/decline), not to the requester's profile.
  request:  { icon: 'clipboard', color: '#ffce4a', target: 'requests' },
  approved: { icon: 'trophy', color: '#4fe08b' },
  declined: { icon: 'clipboard', color: '#ff6a2c' },
  message:  { icon: 'chat', color: '#5a86ff' },
  activity: { icon: 'trophy', color: '#ffce4a' },
  plan:     { icon: 'calendar', color: 'var(--accent)', target: 'plan' },
  event:    { icon: 'calendar', color: '#37c0ff', target: 'group' },
};

function mapNote(n) {
  const k = KIND[n.kind] || { icon: 'calendar', color: 'var(--accent)' };
  return {
    id: n.id,
    unread: !n.read,
    actor: n.actorName,
    text: n.text,
    time: ago(n.createdUtc),
    icon: k.icon,
    color: k.color,
    // Kinds with a `target` navigate to that screen; the rest open the actor's athlete profile.
    target: k.target || null,
    athlete: k.target ? null : (n.actorId || null),
  };
}

// Fetches the athlete's notifications; markAllRead persists via the API.
export function useNotifications({ getToken, enabled = true } = {}) {
  const [items, setItems] = useState([]);
  const [ready, setReady] = useState(false);

  const refetch = useCallback(async () => {
    if (!enabled) return;
    try {
      const token = getToken ? await getToken() : null;
      const res = await fetch('/api/notifications', { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (!res.ok) return;
      const rows = await res.json();
      if (Array.isArray(rows)) { setItems(rows.map(mapNote)); setReady(true); }
    } catch { /* offline */ }
  }, [getToken, enabled]);

  useEffect(() => { refetch(); }, [refetch]);

  // Mark a single notification read (on tap). Optimistic — flips it locally so the bell
  // badge updates immediately — then persists. A failure reconciles on the next refetch.
  const markRead = useCallback(async (id) => {
    let wasUnread = false;
    setItems((prev) => prev.map((n) => {
      if (n.id === id && n.unread) { wasUnread = true; return { ...n, unread: false }; }
      return n;
    }));
    if (!wasUnread) return;
    try {
      const token = getToken ? await getToken() : null;
      await fetch(`/api/notifications/${id}/read`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : undefined });
    } catch { /* will reconcile on next refetch */ }
  }, [getToken]);

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, unread: false }))); // optimistic
    try {
      const token = getToken ? await getToken() : null;
      await fetch('/api/notifications/read', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : undefined });
    } catch { /* will reconcile on next refetch */ }
  }, [getToken]);

  return { items, ready: ready && enabled, refetch, markRead, markAllRead };
}
