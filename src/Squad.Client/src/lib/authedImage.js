// Rendering private images that require a bearer token.
//
// The image blobs are private — every read goes through an authenticated endpoint
// (GET /api/images/...). An <img> / CSS background can't send an Authorization
// header, so we fetch the bytes with the token, wrap them in an object URL, and
// hand that to the element. Object URLs are cached by request URL at module scope
// so a teammate who appears in many rows is only fetched once per session (and so
// the URL stays valid while any component still renders it — we never revoke).

import { useEffect, useState } from 'react';

const cache = new Map(); // url -> Promise<objectUrl|null>
const bustListeners = new Set(); // (url) => void — mounted hooks re-fetch on a bust

export function fetchAuthedObjectUrl(url, token) {
  if (!url) return Promise.resolve(null);
  // These endpoints all require auth, so a token-less fetch just 401s. Crucially, do NOT
  // cache that failure: components often render once before their token resolves (token
  // null → real token), and a cached null would poison the URL so the authed retry never
  // runs — leaving group logos/banners and avatars permanently blank. Wait for the token.
  if (!token) return Promise.resolve(null);
  const cached = cache.get(url);
  if (cached) return cached;
  const p = (async () => {
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return null; // 404 → no photo → caller falls back to initials
      return URL.createObjectURL(await res.blob());
    } catch {
      return null;
    }
  })();
  cache.set(url, p);
  return p;
}

// Drop a cached object URL (e.g. after the athlete replaces their own avatar, or an
// owner changes the group logo/banner) so the next fetch pulls the new bytes from the
// same proxy URL. The proxy path is unchanged by a replace, so we also notify every
// mounted useAuthedImage on this URL to re-fetch — otherwise a currently-rendered
// <AuthedImage> keeps its stale object URL until a full page reload re-mounts it.
export function bustAuthedImage(url) {
  const p = cache.get(url);
  if (p) { cache.delete(url); p.then((u) => u && URL.revokeObjectURL(u)).catch(() => {}); }
  bustListeners.forEach((fn) => fn(url));
}

// Resolve a private image URL to a renderable object URL (null until ready / on 404).
export function useAuthedImage(url, token) {
  const [src, setSrc] = useState(null);
  // Bumped when this URL is busted (image replaced) so the fetch effect re-runs even
  // though url/token are unchanged — the module cache was just cleared, so it re-fetches.
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!url) return undefined;
    const onBust = (busted) => { if (busted === url) setNonce((n) => n + 1); };
    bustListeners.add(onBust);
    return () => { bustListeners.delete(onBust); };
  }, [url]);
  useEffect(() => {
    let alive = true;
    if (!url) { setSrc(null); return undefined; }
    fetchAuthedObjectUrl(url, token).then((u) => { if (alive) setSrc(u); });
    return () => { alive = false; };
  }, [url, token, nonce]);
  return src;
}
