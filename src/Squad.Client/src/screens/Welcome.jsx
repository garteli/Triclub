import { useEffect, useState } from 'react';
import { s } from '../lib/style.js';
import { SocialButton, BiometricButton } from '../components/AuthButtons.jsx';
import Logo from '../components/Logo.jsx';
import SportIcon from '../components/SportIcon.jsx';
import InviteBanner from '../components/InviteBanner.jsx';
import {
  oauthSignIn, authConfig,
  biometricAvailable, biometricEnrolled, signInWithBiometric,
} from '../lib/auth.js';

// Logged-out landing. Google/Apple OAuth or biometric quick-unlock sign the
// athlete straight in; "Create account" opens the sign-up wizard.
export default function Welcome({ actions, inviteInfo }) {
  const [bioReady, setBioReady] = useState(false);
  const [providers, setProviders] = useState({ google: false, apple: false });
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    biometricAvailable().then((ok) => alive && setBioReady(ok && biometricEnrolled()));
    authConfig().then((cfg) => alive && setProviders({ google: !!cfg?.google, apple: !!cfg?.apple }));
    return () => { alive = false; };
  }, []);

  const social = async (provider) => {
    setError('');
    try {
      actions.signIn(await oauthSignIn(provider), { remember: true });
    } catch (e) {
      setError(e.message || `${provider} sign-in failed.`);
    }
  };
  const bioSignIn = async () => {
    setError('');
    const session = await signInWithBiometric();
    if (session) actions.signIn(session, { remember: true });
    else setError('Biometric sign-in was cancelled.');
  };

  const anySocial = providers.google || providers.apple;

  return (
    <div style={s('padding:0 22px calc(20px + env(safe-area-inset-bottom, 0px));min-height:calc(100dvh - env(safe-area-inset-top, 0px) - 12px);display:flex;flex-direction:column;animation:floatUp .35s ease')}>
      {/* hero */}
      <div style={s('flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center')}>
        <Logo size={78} />
        <div style={s('font-size:30px;font-weight:700;letter-spacing:-.6px;margin-top:22px')}>Domestique<span style={s('color:var(--accent)')}> Team</span></div>
        <div style={s('font-size:14px;color:var(--text2);line-height:1.5;margin-top:8px;max-width:250px')}>Train together. Ride together. Your team's triathlon season, in one app.</div>

        <div style={s('display:flex;gap:22px;margin-top:26px')}>
          {[['swim', 'Swim', 'var(--swim)'], ['bike', 'Bike', 'var(--bike)'], ['run', 'Run', 'var(--run)']].map(([key, l, c]) => (
            <div key={l} style={s('text-align:center')}>
              <div style={s('display:flex;justify-content:center;height:28px;align-items:center')}><SportIcon name={key} size={26} color={c} /></div>
              <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-top:6px')}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* actions */}
      <div style={s('flex:none')}>
        <InviteBanner info={inviteInfo} />
        {bioReady && (
          <div style={s('margin-bottom:10px')}>
            <BiometricButton onClick={bioSignIn} label="Unlock with Face ID" />
          </div>
        )}
        {/* Google / Apple are the ONLY way in — the same buttons create a new account or sign a
            returning athlete straight in (the server's External endpoint creates-or-signs-in). */}
        {anySocial ? (
          <div style={s('display:flex;flex-direction:column;gap:10px')}>
            {providers.google && <SocialButton provider="google" onClick={() => social('google')} />}
            {providers.apple && <SocialButton provider="apple" onClick={() => social('apple')} />}
          </div>
        ) : (
          <div style={s('text-align:center;font-size:13px;color:var(--text2);padding:10px 0')}>
            Sign-in is temporarily unavailable. Please try again shortly.
          </div>
        )}

        {error && <div style={s('color:var(--bad);font-size:12.5px;margin-top:12px;text-align:center')}>{error}</div>}

        <div style={s('text-align:center;font-size:12.5px;color:var(--text2);margin-top:16px')}>New or returning — continue with Google or Apple.</div>
        <div style={s('text-align:center;font-size:10.5px;color:var(--text3);margin-top:14px;line-height:1.5')}>By continuing you agree to Domestique Team's Terms &amp; Privacy Policy.</div>
      </div>
    </div>
  );
}
