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
  const src = await loadImageFile(file);
  const w = src.width, h = src.height;

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

// Decode a picked File into a drawable image (ImageBitmap or <img>) after
// validating type/size. The caller owns the result and should call `.close?.()`
// when done (a no-op for the <img> fallback). Used by the reposition editor,
// which keeps the image alive across many re-renders / re-crops.
export async function loadImageFile(file) {
  if (!file || !file.type?.startsWith('image/')) throw new Error('Please choose an image file.');
  if (file.size > 12 * 1024 * 1024) throw new Error('That image is too large (max 12 MB).');

  const img = await decode(file);
  if (!img.width || !img.height) throw new Error('Could not read that image.');
  return img;
}

// Render the visible slice of a repositioned avatar to a square JPEG data URL.
//
// The editor lays the image out "cover" inside a `dispSize`×`dispSize` viewport,
// then lets the user pan (tx/ty, in display px) and zoom (`scale` ≥ 1). This maps
// that same viewport back into source pixels so the exported crop matches exactly
// what the user framed. Geometry mirrors <AvatarEditor>'s on-screen transform.
export function renderAvatar(img, { dispSize, scale = 1, tx = 0, ty = 0 }, size = 256) {
  const w = img.width, h = img.height;
  const cover = dispSize / Math.min(w, h);      // shorter side fills the viewport
  const dispW = w * cover * scale;
  const dispH = h * cover * scale;
  const imgLeft = dispSize / 2 + tx - dispW / 2; // top-left of the drawn image, display px
  const imgTop = dispSize / 2 + ty - dispH / 2;
  const k = 1 / (cover * scale);                 // display px -> source px

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, -imgLeft * k, -imgTop * k, dispSize * k, dispSize * k, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', 0.85);
}

// Clamp a pan offset so the (cover-scaled) image never exposes an empty edge
// inside the viewport. Returns [tx, ty]. Shared by the editor and its gestures.
export function clampPan(img, dispSize, scale, tx, ty) {
  const cover = dispSize / Math.min(img.width, img.height);
  const maxX = Math.max(0, (img.width * cover * scale - dispSize) / 2);
  const maxY = Math.max(0, (img.height * cover * scale - dispSize) / 2);
  return [Math.max(-maxX, Math.min(maxX, tx)), Math.max(-maxY, Math.min(maxY, ty))];
}
