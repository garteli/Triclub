// Platform-agnostic Garmin Connect facade.
//
// Mirrors health.js. On the native shell it drives the Garmin client
// (garmin/garminClient.native.js), persists the session in the device secure store
// (garmin/garminStore.native.js), and posts each downloaded activity to the SAME FIT
// upload endpoint the web uploader uses — so FitUploadAdapter + Fingerprint dedup handle
// everything with zero backend changes. On web it reports "unavailable".
//
// WHY NATIVE-ONLY: Garmin's SSO endpoints send no CORS headers, so the login flow cannot
// run from a browser fetch — only from a native HTTP client (CapacitorHttp). The web build
// exists so the app still boots, not so Garmin works there.
//
// PROVENANCE: activities land as ActivitySource.FitUpload (the .fit path), not
// ActivitySource.Garmin (which is reserved for the official push webhook). Dedup is by
// Fingerprint, so this is correct and de-duplicates against manual uploads / Apple Health;
// it just isn't labelled "Garmin". To tag provenance later, add a Garmin-aware .fit intake
// route and post there instead.

import { extractFitFiles } from './fitArchive.js';

const UPLOAD_ENDPOINT = '/api/activities/upload';
const WATERMARK_KEY = 'garmin.sync.watermark'; // epoch ms of the newest activity we've synced
// First-ever sync has no watermark; cap how far back we reach so we don't pull a decade
// of history in one launch. Subsequent syncs are incremental off the watermark.
const FIRST_SYNC_MAX = 50;
const PAGE = 20;

function isNativePlatform() {
  return !!(typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.());
}

// Garmin login runs on both native platforms (iOS + Android), unlike HealthKit (iOS only).
export function garminAvailable() {
  return isNativePlatform();
}

// --- session lifecycle ------------------------------------------------------

// Is there a restorable login persisted on this device?
export async function garminHasSession() {
  if (!garminAvailable()) return false;
  const store = await import('./garmin/garminStore.native.js');
  return store.hasSession();
}

// Interactive login. Persists the session (OAuth1 + OAuth2) to the secure store.
// Pass rememberCredentials:true to ALSO stash username/password for silent re-auth when
// the OAuth1 token eventually expires — opt-in, non-MFA accounts only (see the store).
export async function garminLogin({ username, password, rememberCredentials = false }) {
  if (!garminAvailable()) throw new Error('Garmin sign-in is only available in the mobile app.');
  const [client, store] = await Promise.all([
    import('./garmin/garminClient.native.js'),
    import('./garmin/garminStore.native.js'),
  ]);
  const session = await client.login({ username, password });
  await store.saveSession(session);
  if (rememberCredentials) await store.saveCredentials(username, password);
  return { ok: true };
}

// WebView login — the robust fallback for 2-step-verification / Cloudflare accounts. Opens
// Garmin's real login page (garmin/garminWebLogin.native.js); we never handle the password.
// Persists the resulting session just like garminLogin. No rememberCredentials option here —
// with the WebView flow we never see the credentials to store.
export async function garminLoginWebView() {
  if (!garminAvailable()) throw new Error('Garmin sign-in is only available in the mobile app.');
  const [web, store] = await Promise.all([
    import('./garmin/garminWebLogin.native.js'),
    import('./garmin/garminStore.native.js'),
  ]);
  const session = await web.loginWithWebView();
  await store.saveSession(session);
  return { ok: true };
}

export async function garminLogout() {
  if (!garminAvailable()) return;
  const store = await import('./garmin/garminStore.native.js');
  await Promise.all([store.clearSession(), store.clearCredentials()]);
  try { localStorage.removeItem(WATERMARK_KEY); } catch { /* ignore */ }
}

// Restore a valid session on launch: load the persisted OAuth1/OAuth2, refresh the bearer
// if stale, and (if that fails and credentials were remembered) silently re-login. Returns
// the live session or null if the user must sign in again.
async function restoreSession(client, store) {
  let session = await store.loadSession();
  if (session?.oauth1?.oauth_token) {
    try {
      session = await client.ensureBearer(session);
      await store.saveSession(session);
      return session;
    } catch {
      // OAuth1 likely expired — fall through to the remembered-credentials path.
    }
  }
  const creds = await store.loadCredentials();
  if (creds?.username && creds?.password) {
    session = await client.login(creds);
    await store.saveSession(session);
    return session;
  }
  return null;
}

// --- sync -------------------------------------------------------------------

// XHR-free multipart POST of one .fit → the idempotent upload endpoint.
async function postFit(name, bytes, token) {
  const fd = new FormData();
  fd.append('file', new File([bytes], name, { type: 'application/octet-stream' }), name);
  const res = await fetch(UPLOAD_ENDPOINT, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (res.status === 401) throw new Error('Not signed in.');
  if (res.status !== 202) {
    const text = await res.text().catch(() => '');
    throw new Error(text?.slice(0, 140) || `Upload failed (${res.status})`);
  }
  const body = await res.json().catch(() => ({}));
  return body?.status === 'already-received' ? 'duplicate' : 'queued';
}

// Newest-activity epoch ms from a Garmin summary (beginTimestamp is ms; startTimeGMT is a
// "YYYY-MM-DD HH:MM:SS" UTC string as a fallback).
function activityTime(a) {
  if (Number.isFinite(a?.beginTimestamp)) return a.beginTimestamp;
  const t = Date.parse((a?.startTimeGMT || '').replace(' ', 'T') + 'Z');
  return Number.isFinite(t) ? t : 0;
}

function loadWatermark() {
  const n = Number(localStorage.getItem(WATERMARK_KEY));
  return Number.isFinite(n) ? n : 0;
}
function saveWatermark(ms) {
  try { localStorage.setItem(WATERMARK_KEY, String(ms)); } catch { /* ignore */ }
}

// Pull everything newer than the last sync watermark and upload it. Idempotent: the
// backend dedupes by content hash + fingerprint, and the watermark keeps launches cheap.
//   opts.getToken   — () => app JWT for the upload endpoint
//   opts.onProgress — ({ done, total, queued, duplicates, failed }) => void
//   opts.force      — ignore the watermark (re-scan the recent window)
// Returns { total, queued, duplicates, failed } or { skipped:true } if not signed in.
export async function syncGarmin({ getToken, onProgress, force = false } = {}) {
  if (!garminAvailable()) throw new Error('Garmin sync is only available in the mobile app.');

  const [client, store] = await Promise.all([
    import('./garmin/garminClient.native.js'),
    import('./garmin/garminStore.native.js'),
  ]);
  const session = await restoreSession(client, store);
  if (!session) return { skipped: true, reason: 'no-session' };

  const watermark = force ? 0 : loadWatermark();

  // Page newest-first until we cross the watermark (or hit the first-sync cap).
  const fresh = [];
  for (let start = 0; ; start += PAGE) {
    const page = await client.listActivities(session, { start, limit: PAGE });
    if (page.length === 0) break;

    let crossed = false;
    for (const a of page) {
      if (activityTime(a) <= watermark) { crossed = true; break; }
      fresh.push(a);
    }
    if (crossed) break;
    if (watermark === 0 && fresh.length >= FIRST_SYNC_MAX) break; // first-sync backstop
    if (page.length < PAGE) break;
  }

  const total = fresh.length;
  let queued = 0, duplicates = 0, failed = 0;
  let newestSynced = watermark;

  for (let i = 0; i < fresh.length; i++) {
    const a = fresh[i];
    try {
      const token = getToken ? await getToken() : null;
      const { name, bytes } = await client.downloadOriginal(session, a.activityId);
      const fits = await extractFitFiles(new File([bytes], name));
      if (fits.length === 0) throw new Error('No .fit inside the Garmin download.');
      for (const fit of fits) {
        const outcome = await postFit(fit.name, fit.bytes, token);
        if (outcome === 'duplicate') duplicates++; else queued++;
      }
      newestSynced = Math.max(newestSynced, activityTime(a));
    } catch {
      failed++;
    }
    onProgress?.({ done: i + 1, total, queued, duplicates, failed });
  }

  // Advance the watermark only past the contiguous run we actually settled, so a failure
  // mid-batch is retried next launch rather than skipped.
  if (newestSynced > watermark) saveWatermark(newestSynced);

  return { total, queued, duplicates, failed };
}
