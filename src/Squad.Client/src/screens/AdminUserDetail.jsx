import { useCallback, useEffect, useState } from 'react';
import { s } from '../lib/style.js';
import { useConfirm } from '../components/ConfirmModal.jsx';
import { adminGetUser, adminDeleteUser } from '../lib/admin.js';

// Sysadmin user detail — contact/identity + the groups the athlete owns and belongs to.
// Reached from the Admin list (Users tab) and from a group's owner/member rows.

const label = 'font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.3px;font-weight:600;margin:22px 2px 10px';
const card = 'background:var(--bg2);border:1px solid var(--line);border-radius:16px';

const KindTag = ({ kind }) => {
  const c = kind === 'personal' ? 'var(--text3)' : kind === 'free' ? 'var(--good, #34d399)' : 'var(--accent)';
  return <span style={s(`font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${c};border:1px solid ${c};border-radius:6px;padding:1px 6px`)}>{kind}</span>;
};

const InfoRow = ({ k, v, top }) => (
  <div style={s(`display:flex;gap:12px;padding:11px 14px${top ? '' : ';border-top:1px solid var(--line)'}`)}>
    <span style={s('font-size:12.5px;color:var(--text3);flex:none;width:96px')}>{k}</span>
    <span style={s('font-size:12.5px;color:var(--text);font-weight:600;flex:1;min-width:0;word-break:break-word')}>{v ?? '—'}</span>
  </div>
);

const GroupRow = ({ club, onClick, top }) => (
  <div className="ctl" onClick={onClick} style={s(`display:flex;align-items:center;gap:9px;padding:12px 14px${top ? '' : ';border-top:1px solid var(--line)'}`)}>
    <div style={s('flex:1;min-width:0')}>
      <div style={s('display:flex;align-items:center;gap:7px')}>
        <span style={s('font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{club.name}</span>
        <KindTag kind={club.kind} />
      </div>
      <div style={s('font-size:11px;color:var(--text3);margin-top:2px')}>{club.role} · {club.memberCount} member{club.memberCount === 1 ? '' : 's'}</div>
    </div>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round" style={{ flex: 'none' }}><path d="M9 6l6 6-6 6" /></svg>
  </div>
);

export default function AdminUserDetail({ state, actions, getToken }) {
  const id = state.adminUserId;
  const token = getToken?.();
  const [u, setU] = useState(null);
  const [error, setError] = useState('');
  const confirm = useConfirm();

  const load = useCallback(() => {
    if (!token || !id) return;
    setError('');
    adminGetUser(token, id).then(setU).catch((e) => setError(e.message));
  }, [token, id]);
  useEffect(() => { load(); }, [load]);

  const providers = u ? [u.hasGoogle && 'Google', u.hasApple && 'Apple'].filter(Boolean).join(' · ') : '';

  const deleteUser = () => {
    const owned = u?.ownedClubs || [];
    if (owned.length) {
      const names = owned.map((c) => c.name).join(', ');
      confirm.open({
        title: 'Delete user & their group(s)',
        body: `Deleting ${u.name} also permanently deletes the group(s) “${names}” and moves all members to their own private squad. This can't be undone.`,
        requireText: names,
        confirmLabel: 'Delete user & group',
        run: async () => { await adminDeleteUser(token, id, { deleteOwnedClubs: true }); actions.back(); },
      });
    } else {
      confirm.open({
        title: 'Delete user',
        body: `Permanently delete ${u.name}${u.email ? ` (${u.email})` : ''} and all their data — activities, memberships, and their private squad? This can't be undone.`,
        requireText: null,
        confirmLabel: 'Delete user',
        run: async () => { await adminDeleteUser(token, id); actions.back(); },
      });
    }
  };

  if (error) return <div style={s('padding:24px 18px;font-size:13px;color:var(--bad);text-align:center')}>{error}</div>;
  if (!u) return <div style={s('padding:24px 18px;font-size:13px;color:var(--text3);text-align:center')}>Loading…</div>;

  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      {/* identity header */}
      <div style={s('display:flex;align-items:center;gap:13px;margin-top:14px')}>
        <div style={s(`width:54px;height:54px;border-radius:16px;flex:none;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#0b0b0c;background:${u.avatarColor || 'var(--bg4)'}`)}>{u.initials || '?'}</div>
        <div style={s('flex:1;min-width:0')}>
          <div style={s('font-size:18px;font-weight:800;letter-spacing:-.4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{u.name}</div>
          <div style={s('font-size:12.5px;color:var(--text3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{u.email || 'no email'}</div>
        </div>
      </div>

      {/* contact / identity */}
      <div style={s(label)}>Contact &amp; identity</div>
      <div style={s(card)}>
        <InfoRow top k="Email" v={u.email} />
        <InfoRow k="Sign-in" v={providers || '—'} />
        <InfoRow k="Sport" v={u.primarySport} />
        <InfoRow k="Level" v={u.level} />
        <InfoRow k="Club" v={u.club} />
        <InfoRow k="Activities" v={u.activities} />
        <div className="ctl" onClick={() => u.activeSquadId && actions.openAdminGroup(u.activeSquadId)} style={s('display:flex;gap:12px;align-items:center;padding:11px 14px;border-top:1px solid var(--line)')}>
          <span style={s('font-size:12.5px;color:var(--text3);flex:none;width:96px')}>Active squad</span>
          <span style={s('font-size:12.5px;color:var(--accent);font-weight:700;flex:1;min-width:0')}>{u.activeSquadName || '—'}</span>
        </div>
      </div>

      {/* owned groups */}
      <div style={s(label)}>Owns · {u.ownedClubs.length}</div>
      <div style={s(card)}>
        {u.ownedClubs.length === 0 && <div style={s('padding:14px;font-size:12.5px;color:var(--text3);text-align:center')}>Owns no groups.</div>}
        {u.ownedClubs.map((c, i) => <GroupRow key={c.id} club={c} top={i === 0} onClick={() => actions.openAdminGroup(c.id)} />)}
      </div>

      {/* memberships */}
      <div style={s(label)}>Member of · {u.memberships.length}</div>
      <div style={s(card)}>
        {u.memberships.length === 0 && <div style={s('padding:14px;font-size:12.5px;color:var(--text3);text-align:center')}>No memberships.</div>}
        {u.memberships.map((c, i) => <GroupRow key={c.id} club={c} top={i === 0} onClick={() => actions.openAdminGroup(c.id)} />)}
      </div>

      {/* delete */}
      <div style={s(card + ';margin-top:20px')}>
        <div className="ctl" onClick={deleteUser} style={s('text-align:center;padding:14px;font-size:13.5px;font-weight:700;color:var(--bad)')}>Delete this user</div>
      </div>

      {confirm.node}
    </div>
  );
}
