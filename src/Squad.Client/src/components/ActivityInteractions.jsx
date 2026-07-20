import { useEffect, useRef, useState } from 'react';
import { s } from '../lib/style.js';
import AuthedAvatar from './AuthedAvatar.jsx';
import { setKudos, fetchComments, postComment } from '../lib/interactions.js';

const label = 'font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.3px;font-weight:600';

// Short relative-time for a comment timestamp.
function ago(iso) {
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'now';
  const m = Math.floor(secs / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// Kudos toggle + comment thread for a single activity (the detail screen's social
// layer). Kudos state seeds from the activity row and reconciles against the API;
// comments are fetched on open and appended optimistically after posting.
export default function ActivityInteractions({ activity, token, getToken, meId }) {
  const a = activity;

  const [kudoed, setKudoed] = useState(!!a.iKudoed);
  const [kudos, setKudos_] = useState(a.kudos || 0);
  const [busyK, setBusyK] = useState(false);

  const [comments, setComments] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState('');
  const scroller = useRef(null);

  const resolveToken = async () => (getToken ? await getToken() : token);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    (async () => {
      try {
        const list = await fetchComments(a.id, await resolveToken());
        if (!cancelled && Array.isArray(list)) setComments(list);
      } catch { /* leave empty; the input still works */ }
      finally { if (!cancelled) setLoaded(true); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.id]);

  const toggleKudos = async () => {
    if (busyK) return;
    const next = !kudoed;
    setBusyK(true);
    setKudoed(next);
    setKudos_((n) => Math.max(0, n + (next ? 1 : -1)));
    try {
      const st = await setKudos(a.id, next, await resolveToken());
      setKudoed(!!st.kudoed);
      setKudos_(st.count);
    } catch {
      setKudoed(!next);
      setKudos_((n) => Math.max(0, n + (next ? -1 : 1)));
    } finally {
      setBusyK(false);
    }
  };

  const submit = async () => {
    const body = text.trim();
    if (!body || posting) return;
    setPosting(true); setErr('');
    try {
      const c = await postComment(a.id, body, await resolveToken());
      setComments((prev) => [...prev, c]);
      setText('');
      // Let the new row render, then scroll it into view.
      requestAnimationFrame(() => { if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; });
    } catch {
      setErr('Could not post your comment.');
    } finally {
      setPosting(false);
    }
  };

  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } };

  return (
    <div style={s('padding:20px 18px 0')}>
      {/* kudos — you can't kudos your own activity, so it's read-only on yours */}
      <div style={s('display:flex;align-items:center;gap:10px;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:11px 13px')}>
        {a.isMe ? (
          <div style={s('display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--text2)')}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM7 10l4-7a2 2 0 0 1 2 2v3h5a2 2 0 0 1 2 2.3l-1.3 7a2 2 0 0 1-2 1.7H7" /></svg>
            <span>{kudos > 0 ? `${kudos} kudos` : 'No kudos yet'}</span>
          </div>
        ) : (
          <>
            <div className="ctl" onClick={toggleKudos} title={kudoed ? 'Remove kudos' : 'Give kudos'} style={s(`display:flex;align-items:center;gap:7px;padding:8px 13px;border-radius:11px;font-size:13px;font-weight:700;${kudoed ? 'background:var(--accent);border:1px solid var(--accent);color:var(--accent-ink)' : 'background:var(--bg3);border:1px solid var(--line);color:var(--text)'};opacity:${busyK ? 0.6 : 1};transition:background .15s`)}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill={kudoed ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM7 10l4-7a2 2 0 0 1 2 2v3h5a2 2 0 0 1 2 2.3l-1.3 7a2 2 0 0 1-2 1.7H7" /></svg>
              {kudoed ? 'Kudoed' : 'Kudos'}
            </div>
            <span style={s('flex:1;font-size:12.5px;color:var(--text2)')}>{kudos > 0 ? `${kudos} kudos` : 'Be the first to give kudos'}</span>
          </>
        )}
      </div>

      {/* comments */}
      <div style={s(label + ';margin:20px 0 10px')}>Comments{comments.length ? ` · ${comments.length}` : ''}</div>

      {loaded && comments.length === 0 && (
        <div style={s('font-size:12.5px;color:var(--text3);padding:2px 2px 6px')}>No comments yet — say something encouraging.</div>
      )}

      {comments.length > 0 && (
        <div ref={scroller} style={s('display:flex;flex-direction:column;gap:12px;max-height:280px;overflow-y:auto;padding:2px 0')}>
          {comments.map((c) => {
            const mine = meId && c.athleteId === meId;
            return (
              <div key={c.id} style={s('display:flex;gap:10px;align-items:flex-start')}>
                <AuthedAvatar avatarUrl={c.avatarUrl} token={token} initials={c.initials} color={c.avatarColor} size={30} radius={9} fontSize={11} />
                <div style={s('flex:1;min-width:0')}>
                  <div style={s('display:flex;align-items:baseline;gap:7px')}>
                    <span style={s('font-size:12.5px;font-weight:700')}>{mine ? 'You' : c.athleteName}</span>
                    <span style={s('font-size:10.5px;color:var(--text3)')}>{ago(c.createdUtc)}</span>
                  </div>
                  <div style={s('font-size:13px;color:var(--text);line-height:1.4;margin-top:2px;white-space:pre-wrap;word-break:break-word')}>{c.body}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* composer */}
      <div style={s('display:flex;align-items:center;gap:9px;margin-top:14px')}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          maxLength={1000}
          placeholder="Add a comment…"
          style={s('flex:1;min-width:0;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:11px 13px;font-size:13px;color:var(--text);outline:none')}
        />
        <div className="ctl" onClick={submit} style={s(`display:flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:12px;flex:none;background:var(--accent);color:var(--accent-ink);opacity:${text.trim() && !posting ? 1 : 0.45}`)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></svg>
        </div>
      </div>
      {err && <div style={s('font-size:11px;color:var(--bad);margin-top:8px')}>{err}</div>}
    </div>
  );
}
