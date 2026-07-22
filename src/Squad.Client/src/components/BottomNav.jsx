import { s } from '../lib/style.js';
import Icon from './Icon.jsx';
import { navFor } from '../data/squadData.js';

export default function BottomNav({ screen, lang, go, recording, family }) {
  return (
    <div style={s('position:absolute;bottom:0;left:0;right:0;padding:9px 14px 26px;background:linear-gradient(0deg,var(--bg) 62%,transparent);z-index:35')}>
      <div style={s('background:color-mix(in srgb,var(--bg2) 88%, transparent);backdrop-filter:blur(18px);border:1px solid var(--line);border-radius:22px;display:flex;justify-content:space-around;padding:9px 8px;box-shadow:0 8px 24px -10px rgba(0,0,0,.5)')}>
        {navFor(family).map((n) => {
          const active = screen === n.id;
          // A live recording flashes the Live tab (red) from wherever you are, with a
          // pulsing record dot on the icon — so a backgrounded recording stays visible.
          const rec = recording && n.id === 'ride';
          const color = rec ? 'var(--bad)' : active ? 'var(--accent)' : 'var(--text3)';
          return (
            <div
              key={n.id}
              className={'nav-btn' + (rec ? ' nav-rec' : '')}
              onClick={() => go(n.id)}
              style={s(`display:flex;flex-direction:column;align-items:center;gap:3px;flex:1;color:${color}`)}
            >
              <div style={s('position:relative;width:24px;height:24px')}>
                <Icon markup={n.icon} style={s('width:24px;height:24px')} />
                {rec && <span style={s('position:absolute;top:-3px;right:-4px;width:9px;height:9px;border-radius:50%;background:var(--bad);border:1.5px solid var(--bg2);animation:pulseDot 1.1s infinite')} />}
              </div>
              <span style={s('font-size:9.5px;font-weight:600;letter-spacing:.2px')}>{rec ? 'REC' : (n.label[lang] || n.label.en)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
