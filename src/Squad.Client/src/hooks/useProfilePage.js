import { useCallback, useEffect, useState } from 'react';

// Loads the signed-in athlete's Profile page from the backend (identity + this-week
// standing + everything derived from their real activities + their goal race), and
// exposes goal mutations. Mirrors the useLeaderboard fetch pattern: token from
// getToken(), root-relative /api path (apiBase rewrites it on native), Bearer header.
export function useProfilePage({ getToken, enabled = true } = {}) {
  const [page, setPage] = useState(null);
  const [status, setStatus] = useState('loading');

  const refetch = useCallback(async () => {
    if (!enabled || !getToken) { setStatus('idle'); return; }
    try {
      const token = await getToken();
      if (!token) { setStatus('idle'); return; }
      const res = await fetch('/api/profile/page', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Profile ${res.status}`);
      setPage(await res.json());
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [getToken, enabled]);

  useEffect(() => { refetch(); }, [refetch]);

  // Set the goal race from an event URL (the AI extracts name/date/location) or from
  // explicit fields. Throws with the server's message on failure so the UI can show it.
  const setGoal = useCallback(async (body) => {
    const token = getToken ? await getToken() : null;
    const res = await fetch('/api/profile/goal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) throw new Error(data?.error || `Couldn't set the goal (${res.status}).`);
    setPage((prev) => (prev ? { ...prev, goal: data } : prev));
    return data;
  }, [getToken]);

  const clearGoal = useCallback(async () => {
    const token = getToken ? await getToken() : null;
    await fetch('/api/profile/goal', {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    setPage((prev) => (prev ? { ...prev, goal: null } : prev));
  }, [getToken]);

  return { page, status, refetch, setGoal, clearGoal };
}
