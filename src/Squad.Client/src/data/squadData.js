// ---------------------------------------------------------------------------
//  Client constants. The demo/seed content has been removed — screens now render
//  real data from the .NET API (squad, feed, activities, leaderboard, plan,
//  groups) or an empty state when there is none. What remains here is structural
//  (nav, icons, status colours) and the workout-detail templates. The live ride now
//  runs on real telemetry (useLiveRide + recorder + sensors), so no simulator remains.
// ---------------------------------------------------------------------------

// Squad members / feed / leaderboard / activities / groups / requests / chat /
// notifications / per-athlete profiles all come from the API now. Empty defaults
// so the prototype (and any not-yet-wired screen) shows an empty state, not fakes.
export const members = [];
export const feed = [];
export const leaderboardData = [];
export const activities = [];
export const nearbyGroups = [];
export const applicants = [];
export const chatThread = [];
export const notifications = [];
export const athleteExtra = {};

// Training plan comes from the API (usePlan). Empty until the athlete has one.
export const planWeek = [];

// Per-activity analysis + profile stats (charts, PRs, zones, laps, segments,
// coach insights) are populated from real activity data; empty until then.
export const coachInsights = [];
export const activitySplits = [];
export const hrZones = [];
export const laps = [];
export const powerCurve = [];
export const achievements = [];
export const segmentRows = [];
export const segEfforts = [];
export const pbs = [];

export const statusColor = (s) => (s === 'crushing' ? 'var(--good)' : s === 'behind' ? 'var(--behind)' : 'var(--warn)');
export const ringColor   = (s) => (s === 'crushing' ? 'var(--good)' : s === 'behind' ? 'var(--behind)' : 'var(--accent)');

// bottom-nav icon markup
export const navIcons = {
  dash:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
  plan:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>',
  ride:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 17.5l-3-6.5H8.5m6.5 0l-2.5 6.5M9.5 6.5h3l2 4.5"/></svg>',
  lb:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M6 4h12v5a6 6 0 0 1-12 0V4zM6 6H3v2a3 3 0 0 0 3 3M18 6h3v2a3 3 0 0 1-3 3"/></svg>',
  coach: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6L18.5 9l-3.5 3 1 5-4-2.7L8 17l1-5L5.5 9l4.6-1.4z"/></svg>',
  // waving flag — the motorsport clubs' Events tab (they run on scheduled sessions, not a training plan)
  events:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4"/><path d="M5 4c2.5-1.6 5 1.4 7.5 0S18 4 19 4v8c-1 0-4-1.6-6.5 0S7.5 12 5 12"/></svg>',
};

export const navDef = [
  { id: 'dash',  label: { en: 'Club',    he: 'המועדון' }, icon: navIcons.dash },
  { id: 'plan',  label: { en: 'Plan',     he: 'תוכנית' },  icon: navIcons.plan },
  { id: 'ride',  label: { en: 'Live',     he: 'רכיבה' },   icon: navIcons.ride },
  { id: 'lb',    label: { en: 'Ranks',    he: 'טבלה' },    icon: navIcons.lb },
  { id: 'coach', label: { en: 'Coach AI', he: 'מאמן' },    icon: navIcons.coach },
];

// Motorsport clubs don't run structured training plans — their second tab is Events
// (scheduled group rides/sessions) instead of Plan — and they have no AI training coach,
// so that tab is dropped too. The bottom nav is otherwise shared; the swap is keyed by
// the active club's discipline family.
const eventsNavItem = { id: 'events', label: { en: 'Events', he: 'אירועים' }, icon: navIcons.events };
export const navFor = (family) =>
  family === 'motorsport'
    ? navDef.filter((n) => n.id !== 'coach').map((n) => (n.id === 'plan' ? eventsNavItem : n))
    : navDef;

export const workoutDefs = {
  bike: { disc: 'bike', color: 'var(--bike)', title: 'Bike · Threshold', meta: 'Key session · Zone 4',
    stats: [['1:15', 'Time'], ['42km', 'Dist'], ['78', 'Load'], ['85%', 'IF']],
    blocks: [['Warm-up', '15′ progressive · Z1→Z2', '55-65%', 26], ['3 × 12′ threshold', '4′ easy between · cadence 90+', '98-102%', 40], ['Cool-down', '10′ spin · Z1', '<55%', 22]],
    note: 'Target power should feel like a hard 20-min effort you could just hold.' },
  gym: { disc: 'gym', color: 'var(--gym)', title: 'Gym · Strength', meta: 'TRX + weights + core',
    stats: [['0:55', 'Time'], ['6', 'Exercises'], ['40', 'Load'], ['3', 'Rounds']],
    blocks: [['Activation', '5′ band work + mobility', 'Warm-up', 18], ['TRX circuit', 'Rows, pistol, atomic push-up · 3 rounds', 'Bodyweight', 34], ['Weights', 'Trap-bar DL + split squat · 4×6', 'Heavy', 44], ['Core + Pilates', 'Planks, dead-bug, leg lowers', 'Stability', 30], ['Yoga cool-down', '5′ breath + hip openers', 'Mobility', 18]],
    note: 'Triathlete-specific strength — heavy but low volume to protect the endurance work.' },
  yoga: { disc: 'gym', color: 'var(--gym)', title: 'Mobility · Yoga', meta: 'Recovery flow',
    stats: [['0:45', 'Time'], ['18', 'Load'], ['Z1', 'Effort'], ['✓', 'Done']],
    blocks: [['Breath + centering', '3′ box breathing', 'Calm', 16], ['Vinyasa flow', 'Sun salutations · slow', 'Flow', 34], ['Hip + hamstring', 'Pigeon, lizard, folds', 'Deep', 28], ['Savasana', '5′ full relaxation', 'Reset', 16]],
    note: 'Recovery day — down-regulate the nervous system. No pushing into pain.' },
  pilates: { disc: 'gym', color: 'var(--gym)', title: 'Core · Pilates', meta: 'Reformer + mat',
    stats: [['0:40', 'Time'], ['22', 'Load'], ['5', 'Blocks'], ['Core', 'Focus']],
    blocks: [['Warm-up', 'Pelvic tilts + breathing', 'Prep', 16], ['Reformer series', 'Footwork, long-stretch, teaser', 'Control', 36], ['Plank complex', 'Front + side · 3 rounds', 'Stability', 30], ['Leg lowers + dead-bug', 'Anti-extension', 'Deep core', 26], ['Stretch', 'Spine + hip flexors', 'Mobility', 16]],
    note: 'Core stability transfers straight to your bike and run posture.' },
  swim: { disc: 'swim', color: 'var(--swim)', title: 'Swim · Technique', meta: 'Drills + form',
    stats: [['1:00', 'Time'], ['2.4km', 'Dist'], ['45', 'Load'], ['Z2', 'Effort']],
    blocks: [['Warm-up', '400m easy + 4×50 drill', 'Easy', 22], ['8 × 100 technique', 'Catch-up, single-arm, scull', 'Form', 38], ['Cool-down', '200m easy', 'Recover', 18]],
    note: 'Technique day — slow down and feel the catch.' },
  run: { disc: 'run', color: 'var(--run)', title: 'Run · Tempo', meta: 'Threshold',
    stats: [['0:50', 'Time'], ['9km', 'Dist'], ['62', 'Load'], ['Z3-4', 'Effort']],
    blocks: [['Warm-up', '12′ easy + strides', 'Easy', 22], ['20′ tempo', 'Comfortably hard · threshold', 'Z4', 40], ['Cool-down', '10′ easy jog', 'Recover', 20]],
    note: 'Hold an even effort — don’t start too hot.' },
};

// discipline icon markup (used in the plan week rows)
const discPaths = {
  bike: '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 17.5l-3-6.5H8.5m6.5 0l-2.5 6.5M9.5 6.5h3l2 4.5"/>',
  run:  '<path d="M13 4a1.5 1.5 0 1 0 0-.01M8 20l3-5 3 2 1 3M9 12l2-3 4 1 2 3M6 8l3-1"/>',
  gym:  '<path d="M6.5 6.5v11M17.5 6.5v11M4 9v6M20 9v6M6.5 12h11"/>',
  swim: '<path d="M2 16c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M2 20c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M8 9l4 3M11 6a1.5 1.5 0 1 0 0-.01"/>',
  rest: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
};
export const discIcon = (d) =>
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  (discPaths[d] || discPaths.rest) + '</svg>';
