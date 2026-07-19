import { useEffect, useRef, useState } from 'react';
import * as signalR from '@microsoft/signalr';
import { API_BASE } from '../lib/apiBase.js';

// Subscribes to the squad feed hub. The server auto-joins the connection to the
// caller's squad group from their identity, so we only listen — no group plumbing
// on the client. New activities (posted after the worker parses an upload) arrive
// on 'activityPosted' and are prepended; 'leaderboardChanged' fires onLeaderboardChanged
// so ranked views can refetch.
export function useSquadFeed({ hubUrl = API_BASE + '/hubs/squad', feedUrl = '/api/feed', getToken, initial = [], enabled = true, onLeaderboardChanged } = {}) {
  const [feed, setFeed] = useState(initial);
  const [status, setStatus] = useState('connecting'); // 'connecting' | 'live' | 'offline'
  const cbRef = useRef(onLeaderboardChanged);
  cbRef.current = onLeaderboardChanged;

  // Initial snapshot: the REST feed the hub then tops up live.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const token = getToken ? await getToken() : null;
        const res = await fetch(feedUrl, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
        if (!res.ok) return;
        const items = await res.json();
        if (!cancelled && Array.isArray(items)) {
          // Merge under any live items that already arrived; dedup by id.
          setFeed((prev) => {
            const seen = new Set(prev.map((f) => f.id));
            return [...prev, ...items.filter((i) => !seen.has(i.id))];
          });
        }
      } catch { /* offline — hub may still connect */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedUrl, enabled]);

  useEffect(() => {
    if (!enabled) { setStatus('offline'); return; }
    const conn = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, getToken ? { accessTokenFactory: () => Promise.resolve(getToken()) } : undefined)
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    conn.on('activityPosted', (item) => {
      // Guard against a duplicate id if a reconnect replays anything.
      setFeed((prev) => (prev.some((f) => f.id === item.id) ? prev : [item, ...prev].slice(0, 50)));
    });
    conn.on('leaderboardChanged', () => cbRef.current?.());

    conn.onreconnecting(() => setStatus('connecting'));
    conn.onreconnected(() => setStatus('live'));
    conn.onclose(() => setStatus('offline'));

    let cancelled = false;
    conn
      .start()
      .then(() => { if (!cancelled) setStatus('live'); })
      .catch(() => { if (!cancelled) setStatus('offline'); });

    return () => { cancelled = true; conn.stop(); };
    // hubUrl/enabled are the stable identity; getToken/onLeaderboardChanged are read via refs/closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubUrl, enabled]);

  return { feed, status };
}
