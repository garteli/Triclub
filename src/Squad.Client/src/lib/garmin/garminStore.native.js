// On-device persistence of the Garmin session — the "stay logged in" half.
//
// We persist the long-lived OAuth1 token (garth's model: valid ~1 year) as the primary
// credential. It survives app relaunch and mints fresh OAuth2 bearers with no password,
// so "sync on every launch" needs only this. The short-lived OAuth2 bearer is cached
// alongside it but treated as disposable (re-minted when it expires).
//
// Storage is the platform secure enclave — iOS Keychain / Android Keystore — reached
// through a registerPlugin('SecureStorage') proxy. That's the SAME pattern
// locationSource.native.js uses for registerPlugin('BackgroundGeolocation'): no build-time
// dependency, resolved by the native shell at runtime. Install a Keychain/Keystore-backed
// plugin that registers under this name on the native side, e.g.
//   npm i @aparajita/capacitor-secure-storage   (registers as "SecureStorage")
// and adjust the name below if your plugin differs.
//
// On web there is no native plugin, so we fall back to localStorage PURELY so the flow is
// runnable in a browser during development. That fallback is NOT secure and must never be
// the real credential store — the Garmin login can't run on web anyway (CORS; see garmin.js).

import { registerPlugin, Capacitor } from '@capacitor/core';

const SESSION_KEY = 'garmin.session.v1';   // { oauth1, oauth2, savedAt }
const CREDS_KEY = 'garmin.creds.v1';       // optional { username, password } — silent re-auth fallback

function isNative() {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
}

// Bind the secure-storage plugin on native, or a localStorage shim on web/dev.
// Both expose the same tiny get/set/remove(string) surface.
let _backend = null;
function backend() {
  if (_backend) return _backend;
  if (isNative()) {
    const SecureStorage = registerPlugin('SecureStorage');
    _backend = {
      async get(k) {
        const r = await SecureStorage.get({ key: k }).catch(() => null);
        return r?.value ?? null;
      },
      async set(k, v) { await SecureStorage.set({ key: k, value: v }); },
      async remove(k) { await SecureStorage.remove({ key: k }).catch(() => {}); },
    };
  } else {
    _backend = {
      async get(k) { try { return localStorage.getItem(k); } catch { return null; } },
      async set(k, v) { try { localStorage.setItem(k, v); } catch { /* unavailable */ } },
      async remove(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
    };
  }
  return _backend;
}

// --- session (the OAuth1/OAuth2 pair) --------------------------------------

export async function saveSession(session) {
  await backend().set(SESSION_KEY, JSON.stringify(session));
  return session;
}

export async function loadSession() {
  const raw = await backend().get(SESSION_KEY);
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export async function clearSession() {
  await backend().remove(SESSION_KEY);
}

// A restorable login = we still hold the long-lived OAuth1 token.
export async function hasSession() {
  const s = await loadSession();
  return !!s?.oauth1?.oauth_token;
}

// --- optional raw-credential fallback --------------------------------------
// Persist username/password ONLY when the caller opts in, for silent re-auth once the
// OAuth1 token finally expires (~yearly) on non-MFA accounts. Prefer interactive
// re-login; an MFA account can't be re-authed silently anyway. See garmin.js.

export async function saveCredentials(username, password) {
  await backend().set(CREDS_KEY, JSON.stringify({ username, password }));
}

export async function loadCredentials() {
  const raw = await backend().get(CREDS_KEY);
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export async function clearCredentials() {
  await backend().remove(CREDS_KEY);
}
