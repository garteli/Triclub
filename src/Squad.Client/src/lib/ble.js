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
// Garmin Varia radar — PROPRIETARY, community reverse-engineered (no official public
// spec; Garmin runs a gated "Radar Data BLE Program"). Verify against real hardware.
export const RADAR = {
  service: '6a4e3200-667b-11e3-949a-0800200c9a66',
  measurement: '6a4e3203-667b-11e3-949a-0800200c9a66',
};

// Heart Rate Measurement (0x2A37): flags byte, then 8- or 16-bit BPM (bit0 of flags).
export function parseHeartRate(dv) {
  const flags = dv.getUint8(0);
  return flags & 0x01 ? dv.getUint16(1, true) : dv.getUint8(1);
}

// Cycling Power Measurement (0x2A63): uint16 flags (LE), then sint16 instantaneous watts.
export function parseCyclingPower(dv) {
  return dv.getInt16(2, true);
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

// kind -> { service, measurement, apply(dataView, latest) }. Both sensor sources
// iterate this, so adding a sensor type is one entry here plus a parser above.
export const SENSOR_SPECS = {
  hr:    { ...HR,    apply: (dv, l) => { l.heartRate = parseHeartRate(dv); } },
  power: { ...POWER, apply: (dv, l) => { l.powerW = parseCyclingPower(dv); } },
  radar: { ...RADAR, apply: (dv, l) => { l.radar = parseVariaRadar(dv); } },
};
