import { useState } from 'react';
import { s } from '../lib/style.js';
import { useGarminSync } from '../hooks/useGarminSync.js';

// Garmin mark — a simple monochrome watch/activity glyph (avoids the trademarked logo),
// tinted with the accent like the Apple Health panel.
const GarminGlyph = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="13" r="6" /><path d="M12 10v3l2 1" /><path d="M9 3h6M12 3v1" />
  </svg>
);

// "Connect Garmin" panel for the Upload screen. On web it renders a disabled, explanatory
// state (the login can't run in a browser — CORS); on the native build it drives a real
// Garmin Connect login + history sync through the same ingest pipeline as .fit uploads.
export default function GarminSync({ getToken, onDataChanged }) {
  const {
    available, connected, status, progress, summary, error, mfaPending,
    run, login, submitMfa, cancelMfa, loginWebView, logout,
  } = useGarminSync({ getToken, onDataChanged });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false); // login/verify in flight
  const syncing = status === 'syncing';

  const doLogin = async (kind) => {
    if (busy || syncing) return;
    setBusy(true);
    try {
      if (kind === 'webview') await loginWebView();
      else await login({ username: email.trim(), password, rememberCredentials: remember });
    } catch { /* error surfaced via hook state */ } finally {
      setBusy(false);
    }
  };

  const doVerify = async () => {
    if (busy || !code.trim()) return;
    setBusy(true);
    try { await submitMfa(code.trim()); setCode(''); }
    catch { /* error surfaced via hook state */ } finally { setBusy(false); }
  };

  const field = 'width:100%;box-sizing:border-box;font-size:14px;padding:11px 12px;border-radius:11px;border:1px solid var(--line2);background:var(--bg);color:var(--text);outline:none';
  const btn = (bg, ink) => `text-align:center;font-size:14px;font-weight:700;padding:12px 0;border-radius:12px;cursor:pointer;color:${ink};background:${bg};transition:opacity .15s`;

  return (
    <div style={s('padding:0 18px 120px;margin-top:14px')}>
      <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:15px 15px 16px')}>
        <div style={s('display:flex;align-items:center;gap:12px')}>
          <div style={s('width:44px;height:44px;border-radius:13px;flex:none;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--accent) 15%,transparent)')}><GarminGlyph /></div>
          <div style={s('flex:1;min-width:0')}>
            <div style={s('font-size:14.5px;font-weight:700')}>Garmin Connect</div>
            <div style={s('font-size:11.5px;color:var(--text3)')}>
              {mfaPending ? 'Enter your 2-step verification code'
                : connected ? 'Connected — syncs automatically on launch'
                : 'Sign in once to import your activities'}
            </div>
          </div>
        </div>

        {!available ? (
          <div style={s('font-size:11.5px;color:var(--text3);margin-top:12px;line-height:1.5')}>
            Garmin sign-in runs on your phone, so this works in the <b>Domestique Team mobile app</b> — not the web version. Install the app and open this screen there to connect.
          </div>
        ) : mfaPending ? (
          // ---- 2-step verification: enter the code Garmin just sent ----
          <>
            <div style={s('font-size:11.5px;color:var(--text2);margin-top:12px;line-height:1.5')}>
              Garmin sent a verification code to your email or authenticator. Enter it to finish signing in.
            </div>
            <input
              type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="Verification code"
              value={code} onChange={(e) => setCode(e.target.value)} disabled={busy}
              onKeyDown={(e) => e.key === 'Enter' && doVerify()}
              style={s(`${field};margin-top:11px;letter-spacing:2px;text-align:center;font-weight:700`)}
            />
            <div
              role="button" tabIndex={0}
              onClick={doVerify}
              style={s(`margin-top:11px;${btn('var(--accent)', 'var(--accent-ink)')};opacity:${busy || !code.trim() ? 0.6 : 1}`)}
            >
              {busy ? 'Verifying…' : 'Verify & connect'}
            </div>
            <div
              role="button" tabIndex={0}
              onClick={() => !busy && (cancelMfa(), setCode(''))}
              style={s('text-align:center;font-size:12px;font-weight:600;color:var(--text3);margin-top:12px;cursor:pointer')}
            >
              Cancel
            </div>
            {status === 'error' && <div style={s('font-size:11.5px;color:var(--bad);margin-top:11px;text-align:center')}>{error}</div>}
          </>
        ) : connected ? (
          // ---- connected: sync + disconnect ----
          <>
            <div style={s('display:flex;gap:8px;margin-top:13px')}>
              <div
                role="button" tabIndex={0}
                onClick={() => !syncing && run({ force: false })}
                style={s(`flex:2;${btn('var(--accent)', 'var(--accent-ink)')};opacity:${syncing ? 0.7 : 1}`)}
              >
                {syncing ? `Syncing… ${progress?.done ?? 0}/${progress?.total ?? 0}` : 'Sync now'}
              </div>
              <div
                role="button" tabIndex={0}
                onClick={() => !syncing && run({ force: true })}
                style={s(`flex:1;${btn('transparent', 'var(--text2)')};border:1px solid var(--line2);opacity:${syncing ? 0.5 : 1}`)}
              >
                Re-sync all
              </div>
            </div>

            {syncing && progress?.total > 0 && (
              <div style={s('height:4px;background:var(--bg4);border-radius:3px;margin-top:11px;overflow:hidden')}>
                <div style={s(`height:100%;width:${Math.round((progress.done / progress.total) * 100)}%;background:var(--accent);border-radius:3px;transition:width .2s`)} />
              </div>
            )}

            {status === 'done' && summary && (
              <div style={s('font-size:11.5px;color:var(--text2);margin-top:11px;line-height:1.5')}>
                {summary.total === 0
                  ? 'Up to date — no new activities.'
                  : <>Imported <b style={s('color:var(--good)')}>{summary.queued}</b> activit{summary.queued === 1 ? 'y' : 'ies'}
                      {summary.duplicates > 0 && <> · {summary.duplicates} already had</>}
                      {summary.failed > 0 && <> · <span style={s('color:var(--bad)')}>{summary.failed} failed</span></>}.</>}
              </div>
            )}
            {status === 'error' && <div style={s('font-size:11.5px;color:var(--bad);margin-top:11px')}>{error}</div>}

            <div
              role="button" tabIndex={0}
              onClick={() => !syncing && logout()}
              style={s('text-align:center;font-size:12px;font-weight:600;color:var(--text3);margin-top:13px;cursor:pointer')}
            >
              Disconnect Garmin
            </div>
          </>
        ) : (
          // ---- not connected: login form ----
          <>
            <div style={s('display:flex;flex-direction:column;gap:9px;margin-top:13px')}>
              <input
                type="email" inputMode="email" autoComplete="username" placeholder="Garmin email"
                value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy}
                style={s(field)}
              />
              <input
                type="password" autoComplete="current-password" placeholder="Password"
                value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy}
                style={s(field)}
              />
              <label style={s('display:flex;align-items:center;gap:9px;font-size:12px;color:var(--text2);cursor:pointer;padding:2px 0')}>
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} disabled={busy} />
                Stay signed in for silent re-sync (stored encrypted on this device)
              </label>
            </div>

            <div
              role="button" tabIndex={0}
              onClick={() => email && password && doLogin('headless')}
              style={s(`margin-top:11px;${btn('var(--accent)', 'var(--accent-ink)')};opacity:${busy || !email || !password ? 0.6 : 1}`)}
            >
              {busy ? 'Connecting…' : 'Connect Garmin'}
            </div>

            <div
              role="button" tabIndex={0}
              onClick={() => !busy && doLogin('webview')}
              style={s('text-align:center;font-size:12px;font-weight:600;color:var(--accent-ink2,var(--accent));margin-top:12px;cursor:pointer')}
            >
              Trouble signing in? Use 2-step / browser sign-in
            </div>

            {status === 'error' && <div style={s('font-size:11.5px;color:var(--bad);margin-top:11px;text-align:center')}>{error}</div>}
          </>
        )}
      </div>
    </div>
  );
}
