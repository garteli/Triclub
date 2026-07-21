import { useState } from 'react';
import { s } from '../lib/style.js';
import AuthedImage from './AuthedImage.jsx';
import Avatar from './Avatar.jsx';

// The persistent app header shown on every (non-chromeless) screen via the Phone shell.
// Root tab screens show the club branding; sub-pages get a Back button + the page title
// in the same bar. Right side is always discover / sync / notifications / avatar.
export default function AppHeader({ vm, actions, getToken, notifUnread = 0, title, showBack, rtl, onSync, onSwitchSquad }) {
  const token = getToken?.() ?? null;
  const [syncing, setSyncing] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const clubs = vm.myClubs || [];
  // The club name is a switcher when the athlete belongs to more than one club and we're
  // showing club branding (root screens, not a sub-page title).
  const canSwitch = !showBack && !title && clubs.length > 1 && !!onSwitchSquad;
  const doSync = async () => {
    if (syncing || !onSync) return;
    setSyncing(true);
    try { await onSync(); } finally { setSyncing(false); }
  };

  const IconBtn = ({ onClick, badge, spin, children, label }) => (
    <div className="ctl" onClick={onClick} aria-label={label} style={s('position:relative;width:36px;height:36px;border-radius:11px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;flex:none')}>
      <div style={spin ? { animation: 'spin .8s linear infinite', display: 'flex' } : { display: 'flex' }}>{children}</div>
      {badge && <div style={s('position:absolute;top:7px;right:8px;width:7px;height:7px;border-radius:50%;background:var(--accent);border:1.5px solid var(--bg2)')} />}
    </div>
  );

  return (
    <div style={s(`display:flex;align-items:center;gap:10px;${rtl ? 'flex-direction:row-reverse' : ''}`)}>
      {/* left: back (sub-pages) + club logo + club name / page title */}
      <div style={s(`flex:1;min-width:0;display:flex;align-items:center;gap:9px;${rtl ? 'flex-direction:row-reverse' : ''}`)}>
        {showBack && (
          <div className="ctl" onClick={() => actions.back?.()} aria-label="Back" style={s('width:34px;height:34px;border-radius:10px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;flex:none')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round"><path d={rtl ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} /></svg>
          </div>
        )}
        {vm.squadLogo && <AuthedImage url={vm.squadLogo} token={token} style="width:34px;height:34px;border-radius:10px;flex:none" />}
        <div
          className={canSwitch ? 'ctl' : undefined}
          onClick={canSwitch ? () => setSwitchOpen((o) => !o) : undefined}
          style={s(`position:relative;min-width:0;display:flex;align-items:center;gap:5px;${rtl ? 'flex-direction:row-reverse' : ''}`)}
        >
          <div style={s(`min-width:0;${rtl ? 'text-align:right' : ''}`)}>
            {!showBack && <div style={s('font-size:9.5px;color:var(--text3);text-transform:uppercase;letter-spacing:1.4px;font-weight:600')}>Domestique Team</div>}
            <div style={s('font-size:17px;font-weight:700;letter-spacing:-.4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{title || vm.squadName || 'Your squad'}</div>
          </div>
          {canSwitch && (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2.4" strokeLinecap="round" style={{ flex: 'none', transform: switchOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}><path d="M9 6l6 6-6 6" /></svg>
          )}
          {switchOpen && canSwitch && (
            <>
              <div onClick={(e) => { e.stopPropagation(); setSwitchOpen(false); }} style={s('position:fixed;inset:0;z-index:30')} />
              <div style={s(`position:absolute;top:calc(100% + 10px);${rtl ? 'right:0' : 'left:0'};z-index:31;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:6px;min-width:210px;max-width:280px;box-shadow:0 14px 34px rgba(0,0,0,.42)`)}>
                {clubs.map((c) => (
                  <div key={c.id} className="ctl" onClick={(e) => { e.stopPropagation(); setSwitchOpen(false); if (!c.active) onSwitchSquad(c.id); }}
                    style={s(`display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:10px;${c.active ? 'background:var(--accent-dim)' : ''};${rtl ? 'flex-direction:row-reverse;text-align:right' : ''}`)}>
                    {c.logoUrl
                      ? <AuthedImage url={c.logoUrl} token={token} style="width:26px;height:26px;border-radius:8px;flex:none" />
                      : <div style={s(`width:26px;height:26px;border-radius:8px;flex:none;background:${c.color || 'var(--bg4)'}`)} />}
                    <div style={s('flex:1;min-width:0;font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{c.name}</div>
                    {c.active && <span style={s('font-size:10px;color:var(--accent);font-weight:700;flex:none')}>{rtl ? 'פעיל' : 'Active'}</span>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* right: discover / sync / notifications / avatar */}
      <div style={s(`display:flex;align-items:center;gap:7px;flex:none;${rtl ? 'flex-direction:row-reverse' : ''}`)}>
        <IconBtn onClick={() => actions.go('discover')} label="Discover groups">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></svg>
        </IconBtn>
        {onSync && (
          <IconBtn onClick={doSync} spin={syncing} label="Sync activities">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={syncing ? 'var(--accent)' : 'var(--text2)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.7-3M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.7 3" /><path d="M21 3v6h-6M3 21v-6h6" /></svg>
          </IconBtn>
        )}
        <IconBtn onClick={() => actions.go('notifs')} badge={notifUnread > 0} label="Notifications">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
        </IconBtn>
        <div className="ctl" onClick={() => actions.go('profile')} aria-label="Profile"><Avatar photo={vm.me.photo} initials={vm.me.initials} color={vm.me.color} size={36} radius={11} fontSize={13} /></div>
      </div>
    </div>
  );
}
