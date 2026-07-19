// Native Apple Health (HealthKit) source, backed by @perfood/capacitor-healthkit.
// Mirrors locationSource.native.js: everything is dynamically imported so a pure-web
// build never has to resolve the Capacitor package (it's also marked external in
// vite.config.js). This module is only loaded at runtime inside the native iOS shell.
//
// The one plugin-specific piece is mapWorkout() below — it turns an HKWorkout into the
// canonical NativeActivityDto the backend already accepts at
// POST /api/activities/native/healthkit. Swap plugins and only mapWorkout changes.
//
// Setup (see NATIVE-SETUP.md): iOS needs the HealthKit capability + an
// NSHealthShareUsageDescription string; without them requestAuthorization throws.

// HealthKit read scopes we need to build a workout summary.
const READ_SCOPES = ['workouts', 'distance', 'activity', 'calories', 'heart_rate'];

// HKWorkoutActivityType name (workoutActivityName) → our lenient sport string.
// The DTO parse is already lenient; this just narrows the common triathlon types.
function toSport(activityName) {
  const n = (activityName || '').toLowerCase();
  if (n.includes('cycl') || n.includes('bik')) return 'Bike';
  if (n.includes('run')) return 'Run';
  if (n.includes('swim')) return 'Swim';
  return 'Other';
}

function num(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

// HKWorkout → NativeActivityDto (the shape NativeActivityDto.cs mirrors). We fill the
// fields a workout reliably carries; HR/power enrichment (separate HKQuantity queries)
// is a documented follow-up and stays null — the backend treats every metric as optional
// and the dedup fingerprint only needs sport + start + distance.
function mapWorkout(w) {
  const durationSec = num(w.duration) ?? 0;
  return {
    externalId: w.uuid,                       // stable HKWorkout UUID → idempotency key
    sport: toSport(w.workoutActivityName),
    startUtc: w.startDate,                     // ISO 8601 from the plugin
    movingTimeSeconds: durationSec,
    elapsedTimeSeconds: durationSec,
    distanceMeters: num(w.totalDistance),      // HK base unit (metres) — verify vs. hardware
    elevationGainMeters: null,
    avgHeartRate: null,
    maxHeartRate: null,
    avgPowerWatts: null,
    avgCadence: null,
    calories: num(w.totalEnergyBurned),
    trainingLoad: null,
    track: [],
  };
}

export async function createNativeHealthSource() {
  const { CapacitorHealthkit } = await import('@perfood/capacitor-healthkit');

  return {
    kind: 'healthkit',
    supported: true,

    // Prompt the HealthKit read-permission sheet. iOS deliberately never reveals whether
    // the user granted a given type (privacy), so a resolved call just means "asked".
    async requestPermission() {
      await CapacitorHealthkit.requestAuthorization({ all: [], read: READ_SCOPES, write: [] });
      return true;
    },

    // All workouts in [since, until], newest first, mapped to canonical DTOs.
    async listWorkouts({ since, until = new Date() } = {}) {
      const res = await CapacitorHealthkit.queryHKitSampleType({
        sampleName: 'workoutType',
        startDate: (since ?? new Date(0)).toISOString(),
        endDate: until.toISOString(),
        limit: 0, // 0 = no cap
      });
      const rows = res?.resultData ?? [];
      return rows
        .filter((w) => w && w.uuid && w.startDate)
        .map(mapWorkout)
        .sort((a, b) => new Date(b.startUtc) - new Date(a.startUtc));
    },
  };
}
