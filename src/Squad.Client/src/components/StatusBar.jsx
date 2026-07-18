import { s } from '../lib/style.js';

export default function StatusBar() {
  return (
    <div style={s('position:absolute;top:0;left:0;right:0;height:46px;display:flex;align-items:center;justify-content:space-between;padding:0 26px;z-index:40;font-size:13px;font-weight:600;color:var(--text)')}>
      <span className="mono">9:41</span>
      <div style={s('position:absolute;left:50%;top:9px;transform:translateX(-50%);width:104px;height:26px;background:#000;border-radius:16px')} />
      <div style={s('display:flex;align-items:center;gap:6px')}>
        {/* signal */}
        <svg width="17" height="11" viewBox="0 0 17 11" fill="none">
          <rect x="0" y="2" width="3" height="9" rx="1" fill="currentColor" />
          <rect x="4.5" y="0" width="3" height="11" rx="1" fill="currentColor" />
          <rect x="9" y="4" width="3" height="7" rx="1" fill="currentColor" opacity=".4" />
        </svg>
        {/* battery */}
        <svg width="24" height="12" viewBox="0 0 24 12" fill="none">
          <rect x="1" y="1" width="20" height="10" rx="3" stroke="currentColor" opacity=".5" />
          <rect x="2.5" y="2.5" width="15" height="7" rx="1.5" fill="var(--accent)" />
          <rect x="22" y="4" width="1.6" height="4" rx="1" fill="currentColor" opacity=".5" />
        </svg>
      </div>
    </div>
  );
}
