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
// NB: these strings must match the plugin's `getTypes` switch exactly — an unknown
// scope is silently skipped (it only prints "no match in case: <scope>" to the native
// log), so a typo costs you the permission without any error. 'activity' is what pulls
// in HKWorkoutType; heart rate is camelCase 'heartRate', not 'heart_rate'.
const READ_SCOPES = ['distance', 'activity', 'calories', 'heartRate'];

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

// A workout metric the plugin couldn't read comes back as its -1 sentinel, not null
// or 0 (TDData/TEBData are initialized to -1 and only overwritten when the HKWorkout
// actually carries that quantity). Map any negative/absent value to null so downstream
// filters and the fingerprint don't treat a missing metric as real data. This is what
// lets Garmin rides through: they store distance as separate DistanceCycling samples
// and leave HKWorkout.totalDistance nil, so totalDistance arrives as -1.
function metric(v) {
  const n = num(v);
  return n != null && n >= 0 ? n : null;
}

// Keep only workouts that carry some real signal — a distance, some calories, or a
// non-trivial duration (>= 60s). Filters out empty auto-logged HealthKit samples that
// would otherwise import as 0-distance, 0-load junk activities.
function hasRealData(dto) {
  return (dto.distanceMeters ?? 0) > 0
    || (dto.calories ?? 0) > 0
    || (dto.movingTimeSeconds ?? 0) >= 60;
}

// HKWorkout → NativeActivityDto (the shape NativeActivityDto.cs mirrors). We fill the
// fields a workout reliably carries; HR/power enrichment (separate HKQuantity queries)
// is a documented follow-up and stays null — the backend treats every metric as optional
// and the dedup fingerprint only needs sport + start + distance.
function mapWorkout(w) {
  // The plugin returns `duration` in HOURS (endDate−startDate, then /3600), so scale it
  // back to seconds before it lands in the *Seconds fields — otherwise a 1h ride imports
  // as "1 second" and the >=60s data check below can never pass.
  const durationSec = Math.round((num(w.duration) ?? 0) * 3600);
  return {
    externalId: w.uuid,                       // stable HKWorkout UUID → idempotency key
    sport: toSport(w.workoutActivityName),
    startUtc: w.startDate,                     // ISO 8601 from the plugin
    movingTimeSeconds: durationSec,
    elapsedTimeSeconds: durationSec,
    distanceMeters: metric(w.totalDistance),   // HK base unit (metres); -1 sentinel → null
    elevationGainMeters: null,
    avgHeartRate: null,
    maxHeartRate: null,
    avgPowerWatts: null,
    avgCadence: null,
    calories: metric(w.totalEnergyBurned),
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
    // Empty/junk workouts (no distance, no calories, trivially short) are skipped so
    // auto-logged HealthKit samples don't flood the feed as 0-distance "rides".
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
        .filter(hasRealData)
        .sort((a, b) => new Date(b.startUtc) - new Date(a.startUtc));
    },
  };
}
