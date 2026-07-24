import { useEffect, useState } from 'react';
import { s } from '../lib/style.js';
import { Header, SectionLabel, Card, ChoiceRow, ToggleRow, LinkRow } from '../components/SettingsUI.jsx';
import { useConfirm } from '../components/ConfirmModal.jsx';
import { updateProfile } from '../lib/auth.js';

const VISIBILITY = [
  { id: 'public', label: 'Everyone' },
  { id: 'squad', label: 'My team' },
  { id: 'private', label: 'Only me' },
];

// Profile fields the athlete can hide from OTHER athletes (server-enforced; keys match
// AthleteEndpoints). Stored as a CSV on the profile (profile.hiddenFields).
const HIDEABLE = [
  { key: 'ftp', label: 'FTP / power' },
  { key: 'hours', label: 'Weekly hours' },
  { key: 'weight', label: 'Weight' },
  { key: 'age', label: 'Age & age-group' },
];

export default function Privacy({ state, actions, profile, getToken, onProfileSaved }) {
  const p = state.privacy || {};
  const confirm = useConfirm();
  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      <Header title="Privacy" onBack={() => actions.go('settings')}
        sub="Control who sees your profile and activities, and what data is shared." />

      <SectionLabel>Visibility</SectionLabel>
      <Card>
        <ChoiceRow label="Profile" options={VISIBILITY} value={p.profile || 'squad'}
          onChange={(v) => actions.setPrivacy('profile', v)} />
        <ChoiceRow label="Activity maps" options={VISIBILITY} value={p.activityMap || 'squad'}
          onChange={(v) => actions.setPrivacy('activityMap', v)}
          hint="Who can see the route maps on your recorded activities." last />
      </Card>

      <SectionLabel>Location</SectionLabel>
      <Card>
        <ToggleRow label="Hide start & finish" hint="Blur the first and last 200 m near saved places"
          on={!!p.hideEnds} onChange={(v) => actions.setPrivacy('hideEnds', v)} />
        <ToggleRow label="Share live location" hint="Show your position to the pack during group rides"
          on={!!p.liveLocation} onChange={(v) => actions.setPrivacy('liveLocation', v)} last />
      </Card>

      <ProfileFieldsSection profile={profile} getToken={getToken} onProfileSaved={onProfileSaved} />

      <SectionLabel>Discovery</SectionLabel>
      <Card>
        <ToggleRow label="Show on leaderboards" hint="Appear in your team's weekly rankings"
          on={!!p.leaderboard} onChange={(v) => actions.setPrivacy('leaderboard', v)} />
        <ToggleRow label="Discoverable" hint="Let athletes find you in Discover and search"
          on={!!p.discoverable} onChange={(v) => actions.setPrivacy('discoverable', v)} />
        <ToggleRow label="Share usage analytics" hint="Send anonymous data to help improve the app"
          on={!!p.analytics} onChange={(v) => actions.setPrivacy('analytics', v)} last />
      </Card>

      <SectionLabel>Your data</SectionLabel>
      <Card>
        <LinkRow onClick={() => actions.exportData?.()}>Download my data</LinkRow>
        <LinkRow danger last onClick={() => confirm.open({
          title: 'Delete account',
          body: 'This permanently deletes your account and all your data — activities, memberships, messages, photos and any squads you own. This cannot be undone.',
          requireText: 'DELETE',
          confirmLabel: 'Delete account',
          run: () => actions.deleteAccount(),
        })}>Delete account</LinkRow>
      </Card>

      <div style={s('font-size:11px;color:var(--text3);margin-top:14px;line-height:1.5;padding:0 2px')}>
        Deleting your account permanently removes your activities, memberships and messages. This can't be undone.
      </div>

      {confirm.node}
    </div>
  );
}

// "Profile details" — per-field visibility. Each toggle hides that field from other athletes'
// view of your profile (you always see your own). Persisted server-side as a CSV on the profile.
function ProfileFieldsSection({ profile, getToken, onProfileSaved }) {
  const parse = (csv) => new Set((csv || '').split(',').map((x) => x.trim()).filter(Boolean));
  const [hidden, setHidden] = useState(() => parse(profile?.hiddenFields));
  const [busy, setBusy] = useState(false);
  // Re-sync if the profile reloads (e.g. after another edit elsewhere).
  useEffect(() => { setHidden(parse(profile?.hiddenFields)); }, [profile?.hiddenFields]);

  const toggle = async (key, hide) => {
    const prev = hidden;
    const next = new Set(prev);
    if (hide) next.add(key); else next.delete(key);
    setHidden(next); // optimistic
    setBusy(true);
    try {
      const token = await getToken?.();
      const updated = await updateProfile(token, { hiddenFields: [...next].join(',') });
      onProfileSaved?.(updated);
    } catch {
      setHidden(prev); // revert on failure
    } finally { setBusy(false); }
  };

  return (
    <>
      <SectionLabel>Profile details</SectionLabel>
      <Card>
        {HIDEABLE.map((f, i) => (
          <ToggleRow key={f.key} label={`Hide ${f.label}`} on={hidden.has(f.key)}
            onChange={busy ? undefined : (v) => toggle(f.key, v)} last={i === HIDEABLE.length - 1} />
        ))}
      </Card>
      <div style={s('font-size:11px;color:var(--text3);margin-top:8px;line-height:1.5;padding:0 2px')}>
        Hidden fields don't appear on your public profile. You always see your own values.
      </div>
    </>
  );
}
