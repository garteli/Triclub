// Platform-agnostic Apple Health facade for the app. On the native iOS shell it drives
// the HealthKit source (healthSource.native.js) and posts each workout to the same
// backend endpoint the companion-app path already uses; on web it reports "unavailable"
// so callers can render a disabled state instead of crashing.
//
// The backend (NativeActivityEndpoints.cs) is idempotent by HealthKit UUID and dedupes
// by fingerprint, so re-running a sync is safe — already-synced workouts come back as
// "already-received" and never double-count.

const ENDPOINT = '/api/activities/native/healthkit';

function isNativePlatform() {
  return !!(typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.());
}

// True only where HealthKit can actually be read (native iOS build). Web/Android → false.
export function healthKitAvailable() {
  if (!isNativePlatform()) return false;
  const p = window.Capacitor?.getPlatform?.();
  return p === 'ios';
}

async function postWorkout(dto, token) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(dto),
  });
  if (res.status === 401) throw new Error('Not signed in.');
  if (res.status !== 202) {
    const text = await res.text().catch(() => '');
    throw new Error(text?.slice(0, 140) || `Sync failed (${res.status})`);
  }
  const body = await res.json().catch(() => ({}));
  return body?.status === 'already-received' ? 'duplicate' : 'queued';
}

// Read HealthKit history and upload it. Returns a summary; streams progress via onProgress.
//  opts.since      — Date; how far back to pull (default: 1 year ago)
//  opts.getToken   — () => bearer token for the API
//  opts.onProgress — ({ done, total, queued, duplicates }) => void
export async function syncAppleHealth({ since, getToken, onProgress } = {}) {
  if (!healthKitAvailable()) {
    throw new Error('Apple Health is only available in the iOS app.');
  }
  const { createNativeHealthSource } = await import('./healthSource.native.js');
  const source = await createNativeHealthSource();
  await source.requestPermission();

  const start = since ?? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const workouts = await source.listWorkouts({ since: start });

  const token = getToken ? await getToken() : null;
  let queued = 0;
  let duplicates = 0;
  let failed = 0;

  for (let i = 0; i < workouts.length; i++) {
    try {
      const outcome = await postWorkout(workouts[i], token);
      if (outcome === 'duplicate') duplicates++; else queued++;
    } catch {
      failed++;
    }
    onProgress?.({ done: i + 1, total: workouts.length, queued, duplicates, failed });
  }

  return { total: workouts.length, queued, duplicates, failed };
}
