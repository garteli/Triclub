import { useState } from 'react';
import { s } from '../lib/style.js';
import { apiUrl } from '../lib/apiBase.js';

// Shown on the logged-out Welcome / Register screens when the app was opened via a coach's
// invite link (?invite=TOKEN). Tells the friend which club they'll join once they sign up —
// the auto-join itself happens in App once a session exists. The club logo is served by a
// public, invite-scoped endpoint (info.logoUrl → /api/invites/{token}/logo), so it renders
// without a session; we fall back to the colour + initial mark if there's no logo / it fails.
export default function InviteBanner({ info }) {
  const [logoBroken, setLogoBroken] = useState(false);
  if (!info) return null;
  const color = info.color || 'var(--accent)';
  const initial = (info.squadName || 'G').slice(0, 1);
  const showLogo = info.logoUrl && !logoBroken;
  return (
    <div style={s('display:flex;align-items:center;gap:12px;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin-bottom:16px')}>
      <div style={s('width:44px;height:44px;border-radius:12px;overflow:hidden;flex:none')}>
        {showLogo ? (
          <img src={apiUrl(info.logoUrl)} alt="" onError={() => setLogoBroken(true)}
            style={s('width:100%;height:100%;object-fit:cover;display:block')} />
        ) : (
          <div style={s(`width:100%;height:100%;background:${color};display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#0c0e11`)}>{initial}</div>
        )}
      </div>
      <div style={s('flex:1;min-width:0')}>
        <div style={s('font-size:10.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px;font-weight:700')}>You're invited to join</div>
        <div style={s('font-size:15px;font-weight:700;letter-spacing:-.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{info.squadName}</div>
        <div style={s('font-size:11.5px;color:var(--text2)')}>{info.discipline}{info.memberCount ? ` · ${info.memberCount} member${info.memberCount === 1 ? '' : 's'}` : ''}</div>
      </div>
    </div>
  );
}
