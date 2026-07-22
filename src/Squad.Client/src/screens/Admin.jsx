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

  const deleteSquad = async (sq) => {
    if (!window.confirm(`Delete the group "${sq.name}"? Its ${sq.memberCount} member(s) will be moved to their own private squad. This can't be undone.`)) return;
    setBusy(true); setError('');
    try {
      await adminDeleteSquad(token, sq.id);
      flash(`Deleted "${sq.name}".`);
      setExpanded(null);
      loadSquads(); loadOverview(); loadUsers(search);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const removeMember = async (sq, m) => {
    if (!window.confirm(`Remove ${m.name} from "${sq.name}"?`)) return;
    setBusy(true); setError('');
    try {
      await adminRemoveMember(token, sq.id, m.athleteId);
      const roster = await adminSquadMembers(token, sq.id);
      setMembers((mm) => ({ ...mm, [sq.id]: roster }));
      flash(`Removed ${m.name} from "${sq.name}".`);
      loadSquads();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const deleteUser = async (u) => {
    if (u.ownsClub) { setError(`${u.name} owns a club — delete or reassign that club first.`); return; }
    if (!window.confirm(`Permanently delete ${u.name}${u.email ? ` (${u.email})` : ''} and all their data (activities, memberships, private squad)? This can't be undone.`)) return;
    setBusy(true); setError('');
    try {
      await adminDeleteUser(token, u.id);
      flash(`Deleted ${u.name}.`);
      loadUsers(search); loadOverview(); loadSquads();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
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
                {!u.ownsClub && <DeleteBtn onClick={() => deleteUser(u)} />}
              </div>
            ))}
          </div>
          <div style={s('font-size:11px;color:var(--text3);margin:12px 4px 0;line-height:1.5')}>Users who own a club can't be deleted here — delete or reassign the club first.</div>
        </>
      )}
    </div>
  );
}
