import { s } from '../lib/style.js';

// Full-screen launch splash, visually identical to the #boot-splash in index.html so the
// handoff from the static splash (shown until React mounts) to this one is seamless. App
// keeps it mounted for a minimum time on launch; `hiding` fades it out before unmount.
export default function BootSplash({ hiding = false }) {
  return (
    <div
      style={{
        ...s('position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;background:#0c0e11'),
        opacity: hiding ? 0 : 1,
        transition: 'opacity .32s ease',
        pointerEvents: hiding ? 'none' : 'auto',
      }}
    >
      <div style={s('width:96px;height:96px;border-radius:26px;background:linear-gradient(155deg,#ff8a3d,#ef5f1f);display:flex;align-items:center;justify-content:center;box-shadow:0 20px 54px -12px rgba(239,95,31,.6);animation:bootpulse 1.6s ease-in-out infinite')}>
        <svg width="58" height="58" viewBox="0 0 64 64" fill="none">
          <g stroke="#fff" strokeWidth="5.4" strokeLinecap="round">
            <path d="M13 44 L23 30" /><path d="M25 46 L35 32" opacity=".85" /><path d="M37 48 L47 34" opacity=".55" />
          </g>
          <circle cx="49.5" cy="20.5" r="4.4" fill="#fff" />
        </svg>
      </div>
      <div style={s('font-size:22px;font-weight:700;letter-spacing:-.4px;color:#eef2f6')}>Domestique<span style={s('color:#ff6a2c')}> Team</span></div>
    </div>
  );
}
