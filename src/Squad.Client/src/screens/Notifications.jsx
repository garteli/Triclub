import { useState } from 'react';
import { s } from '../lib/style.js';
import { notifications as mockNotifications } from '../data/squadData.js';
import { useNotifications } from '../hooks/useNotifications.js';

// Inline icons keyed by notification kind.
const ICONS = {
  clipboard: '<path d="M9 3h6a1 1 0 0 1 1 1v1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1V4a1 1 0 0 1 1-1z"/><path d="M9 5h6"/>',
  heart: '<path d="M20.8 6.6a5 5 0 0 0-7.1 0L12 8.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 22l8.8-8.3a5 5 0 0 0 0-7.1z"/>',
  chat: '<path d="M21 11.5a8.5 8.5 0 0 1-12 7.7L3 21l1.8-6A8.5 8.5 0 1 1 21 11.5z"/>',
  trophy: '<path d="M8 21h8M12 17v4M6 4h12v5a6 6 0 0 1-12 0V4zM6 6H3v2a3 3 0 0 0 3 3M18 6h3v2a3 3 0 0 1-3 3"/>',
  bike: '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 17.5l-3-6.5H8.5m6.5 0l-2.5 6.5M9.5 6.5h3l2 4.5"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  alert: '<path d="M12 2l9 4v6c0 5-3.8 8.5-9 10-5.2-1.5-9-5-9-10V6l9-4z"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
};

export default function Notifications({ actions, getToken, notif, onSwitchSquad }) {
  // Share the app-level notifications state (so tapping one updates the header bell too);
  // fall back to a local instance if rendered without it. The prototype (signed-out) uses
  // the seed list until the live feed is ready.
  const own = useNotifications({ getToken, enabled: !!getToken && !notif });
  const { items: liveItems, ready, markRead, markAllRead } = notif || own;
  const notifications = ready ? liveItems : mockNotifications;

  const [read, setRead] = useState(() => new Set());
  const markAll = () => { setRead(new Set(notifications.map((n) => n.id))); if (ready) markAllRead?.(); };
  const open = async (n) => {
    setRead((r) => new Set(r).add(n.id));
    if (ready && n.unread) markRead?.(n.id); // persist + clear the bell badge
    // Switch the active group to the one this notification is about, so the app context follows.
    if (n.squadId && onSwitchSquad) { try { await onSwitchSquad(n.squadId); } catch { /* stay put */ } }
    if (n.athlete) actions.openAthlete(n.athlete);
    else if (n.target) actions.go(n.target);
  };
  const isRead = (n) => read.has(n.id) || !n.unread;
  const unread = notifications.filter((n) => !isRead(n)).length;

  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      {/* title + back now live in the global app header; keep the unread/mark-all row */}
      {unread > 0 && (
        <div style={s('display:flex;align-items:center;justify-content:space-between')}>
          <div style={s('font-size:11.5px;color:var(--text2)')}>{unread} new</div>
          <div className="ctl" onClick={markAll} style={s('font-size:12px;font-weight:600;color:var(--accent)')}>Mark all read</div>
        </div>
      )}

      {/* list */}
      <div style={s('display:flex;flex-direction:column;gap:9px;margin-top:12px')}>
        {notifications.length === 0 && (
          <div style={s('font-size:12.5px;color:var(--text3);background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:22px;text-align:center')}>You're all caught up — no notifications yet.</div>
        )}
        {notifications.map((n) => {
          const isUnread = !isRead(n);
          return (
            <div key={n.id} className="ctl" onClick={() => open(n)}
              style={s('display:flex;gap:12px;align-items:center;border-radius:15px;padding:13px 14px;' + (isUnread ? 'background:var(--accent-dim);border:1px solid color-mix(in srgb,var(--accent) 22%,transparent)' : 'background:var(--bg2);border:1px solid var(--line)'))}>
              <div style={s(`width:40px;height:40px;border-radius:12px;flex:none;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,${n.color} 18%,transparent)`)}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={n.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: ICONS[n.icon] }} />
              </div>
              <div style={s('flex:1;min-width:0')}>
                <div style={s('font-size:13px;line-height:1.35')}><span style={s('font-weight:700')}>{n.actor}</span> <span style={s('color:var(--text2)')}>{n.text}</span></div>
                <div style={s('display:flex;align-items:center;gap:7px;margin-top:4px')}>
                  {n.squadName && (
                    <span style={s(`display:inline-flex;align-items:center;gap:4px;font-size:9.5px;font-weight:700;color:${n.color};background:color-mix(in srgb,${n.color} 14%,transparent);padding:2px 7px;border-radius:6px;max-width:60%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis`)}>
                      <span style={s(`width:4px;height:4px;border-radius:50%;background:${n.color};flex:none`)} />{n.squadName}
                    </span>
                  )}
                  <span style={s('font-size:10.5px;color:var(--text3)')}>{n.time}</span>
                </div>
              </div>
              {isUnread && <div style={s('width:8px;height:8px;border-radius:50%;background:var(--accent);flex:none')} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
