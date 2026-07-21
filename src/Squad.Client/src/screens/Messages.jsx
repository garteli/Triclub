import { useEffect, useRef, useState } from 'react';
import { s } from '../lib/style.js';
import { useSquadChat } from '../hooks/useSquadChat.js';

const time = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// Squad group chat — live over the chat hub, scoped to your active squad. When
// signed in (getToken) it uses real messages; otherwise it falls back to the
// prototype thread (vm.chatThread) so the logged-out preview still renders.
export default function Messages({ vm, actions, getToken, meId }) {
  const live = !!getToken && !!meId;
  const { messages, status, send } = useSquadChat({ getToken, enabled: live });
  const [draft, setDraft] = useState('');
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    try { await send(text); } catch { /* surfaced by hub status */ }
  };

  const bubbleFor = (mine) => mine
    ? 'background:var(--accent);color:var(--accent-ink);border-radius:15px 15px 4px 15px;padding:10px 13px;font-size:13px;line-height:1.4'
    : 'background:var(--bg2);border:1px solid var(--line);color:var(--text);border-radius:15px 15px 15px 4px;padding:10px 13px;font-size:13px;line-height:1.4';

  return (
    <div style={s('padding:0;animation:floatUp .35s ease;display:flex;flex-direction:column;height:calc(100dvh - var(--app-header-h) - 108px)')}>
      {/* title + back now in the global app header; keep a slim connection-status row */}
      <div style={s('display:flex;align-items:center;gap:9px;padding:6px 18px 10px;border-bottom:1px solid var(--line)')}>
        <div style={s('width:30px;height:30px;border-radius:9px;background:var(--accent);flex:none;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:var(--accent-ink)')}>#</div>
        <div style={s('flex:1;font-size:11px;color:' + (status === 'live' ? 'var(--good)' : 'var(--text3)'))}>{live ? (status === 'live' ? '● live' : status) : 'preview'}</div>
      </div>

      {/* thread */}
      <div style={s('padding:16px 18px;display:flex;flex-direction:column;gap:11px;flex:1;overflow-y:auto')}>
        {live ? (
          messages.length === 0
            ? <div style={s('text-align:center;color:var(--text3);font-size:12.5px;margin-top:30px')}>No messages yet — say hi to your squad 👋</div>
            : messages.map((m) => {
                const mine = m.athleteId === meId;
                return (
                  <div key={m.id} style={s('display:flex;flex-direction:column;max-width:80%;' + (mine ? 'align-self:flex-end;align-items:flex-end' : 'align-self:flex-start;align-items:flex-start'))}>
                    {!mine && <span style={s('font-size:10px;color:var(--text3);margin:0 4px 3px;font-weight:600')}>{m.athleteName}</span>}
                    <div style={s(bubbleFor(mine))}>{m.body}</div>
                    <span style={s('font-size:9.5px;color:var(--text3);margin-top:3px;' + (mine ? 'text-align:right' : 'text-align:left'))}>{time(m.createdUtc)}</span>
                  </div>
                );
              })
        ) : (
          vm.chatThread.map((m, i) => (
            <div key={i} style={s('display:flex;flex-direction:column;max-width:80%;' + m.wrap)}>
              <div style={s(m.bubble)}>{m.text}</div>
              <span style={s('font-size:9.5px;color:var(--text3);margin-top:3px;' + m.timeAlign)}>{m.time}</span>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      {/* composer */}
      <div style={s('margin-top:auto;padding:12px 18px;display:flex;gap:9px;align-items:center;border-top:1px solid var(--line)')}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder={live ? 'Message your squad…' : 'Message…'}
          disabled={!live}
          style={s('flex:1;background:var(--bg2);border:1px solid var(--line);border-radius:20px;padding:11px 15px;font-size:13px;color:var(--text);outline:none;font-family:inherit')}
        />
        <div className="ctl" onClick={submit} style={s('width:40px;height:40px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;flex:none')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></svg>
        </div>
      </div>
    </div>
  );
}
