import { useCallback, useEffect, useState } from 'react';
import { s } from '../lib/style.js';
import {
  adminOverview, adminListUsers, adminListSquads, adminSquadMembers,
  adminDeleteSquad, adminRemoveMember, adminDeleteUser,
} from '../lib/admin.js';

// System-admin console — reachable only by sysadmin accounts (Settings → System admin,
// gated on session.isAdmin; every API route is 403 for everyone else). Lists all clubs
// and users and lets an admin moderate them: delete a club, remove a member, delete a user.

const label = 'font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.3px;font-weight:600;margin:22px 2px 10px';
const card = 'background:var(--bg2);border:1px solid var(--line);border-radius:16px';

const Seg = ({ active, onClick, children }) => (
  <div className="ctl" onClick={onClick} style={s('flex:1;text-align:center;padding:10px;border-radius:11px;font-size:12.5px;font-weight:600;' + (active ? 'background:var(--accent);color:var(--accent-ink)' : 'background:var(--bg3);border:1px solid var(--line);color:var(--text2)'))}>{children}</div>
);

const Avatar = ({ color, initials }) => (
  <div style={s(`width:38px;height:38px;border-radius:11px;flex:none;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#0b0b0c;background:${color || 'var(--bg4)'}`)}>{initials || '?'}</div>
);

const Stat = ({ n, label: l }) => (
  <div style={s(card + ';flex:1;padding:12px 10px;text-align:center')}>
    <div className="mono" style={s('font-size:20px;font-weight:800;letter-spacing:-.5px')}>{n ?? '—'}</div>
    <div style={s('font-size:10.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-top:3px')}>{l}</div>
  </div>
);

const DeleteBtn = ({ onClick, children = 'Delete' }) => (
  <div className="ctl" onClick={onClick} style={s('flex:none;font-size:12px;font-weight:700;color:var(--bad);border:1px solid var(--bad);border-radius:9px;padding:6px 11px')}>{children}</div>
);

const KindTag = ({ kind }) => {
  const c = kind === 'personal' ? 'var(--text3)' : kind === 'free' ? 'var(--good, #34d399)' : 'var(--accent)';
  return <span style={s(`font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${c};border:1px solid ${c};border-radius:6px;padding:1px 6px`)}>{kind}</span>;
};

// Confirmation modal for destructive actions. When `requireText` is set (e.g. a group name),
// the confirm button stays disabled until the admin types it exactly — a deliberate speed-bump
// for irreversible deletes.
const ConfirmModal = ({ title, body, requireText, confirmLabel, input, setInput, busy, onCancel, onConfirm }) => {
  const ready = !requireText || input.trim() === requireText;
  return (
    <div onClick={onCancel} style={s('position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:24px')}>
      <div onClick={(e) => e.stopPropagation()} style={s('width:100%;max-width:340px;background:var(--bg2);border:1px solid var(--line);border-radius:18px;padding:18px;animation:floatUp .2s ease')}>
        <div style={s('font-size:15.5px;font-weight:800;letter-spacing:-.3px')}>{title}</div>
        <div style={s('font-size:12.5px;color:var(--text2);line-height:1.55;margin-top:9px')}>{body}</div>
        {requireText && (
          <>
            <div style={s('font-size:11px;color:var(--text3);margin:14px 0 6px')}>Type <b style={s('color:var(--text)')}>{requireText}</b> to confirm</div>
            <input value={input} onChange={(e) => setInput(e.target.value)} autoFocus placeholder={requireText}
              style={s('width:100%;padding:10px 12px;border-radius:10px;background:var(--bg3);border:1px solid var(--line);color:var(--text);font-size:13px;outline:none;box-sizing:border-box')} />
          </>
        )}
        <div style={s('display:flex;gap:9px;margin-top:16px')}>
          <div className="ctl" onClick={busy ? undefined : onCancel} style={s('flex:1;text-align:center;padding:11px;border-radius:11px;font-size:13px;font-weight:700;background:var(--bg3);border:1px solid var(--line);color:var(--text2)')}>Cancel</div>
          <div className="ctl" onClick={ready && !busy ? onConfirm : undefined}
            style={s(`flex:1;text-align:center;padding:11px;border-radius:11px;font-size:13px;font-weight:700;color:#fff;background:var(--bad);${ready && !busy ? '' : 'opacity:.45;pointer-events:none'}`)}>{busy ? 'Working…' : confirmLabel}</div>
        </div>
      </div>
    </div>
  );
};

export default function Admin({ getToken }) {
  const [tab, setTab] = useState('groups');
  const [overview, setOverview] = useState(null);
  const [squads, setSquads] = useState([]);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);   // squadId whose roster is open
  const [members, setMembers] = useState({});       // squadId → SquadMember[]
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null);        // { title, body, requireText, confirmLabel, run }
  const [modalInput, setModalInput] = useState('');

  const token = getToken?.();

  const loadOverview = useCallback(() => {
    if (!token) return;
    adminOverview(token).then(setOverview).catch((e) => setError(e.message));
  }, [token]);
  const loadSquads = useCallback(() => {
    if (!token) return;
    adminListSquads(token).then(setSquads).catch((e) => setError(e.message));
  }, [token]);
  const loadUsers = useCallback((term) => {
    if (!token) return;
    adminListUsers(token, term).then(setUsers).catch((e) => setError(e.message));
  }, [token]);

  useEffect(() => { loadOverview(); loadSquads(); }, [loadOverview, loadSquads]);
  // Debounced user search (also the initial load with an empty term).
  useEffect(() => {
    const id = setTimeout(() => loadUsers(search), 250);
    return () => clearTimeout(id);
  }, [search, loadUsers]);

  const flash = (msg) => { setNotice(msg); setError(''); setTimeout(() => setNotice(''), 3500); };

  const toggleMembers = async (sq) => {
    if (expanded === sq.id) { setExpanded(null); return; }
    setExpanded(sq.id);
    if (!members[sq.id]) {
      try {
        const roster = await adminSquadMembers(token, sq.id);
        setMembers((m) => ({ ...m, [sq.id]: roster }));
      } catch (e) { setError(e.message); }
    }
  };

  const openModal = (m) => { setModalInput(''); setError(''); setModal(m); };
  const closeModal = () => { setModal(null); setModalInput(''); };
  const runModal = async () => {
    if (!modal) return;
    setBusy(true); setError('');
    try {
      await modal.run();
      closeModal();
    } catch (e) { setError(e.message); closeModal(); } finally { setBusy(false); }
  };

  // The real club(s) a user owns (from the loaded groups list) — deleting the user deletes these too.
  const ownedClubsOf = (u) => squads.filter((sq) => sq.ownerId === u.id && sq.kind !== 'personal');

  const deleteSquad = (sq) => openModal({
    title: 'Delete group',
    body: `This permanently deletes “${sq.name}” and moves its ${sq.memberCount} member(s) to their own private squad. This can't be undone.`,
    requireText: sq.name,
    confirmLabel: 'Delete group',
    run: async () => {
      await adminDeleteSquad(token, sq.id);
      flash(`Deleted “${sq.name}”.`);
      setExpanded(null);
      loadSquads(); loadOverview(); loadUsers(search);
    },
  });

  const removeMember = (sq, m) => openModal({
    title: 'Remove member',
    body: `Remove ${m.name} from “${sq.name}”? They keep their account and move back to their own private squad.`,
    requireText: null,
    confirmLabel: 'Remove',
    run: async () => {
      await adminRemoveMember(token, sq.id, m.athleteId);
      const roster = await adminSquadMembers(token, sq.id);
      setMembers((mm) => ({ ...mm, [sq.id]: roster }));
      flash(`Removed ${m.name} from “${sq.name}”.`);
      loadSquads();
    },
  });

  const deleteUser = (u) => {
    const owned = ownedClubsOf(u);
    if (owned.length) {
      const names = owned.map((c) => c.name).join(', ');
      openModal({
        title: 'Delete user & their group(s)',
        body: `${u.name} owns ${owned.length === 1 ? 'the group' : 'the groups'} “${names}”. Deleting the user also permanently deletes ${owned.length === 1 ? 'that group' : 'those groups'} and moves all members to their own private squad. This can't be undone.`,
        requireText: names,
        confirmLabel: 'Delete user & group',
        run: async () => {
          await adminDeleteUser(token, u.id, { deleteOwnedClubs: true });
          flash(`Deleted ${u.name} and their group(s).`);
          loadUsers(search); loadOverview(); loadSquads();
        },
      });
    } else {
      openModal({
        title: 'Delete user',
        body: `Permanently delete ${u.name}${u.email ? ` (${u.email})` : ''} and all their data — activities, memberships, and their private squad? This can't be undone.`,
        requireText: null,
        confirmLabel: 'Delete user',
        run: async () => {
          await adminDeleteUser(token, u.id);
          flash(`Deleted ${u.name}.`);
          loadUsers(search); loadOverview(); loadSquads();
        },
      });
    }
  };

  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      {/* counts */}
      <div style={s('display:flex;gap:9px;margin-top:16px')}>
        <Stat n={overview?.users} label="Users" />
        <Stat n={overview?.clubs} label="Clubs" />
        <Stat n={overview?.personalSquads} label="Solo" />
        <Stat n={overview?.activities} label="Activities" />
      </div>

      {/* tabs */}
      <div style={s('display:flex;gap:7px;margin-top:18px')}>
        <Seg active={tab === 'groups'} onClick={() => setTab('groups')}>Groups</Seg>
        <Seg active={tab === 'users'} onClick={() => setTab('users')}>Users</Seg>
      </div>

      {(error || notice) && (
        <div style={s(`margin-top:14px;font-size:12.5px;font-weight:600;text-align:center;padding:10px;border-radius:11px;${error ? 'color:var(--bad);background:var(--bad-dim, rgba(255,80,80,.12))' : 'color:var(--accent);background:var(--accent-dim)'}`)}>
          {error || notice}
        </div>
      )}

      {tab === 'groups' && (
        <>
          <div style={s(label)}>All groups · {squads.length}</div>
          <div style={s(card)}>
            {squads.length === 0 && <div style={s('padding:16px;font-size:12.5px;color:var(--text3);text-align:center')}>No groups.</div>}
            {squads.map((sq, i) => (
              <div key={sq.id} style={s(i ? 'border-top:1px solid var(--line)' : '')}>
                <div style={s('display:flex;align-items:center;gap:11px;padding:12px 14px')}>
                  <Avatar color={sq.color || '#3a3a3d'} initials={(sq.name || '?').slice(0, 2).toUpperCase()} />
                  <div className="ctl" onClick={() => toggleMembers(sq)} style={s('flex:1;min-width:0')}>
                    <div style={s('display:flex;align-items:center;gap:7px')}>
                      <span style={s('font-size:13.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{sq.name}</span>
                      <KindTag kind={sq.kind} />
                    </div>
                    <div style={s('font-size:11px;color:var(--text3);margin-top:2px')}>
                      {[`${sq.memberCount} member${sq.memberCount === 1 ? '' : 's'}`, sq.ownerName ? `owner: ${sq.ownerName}` : null, sq.location].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  {sq.kind !== 'personal' && <DeleteBtn onClick={() => deleteSquad(sq)} />}
                </div>
                {expanded === sq.id && (
                  <div style={s('padding:0 14px 12px 63px')}>
                    {(members[sq.id] || []).map((m) => (
                      <div key={m.athleteId} style={s('display:flex;align-items:center;gap:9px;padding:7px 0;border-top:1px solid var(--line)')}>
                        <span style={s('flex:1;font-size:12.5px;color:var(--text2)')}>{m.name} <span style={s('color:var(--text3);font-size:11px')}>· {m.role}</span></span>
                        {m.role !== 'owner' && <div className="ctl" onClick={() => removeMember(sq, m)} style={s('font-size:11.5px;font-weight:700;color:var(--bad)')}>Remove</div>}
                      </div>
                    ))}
                    {members[sq.id] && members[sq.id].length === 0 && <div style={s('font-size:11.5px;color:var(--text3);padding-top:8px')}>No members.</div>}
                    {!members[sq.id] && <div style={s('font-size:11.5px;color:var(--text3);padding-top:8px')}>Loading…</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'users' && (
        <>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email"
            style={s('width:100%;margin-top:16px;padding:12px 14px;border-radius:12px;background:var(--bg2);border:1px solid var(--line);color:var(--text);font-size:13px;outline:none;box-sizing:border-box')}
          />
          <div style={s(label)}>Users · {users.length}</div>
          <div style={s(card)}>
            {users.length === 0 && <div style={s('padding:16px;font-size:12.5px;color:var(--text3);text-align:center')}>No users.</div>}
            {users.map((u, i) => (
              <div key={u.id} style={s('display:flex;align-items:center;gap:11px;padding:12px 14px' + (i ? ';border-top:1px solid var(--line)' : ''))}>
                <Avatar color={u.avatarColor} initials={u.initials} />
                <div style={s('flex:1;min-width:0')}>
                  <div style={s('font-size:13.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{u.name}{u.ownsClub && <span style={s('font-size:10px;font-weight:700;color:var(--accent);margin-left:6px')}>OWNER</span>}</div>
                  <div style={s('font-size:11px;color:var(--text3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
                    {[u.email, u.activeSquadName, `${u.activities} act`].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <DeleteBtn onClick={() => deleteUser(u)} />
              </div>
            ))}
          </div>
          <div style={s('font-size:11px;color:var(--text3);margin:12px 4px 0;line-height:1.5')}>Deleting a user who owns a club also deletes that club — you'll confirm by typing the group name.</div>
        </>
      )}

      {modal && (
        <ConfirmModal
          title={modal.title} body={modal.body} requireText={modal.requireText} confirmLabel={modal.confirmLabel}
          input={modalInput} setInput={setModalInput} busy={busy}
          onCancel={closeModal} onConfirm={runModal}
        />
      )}
    </div>
  );
}
