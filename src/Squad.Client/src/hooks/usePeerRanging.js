import { useEffect, useRef, useState } from 'react';
import { createWebPeerRangingSource } from '../lib/peerRangingSource.web.js';

function isNativePlatform() {
  return !!(typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.());
}

// RSSI is noisy and scans fire fast (allowDuplicates); the server only needs a *recent*
// range per peer, not every packet. Cap the uplink per peer to one push every few seconds.
const PUSH_THROTTLE_MS = 3000;

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

  useEffect(() => {
    if (!active || !athleteId) return;
    let cancelled = false;
    lastPush.current = {};

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
          setPeers((prev) => ({
            ...prev,
            [peer.athleteId]: { rssi: peer.rssi, distanceM: peer.distanceM, ts: peer.ts },
          }));
          const now = peer.ts;
          if (pushPeerRange && now - (lastPush.current[peer.athleteId] ?? 0) >= PUSH_THROTTLE_MS) {
            lastPush.current[peer.athleteId] = now;
            pushPeerRange({ peerId: peer.athleteId, rssi: peer.rssi, distanceM: peer.distanceM });
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
