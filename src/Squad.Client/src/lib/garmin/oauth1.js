// Minimal OAuth 1.0a (HMAC-SHA1) request signing — dependency-free, Web Crypto only.
//
// Garmin's SSO token handshake is OAuth1: the SSO service *ticket* is swapped for an
// OAuth1 token ("preauthorized"), and that OAuth1 token is later swapped for the
// short-lived OAuth2 bearer. Both of those calls must carry a signed
//   Authorization: OAuth oauth_consumer_key="…", oauth_signature="…", …
// header. This is the same signing garth performs in Python; the two call sites are in
// garminClient.native.js (ticketToOAuth1 + oauth1ToOAuth2).
//
// Reverse-engineered against Garmin Connect's unofficial mobile API — validate on real
// hardware; the endpoints and expected params can change without notice.

// RFC-3986 percent-encoding (encodeURIComponent leaves !*'() alone; OAuth requires them encoded).
const enc = (v) =>
  encodeURIComponent(String(v)).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

function nonce(n = 24) {
  const b = new Uint8Array(n);
  (globalThis.crypto || {}).getRandomValues?.(b);
  return Array.from(b, (x) => (x % 36).toString(36)).join('');
}

async function hmacSha1(signingKey, baseString) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('WebCrypto SubtleCrypto is unavailable — cannot sign the Garmin OAuth1 request.');
  const key = await subtle.importKey(
    'raw',
    new TextEncoder().encode(signingKey),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = await subtle.sign('HMAC', key, new TextEncoder().encode(baseString));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

// Build the `Authorization: OAuth …` header value for one request.
//   method       — 'GET' | 'POST'
//   url          — the base URL, WITHOUT its query string
//   consumer     — { key, secret }         (Garmin's app consumer, fetched at runtime)
//   token        — { oauth_token, oauth_token_secret }  or null before we have one
//   queryParams  — query params that will be on the URL (must be folded into the signature base)
export async function oauth1Header({ method, url, consumer, token = null, queryParams = {} }) {
  const oauth = {
    oauth_consumer_key: consumer.key,
    oauth_nonce: nonce(),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: '1.0',
    ...(token?.oauth_token ? { oauth_token: token.oauth_token } : {}),
  };

  // Signature base = METHOD & enc(url) & enc(sorted(all params)).
  const all = { ...queryParams, ...oauth };
  const paramString = Object.keys(all).sort()
    .map((k) => `${enc(k)}=${enc(all[k])}`)
    .join('&');
  const base = [method.toUpperCase(), enc(url), enc(paramString)].join('&');
  const signingKey = `${enc(consumer.secret)}&${enc(token?.oauth_token_secret || '')}`;

  oauth.oauth_signature = await hmacSha1(signingKey, base);

  return 'OAuth ' + Object.keys(oauth).sort()
    .map((k) => `${enc(k)}="${enc(oauth[k])}"`)
    .join(', ');
}
