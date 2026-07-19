import { useEffect, useState } from 'react';
import { s } from '../lib/style.js';
import { Back, Title, Sub, Field, PrimaryBtn } from './wizard.jsx';
import { SocialButton, BiometricButton, OrDivider, RememberRow } from '../components/AuthButtons.jsx';
import {
  loginWithEmail, oauthSignIn, authConfig,
  biometricAvailable, biometricEnrolled, signInWithBiometric,
} from '../lib/auth.js';

// Returning-athlete sign-in: email/password, Google/Apple, or biometric unlock.
// All paths converge on a real JWT session (actions.signIn).
export default function Login({ actions }) {
  const [form, setForm] = useState({ email: '', pass: '' });
  const [remember, setRemember] = useState(true);
  const [bioReady, setBioReady] = useState(false);
  const [providers, setProviders] = useState({ google: false, apple: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    let alive = true;
    biometricAvailable().then((ok) => alive && setBioReady(ok && biometricEnrolled()));
    authConfig().then((cfg) => alive && setProviders({ google: !!cfg?.google, apple: !!cfg?.apple }));
    return () => { alive = false; };
  }, []);

  const valid = form.email.trim() && form.pass.length >= 1;

  const login = async () => {
    setError(''); setBusy(true);
    try {
      const session = await loginWithEmail({ email: form.email.trim(), password: form.pass });
      actions.signIn(session, { remember });
    } catch (e) {
      setError(e.message || 'Incorrect email or password.');
    } finally {
      setBusy(false);
    }
  };

  const social = async (provider) => {
    setError(''); setBusy(true);
    try {
      actions.signIn(await oauthSignIn(provider), { remember });
    } catch (e) {
      setError(e.message || `${provider} sign-in failed.`);
    } finally {
      setBusy(false);
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
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      <div style={s('display:flex;align-items:center;gap:12px')}>
        <Back onClick={() => actions.go('welcome')} />
      </div>

      <Title>Welcome back</Title>
      <Sub>Sign in to rejoin your squad.</Sub>

      {(anySocial || bioReady) && (
        <div style={s('display:flex;flex-direction:column;gap:10px;margin-top:18px')}>
          {providers.google && <SocialButton provider="google" onClick={() => social('google')} label="Sign in with Google" />}
          {providers.apple && <SocialButton provider="apple" onClick={() => social('apple')} label="Sign in with Apple" />}
          {bioReady && <BiometricButton onClick={bioSignIn} />}
        </div>
      )}

      {anySocial ? <OrDivider>or with email</OrDivider> : <div style={s('height:8px')} />}

      <Field label="Email" value={form.email} onChange={set('email')} placeholder="you@email.com" type="email" />
      <Field label="Password" value={form.pass} onChange={set('pass')} placeholder="Your password" type="password" />
      <RememberRow on={remember} onChange={setRemember} />
      {error && <div style={s('color:var(--bad);font-size:12.5px;margin-top:12px;text-align:center')}>{error}</div>}
      <PrimaryBtn onClick={login} disabled={!valid || busy}>{busy ? 'Signing in…' : 'Log in'}</PrimaryBtn>
      <div style={s('text-align:center;font-size:12.5px;color:var(--text2);margin-top:14px')}>New here? <span className="ctl" onClick={() => actions.go('register')} style={s('color:var(--accent);font-weight:700')}>Create an account</span></div>
    </div>
  );
}
