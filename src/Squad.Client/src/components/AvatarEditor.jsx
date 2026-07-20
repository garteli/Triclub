import { useEffect, useRef, useState, useCallback } from 'react';
import { s } from '../lib/style.js';
import { renderAvatar, clampPan } from '../lib/avatar.js';

// Reposition-in-circle editor. Opens after a photo is picked: the image is laid
// out "cover" inside a circular viewport, and the athlete drags to pan / uses the
// slider (or wheel / pinch) to zoom before committing. "Use photo" re-crops the
// framed region to a square JPEG via renderAvatar(); the geometry here matches it
// 1:1 so the export equals the preview. The caller owns closing the image
// (img.close?.()) — this component only reads it.
const DISP = 260; // on-screen viewport diameter (px)

export default function AvatarEditor({ img, onCancel, onDone }) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState([0, 0]); // [tx, ty] in display px
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef(null);
  const drag = useRef(null);

  // Redraw the live preview whenever the framing changes. Draws the whole image
  // positioned inside the viewport; the canvas is CSS-clipped to a circle.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const cover = DISP / Math.min(img.width, img.height);
    const dispW = img.width * cover * scale;
    const dispH = img.height * cover * scale;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, DISP, DISP);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, DISP / 2 + pan[0] - dispW / 2, DISP / 2 + pan[1] - dispH / 2, dispW, dispH);
  }, [img, scale, pan]);

  const setZoom = useCallback((next) => {
    const z = Math.max(1, Math.min(4, next));
    setScale(z);
    setPan(([tx, ty]) => clampPan(img, DISP, z, tx, ty)); // re-clamp so zoom-out never bares an edge
  }, [img]);

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, tx: pan[0], ty: pan[1] };
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const d = drag.current;
    setPan(clampPan(img, DISP, scale, d.tx + (e.clientX - d.x), d.ty + (e.clientY - d.y)));
  };
  const onPointerUp = (e) => {
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };
  const onWheel = (e) => { e.preventDefault(); setZoom(scale * (e.deltaY < 0 ? 1.06 : 0.94)); };

  const use = () => {
    setBusy(true);
    try {
      onDone(renderAvatar(img, { dispSize: DISP, scale, tx: pan[0], ty: pan[1] }));
    } catch {
      setBusy(false);
    }
  };

  return (
    <div
      style={s('position:fixed;inset:0;z-index:50;background:rgba(6,8,11,.82);backdrop-filter:blur(6px);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;animation:floatUp .2s ease')}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={s('font-size:15px;font-weight:700;color:#eef2f6;margin-bottom:4px')}>Reposition photo</div>
      <div style={s('font-size:12px;color:#98a2ae;margin-bottom:18px')}>Drag to pan · pinch or scroll to zoom</div>

      {/* circular viewport */}
      <div
        style={s(`position:relative;width:${DISP}px;height:${DISP}px;touch-action:none;cursor:grab`)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <canvas ref={canvasRef} width={DISP} height={DISP} style={s(`width:${DISP}px;height:${DISP}px;border-radius:50%;display:block;background:#14171d`)} />
        {/* mask ring + dimmed corners so the circular crop is obvious */}
        <div style={s(`position:absolute;inset:0;border-radius:50%;box-shadow:0 0 0 9999px rgba(6,8,11,.55);pointer-events:none`)} />
        <div style={s(`position:absolute;inset:0;border-radius:50%;border:2px solid rgba(255,255,255,.9);pointer-events:none`)} />
      </div>

      {/* zoom slider */}
      <div style={s('display:flex;align-items:center;gap:12px;width:100%;max-width:300px;margin-top:22px')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#98a2ae" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M8 11h6"/></svg>
        <input
          type="range" min="1" max="4" step="0.01" value={scale}
          onChange={(e) => setZoom(Number(e.target.value))}
          style={s('flex:1;accent-color:#d6ff3f;cursor:pointer')}
        />
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#98a2ae" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M8 11h6M11 8v6"/></svg>
      </div>

      {/* actions */}
      <div style={s('display:flex;gap:12px;margin-top:26px')}>
        <div className="ctl" onClick={busy ? undefined : onCancel} style={s('padding:12px 22px;border-radius:14px;background:#232833;color:#eef2f6;font-size:13px;font-weight:600')}>Cancel</div>
        <div className="ctl" onClick={busy ? undefined : use} style={s('padding:12px 26px;border-radius:14px;background:#d6ff3f;color:#141a05;font-size:13px;font-weight:700;opacity:' + (busy ? '.6' : '1'))}>{busy ? 'Saving…' : 'Use photo'}</div>
      </div>
    </div>
  );
}
