// Foreground web location source. Works while the page is visible and the screen
// is on (pair with a Wake Lock). Stops delivering when the tab is backgrounded or
// the phone locks — that's a browser limitation, not a bug (see useRideRecorder).
export function createWebLocationSource({ enableHighAccuracy = true } = {}) {
  let watchId = null;
  return {
    kind: 'web',
    supported: typeof navigator !== 'undefined' && 'geolocation' in navigator,
    start(onSample, onError) {
      if (!('geolocation' in navigator)) { onError?.(new Error('Geolocation not supported')); return; }
      watchId = navigator.geolocation.watchPosition(
        (pos) => onSample({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          elevM: pos.coords.altitude ?? null,
          speedMps: pos.coords.speed ?? null,   // browser-provided ground speed, m/s
          accuracy: pos.coords.accuracy ?? null,
          ts: pos.timestamp,
        }),
        (err) => onError?.(err),
        { enableHighAccuracy, maximumAge: 1000, timeout: 15000 },
      );
    },
    stop() {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
    },
  };
}
