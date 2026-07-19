import { s } from '../lib/style.js';
import StatusBar from './StatusBar.jsx';
import BottomNav from './BottomNav.jsx';

// Logged-out / full-screen flows render without the bottom tab bar.
const CHROMELESS = new Set(['welcome', 'register', 'newgroup']);

export default function Phone({ theme, accent, lang, dir, screen, go, children }) {
  const hideNav = CHROMELESS.has(screen);
  return (
    <div
      className="phone"
      data-theme={theme}
      data-accent={accent}
      data-lang={lang}
      dir={dir}
      style={s('width:392px;flex:none;height:848px;border-radius:46px;background:var(--bg);border:1px solid var(--line2);box-shadow:var(--shadow), 0 0 0 11px #16181d, 0 0 0 12px #2a2e36;position:relative;overflow:hidden;color:var(--text)')}
    >
      <StatusBar />

      <div className="scr" style={s('position:absolute;top:0;left:0;right:0;bottom:0;overflow-y:auto;overflow-x:hidden')}>
        <div style={s('height:46px')} />
        {children}
      </div>

      {!hideNav && <BottomNav screen={screen} lang={lang} go={go} />}
    </div>
  );
}
