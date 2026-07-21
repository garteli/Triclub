// Location source for INDOOR sessions (smart trainer / treadmill): there's no GPS, so this ticks
// once a second and emits position-less samples carrying the paired sensors' instantaneous speed.
// The recorder integrates distance from that speed instead of from GPS fixes. Same sample shape as
// the web/native GPS sources ({ lat, lon, elevM, speedMps, accuracy, ts }) so the recorder is
// agnostic to where a sample came from.
export function createSensorLocationSource(sensors) {
  let iv = null;
  return {
    start(onSample) {
      const tick = () => {
        const m = sensors?.current?.() || {};
        const speedMps = m.speedKph != null ? m.speedKph / 3.6 : null;
        onSample({ lat: null, lon: null, elevM: null, speedMps, accuracy: null, ts: Date.now() });
      };
      tick();
      iv = setInterval(tick, 1000);
    },
    async stop() { if (iv) { clearInterval(iv); iv = null; } },
  };
}
