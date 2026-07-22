// Local app preferences (units, notifications, privacy) for the Settings sub-screens.
//
// These are device-scoped UI preferences, so they live in localStorage — the same
// durable store the session uses (auth.js) — and are hydrated into App state on boot.
// Everything is merged over `defaultPrefs` on load so adding a new key never breaks
// a previously-saved blob.

const KEY = 'squad.prefs';

export const defaultPrefs = {
  theme: 'dark',     // 'dark' | 'light'
  accent: 'orange',  // accent id — see Settings `accents` (lime/orange/teal/blue)
  lang: 'en',        // 'en' | 'he' (Hebrew flips the app to RTL)
  units: 'metric',   // 'metric' (km, kg) | 'imperial' (mi, lb)
  temp: 'c',         // 'c' | 'f'
  notif: {
    kudos: true,          // someone kudos'd your activity
    comments: true,       // comments on your activity
    follows: true,        // new followers
    groupInvites: true,   // team / group invites and join approvals
    rideStart: true,      // a group ride you're in goes live
    coachMessages: true,  // messages from your coach
    leaderboard: true,    // weekly leaderboard placement
    weeklySummary: true,  // Monday training recap
    productNews: false,   // product news & tips
    quietHours: false,    // mute 22:00–07:00
  },
  // Auto-pause the recorder when you stop, resume after sustained movement (km/h thresholds).
  autoPause: {
    enabled: true,
    pauseKph: 2,   // pause when speed drops below this
    resumeKph: 4,  // resume after speed holds above this for 5 s
  },
  privacy: {
    profile: 'squad',      // who can see your profile: 'public' | 'squad' | 'private'
    activityMap: 'squad',  // who can see your activity maps
    hideEnds: true,        // hide start/finish within 200 m of saved places
    leaderboard: true,     // appear on team leaderboards
    discoverable: true,    // show up in Discover / athlete search
    liveLocation: true,    // share live position during group rides
    analytics: false,      // share anonymous usage analytics
  },
};

// Shallow-merge saved values over the defaults (one level deep for the nested groups).
function merge(saved) {
  if (!saved || typeof saved !== 'object') return { ...defaultPrefs };
  return {
    theme: saved.theme ?? defaultPrefs.theme,
    accent: saved.accent ?? defaultPrefs.accent,
    lang: saved.lang ?? defaultPrefs.lang,
    units: saved.units ?? defaultPrefs.units,
    temp: saved.temp ?? defaultPrefs.temp,
    notif: { ...defaultPrefs.notif, ...(saved.notif || {}) },
    autoPause: { ...defaultPrefs.autoPause, ...(saved.autoPause || {}) },
    privacy: { ...defaultPrefs.privacy, ...(saved.privacy || {}) },
  };
}

export function loadPrefs() {
  try {
    return merge(JSON.parse(localStorage.getItem(KEY)));
  } catch {
    return { ...defaultPrefs };
  }
}

// Persist just the preference slice of app state.
export function savePrefs(state) {
  try {
    const { theme, accent, lang, units, temp, notif, autoPause, privacy } = state;
    localStorage.setItem(KEY, JSON.stringify({ theme, accent, lang, units, temp, notif, autoPause, privacy }));
  } catch { /* storage unavailable */ }
  return state;
}

// Human labels for the units row / previews.
export const unitsLabel = (units) => (units === 'imperial' ? 'Imperial (mi, lb)' : 'Metric (km, kg)');
