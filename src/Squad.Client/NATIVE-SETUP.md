# Background ride recording — native setup

The web recorder (`RideRecorder` + `useRideRecorder`) records only while the page is
open and unlocked. To record with the screen off / phone in a pocket, wrap the same
React app in **Capacitor** and let `@capacitor-community/background-geolocation` feed
the identical `pushTelemetry` path. Nothing in the app, hub, or map changes — only the
location *source* swaps (`useRideRecorder` already picks it automatically on native).

## 1. Install

```bash
cd src/Squad.Client
npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npm i @capacitor-community/background-geolocation
npm run build            # emits the web assets into ../Squad.Web/wwwroot (capacitor webDir)
npx cap add ios
npx cap add android
npx cap sync
```

`capacitor.config.json` is already in this folder (appId `com.triclub.app`, appName
`Domestique Hub`, `webDir` points at the Vite output). The SPA is **bundled into the
native shell** (no `server.url`), so it loads from `capacitor://localhost` and works
offline-first. Because the app origin is then local, root-relative `/api` and `/hubs`
requests are pointed at the deployed backend by `src/lib/apiBase.js` (`API_BASE`) — a
fetch shim rewrites `fetch('/api/…')`, and the SignalR hooks + the XHR upload use
`API_BASE`/`apiUrl(…)` explicitly. On web, `API_BASE` is empty and everything stays
same-origin. Front-end changes now require a new native build (`npm run build` →
`npx cap sync` → TestFlight); update `API_BASE` in `apiBase.js` if the backend moves.

## 2. iOS — `ios/App/App/Info.plist`

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Squad uses your location to show your position to teammates during a live ride.</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Squad keeps recording your ride when the screen is off so your squad can see you.</string>
<key>UIBackgroundModes</key>
<array><string>location</string></array>
```

`allowsBackgroundLocationUpdates` and the blue status-bar indicator are handled by the
plugin when `backgroundMessage` is set (it is, in `locationSource.native.js`).

## 3. Android — `android/app/src/main/AndroidManifest.xml`

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
```

The plugin runs a foreground service with a persistent notification (required for
background location on Android). Optionally set a custom notification icon:

```xml
<!-- android/app/src/main/res/values/strings.xml -->
<string name="capacitor_background_geolocation_notification_icon">drawable/ic_tracking</string>
```

## 4. Run

```bash
npx cap open ios       # run from Xcode on a device (background location needs a real device)
npx cap open android   # run from Android Studio
```

## How the swap works

`useRideRecorder` calls `window.Capacitor?.isNativePlatform()`:
- **web** → `createWebLocationSource()` (`watchPosition` + Wake Lock, foreground only)
- **native** → `createNativeLocationSource()` (plugin `addWatcher`, true background)

Both emit `{ lat, lon, elevM, speedMps, accuracy, ts }`; the recorder accumulates
distance and throttles to `pushTelemetry(...)`. So the ride hub, `LiveRideMap`, and the
feed are untouched — going from foreground-web to pocket-proof-native is purely a
packaging step.

## Notes

- Background location on the web is **not** possible (iOS suspends the page's JS; the
  W3C background-geolocation proposal is still unshipped). The web recorder is honest
  about this — it flags "paused" when backgrounded rather than dropping fixes silently.
- Heart rate isn't available from GPS. To add it, layer a Web Bluetooth (web) or native
  BLE HRM source that fills `heartRate` on the same telemetry payload.
- `@transistorsoft/capacitor-background-geolocation` is a heavier, more battery-tuned
  alternative (paid license for Android release builds) if you outgrow the community plugin.

---

# BLE sensors — heart rate, power, radar

Heart rate + power + rear radar come over Bluetooth LE. On the web this uses Web
Bluetooth (Chrome/Android only — **iOS Safari has none**); on native it uses the
Capacitor plugin, which is the reliable, background-capable path.

## Install

```bash
npm i @capacitor-community/bluetooth-le
npx cap sync
```

## iOS — `Info.plist`

```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>Squad connects to your heart-rate strap, power meter, and radar.</string>
```

To keep sensors alive with the screen off, also add `bluetooth-central` to
`UIBackgroundModes` (alongside `location`).

## Android — `AndroidManifest.xml`

```xml
<uses-permission android:name="android.permission.BLUETOOTH_SCAN"
    android:usesPermissionFlags="neverForLocation" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
```

`BleClient.initialize({ androidNeverForLocation: true })` (already set in
`sensorSource.native.js`) matches the `neverForLocation` flag.

## Profiles

| Sensor | Type | Service / measurement |
|---|---|---|
| Heart rate | **Standard** GATT | `0x180D` / `0x2A37` |
| Power | **Standard** GATT | `0x1818` / `0x2A63` |
| Radar (Varia) | **Proprietary** | `6A4E3200-…` / `6A4E3203-…` |

---

# Apple Health (HealthKit) — import daily wellness

HealthKit is **iOS-native only** — there is no web API for it (same platform reality as
background GPS and Web Bluetooth on iOS). So the "Sync Apple Health" panel on the Upload
screen is live only in the native iOS build; on web it renders a disabled, explanatory
state.

**Scope: wellness, not workouts.** Apple Health here is a *readiness/recovery* feed —
resting HR, HRV, respiratory rate, weight, VO2max, and sleep. It does **not** import
activities: Garmin/FIT own that (and Apple Health never exposes the GPS track anyway).
The old workout-import path was retired in favour of this lighter one.

## How it fits

`lib/health.js` (facade) → `lib/healthSource.native.js` (HealthKit reader) reduces each
metric to **one value per local calendar day**, then posts batches to
`POST /api/health/daily`. The backend (`HealthEndpoints.cs` → `SqlHealthDailyStore`)
upserts one wide row per `(athlete, day)` via a `MERGE` that **COALESCEs each column**, so
re-syncing and partial syncs are safe and never wipe an already-recorded metric. Read it
back with `GET /api/health/daily?days=90`. `useHealthSync` + the `AppleHealthSync`
component drive the UI; the plugin-specific pieces are the `sampleName` strings and the
per-day reducers in `healthSource.native.js`.

## Install

```bash
cd src/Squad.Client
npm i @perfood/capacitor-healthkit
npm i -D patch-package        # HRV + VO2max patch (below); postinstall reapplies it
npx cap sync
```

(Already listed in `package.json` and marked `external` in `vite.config.js`, so the web
bundle never tries to resolve it.)

### Plugin patch — HRV & VO2max

The stock `@perfood/capacitor-healthkit` (1.3.2) has **no** case for
`heartRateVariabilitySDNN` or `vo2Max`, so it silently returns nothing for them. A
`patch-package` patch (`patches/@perfood+capacitor-healthkit+1.3.2.patch`) adds two sample
cases — `'hrv'` and `'vo2Max'` — to both the auth and query switches plus their unit
mappings (HRV in **ms**, VO2max in **mL/kg·min**; HRV must be handled before the generic
minute-compatible branch or it'd be reported in minutes). The `"postinstall": "patch-package"`
script reapplies it after every `npm ci`, so CI (`ios-testflight.yml`) carries it into the pod.

## iOS — capability + `Info.plist`

1. In Xcode → target **App** → **Signing & Capabilities** → **+ Capability** → **HealthKit**.
2. Add the read-permission usage string (required — HealthKit auth throws without it):

```xml
<key>NSHealthShareUsageDescription</key>
<string>Domestique Hub reads your resting heart rate, HRV, sleep, weight and VO₂max from Apple Health to show your training readiness.</string>
```

We request **read** scopes only — `weight`, `restingHeartRate`, `respiratoryRate`, `hrv`,
`vo2Max`, and `activity` (sleep has no direct scope name in the plugin; `activity` grants
it). iOS never tells the app whether a specific type was granted (privacy by design), so a
"successful" permission call just means the sheet was shown — a sync that finds nothing
usually means read access was declined in Settings → Privacy → Health.

## Notes

- **Units**: weight is **kg**, HRV **ms**, VO2max **mL/kg·min**, resting HR / respiratory
  rate in bpm/brpm — validate against a known day on real hardware and adjust the reducer
  in `healthSource.native.js` if a plugin version returns a different base unit.
- **Daily reduction**: resting HR / HRV / respiratory rate are **averaged** over the day;
  weight / VO2max take the **latest** reading; sleep **sums** "Asleep" interval hours onto
  the day the user woke (falling back to "InBed" only when no asleep stages were logged).
- **Day bucketing** uses the **device-local** date so a reading lands on the day the user
  actually lived, not a UTC-shifted one.
- **No "stress"**: HealthKit has no stress metric (it's a Garmin/Whoop-derived value that
  does not sync to Apple Health). HRV is the closest recovery proxy; true stress/Body
  Battery would have to come from the Garmin pull.
- **Android**: the analogous wellness source is Health Connect (resting HR / HRV / sleep
  are all available there) — a client reader posting to the same `/api/health/daily`
  endpoint is the next step.

HR and power are Bluetooth SIG standards and parse to spec. **Radar is reverse-engineered**
(1 header byte + 3 bytes/threat: distance + threat-level bits) — it works with Garmin
Varia RTL-series but is unofficial and needs validation against your hardware; the closing
speed is left `null` because its scale is uncalibrated. For production, enroll in Garmin's
official **Radar Data BLE Program** (developer.garmin.com/radar-data-ble) for the real spec.
Split radar packets aren't reassembled yet (marked TODO in `ble.js`).

---

# Peer ranging — phone-to-phone BLE for pack position

Live-ride pack positioning ranges riders against each other directly: every phone
**advertises** its athlete GUID over BLE and **scans** for teammates' beacons, turning
the received signal strength (RSSI) into a rough inter-rider distance. The server fuses
those peer ranges with GPS+heading to place riders in the pack; with no peer signal it
falls back to GPS+heading alone.

Two halves, two different mechanisms:

| Half | Mechanism | Where |
|---|---|---|
| **Scan** | `@capacitor-community/bluetooth-le` `requestLEScan` (reads RSSI + manufacturer data) | `lib/peerRangingSource.native.js` |
| **Advertise** | custom `SquadPeerBeacon` plugin (**broadcasting** manufacturer data — no community/web API can do this) | `ios/App/App/SquadPeerBeaconPlugin.swift`, `android/.../SquadPeerBeaconPlugin.java` |

## The wire format (keep both plugins in lockstep)

The beacon is a single BLE **manufacturer-specific data** field:

- **Company id `0xFFFF`** (the "not assigned" range, for local/experimental use).
- **Payload: the athlete GUID as 16 raw bytes** in *canonical* (big-endian / RFC-4122
  textual) order — i.e. `550e8400-e29b-41d4-a716-446655440000` → `55 0e 84 00 e2 9b 41 d4
  a7 16 44 66 55 44 00 00`. This is **not** .NET's `Guid.ToByteArray()` mixed-endian order.

`bytesToGuid`/`guidToBytes` in `peerRangingSource.native.js` and `guidToBytes` in both
native plugins all implement this exact order. Change one, change all three or ranging
silently reads garbage athlete ids.

Company id byte order on the wire is little-endian, but the community scanner strips the
2 bytes and hands back only the 16-byte payload keyed by company id (`"65535"`), so the
JS side never sees the company bytes.

## JS API (`registerPlugin('SquadPeerBeacon')`)

```js
await SquadPeerBeacon.advertise({ manufacturerId: 0xFFFF, athleteId });  // resolves once actually advertising
await SquadPeerBeacon.stop();
```

`advertise` rejects if Bluetooth is off, the peripheral role is unsupported, permission
is denied, or the athlete id isn't a valid GUID.

## iOS

`CBPeripheralManager.startAdvertising` with `CBAdvertisementDataManufacturerDataKey`. The
plugin auto-registers via `CAPBridgedPlugin` (no manual wiring) and reuses the existing
`NSBluetoothAlwaysUsageDescription` string in `Info.plist`.

**Foreground-reliable only.** iOS drops the manufacturer-data key when the app is
backgrounded (the advertisement is shifted into an "overflow" area only other iOS
CoreBluetooth apps can read, not generic scanners) — so a backgrounded phone stops being
*seen* by teammates, though it keeps *scanning* fine. This is an Apple platform limitation;
pack ranging degrades to GPS+heading for backgrounded riders. We deliberately do **not**
add the `bluetooth-peripheral` background mode, since it wouldn't restore the stripped
manufacturer data and would invite App Store review questions.

## Android

`BluetoothLeAdvertiser.startAdvertising` with `AdvertiseData.addManufacturerData(0xFFFF,
guidBytes)`, low-latency / high-TX, non-connectable. The plugin is registered in
`MainActivity.onCreate` (`registerPlugin(SquadPeerBeaconPlugin.class)`).

Needs `BLUETOOTH_ADVERTISE` (already in `AndroidManifest.xml`) — a **runtime** permission
on Android 12+ (API 31), which the plugin requests lazily on the first `advertise()` call.
Advertising works background/foreground alike, unlike iOS.

## How it's wired (end to end)

- **`usePeerRanging`** (`src/hooks/usePeerRanging.js`) runs only while a live ride is
  **active**: it advertises this athlete's GUID and scans for teammates, throttling each
  peer's range to one uplink every few seconds.
- Source selection mirrors the location/sensor split — `peerRangingSource.web.js` (inert,
  `supported:false`) statically, `peerRangingSource.native.js` dynamically inside the shell.
- It pushes `{ peerId, rssi, distanceM }` through **`useLiveRide.pushPeerRange`** →
  SignalR **`RideHub.PushPeerRange`**, which resolves the observer from the connection
  (never the payload) and records the range into `IRideSessionState` (`RecordPeerRange` /
  `PeerRanges`). `App.jsx` gates it on `rideActive` and exposes `live.peerRanging`.
- **Not yet done — pack-position fusion.** The server *records* ranges but still derives
  positions straight from GPS (`riderMoved`); a fusion pass that folds `PeerRanges(rideId)`
  into in-pack spacing is the `TODO(pack-fusion)` marker in `RideHub`. No UI consumes
  `live.peerRanging.peers` yet either.

## Verify

Requires **two real devices** (emulators have no BLE radio; iOS Simulator can't
advertise). Sign in as two athletes, start a live ride on both, and confirm each phone's
RSSI-based spacing tracks as you walk them apart/together. On web the source is inert
(`mode: 'unsupported'`) and pack position stays on the GPS+heading fallback.

---

# Native social sign-in (Google & Apple)

Google and Apple **block their web sign-in SDKs inside the app's embedded webview**
(anti-phishing policy), so in the browser the app uses GSI / Apple JS, and in the
native app it uses the native SDKs via `@capgo/capacitor-social-login`. The client
picks the path automatically (`Capacitor.isNativePlatform()` in `src/lib/oauth.js`);
both return an `id_token` the existing `/api/auth/{google,apple}` endpoints verify.

Nothing extra is needed for the web build. For the **native** build, provide:

### 1. Google — create an iOS OAuth client
- Google Cloud Console → Credentials → **Create OAuth client ID → iOS**, bundle id
  `com.triclub.app`. Copy the **iOS client id** (`NNN-xxxx.apps.googleusercontent.com`).
- **`ios/App/App/Info.plist`** — the `CFBundleURLTypes` scheme is set to this app's
  **reversed** iOS client id (already committed):
  `com.googleusercontent.apps.85703052598-ncbmmqmqdv4rjqdrpk6fpvj8375oh609`
  (the reverse of iOS client id `85703052598-ncbmmqmqdv4rjqdrpk6fpvj8375oh609.apps.googleusercontent.com`).
- App Service settings → **`Auth__Google__iOSClientId`** = the iOS client id. The backend
  then accepts id_tokens with that audience (`OidcTokenVerifier.Google`), and `/api/auth/config`
  returns it so the native SDK initializes at runtime (no client rebuild for the value).

### 2. Apple — enable Sign in with Apple
Apple native sign-in needs the `com.apple.developer.applesignin` entitlement, and the
signing profile must carry it or the archive fails to sign. The entitlements file
(`ios/App/App/App.entitlements`) is committed but **currently NOT wired into the build**
(`CODE_SIGN_ENTITLEMENTS` is intentionally absent) so builds pass with the existing
`triclub` profile and **Google** works today. To turn Apple on:

1. Apple Developer → Identifiers → App ID `com.triclub.app` → enable **Sign in with Apple**,
   regenerate the `triclub` distribution provisioning profile, and update the
   `IOS_PROVISION_PROFILE_BASE64` secret.
2. Re-wire the entitlement: add `CODE_SIGN_ENTITLEMENTS = App/App.entitlements;` to **both**
   App-target build configs in `ios/App/App.xcodeproj/project.pbxproj` (next to
   `ASSETCATALOG_COMPILER_APPICON_NAME`).
3. App Service settings → **`Auth__Apple__BundleId`** = `com.triclub.app` (the audience of a
   native Apple id_token is the bundle id, not the web Services ID). The backend accepts both.

Until step 2 is done, the Apple button surfaces an error on tap instead of signing in — do
step 1 first so the profile is ready, then re-wire in the same or a follow-up build.

### 3. Ship
- No code change needed beyond the above. CI (`.github/workflows/ios-testflight.yml`) runs
  `npm ci` → `npm run build` → `npx cap sync ios`, which pulls the plugin's iOS pod
  automatically. Push/commit → TestFlight build carries native Google + Apple sign-in.
- `.npmrc` sets `legacy-peer-deps=true` so `npm ci` tolerates the mixed Capacitor peer ranges.

---

## Ultra-Wideband (UWB) precise ranging — SCAFFOLD (unverified on hardware)

BLE RSSI only gives a rough *distance* — no direction, and it can't resolve ~50 cm. For exact
**distance + direction (front/back, left/right)** between two Apple devices, the app has a
scaffold built on Apple's **NearbyInteraction** (the U1/U2 chip, same tech as AirTag Precision
Finding). It runs **only on the native iOS app** and only between UWB-capable devices
(**iPhone 11+ / iPad Pro 2020+**). On web and non-UWB devices it is completely inert and the
ride falls back to BLE + GPS.

**Status: written but NOT yet verified on hardware** — it needs the native iOS build plus two
UWB devices on the same ride to test. Treat the numbers as unproven until then.

### Pieces
- `ios/App/App/SquadUwbPlugin.swift` — the Capacitor plugin. One `NISession` per peer; exposes
  `isSupported`, `startPeer` (→ this device's base64 discovery token), `receivePeerToken`, `stop`;
  emits a `nearby` event `{ athleteId, distanceM, dirX, dirY, dirZ, ts }`.
- `Info.plist` → `NSNearbyInteractionUsageDescription` (already added).
- `src/lib/uwbSource.native.js` — JS wrapper + `uwbBearing()` (direction vector → label/angle).
- `src/hooks/useUwbRanging.js` — drives the per-peer token handshake over the ride hub and
  collects `{ distanceM, dir, bearing }` per teammate.
- `RideHub.cs` `ShareUwbToken(rideId, toAthleteId, token)` + client `pushUwbToken`/`onUwbToken`
  (`useLiveRide`) relay the discovery tokens between the two devices.
- `components/UwbReadout.jsx` — the live-ride strip showing each teammate's exact distance + a
  direction arrow. Hidden unless UWB peers exist.

### Build & test
1. `npm run build && npx cap sync ios` (the plugin is a local file in the App target — no pod).
2. Open `ios/App` in Xcode, run on a **real** U1 device (UWB is unavailable in the Simulator).
3. Accept the Nearby Interaction permission prompt on first ride.
4. Put two UWB devices on the **same live ride** (same squad, both recording). Once both trade
   discovery tokens over the hub, the **UWB** strip shows metre-accurate distance and an arrow
   pointing at each teammate. `direction` stays null until the session converges and the devices
   are oriented so the U1 antenna can resolve angle (distance appears first).

### Notes / limits
- Requires foreground (like the BLE beacon) and both peers UWB-capable; otherwise it silently
  no-ops and BLE/GPS remain in charge.
- Android UWB (`androidx.core.uwb`) is not implemented — very few Android phones have UWB.
- The iOS TestFlight build blocker (Swift toolchain / FBSDKLoginKit, see the iOS build notes)
  must be resolved before any of this can ship to a device.

### Diagnostics (added for debugging on device)
- **On-screen:** the UWB strip now shows a per-peer status — `searching` → `ranging` (distance,
  no angle yet) → `located` (direction available) — plus a coaching hint when direction is stuck
  (e.g. "move phone around", "sweep left–right", "point top of phone at them & move"). The strip
  appears whenever the device supports UWB, even before a peer is found ("Searching for a
  teammate to range…"), so you can confirm the plugin loaded and the chip is supported.
- **Xcode console:** the plugin logs every step with the tag `[SquadUwb]` — `startPeer`,
  `receivePeerToken`, each `nearby dist=…m dir=(x,y,z)`, `convergence … reasons=…`, `lost`,
  `invalidated`. Filter the device console on `SquadUwb` to watch the session live and see whether
  distance is flowing and why direction hasn't converged.
