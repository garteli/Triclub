// Persist an in-progress (or finished-but-unsaved) ride so a page refresh / reload doesn't
// lose it. The recorder's full-resolution sample buffer + running aggregates live only in
// memory; we mirror them to localStorage (throttled while recording + on pagehide) and
// restore on boot. Photos are intentionally NOT persisted — base64 blobs would blow the
// storage quota; a refresh mid-ride loses only the photos taken so far, never the track.

const KEY = 'squad.ridedraft';

// Auto-resume GPS only for a genuinely fresh reload; anything older is recovered as a
// finished ride awaiting save/discard, so a long-abandoned session never silently turns the
// GPS back on and keeps "riding" hours later.
export const STALE_RESUME_MS = 5 * 60 * 1000;

// Compact per-sample tuples — roughly half the JSON of {key:value} objects, so a long ride's
// thousands of points still fit under the localStorage quota.
const FIELDS = ['tMs', 'lat', 'lon', 'elevM', 'speedMps', 'heartRate', 'cadence', 'powerW', 'distanceM'];
const encodeSamples = (samples) => (samples || []).map((p) => FIELDS.map((f) => (p[f] ?? null)));
const decodeSamples = (rows) => (Array.isArray(rows) ? rows.map((a) => {
  const o = {};
  FIELDS.forEach((f, i) => { o[f] = a[i] ?? null; });
  return o;
}) : []);

export function saveDraft(draft) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...draft, v: 1, samples: encodeSamples(draft.samples) }));
    return true;
  } catch {
    return false; // quota exceeded / storage unavailable — best-effort, the live ride is unaffected
  }
}

export function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (!d || d.v !== 1) return null;
    d.samples = decodeSamples(d.samples);
    return d;
  } catch {
    return null;
  }
}

export function clearDraft() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

// Did a draft actually capture anything? A ride that never got a GPS fix (permission denied /
// no signal) has no samples and no distance — resuming it just re-arms a dead GPS and keeps
// "recording" forever, and since the flush re-stamps savedAt every 8s it never ages out.
const draftHasProgress = (draft) => (draft?.samples?.length || 0) > 0 || (draft?.distMeters || 0) > 0;

// How a saved draft should come back on boot:
//   'resume'  — a fresh in-progress ride WITH captured data: restore buffers, keep recording.
//   'recover' — a finished/stale ride with data: restore buffers as a pending save/discard card.
//   null      — nothing worth restoring (incl. an empty zombie ride — the caller should purge it).
export function draftMode(draft, now = Date.now()) {
  if (!draft) return null;
  if (draft.recording) {
    if (!draftHasProgress(draft)) return null; // empty zombie — don't auto-resume, don't recover
    return now - (draft.savedAt || 0) <= STALE_RESUME_MS ? 'resume' : 'recover';
  }
  if (draft.pending && draftHasProgress(draft)) return 'recover';
  return null;
}
