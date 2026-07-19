import { useCallback, useEffect, useState } from 'react';

const ago = (iso) => {
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  const m = Math.floor(secs / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// kind -> icon key (see Notifications.jsx ICONS) + accent color.
const KIND = {
  follow:   { icon: 'heart', color: '#ff6f61' },
  join:     { icon: 'bike', color: '#37c0ff' },
  message:  { icon: 'chat', color: '#5a86ff' },
  activity: { icon: 'trophy', color: '#ffce4a' },
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
    athlete: n.actorId || null, // openAthlete target for follow/join
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

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, unread: false }))); // optimistic
    try {
      const token = getToken ? await getToken() : null;
      await fetch('/api/notifications/read', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : undefined });
    } catch { /* will reconcile on next refetch */ }
  }, [getToken]);

  return { items, ready: ready && enabled, refetch, markAllRead };
}
