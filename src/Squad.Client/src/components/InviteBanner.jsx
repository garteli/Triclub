import { s } from '../lib/style.js';

// Shown on the logged-out Welcome / Register screens when the app was opened via a coach's
// invite link (?invite=TOKEN). Tells the friend which club they'll join once they sign up —
// the auto-join itself happens in App once a session exists. (The club logo lives behind an
// authed proxy the logged-out invitee can't read, so we show the colour + initial mark.)
export default function InviteBanner({ info }) {
  if (!info) return null;
  const color = info.color || 'var(--accent)';
  const initial = (info.squadName || 'G').slice(0, 1);
  return (
    <div style={s('display:flex;align-items:center;gap:12px;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin-bottom:16px')}>
      <div style={s(`width:44px;height:44px;border-radius:12px;flex:none;background:${color};display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#0c0e11`)}>{initial}</div>
      <div style={s('flex:1;min-width:0')}>
        <div style={s('font-size:10.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px;font-weight:700')}>You're invited to join</div>
        <div style={s('font-size:15px;font-weight:700;letter-spacing:-.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{info.squadName}</div>
        <div style={s('font-size:11.5px;color:var(--text2)')}>{info.discipline}{info.memberCount ? ` · ${info.memberCount} member${info.memberCount === 1 ? '' : 's'}` : ''}</div>
      </div>
    </div>
  );
}
