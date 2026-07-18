import { s } from '../lib/style.js';
import Icon from './Icon.jsx';
import { navDef } from '../data/squadData.js';

export default function BottomNav({ screen, lang, go }) {
  return (
    <div style={s('position:absolute;bottom:0;left:0;right:0;padding:9px 14px 26px;background:linear-gradient(0deg,var(--bg) 62%,transparent);z-index:35')}>
      <div style={s('background:color-mix(in srgb,var(--bg2) 88%, transparent);backdrop-filter:blur(18px);border:1px solid var(--line);border-radius:22px;display:flex;justify-content:space-around;padding:9px 8px;box-shadow:0 8px 24px -10px rgba(0,0,0,.5)')}>
        {navDef.map((n) => {
          const active = screen === n.id;
          return (
            <div
              key={n.id}
              className="nav-btn"
              onClick={() => go(n.id)}
              style={s(`display:flex;flex-direction:column;align-items:center;gap:3px;flex:1;color:${active ? 'var(--accent)' : 'var(--text3)'}`)}
            >
              <Icon markup={n.icon} style={s('width:24px;height:24px')} />
              <span style={s('font-size:9.5px;font-weight:600;letter-spacing:.2px')}>{n.label[lang] || n.label.en}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
