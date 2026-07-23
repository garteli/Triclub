import { useCallback, useEffect, useRef, useState } from 'react';
import { s } from '../lib/style.js';
import { Back, Title, Sub, FieldLabel, Field, TextArea, Chips, PrimaryBtn } from './wizard.jsx';
import AuthedImage from '../components/AuthedImage.jsx';
import GroupTargets from '../components/GroupTargets.jsx';
import { useConfirm } from '../components/ConfirmModal.jsx';
import { useJoinRequests } from '../hooks/useJoinRequests.js';
import { downscaleToJpeg } from '../lib/photos.js';
import { dataUrlToBlob } from '../lib/avatar.js';
import { bustAuthedImage } from '../lib/authedImage.js';
import {
  updateSquad, listMembers, removeMember, setMemberRole, transferOwnership,
  uploadSquadImage, deleteSquadImage, createInvite,
} from '../lib/squads.js';
import { API_BASE } from '../lib/apiBase.js';
import { DISCIPLINES, familyOf, disciplinesInFamily } from '../lib/disciplines.js';

const LEVELS = ['All levels', 'Intermediate+', 'Advanced', 'Race focus'];
const COLORS = ['#e11d2a', '#ff6a2c', '#ffce4a', '#37c0ff', '#4ade80', '#a78bfa', '#ff6f61', '#0ea5e9'];

const Avatar = ({ m, token }) => (
  m.avatarUrl
    ? <AuthedImage url={m.avatarUrl} token={token} style="width:38px;height:38px;border-radius:11px;flex:none" />
    : <div style={s(`width:38px;height:38px;border-radius:11px;flex:none;background:${m.avatarColor};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#0c0e11`)}>{m.initials}</div>
);

// A small roster action chip. `accent` (transfer) and `good` (promote) tint it; default is neutral.
const RoleChip = ({ onClick, accent, good, children }) => {
  const tint = accent ? 'var(--accent)' : good ? 'var(--good)' : 'var(--text2)';
  return (
    <div className={onClick ? 'ctl' : undefined} onClick={onClick}
      style={s(`font-size:11.5px;font-weight:700;color:${tint};background:color-mix(in srgb,${tint} 12%,transparent);border:1px solid color-mix(in srgb,${tint} 30%,transparent);padding:7px 12px;border-radius:10px;${onClick ? '' : 'opacity:.6'}`)}>
      {children}
    </div>
  );
};

// Owner-only management for a squad: branding (logo + banner), details & pricing, and the member
// roster (roles / remove / ownership transfer, each behind a confirmation modal). Members join via
// join requests or the invite link — there is no add-by-email. Everything is gated server-side too.
export default function ManageGroup({ vm, actions, getToken, meId, onDataChanged }) {
  const g = vm.selGroupData || {};
  const isOwner = !!meId && !!g.owner && String(g.owner).toLowerCase() === String(meId).toLowerCase();

  const [token, setToken] = useState(null);
  useEffect(() => {
    let ok = true;
    Promise.resolve(getToken?.()).then((t) => { if (ok) setToken(t || null); });
    return () => { ok = false; };
  }, [getToken]);

  // details/pricing form, seeded from the current squad
  const [name, setName] = useState(g.name || '');
  const [loc, setLoc] = useState(g.loc || '');
  // A group belongs to ONE discipline family — endurance OR motor sports, never both.
  // `disc` is the single stored discipline; the family (segmented toggle) is derived from it.
  const [disc, setDisc] = useState(DISCIPLINES.includes(g.disc) ? g.disc : 'Cycling');
  const family = familyOf(disc);
  // Switching family swaps the discipline to that family's first option (so the two can't mix).
  const setFamily = (fam) => { if (fam !== family) setDisc(disciplinesInFamily(fam)[0]); };
  const [level, setLevel] = useState(LEVELS.includes(g.level) ? g.level : 'All levels');
  const [desc, setDesc] = useState(g.desc || '');
  const [color, setColor] = useState(g.color || '#e11d2a');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  const bannerInput = useRef(null);
  const logoInput = useRef(null);

  // roster
  const [members, setMembers] = useState(null);
  const [memberMsg, setMemberMsg] = useState('');
  const [memberErr, setMemberErr] = useState('');
  const roleConfirm = useConfirm();   // modal confirmations for remove / role changes / ownership transfer

  // invite link (friends who sign up with it auto-join this group)
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMsg, setInviteMsg] = useState('');

  // Pending join requests across the owner's squads; we show the ones for THIS group here.
  const { items: allRequests, approve: approveReq, decline: declineReq } = useJoinRequests({ getToken, enabled: isOwner });
  const groupRequests = (allRequests || []).filter((r) => String(r.squadId) === String(g.id));
  const onApproveReq = async (r) => {
    setMemberErr(''); setMemberMsg('');
    try { await approveReq(r.squadId, r.athleteId); setMemberMsg(`Approved ${r.name}.`); await loadMembers(); onDataChanged?.(); }
    catch (ex) { setMemberErr(ex.message || 'Could not approve.'); }
  };
  const onDeclineReq = async (r) => {
    setMemberErr(''); setMemberMsg('');
    try { await declineReq(r.squadId, r.athleteId); } catch (ex) { setMemberErr(ex.message || 'Could not decline.'); }
  };

  const loadMembers = useCallback(async () => {
    try {
      const t = await getToken?.();
      setMembers(await listMembers(t, g.id));
    } catch { setMembers([]); }
  }, [getToken, g.id]);
  useEffect(() => { if (isOwner && g.id) loadMembers(); }, [isOwner, g.id, loadMembers]);

  if (!isOwner) {
    return (
      <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
        <div style={s('text-align:center;color:var(--text3);font-size:13px;margin-top:40px')}>You don't manage this group.</div>
      </div>
    );
  }

  const pickImage = (kindKey) => async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true); setErr('');
    try {
      const dataUrl = await downscaleToJpeg(file, kindKey === 'banner' ? 1600 : 512, 0.85);
      const t = await getToken?.();
      await uploadSquadImage(t, g.id, kindKey, dataUrlToBlob(dataUrl));
      bustAuthedImage(`/api/images/squads/${String(g.id).toLowerCase()}/${kindKey}`);
      onDataChanged?.();
    } catch (ex) { setErr(ex.message || 'Upload failed.'); }
    finally { setBusy(false); }
  };

  const clearImage = (kindKey) => async () => {
    setBusy(true); setErr('');
    try {
      const t = await getToken?.();
      await deleteSquadImage(t, g.id, kindKey);
      bustAuthedImage(`/api/images/squads/${String(g.id).toLowerCase()}/${kindKey}`);
      onDataChanged?.();
    } catch (ex) { setErr(ex.message || 'Could not remove.'); }
    finally { setBusy(false); }
  };

  const save = async () => {
    setBusy(true); setErr(''); setSaved(false);
    try {
      const t = await getToken?.();
      await updateSquad(t, g.id, {
        name: name.trim() || null,
        discipline: disc,
        location: loc.trim(),
        level,
        kind: 'member',    // every club is approval-gated membership for now (no coached/paid tiers)
        price: 'Free',
        perLabel: '',
        color,
        description: desc,
      });
      onDataChanged?.();
      setSaved(true);
    } catch (ex) { setErr(ex.message || 'Could not save.'); }
    finally { setBusy(false); }
  };

  // Public web origin for the shareable link: same-origin on web, the deployed backend
  // (which also serves the web SPA) on native — never the capacitor:// app origin.
  const inviteLinkFor = (token) => `${API_BASE || window.location.origin}/?invite=${token}`;

  // A friendly, ready-to-send invite (for chat / WhatsApp / email). The link is on its own
  // line so it stays tappable. Kept short so it reads well in a message bubble.
  const inviteMessageFor = (url) => {
    const club = g.name || 'our group';
    return `You're invited to join ${club} on Domestique Hub 🚴‍♀️\n`
      + `Train, ride and race together — sign up with my link and you're in the group automatically:\n`
      + `${url}`;
  };

  // Create (or rotate, when reset) the group's invite link, then share / copy a nice message.
  const makeInvite = async (reset = false) => {
    setInviteBusy(true); setInviteMsg('');
    try {
      const t = await getToken?.();
      const r = await createInvite(t, g.id, reset);
      const url = inviteLinkFor(r.token);
      setInviteUrl(url);
      const message = inviteMessageFor(url);
      // Native share sheet if available; otherwise copy the full message to the clipboard.
      if (navigator.share) {
        try {
          await navigator.share({ title: `Join ${g.name || 'our group'} on Domestique Hub`, text: message });
          setInviteMsg(reset ? 'New link ready — shared.' : 'Invite shared.');
          return;
        } catch { /* user dismissed the sheet — fall through to clipboard */ }
      }
      try { await navigator.clipboard?.writeText(message); setInviteMsg(reset ? 'New invite copied — paste it to a friend.' : 'Invite copied — paste it to a friend.'); }
      catch { setInviteMsg('Invite link ready — copy it below.'); }
    } catch (ex) { setInviteMsg(ex.message || 'Could not create an invite link.'); }
    finally { setInviteBusy(false); }
  };

  const copyInvite = async () => {
    if (!inviteUrl) return;
    try { await navigator.clipboard?.writeText(inviteMessageFor(inviteUrl)); setInviteMsg('Invite copied — paste it to a friend.'); }
    catch { setInviteMsg('Select the link above to copy it.'); }
  };

  // All roster mutations run through a confirmation modal (useConfirm handles busy/errors and
  // closes on success). Each `run` throws on failure so the modal surfaces the message.
  const reloadRoster = async () => { await loadMembers(); onDataChanged?.(); };

  const askRemove = (m) => roleConfirm.open({
    title: 'Remove from group',
    body: <>Remove <b style={s('color:var(--text)')}>{m.name}</b> from {g.name || 'this group'}? They’ll lose access to the group{m.role === 'coach' ? ' and their coach role' : ''}.</>,
    confirmLabel: 'Remove',
    run: async () => { await removeMember(await getToken?.(), g.id, m.athleteId); await reloadRoster(); },
  });

  // Promote a member to coach / demote a coach back to member.
  const askSetRole = (m, role) => roleConfirm.open({
    title: role === 'coach' ? 'Make coach' : 'Remove coach',
    body: role === 'coach'
      ? <>Make <b style={s('color:var(--text)')}>{m.name}</b> a coach of {g.name || 'this group'}?</>
      : <>Remove <b style={s('color:var(--text)')}>{m.name}</b> as a coach? They’ll stay a member of the group.</>,
    confirmLabel: role === 'coach' ? 'Make coach' : 'Remove coach',
    run: async () => { await setMemberRole(await getToken?.(), g.id, m.athleteId, role); await reloadRoster(); },
  });

  // Hand the group to a coach: they become the sole owner and this owner is demoted to coach.
  // Guarded by a type-the-group-name gate, since it's irreversible for the current owner.
  const askMakeOwner = (m) => roleConfirm.open({
    title: 'Transfer ownership',
    body: <>Make <b style={s('color:var(--text)')}>{m.name}</b> the owner of {g.name || 'this group'}? You’ll become a coach and lose group-management control. This can only be undone by the new owner.</>,
    requireText: g.name || '',
    confirmLabel: 'Transfer ownership',
    run: async () => { await transferOwnership(await getToken?.(), g.id, m.athleteId); await reloadRoster(); },
  });

  const bannerUrl = g.bannerUrl ? `${g.bannerUrl}` : null;
  const logoUrl = g.logoUrl ? `${g.logoUrl}` : null;

  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      {/* title + back now in the global app header */}

      {/* ---- branding: banner + logo ---- */}
      <FieldLabel>Banner</FieldLabel>
      <div style={s('position:relative;height:110px;border-radius:16px;overflow:hidden;border:1px solid var(--line)')}>
        {bannerUrl
          ? <AuthedImage url={bannerUrl} token={token} style="width:100%;height:100%" />
          : <div style={s(`width:100%;height:100%;background:linear-gradient(135deg,${color},color-mix(in srgb,${color} 40%, var(--bg3)))`)} />}
        <div style={s('position:absolute;right:8px;bottom:8px;display:flex;gap:6px')}>
          <div className="ctl" onClick={() => bannerInput.current?.click()} style={s('background:rgba(0,0,0,.55);color:#fff;font-size:11px;font-weight:700;padding:6px 11px;border-radius:9px')}>{bannerUrl ? 'Change' : 'Upload'}</div>
          {bannerUrl && <div className="ctl" onClick={clearImage('banner')} style={s('background:rgba(0,0,0,.55);color:#fff;font-size:11px;font-weight:700;padding:6px 11px;border-radius:9px')}>Remove</div>}
        </div>
      </div>

      <FieldLabel>Logo</FieldLabel>
      <div style={s('display:flex;align-items:center;gap:14px')}>
        <div style={s('width:60px;height:60px;border-radius:16px;overflow:hidden;flex:none;border:1px solid var(--line)')}>
          {logoUrl
            ? <AuthedImage url={logoUrl} token={token} style="width:100%;height:100%" />
            : <div style={s(`width:100%;height:100%;background:${color};display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:#0c0e11`)}>{(name || 'G').slice(0, 1)}</div>}
        </div>
        <div style={s('display:flex;gap:8px')}>
          <div className="ctl" onClick={() => logoInput.current?.click()} style={s('background:var(--bg2);border:1px solid var(--line);color:var(--text);font-size:12px;font-weight:700;padding:9px 13px;border-radius:10px')}>{logoUrl ? 'Change logo' : 'Upload logo'}</div>
          {logoUrl && <div className="ctl" onClick={clearImage('logo')} style={s('background:var(--bg2);border:1px solid var(--line);color:var(--text2);font-size:12px;font-weight:700;padding:9px 13px;border-radius:10px')}>Remove</div>}
        </div>
      </div>
      <input ref={bannerInput} type="file" accept="image/*" onChange={pickImage('banner')} style={{ display: 'none' }} />
      <input ref={logoInput} type="file" accept="image/*" onChange={pickImage('logo')} style={{ display: 'none' }} />

      {/* ---- details ---- */}
      <Field label="Group name" value={name} onChange={setName} placeholder="Your club name" />
      <Field label="City / base" value={loc} onChange={setLoc} placeholder="Tiberias" />

      <FieldLabel>Discipline type</FieldLabel>
      <div style={s('font-size:12px;color:var(--text2);line-height:1.5;margin:-4px 0 8px')}>A group is either endurance or motor sports — not both.</div>
      <div style={s('display:flex;gap:8px')}>
        {[['endurance', 'Endurance'], ['motorsport', 'Motor sports']].map(([id, label]) => (
          <div key={id} className="ctl" onClick={() => setFamily(id)}
            style={s(`flex:1;text-align:center;padding:11px;border-radius:12px;font-size:13px;font-weight:700;border:1px solid ${family === id ? 'var(--accent)' : 'var(--line)'};background:${family === id ? 'var(--accent-dim)' : 'var(--bg2)'};color:${family === id ? 'var(--accent)' : 'var(--text2)'}`)}>
            {label}
          </div>
        ))}
      </div>
      <FieldLabel>Discipline</FieldLabel>
      <Chips options={disciplinesInFamily(family)} value={disc} onChange={setDisc} />

      <FieldLabel>Level</FieldLabel>
      <Chips options={LEVELS} value={level} onChange={setLevel} />
      <TextArea label="About the group" value={desc} onChange={setDesc} placeholder="Weekly threshold and long endurance rides…" />

      <FieldLabel>Accent colour</FieldLabel>
      <div style={s('display:flex;gap:9px;flex-wrap:wrap')}>
        {COLORS.map((c) => (
          <div key={c} className="ctl" onClick={() => setColor(c)}
            style={s(`width:32px;height:32px;border-radius:10px;background:${c};${color === c ? 'outline:2px solid var(--text);outline-offset:2px' : ''}`)} />
        ))}
      </div>

      {err &&<div style={s('color:var(--bad);font-size:12.5px;margin-top:12px;text-align:center')}>{err}</div>}
      {saved && !err && <div style={s('color:var(--good);font-size:12.5px;margin-top:12px;text-align:center')}>Saved. Changes are live for members.</div>}
      <PrimaryBtn onClick={busy ? undefined : save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</PrimaryBtn>

      {/* ---- pending join requests (athletes who asked to join this group) ---- */}
      {groupRequests.length > 0 && (
        <>
          <FieldLabel>Join requests · {groupRequests.length}</FieldLabel>
          <div style={s('display:flex;flex-direction:column;gap:8px')}>
            {groupRequests.map((r) => (
              <div key={r.athleteId} style={s('background:var(--bg2);border:1px solid color-mix(in srgb,var(--accent) 22%,var(--line));border-radius:13px;padding:10px 12px')}>
                <div style={s('display:flex;align-items:center;gap:11px')}>
                  <div style={s(`width:38px;height:38px;border-radius:11px;flex:none;background:${r.color};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#0c0e11`)}>{r.initials}</div>
                  <div style={s('flex:1;min-width:0')}>
                    <div style={s('font-size:13.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{r.name}</div>
                    <div style={s('font-size:10.5px;color:var(--text3)')}>asked to join · {r.when}</div>
                  </div>
                </div>
                <div style={s('display:flex;gap:8px;margin-top:10px')}>
                  <div className="ctl" onClick={() => onDeclineReq(r)} style={s('flex:1;text-align:center;font-size:12px;font-weight:700;color:var(--bad);background:color-mix(in srgb,var(--bad) 12%,transparent);border:1px solid color-mix(in srgb,var(--bad) 30%,transparent);padding:9px;border-radius:10px')}>Decline</div>
                  <div className="ctl" onClick={() => onApproveReq(r)} style={s('flex:1;text-align:center;font-size:12px;font-weight:700;color:#04140b;background:var(--good);padding:9px;border-radius:10px')}>Approve</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ---- members ---- */}
      <FieldLabel>Members{members ? ` · ${members.length}` : ''}</FieldLabel>
      {memberErr && <div style={s('color:var(--bad);font-size:12px;margin-top:8px')}>{memberErr}</div>}
      {memberMsg && !memberErr && <div style={s('color:var(--good);font-size:12px;margin-top:8px')}>{memberMsg}</div>}

      <div style={s('display:flex;flex-direction:column;gap:8px;margin-top:12px')}>
        {members === null && <div style={s('color:var(--text3);font-size:12.5px;text-align:center;padding:12px')}>Loading roster…</div>}
        {members?.map((m) => {
          // The owner is defined by the squad's OwnerId (g.owner), not by Membership.Role — some
          // squads were seeded with the owner carrying a 'coach' role, so trusting m.role here would
          // wrongly offer "Make owner"/"Remove coach" on the owner's own card (and the removal 409s).
          const isOwnerRow = !!g.owner && String(m.athleteId).toLowerCase() === String(g.owner).toLowerCase();
          const isCoach = !isOwnerRow && m.role === 'coach';
          const roleLabel = isOwnerRow ? 'Owner' : isCoach ? 'Coach' : 'Member';
          const roleColor = isOwnerRow ? 'var(--accent)' : isCoach ? 'var(--good)' : 'var(--text3)';
          return (
            <div key={m.athleteId} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:13px;padding:10px 12px')}>
              <div style={s('display:flex;align-items:center;gap:11px')}>
                <Avatar m={m} token={token} />
                <div style={s('flex:1;min-width:0')}>
                  <div style={s('font-size:13.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{m.name}</div>
                  <div style={s(`font-size:10.5px;color:${roleColor};text-transform:uppercase;letter-spacing:.6px;font-weight:700`)}>{roleLabel}</div>
                </div>
                {isOwnerRow && <span style={s('font-size:10.5px;color:var(--text3);font-weight:600')}>You</span>}
              </div>

              {/* role actions — each opens a confirmation modal. The owner row is fixed
                  (transfer ownership from a coach's card to change who's in charge). */}
              {!isOwnerRow && (
                <div style={s('display:flex;flex-wrap:wrap;gap:7px;margin-top:10px')}>
                  {isCoach ? (
                    <>
                      <RoleChip onClick={() => askMakeOwner(m)} accent>Make owner</RoleChip>
                      <RoleChip onClick={() => askSetRole(m, 'member')}>Remove coach</RoleChip>
                    </>
                  ) : (
                    <RoleChip onClick={() => askSetRole(m, 'coach')} good>Make coach</RoleChip>
                  )}
                  <div className="ctl" onClick={() => askRemove(m)} style={s('font-size:11.5px;font-weight:700;color:var(--bad);background:color-mix(in srgb,var(--bad) 12%,transparent);border:1px solid color-mix(in srgb,var(--bad) 30%,transparent);padding:7px 12px;border-radius:10px;margin-left:auto')}>Remove</div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ---- invite link (friends who sign up with it auto-join this group) ---- */}
      <FieldLabel>Invite friends</FieldLabel>
      <div style={s('font-size:12px;color:var(--text2);line-height:1.5;margin:-4px 0 10px')}>
        Share a link — anyone who signs up with it joins {name || 'your group'} automatically.
      </div>
      {!inviteUrl ? (
        <div className="ctl" onClick={inviteBusy ? undefined : () => makeInvite(false)}
          style={s(`background:var(--accent);color:var(--accent-ink);text-align:center;padding:13px;border-radius:12px;font-weight:700;font-size:14px${inviteBusy ? ';opacity:.6' : ''}`)}>
          {inviteBusy ? 'Creating…' : 'Create invite link'}
        </div>
      ) : (
        <>
          <div style={s('display:flex;gap:8px;align-items:stretch')}>
            <div style={s('flex:1;min-width:0;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-size:12.5px;color:var(--text2);font-family:var(--mono, monospace);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{inviteUrl}</div>
            <div className="ctl" onClick={copyInvite} style={s('background:var(--accent);color:var(--accent-ink);font-size:13px;font-weight:700;padding:12px 16px;border-radius:12px;flex:none;display:flex;align-items:center')}>Copy</div>
          </div>
          <div className="ctl" onClick={inviteBusy ? undefined : () => makeInvite(true)}
            style={s(`text-align:center;font-size:12px;font-weight:600;color:var(--text3);margin-top:10px${inviteBusy ? ';opacity:.6' : ''}`)}>
            Reset link
          </div>
        </>
      )}
      {inviteMsg && <div style={s('color:var(--good);font-size:12px;margin-top:8px;text-align:center')}>{inviteMsg}</div>}

      {/* ---- group targets (coach sets club races from an event link) ---- */}
      <div style={s('margin-top:22px')}><GroupTargets squadId={g.id} getToken={getToken} mode="manage" /></div>

      {/* confirmation modal for remove / role changes / ownership transfer */}
      {roleConfirm.node}
    </div>
  );
}
