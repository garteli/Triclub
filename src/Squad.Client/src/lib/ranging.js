// Merge the two teammate-ranging sources into one best-per-teammate list. UWB (Nearby Interaction)
// is precise (cm, with direction) but only some devices/teammates converge; BLE RSSI ranging is
// coarser but works phone-to-phone on far more hardware. So: prefer UWB when it actually has a
// reading, and fall back to the (EMA-smoothed) BLE distance whenever UWB isn't working/converged
// for that teammate. `bleFreshMs` drops a stale BLE range so a teammate who left doesn't linger.
export function mergePeerRanges(uwbPeers = {}, blePeers = {}, now = Date.now(), bleFreshMs = 6000) {
  const ids = new Set([...Object.keys(uwbPeers || {}), ...Object.keys(blePeers || {})]);
  const out = [];
  for (const id of ids) {
    const u = (uwbPeers || {})[id];
    const b = (blePeers || {})[id];
    const uwbOk = u && u.distanceM != null;
    const bleOk = b && b.distanceM != null && (now - (b.ts || 0) < bleFreshMs);
    if (!uwbOk && !bleOk && !u) continue; // nothing to show for this teammate
    out.push({
      id,
      src: uwbOk ? 'uwb' : (bleOk ? 'ble' : null), // which source the distance came from (null = still searching)
      distanceM: uwbOk ? u.distanceM : (bleOk ? b.distanceM : null),
      bearing: uwbOk ? u.bearing : null,           // direction is UWB-only
      dir: uwbOk ? u.dir : null,
      reasons: u?.reasons || [],
      hasUwbSession: !!u,
    });
  }
  return out;
}
