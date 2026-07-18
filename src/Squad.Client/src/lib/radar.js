// Roll every rider's rear-radar reading up into one pack-level threat. Any rider whose
// radar sees a vehicle warns the whole squad — the person at the back usually spots the
// car first, so this gives riders up front a heads-up they'd otherwise never get.
export function groupRadar(riders = []) {
  let level = 0;
  let closestM = null;
  let byName = null;
  let detecting = 0;

  for (const r of riders) {
    const rd = r.radar;
    if (!rd || !rd.level) continue;
    detecting += 1;
    if (rd.level > level) level = rd.level;
    if (rd.closestM != null && (closestM == null || rd.closestM < closestM)) {
      closestM = rd.closestM;
      byName = r.name;
    }
  }
  if (byName == null && detecting > 0) byName = riders.find((r) => r.radar?.level)?.name ?? null;

  return { level, detecting, closestM, byName };
}
