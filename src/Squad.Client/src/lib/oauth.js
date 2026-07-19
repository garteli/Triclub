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

// --- native SDK (Capacitor) — initialized once from /api/auth/config values ---
let _nativeReady;
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
  return SocialLogin;
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

// --- Google ---
// Native: @capgo native Google SDK. Web: Google Identity Services
// (https://accounts.google.com/gsi/client → window.google.accounts.id).
// `cfg` is the full /api/auth/config object.
export async function getGoogleIdToken(cfg) {
  if (isNative()) {
    // The native Google SDK can't initialize without an iOS OAuth client id. If the
    // backend hasn't published one (Auth__Google__iOSClientId app setting), fail loudly
    // instead of letting the native login promise hang at "Signing in…".
    if (!cfg?.google?.iosClientId) {
      throw new Error('Google sign-in isn’t set up for the app yet (missing iOS client id).');
    }
    const SocialLogin = await nativeSocialLogin(cfg);
    const res = await SocialLogin.login({ provider: 'google', options: { scopes: ['email', 'profile'] } });
    const idToken = res?.result?.idToken;
    if (!idToken) throw new Error('Google sign-in did not return a token.');
    return idToken;
  }
  const clientId = cfg?.google?.clientId;
  await loadScript('https://accounts.google.com/gsi/client');
  const id = window.google?.accounts?.id;
  if (!id) throw new Error('Google sign-in failed to load.');

  return new Promise((resolve, reject) => {
    id.initialize({
      client_id: clientId,
      callback: (resp) => {
        if (resp?.credential) resolve(resp.credential);
        else reject(new Error('Google sign-in was cancelled.'));
      },
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    // One Tap / prompt. If the browser suppresses it, surface a clear error so the
    // caller can fall back to email (a rendered GSI button is the production-robust path).
    id.prompt((notification) => {
      if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.()) {
        reject(new Error('Google sign-in was dismissed. Try email, or check pop-up settings.'));
      }
    });
  });
}

// --- Apple ---
// Native: @capgo native Sign in with Apple (ASAuthorization). Web: Sign in with
// Apple JS (https://appleid.cdn-apple.com/.../appleid.auth.js → window.AppleID.auth).
// `cfg` is the full /api/auth/config object.
export async function getAppleIdToken(cfg) {
  if (isNative()) {
    const SocialLogin = await nativeSocialLogin(cfg);
    const res = await SocialLogin.login({ provider: 'apple', options: { scopes: ['email', 'name'] } });
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
