import { useCallback, useEffect, useState } from 'react';
import { s } from '../lib/style.js';
import { useConfirm } from '../components/ConfirmModal.jsx';
import { adminGetSquad, adminDeleteSquad, adminRemoveMember } from '../lib/admin.js';

// Sysadmin group detail — club info + owner + roster, with remove-member and delete-group.
// Reached from the Admin list (Groups tab) and from a user's owned/member group rows.

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

const PersonRow = ({ p, sub, onClick, action, top }) => (
  <div style={s(`display:flex;align-items:center;gap:10px;padding:11px 14px${top ? '' : ';border-top:1px solid var(--line)'}`)}>
    <div style={s(`width:34px;height:34px;border-radius:10px;flex:none;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#0b0b0c;background:${p.avatarColor || 'var(--bg4)'}`)}>{p.initials || '?'}</div>
    <div className="ctl" onClick={onClick} style={s('flex:1;min-width:0')}>
      <div style={s('font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{p.name}</div>
      {sub && <div style={s('font-size:11px;color:var(--text3);margin-top:1px')}>{sub}</div>}
    </div>
    {action}
  </div>
);

export default function AdminGroupDetail({ state, actions, getToken }) {
  const id = state.adminGroupId;
  const token = getToken?.();
  const [g, setG] = useState(null);
  const [error, setError] = useState('');
  const confirm = useConfirm();

  const load = useCallback(() => {
    if (!token || !id) return;
    setError('');
    adminGetSquad(token, id).then(setG).catch((e) => setError(e.message));
  }, [token, id]);
  useEffect(() => { load(); }, [load]);

  const removeMember = (m) => confirm.open({
    title: 'Remove member',
    body: `Remove ${m.name} from “${g.name}”? They keep their account and move back to their own private squad.`,
    requireText: null,
    confirmLabel: 'Remove',
    run: async () => { await adminRemoveMember(token, id, m.athleteId); load(); },
  });

  const deleteGroup = () => confirm.open({
    title: 'Delete group',
    body: `This permanently deletes “${g.name}” and moves its ${g.memberCount} member(s) to their own private squad. This can't be undone.`,
    requireText: g.name,
    confirmLabel: 'Delete group',
    run: async () => { await adminDeleteSquad(token, id); actions.back(); },
  });

  if (error) return <div style={s('padding:24px 18px;font-size:13px;color:var(--bad);text-align:center')}>{error}</div>;
  if (!g) return <div style={s('padding:24px 18px;font-size:13px;color:var(--text3);text-align:center')}>Loading…</div>;

  const created = (() => { try { return new Date(g.createdUtc).toLocaleDateString(); } catch { return null; } })();

  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      {/* header */}
      <div style={s('display:flex;align-items:center;gap:13px;margin-top:14px')}>
        <div style={s(`width:54px;height:54px;border-radius:16px;flex:none;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:800;color:#0b0b0c;background:${g.color || 'var(--bg4)'}`)}>{(g.name || '?').slice(0, 2).toUpperCase()}</div>
        <div style={s('flex:1;min-width:0')}>
          <div style={s('display:flex;align-items:center;gap:8px')}>
            <span style={s('font-size:18px;font-weight:800;letter-spacing:-.4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{g.name}</span>
            <KindTag kind={g.kind} />
          </div>
          <div style={s('font-size:12.5px;color:var(--text3);margin-top:2px')}>{[g.discipline, g.location].filter(Boolean).join(' · ')}</div>
        </div>
      </div>

      {/* details */}
      <div style={s(label)}>Details</div>
      <div style={s(card)}>
        <InfoRow top k="Discipline" v={g.discipline} />
        <InfoRow k="Level" v={g.level} />
        <InfoRow k="Location" v={g.location} />
        <InfoRow k="Price" v={g.price ? `${g.price}${g.perLabel || ''}` : '—'} />
        <InfoRow k="Members" v={g.memberCount} />
        <InfoRow k="Created" v={created} />
        {g.description && <InfoRow k="About" v={g.description} />}
      </div>

      {/* owner */}
      <div style={s(label)}>Owner</div>
      <div style={s(card)}>
        {g.owner
          ? <PersonRow top p={g.owner} sub={g.owner.email} onClick={() => actions.openAdminUser(g.owner.id)}
              action={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round" style={{ flex: 'none' }}><path d="M9 6l6 6-6 6" /></svg>} />
          : <div style={s('padding:14px;font-size:12.5px;color:var(--text3);text-align:center')}>No owner (orphaned).</div>}
      </div>

      {/* members */}
      <div style={s(label)}>Members · {g.members.length}</div>
      <div style={s(card)}>
        {g.members.length === 0 && <div style={s('padding:14px;font-size:12.5px;color:var(--text3);text-align:center')}>No members.</div>}
        {g.members.map((m, i) => (
          <PersonRow key={m.athleteId} top={i === 0} p={m} sub={m.role} onClick={() => actions.openAdminUser(m.athleteId)}
            action={m.role !== 'owner'
              ? <div className="ctl" onClick={() => removeMember(m)} style={s('flex:none;font-size:11.5px;font-weight:700;color:var(--bad)')}>Remove</div>
              : null} />
        ))}
      </div>

      {/* delete */}
      {g.kind !== 'personal' && (
        <div style={s(card + ';margin-top:20px')}>
          <div className="ctl" onClick={deleteGroup} style={s('text-align:center;padding:14px;font-size:13.5px;font-weight:700;color:var(--bad)')}>Delete this group</div>
        </div>
      )}

      {confirm.node}
    </div>
  );
}
