// Peer ranging — phone-to-phone BLE for live-ride pack position.
//
// Every rider's phone does two things at once:
//   • ADVERTISE its own athlete GUID (the native `SquadPeerBeacon` plugin — this is the
//     half that needs a custom plugin, because neither Web Bluetooth nor
//     @capacitor-community/bluetooth-le can *broadcast* manufacturer data).
//   • SCAN for teammates' beacons (@capacitor-community/bluetooth-le `requestLEScan`,
//     reading RSSI) and emit an RSSI-derived distance estimate per peer.
//
// The server fuses these peer ranges with GPS+heading to place riders in the pack; when
// this phone isn't advertising (iOS backgrounded, permission denied, older hardware) the
// fusion falls back to GPS+heading alone.
//
// Dynamically imports the Capacitor packages so the pure-web build never resolves them.
// Only loaded inside the native shell (Capacitor.isNativePlatform()).

const COMPANY_ID = 0xffff; // "not assigned" range — local/experimental manufacturer id.

/**
 * 16 raw bytes (Uint8Array / DataView / number[]) → canonical GUID string
 * "550e8400-e29b-41d4-a716-446655440000". Canonical = big-endian / RFC-4122 textual
 * order, byte-for-byte the order the native plugins emit. MUST stay in lockstep with
 * `guidToBytes` here and with `guidToBytes` in the Swift/Java plugins.
 */
export function bytesToGuid(bytes) {
  const b = bytes instanceof DataView
    ? Array.from({ length: bytes.byteLength }, (_, i) => bytes.getUint8(i))
    : Array.from(bytes);
  if (b.length < 16) throw new Error('GUID payload must be 16 bytes');
  const hex = b.slice(0, 16).map((x) => x.toString(16).padStart(2, '0'));
  return (
    hex.slice(0, 4).join('') + '-' +
    hex.slice(4, 6).join('') + '-' +
    hex.slice(6, 8).join('') + '-' +
    hex.slice(8, 10).join('') + '-' +
    hex.slice(10, 16).join('')
  );
}

/** Canonical GUID string → 16-byte Uint8Array. Inverse of `bytesToGuid`. */
export function guidToBytes(guid) {
  const hex = guid.replace(/-/g, '');
  if (hex.length !== 32) throw new Error('GUID must be 32 hex digits');
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new Error('GUID contains a non-hex character');
    out[i] = byte;
  }
  return out;
}

// Log-distance path-loss estimate. txPower = expected RSSI at 1 m; n = environment factor
// (~2 free space, higher in a dense pack of bodies + bikes). These are rough — the server
// treats the range as a soft constraint, not a hard measurement.
function rssiToMeters(rssi, txPower = -59, n = 2.5) {
  if (rssi === 0 || rssi == null) return null;
  return Math.pow(10, (txPower - rssi) / (10 * n));
}

export async function createNativePeerRangingSource() {
  const { registerPlugin } = await import('@capacitor/core');
  const { BleClient } = await import('@capacitor-community/bluetooth-le');
  const SquadPeerBeacon = registerPlugin('SquadPeerBeacon');

  let scanning = false;

  return {
    kind: 'native',
    supported: true,

    /**
     * Begin advertising this athlete and scanning for teammates.
     * @param {string} athleteId  this rider's athlete GUID
     * @param {(peer: { athleteId: string, rssi: number, distanceM: number|null, ts: number }) => void} onPeer
     */
    async start(athleteId, onPeer) {
      // Advertise half — the custom plugin. Foreground-reliable on iOS (see the plugin
      // docstring); always-on on Android with BLUETOOTH_ADVERTISE granted.
      await SquadPeerBeacon.advertise({ manufacturerId: COMPANY_ID, athleteId });

      // Scan half — the community plugin already ships this. requestLEScan strips the
      // 2-byte company id and hands us the 16-byte GUID payload keyed by company id
      // (decimal string).
      await BleClient.initialize({ androidNeverForLocation: true });
      await BleClient.requestLEScan({ allowDuplicates: true }, (result) => {
        const raw = result?.manufacturerData?.[String(COMPANY_ID)];
        if (!raw) return; // not one of our beacons
        let peerId;
        try {
          peerId = bytesToGuid(raw);
        } catch {
          return; // malformed payload — skip
        }
        if (peerId === athleteId) return; // our own beacon echoed back
        onPeer({
          athleteId: peerId,
          rssi: result.rssi,
          distanceM: rssiToMeters(result.rssi),
          ts: Date.now(),
        });
      });
      scanning = true;
    },

    async stop() {
      try { await SquadPeerBeacon.stop(); } catch { /* already stopped */ }
      if (scanning) {
        try { await BleClient.stopLEScan(); } catch { /* already stopped */ }
        scanning = false;
      }
    },
  };
}
