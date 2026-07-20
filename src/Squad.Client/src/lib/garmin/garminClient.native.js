// Native Garmin Connect client — a JS port of garth's login + token flow, run on the
// device over CapacitorHttp so it is NOT subject to browser CORS (a browser fetch to
// sso.garmin.com is blocked; a native HTTP request is not). This module is only loaded
// inside the native shell.
//
// Reverse-engineered from garth / the Garmin Connect mobile API. Every URL here is
// UNOFFICIAL and can change without notice — validate on real hardware, and expect
// Garmin's SSO (2-step verification, Cloudflare challenges) to periodically force the
// WebView-login fallback. This is the fragile part flagged in the design discussion.
//
//   login()          email+password  → { oauth1, oauth2, savedAt }   (the persisted session)
//   ensureBearer()   session          → session with a fresh OAuth2 bearer (refreshes if stale)
//   listActivities() session          → [activitySummary]            (newest first)
//   downloadOriginal(session, id)     → { name, bytes }              (a .zip of the source .fit)

import { CapacitorHttp } from '@capacitor/core';
import { oauth1Header } from './oauth1.js';

const SSO = 'https://sso.garmin.com/sso';
const EMBED = `${SSO}/embed`;
const API = 'https://connectapi.garmin.com';
const OAUTH_PREAUTH = `${API}/oauth-service/oauth/preauthorized`;
const OAUTH_EXCHANGE = `${API}/oauth-service/oauth/exchange/user/2.0`;
// garth publishes the app consumer key/secret here so clients don't have to embed them.
const CONSUMER_URL = 'https://thegarth.s3.amazonaws.com/oauth_consumer.json';
// The mobile app User-Agent the SSO flow expects; a browser UA takes a different path.
const UA = 'com.garmin.android.apps.connectmobile';

const EMBED_PARAMS = { id: 'gauth-widget', embedWidget: 'true', gauthHost: SSO };
const SIGNIN_PARAMS = {
  ...EMBED_PARAMS,
  gauthHost: EMBED,
  service: EMBED,
  source: EMBED,
  redirectAfterAccountLoginUrl: EMBED,
  redirectAfterAccountCreationUrl: EMBED,
};

// Thrown when Garmin demands a 2-step verification code — the raw HTTP flow can't
// complete it non-interactively; the caller should fall back to WebView login.
export class GarminMfaRequired extends Error {
  constructor(msg) { super(msg); this.name = 'GarminMfaRequired'; }
}

let _consumer = null;
async function consumer() {
  if (_consumer) return _consumer;
  const res = await CapacitorHttp.request({ url: CONSUMER_URL, method: 'GET' });
  const j = asJson(res.data);
  if (!j?.consumer_key || !j?.consumer_secret) throw new Error('Could not fetch Garmin OAuth consumer.');
  _consumer = { key: j.consumer_key, secret: j.consumer_secret };
  return _consumer;
}

// ---- login: email/password → OAuth1 → OAuth2 ------------------------------

export async function login({ username, password }) {
  // 1. Prime the SSO cookies (CapacitorHttp keeps the native cookie jar across calls).
  await CapacitorHttp.request({
    url: EMBED, method: 'GET', params: EMBED_PARAMS,
    headers: { 'User-Agent': UA },
  });

  // 2. GET the signin page → CSRF token.
  const page = await CapacitorHttp.request({
    url: `${SSO}/signin`, method: 'GET', params: SIGNIN_PARAMS,
    headers: { 'User-Agent': UA, referer: EMBED },
  });
  const csrf = (String(page.data ?? '').match(/name="_csrf"\s+value="([^"]+)"/) || [])[1];
  if (!csrf) {
    throw new Error('Garmin SSO: no CSRF token on the login page (page shape changed or a Cloudflare challenge — use WebView login).');
  }

  // 3. POST credentials → service ticket (embedded in the response HTML).
  const post = await CapacitorHttp.request({
    url: `${SSO}/signin`, method: 'POST', params: SIGNIN_PARAMS,
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      referer: `${SSO}/signin`,
    },
    data: formEncode({ username, password, embed: 'true', _csrf: csrf }),
  });
  const html = String(post.data ?? '');
  const ticket = (html.match(/embed\?ticket=([^"]+)"/) || [])[1];
  if (!ticket) {
    if (/verificationCode|mfa-code|VERIFICATION/i.test(html)) {
      throw new GarminMfaRequired('Garmin needs a 2-step verification code. Use the in-app WebView login for MFA accounts.');
    }
    throw new Error('Garmin SSO: login returned no ticket (wrong email/password, or the SSO flow changed).');
  }

  const oauth1 = await ticketToOAuth1(ticket);
  const oauth2 = await oauth1ToOAuth2(oauth1);
  return { oauth1, oauth2, savedAt: Date.now() };
}

async function ticketToOAuth1(ticket) {
  const c = await consumer();
  const queryParams = { ticket, 'login-url': EMBED, 'accepts-mfa-tokens': 'true' };
  const header = await oauth1Header({ method: 'GET', url: OAUTH_PREAUTH, consumer: c, queryParams });
  const res = await CapacitorHttp.request({
    url: OAUTH_PREAUTH, method: 'GET', params: queryParams,
    headers: { Authorization: header, 'User-Agent': UA },
  });
  const p = new URLSearchParams(String(res.data ?? ''));
  const oauth_token = p.get('oauth_token');
  const oauth_token_secret = p.get('oauth_token_secret');
  if (!oauth_token || !oauth_token_secret) throw new Error('Garmin: OAuth1 preauthorized exchange failed.');
  return { oauth_token, oauth_token_secret };
}

async function oauth1ToOAuth2(oauth1) {
  const c = await consumer();
  const header = await oauth1Header({ method: 'POST', url: OAUTH_EXCHANGE, consumer: c, token: oauth1 });
  const res = await CapacitorHttp.request({
    url: OAUTH_EXCHANGE, method: 'POST',
    headers: {
      Authorization: header,
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    data: '',
  });
  const j = asJson(res.data);
  if (!j?.access_token) throw new Error('Garmin: OAuth2 exchange failed.');
  // expires_in is seconds; stamp an absolute expiry so ensureBearer can check cheaply.
  return { ...j, expiresAt: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
}

// Return a session whose OAuth2 bearer is valid, refreshing from the OAuth1 token if it's
// within 60s of expiry. No password needed — this is the whole point of persisting OAuth1.
export async function ensureBearer(session) {
  const tok = session?.oauth2;
  if (tok?.access_token && (tok.expiresAt ?? 0) > Date.now() + 60_000) return session;
  const oauth2 = await oauth1ToOAuth2(session.oauth1);
  return { ...session, oauth2 };
}

// ---- data pull -------------------------------------------------------------

// Activity summaries, newest first. `start` is an offset for paging.
export async function listActivities(session, { start = 0, limit = 20 } = {}) {
  const res = await CapacitorHttp.request({
    url: `${API}/activitylist-service/activities/search/activities`,
    method: 'GET',
    params: { start: String(start), limit: String(limit) },
    headers: { Authorization: `Bearer ${session.oauth2.access_token}`, 'User-Agent': UA },
  });
  const j = asJson(res.data);
  return Array.isArray(j) ? j : [];
}

// The original uploaded file for an activity → { name, bytes }. Garmin returns a .zip
// wrapping the source .fit; the existing extractFitFiles() (fitArchive.js) unpacks it,
// so this feeds the standard upload path unchanged.
export async function downloadOriginal(session, activityId) {
  const res = await CapacitorHttp.request({
    url: `${API}/download-service/files/activity/${activityId}`,
    method: 'GET',
    responseType: 'blob',
    headers: { Authorization: `Bearer ${session.oauth2.access_token}`, 'User-Agent': UA },
  });
  return { name: `garmin-${activityId}.zip`, bytes: await toBytes(res.data) };
}

// ---- small helpers ---------------------------------------------------------

function formEncode(obj) {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

function asJson(data) {
  if (data == null) return null;
  if (typeof data === 'string') { try { return JSON.parse(data); } catch { return null; } }
  return data; // CapacitorHttp may already hand back a parsed object
}

// CapacitorHttp returns a base64 string for responseType:'blob' on native; a browser
// fetch shim would hand back a Blob or ArrayBuffer. Normalize all three to Uint8Array.
async function toBytes(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (typeof Blob !== 'undefined' && data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  if (typeof data === 'string') {
    const bin = atob(data);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  throw new Error('Garmin download: unexpected payload type.');
}
