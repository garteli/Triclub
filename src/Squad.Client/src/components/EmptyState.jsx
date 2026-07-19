import { s } from '../lib/style.js';

// Small, consistent empty state for screens/sections with no data yet.
export default function EmptyState({ icon = '·', title, sub, pad = '40px 24px' }) {
  return (
    <div style={s(`display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;padding:${pad};color:var(--text3)`)}>
      <div style={s('width:52px;height:52px;border-radius:16px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;font-size:22px;margin-bottom:2px')}>{icon}</div>
      {title && <div style={s('font-size:14px;font-weight:700;color:var(--text2)')}>{title}</div>}
      {sub && <div style={s('font-size:12.5px;color:var(--text3);line-height:1.5;max-width:260px')}>{sub}</div>}
    </div>
  );
}
