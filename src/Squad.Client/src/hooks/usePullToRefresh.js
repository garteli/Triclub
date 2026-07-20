import { useEffect, useRef, useState } from 'react';

// Pull-to-refresh for a scroll container. Engages only when the container is
// already scrolled to the top and the drag is downward, so it never fights a
// normal scroll. `onRefresh` may return a promise — the spinner holds until it
// settles. Works with touch (the real target) and a mouse fallback for desktop.
//
//   const { pull, refreshing, dragging } = usePullToRefresh(scrollRef, onRefresh);
//
// `pull` is the resisted visible travel in px (0..MAX_PULL); render the indicator
// off it. `dragging` is true while a finger is down so the caller can drop the
// snap-back transition and track the finger 1:1.

const RESIST = 0.5;     // drag resistance — finger travels 2× the indicator
const MAX_PULL = 90;    // px the indicator can travel at full stretch
const TRIGGER = 60;     // release past this (visible px) fires a refresh

export function usePullToRefresh(scrollRef, onRefresh, { enabled = true } = {}) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false);
  // Everything the listeners read lives in a ref so we can bind them once and
  // still see the latest values (no stale closures, no rebinding on every pull).
  const R = useRef({ active: false, startY: 0, pull: 0, refreshing: false, onRefresh });
  R.current.onRefresh = onRefresh;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !enabled) return;
    const st = R.current;

    const setP = (v) => { st.pull = v; setPull(v); };
    const yOf = (e) => (e.touches ? e.touches[0]?.clientY : e.clientY) ?? 0;

    const onStart = (e) => {
      // Only arm at the very top; anywhere else this is an ordinary scroll.
      if (el.scrollTop > 0 || st.refreshing) { st.active = false; return; }
      st.active = true;
      st.startY = yOf(e);
      setDragging(true);
    };

    const onMove = (e) => {
      if (!st.active) return;
      const dy = yOf(e) - st.startY;
      if (dy <= 0) { setP(0); return; }        // dragged back up → give it up
      // Now that we've engaged, stop the container scrolling so the pull is smooth.
      if (e.cancelable) e.preventDefault();
      setP(Math.min(dy * RESIST, MAX_PULL));
    };

    const onEnd = async () => {
      if (!st.active) return;
      st.active = false;
      setDragging(false);
      if (st.pull >= TRIGGER && st.onRefresh) {
        st.refreshing = true; setRefreshing(true);
        try { await st.onRefresh(); } catch { /* surfaced elsewhere */ }
        st.refreshing = false; setRefreshing(false);
      }
      setP(0);
    };

    // Mouse fallback (desktop): track move/up on the window so a drag that leaves
    // the element still resolves. Bound only for the duration of a drag.
    const onMouseMove = (e) => onMove(e);
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      onEnd();
    };
    const onMouseDown = (e) => {
      onStart(e);
      if (st.active) {
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    el.addEventListener('mousedown', onMouseDown);

    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [scrollRef, enabled]);

  return { pull, refreshing, dragging };
}
