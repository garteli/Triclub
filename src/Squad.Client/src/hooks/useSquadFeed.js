import { useEffect, useRef, useState } from 'react';
import * as signalR from '@microsoft/signalr';

// Subscribes to the squad feed hub. The server auto-joins the connection to the
// caller's squad group from their identity, so we only listen — no group plumbing
// on the client. New activities (posted after the worker parses an upload) arrive
// on 'activityPosted' and are prepended; 'leaderboardChanged' fires onLeaderboardChanged
// so ranked views can refetch.
export function useSquadFeed({ hubUrl = '/hubs/squad', getToken, initial = [], onLeaderboardChanged } = {}) {
  const [feed, setFeed] = useState(initial);
  const [status, setStatus] = useState('connecting'); // 'connecting' | 'live' | 'offline'
  const cbRef = useRef(onLeaderboardChanged);
  cbRef.current = onLeaderboardChanged;

  useEffect(() => {
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
    // hubUrl is the only stable identity; getToken/onLeaderboardChanged are read via refs/closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubUrl]);

  return { feed, status };
}
