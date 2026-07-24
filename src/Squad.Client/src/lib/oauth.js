// Returns a verified provider id_token that the backend (/api/auth/{provider})
// validates against the provider's JWKS.
//
// Two paths, chosen at runtime:
//   • Web browser — load the provider's JS SDK from its CDN (GSI / Apple JS).
//   • Native app (Capacitor iOS/Android) — Google & Apple block their *web* SDKs
//     inside embedded webviews, so use the native SDKs via @capgo/capacitor-social-login.
// The plugin is dynamically imported only on native, so the web bundle never loads it.
//
// Both run only once the user taps a social button, and only when the provider is
// configured (server returns clientId + iosClientId/bundleId via /api/auth/config).

import { Capacitor } from '@capacitor/core';

const isNative = () => { try { return Capacitor.isNativePlatform(); } catch { return false; } };

// The native social-login plugin must be compiled into the app binary (pod/gradle).
// If the installed build predates it, Capacitor throws "…not implemented on ios".
// Translate that into an actionable message instead of leaking the raw plugin error.
const PLUGIN_MISSING = 'Google & Apple sign-in need the latest app version. Please update from the App Store, or use “Create account”.';
const isPluginMissing = (e) => /not implemented|unimplemented|not available|no such module/i.test((e && (e.message || String(e))) || '');
async function nativeLogin(cfg, opts) {
  try {
    const { SocialLogin } = await nativeSocialLogin(cfg);
    return await SocialLogin.login(opts);
  } catch (e) {
    if (isPluginMissing(e)) throw new Error(PLUGIN_MISSING);
    throw e;
  }
}

// --- native SDK (Capacitor) — initialized once from /api/auth/config values ---
let _nativeReady;
// NB: returns the plugin **wrapped in an object**, never bare. Capacitor plugin
// proxies turn any property access into a native call, so returning one directly
// from an async function makes the promise machinery probe `.then` — which fires a
// bogus `SocialLogin.then()` bridge call that rejects ("not implemented on ios")
// and leaves the awaited promise permanently unsettled (sign-in silently hangs).
async function nativeSocialLogin(cfg) {
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  if (!_nativeReady) {
    const initCfg = {
      google: {
        iOSClientId: cfg?.google?.iosClientId,      // native iOS OAuth client
        iOSServerClientId: cfg?.google?.clientId,   // web client id (server audience)
        webClientId: cfg?.google?.clientId,
      },
    };
    // Apple's native init needs a redirectUrl on Android (a web OAuth flow) that we don't have —
    // including it makes the whole initialize() throw ("apple.android.redirectUrl is null or empty"),
    // which would ALSO break Google sign-in. So configure Apple only where it's used (iOS).
    if (Capacitor.getPlatform() !== 'android') {
      initCfg.apple = {
        clientId: cfg?.apple?.clientId,             // Services ID (web); iOS uses the bundle id
        redirectUrl: '',                            // empty => no redirect on iOS
      };
    }
    _nativeReady = SocialLogin.initialize(initCfg).catch((e) => { _nativeReady = undefined; throw e; });
  }
  await _nativeReady;
  return { SocialLogin };
}

// --- script loader (once per src) ---
const loaded = new Map();
function loadScript(src) {
  if (loaded.has(src)) return loaded.get(src);
  const p = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(el);
  });
  loaded.set(src, p);
  return p;
}

// A sign-in must never leave the UI spinning forever: if the native sheet or the web
// One-Tap prompt neither resolves nor rejects, reject after `ms` so the caller can
// clear its busy state and let the user retry (or fall back to email).
const SIGNIN_TIMEOUT_MS = 60000;
function withTimeout(promise, ms, msg) {
  let timer;
  const guard = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(msg)), ms); });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

// Render Google's OFFICIAL Sign In button into `container` (web only). Far more reliable in
// mobile browsers than One Tap (`id.prompt`), which they routinely suppress. `onCredential`
// receives the id_token on a real button click; `onError` fires if GSI can't load.
export async function renderGoogleButton(clientId, container, onCredential, onError) {
  if (isNative() || !container) return;
  try {
    await loadScript('https://accounts.google.com/gsi/client');
    const id = window.google?.accounts?.id;
    if (!id) { onError?.(new Error('Google sign-in failed to load.')); return; }
    id.initialize({
      client_id: clientId,
      callback: (resp) => (resp?.credential ? onCredential(resp.credential) : onError?.(new Error('Google sign-in was cancelled.'))),
      auto_select: false,
    });
    container.innerHTML = '';
    const w = Math.min(400, Math.max(240, Math.floor(container.getBoundingClientRect().width) || 320));
    id.renderButton(container, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', logo_alignment: 'center', width: w });
  } catch (e) { onError?.(e); }
}

// --- Google ---
// Native: @capgo native Google SDK. Web: Google Identity Services
// (https://accounts.google.com/gsi/client → window.google.accounts.id).
// `cfg` is the full /api/auth/config object.
export async function getGoogleIdToken(cfg) {
  if (isNative()) {
    // The native Google SDK can't initialize without an iOS OAuth client id. If the
    // backend hasn't published one (Auth__Google__iOSClientId app setting), fail fast
    // instead of waiting out the timeout at "Signing in…".
    if (!cfg?.google?.iosClientId) {
      throw new Error('Google sign-in isn’t set up for the app yet (missing iOS client id).');
    }
    // No `scopes`: we only need the id_token (which already carries email + basic profile). Requesting
    // extra scopes triggers the plugin's access-token flow, which on Android errors "You CANNOT use
    // scopes without modifying the main activity" — and we don't need that access token anyway.
    const res = await withTimeout(
      nativeLogin(cfg, { provider: 'google' }),
      SIGNIN_TIMEOUT_MS, 'Google sign-in timed out — please try again.');
    const idToken = res?.result?.idToken;
    if (!idToken) throw new Error('Google sign-in did not return a token.');
    return idToken;
  }
  const clientId = cfg?.google?.clientId;
  await loadScript('https://accounts.google.com/gsi/client');
  const id = window.google?.accounts?.id;
  if (!id) throw new Error('Google sign-in failed to load.');

  return withTimeout(new Promise((resolve, reject) => {
    id.initialize({
      client_id: clientId,
      callback: (resp) => {
        if (resp?.credential) resolve(resp.credential);
        else reject(new Error('Google sign-in was cancelled.'));
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    // One Tap / prompt. If the browser suppresses it (common in in-app browsers), surface a
    // clear error so the user can retry — a rendered GSI button is the production-robust path.
    id.prompt((notification) => {
      if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.()) {
        reject(new Error('Google sign-in didn’t open. Try again, or open the app in Safari/Chrome (some in-app browsers block sign-in).'));
      }
    });
  }), SIGNIN_TIMEOUT_MS, 'Google sign-in timed out — please try again.');
}

// --- Apple ---
// Native: @capgo native Sign in with Apple (ASAuthorization). Web: Sign in with
// Preload + init Apple's SDK on the login screen so the sign-in popup opens synchronously on the
// user's tap. Without this, the first tap loads the script over the network THEN opens the popup —
// and the browser blocks that popup because it's no longer tied to the click gesture.
const APPLE_JS = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
export async function preloadApple(cfg) {
  if (isNative() || !cfg?.apple?.clientId) return;
  try {
    await loadScript(APPLE_JS);
    window.AppleID?.auth?.init({ clientId: cfg.apple.clientId, scope: 'name email', redirectURI: window.location.origin, usePopup: true });
  } catch { /* best-effort — getAppleIdToken re-inits if needed */ }
}

// Apple JS (https://appleid.cdn-apple.com/.../appleid.auth.js → window.AppleID.auth).
// `cfg` is the full /api/auth/config object.
export async function getAppleIdToken(cfg) {
  if (isNative()) {
    const res = await withTimeout(
      nativeLogin(cfg, { provider: 'apple', options: { scopes: ['email', 'name'] } }),
      SIGNIN_TIMEOUT_MS, 'Apple sign-in timed out — please try again.');
    const idToken = res?.result?.idToken;
    if (!idToken) throw new Error('Apple sign-in did not return a token.');
    return idToken;
  }
  const clientId = cfg?.apple?.clientId;
  await loadScript(APPLE_JS);
  const auth = window.AppleID?.auth;
  if (!auth) throw new Error('Apple sign-in failed to load.');

  auth.init({
    clientId,                        // Apple Services ID (== the token audience)
    scope: 'name email',
    redirectURI: window.location.origin,
    usePopup: true,
  });

  let res;
  try {
    res = await auth.signIn();
  } catch (e) {
    const code = e?.error || '';
    if (['popup_closed_by_user', 'user_cancelled_authorize', 'user_trigger_new_signin_flow'].includes(code)) {
      throw new Error('Apple sign-in was cancelled.');
    }
    // invalid_client / invalid redirect etc. → the Services ID isn't set up for this domain.
    throw new Error('Apple sign-in couldn’t complete here. Open the app in Safari/Chrome, or (setup) add this site’s domain + return URL to the Apple Services ID.');
  }
  const idToken = res?.authorization?.id_token;
  if (!idToken) throw new Error('Apple sign-in did not return a token.');
  return idToken;
}
