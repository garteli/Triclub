import { useCallback, useEffect, useRef, useState } from 'react';
import * as signalR from '@microsoft/signalr';
import { API_BASE } from '../lib/apiBase.js';

// 1:1 direct chat with one peer. Loads history from /api/dm/{peerId}, then subscribes
// to the shared chat hub for live messages. The POST fans out to both participants'
// personal groups, so the sender's own message arrives back over the hub (deduped by id).
// send() just POSTs; the echo appends. Incoming hub messages are filtered to this thread.
export function useDirectChat({ getToken, peerId, meId, enabled = true, hubUrl = API_BASE + '/hubs/chat' } = {}) {
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('connecting'); // 'connecting' | 'live' | 'offline'
  const active = enabled && !!peerId;
  const apiUrl = peerId ? `/api/dm/${peerId}` : null;

  const append = useCallback((m) => {
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
  }, []);

  // A hub message belongs to this thread iff it's between me and this peer.
  const mine = useCallback(
    (m) => (m.senderId === meId && m.recipientId === peerId) || (m.senderId === peerId && m.recipientId === meId),
    [meId, peerId],
  );

  // Reset when the peer changes so we never show the previous thread.
  useEffect(() => { setMessages([]); }, [peerId]);

  // Initial history.
  useEffect(() => {
    if (!active) return;
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
  }, [apiUrl, active]);

  // Live hub.
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  const mineRef = useRef(mine);
  mineRef.current = mine;
  useEffect(() => {
    if (!active) { setStatus('offline'); return; }
    const conn = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, { accessTokenFactory: () => Promise.resolve(tokenRef.current ? tokenRef.current() : null) })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    conn.on('dmPosted', (m) => { if (mineRef.current(m)) append(m); });
    conn.onreconnecting(() => setStatus('connecting'));
    conn.onreconnected(() => setStatus('live'));
    conn.onclose(() => setStatus('offline'));

    let cancelled = false;
    conn.start().then(() => { if (!cancelled) setStatus('live'); }).catch(() => { if (!cancelled) setStatus('offline'); });
    return () => { cancelled = true; conn.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubUrl, active]);

  const send = useCallback(async (body) => {
    const text = (body || '').trim();
    if (!text || !apiUrl) return;
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
