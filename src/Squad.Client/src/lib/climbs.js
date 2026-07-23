// ClimbPro-style climb detection over a real terrain profile ([{dist(m), e(m)}], from
// buildDenseProfile). A climb is a sustained ascent: enough gain, length and average gradient,
// tolerating short dips inside it. Each detected climb carries its geometry + a Garmin-like
// category so the live "climb view" can show distance / ascent / time to the top and shade the
// profile by gradient. All real — derived from the terrain, never fabricated.

// Small moving-average smoother so single-sample terrain noise doesn't fragment a climb.
function smoothElev(es, k = 2) {
  const out = new Array(es.length);
  for (let i = 0; i < es.length; i++) {
    let sum = 0, n = 0;
    for (let j = Math.max(0, i - k); j <= Math.min(es.length - 1, i + k); j++) { sum += es[j]; n++; }
    out[i] = sum / n;
  }
  return out;
}

// Gradient colour bands (steeper = hotter), mirroring the ClimbPro convention. Fixed hexes so
// they read the same on the dark ride display regardless of theme accent.
export function gradeColor(g) {
  if (g < 3) return '#4fe08b';
  if (g < 6) return '#c3e83a';
  if (g < 9) return '#ffc24d';
  if (g < 12) return '#ff8a2c';
  return '#ff4d38';
}

// Garmin-ish climb category from a score = length(m) × average grade(%). null = below Cat 4
// (still a climb worth showing, just uncategorised).
function categorize(score) {
  if (score >= 64000) return 'HC';
  if (score >= 40000) return '1';
  if (score >= 24000) return '2';
  if (score >= 12000) return '3';
  if (score >= 6000) return '4';
  return null;
}

function buildClimb(P, es, a, b) {
  const startDist = P[a].dist, endDist = P[b].dist;
  const length = endDist - startDist;
  const gain = es[b] - es[a];
  const avgGrade = length > 0 ? (gain / length) * 100 : 0;
  let maxGrade = 0;
  for (let i = a + 1; i <= b; i++) {
    const dl = P[i].dist - P[i - 1].dist;
    if (dl > 0) maxGrade = Math.max(maxGrade, ((es[i] - es[i - 1]) / dl) * 100);
  }
  const score = length * avgGrade;
  return {
    startDist, endDist, length,
    gain: Math.round(gain),
    startE: es[a], topE: es[b],
    avgGrade, maxGrade,
    score, category: categorize(score),
  };
}

// Detect climbs on a sampled profile. Returns climbs sorted by start distance.
export function detectClimbs(profile, opts = {}) {
  const P = (profile || []).filter((p) => p && Number.isFinite(p.dist) && Number.isFinite(p.e));
  if (P.length < 3) return [];
  const { MIN_GAIN = 25, MIN_LEN = 250, MIN_GRADE = 3, DROP_TOL = 12 } = opts;
  const es = smoothElev(P.map((p) => p.e), 2);

  const climbs = [];
  let valley = 0, peak = 0;
  const TRIM_GRADE = 2; // trim leading/trailing near-flat so the climb starts where it ramps up
  const localGrade = (i) => { const dl = P[i].dist - P[i - 1].dist; return dl > 0 ? ((es[i] - es[i - 1]) / dl) * 100 : 0; };
  const maybePush = (a0, b0) => {
    if (b0 <= a0) return;
    let a = a0, b = b0;
    while (a < b - 1 && localGrade(a + 1) < TRIM_GRADE) a++;   // drop the flat run-in
    while (b > a + 1 && localGrade(b) < TRIM_GRADE) b--;       // drop a flat top plateau
    const length = P[b].dist - P[a].dist;
    const gain = es[b] - es[a];
    const grade = length > 0 ? (gain / length) * 100 : 0;
    if (gain >= MIN_GAIN && length >= MIN_LEN && grade >= MIN_GRADE) climbs.push(buildClimb(P, es, a, b));
  };

  for (let i = 1; i < P.length; i++) {
    if (es[i] >= es[peak]) { peak = i; continue; }
    if (es[peak] - es[i] >= DROP_TOL) {
      // Descended clear of the running peak → the climb (if any) ended at that peak.
      maybePush(valley, peak);
      valley = i; peak = i;
    } else if (peak === valley && es[i] < es[valley]) {
      // Still drifting down to the low point before any ascent has begun.
      valley = i; peak = i;
    }
  }
  maybePush(valley, peak);
  return climbs;
}
