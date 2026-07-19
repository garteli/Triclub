import { useEffect, useState } from 'react';
import { s } from '../lib/style.js';
import { StepHeader, Title, Sub, FieldLabel, Field, Chips, PrimaryBtn } from './wizard.jsx';
import { SocialButton, BiometricButton, OrDivider, RememberRow } from '../components/AuthButtons.jsx';
import {
  registerWithEmail, updateProfile, oauthSignIn, authConfig,
  biometricAvailable, biometricEnrolled, signInWithBiometric,
} from '../lib/auth.js';

const SPORTS = ['Triathlon', 'Cycling', 'Running', 'Swimming'];
const LEVELS = ['New to it', 'Intermediate', 'Advanced', 'Racing'];

// Athlete sign-up. Social (Google/Apple) or email create a real account server-side
// (POST /api/auth/*) and return the app's JWT, which becomes the session. "Stay
// signed in" persists it; enrolled devices can later unlock with Face ID / Touch ID.
export default function Register({ actions }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ name: '', email: '', pass: '', sport: 'Triathlon', level: 'Intermediate', ftp: '', hours: '' });
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

  const back = () => (step === 0 ? actions.go('welcome') : setStep((n) => n - 1));
  const accountValid = form.name.trim() && form.email.trim() && form.pass.length >= 6;

  const social = async (provider) => {
    setError(''); setBusy(true);
    try {
      const session = await oauthSignIn(provider);
      actions.signIn(session, { remember });
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

  // Finish email onboarding: create the account, persist the session, offer
  // biometric enrolment for next time, then show the success step.
  const finish = async () => {
    setError(''); setBusy(true);
    try {
      const session = await registerWithEmail({ name: form.name.trim(), email: form.email.trim(), password: form.pass });
      actions.establishSession(session, { remember });
      // Persist the onboarding fields captured in step 1 (best-effort — don't block success).
      updateProfile(session.token, {
        primarySport: form.sport, level: form.level,
        ftp: form.ftp === '' ? null : Number(form.ftp) || null,
        weeklyHours: form.hours === '' ? null : String(form.hours),
      }).catch(() => {});
      if (remember && (await biometricAvailable())) actions.enrollBiometric(session);
      setStep(2);
    } catch (e) {
      setError(e.message || 'Could not create your account.');
      setStep(0); // send them back to fix the email/password
    } finally {
      setBusy(false);
    }
  };

  const anySocial = providers.google || providers.apple;

  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      {step < 2 && <StepHeader step={step} total={2} onBack={back} />}

      {step === 0 && (
        <>
          <Title>Create your account</Title>
          <Sub>Join your squad and start training together.</Sub>

          {(anySocial || bioReady) && (
            <div style={s('display:flex;flex-direction:column;gap:10px;margin-top:18px')}>
              {providers.google && <SocialButton provider="google" onClick={() => social('google')} />}
              {providers.apple && <SocialButton provider="apple" onClick={() => social('apple')} />}
              {bioReady && <BiometricButton onClick={bioSignIn} />}
            </div>
          )}

          {anySocial ? <OrDivider>or sign up with email</OrDivider> : <div style={s('height:8px')} />}

          <Field label="Full name" value={form.name} onChange={set('name')} placeholder="Dana Levi" />
          <Field label="Email" value={form.email} onChange={set('email')} placeholder="you@email.com" type="email" />
          <Field label="Password" value={form.pass} onChange={set('pass')} placeholder="At least 6 characters" type="password" />
          <RememberRow on={remember} onChange={setRemember} />
          {error && <div style={s('color:var(--bad);font-size:12.5px;margin-top:12px;text-align:center')}>{error}</div>}
          <PrimaryBtn onClick={() => setStep(1)} disabled={!accountValid || busy}>Continue</PrimaryBtn>
          <div style={s('text-align:center;font-size:12.5px;color:var(--text2);margin-top:14px')}>Already have an account? <span className="ctl" onClick={() => actions.go('login')} style={s('color:var(--accent);font-weight:700')}>Log in</span></div>
        </>
      )}

      {step === 1 && (
        <>
          <Title>About you</Title>
          <Sub>We'll tailor plans and squads to your training.</Sub>
          <FieldLabel>Primary sport</FieldLabel>
          <Chips options={SPORTS} value={form.sport} onChange={set('sport')} />
          <FieldLabel>Experience</FieldLabel>
          <Chips options={LEVELS} value={form.level} onChange={set('level')} />
          <FieldLabel>Your numbers · optional</FieldLabel>
          <div style={s('display:flex;gap:9px')}>
            <div style={s('flex:1')}><Field value={form.ftp} onChange={set('ftp')} placeholder="FTP (W)" type="number" mono /></div>
            <div style={s('flex:1')}><Field value={form.hours} onChange={set('hours')} placeholder="Hrs / week" type="number" mono /></div>
          </div>
          {error && <div style={s('color:var(--bad);font-size:12.5px;margin-top:12px;text-align:center')}>{error}</div>}
          <PrimaryBtn onClick={finish} disabled={busy}>{busy ? 'Creating…' : 'Create account'}</PrimaryBtn>
        </>
      )}

      {step === 2 && (
        <div style={s('text-align:center;padding-top:40px;animation:floatUp .35s ease')}>
          <div style={s('width:76px;height:76px;border-radius:50%;background:var(--accent-dim);display:flex;align-items:center;justify-content:center;margin:0 auto')}>
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          </div>
          <div style={s('font-size:23px;font-weight:700;letter-spacing:-.4px;margin-top:18px')}>You're all set{form.name ? ', ' + form.name.split(' ')[0] : ''}!</div>
          <div style={s('font-size:13.5px;color:var(--text2);line-height:1.5;margin-top:8px;max-width:270px;margin-left:auto;margin-right:auto')}>Your {form.sport.toLowerCase()} profile is ready. Find a squad to train with, or jump straight in.</div>
          <div style={s('margin-top:28px;text-align:left')}>
            <div className="ctl" onClick={() => actions.go('discover')} style={s('background:var(--accent);color:var(--accent-ink);text-align:center;padding:15px;border-radius:14px;font-weight:700;font-size:15px')}>Find your squad</div>
            <div className="ctl" onClick={() => actions.go('dash')} style={s('background:var(--bg2);border:1px solid var(--line);color:var(--text);text-align:center;padding:15px;border-radius:14px;font-weight:700;font-size:15px;margin-top:10px')}>Go to Domestique Club</div>
          </div>
        </div>
      )}
    </div>
  );
}
