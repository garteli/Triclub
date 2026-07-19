import { useEffect, useState } from 'react';
import { s } from '../lib/style.js';
import { SocialButton, BiometricButton, OrDivider } from '../components/AuthButtons.jsx';
import {
  oauthSignIn, authConfig,
  biometricAvailable, biometricEnrolled, signInWithBiometric,
} from '../lib/auth.js';

// Logged-out landing. Google/Apple OAuth or biometric quick-unlock sign the
// athlete straight in; "Create account" opens the sign-up wizard.
export default function Welcome({ actions }) {
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
    <div style={s('padding:0 22px 40px;height:100%;display:flex;flex-direction:column;animation:floatUp .35s ease')}>
      {/* hero */}
      <div style={s('flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center')}>
        <div style={s('width:74px;height:74px;border-radius:22px;background:var(--accent);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:36px;color:var(--accent-ink);box-shadow:0 18px 40px -14px var(--accent)')}>D</div>
        <div style={s('font-size:30px;font-weight:700;letter-spacing:-.6px;margin-top:22px')}>Domestique Club</div>
        <div style={s('font-size:14px;color:var(--text2);line-height:1.5;margin-top:8px;max-width:250px')}>Train together. Ride together. Your team's triathlon season, in one app.</div>

        <div style={s('display:flex;gap:20px;margin-top:26px')}>
          {[['🏊', 'Swim'], ['🚴', 'Bike'], ['🏃', 'Run']].map(([e, l]) => (
            <div key={l} style={s('text-align:center')}>
              <div style={s('font-size:24px')}>{e}</div>
              <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-top:4px')}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* actions */}
      <div style={s('flex:none')}>
        {bioReady && (
          <div style={s('margin-bottom:10px')}>
            <BiometricButton onClick={bioSignIn} label="Unlock with Face ID" />
          </div>
        )}
        {anySocial && (
          <>
            <div style={s('display:flex;flex-direction:column;gap:10px')}>
              {providers.google && <SocialButton provider="google" onClick={() => social('google')} />}
              {providers.apple && <SocialButton provider="apple" onClick={() => social('apple')} />}
            </div>
            <OrDivider />
          </>
        )}

        {error && <div style={s('color:var(--bad);font-size:12.5px;margin-bottom:12px;text-align:center')}>{error}</div>}

        <div className="ctl" onClick={() => actions.go('register')} style={s('background:var(--accent);color:var(--accent-ink);text-align:center;padding:15px;border-radius:14px;font-weight:700;font-size:15px')}>Create account</div>
        <div className="ctl" onClick={() => actions.go('newgroup')} style={s('background:var(--bg2);border:1px solid var(--line);color:var(--text);text-align:center;padding:15px;border-radius:14px;font-weight:700;font-size:15px;margin-top:10px')}>Register a group</div>
        <div style={s('text-align:center;font-size:13px;color:var(--text2);margin-top:16px')}>Already have an account? <span className="ctl" onClick={() => actions.go('login')} style={s('color:var(--accent);font-weight:700')}>Log in</span></div>
        <div style={s('text-align:center;font-size:10.5px;color:var(--text3);margin-top:14px;line-height:1.5')}>By continuing you agree to Domestique Club's Terms &amp; Privacy Policy.</div>
      </div>
    </div>
  );
}
