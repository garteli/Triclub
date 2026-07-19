import { useState } from 'react';
import { s } from '../lib/style.js';
import { StepHeader, Title, Sub, FieldLabel, Field, TextArea, Chips, Switch, PrimaryBtn } from './wizard.jsx';

const DISCIPLINES = ['Cycling', 'Triathlon', 'Swim', 'Run'];
const LEVELS = ['All levels', 'Intermediate+', 'Advanced', 'Race focus'];
const DISC_COLOR = { Cycling: '#ffce4a', Triathlon: '#ff6a2c', Swim: '#37c0ff', Run: '#ff6f61' };

const GroupBike = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0c0e11" strokeWidth="2.2" strokeLinecap="round">
    <circle cx="5.5" cy="17.5" r="3.5" /><circle cx="18.5" cy="17.5" r="3.5" />
    <path d="M15 17.5l-3-6.5H8.5m6.5 0l-2.5 6.5M9.5 6.5h3l2 4.5" />
  </svg>
);

// Create-a-group flow for a coach/manager. Collects club details + pricing and
// "publishes" (local only — no backend), landing on a success screen that links
// into the manager's Join Requests.
export default function CreateGroup({ actions, onCreateSquad }) {
  const [step, setStep] = useState(0);
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '', city: '', disc: ['Cycling'], level: 'All levels', desc: '',
    price: '', dropin: '35', coaching: false, coachPrice: '450',
  });
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const back = () => (step === 0 ? actions.go('welcome') : setStep((n) => n - 1));
  const color = DISC_COLOR[form.disc[0]] || '#ff6a2c';
  const basicsValid = form.name.trim() && form.city.trim() && form.disc.length;

  // Publish: create a real squad when signed in (onCreateSquad wired), else the
  // logged-out prototype just shows the success screen.
  const publish = async () => {
    setError(''); setBusy(true);
    try {
      if (onCreateSquad) {
        await onCreateSquad({
          name: form.name.trim(),
          discipline: form.disc[0],
          location: form.city.trim(),
          level: form.level,
          kind: form.coaching ? 'coach' : (form.price ? 'member' : 'free'),
          price: form.price ? `₪${form.price}` : 'Free',
          perLabel: form.price ? '/mo' : '',
          color,
          description: form.desc,
        });
      }
      setPublished(true);
    } catch (e) {
      setError(e.message || 'Could not publish the group.');
    } finally {
      setBusy(false);
    }
  };

  if (published) {
    return (
      <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
        <div style={s('text-align:center;padding-top:36px')}>
          <div style={s('width:76px;height:76px;border-radius:50%;background:color-mix(in srgb,var(--good) 16%,transparent);display:flex;align-items:center;justify-content:center;margin:0 auto')}>
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="var(--good)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          </div>
          <div style={s('font-size:23px;font-weight:700;letter-spacing:-.4px;margin-top:18px')}>{form.name} is live! 🎉</div>
          <div style={s('font-size:13.5px;color:var(--text2);line-height:1.5;margin-top:8px;max-width:280px;margin-left:auto;margin-right:auto')}>Athletes near {form.city} can now find your group and apply to join. You'll review each application.</div>
          <div style={s('margin-top:28px;text-align:left')}>
            <div className="ctl" onClick={() => actions.go('dash')} style={s('background:var(--accent);color:var(--accent-ink);text-align:center;padding:15px;border-radius:14px;font-weight:700;font-size:15px')}>Go to your squad</div>
            <div className="ctl" onClick={() => actions.go('discover')} style={s('background:var(--bg2);border:1px solid var(--line);color:var(--text);text-align:center;padding:15px;border-radius:14px;font-weight:700;font-size:15px;margin-top:10px')}>See it in Discover</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      <StepHeader step={step} total={3} onBack={back} />

      {step === 0 && (
        <>
          <Title>Register a group</Title>
          <Sub>Set up your club so athletes can find and join it.</Sub>
          <Field label="Group name" value={form.name} onChange={set('name')} placeholder="Kaza Tri Club" />
          <Field label="City / base" value={form.city} onChange={set('city')} placeholder="Tiberias" />
          <FieldLabel>Disciplines</FieldLabel>
          <Chips options={DISCIPLINES} value={form.disc} onChange={set('disc')} multi />
          <FieldLabel>Level</FieldLabel>
          <Chips options={LEVELS} value={form.level} onChange={set('level')} />
          <TextArea label="About the group" value={form.desc} onChange={set('desc')} placeholder="Weekly threshold and long endurance rides, coach-led plans, live group rides…" />
          <PrimaryBtn onClick={() => setStep(1)} disabled={!basicsValid}>Continue</PrimaryBtn>
        </>
      )}

      {step === 1 && (
        <>
          <Title>Membership &amp; services</Title>
          <Sub>Set what you charge. Payments go to the group owner.</Sub>
          <Field label="Membership (₪ / month)" value={form.price} onChange={set('price')} placeholder="90" type="number" mono />
          <Field label="One-time drop-in ride (₪)" value={form.dropin} onChange={set('dropin')} placeholder="35" type="number" mono />
          <div style={s('display:flex;align-items:center;gap:12px;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:13px 14px;margin-top:18px')}>
            <div style={s('flex:1')}><div style={s('font-size:14px;font-weight:700')}>Offer 1:1 coaching</div><div style={s('font-size:11.5px;color:var(--text2)')}>Personalised plans + weekly review</div></div>
            <Switch on={form.coaching} onChange={set('coaching')} />
          </div>
          {form.coaching && <Field label="Coaching (₪ / month)" value={form.coachPrice} onChange={set('coachPrice')} placeholder="450" type="number" mono />}
          <PrimaryBtn onClick={() => setStep(2)}>Review</PrimaryBtn>
        </>
      )}

      {step === 2 && (
        <>
          <Title>Review &amp; publish</Title>
          <Sub>This is how your group appears in Discover.</Sub>
          {/* preview card — mirrors the Discover group row */}
          <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:13px 14px;display:flex;gap:12px;align-items:center;margin-top:16px')}>
            <div style={s(`width:46px;height:46px;border-radius:13px;background:${color};flex:none;display:flex;align-items:center;justify-content:center`)}><GroupBike /></div>
            <div style={s('flex:1;min-width:0')}>
              <div style={s('font-size:14.5px;font-weight:700')}>{form.name || 'Your group'}</div>
              <div style={s('font-size:11.5px;color:var(--text2);margin-top:1px')}>{form.city || 'City'} · new</div>
              <div style={s('display:flex;gap:9px;margin-top:6px;font-size:10.5px;color:var(--text3)')}><span>★ —</span><span>· 1 rider</span><span>· {form.disc.join(', ')}</span></div>
            </div>
            <div style={s('text-align:right;flex:none')}>
              <div style={s('font-size:9.5px;font-weight:700;padding:3px 8px;border-radius:7px;color:var(--accent);background:var(--accent-dim)')}><span className="mono">{form.price ? '₪' + form.price : 'Free'}</span>{form.price ? '/mo' : ''}</div>
              <div style={s('font-size:10px;color:var(--text3);margin-top:6px')}>{form.level}</div>
            </div>
          </div>

          {form.desc && <div style={s('font-size:12.5px;color:var(--text2);line-height:1.5;margin-top:14px')}>{form.desc}</div>}

          <FieldLabel>What athletes can buy</FieldLabel>
          <div style={s('display:flex;flex-direction:column;gap:8px')}>
            {[['Membership', form.price ? '₪' + form.price + '/mo' : 'Free'], ['One-time ride', '₪' + (form.dropin || '35')], ...(form.coaching ? [['1:1 Coaching', '₪' + (form.coachPrice || '450') + '/mo']] : [])].map(([k, v]) => (
              <div key={k} style={s('display:flex;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:11px 13px')}>
                <span style={s('flex:1;font-size:13px;font-weight:600')}>{k}</span>
                <span className="mono" style={s('font-size:13px;font-weight:700;color:var(--accent)')}>{v}</span>
              </div>
            ))}
          </div>
          {error && <div style={s('color:var(--bad);font-size:12.5px;margin-top:12px;text-align:center')}>{error}</div>}
          <PrimaryBtn onClick={busy ? undefined : publish} disabled={busy}>{busy ? 'Publishing…' : 'Publish group'}</PrimaryBtn>
        </>
      )}
    </div>
  );
}
