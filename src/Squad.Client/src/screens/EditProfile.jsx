import { useRef, useState } from 'react';
import { s } from '../lib/style.js';
import { Back, Field, TextArea, Chips, FieldLabel, PrimaryBtn } from './wizard.jsx';
import { updateProfile } from '../lib/auth.js';
import Avatar from '../components/Avatar.jsx';
import AvatarEditor from '../components/AvatarEditor.jsx';
import { loadImageFile } from '../lib/avatar.js';
import { disciplinesInFamily } from '../lib/disciplines.js';

// Endurance sports first, then the motorsport disciplines (single-sourced from
// lib/disciplines.js so they stay in step with the club discipline list).
const SPORTS = ['Triathlon', 'Cycling', 'Running', 'Swimming', ...disciplinesInFamily('motorsport')];
const LEVELS = ['New to it', 'Intermediate', 'Advanced', 'Racing'];
const GENDERS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];

// Derive a 5-year age band ("35–39", or "U20" for under-20) from an ISO birth date.
// AgeGroup is no longer edited by hand — it always follows the birth date.
function ageGroupFromBirthDate(iso) {
  if (!iso) return '';
  const b = new Date(iso);
  if (Number.isNaN(b.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age -= 1;
  if (age < 0 || age > 120) return '';
  if (age < 20) return 'U20';
  const lo = Math.floor(age / 5) * 5;
  return `${lo}–${lo + 4}`;
}

// Edit your own profile. Seeds from vm.me (the persisted profile); on save writes
// through PUT /api/profile, updates the app's profile state, and returns to Profile.
export default function EditProfile({ vm, actions, getToken, onProfileSaved }) {
  const m = vm.me;
  const [form, setForm] = useState({
    name: m.name, club: m.club, sport: m.sport, level: m.level,
    ftp: String(m.ftp ?? ''), weekly: m.weekly, bio: m.bio,
    birthDate: m.birthDate || '', gender: m.gender || '', weight: String(m.weight ?? ''),
    emergencyName: m.emergencyName || '', emergencyPhone: m.emergencyPhone || '',
  });
  const ageGroup = ageGroupFromBirthDate(form.birthDate);
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
      const weightNum = form.weight === '' ? null : Number(form.weight);
      const updated = await updateProfile(getToken(), {
        name: form.name, club: form.club, primarySport: form.sport, level: form.level,
        ftp: Number.isFinite(ftpNum) ? ftpNum : null, weeklyHours: form.weekly, bio: form.bio,
        birthDate: form.birthDate || null, gender: form.gender || null,
        weightKg: Number.isFinite(weightNum) ? weightNum : null,
        ageGroup: ageGroup || null, // derived from birthDate, kept in sync server-side
        emergencyName: form.emergencyName, emergencyPhone: form.emergencyPhone,
      });
      onProfileSaved?.(updated);
      actions.setMe({ ...form, ftp: form.ftp, ageGroup }); // instant local reflection
      actions.go('profile');
    } catch (e) {
      setError(e.message || 'Could not save your profile.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      {/* title + back now in the global app header */}
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
        <div style={s('flex:1;min-width:0')}><Field label="Birth date" value={form.birthDate} onChange={set('birthDate')} type="date" mono /></div>
        <div style={s('flex:1;min-width:0')}><Field label="Weight (kg)" value={form.weight} onChange={set('weight')} placeholder="72.5" type="number" mono /></div>
      </div>
      {ageGroup && <div style={s('font-size:11px;color:var(--text3);margin:6px 2px 0')}>Age group · <span className="mono" style={s('color:var(--text2)')}>{ageGroup}</span> (from birth date)</div>}

      <FieldLabel>Gender</FieldLabel>
      <Chips options={GENDERS} value={form.gender} onChange={set('gender')} />

      <div style={s('display:flex;gap:9px')}>
        <div style={s('flex:1')}><Field label="FTP (W)" value={form.ftp} onChange={set('ftp')} placeholder="271" type="number" mono /></div>
        <div style={s('flex:1')}><Field label="Weekly hours" value={form.weekly} onChange={set('weekly')} placeholder="9.2h" mono /></div>
      </div>

      <TextArea label="Bio" value={form.bio} onChange={set('bio')} placeholder="A line about your training and goals…" />

      <FieldLabel>Emergency contact</FieldLabel>
      <div style={s('font-size:11.5px;color:var(--text3);line-height:1.4;margin:-4px 2px 8px')}>Called by fall detection on a live ride if you crash and don’t respond.</div>
      <div style={s('display:flex;gap:9px')}>
        <div style={s('flex:1;min-width:0')}><Field label="Name" value={form.emergencyName} onChange={set('emergencyName')} placeholder="e.g. Alex (partner)" /></div>
        <div style={s('flex:1;min-width:0')}><Field label="Phone" value={form.emergencyPhone} onChange={set('emergencyPhone')} placeholder="+972 5x-xxx-xxxx" type="tel" mono /></div>
      </div>

      {error && <div style={s('color:var(--bad);font-size:12.5px;margin-top:12px;text-align:center')}>{error}</div>}
      <PrimaryBtn onClick={busy ? undefined : save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</PrimaryBtn>

      {editing && <AvatarEditor img={editing} onCancel={closeEditor} onDone={applyPhoto} />}
    </div>
  );
}
