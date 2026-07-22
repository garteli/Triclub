// A pending squad invite carried by the URL (?invite=TOKEN).
//
// When a friend opens a coach's invite link, we stash the token before the auth flow
// starts so it survives the Welcome → Register → sign-in transitions, then redeem it
// once a session exists (App auto-accepts it → the athlete auto-joins the group).
// Kept in sessionStorage (this browser tab / app session only).

const KEY = 'squad.invite';

// Read ?invite=… from the current URL, stash it, and strip it from the address bar so
// a reload / OAuth redirect doesn't re-trigger and the URL stays tidy. Call once at boot.
export function captureInviteFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('invite');
    if (!token) return;
    sessionStorage.setItem(KEY, token);
    const url = new URL(window.location.href);
    url.searchParams.delete('invite');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  } catch { /* no URL / storage — non-fatal */ }
}

export function pendingInvite() {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}

export function clearInvite() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
