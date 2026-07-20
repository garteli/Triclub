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

export function fetchAuthedObjectUrl(url, token) {
  if (!url) return Promise.resolve(null);
  const cached = cache.get(url);
  if (cached) return cached;
  const p = (async () => {
    try {
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (!res.ok) return null; // 404 → no photo → caller falls back to initials
      return URL.createObjectURL(await res.blob());
    } catch {
      return null;
    }
  })();
  cache.set(url, p);
  return p;
}

// Drop a cached object URL (e.g. after the athlete replaces their own avatar) so
// the next render re-fetches the new bytes from the same proxy URL.
export function bustAuthedImage(url) {
  const p = cache.get(url);
  if (p) { cache.delete(url); p.then((u) => u && URL.revokeObjectURL(u)).catch(() => {}); }
}

// Resolve a private image URL to a renderable object URL (null until ready / on 404).
export function useAuthedImage(url, token) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let alive = true;
    if (!url) { setSrc(null); return; }
    fetchAuthedObjectUrl(url, token).then((u) => { if (alive) setSrc(u); });
    return () => { alive = false; };
  }, [url, token]);
  return src;
}
