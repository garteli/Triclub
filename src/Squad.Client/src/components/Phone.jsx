import { s } from '../lib/style.js';
import BottomNav from './BottomNav.jsx';

// Logged-out / full-screen flows render without the bottom tab bar.
const CHROMELESS = new Set(['welcome', 'register', 'login', 'newgroup']);

// The app viewport. `.phone` (see theme.css) carries the design tokens and fills
// the screen (full-width on phones, a centered column on desktop). The real device
// draws its own status bar, so we only reserve safe-area space at the top.
export default function Phone({ theme, accent, lang, dir, screen, go, children }) {
  const hideNav = CHROMELESS.has(screen);
  return (
    <div className="phone" data-theme={theme} data-accent={accent} data-lang={lang} dir={dir}>
      <div className="scr" style={s('position:absolute;top:0;left:0;right:0;bottom:0;overflow-y:auto;overflow-x:hidden')}>
        <div style={s('height:max(env(safe-area-inset-top), 12px)')} />
        {children}
      </div>

      {!hideNav && <BottomNav screen={screen} lang={lang} go={go} />}
    </div>
  );
}
