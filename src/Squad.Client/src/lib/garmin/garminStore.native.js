// On-device persistence of the Garmin session — the "stay logged in" half.
//
// We persist the long-lived OAuth1 token (garth's model: valid ~1 year) as the primary
// credential. It survives app relaunch and mints fresh OAuth2 bearers with no password,
// so "sync on every launch" needs only this. The short-lived OAuth2 bearer is cached
// alongside it but treated as disposable (re-minted when it expires).
//
// Storage is the platform secure enclave — iOS Keychain / Android Keystore — via
// @aparajita/capacitor-secure-storage. NB: that plugin ships a JS wrapper (`SecureStorage`)
// whose public methods are positional — set(key, value) / get(key) / remove(key) — and map
// to the real native methods (internalSetItem, …). Calling it as a raw
// registerPlugin('SecureStorage') proxy with { key, value } fails at runtime with
// "SecureStorage.set() is not implemented on ios" because no native method is named `set`.
// So we dynamic-import the wrapper (like healthSource.native.js imports its plugin) rather
// than build a bridge proxy by hand.
//
// On web there is no native plugin, so we fall back to localStorage PURELY so the flow is
// runnable in a browser during development. That fallback is NOT secure and must never be
// the real credential store — the Garmin login can't run on web anyway (CORS; see garmin.js).

import { Capacitor } from '@capacitor/core';

const SESSION_KEY = 'garmin.session.v1';   // { oauth1, oauth2, savedAt }
const CREDS_KEY = 'garmin.creds.v1';       // optional { username, password } — silent re-auth fallback

function isNative() {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
}

// Bind the secure-storage plugin on native (dynamic import, so the web build never loads
// it), or a localStorage shim on web/dev. Both expose the same get/set/remove(string)
// surface. Async + cached because loading the native wrapper is a dynamic import.
let _backendPromise = null;
function backend() {
  if (_backendPromise) return _backendPromise;
  _backendPromise = (async () => {
    if (isNative()) {
      const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
      return {
        // The wrapper deserializes on get: a stored JSON string comes back as a string,
        // but guard by re-stringifying anything non-string so callers always get text.
        async get(k) {
          const v = await SecureStorage.get(k).catch(() => null);
          return v == null ? null : (typeof v === 'string' ? v : JSON.stringify(v));
        },
        async set(k, v) { await SecureStorage.set(k, v); },
        async remove(k) { await SecureStorage.remove(k).catch(() => {}); },
      };
    }
    return {
      async get(k) { try { return localStorage.getItem(k); } catch { return null; } },
      async set(k, v) { try { localStorage.setItem(k, v); } catch { /* unavailable */ } },
      async remove(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
    };
  })();
  return _backendPromise;
}

// --- session (the OAuth1/OAuth2 pair) --------------------------------------

export async function saveSession(session) {
  await (await backend()).set(SESSION_KEY, JSON.stringify(session));
  return session;
}

export async function loadSession() {
  const raw = await (await backend()).get(SESSION_KEY);
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export async function clearSession() {
  await (await backend()).remove(SESSION_KEY);
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
  await (await backend()).set(CREDS_KEY, JSON.stringify({ username, password }));
}

export async function loadCredentials() {
  const raw = await (await backend()).get(CREDS_KEY);
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export async function clearCredentials() {
  await (await backend()).remove(CREDS_KEY);
}
