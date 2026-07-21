import { useEffect, useRef, useState } from 'react';
import { createWebPeerRangingSource } from '../lib/peerRangingSource.web.js';

function isNativePlatform() {
  return !!(typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.());
}

// RSSI is noisy and scans fire fast (allowDuplicates); the server only needs a *recent*
// range per peer, not every packet. One push per peer per second keeps pack spacing fresh
// without spamming the hub with every BLE packet.
const PUSH_THROTTLE_MS = 1000;

// A single RSSI sample → distance is very noisy (multipath, body-shadowing, packet-to-packet
// jitter), so smooth each peer's distance with an exponential moving average. Lower α = steadier
// but laggier; 0.25 keeps pack spacing responsive while cutting the jitter that a raw sample shows.
// This is the accuracy improvement used whenever UWB isn't available/converged and BLE is the range.
const BLE_EMA_ALPHA = 0.25;

// Phone-to-phone BLE ranging for live-ride pack position. While a ride is active this
// device advertises its athlete GUID (native SquadPeerBeacon plugin) and scans for
// teammates' beacons, pushing each RSSI-derived range up to the ride hub so the server
// can fuse it with GPS+heading. On web (or when BLE is unavailable/denied) the source is
// inert and pack position stays on the GPS+heading fallback — the caller sees mode
// 'unsupported' and no peers.
export function usePeerRanging({ athleteId, active, pushPeerRange } = {}) {
  const [peers, setPeers] = useState({});   // peerId -> { rssi, distanceM, ts }
  const [mode, setMode] = useState('idle'); // 'idle' | 'native' | 'web' | 'unsupported'
  const sourceRef = useRef(null);
  const lastPush = useRef({});              // peerId -> last uplink ts
  const distEma = useRef({});               // peerId -> EMA-smoothed distance (m)

  useEffect(() => {
    if (!active || !athleteId) return;
    let cancelled = false;
    lastPush.current = {};
    distEma.current = {};

    (async () => {
      const source = isNativePlatform()
        ? await (await import('../lib/peerRangingSource.native.js')).createNativePeerRangingSource()
        : createWebPeerRangingSource();

      // Effect was torn down while the native module loaded — don't leave a source running.
      if (cancelled) { try { await source.stop?.(); } catch { /* ignore */ } return; }

      if (!source.supported) { setMode('unsupported'); return; }
      sourceRef.current = source;
      setMode(source.kind);

      try {
        await source.start(athleteId, (peer) => {
          // Smooth the noisy per-sample distance with a per-peer EMA before it drives pack spacing.
          let distanceM = peer.distanceM;
          if (distanceM != null && distanceM > 0) {
            const prev = distEma.current[peer.athleteId];
            distanceM = prev == null ? distanceM : prev + BLE_EMA_ALPHA * (distanceM - prev);
            distEma.current[peer.athleteId] = distanceM;
          }
          setPeers((prev) => ({
            ...prev,
            [peer.athleteId]: { rssi: peer.rssi, distanceM, ts: peer.ts },
          }));
          const now = peer.ts;
          if (pushPeerRange && now - (lastPush.current[peer.athleteId] ?? 0) >= PUSH_THROTTLE_MS) {
            lastPush.current[peer.athleteId] = now;
            pushPeerRange({ peerId: peer.athleteId, rssi: peer.rssi, distanceM });
          }
        });
      } catch {
        // Bluetooth off / permission denied / no peripheral role — silent fallback.
        setMode('unsupported');
      }
    })();

    return () => {
      cancelled = true;
      const s = sourceRef.current;
      sourceRef.current = null;
      if (s) { try { s.stop?.(); } catch { /* ignore */ } }
      setMode('idle');
      setPeers({});
    };
  }, [active, athleteId, pushPeerRange]);

  return { peers, mode };
}
