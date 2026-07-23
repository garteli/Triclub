import { useRef } from 'react';
import { s } from '../lib/style.js';
import BottomNav from './BottomNav.jsx';

// Logged-out / full-screen flows render without the bottom tab bar.
const CHROMELESS = new Set(['welcome', 'register', 'login', 'newgroup']);

// The app viewport. `.phone` (see theme.css) carries the design tokens and fills
// the screen (full-width on phones, a centered column on desktop). The real device
// draws its own status bar, so we only reserve safe-area space at the top.
export default function Phone({ theme, accent, lang, dir, screen, go, recording, header, family, isCoach, children }) {
  const hideNav = CHROMELESS.has(screen);
  const scrollRef = useRef(null);

  return (
    <div className="phone" data-theme={theme} data-accent={accent} data-lang={lang} dir={dir}>
      <div
        ref={scrollRef}
        className="scr"
        // overscroll-behavior-y:none disables the browser's native pull-to-refresh and
        // rubber-band bounce at the top of the page (the app's own pull-to-refresh — which
        // used to suppress these via a non-passive touchmove preventDefault — is gone).
        style={s('position:absolute;top:0;left:0;right:0;bottom:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior-y:none')}
      >
        {/* Persistent global header — sticks to the top of the scroll port so it stays visible
            on every migrated screen. It carries its own safe-area top padding. */}
        {header && <div className="appheader">{header}</div>}
        <div style={s('position:relative')}>
          {/* When the global header is present it provides the top inset; otherwise reserve it. */}
          {!header && <div style={s('height:max(env(safe-area-inset-top), 12px)')} />}
          {children}
        </div>
      </div>

      {!hideNav && <BottomNav screen={screen} lang={lang} go={go} recording={recording} family={family} isCoach={isCoach} />}
    </div>
  );
}
