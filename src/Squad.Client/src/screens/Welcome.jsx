import { useEffect, useState } from 'react';
import { s } from '../lib/style.js';
import { SocialButton, BiometricButton } from '../components/AuthButtons.jsx';
import Logo from '../components/Logo.jsx';
import SportIcon from '../components/SportIcon.jsx';
import InviteBanner from '../components/InviteBanner.jsx';
import GoogleButton from '../components/GoogleButton.jsx';
import { isInAppBrowser, isNativePlatform } from '../lib/platform.js';
import {
  oauthSignIn, authConfig, exchangeGoogleCredential,
  biometricAvailable, biometricEnrolled, signInWithBiometric,
} from '../lib/auth.js';

// Logged-out landing. Google/Apple OAuth or biometric quick-unlock sign the
// athlete straight in; "Create account" opens the sign-up wizard.
export default function Welcome({ actions, inviteInfo }) {
  const [bioReady, setBioReady] = useState(false);
  const [providers, setProviders] = useState({ google: false, apple: false });
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const inApp = isInAppBrowser();
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { /* clipboard blocked — the user can copy from the address bar */ }
  };

  useEffect(() => {
    let alive = true;
    biometricAvailable().then((ok) => alive && setBioReady(ok && biometricEnrolled()));
    authConfig().then((cfg) => alive && setProviders({ google: cfg?.google || null, apple: cfg?.apple || null }));
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
  // Credential from the rendered Google button (web) → exchange for a session.
  const onGoogleCredential = async (credential) => {
    setError('');
    try { actions.signIn(await exchangeGoogleCredential(credential), { remember: true }); }
    catch (e) { setError(e.message || 'Google sign-in failed.'); }
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
        <div style={s('font-size:14px;color:var(--text2);line-height:1.5;margin-top:8px;max-width:270px')}>Train together. Ride together. Your team's multi-sport &amp; motorsport season, in one app.</div>

        <div style={s('display:flex;gap:15px;margin-top:26px;flex-wrap:wrap;justify-content:center;max-width:320px')}>
          {[['swim', 'Swim', 'var(--swim)'], ['bike', 'Bike', 'var(--bike)'], ['run', 'Run', 'var(--run)'],
            ['mx', 'MX', '#c68bff'], ['moto', 'Moto', '#5a86ff'], ['enduro', 'Enduro', '#4ade80']].map(([key, l, c]) => (
            <div key={l} style={s('text-align:center;width:44px')}>
              <div style={s('display:flex;justify-content:center;height:28px;align-items:center')}><SportIcon name={key} size={26} color={c} /></div>
              <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-top:6px')}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* actions */}
      <div style={s('flex:none')}>
        <InviteBanner info={inviteInfo} />
        {/* In-app browsers (WhatsApp, Instagram, …) block Google/Apple sign-in — tell the user up
            front to open in a real browser, and offer to copy the link. */}
        {inApp && (
          <div style={s('background:color-mix(in srgb,var(--warn) 12%,var(--bg2));border:1px solid color-mix(in srgb,var(--warn) 35%,transparent);border-radius:14px;padding:12px 14px;margin-bottom:12px')}>
            <div style={s('font-size:12.5px;color:var(--text);font-weight:700;margin-bottom:3px')}>Open in your browser to sign in</div>
            <div style={s('font-size:11.5px;color:var(--text2);line-height:1.45')}>Google and Apple sign-in don’t work inside this in-app browser. Tap the ••• (or share) menu and choose <b style={s('color:var(--text)')}>Open in Safari / Chrome</b>.</div>
            <div className="ctl" onClick={copyLink} style={s('display:inline-block;margin-top:9px;font-size:11.5px;font-weight:700;color:var(--accent);background:var(--accent-dim);border-radius:9px;padding:6px 11px')}>{copied ? '✓ Link copied' : 'Copy link'}</div>
          </div>
        )}
        {bioReady && (
          <div style={s('margin-bottom:10px')}>
            <BiometricButton onClick={bioSignIn} label="Unlock with Face ID" />
          </div>
        )}
        {/* Google / Apple are the ONLY way in — the same buttons create a new account or sign a
            returning athlete straight in (the server's External endpoint creates-or-signs-in). */}
        {anySocial ? (
          <div style={s('display:flex;flex-direction:column;gap:10px')}>
            {providers.google && (isNativePlatform()
              ? <SocialButton provider="google" onClick={() => social('google')} />
              : <GoogleButton clientId={providers.google.clientId} onCredential={onGoogleCredential} onError={setError} />)}
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
