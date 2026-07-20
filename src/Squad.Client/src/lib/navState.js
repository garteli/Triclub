// Remember the last screen (and the selections it depends on) so a refresh returns the
// athlete to where they were instead of dropping them back on the dashboard. Device-scoped,
// like prefs (prefs.js) and the session (auth.js) — plain localStorage, hydrated on boot.

const KEY = 'squad.nav';

// Screens we never restore into: the logged-out auth flow and mid-flow / transient screens
// that don't make sense to reopen cold (a half-finished payment, a modal-ish list that
// needs a live selection). Everything else is restored as-is.
const NO_RESTORE = new Set(['welcome', 'login', 'register', 'pay', 'requests', 'chat', 'newgroup']);

export function loadNav() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

// Persist just the navigation slice of app state.
export function saveNav(state) {
  try {
    const { screen, rideState, selGroup, selActivity, selMember } = state;
    localStorage.setItem(KEY, JSON.stringify({ screen, rideState, selGroup, selActivity, selMember }));
  } catch { /* storage unavailable */ }
}

export function clearNav() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

// The screen to restore into, or null to fall back to the default. `validScreens` is the
// app's screen registry, so a saved key that no longer exists is ignored.
export function restorableScreen(nav, validScreens) {
  const scr = nav?.screen;
  if (!scr || NO_RESTORE.has(scr) || !validScreens[scr]) return null;
  return scr;
}
