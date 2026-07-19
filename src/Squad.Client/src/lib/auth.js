// Client-side auth for Squad — talks to the real backend.
//
// Flow: exchange credentials (email/password, or a Google/Apple id_token) at
// /api/auth/* for the app's own JWT, persist it as the session, and send it as a
// Bearer on every API call + SignalR connection. "Stay signed in" chooses durable
// (localStorage) vs per-tab (sessionStorage) persistence. Platform biometrics
// (Face ID / Touch ID / Windows Hello) gate re-entry to the persisted session.

import { getGoogleIdToken, getAppleIdToken } from './oauth.js';

const SESSION_KEY = 'squad.session';      // the AuthResult from the server (incl. token)
const BIOMETRIC_KEY = 'squad.biometric';  // { credentialId, athleteId } — local enrolment marker

// --- HTTP -------------------------------------------------------------------

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

// --- session persistence ----------------------------------------------------

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(session, { remember = true } = {}) {
  try {
    const store = remember ? localStorage : sessionStorage;
    const other = remember ? sessionStorage : localStorage;
    store.setItem(SESSION_KEY, JSON.stringify(session));
    other.removeItem(SESSION_KEY);
  } catch { /* storage unavailable */ }
  return session;
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  } catch { /* ignore */ }
}

// Bearer token of the current session, for API calls / hub connections.
export function sessionToken() {
  return loadSession()?.token ?? null;
}

// --- credential exchange ----------------------------------------------------

export async function registerWithEmail({ name, email, password }) {
  return api('/api/auth/register', { method: 'POST', body: { name, email, password } });
}

export async function loginWithEmail({ email, password }) {
  return api('/api/auth/login', { method: 'POST', body: { email, password } });
}

// Verify the current session's token server-side (and refresh profile fields).
export async function fetchMe(token) {
  return api('/api/auth/me', { token });
}

// The signed-in athlete's full editable profile.
export async function getProfile(token) {
  return api('/api/profile', { token });
}

// Partial update; returns the updated ProfileDetail. Null/undefined fields are left unchanged.
export async function updateProfile(token, fields) {
  return api('/api/profile', { method: 'PUT', token, body: fields });
}

// Which social providers the server has configured (+ their public client ids).
let _authConfig;
export async function authConfig() {
  if (_authConfig) return _authConfig;
  try {
    _authConfig = await api('/api/auth/config');
  } catch {
    _authConfig = { google: null, apple: null };
  }
  return _authConfig;
}

// Full social sign-in: obtain the provider id_token in the browser, exchange it
// for our JWT. Returns the AuthResult session, or throws.
export async function oauthSignIn(provider) {
  const cfg = await authConfig();
  const providerCfg = cfg?.[provider];
  if (!providerCfg?.clientId) throw new Error(`${provider} sign-in isn't configured yet.`);

  const idToken = provider === 'apple'
    ? await getAppleIdToken(cfg)
    : await getGoogleIdToken(cfg);

  return api(`/api/auth/${provider}`, { method: 'POST', body: { idToken } });
}

// --- biometric (WebAuthn platform authenticator) ---------------------------

export async function biometricAvailable() {
  try {
    if (!window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function biometricEnrolled() {
  try {
    return !!localStorage.getItem(BIOMETRIC_KEY);
  } catch {
    return false;
  }
}

// Enrol this device so a face/fingerprint can re-open the persisted session.
export async function enrollBiometric(session) {
  try {
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(32),
        rp: { name: 'Squad' },
        user: {
          id: textBytes(session?.athleteId || 'me'),
          name: session?.email || session?.name || 'athlete',
          displayName: session?.name || 'Athlete',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },   // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
      },
    });
    const credentialId = cred ? bufToBase64(cred.rawId) : `local.${session?.athleteId || 'me'}`;
    localStorage.setItem(BIOMETRIC_KEY, JSON.stringify({ credentialId, athleteId: session?.athleteId || 'me' }));
    return true;
  } catch {
    return false;
  }
}

// Unlock with the enrolled biometric, then hand back the persisted session (whose
// JWT still authorises the API). The caller should verify it with fetchMe and sign
// out if the server rejects an expired token.
export async function signInWithBiometric() {
  const enrolled = safeParse(localStorage.getItem(BIOMETRIC_KEY));
  if (!enrolled) return null;
  try {
    await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        userVerification: 'required',
        allowCredentials: enrolled.credentialId?.startsWith('local.')
          ? []
          : [{ type: 'public-key', id: base64ToBuf(enrolled.credentialId) }],
        timeout: 60000,
      },
    });
  } catch {
    return null;
  }
  return loadSession();
}

export function clearBiometric() {
  try {
    localStorage.removeItem(BIOMETRIC_KEY);
  } catch { /* ignore */ }
}

// --- small helpers ----------------------------------------------------------

function randomBytes(n) {
  const b = new Uint8Array(n);
  (window.crypto || {}).getRandomValues?.(b);
  return b;
}
function textBytes(str) {
  return new TextEncoder().encode(str);
}
function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function base64ToBuf(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
function safeParse(raw) {
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}
