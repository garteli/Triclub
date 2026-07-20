// Minimal Garmin .FIT encoder — turns a recorded ride into a real FIT binary that is
// byte-compatible with what a Garmin head unit writes, so it flows through the exact
// same ingest path as an uploaded Garmin file (FitUploadAdapter.cs on the backend) and
// can be re-exported / re-imported by Garmin Connect and other tools.
//
// FIT layout we emit (canonical activity-file order):
//   header(14) → File ID → Record×N → Lap → Session → Activity → CRC(2)
//
// The two classic gotchas the backend calls out, handled here on the write side:
//   • positions are SEMICIRCLES: semicircles = round(deg * 2^31 / 180)
//   • timestamps are seconds since 1989-12-31 UTC (FIT epoch = 631065600)
//
// Reference: FIT Protocol — file header, record/definition messages, and the FIT CRC-16.

const FIT_EPOCH = 631065600; // seconds between the Unix epoch and 1989-12-31T00:00:00Z
const SEMI = 2147483648 / 180; // 2^31 / 180

// --- base types (type byte incl. the 0x80 endian flag where applicable, and byte size) ---
const T = {
  enum:  { id: 0x00, size: 1 },
  uint8: { id: 0x02, size: 1 },
  uint16:{ id: 0x84, size: 2 },
  uint32:{ id: 0x86, size: 4 },
  sint32:{ id: 0x85, size: 4 },
};
// "Invalid" sentinels — FIT's way of saying a field is absent for this record.
const INVALID = { enum: 0xff, uint8: 0xff, uint16: 0xffff, uint32: 0xffffffff, sint32: 0x7fffffff };

// Global message numbers (FIT profile).
const MESG = { fileId: 0, record: 20, lap: 19, session: 18, activity: 34 };

// FIT CRC-16 (nibble table algorithm from the FIT spec).
const CRC_TABLE = [0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401,
                   0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400];
function crc16(bytes) {
  let crc = 0;
  for (let i = 0; i < bytes.length; i++) {
    let b = bytes[i];
    let tmp = CRC_TABLE[crc & 0xf];
    crc = ((crc >> 4) & 0x0fff) ^ tmp ^ CRC_TABLE[b & 0xf];
    tmp = CRC_TABLE[crc & 0xf];
    crc = ((crc >> 4) & 0x0fff) ^ tmp ^ CRC_TABLE[(b >> 4) & 0xf];
  }
  return crc & 0xffff;
}

// Growable little-endian byte sink.
function writer() {
  let buf = [];
  return {
    u8:  (v) => buf.push(v & 0xff),
    u16: (v) => buf.push(v & 0xff, (v >>> 8) & 0xff),
    u32: (v) => buf.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff),
    bytes: (arr) => { for (const b of arr) buf.push(b & 0xff); },
    get: () => buf,
    get length() { return buf.length; },
  };
}

const fitTime = (ms) => Math.round(ms / 1000) - FIT_EPOCH;
const semicircles = (deg) => Math.round(deg * SEMI);

// A field spec: [fieldDefNum, type, valueFn]. valueFn(sample|summary) → number|null.
// Definition + data are driven off the same list so they can never drift out of sync.
function writeDefinition(w, localType, globalMesg, fields) {
  w.u8(0x40 | localType);          // definition record header (bit6 = definition)
  w.u8(0);                         // reserved
  w.u8(0);                         // architecture: 0 = little-endian
  w.u16(globalMesg);
  w.u8(fields.length);
  for (const [num, type] of fields) { w.u8(num); w.u8(type.size); w.u8(type.id); }
}

function writeData(w, localType, fields, src) {
  w.u8(localType & 0x0f);          // data record header (bit6 clear)
  for (const [, type, valueFn, tname] of fields) {
    let v = valueFn(src);
    if (v == null || !Number.isFinite(v)) { writeScalar(w, type, INVALID[tname]); continue; }
    writeScalar(w, type, v);
  }
}

function writeScalar(w, type, v) {
  const rounded = Math.round(v);
  if (type.size === 1) w.u8(rounded);
  else if (type.size === 2) w.u16(rounded);
  else w.u32(rounded); // 4-byte (uint32 / sint32 — two's complement fits in u32 write)
}

// Field tables. Each entry: [fieldDefNum, baseType, valueFn, typeName-for-invalid].
const RECORD_FIELDS = [
  [253, T.uint32, (r) => fitTime(r.tMs), 'uint32'],                                   // timestamp
  [0,   T.sint32, (r) => (r.lat  != null ? semicircles(r.lat)  : null), 'sint32'],    // position_lat
  [1,   T.sint32, (r) => (r.lon  != null ? semicircles(r.lon)  : null), 'sint32'],    // position_long
  [5,   T.uint32, (r) => (r.distanceM != null ? r.distanceM * 100 : null), 'uint32'], // distance (m*100)
  [2,   T.uint16, (r) => (r.elevM != null ? (r.elevM + 500) * 5 : null), 'uint16'],   // altitude
  [6,   T.uint16, (r) => (r.speedMps != null ? r.speedMps * 1000 : null), 'uint16'],  // speed (m/s*1000)
  [3,   T.uint8,  (r) => r.heartRate ?? null, 'uint8'],                               // heart_rate
  [4,   T.uint8,  (r) => r.cadence ?? null, 'uint8'],                                 // cadence
  [7,   T.uint16, (r) => r.powerW ?? null, 'uint16'],                                 // power
];

const FILEID_FIELDS = [
  [0, T.enum,   () => 4, 'enum'],                 // type = activity
  [1, T.uint16, () => 255, 'uint16'],             // manufacturer = development
  [2, T.uint16, () => 0, 'uint16'],               // product
  [4, T.uint32, (m) => fitTime(m.endMs), 'uint32'], // time_created
];

const LAP_FIELDS = [
  [254, T.uint16, () => 0, 'uint16'],                              // message_index
  [253, T.uint32, (m) => fitTime(m.endMs), 'uint32'],             // timestamp
  [2,   T.uint32, (m) => fitTime(m.startMs), 'uint32'],           // start_time
  [7,   T.uint32, (m) => m.elapsedSec * 1000, 'uint32'],         // total_elapsed_time
  [8,   T.uint32, (m) => m.movingSec * 1000, 'uint32'],          // total_timer_time
  [9,   T.uint32, (m) => (m.distanceM != null ? m.distanceM * 100 : null), 'uint32'], // total_distance
];

const SESSION_FIELDS = [
  [254, T.uint16, () => 0, 'uint16'],                             // message_index
  [253, T.uint32, (m) => fitTime(m.endMs), 'uint32'],            // timestamp
  [2,   T.uint32, (m) => fitTime(m.startMs), 'uint32'],          // start_time
  [7,   T.uint32, (m) => m.elapsedSec * 1000, 'uint32'],        // total_elapsed_time
  [8,   T.uint32, (m) => m.movingSec * 1000, 'uint32'],         // total_timer_time
  [9,   T.uint32, (m) => (m.distanceM != null ? m.distanceM * 100 : null), 'uint32'], // total_distance
  [11,  T.uint16, (m) => m.calories ?? null, 'uint16'],          // total_calories
  [5,   T.enum,   (m) => m.sport, 'enum'],                        // sport
  [22,  T.uint16, (m) => m.ascentM ?? null, 'uint16'],           // total_ascent
  [16,  T.uint8,  (m) => m.avgHr ?? null, 'uint8'],              // avg_heart_rate
  [17,  T.uint8,  (m) => m.maxHr ?? null, 'uint8'],             // max_heart_rate
  [20,  T.uint16, (m) => m.avgPowerW ?? null, 'uint16'],        // avg_power
  [18,  T.uint8,  (m) => m.avgCadence ?? null, 'uint8'],        // avg_cadence
  [26,  T.uint16, () => 1, 'uint16'],                            // num_laps
  [25,  T.uint16, () => 0, 'uint16'],                            // first_lap_index
];

const ACTIVITY_FIELDS = [
  [253, T.uint32, (m) => fitTime(m.endMs), 'uint32'],           // timestamp
  [0,   T.uint32, (m) => m.movingSec * 1000, 'uint32'],        // total_timer_time
  [1,   T.uint16, () => 1, 'uint16'],                            // num_sessions
  [2,   T.enum,   () => 0, 'enum'],                              // type = manual
  [3,   T.enum,   () => 26, 'enum'],                             // event = activity
  [4,   T.enum,   () => 1, 'enum'],                              // event_type = stop
];

// FIT sport enum values we emit.
export const FitSport = { generic: 0, running: 1, cycling: 2, swimming: 5 };

// Encode a ride into a FIT byte array.
//   startMs, endMs : epoch millis of ride bounds
//   sport          : a FitSport value (defaults to cycling)
//   samples        : [{ tMs, lat, lon, elevM, speedMps, heartRate, cadence, powerW, distanceM }]
//   summary        : { movingSec, elapsedSec, distanceM, ascentM, avgHr, maxHr, avgPowerW, avgCadence, calories }
export function encodeFitActivity({ startMs, endMs, sport = FitSport.cycling, samples = [], summary = {} }) {
  const meta = {
    startMs, endMs, sport,
    movingSec: summary.movingSec ?? Math.max(0, Math.round((endMs - startMs) / 1000)),
    elapsedSec: summary.elapsedSec ?? Math.max(0, Math.round((endMs - startMs) / 1000)),
    distanceM: summary.distanceM ?? null,
    ascentM: summary.ascentM ?? null,
    avgHr: summary.avgHr ?? null,
    maxHr: summary.maxHr ?? null,
    avgPowerW: summary.avgPowerW ?? null,
    avgCadence: summary.avgCadence ?? null,
    calories: summary.calories ?? null,
  };

  const body = writer();
  // File ID (local 0)
  writeDefinition(body, 0, MESG.fileId, FILEID_FIELDS);
  writeData(body, 0, FILEID_FIELDS, meta);
  // Records (local 1) — one definition, then every sample
  writeDefinition(body, 1, MESG.record, RECORD_FIELDS);
  for (const r of samples) writeData(body, 1, RECORD_FIELDS, r);
  // Lap (local 2)
  writeDefinition(body, 2, MESG.lap, LAP_FIELDS);
  writeData(body, 2, LAP_FIELDS, meta);
  // Session (local 3)
  writeDefinition(body, 3, MESG.session, SESSION_FIELDS);
  writeData(body, 3, SESSION_FIELDS, meta);
  // Activity (local 4)
  writeDefinition(body, 4, MESG.activity, ACTIVITY_FIELDS);
  writeData(body, 4, ACTIVITY_FIELDS, meta);

  const bodyBytes = body.get();

  // Header (14 bytes) with its own CRC over the first 12.
  const head = writer();
  head.u8(14);            // header size
  head.u8(0x20);          // protocol version 2.0
  head.u16(2145);         // profile version (arbitrary recent)
  head.u32(bodyBytes.length);
  head.bytes([0x2e, 0x46, 0x49, 0x54]); // ".FIT"
  const headBytes = head.get();
  const headCrc = crc16(headBytes);
  headBytes.push(headCrc & 0xff, (headCrc >>> 8) & 0xff);

  // File CRC over header(14) + body.
  const all = headBytes.concat(bodyBytes);
  const fileCrc = crc16(all);
  all.push(fileCrc & 0xff, (fileCrc >>> 8) & 0xff);

  return new Uint8Array(all);
}
