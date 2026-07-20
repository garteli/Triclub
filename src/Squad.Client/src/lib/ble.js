// Shared BLE parsing — used by both the native (Capacitor) and web (Web Bluetooth)
// sensor sources. All callbacks deliver a DataView; these turn bytes into numbers.

// Standard Bluetooth SIG GATT profiles (stable, official specs).
export const HR = {
  service: '0000180d-0000-1000-8000-00805f9b34fb',
  measurement: '00002a37-0000-1000-8000-00805f9b34fb',
};
export const POWER = {
  service: '00001818-0000-1000-8000-00805f9b34fb',
  measurement: '00002a63-0000-1000-8000-00805f9b34fb',
};
// Cycling Speed and Cadence (CSC) — one sensor reports wheel revs (speed) and/or
// crank revs (cadence) in a single measurement.
export const CSC = {
  service: '00001816-0000-1000-8000-00805f9b34fb',
  measurement: '00002a5b-0000-1000-8000-00805f9b34fb',
};
// Running Speed and Cadence (RSC) — footpod: instantaneous speed + cadence.
export const RSC = {
  service: '00001814-0000-1000-8000-00805f9b34fb',
  measurement: '00002a53-0000-1000-8000-00805f9b34fb',
};
// Fitness Machine (FTMS) — smart trainers. We read the Indoor Bike Data characteristic
// (power / speed / cadence). Erg/resistance *control* (Control Point 0x2AD9) is a follow-up.
export const FTMS = {
  service: '00001826-0000-1000-8000-00805f9b34fb',
  measurement: '00002ad2-0000-1000-8000-00805f9b34fb', // Indoor Bike Data
};
// Garmin Varia radar — PROPRIETARY, community reverse-engineered (no official public
// spec; Garmin runs a gated "Radar Data BLE Program"). Verify against real hardware.
export const RADAR = {
  service: '6a4e3200-667b-11e3-949a-0800200c9a66',
  measurement: '6a4e3203-667b-11e3-949a-0800200c9a66',
};

// Default wheel circumference for CSC speed (700x25c ≈ 2105 mm). A per-bike override
// belongs in settings; this is a sane default so speed isn't wildly off out of the box.
export const DEFAULT_WHEEL_MM = 2105;

// Heart Rate Measurement (0x2A37): flags byte, then 8- or 16-bit BPM (bit0 of flags).
export function parseHeartRate(dv) {
  const flags = dv.getUint8(0);
  return flags & 0x01 ? dv.getUint16(1, true) : dv.getUint8(1);
}

// Cycling Power Measurement (0x2A63): uint16 flags (LE), then sint16 instantaneous watts,
// then a variable field list. Many power meters also carry crank revolution data (flags
// bit5) → cadence. We walk the optional fields in flag order to find that block, then diff
// crank revs / event-time against the previous packet (stashed on latest._cpwr), handling
// the 16-bit event-time rollover — same technique as the CSC crank block.
export function applyCyclingPower(dv, latest) {
  const flags = dv.getUint16(0, true);
  latest.powerW = dv.getInt16(2, true);
  let o = 4;
  if (flags & 0x0001) o += 1;   // pedal power balance (uint8)
  if (flags & 0x0004) o += 2;   // accumulated torque (uint16)
  if (flags & 0x0010) o += 6;   // wheel revolution data (uint32 revs + uint16 event time)
  if (flags & 0x0020) {         // crank revolution data → cadence
    const revs = dv.getUint16(o, true);
    const time = dv.getUint16(o + 2, true);                     // 1/1024 s
    const st = latest._cpwr || (latest._cpwr = {});
    if (st.ct != null) {
      const dt = ((time - st.ct) & 0xffff) / 1024;
      const dr = (revs - st.cr) & 0xffff;
      if (dt > 0) latest.cadence = Math.round((dr / dt) * 60);
    }
    st.cr = revs; st.ct = time;
  }
}

// Varia radar (reverse-engineered): 1 header byte, then 3 bytes per threat —
// [id, distance(m), b2] where b2's top 2 bits are the threat level (0 none /
// 1 approaching / 2 fast-approaching / 3 unknown) and the low bits relate to closing
// speed (scale uncalibrated, so we don't fake a kph). Split packets aren't reassembled
// here (MVP). Returns a summary: worst level, count, nearest distance.
export function parseVariaRadar(dv) {
  const threats = [];
  for (let i = 1; i + 2 < dv.byteLength + 1 && i + 2 < dv.byteLength; i += 3) {
    const distanceM = dv.getUint8(i + 1);
    const b2 = dv.getUint8(i + 2);
    threats.push({ id: dv.getUint8(i), distanceM, level: (b2 >> 6) & 0x03, speedRaw: b2 & 0x3f });
  }
  const real = threats.filter((t) => t.distanceM > 0);
  return {
    count: real.length,
    level: real.reduce((m, t) => Math.max(m, t.level), 0),
    closestM: real.length ? Math.min(...real.map((t) => t.distanceM)) : null,
    closingKph: null, // intentionally not fabricated — scale is uncalibrated
  };
}

// CSC Measurement (0x2A5B): flags byte, then optional wheel block (uint32 cumulative
// revolutions + uint16 last-event-time @ 1/1024 s) and/or crank block (uint16 revs +
// uint16 event-time). Speed and cadence are *rates*, so we diff against the previous
// packet (stashed on latest._csc) and handle the 16-bit event-time rollover.
export function applyCSC(dv, latest, wheelMm = DEFAULT_WHEEL_MM) {
  const flags = dv.getUint8(0);
  let o = 1;
  const st = latest._csc || (latest._csc = {});
  if (flags & 0x01) { // wheel revolution data → speed
    const revs = dv.getUint32(o, true); o += 4;
    const time = dv.getUint16(o, true); o += 2;
    if (st.wt != null) {
      const dt = ((time - st.wt) & 0xffff) / 1024;              // seconds
      const dr = (revs - st.wr) >>> 0;                          // uint32 wrap-safe
      if (dt > 0) latest.speedKph = (dr * (wheelMm / 1000)) / dt * 3.6;
    }
    st.wr = revs; st.wt = time;
  }
  if (flags & 0x02) { // crank revolution data → cadence
    const revs = dv.getUint16(o, true); o += 2;
    const time = dv.getUint16(o, true); o += 2;
    if (st.ct != null) {
      const dt = ((time - st.ct) & 0xffff) / 1024;
      const dr = (revs - st.cr) & 0xffff;
      if (dt > 0) latest.cadence = Math.round((dr / dt) * 60);
    }
    st.cr = revs; st.ct = time;
  }
}

// RSC Measurement (0x2A53): flags, then instantaneous speed (uint16 @ 1/256 m/s) and
// instantaneous cadence (uint8, steps/min) — both delivered directly, no diffing needed.
export function applyRSC(dv, latest) {
  latest.speedKph = (dv.getUint16(1, true) / 256) * 3.6;
  latest.cadence = dv.getUint8(3);
}

// FTMS Indoor Bike Data (0x2AD2): uint16 flags (LE) then a variable field list. We walk
// the flags in field order and pull speed / cadence / power. Note bit0 is "More Data" —
// when it's 0 the Instantaneous Speed field IS present (inverted, per the FTMS spec).
export function applyIndoorBike(dv, latest) {
  const flags = dv.getUint16(0, true);
  let o = 2;
  if (!(flags & 0x0001)) { latest.speedKph = dv.getUint16(o, true) * 0.01; o += 2; }
  if (flags & 0x0002) o += 2;                                             // average speed
  if (flags & 0x0004) { latest.cadence = Math.round(dv.getUint16(o, true) * 0.5); o += 2; }
  if (flags & 0x0008) o += 2;                                             // average cadence
  if (flags & 0x0010) o += 3;                                            // total distance (uint24)
  if (flags & 0x0020) o += 2;                                            // resistance level
  if (flags & 0x0040) { latest.powerW = dv.getInt16(o, true); o += 2; }  // instantaneous power
  // remaining fields (avg power, energy, HR, MET, time) are not needed here
}

// kind -> { service, measurement, apply(dataView, latest), clears }. Both sensor sources
// iterate this, so adding a BLE sensor type is one entry here plus a parser above.
// `clears` lists the snapshot fields to null on disconnect; `reset` clears rolling state.
export const SENSOR_SPECS = {
  hr:      { ...HR,    clears: ['heartRate'],                 apply: (dv, l) => { l.heartRate = parseHeartRate(dv); } },
  power:   { ...POWER, clears: ['powerW', 'cadence'], reset: '_cpwr', apply: applyCyclingPower },
  csc:     { ...CSC,   clears: ['speedKph', 'cadence'], reset: '_csc', apply: applyCSC },
  rsc:     { ...RSC,   clears: ['speedKph', 'cadence'],       apply: applyRSC },
  trainer: { ...FTMS,  clears: ['powerW', 'speedKph', 'cadence'], apply: applyIndoorBike },
  // Varia radar units DON'T advertise their proprietary radar service, so a service-only
  // scan filter never surfaces them. Scan by name prefix instead (RTL5xx / RTL510/515);
  // the service lives in optionalServices so we can still subscribe after connecting.
  radar:   { ...RADAR, clears: ['radar'], namePrefix: 'RTL',  apply: (dv, l) => { l.radar = parseVariaRadar(dv); } },
};

// Display catalog for the Sensors screen: order, labels, which metrics each device
// surfaces, and honest availability. `available:false` renders a disabled row with a note.
export const SENSOR_CATALOG = [
  { kind: 'hr',      label: 'Heart rate',        hint: 'Chest strap or optical HRM',       metrics: ['heartRate'] },
  { kind: 'power',   label: 'Power meter',       hint: 'Crank, pedal or hub power',        metrics: ['powerW', 'cadence'] },
  { kind: 'csc',     label: 'Speed & cadence',   hint: 'Standard CSC sensor',              metrics: ['speedKph', 'cadence'] },
  { kind: 'trainer', label: 'Smart trainer',     hint: 'FTMS indoor trainer (power)',      metrics: ['powerW', 'speedKph', 'cadence'] },
  { kind: 'rsc',     label: 'Run footpod',       hint: 'Running speed & cadence',          metrics: ['speedKph', 'cadence'] },
  { kind: 'radar',   label: 'Rear radar',        hint: 'Garmin Varia · unofficial',        metrics: ['radar'] },
  // Electronic shifting (Di2 / AXS) intentionally omitted: live gear data isn't on a
  // standard BLE profile (Di2 uses private ANT; iOS has no ANT radio). Re-add here if a
  // BLE gear characteristic is ever confirmed.
];

// Blank snapshot — the shape every controller keeps and the recorder/UI read.
export function emptySnapshot() {
  return { heartRate: null, powerW: null, cadence: null, speedKph: null, radar: null };
}
