// ---------------------------------------------------------------------------
//  Static demo data — ported 1:1 from the Claude Design prototype's Component
//  class. In a production app these would come from the .NET API; kept inline
//  here so the UI renders identically to the handoff out of the box.
// ---------------------------------------------------------------------------

export const members = [
  { id: 'dana', name: 'You (Dana)', nameHe: 'דנה (את)', initials: 'DL', he: 'דל', color: '#d6ff3f', status: 'crushing', pct: 96 },
  { id: 'noa',  name: 'Noa',  nameHe: 'נועה', initials: 'NR', he: 'נע', color: '#ff9a4c', status: 'crushing', pct: 100 },
  { id: 'adam', name: 'Adam', nameHe: 'אדם', initials: 'AB', he: 'אד', color: '#37c0ff', status: 'ontrack', pct: 72 },
  { id: 'maya', name: 'Maya', nameHe: 'מאיה', initials: 'MK', he: 'מא', color: '#c68bff', status: 'ontrack', pct: 64 },
  { id: 'roi',  name: 'Roi',  nameHe: 'רועי', initials: 'RG', he: 'רו', color: '#4fe08b', status: 'ontrack', pct: 80 },
  { id: 'yoav', name: 'Yoav', nameHe: 'יואב', initials: 'YS', he: 'יו', color: '#ff6f61', status: 'behind', pct: 38 },
  { id: 'itai', name: 'Itai', nameHe: 'איתי', initials: 'IT', he: 'אי', color: '#ffce4a', status: 'behind', pct: 28 },
  { id: 'tal',  name: 'Tal',  nameHe: 'טל', initials: 'TV', he: 'טל', color: '#5a86ff', status: 'crushing', pct: 92 },
];

export const statusColor = (s) => (s === 'crushing' ? 'var(--good)' : s === 'behind' ? 'var(--behind)' : 'var(--warn)');
export const ringColor   = (s) => (s === 'crushing' ? 'var(--good)' : s === 'behind' ? 'var(--behind)' : 'var(--accent)');

export const feed = [
  { id: 1, name: 'Noa',  nameHe: 'נועה', he: 'נע', initials: 'NR', color: '#ff9a4c', action: 'crushed a threshold ride',      actionHe: 'סיימה אימון סף חזק',    metric: '42.1km · 1:14 · 82 TSS', time: '18m ago', timeHe: 'לפני 18 דק׳', reacts: 6, icon: '🚴', discColor: '#ffce4a' },
  { id: 2, name: 'Roi',  nameHe: 'רועי', he: 'רו', initials: 'RG', color: '#4fe08b', action: 'logged an easy run',            actionHe: 'רשם ריצה קלה',          metric: '8.4km · 4:52 /km',       time: '1h ago',  timeHe: 'לפני שעה',   reacts: 3, icon: '🏃', discColor: '#ff6f61' },
  { id: 3, name: 'Tal',  nameHe: 'טל',  he: 'טל', initials: 'TV', color: '#5a86ff', action: 'swam a technique set',         actionHe: 'שחה סט טכניקה',        metric: '2,400m · 1:46 /100',     time: '3h ago',  timeHe: 'לפני 3 שע׳', reacts: 9, icon: '🏊', discColor: '#37c0ff' },
  { id: 4, name: 'Maya', nameHe: 'מאיה', he: 'מא', initials: 'MK', color: '#c68bff', action: 'did a strength + core session', actionHe: 'סיימה אימון כוח וליבה', metric: '0:52 · TRX + weights',   time: '5h ago',  timeHe: 'לפני 5 שע׳', reacts: 4, icon: '🏋️', discColor: '#c68bff' },
];

// bottom-nav icon markup
export const navIcons = {
  dash:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
  plan:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>',
  ride:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 17.5l-3-6.5H8.5m6.5 0l-2.5 6.5M9.5 6.5h3l2 4.5"/></svg>',
  lb:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M6 4h12v5a6 6 0 0 1-12 0V4zM6 6H3v2a3 3 0 0 0 3 3M18 6h3v2a3 3 0 0 1-3 3"/></svg>',
  coach: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 4.6L18.5 9l-3.5 3 1 5-4-2.7L8 17l1-5L5.5 9l4.6-1.4z"/></svg>',
};

export const navDef = [
  { id: 'dash',  label: { en: 'Squad',    he: 'המועדון' }, icon: navIcons.dash },
  { id: 'plan',  label: { en: 'Plan',     he: 'תוכנית' },  icon: navIcons.plan },
  { id: 'ride',  label: { en: 'Live',     he: 'רכיבה' },   icon: navIcons.ride },
  { id: 'lb',    label: { en: 'Ranks',    he: 'טבלה' },    icon: navIcons.lb },
  { id: 'coach', label: { en: 'Coach AI', he: 'מאמן' },    icon: navIcons.coach },
];

export const planWeek = [
  { day: 'Mon', date: '12', disc: 'gym',  wk: 'yoga',    title: 'Mobility · Yoga',   sub: 'Vinyasa flow + hips',    dur: '0:45', load: '18',  status: 'done',    color: 'var(--gym)' },
  { day: 'Tue', date: '13', disc: 'bike', wk: 'bike',    title: 'Bike · Threshold',  sub: '3 × 12′ @ FTP',          dur: '1:15', load: '78',  status: 'today',   color: 'var(--bike)' },
  { day: 'Wed', date: '14', disc: 'swim', wk: 'swim',    title: 'Swim · Technique',  sub: '8 × 100 drills',         dur: '1:00', load: '45',  status: 'planned', color: 'var(--swim)' },
  { day: 'Thu', date: '15', disc: 'run',  wk: 'run',     title: 'Run · Tempo',       sub: '20′ @ threshold',        dur: '0:50', load: '62',  status: 'planned', color: 'var(--run)' },
  { day: 'Fri', date: '16', disc: 'gym',  wk: 'gym',     title: 'Gym · Strength',    sub: 'TRX + weights + core',   dur: '0:55', load: '40',  status: 'planned', color: 'var(--gym)' },
  { day: 'Sat', date: '17', disc: 'bike', wk: 'bike',    title: 'Long ride',         sub: 'Endurance · Z2',         dur: '3:00', load: '150', status: 'planned', color: 'var(--bike)' },
  { day: 'Sun', date: '18', disc: 'gym',  wk: 'pilates', title: 'Core · Pilates',    sub: 'Reformer + planks',      dur: '0:40', load: '22',  status: 'planned', color: 'var(--gym)' },
];

export const workoutDefs = {
  bike: { disc: 'bike', color: 'var(--bike)', title: 'Bike · Threshold', meta: 'Tue 13 · Key session · Zone 4',
    stats: [['1:15', 'Time'], ['42km', 'Dist'], ['78', 'Load'], ['85%', 'IF']],
    blocks: [['Warm-up', '15′ progressive · Z1→Z2', '55-65%', 26], ['3 × 12′ threshold', '4′ easy between · cadence 90+', '98-102%', 40], ['Cool-down', '10′ spin · Z1', '<55%', 22]],
    note: 'Target power should feel like a hard 20-min effort you could just hold. If you fade on rep 3, note it and we adjust FTP next test.' },
  gym: { disc: 'gym', color: 'var(--gym)', title: 'Gym · Strength', meta: 'Fri 16 · TRX + weights + core',
    stats: [['0:55', 'Time'], ['6', 'Exercises'], ['40', 'Load'], ['3', 'Rounds']],
    blocks: [['Activation', '5′ band work + mobility', 'Warm-up', 18], ['TRX circuit', 'Rows, pistol, atomic push-up · 3 rounds', 'Bodyweight', 34], ['Weights', 'Trap-bar DL + split squat · 4×6', 'Heavy', 44], ['Core + Pilates', 'Planks, dead-bug, leg lowers', 'Stability', 30], ['Yoga cool-down', '5′ breath + hip openers', 'Mobility', 18]],
    note: 'Triathlete-specific strength — heavy but low volume to protect the endurance work. Quality reps over fatigue. Keep 2 in reserve on the lifts.' },
  yoga: { disc: 'gym', color: 'var(--gym)', title: 'Mobility · Yoga', meta: 'Mon 12 · Recovery flow',
    stats: [['0:45', 'Time'], ['18', 'Load'], ['Z1', 'Effort'], ['✓', 'Done']],
    blocks: [['Breath + centering', '3′ box breathing', 'Calm', 16], ['Vinyasa flow', 'Sun salutations · slow', 'Flow', 34], ['Hip + hamstring', 'Pigeon, lizard, folds', 'Deep', 28], ['Savasana', '5′ full relaxation', 'Reset', 16]],
    note: 'Recovery day — this is training, not filler. Down-regulate the nervous system after yesterday\u2019s load. No pushing into pain.' },
  pilates: { disc: 'gym', color: 'var(--gym)', title: 'Core · Pilates', meta: 'Sun 18 · Reformer + mat',
    stats: [['0:40', 'Time'], ['22', 'Load'], ['5', 'Blocks'], ['Core', 'Focus']],
    blocks: [['Warm-up', 'Pelvic tilts + breathing', 'Prep', 16], ['Reformer series', 'Footwork, long-stretch, teaser', 'Control', 36], ['Plank complex', 'Front + side · 3 rounds', 'Stability', 30], ['Leg lowers + dead-bug', 'Anti-extension', 'Deep core', 26], ['Stretch', 'Spine + hip flexors', 'Mobility', 16]],
    note: 'Core stability transfers straight to your bike and run posture. Move slow, brace, and own every rep. Breathe out on effort.' },
  swim: { disc: 'swim', color: 'var(--swim)', title: 'Swim · Technique', meta: 'Wed 14 · Drills + form',
    stats: [['1:00', 'Time'], ['2.4km', 'Dist'], ['45', 'Load'], ['Z2', 'Effort']],
    blocks: [['Warm-up', '400m easy + 4×50 drill', 'Easy', 22], ['8 × 100 technique', 'Catch-up, single-arm, scull', 'Form', 38], ['Cool-down', '200m easy', 'Recover', 18]],
    note: 'Technique day — this is your limiter. Slow down and feel the catch. Rushing the drills defeats the point.' },
  run: { disc: 'run', color: 'var(--run)', title: 'Run · Tempo', meta: 'Thu 15 · Threshold',
    stats: [['0:50', 'Time'], ['9km', 'Dist'], ['62', 'Load'], ['Z3-4', 'Effort']],
    blocks: [['Warm-up', '12′ easy + strides', 'Easy', 22], ['20′ tempo', 'Comfortably hard · threshold', 'Z4', 40], ['Cool-down', '10′ easy jog', 'Recover', 20]],
    note: 'Hold an even effort — don\u2019t start too hot. You should be able to say a few words but not chat.' },
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

export const leaderboardData = [
  { name: 'Noa',        initials: 'NR', color: '#ff9a4c', load: 902, vol: '12.4h', streak: 31, swim: 88, bike: 94, run: 79, move: 1,  badge: '🔥' },
  { name: 'You (Dana)', initials: 'DL', color: '#d6ff3f', load: 812, vol: '11.1h', streak: 23, swim: 71, bike: 96, run: 74, move: 2,  badge: '⚡', you: true },
  { name: 'Tal',        initials: 'TV', color: '#5a86ff', load: 770, vol: '10.2h', streak: 18, swim: 90, bike: 78, run: 82, move: 0,  badge: '🏊' },
  { name: 'Roi',        initials: 'RG', color: '#4fe08b', load: 588, vol: '8.7h',  streak: 15, swim: 64, bike: 80, run: 91, move: -1, badge: '🏃' },
  { name: 'Maya',       initials: 'MK', color: '#c68bff', load: 705, vol: '9.4h',  streak: 9,  swim: 76, bike: 72, run: 70, move: 3,  badge: '' },
  { name: 'Adam',       initials: 'AB', color: '#37c0ff', load: 640, vol: '8.9h',  streak: 12, swim: 80, bike: 74, run: 66, move: -2, badge: '' },
  { name: 'Yoav',       initials: 'YS', color: '#ff6f61', load: 410, vol: '5.6h',  streak: 3,  swim: 58, bike: 70, run: 62, move: -1, badge: '' },
  { name: 'Itai',       initials: 'IT', color: '#ffce4a', load: 380, vol: '5.1h',  streak: 0,  swim: 60, bike: 64, run: 55, move: 0,  badge: '' },
];

export const coachInsights = [
  { sev: 'high', sevLabel: 'Watch',       color: 'var(--bad)',  icon: '💤', title: 'Under-recovery flag',       body: 'Your HRV is down 14% over 4 days and sleep averaged 6h05. Two hard sessions back-to-back likely outran recovery.', action: 'Swap Thu tempo → easy Z2',      metric: 'HRV 48ms · −14%' },
  { sev: 'med',  sevLabel: 'Opportunity', color: 'var(--swim)', icon: '🏊', title: 'Swim is your limiter',       body: 'Your swim CSS pace ranks 6th in the squad while your bike is 1st. 2 technique sessions/week would close the gap fastest.', action: 'Add a Wed technique swim',    metric: '1:52 /100m · squad avg 1:44' },
  { sev: 'med',  sevLabel: 'Balance',     color: 'var(--warn)', icon: '⚖️', title: 'Load skewed to the bike',    body: '68% of last month\u2019s load came from cycling. Run volume is trending down and injury risk rises with sudden spikes.', action: 'Cap bike, +10% run over 2 wks', metric: 'Bike 68% · Run 19% · Swim 13%' },
  { sev: 'low',  sevLabel: 'On track',    color: 'var(--good)', icon: '✅', title: 'Consistency streak strong',  body: '23-day streak — top 3 in the squad. You\u2019ve hit 96% of planned sessions this block. Keep protecting the easy days.', action: 'Keep it up',                  metric: '96% adherence · 23-day streak' },
];

export const activitySplits = [5.2, 4.9, 4.7, 4.6, 4.8, 4.5, 4.4, 4.6, 4.3, 4.5];

export const hrZones = [
  { z: 'Z1', label: 'Recovery',  pct: 8,  color: '#8b93a0' },
  { z: 'Z2', label: 'Endurance', pct: 34, color: 'var(--good)' },
  { z: 'Z3', label: 'Tempo',     pct: 28, color: 'var(--bike)' },
  { z: 'Z4', label: 'Threshold', pct: 22, color: 'var(--behind)' },
  { z: 'Z5', label: 'VO2 max',   pct: 8,  color: 'var(--bad)' },
];

export const laps = [
  { n: 1, dist: '10.0', time: '21:14', speed: '28.3', hr: 141, pw: 242, best: false },
  { n: 2, dist: '10.0', time: '22:02', speed: '27.2', hr: 146, pw: 236, best: false },
  { n: 3, dist: '10.0', time: '20:48', speed: '28.8', hr: 151, pw: 258, best: true },
  { n: 4, dist: '10.0', time: '21:36', speed: '27.8', hr: 149, pw: 249, best: false },
  { n: 5, dist: '14.2', time: '32:20', speed: '26.3', hr: 153, pw: 244, best: false },
];

export const powerCurve = [
  { t: '5s', w: 842 }, { t: '30s', w: 612 }, { t: '1m', w: 498 }, { t: '5m', w: 341 }, { t: '20m', w: 288 }, { t: '60m', w: 262 },
];

export const achievements = [
  { icon: '🥈', title: '2nd overall',   sub: 'Sunday Long Ride · squad' },
  { icon: '👑', title: 'Local Legend',  sub: 'Kaza Dam Climb · 42 efforts' },
  { icon: '⚡', title: '3 PRs',         sub: '20-min & 60-min power, longest ride' },
];

export const segmentRows = [
  { rank: 1, name: 'Noa',        initials: 'NR', color: '#ff9a4c', time: '6:42', speed: '21.5', crown: true },
  { rank: 2, name: 'You (Dana)', initials: 'DL', color: '#d6ff3f', time: '6:58', speed: '20.7', you: true },
  { rank: 3, name: 'Tal',        initials: 'TV', color: '#5a86ff', time: '7:11', speed: '20.0' },
  { rank: 4, name: 'Roi',        initials: 'RG', color: '#4fe08b', time: '7:24', speed: '19.4' },
  { rank: 5, name: 'Adam',       initials: 'AB', color: '#37c0ff', time: '7:38', speed: '18.8' },
  { rank: 6, name: 'Maya',       initials: 'MK', color: '#c68bff', time: '7:52', speed: '18.3' },
];

export const segEfforts = [72, 68, 70, 66, 64, 67, 63, 60, 62, 58];

export const pbs = [
  { label: 'FTP',          value: '271',   unit: 'W',  delta: '+8',    color: 'var(--bike)' },
  { label: '5K run',       value: '19:42', unit: '',   delta: '−0:18', color: 'var(--run)' },
  { label: '1K swim',      value: '16:20', unit: '',   delta: '−0:34', color: 'var(--swim)' },
  { label: 'Longest ride', value: '134',   unit: 'km', delta: 'PB',    color: 'var(--bike)' },
];

// riders used by the live-ride telemetry loop
export const rideBase = [
  { name: 'You',  initials: 'DL', color: '#d6ff3f', bk: 34, bh: 158, you: true, dropped: false },
  { name: 'Noa',  initials: 'NR', color: '#ff9a4c', bk: 35, bh: 162, dropped: false },
  { name: 'Tal',  initials: 'TV', color: '#5a86ff', bk: 34, bh: 151, dropped: false },
  { name: 'Roi',  initials: 'RG', color: '#4fe08b', bk: 33, bh: 147, dropped: false },
  { name: 'Adam', initials: 'AB', color: '#37c0ff', bk: 33, bh: 155, dropped: false },
  { name: 'Maya', initials: 'MK', color: '#c68bff', bk: 32, bh: 149, dropped: false },
  { name: 'Yoav', initials: 'YS', color: '#ff6f61', bk: 29, bh: 171, dropped: true },
];
