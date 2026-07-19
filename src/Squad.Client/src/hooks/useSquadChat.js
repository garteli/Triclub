import { useCallback, useEffect, useRef, useState } from 'react';
import * as signalR from '@microsoft/signalr';

// Squad group chat: loads history from /api/messages, then subscribes to the chat
// hub for live messages (the POST fans out to the squad group, so the sender's own
// message arrives back over the hub — deduped by id). send() just POSTs; the echo appends.
export function useSquadChat({ getToken, enabled = true, hubUrl = '/hubs/chat', apiUrl = '/api/messages' } = {}) {
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('connecting'); // 'connecting' | 'live' | 'offline'

  const append = useCallback((m) => {
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
  }, []);

  // Initial history.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const token = getToken ? await getToken() : null;
        const res = await fetch(apiUrl, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
        if (!res.ok) return;
        const items = await res.json();
        if (!cancelled && Array.isArray(items)) setMessages(items);
      } catch { /* offline */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl, enabled]);

  // Live hub.
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  useEffect(() => {
    if (!enabled) { setStatus('offline'); return; }
    const conn = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, { accessTokenFactory: () => Promise.resolve(tokenRef.current ? tokenRef.current() : null) })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    conn.on('messagePosted', (m) => append(m));
    conn.onreconnecting(() => setStatus('connecting'));
    conn.onreconnected(() => setStatus('live'));
    conn.onclose(() => setStatus('offline'));

    let cancelled = false;
    conn.start().then(() => { if (!cancelled) setStatus('live'); }).catch(() => { if (!cancelled) setStatus('offline'); });
    return () => { cancelled = true; conn.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubUrl, enabled]);

  const send = useCallback(async (body) => {
    const text = (body || '').trim();
    if (!text) return;
    const token = getToken ? await getToken() : null;
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ body: text }),
    });
    if (res.ok) append(await res.json()); // instant echo even if the hub lags
  }, [apiUrl, getToken, append]);

  return { messages, status, send };
}
