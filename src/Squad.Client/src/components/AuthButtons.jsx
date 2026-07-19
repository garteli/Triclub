import { s } from '../lib/style.js';

// Shared sign-in affordances for the logged-out flow (Welcome + Register):
// Google / Apple OAuth buttons, and a platform-biometric (Face ID / Touch ID /
// Windows Hello / fingerprint) unlock button. Purely presentational — the caller
// wires onClick to lib/auth.js.

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
    <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
    <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z" />
    <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
  </svg>
);

const AppleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.05 12.54c-.03-2.62 2.14-3.88 2.24-3.94-1.22-1.79-3.12-2.03-3.8-2.06-1.62-.16-3.16.95-3.98.95-.82 0-2.09-.93-3.43-.9-1.77.03-3.4 1.03-4.3 2.6-1.83 3.18-.47 7.9 1.31 10.48.87 1.26 1.91 2.68 3.27 2.63 1.31-.05 1.81-.85 3.4-.85 1.58 0 2.03.85 3.42.82 1.41-.03 2.31-1.29 3.17-2.55.99-1.46 1.4-2.87 1.42-2.95-.03-.01-2.73-1.05-2.76-4.16zM14.53 4.6c.72-.88 1.21-2.09 1.08-3.3-1.04.04-2.3.69-3.05 1.56-.67.78-1.26 2.02-1.1 3.2 1.16.09 2.35-.59 3.07-1.46z" />
  </svg>
);

const FaceIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
    <path d="M9 10v1M15 10v1M12 10v3l-1 1" />
    <path d="M9 15c.8.7 1.9 1 3 1s2.2-.3 3-1" />
  </svg>
);

const rowBtn = 'display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:13px;border-radius:13px;font-weight:700;font-size:14.5px';

// Google / Apple. `provider` is 'google' | 'apple'.
export function SocialButton({ provider, onClick, label }) {
  const apple = provider === 'apple';
  const style = apple
    ? 'background:#000;color:#fff;border:1px solid #000'
    : 'background:#fff;color:#1f1f1f;border:1px solid #dadce0';
  return (
    <div className="ctl" onClick={onClick} style={s(rowBtn + ';' + style)}>
      {apple ? <AppleIcon /> : <GoogleIcon />}
      <span>{label || (apple ? 'Continue with Apple' : 'Continue with Google')}</span>
    </div>
  );
}

// Biometric unlock. Rendered only when the platform authenticator is available.
export function BiometricButton({ onClick, label = 'Sign in with Face ID' }) {
  return (
    <div className="ctl" onClick={onClick}
      style={s(rowBtn + ';background:var(--accent-dim);color:var(--accent);border:1px solid var(--accent)')}>
      <FaceIcon />
      <span>{label}</span>
    </div>
  );
}

// "or" divider between social and email sign-in.
export function OrDivider({ children = 'or' }) {
  return (
    <div style={s('display:flex;align-items:center;gap:10px;margin:16px 0 4px')}>
      <div style={s('flex:1;height:1px;background:var(--line)')} />
      <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1px')}>{children}</div>
      <div style={s('flex:1;height:1px;background:var(--line)')} />
    </div>
  );
}

// "Stay signed in" checkbox row.
export function RememberRow({ on, onChange }) {
  return (
    <div className="ctl" onClick={() => onChange(!on)} style={s('display:flex;align-items:center;gap:10px;margin-top:16px')}>
      <div style={s('width:20px;height:20px;border-radius:6px;flex:none;display:flex;align-items:center;justify-content:center;transition:all .15s;' + (on ? 'background:var(--accent);border:1px solid var(--accent)' : 'background:var(--bg2);border:1px solid var(--line)'))}>
        {on && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>}
      </div>
      <span style={s('font-size:13px;color:var(--text2);font-weight:600')}>Stay signed in</span>
    </div>
  );
}
