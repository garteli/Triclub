// Backend origin for the native app.
//
// On device the SPA is bundled (loads from capacitor://localhost), so root-relative
// `/api` and `/hubs` requests must be sent to the deployed backend instead of the local
// capacitor origin. On the web the app is served same-origin as the API, so the base is
// empty and paths stay relative. This is the one place to change if the backend moves.

import { Capacitor } from '@capacitor/core';

const isNative = () => { try { return Capacitor.isNativePlatform(); } catch { return false; } };

export const API_BASE = isNative()
  ? 'https://www.domestiquehub.com'
  : '';

// Prefix a root-relative path with the backend origin when native (used for SignalR
// hub URLs, which SignalR resolves against the document origin before fetching, and for
// the raw XHR upload — neither goes through the fetch shim below).
export const apiUrl = (path) =>
  API_BASE && typeof path === 'string' && path.startsWith('/') ? API_BASE + path : path;

// Route every root-relative fetch() to the backend on native. In this app all
// root-relative fetches are API calls (bundled assets load via <script>/<img>, not
// fetch), so a blanket prefix is safe. No-op on web (API_BASE === '').
if (API_BASE && typeof window !== 'undefined' && typeof window.fetch === 'function') {
  const orig = window.fetch.bind(window);
  window.fetch = (input, init) =>
    orig(typeof input === 'string' && input.startsWith('/') ? API_BASE + input : input, init);
}
