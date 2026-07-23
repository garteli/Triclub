// A pending event link carried by the URL (?event=<squadId>.<eventId>).
//
// When someone opens a shared event link, we stash the squad + event ids before the auth flow
// starts so they survive the Welcome → Register → sign-in transitions, then redeem them once a
// session exists (App fetches the event and drops the viewer straight onto its detail page).
// Kept in sessionStorage (this browser tab / app session only). The viewer must be a member of
// the club to actually see the event — redemption fails silently otherwise.

const KEY = 'squad.eventlink';

// Build the shareable link for an event: <origin>/?event=<squadId>.<eventId>.
export function eventShareUrl(squadId, eventId) {
  try {
    const origin = window.location.origin;
    return `${origin}/?event=${encodeURIComponent(squadId)}.${encodeURIComponent(eventId)}`;
  } catch { return ''; }
}

// Read ?event=… from the current URL, stash it, and strip it from the address bar so a reload /
// OAuth redirect doesn't re-trigger and the URL stays tidy. Call once at boot.
export function captureEventFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('event');
    if (!raw) return;
    const dot = raw.indexOf('.');
    if (dot > 0) {
      const squadId = decodeURIComponent(raw.slice(0, dot));
      const eventId = decodeURIComponent(raw.slice(dot + 1));
      if (squadId && eventId) sessionStorage.setItem(KEY, JSON.stringify({ squadId, eventId }));
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('event');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  } catch { /* no URL / storage — non-fatal */ }
}

export function pendingEventLink() {
  try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; }
}

export function clearEventLink() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
