// Ultra-Wideband (Apple Nearby Interaction) source — precise distance + direction between two
// U1/U2 Apple devices. Wraps the native SquadUwb plugin (SquadUwbPlugin.swift). Fully inert on
// web / non-UWB devices: isSupported() resolves false and nothing else is called.
import { registerPlugin, Capacitor } from '@capacitor/core';

const SquadUwb = registerPlugin('SquadUwb');

export function createUwbSource() {
  const handles = [];
  return {
    async isSupported() {
      try {
        if (!Capacitor?.isNativePlatform?.()) return false;
        const r = await SquadUwb.isSupported();
        return !!r?.supported;
      } catch { return false; }
    },
    // Create a session for a peer → returns { athleteId, token }: THIS device's discovery token
    // to hand to that peer (over the ride hub).
    startPeer: (athleteId) => SquadUwb.startPeer({ athleteId }),
    // Feed a peer's discovery token into that peer's session so ranging can converge.
    receivePeerToken: (athleteId, token) => SquadUwb.receivePeerToken({ athleteId, token }).catch(() => {}),
    stop: () => SquadUwb.stop().catch(() => {}),
    async onNearby(cb) { handles.push(await SquadUwb.addListener('nearby', cb)); },
    async onLost(cb) { handles.push(await SquadUwb.addListener('lost', cb)); },
    removeAll() { handles.forEach((h) => { try { h.remove?.(); } catch { /* ignore */ } }); handles.length = 0; },
  };
}

// Turn a NearbyInteraction direction vector (device frame: +x right, +y up, -z forward) into a
// human bearing label + a horizontal angle in degrees (0 = dead ahead, + = right, − = left).
export function uwbBearing(dir) {
  if (!dir || dir.x == null || dir.z == null) return null;
  const angle = (Math.atan2(dir.x, -dir.z) * 180) / Math.PI; // 0 ahead, +right, -left
  const fb = Math.abs(angle) < 60 ? 'front' : Math.abs(angle) > 120 ? 'behind' : '';
  const lr = angle > 20 ? 'right' : angle < -20 ? 'left' : '';
  const label = [fb, lr].filter(Boolean).join('-') || 'level';
  return { angle, label };
}
