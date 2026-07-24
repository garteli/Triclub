// Aspect-aware crop geometry — the generalized form of the square avatar crop
// (see renderAvatar/clampPan in avatar.js). An image is laid out "cover" inside a
// vw×vh viewport, then panned (tx/ty, display px) and zoomed (scale ≥ 1); these
// map that same framing back to source pixels so the export equals the preview.
// Used by <ImageEditor> for any aspect: square logos/avatars and wide banners alike.

// Cover-fit scale: the factor at which the image just fills a vw×vh viewport
// (its shorter dimension relative to the box touches both edges).
export function coverScale(img, vw, vh) {
  return Math.max(vw / img.width, vh / img.height);
}

// Clamp a pan offset so the (cover-scaled, zoomed) image never exposes an empty
// edge inside the vw×vh viewport. Returns [tx, ty] in display px.
export function clampPanRect(img, vw, vh, scale, tx, ty) {
  const cover = coverScale(img, vw, vh);
  const dispW = img.width * cover * scale;
  const dispH = img.height * cover * scale;
  const maxX = Math.max(0, (dispW - vw) / 2);
  const maxY = Math.max(0, (dispH - vh) / 2);
  return [Math.max(-maxX, Math.min(maxX, tx)), Math.max(-maxY, Math.min(maxY, ty))];
}

// Render the framed viewport to a JPEG data URL sized outW × round(outW·vh/vw).
// Geometry mirrors the on-screen transform in <ImageEditor> 1:1 so the export
// matches exactly what the user framed.
export function renderCrop(img, { vw, vh, scale = 1, tx = 0, ty = 0 }, outW, quality = 0.85) {
  const cover = coverScale(img, vw, vh);
  const dispW = img.width * cover * scale;
  const dispH = img.height * cover * scale;
  const imgLeft = vw / 2 + tx - dispW / 2; // top-left of the drawn image, display px
  const imgTop = vh / 2 + ty - dispH / 2;
  const k = 1 / (cover * scale);           // display px -> source px

  const outH = Math.max(1, Math.round(outW * vh / vw));
  const canvas = document.createElement('canvas');
  canvas.width = outW; canvas.height = outH;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, -imgLeft * k, -imgTop * k, vw * k, vh * k, 0, 0, outW, outH);
  return canvas.toDataURL('image/jpeg', quality);
}
