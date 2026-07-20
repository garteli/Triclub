// WebView login fallback — the robust path for accounts with 2-step verification, or when
// Garmin serves a Cloudflare challenge the headless HTTP flow can't pass.
//
// It opens Garmin's REAL login page in an in-app WebView: the user types their credentials
// into Garmin's own page (we never see them), solves any MFA/Cloudflare step there, and on
// success Garmin redirects to `…/embed?ticket=ST-…`. We intercept that redirect, pull the
// service ticket, and hand it to the SAME OAuth1→OAuth2 exchange the headless flow uses
// (exchangeTicket) — so only the credential-collection half changes.
//
// Requires an in-app WebView plugin that emits URL-change events. Written against
// @capacitor/inappbrowser (install native-side: `npm i @capacitor/inappbrowser`; it
// registers as "InAppBrowser"). Reached via registerPlugin(), so there is no web build-time
// dependency. UNRUN against a device — validate the event names/payload shape against your
// installed plugin version; adjust URL_EVENT / CLOSE_EVENT below if they differ.

import { registerPlugin, Capacitor } from '@capacitor/core';
import { exchangeTicket } from './garminClient.native.js';

const SSO = 'https://sso.garmin.com/sso';
const EMBED = `${SSO}/embed`;
// Same SSO params as the headless flow; the embedded widget renders Garmin's normal login.
const SIGNIN_PARAMS = {
  id: 'gauth-widget',
  embedWidget: 'true',
  gauthHost: EMBED,
  service: EMBED,
  source: EMBED,
  redirectAfterAccountLoginUrl: EMBED,
  redirectAfterAccountCreationUrl: EMBED,
};

// Plugin event names — verify against your @capacitor/inappbrowser version.
const URL_EVENT = 'urlChangeEvent';
const CLOSE_EVENT = 'browserClosed';

function signinUrl() {
  return `${SSO}/signin?${new URLSearchParams(SIGNIN_PARAMS)}`;
}

// Extract the ST-ticket from a redirect URL like "…/embed?ticket=ST-123-abc".
function ticketFrom(url) {
  const m = /[?&]ticket=([^&#]+)/.exec(url || '');
  return m ? decodeURIComponent(m[1]) : null;
}

export async function loginWithWebView({ timeoutMs = 180_000 } = {}) {
  if (!Capacitor.isNativePlatform?.()) throw new Error('WebView login is only available in the mobile app.');
  const InAppBrowser = registerPlugin('InAppBrowser');

  const ticket = await new Promise((resolve, reject) => {
    let settled = false;
    const subs = [];
    const timer = setTimeout(() => finish(null, new Error('Garmin login timed out.')), timeoutMs);

    async function finish(t, err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      for (const sub of subs) { try { await sub?.remove?.(); } catch { /* ignore */ } }
      try { await InAppBrowser.close(); } catch { /* already closed */ }
      if (err) reject(err); else resolve(t);
    }

    Promise.all([
      // Watch every navigation for the ticket-bearing redirect.
      InAppBrowser.addListener(URL_EVENT, (e) => {
        const t = ticketFrom(e?.url);
        if (t) finish(t);
      }),
      // User dismissed the WebView before finishing.
      InAppBrowser.addListener(CLOSE_EVENT, () => finish(null, new Error('Garmin login was cancelled.'))),
    ])
      .then((handles) => {
        subs.push(...handles);
        return InAppBrowser.openWebView({ url: signinUrl(), title: 'Sign in to Garmin' });
      })
      .catch((err) => finish(null, err));
  });

  return exchangeTicket(ticket);
}
