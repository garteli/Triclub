// Activity-photo capture + upload.
//
// Photos are captured during a ride (or attached to an activity later), downscaled
// to a modest JPEG client-side (so HEIC/huge originals never hit the wire), then
// uploaded to blob storage via POST /api/activities/photos. Web uses a file/camera
// <input>; native iOS uses the Capacitor Camera plugin (dynamically imported so the
// web bundle never loads it). Reads go through the authenticated proxy, same as avatars.

import { Capacitor } from '@capacitor/core';
import { loadImageFile, dataUrlToBlob } from './avatar.js';

export function isNativePlatform() {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
}

// Downscale a picked File/Blob to a JPEG data URL, preserving aspect ratio. Keeps
// the upload small (a 1600px photo is a few hundred KB) and normalizes format.
export async function downscaleToJpeg(file, maxDim = 1600, quality = 0.82) {
  const img = await loadImageFile(file); // validates type/size + decodes
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  img.close?.();
  return canvas.toDataURL('image/jpeg', quality);
}

// Native camera capture → a JPEG data URL (already sized/oriented by the plugin).
export async function captureNativePhoto() {
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
  const photo = await Camera.getPhoto({
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Camera,
    quality: 80,
    width: 1600,
    correctOrientation: true,
  });
  return photo?.dataUrl || null;
}

// Upload one activity photo. Pass `activityId` to attach it to a specific activity,
// or `capturedUtc` (epoch ms) for an in-ride capture that's resolved to its activity
// by time window later. Returns { id, url }.
export async function uploadActivityPhoto(token, dataUrl, { activityId, capturedUtc } = {}) {
  const fd = new FormData();
  fd.append('file', dataUrlToBlob(dataUrl), 'photo.jpg');
  if (activityId) fd.append('activityId', activityId);
  if (capturedUtc != null) fd.append('capturedUtc', String(capturedUtc));
  const res = await fetch('/api/activities/photos', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: fd,
  });
  if (!res.ok) throw new Error(`Photo upload failed (${res.status})`);
  return res.json().catch(() => ({}));
}
