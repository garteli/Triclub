# Squad.Ingest — FitUpload adapter + intake endpoint

This is **slice 2** of the ingest spec: turn an uploaded `.FIT` into a canonical
`Activity`. Steps 1 (canonical model + SQL) and 3 (dedup) are referenced/used here.

## Wiring (Program.cs)

```csharp
using Squad.Ingest;
using Squad.Ingest.Intake;

builder.Services.AddActivityIngest(builder.Configuration.GetConnectionString("Sql")!);
builder.Services.AddScoped<IRawActivityStore, /* your */ SqlRawActivityStore>();
// optional: builder.Services.AddScoped<IActivityFanout, SignalRFanout>();

var app = builder.Build();
app.MapActivityIntake();   // POST /api/activities/upload
```

## Flow

```
POST /api/activities/upload (.fit)
  → hash bytes, store RawActivity (idempotent on SHA-256), enqueue id, 202 Accepted
       → IngestWorker dequeues → FitUploadAdapter.NormalizeAsync → Activity
            → repo.UpsertByFingerprintAsync → Inserted | Replaced | DiscardedDuplicate
                 → (if new/updated) IActivityFanout → leaderboard + SignalR feed
```

## Files

| File | Role |
|---|---|
| `FitUploadAdapter.cs` | **The adapter.** FIT SDK decode → canonical `Activity`. |
| `Intake/ActivityIntakeEndpoints.cs` | **The endpoint.** Upload → RawActivity → queue → 202. |
| `Fingerprint.cs` | MD5 dedup key + `SourceRank` priority (single source of truth). |
| `IngestQueue.cs` / `IngestWorker.cs` | Async hand-off + the drain loop that runs the adapter. |
| `SqlActivityRepository.cs` | Fingerprint-aware upsert; gzips the track into `TrackBlob`. |
| `RawActivity.cs` | Raw payload + `IRawActivityStore` (implement against your DAL). |
| `CanonicalModel.cs` | From step 1 — **delete if you already have these types.** |

## Proving dedup (spec step 3)

1. Upload a real `.FIT`. → `Inserted`.
2. Upload the **same** file again. → raw layer returns `already-received` (SHA-256), nothing re-queued.
3. POST a HealthKit-shaped JSON for the same ride (once that adapter exists). → same
   fingerprint, `FitUpload` outranks `HealthKit` → `DiscardedDuplicate`.
4. A Garmin copy of the same ride → outranks `FitUpload` → `Replaced`.

## FIT gotchas handled

- **Semicircles → degrees** (`deg = semicircles × 180 / 2³¹`). Skipping this puts every ride in the Gulf of Guinea.
- **FIT epoch** (1989-12-31 UTC) via the SDK's `DateTime.GetDateTime()`.
- **Moving vs elapsed** = `TotalTimerTime` vs `TotalElapsedTime` (kept distinct).
- **Nullable summary fields** — indoor/pool records without GPS are dropped from the track, not faked.
- **Truncated files** — messages read before the break are still used.
- **Multisport** (`.FIT` with several sessions) — MVP takes the first; splitting into one `Activity` per child session is a marked TODO.

## Not verified here

Written against the real `Garmin.FIT.Sdk` (21.171.0) API but **not compiled** in
this environment (no .NET SDK / no NuGet access). Before relying on it:
`dotnet restore && dotnet build`, and sanity-check three accessor names against the
[FIT decode cookbook](https://developer.garmin.com/fit/cookbook/decoding-activity-files/)
since availability shifts with the message-profile version: `GetTrainingStressScore()`,
`GetEnhancedAltitude()`, `GetEnhancedSpeed()`.
