import { useRef, useState } from 'react';
import { s } from '../lib/style.js';
import { Back, Field, TextArea, Chips, FieldLabel, PrimaryBtn } from './wizard.jsx';
import { updateProfile } from '../lib/auth.js';
import Avatar from '../components/Avatar.jsx';
import AvatarEditor from '../components/AvatarEditor.jsx';
import { loadImageFile } from '../lib/avatar.js';

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
  const [photoError, setPhotoError] = useState('');
  const [editing, setEditing] = useState(null); // decoded image being repositioned
  const fileRef = useRef(null);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setPhotoError('');
    try {
      setEditing(await loadImageFile(file)); // open the reposition editor
    } catch (err) {
      setPhotoError(err.message || 'Could not use that image.');
    }
  };

  const closeEditor = () => { editing?.close?.(); setEditing(null); };
  const applyPhoto = async (dataUrl) => {
    closeEditor();
    setPhotoError('');
    try { await actions.setAvatar(dataUrl); }
    catch { setPhotoError('Could not upload your photo. Please try again.'); }
  };
  const removePhoto = async () => {
    setPhotoError('');
    try { await actions.setAvatar(null); }
    catch { setPhotoError('Could not remove your photo. Please try again.'); }
  };

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
        <div className="ctl" onClick={() => fileRef.current?.click()} style={s('position:relative')}>
          <Avatar photo={m.photo} initials={m.initials} color={m.color} size={80} radius={24} fontSize={28} />
          {/* small camera badge */}
          <div style={s('position:absolute;right:-3px;bottom:-3px;width:28px;height:28px;border-radius:50%;background:var(--accent);border:3px solid var(--bg);display:flex;align-items:center;justify-content:center')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={pickPhoto} style={s('display:none')} />
        <div style={s('display:flex;gap:14px;align-items:center;margin-top:10px')}>
          <div className="ctl" onClick={() => fileRef.current?.click()} style={s('font-size:12px;font-weight:600;color:var(--accent)')}>{m.photo ? 'Change photo' : 'Add photo'}</div>
          {m.photo && <div className="ctl" onClick={removePhoto} style={s('font-size:12px;font-weight:600;color:var(--text3)')}>Remove</div>}
        </div>
        {photoError && <div style={s('font-size:11.5px;color:var(--bad);margin-top:8px;text-align:center')}>{photoError}</div>}
      </div>

      <Field label="Full name" value={form.name} onChange={set('name')} placeholder="Your full name" />
      <Field label="Club" value={form.club} onChange={set('club')} placeholder="Your club name" />

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

      {editing && <AvatarEditor img={editing} onCancel={closeEditor} onDone={applyPhoto} />}
    </div>
  );
}
