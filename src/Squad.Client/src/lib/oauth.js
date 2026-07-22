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
    _nativeReady = SocialLogin.initialize({
      google: {
        iOSClientId: cfg?.google?.iosClientId,      // native iOS OAuth client
        iOSServerClientId: cfg?.google?.clientId,   // web client id (server audience)
        webClientId: cfg?.google?.clientId,
      },
      apple: {
        clientId: cfg?.apple?.clientId,             // Services ID (web/Android); iOS uses the bundle id
        redirectUrl: '',                            // empty => no redirect on iOS
      },
    }).catch((e) => { _nativeReady = undefined; throw e; });
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
    const res = await withTimeout(
      nativeLogin(cfg, { provider: 'google', options: { scopes: ['email', 'profile'] } }),
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
  await loadScript('https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js');
  const auth = window.AppleID?.auth;
  if (!auth) throw new Error('Apple sign-in failed to load.');

  auth.init({
    clientId,                        // Apple Services ID (== the token audience)
    scope: 'name email',
    redirectURI: window.location.origin,
    usePopup: true,
  });

  const res = await auth.signIn();   // throws/ rejects if the user cancels
  const idToken = res?.authorization?.id_token;
  if (!idToken) throw new Error('Apple sign-in did not return a token.');
  return idToken;
}
