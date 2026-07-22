import { useState } from 'react';
import { s } from '../lib/style.js';

// Confirmation modal for destructive actions. When `requireText` is set (e.g. a group name),
// the confirm button stays disabled until the admin types it exactly — a deliberate speed-bump
// for irreversible deletes. Presentational; drive it with useConfirm() below.
export function ConfirmModal({ title, body, requireText, confirmLabel, input, setInput, busy, error, onCancel, onConfirm }) {
  const ready = !requireText || input.trim() === requireText;
  return (
    <div onClick={busy ? undefined : onCancel} style={s('position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:24px')}>
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
        {error && <div style={s('font-size:12px;color:var(--bad);font-weight:600;margin-top:12px')}>{error}</div>}
        <div style={s('display:flex;gap:9px;margin-top:16px')}>
          <div className="ctl" onClick={busy ? undefined : onCancel} style={s('flex:1;text-align:center;padding:11px;border-radius:11px;font-size:13px;font-weight:700;background:var(--bg3);border:1px solid var(--line);color:var(--text2)')}>Cancel</div>
          <div className="ctl" onClick={ready && !busy ? onConfirm : undefined}
            style={s(`flex:1;text-align:center;padding:11px;border-radius:11px;font-size:13px;font-weight:700;color:#fff;background:var(--bad);${ready && !busy ? '' : 'opacity:.45;pointer-events:none'}`)}>{busy ? 'Working…' : confirmLabel}</div>
        </div>
      </div>
    </div>
  );
}

// Manages modal state for a screen. `open(spec)` shows the modal; `spec.run` is an async
// action that runs on confirm — the modal closes on success and shows the error on failure.
// Render `node` somewhere in the screen.
export function useConfirm() {
  const [spec, setSpec] = useState(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const open = (m) => { setInput(''); setError(''); setSpec(m); };
  const close = () => { setSpec(null); setInput(''); setError(''); };
  const confirm = async () => {
    if (!spec) return;
    setBusy(true); setError('');
    try { await spec.run(); close(); }
    catch (e) { setError(e.message || 'Something went wrong.'); }
    finally { setBusy(false); }
  };

  const node = spec ? (
    <ConfirmModal
      title={spec.title} body={spec.body} requireText={spec.requireText} confirmLabel={spec.confirmLabel}
      input={input} setInput={setInput} busy={busy} error={error} onCancel={close} onConfirm={confirm}
    />
  ) : null;

  return { open, node };
}
