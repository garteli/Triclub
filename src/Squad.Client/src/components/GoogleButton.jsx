import { useEffect, useRef } from 'react';
import { s } from '../lib/style.js';
import { renderGoogleButton } from '../lib/oauth.js';

// Google's official Sign In button (web). Renders the real GSI button — reliable on mobile
// browsers where One Tap is suppressed. onCredential gets the id_token; onError gets a message.
export default function GoogleButton({ clientId, onCredential, onError }) {
  const ref = useRef(null);
  useEffect(() => {
    let cancelled = false;
    if (clientId && ref.current) {
      renderGoogleButton(clientId, ref.current,
        (c) => { if (!cancelled) onCredential(c); },
        (e) => { if (!cancelled) onError?.(e?.message || 'Google sign-in failed.'); });
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);
  return <div ref={ref} style={s('display:flex;justify-content:center;min-height:44px')} />;
}
