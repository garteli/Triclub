import { useEffect, useRef, useState } from 'react';
import { rideBase } from '../data/squadData.js';

// DEV ONLY. Produces the same { riders, route } shape LiveRideMap consumes, but the
// coordinates are generated locally — riders orbit a real lat/lon loop — so you can
// see the coordinate-projected map animate before a native recorder exists. In
// production, delete this and use useLiveRide() instead (identical rider shape).
const CENTER = { lat: 32.72, lon: 35.53 };   // Kaza reservoir-ish
const R_LAT = 0.010;
const R_LON = 0.014;

function pointAt(u) {
  const a = 2 * Math.PI * u;
  return { lat: CENTER.lat + R_LAT * Math.cos(a), lon: CENTER.lon + R_LON * Math.sin(a) };
}

// Static course polyline sampled once around the loop.
const ROUTE = Array.from({ length: 48 }, (_, i) => {
  const p = pointAt(i / 48);
  return [p.lat, p.lon];
});

export function useSimulatedRide() {
  const [riders, setRiders] = useState([]);
  const t = useRef(0);

  useEffect(() => {
    const tick = () => {
      t.current += 1;
      const tt = t.current;
      setRiders(
        rideBase.map((r, i) => {
          const dropped = !!r.dropped;
          // Pack rides together; the dropped rider drifts behind.
          const u = ((tt * 0.010) + i * 0.006 - (dropped ? 0.05 : 0)) % 1;
          const p = pointAt((u + 1) % 1);
          const spd = r.bk + 2.4 * Math.sin((tt + i * 1.7) / 2.6);
          const hr = r.bh + 7 * Math.sin((tt + i * 1.7) / 3.4);
          return {
            athleteId: r.initials,          // stand-in id for the demo
            you: r.you,
            name: r.name,
            initials: r.initials,
            color: r.color,
            lat: p.lat,
            lon: p.lon,
            spd: spd.toFixed(1),
            hr: Math.round(hr),
            dist: (24.6 - i * 0.4 + tt * 0.009).toFixed(1),
            hrPct: Math.min(100, Math.round(((hr - 110) / 70) * 100)),
            hrColor: hr > 168 ? 'var(--bad)' : hr > 158 ? 'var(--warn)' : 'var(--good)',
            dropped,
            rowBg: r.you
              ? 'background:var(--accent-dim);border:1px solid color-mix(in srgb,var(--accent) 40%,transparent)'
              : dropped
              ? 'background:var(--bg2);border:1px solid color-mix(in srgb,var(--behind) 35%,transparent)'
              : 'background:var(--bg2);border:1px solid var(--line)',
          };
        }),
      );
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  return { riders, route: ROUTE, status: 'sim' };
}
