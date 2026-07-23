import { useEffect, useRef, useState } from 'react';
import { s } from '../lib/style.js';
import { useDirectChat } from '../hooks/useDirectChat.js';
import { useAthlete } from '../hooks/useAthlete.js';
import { useConfirm } from '../components/ConfirmModal.jsx';
import Avatar from '../components/Avatar.jsx';

const time = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// 1:1 direct message thread with the athlete in state.selMember. Live over the shared
// chat hub (dmPosted, filtered to this pair). Requires a signed-in session + a real peer
// GUID; otherwise it renders the sign-in prompt (there is no logged-out DM preview).
export default function DirectMessages({ state, getToken, meId }) {
  const peerId = state.selMember;
  const live = !!getToken && !!meId && !!peerId;
  const { athlete: peer } = useAthlete({ id: peerId, getToken });
  const { messages, status, send, remove } = useDirectChat({ getToken, peerId, meId, enabled: live });
  const confirm = useConfirm();
  const [draft, setDraft] = useState('');
  const endRef = useRef(null);

  const askDelete = (id) => confirm.open({
    title: 'Delete message?',
    body: 'This removes it for both of you. They’ll see “Message deleted” in its place.',
    confirmLabel: 'Delete',
    run: () => remove(id),
  });

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    try { await send(text); } catch { /* surfaced by hub status */ }
  };

  const bubbleFor = (isMine) => isMine
    ? 'background:var(--accent);color:var(--accent-ink);border-radius:15px 15px 4px 15px;padding:10px 13px;font-size:13px;line-height:1.4'
    : 'background:var(--bg2);border:1px solid var(--line);color:var(--text);border-radius:15px 15px 15px 4px;padding:10px 13px;font-size:13px;line-height:1.4';
  const deletedBubble = 'background:var(--bg3);border:1px dashed var(--line);color:var(--text3);font-style:italic;border-radius:15px;padding:10px 13px;font-size:12.5px;line-height:1.4';

  const firstName = (peer?.name || '').split(' ')[0] || 'athlete';

  return (
    <div style={s('padding:0;animation:floatUp .35s ease;display:flex;flex-direction:column;height:calc(100dvh - var(--app-header-h) - 108px)')}>
      {/* peer identity + connection-status row (title + back are in the global app header) */}
      <div style={s('display:flex;align-items:center;gap:9px;padding:6px 18px 10px;border-bottom:1px solid var(--line)')}>
        <Avatar photo={peer?.photo} initials={peer?.initials} color={peer?.color} size={30} radius={9} fontSize={12} />
        <div style={s('flex:1;min-width:0')}>
          <div style={s('font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{peer?.name || 'Message'}</div>
          <div style={s('font-size:10.5px;color:' + (status === 'live' ? 'var(--good)' : 'var(--text3)'))}>{live ? (status === 'live' ? '● live' : status) : 'sign in to message'}</div>
        </div>
      </div>

      {/* thread */}
      <div style={s('padding:16px 18px;display:flex;flex-direction:column;gap:11px;flex:1;overflow-y:auto')}>
        {live ? (
          messages.length === 0
            ? <div style={s('text-align:center;color:var(--text3);font-size:12.5px;margin-top:30px')}>No messages yet — say hi 👋</div>
            : messages.map((m) => {
                const isMine = m.senderId === meId;
                return (
                  <div key={m.id} style={s('display:flex;flex-direction:column;max-width:80%;' + (isMine ? 'align-self:flex-end;align-items:flex-end' : 'align-self:flex-start;align-items:flex-start'))}>
                    {m.deleted
                      ? <div style={s(deletedBubble)}>Message deleted</div>
                      : <div style={s(bubbleFor(isMine))}>{m.body}</div>}
                    <span style={s('display:flex;gap:8px;align-items:center;font-size:9.5px;color:var(--text3);margin-top:3px;' + (isMine ? 'flex-direction:row-reverse' : ''))}>
                      {time(m.createdUtc)}
                      {isMine && !m.deleted && <span className="ctl" onClick={() => askDelete(m.id)} style={s('color:var(--text3);cursor:pointer')}>Delete</span>}
                    </span>
                  </div>
                );
              })
        ) : (
          <div style={s('text-align:center;color:var(--text3);font-size:12.5px;margin-top:30px')}>Sign in to send a direct message.</div>
        )}
        <div ref={endRef} />
      </div>

      {/* composer */}
      <div style={s('margin-top:auto;padding:12px 18px;display:flex;gap:9px;align-items:center;border-top:1px solid var(--line)')}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder={live ? `Message ${firstName}…` : 'Message…'}
          disabled={!live}
          style={s('flex:1;background:var(--bg2);border:1px solid var(--line);border-radius:20px;padding:11px 15px;font-size:13px;color:var(--text);outline:none;font-family:inherit')}
        />
        <div className="ctl" onClick={submit} style={s('width:40px;height:40px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;flex:none')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></svg>
        </div>
      </div>
      {confirm.node}
    </div>
  );
}
