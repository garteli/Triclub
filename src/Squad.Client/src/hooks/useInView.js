import { useEffect, useRef, useState } from 'react';

// Returns [ref, inView]: attach ref to an element and inView flips true once it scrolls
// within rootMargin of the viewport. `once` (default) stops observing after the first hit,
// so callers can lazily mount expensive content (maps, media) and keep it mounted.
export function useInView({ rootMargin = '0px', once = true } = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || (once && inView)) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setInView(true);
        if (once) io.disconnect();
      }
    }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin, once, inView]);
  return [ref, inView];
}
