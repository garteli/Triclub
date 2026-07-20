import { useCallback, useEffect, useRef, useState } from 'react';

// A shared playhead over `count` frames for the activity replay. Position is a fraction
// 0..1; `index` is the frame that fraction lands on. Auto-advance compresses the whole
// activity into ~playSeconds of wall-clock (so a 4-hour ride and a 20-minute run both
// replay in a watchable sweep), scaled by `speed`. Callers drive the map marker + chart
// cursors off `index`, and seek by dragging the scrubber / a chart / the map.
export function usePlayback(count, { playSeconds = 22 } = {}) {
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const posRef = useRef(0);
  posRef.current = pos;

  useEffect(() => {
    if (!playing || count < 2) return undefined;
    let raf = 0;
    let last = 0;
    const tick = (now) => {
      if (!last) last = now;
      const dt = (now - last) / 1000;
      last = now;
      let next = posRef.current + (dt / playSeconds) * speed;
      if (next >= 1) { posRef.current = 1; setPos(1); setPlaying(false); return; }
      posRef.current = next;
      setPos(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, count, playSeconds]);

  const seek = useCallback((p) => {
    const c = Math.max(0, Math.min(1, p));
    posRef.current = c;
    setPos(c);
  }, []);

  const toggle = useCallback(() => {
    setPlaying((p) => {
      if (!p && posRef.current >= 1) { posRef.current = 0; setPos(0); } // replay from the top
      return !p;
    });
  }, []);

  const pause = useCallback(() => setPlaying(false), []);

  const index = count < 2 ? 0 : Math.round(pos * (count - 1));
  return { pos, index, playing, speed, setSpeed, seek, toggle, pause };
}
