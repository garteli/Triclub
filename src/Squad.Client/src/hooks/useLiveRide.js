import { useCallback, useEffect, useRef, useState } from 'react';
import * as signalR from '@microsoft/signalr';
import { API_BASE } from '../lib/apiBase.js';

// Turns a server RiderUpdate into the row shape LiveRide's list/strip already render
// (hr color/bar, accent row for "you", metric strings). meId flags the caller's own row.
export function mapLiveRider(u, meId) {
  const hr = u.heartRate ?? 0;
  const hrColor = hr > 168 ? 'var(--bad)' : hr > 158 ? 'var(--warn)' : 'var(--good)';
  const stale = Date.now() - (u.ts ?? 0) > 8000; // no telemetry for 8s → treat as off the back
  return {
    athleteId: u.athleteId,
    you: meId != null && u.athleteId === meId,
    name: u.name,
    initials: u.initials,
    color: u.color,
    lat: u.lat,
    lon: u.lon,
    spd: (u.speedKph ?? 0).toFixed(1),
    hr: Math.round(hr),
    powerW: u.powerW ?? null,
    radar: u.radarThreatLevel != null
      ? { level: u.radarThreatLevel, count: u.radarVehicleCount ?? 0, closestM: u.radarClosestMeters ?? null }
      : null,
    dist: (u.distanceKm ?? 0).toFixed(1),
    hrPct: Math.min(100, Math.round(((hr - 110) / 70) * 100)),
    hrColor,
    dropped: stale,
    rowBg:
      meId != null && u.athleteId === meId
        ? 'background:var(--accent-dim);border:1px solid color-mix(in srgb,var(--accent) 40%,transparent)'
        : stale
        ? 'background:var(--bg2);border:1px solid color-mix(in srgb,var(--behind) 35%,transparent)'
        : 'background:var(--bg2);border:1px solid var(--line)',
  };
}

// Live ride over SignalR. Watching and recording share one connection: subscribe to
// riders, and call pushTelemetry(...) when THIS device is the one recording.
export function useLiveRide(rideId, { hubUrl = API_BASE + '/hubs/ride', getToken, meId, enabled = true } = {}) {
  const [byId, setById] = useState({});
  const [status, setStatus] = useState('idle'); // 'idle' | 'live' | 'offline'
  const connRef = useRef(null);

  useEffect(() => {
    if (!enabled || !rideId) return;

    const conn = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, getToken ? { accessTokenFactory: () => Promise.resolve(getToken()) } : undefined)
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();
    connRef.current = conn;

    const upsert = (u) => setById((prev) => ({ ...prev, [u.athleteId]: u }));
    conn.on('snapshot', (list) => setById(Object.fromEntries((list ?? []).map((u) => [u.athleteId, u]))));
    conn.on('riderMoved', upsert);
    conn.on('riderLeft', (athleteId) => setById((prev) => { const n = { ...prev }; delete n[athleteId]; return n; }));
    conn.onreconnected(() => { setStatus('live'); conn.invoke('JoinRide', rideId).catch(() => {}); });
    conn.onclose(() => setStatus('offline'));

    let alive = true;
    conn.start()
      .then(() => { if (!alive) return; setStatus('live'); return conn.invoke('JoinRide', rideId); })
      .catch(() => { if (alive) setStatus('offline'); });

    return () => {
      alive = false;
      try { conn.invoke('LeaveRide', rideId); } catch { /* connection may already be down */ }
      conn.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideId, hubUrl, enabled]);

  const pushTelemetry = useCallback(
    (t) => connRef.current?.invoke('PushTelemetry', rideId, t).catch(() => {}),
    [rideId],
  );

  const riders = Object.values(byId).map((u) => mapLiveRider(u, meId));
  return { riders, status, pushTelemetry };
}
