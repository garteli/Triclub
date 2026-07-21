import { useEffect, useRef, useState } from 'react';
import { s } from '../lib/style.js';

// Transient status pill for the header sync button. Shows live progress while a sync runs
// (Garmin / Apple Health day counts when available) and a brief result — "Synced N new" /
// "Up to date" / an error — for a few seconds after. `active` is true for the whole combined
// sync (so it also reflects the plain data-refresh on web, where Garmin/Health are absent).
export default function SyncToast({ garmin, health, active }) {
  const [msg, setMsg] = useState(null);
  const wasActive = useRef(false);
  const timer = useRef(null);

  useEffect(() => {
    if (active) {
      wasActive.current = true;
      clearTimeout(timer.current);
      const parts = [];
      if (garmin.status === 'syncing') parts.push(garmin.progress?.total ? `Garmin ${garmin.progress.done}/${garmin.progress.total}` : 'Garmin');
      if (health.status === 'syncing') parts.push(health.progress?.total ? `Health ${health.progress.done}/${health.progress.total}` : 'Health');
      setMsg({ text: parts.length ? `Syncing · ${parts.join(' · ')}` : 'Syncing…', kind: 'busy' });
    } else if (wasActive.current) {
      wasActive.current = false;
      if (garmin.status === 'error' || health.status === 'error') {
        setMsg({ text: garmin.error || health.error || 'Sync failed', kind: 'error' });
      } else {
        const n = (garmin.summary?.queued || 0) + (health.summary?.synced || 0);
        setMsg({ text: n > 0 ? `Synced ${n} new ${n === 1 ? 'activity' : 'activities'}` : 'Up to date', kind: 'ok' });
      }
      timer.current = setTimeout(() => setMsg(null), 3200);
    }
    return undefined;
  }, [active, garmin.status, garmin.progress, garmin.summary, garmin.error, health.status, health.progress, health.summary, health.error]);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!msg) return null;
  const color = msg.kind === 'error' ? 'var(--bad)' : msg.kind === 'ok' ? 'var(--good)' : 'var(--accent)';
  return (
    <div style={s('position:fixed;left:0;right:0;top:calc(max(env(safe-area-inset-top), 10px) + 62px);z-index:40;display:flex;justify-content:center;pointer-events:none;animation:floatUp .2s ease')}>
      <div style={s(`display:flex;align-items:center;gap:8px;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:8px 14px;box-shadow:0 12px 30px -12px rgba(0,0,0,.6);font-size:12px;font-weight:600;color:${color}`)}>
        {msg.kind === 'busy' && <div style={s('width:13px;height:13px;border-radius:50%;border:2px solid var(--line2);border-top-color:var(--accent);animation:spin .7s linear infinite')} />}
        {msg.text}
      </div>
    </div>
  );
}
