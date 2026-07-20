// Native Apple Health (HealthKit) source, backed by @perfood/capacitor-healthkit.
// Mirrors locationSource.native.js: everything is dynamically imported so a pure-web
// build never has to resolve the Capacitor package (it's also marked external in
// vite.config.js). This module is only loaded at runtime inside the native iOS shell.
//
// SCOPE: this reads *lightweight daily wellness* — resting HR, HRV, respiratory rate,
// weight, VO2max, and sleep — NOT workouts. Activities come from Garmin/FIT; Apple
// Health is a readiness/recovery feed only. Each metric is reduced to one value per
// local calendar day and posted to POST /api/health/daily (see lib/health.js).
//
// Setup (see NATIVE-SETUP.md): iOS needs the HealthKit capability + an
// NSHealthShareUsageDescription string; without them requestAuthorization throws.
// HRV (heartRateVariabilitySDNN) and VO2max are NOT in the stock @perfood plugin — a
// patch-package patch (patches/@perfood+capacitor-healthkit+1.3.2.patch) adds the two
// sample cases ('hrv', 'vo2Max'); `npm ci` reapplies it via the postinstall hook.

// HealthKit read scopes. These strings are matched against the plugin's getTypes()
// switch — an unknown scope is silently skipped (it only prints "no match in case: X"
// to the native log), so a typo costs the permission with no error. Sleep has no direct
// scope name in getTypes(); it is granted via 'activity' (which also covers workouts we
// simply never query). 'hrv'/'vo2Max' exist only because of the plugin patch above.
const READ_SCOPES = ['weight', 'restingHeartRate', 'respiratoryRate', 'hrv', 'vo2Max', 'activity'];

// Local calendar day (YYYY-MM-DD) for an ISO timestamp, in the device's timezone — so a
// reading maps to the day the user actually lived, not a UTC-shifted one.
function localDay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function num(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

// The quantity metrics we pull, each with the plugin sampleName, the day-column it fills,
// and how a single day's many samples collapse to one number.
//   avg    — mean of the day (resting HR / HRV / respiratory rate are logged repeatedly)
//   latest — the most recent reading (weight / VO2max change slowly; last wins)
const QUANTITY_METRICS = [
  { sample: 'restingHeartRate', key: 'restingHr', reduce: 'avg' },
  { sample: 'hrv', key: 'hrvMs', reduce: 'avg' },
  { sample: 'respiratoryRate', key: 'respiratoryRate', reduce: 'avg' },
  { sample: 'weight', key: 'weightKg', reduce: 'latest' },
  { sample: 'vo2Max', key: 'vo2Max', reduce: 'latest' },
];

function round(n, dp = 2) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export async function createNativeHealthSource() {
  const { CapacitorHealthkit } = await import('@perfood/capacitor-healthkit');

  async function query(sampleName, since, until) {
    const res = await CapacitorHealthkit.queryHKitSampleType({
      sampleName,
      startDate: since.toISOString(),
      endDate: until.toISOString(),
      limit: 0, // 0 = no cap
    });
    return res?.resultData ?? [];
  }

  return {
    kind: 'healthkit-wellness',
    supported: true,

    // Prompt the HealthKit read-permission sheet. iOS deliberately never reveals whether
    // the user granted a given type (privacy), so a resolved call just means "asked".
    async requestPermission() {
      await CapacitorHealthkit.requestAuthorization({ all: [], read: READ_SCOPES, write: [] });
      return true;
    },

    // Read every wellness metric in [since, until] and fold it into one record per local
    // day: { date, restingHr?, hrvMs?, respiratoryRate?, weightKg?, vo2Max?, sleepHours? }.
    // Days with no readings at all are omitted. Newest first.
    async listDailyWellness({ since, until = new Date() } = {}) {
      const start = since ?? new Date(0);
      const days = new Map(); // 'YYYY-MM-DD' -> partial record

      const dayFor = (date) => {
        let rec = days.get(date);
        if (!rec) { rec = { date }; days.set(date, rec); }
        return rec;
      };

      // Quantity metrics — group each day's samples, then reduce to one value.
      for (const m of QUANTITY_METRICS) {
        let rows;
        try {
          rows = await query(m.sample, start, until);
        } catch {
          continue; // a type the user didn't grant / device doesn't record — skip it
        }
        const byDay = new Map(); // date -> [{ value, ts }]
        for (const r of rows) {
          const value = num(r?.value);
          const date = localDay(r?.startDate);
          if (value == null || !date) continue;
          if (!byDay.has(date)) byDay.set(date, []);
          byDay.get(date).push({ value, ts: new Date(r.startDate).getTime() });
        }
        for (const [date, samples] of byDay) {
          let v;
          if (m.reduce === 'latest') {
            v = samples.reduce((a, b) => (b.ts >= a.ts ? b : a)).value;
          } else {
            v = samples.reduce((sum, s) => sum + s.value, 0) / samples.length;
          }
          dayFor(date)[m.key] = round(v);
        }
      }

      // Sleep — sum "Asleep" interval durations (hours) onto the day the user woke
      // (endDate). Fall back to "InBed" for a day only if it logged no asleep intervals
      // at all (some sources record time-in-bed but not stages).
      try {
        const rows = await query('sleepAnalysis', start, until);
        const asleep = new Map();
        const inBed = new Map();
        for (const r of rows) {
          const hours = num(r?.duration);
          const date = localDay(r?.endDate);
          if (hours == null || !date) continue;
          const bucket = r?.sleepState === 'Asleep' ? asleep : inBed;
          bucket.set(date, (bucket.get(date) ?? 0) + hours);
        }
        const sleepDates = new Set([...asleep.keys(), ...inBed.keys()]);
        for (const date of sleepDates) {
          const hours = asleep.get(date) ?? inBed.get(date);
          if (hours > 0) dayFor(date).sleepHours = round(hours);
        }
      } catch {
        // sleep not granted — leave sleepHours absent
      }

      // Keep only days that carry at least one metric beyond the date key.
      return [...days.values()]
        .filter((rec) => Object.keys(rec).length > 1)
        .sort((a, b) => (a.date < b.date ? 1 : -1));
    },
  };
}
