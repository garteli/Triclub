// Loads the provider sign-in SDKs on demand and returns a verified id_token that
// the backend (/api/auth/{provider}) validates against the provider's JWKS.
//
// These SDKs are third-party scripts loaded from the provider's CDN — required for
// the real OAuth flow. They only run once the user taps a social button, and only
// when the provider is configured (server returns its clientId via /api/auth/config).

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

// --- Google Identity Services ---
// https://accounts.google.com/gsi/client → window.google.accounts.id
// The callback receives { credential } = a signed OIDC id_token.
export async function getGoogleIdToken(clientId) {
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

// --- Sign in with Apple JS ---
// https://appleid.cdn-apple.com/.../appleid.auth.js → window.AppleID.auth
export async function getAppleIdToken(clientId) {
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
