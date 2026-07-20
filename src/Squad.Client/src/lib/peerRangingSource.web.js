// Peer ranging is native-only. The web has no BLE *advertising* API, and Web Bluetooth
// can't passively scan for manufacturer data — so a browser can neither be seen by nor
// see teammates' beacons. This inert source lets `usePeerRanging` treat "no ranging"
// uniformly: pack position simply falls back to GPS+heading server fusion.
//
// (Mirrors the locationSource.web.js / .native.js split — web imported statically since
// it pulls no Capacitor packages, native imported dynamically only inside the shell.)
export function createWebPeerRangingSource() {
  return {
    kind: 'web',
    supported: false,
    async start() {},
    async stop() {},
  };
}
