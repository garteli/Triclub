import { useState } from 'react';
import { s } from '../lib/style.js';
import { Back, Field, TextArea, Chips, FieldLabel, PrimaryBtn } from './wizard.jsx';
import { updateProfile } from '../lib/auth.js';

const SPORTS = ['Triathlon', 'Cycling', 'Running', 'Swimming'];
const LEVELS = ['New to it', 'Intermediate', 'Advanced', 'Racing'];

// Edit your own profile. Seeds from vm.me (the persisted profile); on save writes
// through PUT /api/profile, updates the app's profile state, and returns to Profile.
export default function EditProfile({ vm, actions, getToken, onProfileSaved }) {
  const m = vm.me;
  const [form, setForm] = useState({
    name: m.name, club: m.club, sport: m.sport, level: m.level,
    ftp: String(m.ftp ?? ''), weekly: m.weekly, bio: m.bio,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setError(''); setBusy(true);
    try {
      const ftpNum = form.ftp === '' ? null : Number(form.ftp);
      const updated = await updateProfile(getToken(), {
        name: form.name, club: form.club, primarySport: form.sport, level: form.level,
        ftp: Number.isFinite(ftpNum) ? ftpNum : null, weeklyHours: form.weekly, bio: form.bio,
      });
      onProfileSaved?.(updated);
      actions.setMe({ ...form, ftp: form.ftp }); // instant local reflection
      actions.go('profile');
    } catch (e) {
      setError(e.message || 'Could not save your profile.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      {/* header */}
      <div style={s('display:flex;align-items:center;gap:10px')}>
        <Back onClick={() => actions.go('settings')} />
        <div style={s('font-size:20px;font-weight:700')}>Edit profile</div>
      </div>

      {/* avatar */}
      <div style={s('display:flex;flex-direction:column;align-items:center;margin-top:18px')}>
        <div style={s(`width:80px;height:80px;border-radius:24px;background:${m.color || 'linear-gradient(135deg,#ff6f61,#ffb84d)'};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:28px;color:#fff`)}>{m.initials}</div>
        <div className="ctl" style={s('font-size:12px;font-weight:600;color:var(--accent);margin-top:10px')}>Change photo</div>
      </div>

      <Field label="Full name" value={form.name} onChange={set('name')} placeholder="Dana Levi" />
      <Field label="Club" value={form.club} onChange={set('club')} placeholder="Kaza Tri Club" />

      <FieldLabel>Primary sport</FieldLabel>
      <Chips options={SPORTS} value={form.sport} onChange={set('sport')} />
      <FieldLabel>Experience</FieldLabel>
      <Chips options={LEVELS} value={form.level} onChange={set('level')} />

      <div style={s('display:flex;gap:9px')}>
        <div style={s('flex:1')}><Field label="FTP (W)" value={form.ftp} onChange={set('ftp')} placeholder="271" type="number" mono /></div>
        <div style={s('flex:1')}><Field label="Weekly hours" value={form.weekly} onChange={set('weekly')} placeholder="9.2h" mono /></div>
      </div>

      <TextArea label="Bio" value={form.bio} onChange={set('bio')} placeholder="A line about your training and goals…" />

      {error && <div style={s('color:var(--bad);font-size:12.5px;margin-top:12px;text-align:center')}>{error}</div>}
      <PrimaryBtn onClick={busy ? undefined : save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</PrimaryBtn>
    </div>
  );
}
