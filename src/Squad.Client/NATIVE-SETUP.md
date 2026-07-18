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

HR and power are Bluetooth SIG standards and parse to spec. **Radar is reverse-engineered**
(1 header byte + 3 bytes/threat: distance + threat-level bits) — it works with Garmin
Varia RTL-series but is unofficial and needs validation against your hardware; the closing
speed is left `null` because its scale is uncalibrated. For production, enroll in Garmin's
official **Radar Data BLE Program** (developer.garmin.com/radar-data-ble) for the real spec.
Split radar packets aren't reassembled yet (marked TODO in `ble.js`).
