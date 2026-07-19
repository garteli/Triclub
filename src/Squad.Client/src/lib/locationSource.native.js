// Native background location source, backed by @capacitor-community/background-geolocation.
// Everything is dynamically imported so a pure-web build never has to resolve the
// Capacitor packages (they're also marked external in vite.config.js). This module
// is only loaded at runtime when running inside the native shell.
//
// Setup (see NATIVE-SETUP.md): the `backgroundMessage` option is what actually enables
// background delivery — on Android it shows the required persistent notification; on
// iOS it relies on the UIBackgroundModes: location entitlement.
export async function createNativeLocationSource() {
  const { registerPlugin } = await import('@capacitor/core');
  const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');

  let watcherId = null;
  return {
    kind: 'native',
    supported: true,
    async start(onSample, onError) {
      watcherId = await BackgroundGeolocation.addWatcher(
        {
          backgroundMessage: 'Recording your ride. Tap to return.',
          backgroundTitle: 'Domestique Team · live ride',
          requestPermissions: true,
          stale: false,
          distanceFilter: 5, // metres between fixes; smooths battery vs. resolution
        },
        (location, error) => {
          if (error) { onError?.(error); return; }
          if (!location) return;
          onSample({
            lat: location.latitude,
            lon: location.longitude,
            elevM: location.altitude ?? null,
            speedMps: location.speed ?? null,
            accuracy: location.accuracy ?? null,
            ts: location.time ?? Date.now(),
          });
        },
      );
    },
    async stop() {
      if (watcherId) {
        await BackgroundGeolocation.removeWatcher({ id: watcherId });
        watcherId = null;
      }
    },
  };
}
