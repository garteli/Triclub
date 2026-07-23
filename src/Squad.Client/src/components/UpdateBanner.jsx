import { s } from '../lib/style.js';
import { useAppUpdate } from '../hooks/useAppUpdate.js';

// A quiet "New version available · Refresh" pill shown when a newer build has been deployed while
// this session is open. Tapping reloads (which re-fetches the no-store index.html → the new bundle).
// A reload isn't forced automatically so it can never interrupt a live ride mid-recording.
export default function UpdateBanner() {
  const ready = useAppUpdate();
  if (!ready) return null;
  return (
    <div style={s('position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:9999;display:flex;align-items:center;gap:12px;background:var(--bg2);border:1px solid var(--line2);border-radius:14px;padding:9px 10px 9px 15px;box-shadow:0 14px 34px -12px rgba(0,0,0,.6);animation:floatUp .25s ease;max-width:calc(100% - 32px)')}>
      <span style={s('font-size:12.5px;font-weight:600;color:var(--text);white-space:nowrap')}>New version available</span>
      <div className="ctl" onClick={() => window.location.reload()}
        style={s('flex:none;font-size:12px;font-weight:700;background:var(--accent);color:var(--accent-ink);border-radius:9px;padding:7px 13px')}>Refresh</div>
    </div>
  );
}
