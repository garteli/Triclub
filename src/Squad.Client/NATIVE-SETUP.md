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

`capacitor.config.json` is already in this folder (appId `club.kaza.squad`, `webDir`
points at the Vite output). After every web build, run `npx cap copy`.

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

# Apple Health (HealthKit) — import workout history

HealthKit is **iOS-native only** — there is no web API for it (same platform reality as
background GPS and Web Bluetooth on iOS). So the "Sync Apple Health" panel on the Upload
screen is live only in the native iOS build; on web it renders a disabled, explanatory
state. The read + upload lives entirely on the device — the backend HealthKit path
(`POST /api/activities/native/healthkit`, `HealthKitAdapter`) was already there; this just
feeds it.

## How it fits

`lib/health.js` (facade) → `lib/healthSource.native.js` (HealthKit reader) → posts each
workout to `/api/activities/native/healthkit`. That endpoint is idempotent by HealthKit
workout **UUID** and dedupes by fingerprint, so re-syncing is safe: already-imported
workouts return `already-received` and never double-count. `useHealthSync` + the
`AppleHealthSync` component drive the UI. The one plugin-specific mapping is `mapWorkout()`
in `healthSource.native.js` — swap plugins and only that function changes.

## Install

```bash
cd src/Squad.Client
npm i @perfood/capacitor-healthkit
npx cap sync
```

(Already listed in `package.json` and marked `external` in `vite.config.js`, so the web
bundle never tries to resolve it.)

## iOS — capability + `Info.plist`

1. In Xcode → target **App** → **Signing & Capabilities** → **+ Capability** → **HealthKit**.
2. Add the read-permission usage string (required — HealthKit auth throws without it):

```xml
<key>NSHealthShareUsageDescription</key>
<string>Domestique Club reads your workouts from Apple Health to add them to your training log and squad feed.</string>
```

We only request **read** scopes (workouts, distance, activity energy, heart rate); no
write. iOS never tells the app whether a specific type was granted (privacy by design), so
a "successful" permission call just means the sheet was shown — a sync that finds nothing
usually means read access was declined in Settings → Privacy → Health.

## Notes

- **Units**: `totalDistance` is mapped straight through as metres and `totalEnergyBurned`
  as calories — validate against a known workout on real hardware, and adjust `mapWorkout`
  if your locale/plugin version returns a different base unit.
- **HR/power enrichment**: `mapWorkout` fills the fields an `HKWorkout` reliably carries;
  average HR/power need separate per-workout `HKQuantity` queries and are left `null` for
  now (a documented follow-up). The dedup fingerprint only needs sport + start + distance,
  so imports are correct without them.
- **Android**: the parallel path is Health Connect (`ActivitySource.HealthConnect`,
  `/api/activities/native/healthconnect`) — the backend adapter exists; a Health Connect
  reader on the client is the analogous next step.

HR and power are Bluetooth SIG standards and parse to spec. **Radar is reverse-engineered**
(1 header byte + 3 bytes/threat: distance + threat-level bits) — it works with Garmin
Varia RTL-series but is unofficial and needs validation against your hardware; the closing
speed is left `null` because its scale is uncalibrated. For production, enroll in Garmin's
official **Radar Data BLE Program** (developer.garmin.com/radar-data-ble) for the real spec.
Split radar packets aren't reassembled yet (marked TODO in `ble.js`).

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
- **`ios/App/App/Info.plist`** — replace the `CFBundleURLTypes` placeholder
  `com.googleusercontent.apps.REPLACE_WITH_REVERSED_IOS_CLIENT_ID` with the **reversed**
  iOS client id (`com.googleusercontent.apps.NNN-xxxx`).
- App Service settings → **`Auth__Google__iOSClientId`** = the iOS client id. The backend
  then accepts id_tokens with that audience (`OidcTokenVerifier.Google`), and `/api/auth/config`
  returns it so the native SDK initializes at runtime (no client rebuild for the value).

### 2. Apple — enable Sign in with Apple
- Apple Developer → Identifiers → App ID `com.triclub.app` → enable **Sign in with Apple**;
  regenerate the provisioning profile used by CI so it carries the entitlement.
- Xcode (App target) → Signing & Capabilities → **+ Sign in with Apple** (creates
  `App.entitlements` with `com.apple.developer.applesignin`). Commit that file.
- App Service settings → **`Auth__Apple__BundleId`** = `com.triclub.app` (the audience of a
  native Apple id_token is the bundle id, not the web Services ID). The backend accepts both.

### 3. Ship
- No code change needed beyond the above. CI (`.github/workflows/ios-testflight.yml`) runs
  `npm ci` → `npm run build` → `npx cap sync ios`, which pulls the plugin's iOS pod
  automatically. Push/commit → TestFlight build carries native Google + Apple sign-in.
- `.npmrc` sets `legacy-peer-deps=true` so `npm ci` tolerates the mixed Capacitor peer ranges.
