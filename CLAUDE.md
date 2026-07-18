# Squad — project guide (for Claude Code)

Triathlon team-training app. **React (Vite) client + .NET 8 layered backend + SQL Server.**
This file is the handoff from the chat session that scaffolded the project.

## Layout

```
Squad.sln
├─ src/Squad.Core            net8.0, no deps — domain model, ports, contracts, Fingerprint/SourceRank
├─ src/Squad.Infrastructure  → Core — source adapters (FIT + native), ingest queue/worker,
│                              Dapper SQL stores, in-memory ride state, AddSquadInfrastructure
├─ src/Squad.Web             → Infrastructure, Core — minimal-API endpoints, SignalR hubs
│                              (feed + live ride) + fan-out, Program.cs, serves the SPA
└─ src/Squad.Client          Vite/React SPA; `npm run build` outputs into Squad.Web/wwwroot
```

Three flat C# namespaces on purpose: `Squad.Core`, `Squad.Infrastructure`, `Squad.Web`
(so cross-project references need one `using`). Client uses an `s('css-string')` helper
(`src/lib/style.js`) to keep pixel fidelity with the original design handoff.

## Build / run

```bash
# backend
dotnet restore Squad.sln && dotnet build Squad.sln -c Release
dotnet run --project src/Squad.Web        # serves SPA + APIs + hubs

# client
cd src/Squad.Client && npm install
npm run build          # production build into ../Squad.Web/wwwroot
npm run dev            # dev server — proxy /api and /hubs to the .NET host with ws:true
```

## How it fits together

- **Ingest is source-agnostic**: each surface implements `ISourceAdapter` → canonical
  `Activity`; dedup by `Fingerprint` (MD5 of sport|start-60s|distance-100m) keeping the
  richest `SourceRank`; committed activities fan out to the feed + leaderboard.
- **Realtime**: `SquadHub` (/hubs/squad) for the feed; `RideHub` (/hubs/ride) relays live
  telemetry per ride group with an in-memory snapshot for late joiners.
- **Ride recorder** (`src/Squad.Client/src/hooks/useRideRecorder.js`): one core, two
  location sources — web (`watchPosition` + Wake Lock, foreground only) and native
  (Capacitor background-geolocation). Everything streams through `pushTelemetry`.
- **BLE sensors** (`src/Squad.Client/src/lib/ble.js` + sensor sources): heart rate + power
  (standard GATT) and radar (Varia). Group radar warning surfaces any rider's rear-radar
  threat to the whole pack on the live map (`LiveRideMap.jsx` + `lib/radar.js`).

## Status

- **Client**: complete and esbuild-clean — all 8 screens, live-ride coordinate map,
  recorder, sensors, group radar warning. Live data currently comes from
  `useSimulatedRide` (a dev simulator); swap to `useLiveRide(rideId, …)` in `App.jsx` for
  real telemetry (identical rider shape).
- **Backend**: written but **never compiled** (the scaffolding environment had no .NET SDK).
  Expect small first-`dotnet build` fixups.

## Watch out for

- **Auth is a TODO** in `Program.cs` — endpoints/hubs read the athlete id from the
  `NameIdentifier` claim but no scheme is registered. Wire JWT bearer before the protected
  routes work.
- **`ActivitySource` is 0..3** (`Squad.Core/Activities/Enums.cs`), persisted as TINYINT.
  Don't renumber without a data migration.
- **Set `ConnectionStrings:Sql`**; run `src/Squad.Infrastructure/Persistence/Sql/RawActivity.sql`
  (and provide the `Athlete` table it references).
- **Platform limits are real**: no background GPS or Web Bluetooth on iOS Safari — those
  need the native app. See `src/Squad.Client/NATIVE-SETUP.md`.
- **Radar parsing is reverse-engineered** (Varia); closing speed is intentionally `null`.
  Validate against hardware; Garmin's official Radar Data BLE Program is the production path.

## Likely next steps

1. `dotnet build` and fix any compile errors (first time it's seen a compiler).
2. Implement real auth (JWT) + set the SQL connection string; run the DDL.
3. Point `App.jsx` at `useLiveRide` and test the ride hub end-to-end.
4. Native companion apps (iOS/Android) for background recording + BLE (`NATIVE-SETUP.md`).
5. Optional: Garmin webhook adapter (dormant), `docker-compose` for SQL Server, README refresh.
