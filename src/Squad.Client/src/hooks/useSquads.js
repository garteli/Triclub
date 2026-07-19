import { useCallback, useEffect, useState } from 'react';
import { listSquads, mapSquad } from '../lib/squads.js';

// Fetches the squad list (Discover) and maps to the Group-screen shape. Refetches
// when refreshSignal bumps (e.g. after a join/create) so membership flags update.
export function useSquads({ getToken, enabled = true, refreshSignal } = {}) {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'

  const refetch = useCallback(async () => {
    if (!enabled) return;
    try {
      const token = getToken ? await getToken() : null;
      const rows = await listSquads(token);
      setItems(Array.isArray(rows) ? rows.map(mapSquad) : []);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [getToken, enabled]);

  useEffect(() => { refetch(); }, [refetch, refreshSignal]);

  return { items, status, refetch };
}
