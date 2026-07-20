// The viewer's training thresholds — FTP (watts) and max heart rate (bpm) — used to turn
// the recorded power/HR streams into zones and Intensity Factor on the activity detail view.
// Device-local (localStorage): they never leave the phone, so no server profile / schema
// change is needed. Promote to the server profile later if per-athlete zones are wanted.

const KEY = 'squad.zones';

export function loadZones() {
  try {
    const z = JSON.parse(localStorage.getItem(KEY)) || {};
    return {
      ftp: Number.isFinite(z.ftp) && z.ftp > 0 ? z.ftp : null,
      maxHr: Number.isFinite(z.maxHr) && z.maxHr > 0 ? z.maxHr : null,
    };
  } catch {
    return { ftp: null, maxHr: null };
  }
}

export function saveZones({ ftp, maxHr }) {
  const clean = {
    ftp: Number.isFinite(ftp) && ftp > 0 ? Math.round(ftp) : null,
    maxHr: Number.isFinite(maxHr) && maxHr > 0 ? Math.round(maxHr) : null,
  };
  try { localStorage.setItem(KEY, JSON.stringify(clean)); } catch { /* storage unavailable */ }
  return clean;
}
