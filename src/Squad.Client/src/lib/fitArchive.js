// Expand whatever a user drops onto the upload screen into a flat list of raw .fit files,
// so a whole Garmin back-catalog can go in at once.
//
// Handles the three shapes activities actually arrive in:
//   • .fit            — a single file exported per-activity from Garmin/Wahoo/Zwift
//   • .fit.gz / .gz   — a gzipped fit (how many devices and exports store them)
//   • .zip            — an archive. Garmin's "Export Your Data" (account data export) is a
//                       big zip whose fitness files sit inside *nested* zips, so we recurse.
//
// Everything runs client-side (fflate, async so a large archive doesn't freeze the UI) and
// each extracted fit is uploaded individually through the existing idempotent endpoint —
// that keeps every request under the 25 MB server cap and lets dedup work per activity.

import { unzip, gunzip } from 'fflate';

const unzipAsync = (buf) => new Promise((res, rej) => unzip(buf, (err, data) => (err ? rej(err) : res(data))));
const gunzipAsync = (buf) => new Promise((res, rej) => gunzip(buf, (err, data) => (err ? rej(err) : res(data))));

const isFit = (n) => /\.fit$/i.test(n);
const isGz = (n) => /\.gz$/i.test(n);
const isZip = (n) => /\.zip$/i.test(n);

// True for anything extractFitFiles knows how to open — used by the picker/validation.
export const isSupportedUpload = (n) => isFit(n) || isGz(n) || isZip(n);

// Last path segment, tolerating both / and \ separators that zip entries can carry.
const baseName = (path) => path.split(/[\\/]/).pop() || '';

// Depth guard: Garmin nests one level (archive → per-batch zips → fits). 4 is generous
// headroom while still stopping a maliciously deep / self-referential zip bomb.
const MAX_DEPTH = 4;

// Recursively flatten `bytes` (named `name`) into [{ name, bytes }] of .fit payloads.
// Unknown members of a zip (the export's JSON/CSV, avatars, etc.) are simply ignored.
async function collect(name, bytes, depth, out) {
  if (depth > MAX_DEPTH) return;

  if (isZip(name)) {
    let entries;
    try {
      entries = await unzipAsync(bytes);
    } catch {
      return; // not a real zip / corrupt — skip rather than abort the whole import
    }
    for (const [path, data] of Object.entries(entries)) {
      if (path.endsWith('/')) continue; // directory entry
      const entryName = baseName(path);
      if (!entryName || entryName.startsWith('.') || entryName === '__MACOSX') continue;
      if (data.length === 0) continue;
      await collect(entryName, data, depth + 1, out);
    }
    return;
  }

  if (isGz(name)) {
    let data;
    try {
      data = await gunzipAsync(bytes);
    } catch {
      return;
    }
    // The gzipped payload is (almost always) a .fit; strip .gz and let the fit branch take it.
    await collect(name.replace(/\.gz$/i, ''), data, depth + 1, out);
    return;
  }

  if (isFit(name)) out.push({ name, bytes });
}

// Public entry point: a browser File → Promise<[{ name, bytes: Uint8Array }]>.
export async function extractFitFiles(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const out = [];
  await collect(file.name, buf, 0, out);
  return out;
}
