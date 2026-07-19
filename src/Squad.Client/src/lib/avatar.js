// Profile photo handling — client-side only.
//
// The backend profile has no photo field (identity is name/initials/avatarColor),
// so a chosen photo is cropped to a square, downscaled to a small JPEG data URL and
// persisted in localStorage keyed by athlete id. It's hydrated into App state on
// boot and rendered by <Avatar> wherever the signed-in athlete's avatar appears.
// Swap saveAvatar/loadAvatar for a real POST /api/profile/photo (blob storage) to
// make it sync across devices.

const keyFor = (id) => `squad.avatar.${id || 'me'}`;

export function loadAvatar(id) {
  try {
    return localStorage.getItem(keyFor(id)) || null;
  } catch {
    return null;
  }
}

// Persist (or clear, when dataUrl is falsy) the athlete's photo. Returns the value.
export function saveAvatar(id, dataUrl) {
  try {
    if (dataUrl) localStorage.setItem(keyFor(id), dataUrl);
    else localStorage.removeItem(keyFor(id));
  } catch { /* storage unavailable / quota */ }
  return dataUrl || null;
}

// Decode a File to something drawable, using createImageBitmap when available and
// falling back to an <img> + object URL otherwise.
function decode(file) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}

// Center-crop to a square and downscale to `size` px, returning a JPEG data URL.
// Keeps the stored blob tiny (a 256px avatar is a few KB) so it fits localStorage.
export async function fileToAvatarDataUrl(file, size = 256) {
  if (!file || !file.type?.startsWith('image/')) throw new Error('Please choose an image file.');
  if (file.size > 12 * 1024 * 1024) throw new Error('That image is too large (max 12 MB).');

  const src = await decode(file);
  const w = src.width, h = src.height;
  if (!w || !h) throw new Error('Could not read that image.');

  const side = Math.min(w, h);
  const sx = (w - side) / 2;
  const sy = (h - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, sx, sy, side, side, 0, 0, size, size);
  src.close?.(); // release ImageBitmap
  return canvas.toDataURL('image/jpeg', 0.85);
}
