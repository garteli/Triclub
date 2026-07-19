// Local app preferences (units, notifications, privacy) for the Settings sub-screens.
//
// These are device-scoped UI preferences, so they live in localStorage — the same
// durable store the session uses (auth.js) — and are hydrated into App state on boot.
// Everything is merged over `defaultPrefs` on load so adding a new key never breaks
// a previously-saved blob.

const KEY = 'squad.prefs';

export const defaultPrefs = {
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
    units: saved.units ?? defaultPrefs.units,
    temp: saved.temp ?? defaultPrefs.temp,
    notif: { ...defaultPrefs.notif, ...(saved.notif || {}) },
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
    const { units, temp, notif, privacy } = state;
    localStorage.setItem(KEY, JSON.stringify({ units, temp, notif, privacy }));
  } catch { /* storage unavailable */ }
  return state;
}

// Human labels for the units row / previews.
export const unitsLabel = (units) => (units === 'imperial' ? 'Imperial (mi, lb)' : 'Metric (km, kg)');
