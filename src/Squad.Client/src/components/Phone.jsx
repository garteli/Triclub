import { useRef } from 'react';
import { s, sx } from '../lib/style.js';
import BottomNav from './BottomNav.jsx';
import { usePullToRefresh } from '../hooks/usePullToRefresh.js';

// Logged-out / full-screen flows render without the bottom tab bar.
const CHROMELESS = new Set(['welcome', 'register', 'login', 'newgroup']);
// The live-ride map owns its own gestures, and the chat is a fixed-height pane that
// scrolls its own thread — no page-level pull-to-refresh on either. The plan library is
// static template data (nothing to refresh) and has its own scroll + preview sheet, so
// pulling to scroll shouldn't be mistaken for a refresh.
const NO_PULL = new Set([...CHROMELESS, 'ride', 'chat', 'planlibrary']);
const REST = 46;        // where the spinner rests while a refresh is in flight
const TRIGGER_UI = 60;  // fade the indicator in over the first ~60px of pull (matches the hook trigger)

// The app viewport. `.phone` (see theme.css) carries the design tokens and fills
// the screen (full-width on phones, a centered column on desktop). The real device
// draws its own status bar, so we only reserve safe-area space at the top.
export default function Phone({ theme, accent, lang, dir, screen, go, onRefresh, recording, header, children }) {
  const hideNav = CHROMELESS.has(screen);
  const scrollRef = useRef(null);
  const canPull = typeof onRefresh === 'function' && !NO_PULL.has(screen);
  const { pull, refreshing, dragging } = usePullToRefresh(scrollRef, onRefresh, { enabled: canPull });

  const offset = refreshing ? REST : pull;
  // Keep the wrapper fully inert (transform:none) unless a pull is actually in
  // progress — a non-none transform establishes a containing block that would
  // re-anchor position:fixed descendants (e.g. the AvatarEditor overlay).
  const shift = offset > 0 ? `transform:translateY(${offset}px)` : 'transform:none';
  // 1:1 with the finger while dragging; snap/settle with a transition on release.
  const glide = dragging ? 'transition:none' : 'transition:transform .22s ease';

  return (
    <div className="phone" data-theme={theme} data-accent={accent} data-lang={lang} dir={dir}>
      <div
        ref={scrollRef}
        className="scr"
        style={s('position:absolute;top:0;left:0;right:0;bottom:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior-y:contain')}
      >
        {/* Persistent global header — sticks to the top of the scroll port so it stays visible
            on every migrated screen. It carries its own safe-area top padding. */}
        {header && <div className="appheader">{header}</div>}
        <div style={sx('position:relative', shift, glide)}>
          {canPull && (
            <div style={s('position:absolute;top:-34px;left:0;right:0;display:flex;justify-content:center;pointer-events:none')}>
              <div
                style={sx(
                  'width:26px;height:26px;border-radius:50%;border:2.5px solid var(--line2);border-top-color:var(--accent)',
                  {
                    opacity: refreshing ? 1 : Math.min(1, pull / TRIGGER_UI),
                    animation: refreshing ? 'spin .7s linear infinite' : 'none',
                    transform: refreshing ? 'none' : `rotate(${Math.min(pull * 4, 320)}deg)`,
                  },
                )}
              />
            </div>
          )}
          {/* When the global header is present it provides the top inset; otherwise reserve it. */}
          {!header && <div style={s('height:max(env(safe-area-inset-top), 12px)')} />}
          {children}
        </div>
      </div>

      {!hideNav && <BottomNav screen={screen} lang={lang} go={go} recording={recording} />}
    </div>
  );
}
