// Platform-agnostic Apple Health facade. On the native iOS shell it drives the HealthKit
// source (healthSource.native.js) and posts daily wellness records to the backend; on web
// it reports "unavailable" so callers can render a disabled state instead of crashing.
//
// SCOPE: lightweight wellness only — resting HR, HRV, respiratory rate, weight, VO2max,
// sleep. Apple Health does NOT feed activities here (Garmin/FIT own that). The backend
// (HealthEndpoints.cs) upserts by (athlete, day) and COALESCEs per column, so re-syncing
// is safe and non-destructive — a later partial sync never wipes an earlier metric.

import { apiUrl } from './apiBase.js';

const ENDPOINT = '/api/health/daily';
const CHUNK = 60; // days per POST — keeps payloads small and drives the progress bar

function isNativePlatform() {
  return !!(typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.());
}

// True only where HealthKit can actually be read (native iOS build). Web/Android → false.
export function healthKitAvailable() {
  if (!isNativePlatform()) return false;
  const p = window.Capacitor?.getPlatform?.();
  return p === 'ios';
}

async function postDays(days, token) {
  const res = await fetch(apiUrl(ENDPOINT), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ days }),
  });
  if (res.status === 401) throw new Error('Not signed in.');
  if (res.status !== 202 && res.status !== 200) {
    const text = await res.text().catch(() => '');
    throw new Error(text?.slice(0, 140) || `Sync failed (${res.status})`);
  }
}

// Read HealthKit daily wellness and upload it. Returns a summary; streams progress.
//  opts.since      — Date; how far back to pull (default: 90 days ago)
//  opts.getToken   — () => bearer token for the API
//  opts.onProgress — ({ done, total }) => void   (done/total are day counts)
export async function syncAppleHealth({ since, getToken, onProgress } = {}) {
  if (!healthKitAvailable()) {
    throw new Error('Apple Health is only available in the iOS app.');
  }
  const { createNativeHealthSource } = await import('./healthSource.native.js');
  const source = await createNativeHealthSource();
  await source.requestPermission();

  const start = since ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const days = await source.listDailyWellness({ since: start });

  const token = getToken ? await getToken() : null;
  let synced = 0;
  let failed = 0;

  for (let i = 0; i < days.length; i += CHUNK) {
    const chunk = days.slice(i, i + CHUNK);
    try {
      await postDays(chunk, token);
      synced += chunk.length;
    } catch {
      failed += chunk.length;
    }
    onProgress?.({ done: Math.min(i + CHUNK, days.length), total: days.length });
  }

  return { total: days.length, synced, failed };
}
