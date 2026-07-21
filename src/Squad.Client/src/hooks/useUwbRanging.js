import { useEffect, useRef, useState } from 'react';
import { createUwbSource, uwbBearing } from '../lib/uwbSource.native.js';

// Orchestrates Ultra-Wideband (Nearby Interaction) ranging across a live ride's teammates.
//
// UWB needs a per-peer-pair discovery-token exchange, relayed over the ride hub:
//   • when a teammate appears, we startPeer(themselves) → get our token → pushUwbToken(them, token)
//   • when we receive their token (onUwbToken), we startPeer(them) if new, send ours back, and
//     receivePeerToken(them, theirToken). Once both sides have each other's tokens, ranging converges.
//
// Emits { peers } where peers[athleteId] = { distanceM, dir:{x,y,z}|null, bearing, ts }. Inert on
// web / non-UWB devices (isSupported false → the effect never wires anything up).
export function useUwbRanging({ athleteId, active, riders = [], pushUwbToken, onUwbToken } = {}) {
  const [peers, setPeers] = useState({});
  const [supported, setSupported] = useState(false);
  const srcRef = useRef(null);
  const startedRef = useRef(new Set());   // peers we've created a session for + sent our token to
  const ridersRef = useRef(riders);
  ridersRef.current = riders;

  useEffect(() => {
    console.log('[UWBDIAG] effect: active=', active, 'athleteId=', !!athleteId,
      'pushTok=', typeof pushUwbToken, 'onTok=', typeof onUwbToken);
    if (!active || !athleteId || typeof pushUwbToken !== 'function' || typeof onUwbToken !== 'function') return undefined;

    let cancelled = false;
    const src = createUwbSource();
    srcRef.current = src;
    startedRef.current = new Set();

    // Begin a session for a peer and hand them our token (once).
    const initiate = async (peerId) => {
      if (!peerId || peerId === athleteId || startedRef.current.has(peerId)) return;
      startedRef.current.add(peerId);
      try {
        const { token } = await src.startPeer(peerId);
        if (!cancelled && token) pushUwbToken(peerId, token);
      } catch { startedRef.current.delete(peerId); }
    };

    (async () => {
      const ok = await src.isSupported();
      console.log('[UWBDIAG] isSupported =', ok);
      if (cancelled) { src.stop(); return; }
      setSupported(ok);
      if (!ok) return;

      await src.onNearby((e) => {
        if (!e?.athleteId) return;
        const dir = e.dirX != null ? { x: e.dirX, y: e.dirY, z: e.dirZ } : null;
        setPeers((prev) => ({
          ...prev,
          [e.athleteId]: { ...prev[e.athleteId], distanceM: e.distanceM ?? null, dir, bearing: uwbBearing(dir), ts: e.ts ?? Date.now() },
        }));
      });
      await src.onConvergence((e) => {
        if (!e?.athleteId) return;
        setPeers((prev) => ({ ...prev, [e.athleteId]: { ...prev[e.athleteId], converged: !!e.converged, reasons: e.reasons || [] } }));
      });
      await src.onLost((e) => {
        if (!e?.athleteId) return;
        setPeers((prev) => { const n = { ...prev }; delete n[e.athleteId]; return n; });
      });

      // Kick off a handshake with everyone already on the ride…
      for (const r of ridersRef.current) if (!r.you) initiate(r.athleteId);
    })();

    // …and respond to inbound tokens (start our side back if needed, then run the session).
    const meLc = String(athleteId).toLowerCase();
    const off = onUwbToken(async (msg) => {
      if (cancelled || !msg || !msg.from || String(msg.to).toLowerCase() !== meLc) return;
      if (!startedRef.current.has(msg.from)) await initiate(msg.from);
      if (msg.token) src.receivePeerToken(msg.from, msg.token);
    });

    return () => {
      cancelled = true;
      off?.();
      src.removeAll();
      src.stop();
      srcRef.current = null;
      setPeers({});
      setSupported(false);
    };
  }, [active, athleteId, pushUwbToken, onUwbToken]);

  // New teammates that appear mid-ride: open a handshake with them too.
  useEffect(() => {
    if (!supported || !srcRef.current) return;
    for (const r of riders) {
      if (!r.you && r.athleteId && !startedRef.current.has(r.athleteId)) {
        startedRef.current.add(r.athleteId);
        srcRef.current.startPeer(r.athleteId)
          .then(({ token }) => token && pushUwbToken?.(r.athleteId, token))
          .catch(() => startedRef.current.delete(r.athleteId));
      }
    }
  }, [riders, supported, pushUwbToken]);

  return { peers, supported };
}
